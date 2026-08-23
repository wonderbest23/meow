# 보완루프 데이터흐름 무손실화 + owner_pay 의미 안전화 — HOTFIX 2

> **결과: 보완 답변이 닿지 않는 (target, 섹션) 쌍 0개.**
> 감사보고서의 "10건"을 그대로 쓰지 않고 HEAD 에서 다시 계산했다 — 실제로는 **17건**이었다.
> `owner_pay` 는 감사보고서의 진단과 **다른 결론**에 도달했다(아래 참조).

---

## 기존 문제

Reviewer 가 "이걸 답하면 이 섹션들을 다시 쓰겠다"고 선언해 놓고, 정작 그 섹션이 새 답을 못 받았다.
사용자는 답하고 **다시 작성 비용을 쓰고도 문서가 그대로**인 것을 본다.

4차에서 한 번 고쳤는데도 남아 있었다. 그때 테스트가

> "같은 그룹(`marketing.*`)의 값을 하나라도 받으면 통과"

였기 때문이다. `marketing.channels` 만 받아도 `marketing.budget` 이 빠진 것을 못 잡았다.

---

## 현재 Resolution Target 전체 목록

HEAD 기준으로 코드에서 직접 뽑았다(사람이 옮겨 적지 않았다).

| target | 라벨 | 저장 위치 | Context 필드 | 재무 반영 | 다시 쓰는 섹션 |
|---|---|---|---|---|---|
| `promo_channels` | 홍보 채널 | `strategy/promotion`.`promo_channels` | marketing.channels | — | strategy/promotion, overview/summary, summary/executive |
| `promo_budget` | 월 홍보 예산 | `strategy/promotion`.`promo_budget` | marketing.budget | — | strategy/promotion, financials/expenses |
| `message` | 홍보 핵심 메시지 | `strategy/promotion`.`message` | marketing.message | — | strategy/promotion |
| `owner_pay` | 대표자 인건비 반영 여부 | `financials/staffing`.`owner_pay` | team.ownerPayIncluded | — | financials/staffing, financials/expenses, financials/financing |
| `staff_monthly` | 월 인건비 | `financials/staffing`.`staff_monthly` | (재무 엔진 → 고정비) | 예 | financials/staffing, financials/expenses, summary/executive |
| `funding_sources` | 자금 조달 방법 | `funding/requirements`.`sources` | funding.sources | — | funding/requirements, financials/financing, summary/executive |
| `use_of_funds` | 자금 사용처 | `funding/requirements`.`use_of_funds` | funding.use | — | funding/requirements, financials/assets, summary/executive |
| `main_offer` | 대표 상품·서비스 | `market/products`.`main_offer` | solution.mainOffer | — | market/products, strategy/product, overview/summary, summary/executive |
| `first_target` | 가장 먼저 공략할 고객 | `market/segments`.`first_target` | customer.target | — | market/segments, market/personas, strategy/promotion, overview/summary, summary/executive |
| `problems` | 고객이 겪는 문제 | `overview/problem`.`problems` | problem.statement | — | overview/problem, market/personas, overview/summary, summary/executive |
| `differentiator` | 경쟁 대비 차별점 | `market/competitors`.`differentiator` | solution/competition.differentiator | — | overview/problem, market/competitors, market/swot, strategy/product, summary/executive |
| `competitor_notes` | 경쟁 상대 메모 | `market/competitors`.`competitor_notes` | competition.knownCompetitors | — | market/competitors, market/swot, summary/executive |
| `why_us` | 대표자의 관련 경험 | `summary/executive`.`why_us` | team.ownerExperience | — | overview/structure, market/swot, summary/executive |
| `who_works` | 실제 업무 수행 | `strategy/people`.`who_works` | operations.who | — | strategy/people, financials/staffing, summary/executive |
| `unit_price` | 1건 평균 판매 금액 | `financials/revenue`.`unit_price` | revenue.unitPrice(+재무) | 예 | financials/revenue, strategy/price, market/products, summary/executive |
| `monthly_volume` | 월 판매량 | `financials/revenue`.`monthly_volume` | revenue.volume(+재무) | 예 | financials/revenue, strategy/distribution, overview/summary, summary/executive |
| `variable_per_unit` | 1건당 변동비 | `financials/expenses`.`variable_per_unit` | (재무 엔진) | 예 | financials/expenses, strategy/price, financials/revenue, summary/executive |
| `fixed_total` | 월 고정비 합계 | `financials/expenses`.`fixed_total` | (재무 엔진) | 예 | financials/expenses, financials/revenue, summary/executive |
| `growth_ceiling` | 월 운영 한계 | `financials/revenue`.`growth_ceiling` | operations.capacity(+재무 상한) | 예 | financials/revenue, strategy/distribution, strategy/people, summary/executive |
| `owner_hours` | 하루 운영 투입 시간 | `strategy/people`.`how_manage` | operations.ownerHours | — | strategy/people, strategy/distribution |

대상 20개 · 쌍 66개
실행요약 필드 수: 15

---

## 감사에서 발견된 미도달 항목 재검사 결과

감사보고서는 10건을 적었지만, 표식 기반으로 다시 재면 **17건**이었다. 숫자를 하드코딩하지 않고 다시 계산한 결과다.

또 감사보고서가 미도달로 적은 것 중 일부는 **오탐**이었다. `staff_monthly`·`variable_per_unit`·`fixed_total` 은
문자 표식으로는 안 잡히지만(숫자만 파싱되므로) 실제로는 재무 참조를 통해 도달한다.
그래서 검사를 두 갈래로 나눴다 — 아래 §검사 방식 참조.

| 감사 목록 | 재검사 결과 |
|---|---|
| promo_budget → summary/executive | 미도달 확인 → **affected 에서 제거** |
| message → summary/executive | 미도달 확인 → **affected 에서 제거** |
| funding_sources → financials/financing | 미도달 확인 → `funding.sources` 신설 + 필드 추가 |
| funding_sources → summary/executive | 미도달 확인 → 필드 추가 |
| use_of_funds → financials/assets | 미도달 확인 → `funding.use` 추가 |
| use_of_funds → summary/executive | 미도달 확인 → 필드 추가 |
| competitor_notes → market/swot | 미도달 확인 → `competition.knownCompetitors` 추가 |
| competitor_notes → summary/executive | 미도달 확인 → 필드 추가 |
| why_us → overview/structure | 미도달 확인 → `team.ownerExperience` 추가 |
| who_works → summary/executive | 미도달 확인 → `operations.who` 추가 |
| monthly_volume → strategy/distribution | 미도달 확인 → `revenue.volume` 추가 |
| growth_ceiling → summary/executive | 미도달 확인 → `operations.capacity` 추가 |
| (감사에 없던 것) owner_hours → strategy/distribution | 미도달 → `operations.ownerHours` 신설 |
| (감사에 없던 것) owner_hours → summary/executive | 미도달 → **affected 에서 제거** |
| (감사에 없던 것) owner_pay → 재무 3섹션 | 미도달 → `team.ownerPayIncluded` 신설 |
| (감사에 없던 것) owner_pay → summary/executive | 미도달 → **affected 에서 제거** |

---

## exact sentinel 테스트 방식

`scripts/resolution-reachability.test.ts` — target 마다 **고유 표식**을 넣고
운영과 같은 조립 경로(`buildPlanBusinessContext` → `contextForSection` → `collectFinancialInputs` →
`calculateFinancials` → `buildUserPrompt`)를 통과시킨 뒤, **최종 Writer 프롬프트 문자열 안에
정확히 그 표식이 있는지**만 본다. 같은 그룹의 다른 값이 있는 것은 통과로 치지 않는다.

숫자로 저장되는 칸은 표식을 쓸 수 없다 — `parseAmount` 가 문자를 통째로 무시하므로 표식이 사라진다.
그래서 재무 엔진이 읽는 칸(`unit_price`·`monthly_volume`·`variable_per_unit`·`fixed_total`·
`staff_monthly`·`growth_ceiling`·`asset_cost`)은 **값을 바꾸면 그 섹션의 최종 프롬프트가 달라지는가**로
판정한다. 느슨한 게 아니라 다른 종류의 엄격함이다 — "영향을 받는가"를 직접 묻는다.

**이 테스트가 실제로 회귀를 잡는지 확인했다.** `market/swot` 에서 `competition.knownCompetitors` 를
빼자 즉시 `competitor_notes → market/swot` 하나만 정확히 실패했다.

---

## 수정 파일

| 파일 | 변경 |
|---|---|
| `lib/plan-builder/context/build.ts` | canonical 필드 3개 신설: `funding.sources`, `operations.ownerHours`, `team.ownerPayIncluded` |
| `lib/plan-builder/context/section.ts` | 6개 섹션 규칙에 정확한 필드 추가 · 실행요약 재구성 |
| `lib/plan-builder/review/resolution.ts` | 인건비 키워드 매핑 교정 · finance 기본값 교정 · affected 4곳 축소 |
| `scripts/resolution-reachability.test.ts` | **신규** — 전 target × 전 affected 표식 검사 |
| `scripts/owner-pay-safety.test.ts` | **신규** — 이중계상·재무 불변 검사 |
| `scripts/followup-loop.test.ts` | **신규** — 5종 루프 끝까지 |
| `scripts/plan-review-resolution.test.ts` | 인건비 매핑 기대값 갱신 |
| `package.json` | 테스트 3개 등록 |

**재무 엔진(`financials.ts`)은 한 줄도 바꾸지 않았다.**

---

## 수정 전 흐름 / 수정 후 흐름

```
[전]
Reviewer issue → resolution → 질문 → plan.answers 저장 ✅
                                        ↓
                          PlanBusinessContext (필드는 있음) ✅
                                        ↓
                          contextForSection(섹션)  ← 그 필드를 요청하지 않음 ❌
                                        ↓
                          Writer 프롬프트에 값 없음 → 다시 써도 그대로

[후]
… 동일 …
                          contextForSection(섹션)  ← 정확한 필드를 요청 ✅
                                        ↓
                          Writer 프롬프트에 값 존재 → 문서가 실제로 달라짐
```

핵심은 **필드는 이미 있었고 채워지고 있었다**는 것이다. 값이 만들어지지 않은 게 아니라
**받겠다고 선언한 섹션이 요청하지 않았다.** 그래서 수정은 대부분 섹션 규칙 한 줄이다.

---

## affectedSections 제거 / 추가 내역

§4 대로, 미도달마다 둘 중 하나를 골랐다 — 필요하면 필드를 주고, 필요 없으면 대상에서 뺐다.
**테스트를 통과시키려고 모든 값을 모든 섹션에 밀어넣지 않았다.**

### 추가 (그 섹션이 실제로 그 정보를 쓴다)

| 섹션 | 추가한 필드 |
|---|---|
| `overview/structure` | `team.ownerExperience` |
| `market/swot` | `competition.knownCompetitors` |
| `strategy/distribution` | `operations.ownerHours`, `revenue.volume` |
| `financials/staffing` | `team.ownerPayIncluded` |
| `financials/expenses` | `team.ownerPayIncluded` |
| `financials/assets` | `funding.use` |
| `financials/financing` | `funding.sources`, `team.ownerPayIncluded` |
| `summary/executive` | `operations.who`, `operations.capacity`, `competition.knownCompetitors`, `funding.sources`, `funding.use` |

### 제거 (그 섹션은 그 값을 인용하지 않는다)

| target | 뺀 섹션 | 이유 |
|---|---|---|
| `promo_budget` | summary/executive | 실행요약이 홍보 예산 액수를 인용하지 않는다 |
| `message` | summary/executive | 마케팅 문구는 요약의 소재가 아니다 |
| `owner_hours` | summary/executive | 하루 투입 시간은 인력·유통 섹션의 소재다 |
| `owner_pay` | summary/executive | 반영 여부는 재무 섹션에서 다룬다 |

이 넷은 **다시 쓸 필요가 없는데 다시 쓰던 것**이다. 빼는 것이 정확하고, 재생성 비용도 줄어든다.

### 실행요약을 다시 짠 이유

처음에는 미도달을 없애려고 실행요약에 필드를 계속 더했다. 그러자 기존 테스트가

```
AssertionError: 한 섹션 최대 15필드
```

로 막았다. 이 제약은 §4 가 경고한 바로 그 일 — "모든 데이터를 모든 섹션에 넣기" — 을 내가
하고 있다는 신호였다. 그래서 늘리는 대신 **실제로 요약에 쓰이는 것만** 남겼다.

빠진 것들에는 이유가 있다.
- `identity.region` — 지역·업종·단계는 **시스템 프롬프트의 사업 정보에 이미 들어간다**(`formatBusiness`).
- `revenue.unitPrice` — `finance: true` 로 받는 재무 요약(`financialsToReference`)에 판매가가 있다.
- `marketing.acquisitionModel` — 추정값이고 `marketing.channels`(사용자 답)와 겹친다.
- `funding.needs`(예/아니오) — `funding.sources`·`funding.use` 가 더 구체적이다.

결과: 실행요약 필드 **15개 유지**.

---

## 한 출처 → 한 canonical meaning

새로 만든 필드는 3개뿐이고, 전부 기존 저장 칸을 읽는다. **새 저장 칸은 만들지 않았다.**

| 새 필드 | 읽는 곳 | 왜 기존 필드로 안 되나 |
|---|---|---|
| `funding.sources` | `funding/requirements.sources` | `funding.needs`(여부)·`amount`(금액)·`use`(용도)와 다른 개념 |
| `operations.ownerHours` | `strategy/people.how_manage` | `operations.who`(누가)와 다른 개념 |
| `team.ownerPayIncluded` | `financials/staffing.owner_pay` | 금액이 아니라 반영 여부 |

같은 답을 여러 이름으로 복제하지 않았다.

---

## owner_pay 실제 질문 의미

**여기서 감사보고서와 결론이 갈린다.** 감사보고서는 "`owner_pay` 가 재무 엔진에 안 들어간다"를
결함으로 적었고, 이번 지시도 그 전제에서 출발했다. 그런데 실제 질문을 읽으면 다르다.

```ts
// lib/plan-builder/questions.ts
{ id: "has_staff_cost", q: "인건비가 발생하나요?", help: "대표자 급여, 직원, 파트너 지급 포함.", input: { kind: "yesno" } },
{ id: "staff_monthly",  q: "월 인건비는 대략 얼마인가요?", input: { kind: "text", placeholder: "예: 월 150만원" } },
{ id: "staff_type",     q: "어떤 형태로 지급하나요?", input: { kind: "multi", options: ["대표자 급여", "정규 직원 급여", …] } },
{ id: "owner_pay",      q: "대표자 인건비를 계획에 포함하셨나요?", help: "빠뜨리면 실제 수익이 과대평가됩니다.", input: { kind: "yesno" } },
```

- `owner_pay` 는 **금액이 아니라 예/아니오**다. 단위도 없다.
- 대표자 급여의 **금액은 이미 `staff_monthly` 한 칸에 모인다** — 그 앞 질문의 도움말이 못박고, `staff_type` 선택지에도 "대표자 급여"가 있다.
- `owner_pay` 는 그 금액을 **빠뜨리지 않았는지 확인하는 체크**다.

---

## owner_pay 재무 처리 방식과 이유

**재무 엔진에 넣지 않았다.** 지시 §11 이 규정한 경우에 정확히 해당한다 —
의미가 모호한 정도가 아니라, **예/아니오라서 금액으로 해석할 방법 자체가 없다.**

대신 두 가지를 했다.

### (1) 진짜 결함은 매핑이었다

Reviewer 의 "사업주 노동의 기회비용 미반영" 은 키워드 규칙으로 `owner_pay` **하나에만** 연결돼 있었다.
사용자가 "예"라고 답해도 고정비에 들어가는 금액(`staff_monthly`)이 비어 있으면 손익분기는 그대로고,
Reviewer 는 같은 지적을 반복한다. **답할 수는 있는데 아무것도 바뀌지 않는 고리**였다.

```
[전] /인건비|급여|기회비용/ → ["owner_pay"]                   (예/아니오)
[후] /인건비|급여|기회비용/ → ["staff_monthly", "owner_pay"]   (금액 먼저, 확인은 그다음)
```

`CATEGORY_TARGETS.finance` 기본값도 `["owner_pay","fixed_total"]` → `["fixed_total","staff_monthly"]` 로 바꿨다.
분류가 애매해 기본값으로 떨어질 때 예/아니오를 묻는 것보다 금액을 묻는 편이 문서를 실제로 바꾼다.

### (2) 답한 사실은 문서에 반영된다

`team.ownerPayIncluded` 로 재무 3섹션(인건비·비용·자금조달)의 맥락에 들어간다.
"대표자 인건비 반영 여부: 예/아니오"로 인쇄되며, **답을 바꾸면 그 섹션들의 프롬프트가 실제로 달라진다.**

---

## 이중계상 방지

`staff_monthly` 는 이미 대표자 급여를 포함하도록 설계됐다. 여기에 `owner_pay` 를 금액으로 더하면
같은 인건비를 두 번 센다. 그래서 **어떤 값이 들어와도 재무 계산이 흔들리지 않는지**를 테스트로 못박았다.

`scripts/owner-pay-safety.test.ts` 는 `owner_pay` 에
`yes` / `no` / `예` / `아직 모르겠어요` / `1500000` / `월 150만원` / `""` 를 차례로 넣고,
매번 `calculateFinancials` 결과가 **기준과 완전히 같은지**(JSON 직렬화 일치) 확인한다.
`monthlyFixedCost` 도 따로 비교한다.

즉 누군가 나중에 `staff_monthly += owner_pay` 나 `owner_pay → fixed_total` 을 넣으면 즉시 실패한다.

---

## owner_pay 전 / 후 재무 비교

| 상황 | 결과 |
|---|---|
| A. `owner_pay` 없음 | 기존 계산과 **완전 동일** |
| B. `owner_pay="yes"` | 재무 숫자 **불변**. 맥락에 "반영 여부: 예" 추가 |
| C. `owner_pay` unknown | 계산 없음 |
| D. `owner_pay="아직 모르겠어요"` | **0원으로 간주하지 않음** — 어떤 계산에도 안 들어감 |
| E. `staff_monthly` + `owner_pay` 동시 | 인건비는 `staff_monthly` 에서 한 번만. 고정비 동일 |
| F. 이중계상 | 구조적으로 불가 — `owner_pay` 는 금액 경로에 없음 |

**지시 §9 의 "ownerCompensationMonthly 별도 필드"는 만들지 않았다.**
§9 는 "현재 질문이 '대표자가 매월 가져갈 보수'라는 의미로 **명확하다면**"이라는 조건을 달았는데,
실제 질문은 예/아니오라서 그 조건이 성립하지 않는다. 없는 금액으로 파생값을 만들면
§11 이 금지한 "AI 가 의미를 가정해 기존 재무 숫자를 바꾸는" 일이 된다.

> **후속 제안(이번 범위 아님)**: 대표자 보수를 별도 항목으로 다루려면 먼저 질문을 바꿔야 한다 —
> "대표자가 매월 가져갈 금액은 얼마인가요?"를 새로 두고 `staff_monthly` 의 범위를 직원으로 좁히는 일이다.
> 그건 질문·재무모델·기존 문서 정합성을 함께 건드리는 변경이라 HOTFIX 에서 할 일이 아니다.

---

## Reviewer 재지적 여부

Reviewer 는 3차 후속 패치 이후 **사용자의 원본 답변 전체**를 프롬프트로 받는다(`reviewer.ts` 의 답변 블록).
따라서 `owner_pay` 와 `staff_monthly` 의 새 답이 다음 검토에 그대로 들어간다.

그리고 매핑 교정으로 사용자가 **금액**을 답하게 되므로, 답한 뒤에는 고정비가 실제로 늘고
손익분기가 움직인다 — Reviewer 가 근거로 삼던 "인건비 항목이 없음"이 사실이 아니게 된다.

deterministic 검사에는 대표자 인건비 규칙이 **원래 없다**(코드 확인). 그래서 확정 문제로 반복될 경로는 없다.
AI 검토가 같은 지적을 되풀이하는지는 **운영에서 아직 확인하지 못했다** — 아래 §운영 실측 참조.

---

## 5종 보완루프 fixture 결과

`scripts/followup-loop.test.ts` — Reviewer 지적 **문장**부터 시작해
`resolveAiIssue` → `followUpQuestions` → 답 저장 → `affectedOf` → 최종 Writer 프롬프트까지 따라간다.

| 갈래 | 연결된 질문 | 다시 쓰는 섹션 |
|---|---|---|
| A 마케팅 | promo_budget, promo_channels, message | strategy/promotion, financials/expenses, overview/summary, summary/executive |
| B 차별점 | differentiator, competitor_notes | overview/problem, market/competitors, market/swot, strategy/product, summary/executive |
| C 자금조달 | funding_sources, use_of_funds | funding/requirements, financials/financing, summary/executive, financials/assets |
| D 운영 | owner_hours, growth_ceiling | strategy/people, strategy/distribution, financials/revenue, summary/executive |
| E 인력·대표자 | **staff_monthly**, owner_pay | financials/staffing, financials/expenses, summary/executive, financials/financing |

다섯 갈래 모두, 선언된 모든 섹션이 새 답의 영향을 받는다.
E 에서 첫 질문이 `staff_monthly`(금액)인 것이 이번 매핑 교정의 결과다.

---

## 자동 불변식

`npm run test:resolution-reach` 가 §18 의 불변식이다.

```
for each ResolutionTarget:
  for each affectedSection:
    표식을 쓴다 → 최종 프롬프트를 만든다 → 표식이 있는가?
    (재무 칸이면: 값을 바꾸면 프롬프트가 달라지는가?)
```

앞으로 target 을 새로 등록하고 `affected` 만 적어 두면 **이 테스트가 즉시 실패한다.**
현재: 대상 20개 · (target, 섹션) 쌍 66개 · **미도달 0**.

§19 의 registry 통합은 하지 않았다. 지금 흩어져 있는 것은 `RESOLUTION_TARGETS`(저장·affected)와
`SECTION_CONTEXT_RULES`(소비) 둘인데, 이 불변식이 둘 사이의 drift 를 잡아 준다.
한쪽으로 합치는 것은 구조 재작성이라 지시대로 하지 않았다.

---

## 운영 실측 여부

**하지 않았다.**

지시 §17 은 운영 데이터를 파괴하지 않는 범위에서 3건을 권했다. 이 흐름을 운영에서 확인하려면
사용자의 실제 플랜에 보완 답변을 **써 넣어야** 한다(저장이 흐름의 일부다). 그건 사용자 데이터를
바꾸는 일이고, 감사 때 임시 플랜 생성이 차단되기도 했다.

대신 fixture 가 **운영과 같은 조립 경로**(같은 함수, 같은 순서)를 통과한다.
4차 라이브 루프 1건은 이미 완주를 확인했고, 이번 변경은 그 경로에 필드를 더한 것이다.
운영에서 확인이 남은 것은 **Reviewer 가 답변 후 같은 지적을 반복하는지** 하나다.

---

## 회귀 테스트

| 테스트 | 결과 |
|---|---|
| `resolution-reachability` (신규) | **PASS** — 66/66 도달 |
| `owner-pay-safety` (신규) | **PASS** — 이중계상 없음 |
| `followup-loop` (신규) | **PASS** — 5종 완주 |
| `plan-context` | PASS (15필드 제약 유지) |
| `plan-review` / `plan-review-resolution` | PASS |
| `plan-section-service` / `generation-queue` | PASS |
| `market-research` / `plan-market-research` / `market-citation-guard` | PASS — **HOTFIX 1 무손상** |
| `document-source-url` | PASS — PDF/DOCX 출처 URL 보존 |
| `plan-store-capacity` | PASS — HOTFIX 0 무손상 |
| `payment-security` / `financial-workbook` | PASS |
| `plan-guest-persist` / `plan-sync` / `plan-merge` / `plan-analyzer` | PASS |
| `planning-inputs` / `plan-target-plan` / `quality-assurance` | PASS |
| `tsc --noEmit` | **PASS** |

---

## 완료 조건 대조

| # | 조건 | 상태 |
|---|---|---|
| 1 | 모든 target 이 affected 에서 답을 받거나, 불필요한 섹션은 제거됨 | ✅ 66/66, 제거 4건 |
| 2 | "같은 그룹 하나라도" 식 관대한 테스트 0개 | ✅ 표식 완전 일치 / 값 변화 판정 |
| 3 | exact sentinel 테스트 전부 PASS | ✅ |
| 4 | owner_pay 를 답했는데 아무 변화가 없는 상태 제거 | ✅ 재무 3섹션 맥락 반영 + 금액 질문 연결 |
| 5 | owner_pay 를 staff_monthly/fixed_total 에 무조건 합치는 구현 없음 | ✅ 테스트로 봉인 |
| 6 | owner_pay 없는 기존 플랜의 재무 결과 불변 | ✅ `financials.ts` 무변경 |
| 7 | 답변 후 Reviewer 가 동일 지적을 반복하지 않음 | ⏸ 구조적 근거는 확보, **운영 미확인** |
| 8 | 부분재생성 대상인데 새 답을 못 받는 섹션 0개 | ✅ |

---

## 아직 남은 resolution 문제

### 1. 핵심축 unknown 은 여전히 질문으로 이어지지 않는다 (§20)

```
answerResolution(["problem.statement"])  → manual_edit  slots=[]
answerResolution(["customer.target"])    → manual_edit  slots=[]
answerResolution(["solution.mainOffer"]) → manual_edit  slots=[]
answerResolution(["revenue.unitPrice"])  → manual_edit  slots=[]
```

`context.unknowns` 는 핵심축을 점 표기 경로로 넣는데 별칭표는 분석 슬롯 id 만 다룬다.
별칭 4줄만 더하면 될 것처럼 보이지만, 그러면 "아직 정하지 않은 항목" issue 가 항상 질문을 띄우게 되어
Reviewer 결과의 성격이 달라진다. **이번 P1 수리와 성격이 다르므로 지시 §20 대로 보고만 한다.**

### 2. 팩 부재에서 오는 오매핑은 그대로

"구독 이탈률 미반영" → `fixed_total, staff_monthly` 처럼, 키워드에 안 걸려 기본값으로 떨어지는 경우가 남는다.
기본값을 예/아니오에서 금액으로 바꿔 덜 무의미해졌을 뿐, 근본은 subscription·commission 팩 부재다(범위 밖).

### 3. registry 이원화

`RESOLUTION_TARGETS`(저장·affected)와 `SECTION_CONTEXT_RULES`(소비)가 여전히 두 파일이다.
불변식 테스트가 drift 를 잡지만, 사람이 두 곳을 맞춰야 하는 구조 자체는 남았다.

### 4. 실행요약 15필드 제약

이번에 정확히 15에 맞췄다. 다음에 실행요약이 받아야 할 값이 하나 더 생기면 **또 무언가를 빼야 한다.**
제약을 올릴지, 요약이 받는 값을 다르게 조직할지는 그때 결정할 문제다.
