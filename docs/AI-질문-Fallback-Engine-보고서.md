# AI 장애 대비 Question Fallback Engine — HOTFIX 3

> **핵심 결론: 명세가 요구한 아키텍처는 이미 구현돼 있었다.** 이번 작업의 실제 산출물은
> ① 그 사실을 실행 가능한 증거(A~J 테스트 22종 회귀)로 봉인하고, ② 없던 텔레메트리를 넣고,
> ③ 미래 회귀까지 막는 마지막 방어선(try/catch)을 추가한 것이다.
> **새 화면·새 DB·새 canonical 모델은 만들지 않았다.**

---

## 기존 AI 의존 지점 (§1 감사)

HEAD 코드를 직접 읽고 확인했다. 보고서·기억이 아니라 파일 기준이다.

| 단계 | LLM 필수? | 코드만으로? | 실패 시 현재 동작 |
|---|---|---|---|
| A. Business Analyzer (`/api/plan/analyze`) | 분류·요약에 필요 | 불가(자유문장 분류) | `{ok:false, reason:"analysis_failed"}` → 화면이 "직접 입력해서 계속하기" → 기존 위저드 |
| B. Dynamic Question 문장 (`/api/plan/questions/next`) | **불필요** — 문장 다듬기용 | **가능** — 팩의 `ask` 기본 문장 | `completeText` null → `defaultQuestions()` 팩 문장, `source:"fallback"` |
| C. 질문팩 선택 (`packForAnalysis`) | 불필요 | **순수 코드** (modelTags → 팩) | 실패 개념 없음 |
| D. Gap Analyzer (`analyzeGaps`/`pickRoundSlots`) | 불필요 | **순수 코드** (LLM 0회) | 실패 개념 없음 |
| E. 기존 137개 질문 (`questions.ts`) | 불필요 | **정적 데이터** | 실패 개념 없음 |
| (추가) Reviewer 보완질문 (`followUpQuestions`) | 불필요 | **순수 코드** — 기존 질문 문장 재사용 | 실패 개념 없음 |

**"무엇을 물을지"를 정하는 곳(C·D·E)은 전부 결정적 코드다.** LLM은 A(분류)와 B(문장 다듬기)에만 있고, B는 이미 완전한 폴백을 갖고 있었다.

## 장애 시 기존 사용자 경험

- **질문 AI 장애**: 사용자는 팩 기본 문장("1인 수강료는 얼마 정도로 생각하고 계세요?")을 본다. 흐름 중단 없음. 이미 그랬다.
- **Analyzer 장애**: `failed` 화면 → "직접 입력해서 계속하기" → `/plan/overview` 위저드. **사업 정보는 `/plan/start`에서 분석 이전에 이미 저장**되므로(분석 라우트는 `savePlanState`를 아예 import하지 않는다) 유실이 구조적으로 불가능하다.
- **클라이언트에서 질문 API 자체가 죽어도**: `catch { goDerive(...) }` — 지금까지의 답으로 마무리 단계로 넘어간다. 막히는 길이 없다.

## 최종 fallback architecture

명세 §2의 그림이 코드에 이미 있다. 이번에 바뀐 것은 굵은 부분뿐이다.

```
사업 아이디어 입력  (/plan/start 에서 저장 — 분석 전에)
        ↓
Business Analyzer (LLM, 45초 상한)
   성공 ↓                 실패 ↓  ← **[신규] console.warn 텔레메트리**
BusinessAnalysis          위저드 폴백(137문항, LLM 0)
        ↓
Gap Analyzer (순수 코드) → pickRoundSlots (blocking→important, ≤4개)
        ↓
generateQuestions (LLM 30초 상한)  ← **[신규] 전체 try/catch + 사유별 로그**
   1차 프로바이더 실패 → 2차 프로바이더 (completeText 내장)
   둘 다 실패 / 깨진 JSON / 스키마 불일치 / 예상 밖 오류
        ↓
defaultQuestions() — 팩의 ask 문장 (0.006ms)
        ↓
사용자 답변 → applySlotAnswer → 기존 plan.answers + __analysis.slots (경로 단일)
```

## Fallback Question Library — 새로 만들지 않았다 (§4·§11)

명세는 `fallback-library.ts` 신설을 예시로 들었지만, **팩 자체가 이미 그 라이브러리다**:

```ts
export interface PackSlot {
  ...
  /** LLM 이 실패했을 때 그대로 쓰는 기본 질문 — 쉬운 한국어 */
  ask: string;   // ← 선택이 아니라 필수 필드
  ...
}
```

`ask`가 **타입상 필수**라서 폴백 문장 없는 슬롯은 **컴파일 자체가 안 된다.** 명세 §10의 "새 팩을 추가했는데 fallback을 안 쓰면 CI 실패"는 TypeScript가 이미 보장하고, 빈 문자열 같은 우회는 테스트 F가 막는다(모든 팩 × 모든 슬롯의 `ask ≥ 5자` 검사).

별도 파일을 만들면 같은 슬롯의 질문이 두 곳에 생겨 명세 §11("중복 작성 금지")을 오히려 어긴다. 그래서 만들지 않았다.

## reachable slot 전체 목록 (24개)

| 슬롯 | 팩 | 기존 질문 연결(mapsTo) | 폴백 문장(발췌) |
|---|---|---|---|
| customer (CORE) | 전체 | 예 | "주로 어떤 분들이 고객이 될까요?" |
| problem (CORE) | 전체 | 예 | "고객이 지금 겪는 불편이나 아쉬움은 무엇인가요?" |
| solution (CORE) | 전체 | 예 | "그 문제를 어떻게 해결해 주나요?" |
| differentiator (CORE) | 전체 | 예 | "비슷한 곳 대신 여기를 고를 이유는 무엇일까요?" |
| ownerExperience (CORE) | 전체 | 예 | "이 분야와 관련된 경험이나 경력이 있으신가요?" |
| classPrice | class | 예 | "1인 수강료는 얼마 정도로 생각하고 계세요?" |
| seatsPerClass · classesPerMonth · venueType · materialCost · occupancyRate · venueCost | class | —(구성 항목) | 각자 보유 |
| aov · adBudget · fixedOps | commerce | 예 | 각자 보유 |
| monthlyVisitors · conversionRate · cogs | commerce | —(구성 항목) | 각자 보유 |
| unitPrice · monthlyVolume · unitCost · fixedTotal · initialInvestment · salesChannel | unit_sale | 예 | 각자 보유 |

## 기존 questions.ts 재사용 비율

- 24개 중 **15개(62%)** 가 `mapsTo`로 기존 137문항의 칸에 직결된다.
- 나머지 9개는 합계의 구성 항목(재료비·공간비 등)이라 기존 칸이 없는 것이 맞다 — `contributesTo`로 숫자 확인 화면을 거쳐 합계 칸에 들어간다.
- Reviewer 보완질문 20개 target: 18개가 기존 `QuestionDef` 문장 재사용, 2개(`growth_ceiling`·`owner_hours`)만 자체 `ask` 보유. **전부 LLM 없이 문장이 나온다**(테스트 F에서 전수 검증).

## 직접 작성 fallback 문장 목록

**0개.** 이번 HOTFIX에서 새 질문 문장을 한 줄도 쓰지 않았다. 기존 24개 `ask`가 전부이고, 명세 §4가 예시한 문장들(customer·problem·unit_price…)은 이미 같은 의미로 존재한다.

## model-specific override (§5)

이미 팩 구조가 그 자체다. 같은 canonical 의미(1건 가격)가 팩마다 다른 문장을 갖는다:

- class → "1인 수강료는 얼마 정도로 생각하고 계세요?"
- commerce → "고객이 한 번 살 때 평균 얼마쯤 살 것 같나요?"
- unit_sale → "한 번 팔 때(1건·1인) 평균 얼마를 받을 생각인가요?"

템플릿이 없는 모델은 unit_sale 팩으로 떨어져 default 문장으로 항상 동작한다(§5 요건).

## Analyzer 장애 처리 (§12·§13·§14 평가 결과)

**새 화면을 만들지 않았다.** 명세 §13 지시대로 기존 UX를 먼저 평가했다:

1. 사업 정보(이름·설명·업종·지역·단계)는 분석 **이전에** `/plan/start`에서 저장된다. 분석 라우트는 상태를 쓰지 않는다 → 유실 불가.
2. 위저드는 137문항 전체가 정적 데이터라 **LLM 0회로 완주**된다. 재무 입력(unit_price·monthly_volume·variable_per_unit·fixed_total)이 전부 위저드 칸에 있으므로 재무 엔진·Writer·Reviewer가 분석 없이도 동작한다(HOTFIX 2의 `withContext`가 분석 없는 플랜을 이미 처리).
3. 잃는 것은 팩 전용 지표(정원×횟수 등)와 VERIFY 확인 카드뿐 — 이는 enhancement이지 필수 경로가 아니다.

§13~14의 "수익 방식 선택 → modelTag 매핑" 화면은 **만들 경우 새 confirmed 분류 경로 + 새 UI 표면**이 생긴다. 위저드가 이미 완전한 폴백인 상태에서 그 복잡도는 §13의 "과하게 만들지 않는다"에 걸린다. 결론: 보류하고, 위저드 폴백이 불충분하다는 운영 근거가 생기면 그때 만든다.

## Dynamic Question 장애 처리 (§7)

`completeText`는 **어떤 경우에도 던지지 않는다** — 타임아웃(`AbortSignal.timeout`)·HTTP 오류·JSON 파싱 실패 전부 개별 catch로 null이 된다. 그 위에 이번에 **함수 전체 try/catch**를 더했다: `completeText`의 무던짐 약속이 미래에 깨지거나 프롬프트 조립 코드가 터져도 질문 라운드는 죽지 않는다(`reason=unexpected_error`).

인증 오류(401 `login_required`)는 라우트에서 LLM 호출 **전에** 반환된다 — AI 장애로 위장되지 않는다(§7 마지막 요건).

## partial AI response 처리 (§8)

기존 구현이 이미 정확했다: `base.map((b) => byId.get(b.id) ?? b)` — 기준 배열이 **요청 슬롯**이므로 개수·순서가 구조적으로 보존된다. AI가 3/4만 주면 3개는 AI 문장, 1개는 팩 문장(테스트 D). 이번에 부분 폴백이 로그에 보이도록 `reason=partial`을 추가했다.

## provider 전체 장애 처리 (§17)

`completeText` 내장 사슬: **1차(요청 프로바이더) → 2차(`envAlternate`, 반대 프로바이더 환경키 있으면) → null → 팩 문장.** 명세의 이상 구조와 동일하다. 테스트 J가 두 프로바이더 모두 죽인 상태에서 fetch 2회 시도 → 팩 질문 반환을 확인했다.

**현재 timeout 실측값(§17 지시: 바꾸지 말고 보고):**

| 호출 | LLM timeoutMs | 최악 대기(1차+2차) |
|---|---|---|
| 질문 생성 | 30초 | **60초** |
| Analyzer | 45초 | **90초** |

질문 60초는 명세가 우려한 "수십 초 대기"에 해당한다. 다만 타임아웃은 전체 무응답일 때의 상한이고, 흔한 실패(즉시 4xx/5xx)는 수 초 안에 폴백된다. 숫자 조정은 지시대로 하지 않고 기록만 남긴다 — 줄이려면 "2차 시도에는 남은 예산만 주는" 방식이 후보다.

## canonical answer 저장 확인 (§26·§32)

`applySlotAnswer(answers, pack, slotId, value)`는 **질문 문장을 받지 않는다.** AI 문장이든 팩 문장이든 저장 함수는 slotId만 보고 `mapsTo` 칸 + `alsoSet` 게이트에 쓴다. 별도 폴백 저장소는 존재할 수도 없는 구조다(테스트 G). 질문 `source`는 응답 객체에만 있고 답변에는 남지 않는다.

## confirmed/inferred/unknown 회귀 (§33)

- `applySlotAnswer`: 값이 없으면(`null`/공백) **아무것도 쓰지 않는다** — 기본값 생성 경로 없음(테스트 H).
- `numericSlots`: `confirmed`가 아닌 슬롯은 숫자로 세지 않는다(테스트 H).
- `normalizeAnalysis`: 이상한 status는 `inferred`로 강등만 되고 승격은 없다(기존 `plan-analyzer` 테스트, 계속 통과).
- 이번 변경은 문장 선택 로직만 건드렸고 상태 판정 코드는 0줄 수정.

## 진행상태 보존 (§31)

기존 구조로 충분해 **DB 변경 없음**: 답변은 `saveAnswers`로 즉시 PlanState에(서버 병합 저장, HOTFIX 0 검증), 분석·슬롯·라운드는 `__analysis` 가상 키에 저장된다. 새로고침 시 `hydrateFromServer`가 복원한다.

## telemetry (§19) — 이번에 신설

이전에는 질문 폴백이 로그에 전혀 남지 않았다. 추가된 로그(사용자 답변 내용 0):

```
[plan-question] source=ai slots=4 ai=4 fallback=0
[plan-question] source=ai slots=4 ai=3 fallback=1 reason=partial
[plan-question] source=fallback slots=4 ai=0 fallback=4 reason=provider_failed
                                                  reason=malformed_json | schema_mismatch | no_config | unexpected_error
[plan-analyze] source=fallback reason=analysis_failed provider=anthropic desc_len=17
```

성공률·폴백 비율·부분 폴백·사유 분포·Analyzer 폴백 횟수가 `wrangler tail`로 전부 집계 가능하다.

## fallback 응답시간 / AI 실패 대기시간 (§34)

- **폴백 자체**: 평균 **0.006ms**/회(100회 실측) — 목표 50ms의 1/8000.
- **AI 실패를 기다린 시간**(폴백과 구분): 즉시 오류면 수 초, 전체 무응답이면 위 표의 30~60초(질문)·45~90초(Analyzer)가 상한.

## 테스트 A~J (`scripts/question-fallback.test.ts`, `npm run test:question-fallback`)

| 케이스 | 내용 | 결과 |
|---|---|---|
| A | AI 정상 → source=ai, 개수·순서·id 보존, 모르겠어요 항상 허용 | ✅ |
| B | 네트워크 던짐 → 전 슬롯 팩 문장, 유실 0 | ✅ |
| C | JSON 아닌 응답 → 폴백, 개수 보존 | ✅ |
| D | 4개 중 3개만 AI → 3 AI + 1 팩, 총 4 | ✅ |
| E | `fake_market_slot` 반환 → 무시, canonical id만 | ✅ |
| F | 3팩 × 24슬롯 전수 `ask≥5자` + Reviewer 보완질문 20 target 문장 존재 | ✅ |
| G | 폴백 답 → `mapsTo` 칸 저장(경로 단일) | ✅ |
| H | null·공백 답 → 저장 0, unknown은 숫자 집계 제외 | ✅ |
| I | Analyzer 타임아웃·깨진 응답 → null 반환(던지지 않음), 라우트는 상태 미저장 | ✅ |
| J | 1차 openai + 2차 anthropic 모두 장애(fetch 2회 확인) → 팩 질문 반환 | ✅ |

**테스트가 회귀를 실제로 잡는지 확인했다**: 부분 응답 병합을 "AI 목록 기준 filter"로 바꿔(슬롯 유실 버그 주입) 돌리면 D가 `요청 슬롯 수 = 질문 수`에서 즉시 실패한다. 원복 후 재통과.

## 전체 회귀 테스트

22종 전부 PASS + `tsc --noEmit` PASS: question-fallback(신규) · plan-analyzer · plan-context · financial-workbook · followup-loop · resolution-reachability · owner-pay-safety · market-research · plan-market-research · market-citation-guard · plan-review · plan-review-resolution · generation-queue · plan-store-capacity · payment-security · plan-section-service · consult-carry · review-digest · document-source-url · plan-guest-persist · plan-sync · plan-merge. **HOTFIX 0/1/2 무손상.**

## 변경 파일

| 파일 | 변경 |
|---|---|
| `lib/plan-builder/analyzer/question-generator.ts` | 전체 try/catch + 사유별 텔레메트리 (동작 로직 무변경) |
| `app/api/plan/analyze/route.ts` | 실패 시 warn 로그 1줄 |
| `scripts/question-fallback.test.ts` | **신규** A~J |
| `package.json` | 테스트 등록 |

## 아직 AI가 없으면 불가능한 기능

정직하게 남긴다 — 이번 범위(질문)와 무관하게 LLM이 죽으면 안 되는 것들:

1. **Writer 25개 섹션 본문** — 대체 불가·대체 안 함(§30: 미리 쓴 계획서 제공 금지). 답변은 전부 저장되므로 복구 후 "계속 작성" 가능.
2. **Reviewer AI 검토** — 확정 검사만 남고 `score=-1` + "완료하지 못했다" 안내(기존 동작, Reviewer 재검증에서 확인).
3. **Analyzer 분류·VERIFY 카드** — 위저드로 우회 가능하나 팩 전용 지표·확인 카드는 없음.
4. **공식 시장근거 검색** — OpenAI 전용(HOTFIX 1), 실패 시 근거 0건으로 명시 실패.
5. **상담 챗봇** — fallback() 안내문으로 강등, 대화 지속 불가.

---

# 최종 질문 5개

**1. Claude/OpenAI가 둘 다 장애여도 사용자는 질문 입력을 끝낼 수 있는가?**

**예 — 두 겹으로.** 동적 질문 경로는 팩 기본 문장으로 전 라운드 완주(테스트 J: fetch 2회 실패 확인 후 팩 질문 반환), Analyzer까지 죽으면 137문항 위저드가 LLM 0회로 완주된다. 유일한 상한은 최악 60초의 타임아웃 대기다.

**2. AI가 복구되면 기존 답변으로 사업계획서를 이어서 생성할 수 있는가?**

**예.** 답변은 질문 출처와 무관하게 같은 `plan.answers`에 저장되고(테스트 G) PlanState는 서버 병합 저장이다(HOTFIX 0). Writer는 요청 시점의 answers만 읽으므로 복구 후 "계속 작성"이 그대로 동작한다. 생성 대기 상태 허용(§30)도 이미 그 구조다.

**3. fallback 질문 품질은 실제 서비스에서 사용 가능한 수준인가?**

**예.** 폴백은 급조 문장이 아니라 사람이 다듬어 둔 팩 질문이다 — "정원이 다 차지 않는 날도 있죠. 평균적으로 정원의 몇 % 정도 올 것 같나요?" 수준. 종합감사에서 AI 문장의 가치는 "사업 맥락 재작성"(음식점 사장님이…)이었는데, 팩 문장은 그 맥락화만 없을 뿐 쉬운 한국어·전문용어 없음·모르겠어요 지원이 동일하다.

**4. fallback 때문에 사실성 규칙이 약해진 곳은 없는가?**

**없다.** 이번 변경은 질문 **문장** 선택만 건드렸다. 저장(`applySlotAnswer`)·상태 판정(`normalizeAnalysis`)·숫자 집계(`numericSlots`)는 0줄 수정이고, 테스트 H가 "값 없는 답 → 저장 0"을, 기존 plan-analyzer 테스트가 "confirmed 승격 없음"을 계속 봉인한다. 답변 자동 생성 경로는 존재하지 않는다.

**5. 이후 pre-generated question cache가 정말 필요한가?**

**현재 근거로는 불필요.** 캐시가 사줄 것은 "AI 다운 중에도 사업 맥락이 담긴 문장"뿐인데, ① 운영에서 질문 폴백이 관측된 적이 없고(이번에 넣은 텔레메트리로 이제부터 측정 가능), ② 폴백 문장 품질이 이미 서비스 수준이며, ③ 캐시는 modelTag×슬롯 조합 관리라는 지속 비용을 만든다. §16 지시대로 보류하고, `source=fallback` 비율이 실측으로 유의미해지면 그때 재검토한다.
