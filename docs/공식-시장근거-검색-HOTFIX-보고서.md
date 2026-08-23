# 공식 시장근거 검색 운영 복구 — HOTFIX 1

> **상태: 코드 수정·배포 완료 / 운영 E2E 검증 불가 — OpenAI 크레딧 잔액 0**
>
> 형식 충돌(P0)은 제거했고 인용 검증은 테스트로 고정했다. 그러나 실제 웹 검색이
> 한 번도 실행되지 않았으므로 **§14 운영 3종 · §15 Writer E2E · §17 Reviewer E2E ·
> §20 응답시간 · §21 비용은 측정하지 못했다.** 이 보고서는 그 부분을 추정으로 채우지 않는다.

---

## 즉시 필요한 조치 (사용자)

```
canary B: 429  "You have no credits remaining. Add credits to continue using the API
                at https://platform.openai.com/settings/organization/billing/."
canary C: 429  (동일)
```

OpenAI 결제 페이지에서 크레딧을 충전해야 나머지 검증을 진행할 수 있다. 충전은 직접 해야 하고, 나는 하지 않는다.

---

## 기존 P0 원인

`lib/market/openai-research.ts` 의 요청 본문이 **웹 검색과 JSON 모드를 동시에** 요구했다.

```ts
text: { format: { type: "json_object" } },   // ← JSON 모드
tools: [{ type: "web_search", … }],          // ← 웹 검색
tool_choice: "required",
```

OpenAI 는 이 조합을 **400 으로 거부**한다. 요청이 거부되므로 검색이 시작조차 되지 않았고, 그 결과:

- `MarketEvidence` 0건
- `evidenceForSection` / `formatEvidence` / `toPromptEvidence` 의 입력이 영구히 0 → 2차의 Writer 결합이 **한 번도 실행된 적 없음**
- Reviewer 가 매 실행 "공식 시장 근거가 없습니다"를 지적하고 실패하는 버튼으로 안내

감사 보고서를 그대로 믿지 않고 HEAD 코드에서 재확인했으며, 운영 카나리아로 오류를 **재현**했다(아래 Canary A).

### 코드에서 이미 잘 돼 있던 것 (건드리지 않음)

감사 전 예상과 달리, **인용 검증은 이미 올바르게 구현돼 있었다.**

```ts
const citation = cited.get(normalized);
if (!citation || !isOfficialEvidenceUrl(citation.url)) return [];
…
sourceUrl: citation.url,   // ← 모델이 쓴 주소가 아니라 검색이 돌려준 주소를 저장
```

`verification: "needs_review"` 고정, 근거 0건이면 실패 처리도 이미 있었다. 즉 이번 P0 는 **보안 설계의 문제가 아니라 요청 형식 한 줄의 문제**였다. 그래서 이번 수정도 그 철학을 강화하는 방향으로만 했다.

---

## 현재 OpenAI API 계약 확인 결과

모델: `gpt-5.6-sol` (`wrangler.jsonc` 의 `OPENAI_MODEL`)

| 확인 항목 | 결과 |
|---|---|
| `web_search` + `text.format=json_object` | **거부** — 400 `Web Search cannot be used with JSON mode.` (실측) |
| `web_search` + `text.format=json_schema` | **형식 검증 통과** — 400 아님. 과금 단계에서 429 (실측) |
| `web_search` + 출력형식 미지정(평문) | **형식 검증 통과** — 400 아님. 과금 단계에서 429 (실측) |
| `include: ["web_search_call.action.sources"]` | 요청이 거부되지 않음(형식상 유효) |
| `response.output` 구조 | 코드가 이미 `output[].action.sources` 와 `output[].content[].annotations[type=url_citation]` 두 경로를 모두 읽음 |

**중요한 해석**: A 는 400(요청 형식 단계에서 거부), B·C 는 429(과금 단계). OpenAI 는 요청 형식을 과금보다 **먼저** 검사하므로, B·C 가 400 을 받지 않았다는 것은 **`json_schema` 도 평문도 web_search 와 형식 충돌이 없다**는 실측 근거다.

다만 이것은 "형식이 허용된다"까지만 증명한다. **검색이 실제로 돌고 `action.sources` 가 채워지는지는 크레딧 없이 확인할 수 없다.**

---

## Canary A / B / C 결과

`app/api/canary-tmp/route.ts` 를 임시로 배포해 운영 키(Cloudflare secret, 내가 읽지 않음)로 호출한 뒤 **삭제했다**. 삭제 확인: 배포 후 해당 경로 404.

주제는 지시대로 단순한 공식 통계("대한민국 주민등록 인구 최신 공식 통계"), 허용 도메인은 `kosis.kr / kostat.go.kr / data.go.kr / mois.go.kr`.

| Canary | 출력 형식 | HTTP | 시간 | 결과 |
|---|---|---:|---:|---|
| **A** | `json_object` | **400** | 1초 | `Web Search cannot be used with JSON mode.` — **기존 오류 재현** |
| **B** | `json_schema` (strict) | 429 | 1초 | `You have no credits remaining.` — 형식 검증은 통과 |
| **C** | 미지정(평문) | 429 | 1초 | `You have no credits remaining.` — 형식 검증은 통과 |

**B·C 의 검색 동작·source 반환·citation 구조는 측정하지 못했다.** 크레딧 충전 후 재실행이 필요하다.

---

## 최종 선택한 구현 방식과 이유

### 선택: 전략 B — 평문 출력 + 내부 파싱·검증

지시 §3 의 우선순위는 A(`json_schema`)가 먼저지만, 그 조건은 **"실제 운영 canary 에서 정상 동작하고 web_search sources/citations 도 유지된다면"** 이다. 크레딧이 없어 그 조건을 확인할 수 없었다. 지시 §2 가 못 박은 대로 **"문서상 될 것 같다"로 판단하지 않았다.**

그래서 확인되지 않은 동작에 기대지 않는 쪽을 골랐다.

- 평문 + `web_search` 는 웹 검색이 원래 전제하는 조합이다 — `url_citation` 주석은 평문 출력에 붙도록 설계돼 있다.
- `json_schema` + `strict: true` 는 모델 출력을 스키마로 강제하는데, 그 상태에서 인용 주석이 어떻게 붙는지가 이번에 확인되지 않았다. 인용이 깨지면 **이 기능의 유일한 안전장치가 무력화**된다.
- 지시 §3-B 의 표현대로 **"API JSON mode 에는 의존하지 않는다"** — 구조는 `extractJsonObject` + Zod 가 잡는다.

전략 C(2단계 분리)는 고르지 않았다. 비용이 2배가 되고, 평문 한 번으로 충분한지 아직 측정도 못 한 상태에서 먼저 복잡도를 올릴 이유가 없다.

**크레딧 충전 후 Canary B 를 다시 돌려 `json_schema` 에서도 인용이 온전하면, 전략 A 로 옮기는 것은 요청 본문 한 줄이다.** 그때 다시 판단하면 된다.

---

## 변경 파일

| 파일 | 변경 |
|---|---|
| `lib/market/openai-research.ts` | `text.format` 제거(핵심) · `extractJsonObject` 추가 · `normalizeUrl` 강화 · `citations` → `extractActualSearchSources` 로 이름 명확화 및 export · 오류 코드 세분화 |
| `app/api/plan/market-research/route.ts` | 새 오류 코드를 사용자 문구에 연결(문구 자체는 기존 수준 유지) |
| `scripts/market-citation-guard.test.ts` | **신규** — 인용 검증 fixture 테스트 A~K |
| `scripts/document-source-url.test.ts` | **신규** — PDF/DOCX 출처 URL 보존 회귀 |
| `package.json` | 테스트 스크립트 2개 등록 |

**건드리지 않은 것**: MarketEvidence 스키마, 화이트리스트, `verification` 의미, merge 규칙, `market_workspace` 저장 경로, plan→project 브릿지, Writer, Reviewer, 질문팩, 재무모델, 결제.

---

## 수정 전 요청 body

```jsonc
{
  "model": "gpt-5.6-sol",
  "store": false,
  "reasoning": { "effort": "medium" },
  "max_output_tokens": 4000,
  "text": { "format": { "type": "json_object" } },   // ← 400 의 원인
  "tools": [{ "type": "web_search", "search_context_size": "high",
              "filters": { "allowed_domains": [ … 13개 … ] } }],
  "tool_choice": "required",
  "include": ["web_search_call.action.sources"],
  "input": [ { "role": "system", … }, { "role": "user", … } ]
}
```

## 수정 후 요청 body

```jsonc
{
  "model": "gpt-5.6-sol",
  "store": false,
  "reasoning": { "effort": "medium" },
  "max_output_tokens": 4000,
  // text.format 없음 — 평문으로 받는다
  "tools": [{ "type": "web_search", "search_context_size": "high",
              "filters": { "allowed_domains": [ … 13개 … ] } }],
  "tool_choice": "required",
  "include": ["web_search_call.action.sources"],
  "input": [ { "role": "system", … }, { "role": "user", … } ]
}
```

사용자 프롬프트의 마지막 지시만 평문 전제에 맞게 바꿨다.

```
이전: "JSON 객체 {evidence:[...]}만 출력하세요."
이후: "응답은 JSON 객체 {\"evidence\":[...]} 하나만 쓰세요.
       설명 문장, 인사말, 코드펜스를 앞뒤에 붙이지 마세요."
```

모델이 지시를 어기더라도 `extractJsonObject` 가 코드펜스와 앞뒤 문장을 벗겨낸다. 그 이상 깨져 있으면 근거를 만들지 않는다.

---

## 실제 response 구조

코드가 읽는 구조(기존 그대로, 이번에 바꾸지 않음):

```ts
{
  output: [
    { type: "web_search_call",
      action: { sources: [{ url, title }, …] } },      // ← include 로 받아오는 실제 검색 출처
    { type: "message",
      content: [{ type: "output_text", text: "...",
                  annotations: [{ type: "url_citation", url, title }, …] }] }
  ]
}
```

> **미확인**: 위 구조는 코드가 이미 두 경로를 모두 처리하도록 작성돼 있고 형식상 유효한 요청임을 확인했지만, **실제 응답을 받아 구조를 눈으로 확인하지는 못했다**(크레딧 0). 충전 후 첫 호출에서 반드시 확인해야 한다.

---

## 실제 source 추출 방식

```ts
export function extractActualSearchSources(payload) {
  const found = new Map<string, {url, title}>();
  for (const item of payload.output ?? []) {
    for (const source of item.action?.sources ?? [])         // 경로 1: 검색 호출의 출처
      found.set(normalizeUrl(source.url), { url: source.url, … });
    for (const content of item.content ?? [])
      for (const a of content.annotations ?? [])             // 경로 2: 본문 인용 주석
        if (a.type === "url_citation") found.set(normalizeUrl(a.url), { url: a.url, … });
  }
  return found;
}
```

이름을 `citations` 에서 `extractActualSearchSources` 로 바꿨다. 이 집합에 **모델이 본문에 적은 주소는 들어오지 않는다** — 이름이 그 사실을 말하게 했다.

---

## citation verification 방식

```
모델이 쓴 sourceUrl
   ↓ normalizeUrl
실제 검색 출처 집합에 있는가?  ── 없으면 폐기
   ↓ 있음 (citation 획득)
citation.url 이 공식 도메인인가? ── 아니면 폐기
   ↓
저장되는 sourceUrl = citation.url   ← 모델이 쓴 문자열이 아님
```

세 겹이다. 그리고 **저장되는 주소는 검색이 돌려준 원본**이므로, 모델이 표기를 바꿔 적어도 저장물은 오염되지 않는다.

### URL 정규화 (§5)

비교 때문에 멀쩡한 자료를 버리지 않도록 강화하되, 서로 다른 문서를 합치지 않도록 제한했다.

| 같게 취급 | 다르게 유지 |
|---|---|
| `http` / `https` | 경로(path) |
| `www.` 유무 | 질의 파라미터의 **값** (kosis 는 질의로 통계표를 구분한다) |
| 경로 끝 슬래시 | |
| `#조각` | |
| 추적 파라미터 8종 (`utm_*`, `gclid`, `fbclid`, `spm`, `ref`) | |
| 질의 파라미터 **순서** | |
| 포트 | |

`http`/`https` 가 아닌 스킴(`javascript:` 등)과 주소가 아닌 문자열은 빈 문자열이 되어 어떤 출처와도 일치하지 않는다.

---

## 공식 domain whitelist

기존 목록을 **그대로 유지**했다(변경 0).

```
kosis.kr · kostat.go.kr · sgis.kostat.go.kr · data.go.kr · sbiz.or.kr · semas.or.kr
golmok.seoul.go.kr · data.seoul.go.kr · data.gg.go.kr · k-startup.go.kr
bizinfo.go.kr · work24.go.kr · mss.go.kr
```

검사 함수 `isOfficialEvidenceUrl` 은 위 목록 + `.go.kr` 로 끝나는 모든 호스트를 허용한다. 블로그·뉴스·위키·기업 페이지는 실제로 검색되었더라도 근거가 되지 않는다(테스트 C).

**검색 결과가 0건이 되더라도 공식성 기준을 낮추지 않았다.**

---

## malformed / 가짜 URL 차단 테스트

`npm run test:market-citation` — fixture 기반, API 호출 없음.

| # | 상황 | 기대 | 결과 |
|---|---|---|---|
| **A** | 실제 출처 2개 + 후보 2개 일치 | 2개 통과 | ✅ |
| **B** | 후보 주소가 검색 출처에 없음 | 폐기 | ✅ |
| **C** | 실제 검색된 블로그 | 폐기 | ✅ |
| **D** | **모델이 지어낸 kosis.kr 주소** | 폐기 | ✅ (도메인 검사만으로는 통과하는 주소 — 인용 검증이 필요한 이유) |
| **E** | 검색 출처 0건 | `WEB_SEARCH_NO_SOURCES` | ✅ |
| **F** | 본문이 평문 사과문 | 저장 없음 | ✅ |
| **G** | 닫히지 않은 JSON / 깨진 문법 | 복원하지 않음 | ✅ |
| **G2** | 코드펜스 + 앞뒤 설명 | 벗겨내고 통과 | ✅ |
| **G3** | 문자열 안의 `{}` | 파싱 안 깨짐 | ✅ |
| **H** | 같은 원문+지표 | 같은 merge 열쇠 | ✅ |
| **I** | 기존 근거와 병합 | 기존 것 유지 | ✅ |
| **J** | 모델이 `http://www.…?utm_source=…#top` 로 표기 | 통과하되 **저장은 검색 원본 주소** | ✅ |
| **J2** | `tblId` 만 다른 두 통계표 | 서로 다르게 유지 | ✅ |
| **K** | `url_citation` 주석만 있는 경우 | 실제 인용으로 인정 | ✅ |

**테스트가 실제로 결함을 잡는지 확인했다.** 인용 대조를 빼고 도메인 검사만 남기면 B 가 즉시 실패한다(`OK` 반환). 통과만 보고 넘어가지 않았다.

### §7 "검증됨" 표현

`verification: "needs_review"`, `verificationMethod: "none"` **변경 없음.** Writer 프롬프트도 그대로다 — "공식 원문 검색 결과 · 원문 재확인 권장"으로 표시되고, "정부에서 검증 완료된 수치"라고 쓰지 말라는 지시가 이미 들어 있다(`section-generator.ts:134`).

### §9 숫자 provenance

`numericValue` 를 만들어내는 로직을 **추가하지 않았다.** 스키마의 `.nullable()` 과 "비율·범위·복합값이면 null" 프롬프트 지시가 그대로다.

### §10 sourceExcerpt

스키마·프롬프트 변경 없음. 프롬프트는 이미 "원문이 무엇을 집계한 자료인지 짧게 요약하세요. 긴 문장을 그대로 복사하지 마세요"로 **요약임을 명시**하고 있어 verbatim 발췌로 오인될 표현이 아니다. 필요가 없어 바꾸지 않았다.

---

## MarketEvidence 저장 예시

**아직 운영에서 생성된 적이 없다**(크레딧 0). 아래는 코드가 만들어낼 구조이며, 실제 저장물이 아니다 — 그렇게 표시해 둔다.

```jsonc
{
  "id": "<uuid>",
  "sourceType": "official_report",
  "title": "주민등록 인구현황",
  "metric": "총인구",
  "value": "51,217,221명",
  "numericValue": 51217221,
  "unit": "명",
  "region": "대한민국",
  "sourceName": "행정안전부",
  "sourceUrl": "<검색이 돌려준 원본 주소 — 모델이 쓴 문자열이 아님>",
  "observedAt": "2026-07-31",
  "note": "…",
  "verification": "needs_review",
  "verificationMethod": "none",
  "retrievedAt": "<ISO>",
  "contentHash": "<sha256>",
  "isDemo": false
}
```

저장 경로는 기존 그대로 `projects.market_workspace.evidence` 이고, DB 스키마를 새로 만들지 않았다.

---

## 운영 사업 3종 검색 결과

> **측정 불가 — OpenAI 크레딧 0.**

지시 §14 는 로컬 사업 / 온라인·IT / 제조·커머스 3종에서 HTTP 상태·`web_search_call` 존재·source 수·candidate 수·검증 후 evidence 수·공식 도메인·저장 확인을 기록하라고 했다. 검색이 한 번도 돌지 않았으므로 **어느 항목도 기록할 수 없다.** 추정치로 채우지 않는다.

확인된 것은 **오류의 종류가 바뀌었다**는 사실뿐이다.

```
수정 전:  POST /api/plan/market-research → 400  MARKET_RESEARCH_FAILED
                                                (Web Search cannot be used with JSON mode)
수정 후:  POST /api/plan/market-research → 429  OPENAI_429
                                                (You have no credits remaining)
```

요청이 **형식 단계에서 거부되지 않고 과금 단계까지 도달**한다. 이것이 크레딧 없이 확인 가능한 마지막 지점이다.

---

## Writer E2E

> **측정 불가 — 근거가 0건이라 붙일 문서가 없다.**

지시 §15 가 요구한 확인(프롬프트에 Evidence 실제 주입 / `sourceName`·`observedAt`·`sourceUrl` 포함 / 새 URL 생성 없음 / 없는 숫자 추가 없음 / 과도한 반복 없음 / "정부 검증" 표현 없음)은 **전부 크레딧 충전 후로 미룬다.**

정적으로 확인한 것만 적는다 — `formatEvidence`(`section-generator.ts:111~136`)는 이미 지표·값·기관·기준일·원문 URL·주의사항·확인상태를 블록으로 넣고, "목록에 없는 시장규모·성장률·고객 수·사업체 수를 새로 만들지 마세요", "URL 을 새로 만들거나 수정하지 마세요", "'정부에서 검증 완료된 수치'라고 표현하지 마세요"를 명시한다. **코드는 준비돼 있고 입력이 없었을 뿐이다.**

---

## Reviewer E2E

> **측정 불가.**

`collectDeterministic` 의 "공식 시장 근거가 아직 붙어 있지 않습니다" issue 가 evidence 저장 후 사라지는지, Reviewer 가 전체 시장규모를 우리 고객 수로 오해하는지는 확인하지 못했다. 종합감사에서 이 issue 는 **3회 실행 3회 모두** 나왔으므로, 사라지는지 여부가 복구의 가장 명확한 신호가 된다.

---

## PDF / DOCX URL 보존

> **여기는 측정했다.** 크레딧과 무관하게 검증 가능한 부분이다.

Writer 는 섹션 끝 참고 근거를 `- 기관 자료명 (기준일) — [원문](URL)` 형식으로 쓰도록 지시받는다(`section-generator.ts:133`). 이 **마크다운 링크는 라벨과 주소가 분리돼 있어**, 렌더러가 라벨만 그리면 출처가 조용히 사라진다.

실제 렌더 결과를 뜯어 확인했다.

| 형식 | 결과 |
|---|---|
| **PDF** | ✅ 보존 — ToUnicode CMap 으로 복원한 텍스트에 `행정안전부 주민등록 인구현황 (2026-07-31) — 원문 (https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1B040A3)` |
| **DOCX** | ✅ 보존 — `word/document.xml` 본문에 전체 주소 |

긴 주소는 페이지 폭에서 두 줄로 나뉘어 그려지지만 문자열은 온전하다.

`scripts/document-source-url.test.ts` 로 고정했고, `lightweight-pdf.ts` 의 링크 처리(`(href)` 부착)를 제거하면 즉시 실패하는 것까지 확인했다.

> 작업 중 한 번 오판했다. `document-renderer.ts` 의 `inlineText`(DOCX 전용)만 보고 "PDF 가 URL 을 버린다"고 판단했는데, PDF 는 `lightweight-pdf.ts` 의 별도 `inlineText` 를 쓰고 그쪽은 주소를 붙인다. **코드를 고치기 전에 실측으로 바로잡았고, 렌더러는 한 줄도 바꾸지 않았다.**

---

## 응답시간

> **측정 불가.** 실제 검색이 돌지 않았다.

기존 정책은 유지했다 — 조사 `AbortSignal.timeout(150_000)`, 라우트 `maxDuration = 180`. 지시 §20 대로 **성공률을 위해 늘리지 않았다.**

참고로 실패까지 걸린 시간: 수정 전 4초(형식 거부), 수정 후 4초(과금 거부). 실제 검색이 붙으면 수십 초로 늘어날 것이고, 그때 150초 상한이 적절한지 재확인해야 한다.

---

## 비용

> **측정 불가.** 토큰·검색 호출이 발생하지 않았다.

기록할 수 있는 것은 **비용이 발생하는 조건**뿐이다.

- 시장조사는 **사용자가 [공식자료 찾아보기]를 눌렀을 때만** 실행된다. `/plan` 진입, overview 진입, 전체 생성, 섹션 재생성, Reviewer 실행 어디서도 호출하지 않는다(§13).
- 이번 수정에서 **자동 호출을 만들지 않았다.** 이유는 단순하다 — 웹 검색은 토큰과 별도로 검색 호출당 과금되고, 이 기능은 지금까지 한 번도 성공한 적이 없어 1회 비용조차 알려져 있지 않다. **비용을 모르는 기능을 자동 실행으로 바꾸는 것은 위험하다.** 1회 실측이 나온 뒤에 판단할 문제다.
- 서버 레이트리밋 `plan-market-research` 12회 / 10분 유지.

---

## 회귀 테스트

| 테스트 | 결과 |
|---|---|
| `market-citation-guard` (신규) | **PASS** (A~K) |
| `document-source-url` (신규) | **PASS** |
| `plan-market-research` | PASS |
| `market-research` | PASS |
| `plan-context` | PASS |
| `plan-section-service` | PASS |
| `generation-queue` | PASS |
| `plan-review` | PASS |
| `plan-review-resolution` | PASS |
| `plan-analyzer` | PASS |
| `plan-store-capacity` (HOTFIX 0) | PASS |
| `plan-guest-persist` / `plan-sync` / `plan-merge` | PASS |
| `payment-security` | PASS |
| `document-editor` / `draft-package-domain` | PASS |
| `tsc --noEmit` | **PASS** |

Business Analyzer · Financial engine · Payment · Plan storage 경로는 **건드리지 않았다.**

시장조사를 쓰지 않는 플랜의 생성이 영향을 받지 않는 것도 확인했다 — `sectionUsesEvidence` 가 false 이거나 근거가 0건이면 `formatEvidence` 가 빈 문자열을 돌려주고 프롬프트가 예전과 같아진다(`plan-section-service` 통과).

---

## 완료 조건 대조

| # | 조건 | 상태 |
|---|---|---|
| 1 | 운영 market-research API 200 | ❌ **크레딧 0** (400 → 429 로 전진) |
| 2 | output 에 실제 web search call 존재 | ⏸ 미확인 |
| 3 | 실제 search source URL 존재 | ⏸ 미확인 |
| 4 | 모든 `evidence.sourceUrl` 이 실제 source 집합에 존재 | ✅ **코드·테스트로 보장** (운영 실측은 미확인) |
| 5 | 공식 whitelist 밖 저장 0건 | ✅ 코드·테스트로 보장 |
| 6 | `projects.market_workspace` 저장 | ⏸ 미확인 (경로 무변경) |
| 7 | Writer 섹션이 실제 Evidence 인용 | ⏸ 미확인 |
| 8 | Writer 가 없는 공식 수치를 추가하지 않음 | ⏸ 미확인 |
| 9 | Reviewer "공식 근거 없음" issue 소멸 | ⏸ 미확인 |
| 10 | 시장조사 미사용 플랜 정상 생성 | ✅ 회귀 통과 |

**10개 중 3개 충족, 1개 전진, 6개는 크레딧 충전 후 확인.**

---

## 아직 남은 시장분석 한계

### 1. 크레딧 충전 후 반드시 할 것 — 최우선

1. Canary B(`json_schema`) 재실행 → 인용이 온전하면 전략 A 로 전환 검토
2. 운영 3종(로컬/IT/제조·커머스) E2E, source 수와 검증 통과율 기록
3. Writer E2E — 특히 **모델이 프롬프트의 URL 을 그대로 옮겨 적는지**
4. Reviewer 의 "공식 근거 없음" issue 소멸 확인
5. 실제 응답시간 측정 → 150초 상한 적정성 재판단
6. 1회 비용 측정 → 그 뒤에야 자동화 여부를 논할 수 있다

### 2. 평문 파싱의 구조 안정성이 미검증

`extractJsonObject` 는 코드펜스와 앞뒤 문장까지만 받아준다. 실제 모델이 얼마나 자주 그 범위를 벗어나는지 모른다. `WEB_SEARCH_PARSE_FAILED` 가 자주 나오면 전략 C(2단계)를 검토해야 한다 — 그 판단도 실측 이후다.

### 3. `tool_choice: "required"` 의 부작용 가능성

검색을 강제하므로 적절한 공식 자료가 없는 주제에서도 모델이 억지로 검색하고 무관한 통계를 가져올 수 있다. 인용 검증이 가짜 주소는 막지만 **"실재하되 이 사업과 무관한 공식 통계"** 는 막지 못한다. 이것은 사람이 판단할 영역이고, 그래서 `verification: needs_review` 가 맞다.

### 4. archetype 매핑 부적합 (종합감사 이월)

`콘텐츠·크리에이터 → professional_service` 는 어색하다. 9업종을 6아키타입으로 줄이면서 생긴 것으로, 검색 맥락의 품질을 떨어뜨린다. 이번 범위 밖.

### 5. evidence 100개 상한의 조용한 절단

`route.ts:115` 의 `Array.from(unique.values()).slice(0, 100)` 은 HOTFIX 0 에서 제거한 것과 **같은 종류의 조용한 절단**이다. 근거가 100개를 넘을 일은 당장 없고 이번 범위가 아니라 손대지 않았지만, 기록해 둔다.

### 6. 종합감사의 다른 P1 은 그대로

`owner_pay` 미반영, 보완 답변이 영향 섹션에 도달하지 않는 10건, Reviewer 실행 실패율 33%, 점수 편차 12점 — 이번 범위 밖.
