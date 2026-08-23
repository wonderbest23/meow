# 공식 시장근거 검색 운영 복구 — HOTFIX 1

> **상태: 복구 완료. 운영에서 실제 검색 → 인용 검증 → 저장 → Writer → Reviewer 전 구간 작동 확인.**
>
> 크레딧 충전 후 재검증했다. P0 이후로 **원인이 세 개 더 나왔고** 전부 실측으로 잡아 고쳤다.
> 이 보고서의 수치는 전부 운영 실호출 결과다.

---

## 최종 결과 요약

| 사업 | HTTP | 시간 | 검색 출처 | 저장된 근거 | 도메인 |
|---|---:|---:|---:|---:|---|
| A 로컬 소매(무인 꽃집) | **200** | 84초 | 84개 | **1건** | kosis.kr |
| B 교육·클래스(반려견 케이크) | **200** | 139초 | 115개 | **5건** | kostat.go.kr |
| C 꽃집 B2B 변형 | **200** | 130초 | 86개 | **4건** | kosis.kr, kostat.go.kr |

- Writer 4개 섹션에서 **공식 URL·수치·기관명을 그대로 인용**, 지어낸 호스트 0건
- Reviewer의 **"공식 시장 근거가 아직 붙어 있지 않습니다" issue 소멸** (직전 3회 실행 3/3 등장 → 0)
- 저장된 근거의 `verification` 은 전부 `needs_review`

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

## P0 뒤에 숨어 있던 원인 3개

형식 충돌만 고쳤을 때 여전히 실패했다. 운영 로그를 근거로 하나씩 벗겨냈다.

### 원인 2 — 프롬프트가 열쇠 이름을 말하지 않았다

```
(warn) [market-research] 형태가 어긋난 근거 후보를 버렸습니다:
  title:invalid_type,metric:invalid_type,sourceName:invalid_type | (×5)
```

검색은 돌고 JSON 도 나왔는데 **다섯 건 전부 `title`·`metric`·`sourceName` 이 없었다.**
기존 프롬프트는 `numericValue`·`observedAt`·`sourceUrl`·`note`·`sourceExcerpt` 만 이름으로 언급하고
`title`·`metric`·`value`·`unit`·`region`·`sourceName` 은 한 번도 말하지 않는다.
JSON 모드가 형태를 강제해 준다는 전제였는데, **그 JSON 모드를 쓸 수 없다는 게 바로 P0 였다.**
전제가 무너진 자리를 아무도 메우지 않은 상태로 남아 있었다.

→ 프롬프트에 **열쇠 이름을 전부 적은 형식 예시**를 넣었다.

### 원인 3 — 배열 전체를 한 번에 검증했다

`researchOutputSchema.parse(...)` 가 `evidence` 배열을 통째로 검사해서, 다섯 건 중 한 건만
어긋나도 멀쩡한 네 건까지 버려졌다.

→ `parseEvidenceItems` 로 **항목별 검증**으로 바꿨다. 어긋난 항목만 떨어뜨리고 사유를 로그에 남긴다.
근거의 안전성은 뒤따르는 인용 대조가 지키므로 이 완화는 보안을 낮추지 않는다.

### 원인 4 — 출력 토큰이 4,000 에서 잘렸다

A 는 성공했는데 B·C 가 `MARKET_RESEARCH_EMPTY` 로 끝났다. 카나리아 usage 가 이유를 보여줬다.

```
output_tokens: 3,715  (그중 reasoning 2,751)   ← 상한 4,000 에 붙어 있음
web_search_call × 17
```

검색을 열 번 넘게 돌면 추론 토큰만 2,700 을 쓰고, 남은 몫으로는 근거 다섯 건의 한국어 본문과
긴 통계표 주소를 다 적지 못해 **최종 메시지가 통째로 잘린다.** A 는 간신히 들어간 것이었다.

→ `max_output_tokens` 를 **4,000 → 12,000** 으로 올리고,
`incomplete_details.reason === "max_output_tokens"` 를 `WEB_SEARCH_OUTPUT_TRUNCATED` 로 구분했다.
실사용은 4~6천이고 나머지는 여유분이다 — 상한이지 목표가 아니다.

### 원인 5 — 검색일이 통계 기준일 자리에 인쇄됐다

Writer 본문 실측:

> "서울특별시 전체 사업체 종사자 수는 5,800,617명으로 집계된다(KOSIS…, **기준일 2026-08-23**)"

2023년 통계인데 **오늘 날짜**가 기준일로 붙었다. 원문에서 기준일을 확인하지 못하면 저장할 때
검색한 날짜를 대신 넣는데(스키마가 날짜를 요구한다), 그 값이 그대로 Writer 까지 갔다.
A·B 두 사업에서 모두 재현됐다.

→ `toPromptEvidence` 에서 **수집일과 같으면 기준일을 비워서** 넘긴다.
Writer 형식에 이미 있던 "원문 확인 필요" 로 인쇄된다. 스키마도 Writer 프롬프트도 바꾸지 않았다.

---

## 최종 선택한 구현 방식과 이유

### 선택: 전략 B — 평문 출력 + 내부 파싱·검증

크레딧이 없던 시점에 골랐고, **크레딧 충전 후 운영에서 3/3 성공했으므로 그대로 간다.**

당시 판단: 지시 §3 의 우선순위는 A(`json_schema`)가 먼저지만 그 조건은 "실제 canary 에서 정상 동작하고
sources/citations 도 유지된다면"이다. 그 조건을 확인할 수 없었으므로 §2 대로 "문서상 될 것 같다"로 정하지 않았다.

지금 와서 보면 이 선택이 맞았다. 평문으로 받으니 `web_search_call` 17회와 `action.sources` 84~115개가
그대로 따라왔고, 인용 주석 경로도 살아 있었다. `json_schema` + `strict` 에서 이것이 똑같이 유지되는지는
여전히 미확인이며, 확인하지 않은 채 옮길 이유가 없다 — **이 기능의 유일한 안전장치가 인용 대조**다.

전략 C(2단계 분리)는 고르지 않았다. 평문 한 번으로 3/3 이 나왔으므로 비용을 두 배로 올릴 근거가 없다.

---

## 변경 파일

| 파일 | 변경 |
|---|---|
| `lib/market/openai-research.ts` | `text.format` 제거(P0) · 프롬프트에 열쇠 이름 명시 · `parseEvidenceItems` 항목별 검증 · `max_output_tokens` 4,000→12,000 · `extractJsonObject` · `normalizeUrl` 강화 · 오류 코드 세분화 · 인용 폐기 건수 로그 |
| `lib/plan-builder/market-research.ts` | `toPromptEvidence` 가 검색일을 기준일로 넘기지 않게 (1줄) |
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

| | 사업 | HTTP | 시간 | web_search_call | 실제 검색 출처 | 후보 | 인용 검증 통과 | 저장 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| A | 무인 꽃집 (로컬 소매) | 200 | 84초 | 있음 | **84** | 5 | 1 | ✅ |
| B | 반려견 케이크 클래스 (교육) | 200 | 139초 | 있음 | **115** | 5 | 5 | ✅ |
| C | 꽃집 B2B 변형 | 200 | 130초 | 있음 | **86** | ~5 | 4 | ✅ |

저장된 근거의 도메인은 전부 화이트리스트 안이다 — `kosis.kr`, `kostat.go.kr`, `www.kostat.go.kr`.
**화이트리스트 밖 저장 0건.**

실제 저장물(B, 5건 전부):

```
통계청 2020 인구총조사·통계프리즘 | 반려동물 보유 가구 추정 비율 = 15.0%
통계청 가계동향조사 | 가구당 월평균 반려동물 관련용품 구입비 = 9천 원
통계청 가계동향조사 | 가구당 월평균 화훼 및 반려동물서비스 지출 = 7천 원
통계청 가계동향조사 | 화훼·반려동물 관련 지출 합계 = 21천 원
통계청 가계동향조사 | 관련 지출 합계의 변화 = 14천 원 → 21천 원
```

반려견 케이크 클래스에 **실제로 쓸 수 있는 지표**다. 검색 맥락 구성이 제대로 동작한다는 뜻이다.

### 인용 검증이 실제로 걸러낸다 — A 사업

A 는 후보 5건 중 **1건만 통과**했다. 나머지 4건은 모델이 적은 주소가 **실제 검색 출처 84개 집합에 없어서** 버려졌다.
즉 모델은 지금도 주소를 지어내거나 바꿔 적으며, 이 방어선이 그것을 잡는다.
이 수치가 운영 로그에 남도록 로그를 한 줄 추가했다.

### 테스트 사업 구성에 대한 정직한 고지

지시 §14 는 로컬 / 온라인·IT / 제조·커머스 3종을 요구했다. 실제로는 **로컬 소매 · 교육·클래스 · 로컬 B2B 변형**으로 돌았다.

이유는 제품 구조다. 오늘창업은 **"사업 1개 + 플랜 여러 개"** 라서 사업 정보(업종·지역·설명)가 계정에 하나뿐이다.
이 계정의 사업 정보는 "1인 무인꽃집"이고, 답변이 거의 없는 플랜(예: 한빛싱크)은 조사 맥락에서 그 설명을 그대로 물려받는다.
C 의 결과가 화훼 지표로 나온 것은 검색 결함이 아니라 **맥락이 실제로 꽃집이었기 때문**이다.

IT·SaaS 나 커머스로 시험하려면 계정의 사업 정보를 바꿔야 하는데, 그건 사용자의 실제 데이터라 건드리지 않았다.

---

## Writer E2E

근거가 저장된 플랜에서 섹션 4개를 실제로 생성했다.

| 섹션 | HTTP | 시간 | 길이 | 공식 URL | 수치 인용 | 지어낸 호스트 |
|---|---:|---:|---:|---|---|---|
| `market/segments` (A) | 200 | 36초 | 1,978자 | ✅ | ✅ | **0** |
| `market/competitors` (A) | 200 | 49초 | 1,994자 | — | ✅ | **0** |
| `summary/executive` (A) | 200 | 42초 | 1,979자 | ✅ | ✅ | **0** |
| `market/segments` (B) | 200 | 86초 | 1,970자 | ✅ | ✅ | **0** |

§15 의 확인 항목을 하나씩 대조한다.

| 확인 | 결과 |
|---|---|
| Evidence 가 프롬프트에 실제로 들어감 | ✅ |
| `sourceName`·`sourceUrl` 포함 | ✅ |
| `observedAt` 포함 | ✅ (아래 원인 5 수정 후 "원문 확인 필요"로) |
| 새 URL 생성 | **0건** — 본문의 호스트는 `kosis.kr`·`kostat.go.kr` 뿐 |
| Evidence 에 없는 공식 수치 추가 | **0건** |
| 같은 Evidence 과도한 반복 | 없음 — 섹션 끝 `### 참고 근거`에 한 번만 |
| "정부가 검증했다" 표현 | **0건** |

### 가장 중요한 결과 — 수치를 오용하지 않는다

`market/segments` 본문 그대로:

> "참고할 수 있는 공식 통계로는 서울특별시 전체 사업체 종사자 수가 5,800,617명으로 집계되어 있다(KOSIS…).
> **다만 이는 서울시 전체 사업체 종사자 수로, 강서구 화곡동 반경 1km 내 퇴근길 직장인 규모와는 집계 범위와 정의가 다르다.
> 이 수치를 강서구 세그먼트 규모의 근거로 직접 사용할 수 없으며**, 강서구·화곡동 단위 통계가 별도로 확인되어야 한다."

§17 이 우려한 "전체 시장규모 = 우리 잠재고객" 오해를 **Writer 가 스스로 피한다.**
근거의 `note` 에 담긴 적용 한계와 "공식 검색 근거를 자동으로 정답으로 확정하지 말라"는 프롬프트 지시가 함께 작동한 결과다.

---

## Reviewer E2E

근거 1건이 저장된 상태에서 실행했다.

```
HTTP 200 · 118초 · source: ai · 완성도 70
issues:
  ai/critical/marketing        마케팅 실행 섹션이 문서에 없음
  ai/warning/fact_safety       드라이플라워 매출 계획이 전혀 없음
  deterministic/improvement    아직 정하지 않은 항목이 1개 있습니다
  ai/improvement/finance       1개월차 흑자 금액 인용 오차
```

**"공식 시장 근거가 아직 붙어 있지 않습니다" 가 사라졌다.**
종합감사에서 이 issue 는 3회 실행 **3회 모두** 나왔다 → 지금은 0회.
`deterministic.ts:234` 의 `input.evidence.length === 0` 조건이 더 이상 성립하지 않는다.

Reviewer 가 근거를 잘못 해석하는 징후(전체 시장규모를 우리 고객 수로 읽는 등)는 이번 실행에서 나오지 않았다.
근거가 1건뿐이라 표본이 얇다 — 근거가 5건 붙은 문서에서 한 번 더 볼 필요가 있다.

점수 70 은 종합감사에서 측정한 같은 문서의 편차 범위(62~74) 안이다. 근거 추가의 효과와 편차를 이 한 번으로 분리할 수 없다.

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

| 구간 | 실측 |
|---|---|
| 시장조사 성공 | **84초 / 130초 / 139초** (평균 118초) |
| 형식 거부(수정 전) | 4초 |
| 출력 잘림 실패 | 93초 / 103초 |
| Writer 1섹션 | 36~86초 |
| Reviewer | 118초 |

`AbortSignal.timeout(150_000)` 과 라우트 `maxDuration = 180` 을 **그대로 뒀다.**
성공 최댓값이 139초로 150초 상한에 **11초 여유**밖에 없다. 검색이 더 많이 도는 사업에서는 타임아웃이 날 수 있다.
지시 §20 대로 성공률을 위해 늘리지 않았지만, **상한이 빠듯하다는 사실은 기록해 둔다** — 다음에 다룰 문제다.

---

## 비용

카나리아에서 받은 실제 usage(A 사업, 상한 4,000 시절):

```
input_tokens   94,033   (cache_write 4,601 / cached 0)
output_tokens   3,715   (그중 reasoning 2,751)
total          97,748
web_search_call    17회
```

상한을 12,000 으로 올린 뒤 B·C 는 더 오래 돌았으므로 입력 12만~15만, 출력 5~7천 수준으로 본다.

**단가는 이 보고서에 적지 않는다.** `gpt-5.6-sol` 의 토큰 단가와 web search 호출당 요금을 내가 확인할 수 없고,
추정 금액을 적으면 그게 사실처럼 인용된다. OpenAI 사용량 대시보드에서 오늘 이 세 번의 호출 실비를 확인하는 편이 정확하다.
확실한 것은 **입력 토큰이 9만~15만이고 웹 검색이 회당 10~20번 돈다**는 것 — 일반 생성(섹션당 입력 4천)의 20~30배다.

### 자동 호출을 만들지 않은 이유

이번에도 **사용자가 [공식자료 찾아보기]를 눌렀을 때만** 실행된다.
`/plan` 진입, overview 진입, 전체 생성, 섹션 재생성, Reviewer 실행 어디서도 호출하지 않는다.

이유는 위 숫자 그대로다. 한 번에 입력 9만~15만 토큰 + 검색 10~20회가 나가고, 응답에 2분이 걸린다.
화면 진입만으로 이게 돌면 비용이 사용자 행동과 무관하게 발생한다. **고쳤다고 자동화할 근거가 되지는 않는다.**
서버 레이트리밋 12회 / 10분도 그대로다.

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
| 1 | 운영 market-research API 200 | ✅ 3/3 |
| 2 | output 에 실제 web search call 존재 | ✅ (A 에서 17회 확인) |
| 3 | 실제 search source URL 존재 | ✅ 84 / 115 / 86개 |
| 4 | 모든 `evidence.sourceUrl` 이 실제 source 집합에 존재 | ✅ 코드·테스트·운영 모두 (A 에서 4건 실제 폐기) |
| 5 | 공식 whitelist 밖 저장 0건 | ✅ 0건 |
| 6 | `projects.market_workspace` 저장 | ✅ GET 으로 재확인 |
| 7 | Writer 섹션이 실제 Evidence 인용 | ✅ 4섹션 |
| 8 | Writer 가 없는 공식 수치를 추가하지 않음 | ✅ 0건 |
| 9 | Reviewer "공식 근거 없음" issue 소멸 | ✅ 3/3 → 0 |
| 10 | 시장조사 미사용 플랜 정상 생성 | ✅ 회귀 통과 |

**10개 전부 충족.**

---

## 아직 남은 시장분석 한계

### 1. 인용 검증 통과율이 사업마다 크게 다르다 — 1/5 ~ 5/5

A 는 5건 중 1건만 남았다. 모델이 적은 주소가 실제 검색 출처에 없어서다.
방어선이 제대로 도는 증거이지만, **사용자 입장에서는 "버튼을 눌렀는데 근거가 1개"** 로 보인다.
프롬프트로 "검색 결과에 나온 주소만 쓰라"를 더 강하게 말할 여지가 있지만, 이번에는 손대지 않았다 —
통과율을 올리는 변경은 반드시 인용 검증을 약화시키지 않는지 따로 검증해야 한다.

### 2. 150초 상한에 여유가 11초뿐

성공 최댓값 139초. 검색이 더 도는 사업에서는 `MARKET_RESEARCH_TIMEOUT` 이 날 수 있다.
지시대로 늘리지 않았다. 실패가 실제로 관측되면 그때 근거를 갖고 조정할 문제다.

### 3. 근거 5건 문서에서 Reviewer 를 아직 안 봤다

Reviewer E2E 는 근거 1건 문서로만 했다. 근거가 여러 건일 때 Reviewer 가 전체 시장규모를
우리 고객 수로 오해하는지는 표본이 더 필요하다.

### 4. IT·SaaS / 커머스 맥락은 시험하지 못했다

계정에 사업 정보가 하나뿐이라(§운영 3종의 고지 참조) 꽃집·클래스 맥락만 돌았다.
`archetype` 매핑(`콘텐츠·크리에이터 → professional_service`)의 부적합도 그대로 남아 있다.

### 5. `tool_choice: "required"` 의 부작용

검색을 강제하므로 적절한 공식 자료가 없는 주제에서도 무관한 통계를 가져올 수 있다.
인용 검증은 **가짜 주소**는 막지만 **실재하되 무관한 공식 통계**는 막지 못한다.
A 의 "서울 전체 사업체 종사자 수"가 그런 예에 가깝다 — Writer 가 스스로 한계를 밝혀 피해가 없었지만,
근거 자체의 적합성은 사람이 판단할 영역이고 그래서 `verification: needs_review` 가 맞다.

### 6. evidence 100개 상한의 조용한 절단

`route.ts` 의 `slice(0, 100)` 은 HOTFIX 0 에서 제거한 것과 같은 종류의 조용한 절단이다.
지금은 근거가 10건이라 문제가 없고 이번 범위가 아니라 손대지 않았지만, 기록해 둔다.

### 7. 종합감사의 다른 P1 은 그대로

`owner_pay` 미반영, 보완 답변이 영향 섹션에 도달하지 않는 10건,
Reviewer 실행 실패율 33%, 점수 편차 12점 — 이번 범위 밖.
