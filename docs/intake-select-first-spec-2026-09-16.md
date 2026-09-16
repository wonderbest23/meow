# 사업 진단(intake v2) 선택 우선 재설계 — 통합 설계 문서

작성일 2026-09-16. 저장소 `/Users/juhong/Developer/meow-main`.
근거는 참고 지도 1~3(필드 소비자 · UI 파이프라인 · 선택지 재료)과 5개 묶음(exploring / startup / operating / details-A / details-B / details-C)의 설계안 및 각 2건의 회의적 검토(하위 호환 렌즈, 커버리지 렌즈)에서만 가져왔다. 인용 형식은 `파일:라인`.

제품 소유자 지시: "반드시 클릭 혹은 선택하게 해야지. 특별하지 않는 한 채팅(타이핑)을 유도해서는 안 된다."
유지하는 제품 경계: 기본 진단은 **AI 호출 0회, 규칙 기반**. 저장 형식은 **기존 coach field 문자열과 intake answers 그대로**. 스키마 변경은 꼭 필요할 때만.

> **기준선 주의.** 설계안 5개가 인용한 `intake-core.ts:60/:106/:110/:172/:176-177`은 커밋(HEAD) 기준이다. 현재 **작업 트리(미커밋)** 에서는 이미 다음이 반영되어 있고 관련 테스트 4개 스위트가 통과한다(검토에서 실측).
> - 결함 1(multi 내부값 노출): `intake-core.ts:77-80 intakeValueLabel`이 요약(:60)·말풍선(:182-183)에 연결됨, `intake-questions.ts:210 readable()`이 후보 카드 사유의 sector id를 라벨로 치환, `scripts/business-intake-questions.test.ts:122-123`도 라벨 단언으로 갱신됨.
> - 결함 2(period 타이핑): `IntakePanels.tsx:76-86` 프리셋 칩 + `<input type="date">` 2개, `model.ts:212-233 PERIOD_PRESETS/periodPresetRange`.
> - 검증 함수 라인: `validatedAnswer` :89-116(배열 거부 :92, period :93-101, single :102-105, multi :106-109, number :110-114, text :115), quote :149, coach.fields 저장 :151, industry :152-155, candidate :156-162, period 저장 :177, details 저장 :178.
>
> 구현자는 이 문서의 라인 번호(작업 트리 기준)와 `git diff HEAD -- lib/plan-builder/intake-core.ts lib/plan-builder/intake-questions.ts app/plan/chat/` 결과를 출발점으로 삼는다. 검토 중에도 파일이 바뀌고 있었으므로 동시 편집 충돌에 주의한다.

---

## 1. 결론 요약

### 1.1 숫자

| 구분 | 개수 | 내용 |
|---|---|---|
| 전체 질문 | **77** | 핵심 33(exploring 11 · startup 11 · operating 11, `intake-questions.ts:42-65`) + 업종 상세 44(11업종 × 4, `:68-135`) |
| 현재 클릭형 | 4종 | industry(single) · interest(multi) · candidate(single) · software.releaseStatus(single). 나머지는 text 55 / number 17 (참고 지도 3 §0-3) |
| 전환 후 **선택 우선** | **75** | 칩·스테퍼·범위 칩·프리셋으로 기본 답변 가능. '직접 입력'은 보조 경로로만 남는다 |
| **타이핑 예외** | **2** | `startup.business`, `operating.business` (아래 1.2) |
| 서버 kind 변경 | 14 | price text→number(3 mode 공통 정의 1건); 상세 text→multi 11건; productStage text→single; revisionRounds·classSize number→text(+options) 2건 — 모두 `IntakeQuestion.kind` 화이트리스트(text/number/single/multi, 테스트 `:33`) 안 |
| 명령 스키마(`intake-service.ts:21 .strict`) 변경 | **0** | value는 여전히 string / number / string[] / null |
| 저장 형식 변경 | **0** | coach.fields 문자열(`intake-core.ts:151`), `intake/details {value,unit,period,messageId,quote}`(:178), `intake/period`(:177) 그대로 |
| AI 호출 | **0회 유지** | 칩 세트 선택 = `intake.sector` + 규칙 함수(`inferProposalSector`, `descriptionSector`) |

### 1.2 타이핑 예외로 남기는 질문과 이유

| 질문 | 이유(코드 근거) | 완화책 |
|---|---|---|
| `startup.business` "사업 소개" | 한 문장이 `coach.business.description/name/ideaOrigin`(`intake-core.ts:119-127`), 홈페이지 상호(`from-plan.ts:58`), 규칙 업종 추천(`model.ts:66-87`), 덱 업종 추론(`proposal-blueprint.ts:126-142`), AI 사업안 new-concept 판정(`coach-design.ts:34-36`)의 공통 씨앗. 칩 조합문은 '무엇이 새로운가'를 담지 못하고 상호를 조합문으로 굳힌다 | (1) 입력창 첫 문장으로 시작한 사용자는 `typedEntryCommand`(`model.ts:27-35`)로 이미 저장되어 질문 생략. (2) 업종별 **업태 명사 칩 6~8개**(네일·미용 / 청소 / 이사 …)를 탭하면 하단 입력창에 **프리필**되고 그대로 저장 또는 한 단어 덧붙여 저장. (3) 문구를 '한 문장(60자 안)'으로 좁힘 |
| `operating.business` | 동일. 운영 중 사업의 상호·지역·대표 상품 결합은 열거 불가 | 문장 시작 칩 8개(업종 추천 정규식 어휘 포함, §3.3). `○○` 자리표시자가 남으면 전송 버튼 비활성 |
| (exploring) candidate의 '직접 생각한 사업' 토글 | 별도 질문이 아닌 candidate의 부속 경로(`IntakePanels.tsx:75`, `BusinessIntake.tsx:361` questionId → business). 기본 흐름은 후보 카드 클릭 | 후보 템플릿을 업종당 2~3개로 확장해 토글 이용률을 낮춤(§3.1 candidate) |

그 외 "타이핑처럼 보이는" 경로는 예외가 아니라 **선택 보조**로 분류한다: 숫자 키패드(정확 금액·수량 입력, 채팅 문장 타이핑이 아님), 각 칩 세트의 '직접 입력'(칩이 맞지 않을 때만), offer의 '상품명 덧붙이기'(선택).

### 1.3 묶음 간 정의 충돌과 통일 결과

여러 묶음이 같은 필드를 다르게 정의했다. 아래로 통일했고 각 질문 표에 반영했다.

| 필드 | 충돌 | 통일 |
|---|---|---|
| **하이브리드(text+칩) 커밋 경로** | exploring: 인라인 '선택 완료(N개)' 버튼이 `onAnswer` 호출 / startup 검토: 칩이 `draft.text`에 join 문자열을 써서 composer '답변 저장'으로 전송 / operating 검토: `choiceQuestion`을 text+options까지 확장 | **칩 탭 → `draft.text`에 조립 문자열을 쓴다**(directAnswer 유지, composer에 조립 문장이 보임, 수정 seed `:322 answerText` 무변경). 폼 안에 **'이대로 저장' 인라인 버튼**(이름은 `business-intake-browser.mts:66`의 exact '답변 저장'과 겹치지 않게)을 두어 한 화면에서 끝낸다. composer는 '직접 입력·덧붙이기' 보조 경로(placeholder '직접 적을 때만'). 단일 선택 칩도 즉시 전송하지 않고 같은 규칙(오탭 방지, 보충 허용) |
| **customer** | exploring: 업종 세트 + 2개 다중 / startup: 공통 1단(개인·사업자) + 업종 6 / operating: 1단 3개(개인·사업자·둘 다) 저장 + 2단 최대 3개 | 공통 1단은 **저장하지 않는 필터**(operating 커버리지 검토: '둘 다'가 홈페이지 `from-plan.ts:62`·홍보 글 `business-launch.ts:52`에 노출). 업종 세트 **6개 + 직접 입력 + 미정 = 8**. 최대 **2개** 선택, `", "` join. 라벨은 공개 문구용 명사구(괄호·인구통계 표찰 금지) |
| **offer** | exploring: 유형 칩 단일 즉시 전송 / startup: 최대 2개 / operating: 1단 형태 + 2단 + 상품명 프리필 권장 | **업종별 유형 칩 6개(11업종 전부 정의, 부록 A) → composer에 프리필, 상품명 덧붙이기 선택** → '이대로 저장'. 1단 '형태' 칩(서비스 제공 등)은 저장하지 않음. 후행 구분자(' — ') strip |
| **problem** | exploring: 업종 6 단일 즉시 전송 / startup: 업종 5 '~다' 문장 / operating: 공통 8 단일 + 업종 risks 2단 | 공통 6(운영 개선용) 또는 업종 6(창업용) + 직접 입력 + 미정 = 8. **최대 2개**, 문장형 라벨('~다/~없음'), `", "` join. 2단 업종 위험 항목은 SECTOR_PROFILES.risks가 계약 항목이라 부적합(operating 커버리지 검토) → 업종별 '문제' 칩으로 재정의(부록 A) |
| **channel** | exploring 공통 7 / startup 공통 6+업종 2 / operating 공통 7+업종 1 교체 | **공통 6 + 업종 슬롯 2 = 8 그리드**, 직접 입력·미정은 그리드 밖 하단 줄. 최대 3개, `", "` join, 라벨 ≤20자(`executive-summary.ts:50` 70자 절단) |
| **price** | 세 묶음 모두 kind number 전환 + 범위→정확값. 2단이 '대표값 4개'(startup) vs '대표값 채운 키패드'(exploring) / '무료(0원)' 칩 유무 | kind **number**. 2단은 **'하한 / 상한 / 정확히 입력' 3개**(사용자가 실제로 아는 값만 저장). **'0원(무료)' 칩 제거**(coachAmount('0원')=0이 `coach.ts:95` null 검사를 통과해 판매가 0 시나리오·unit-margin attention·홈페이지 '0원' 노출). 판매 기준은 §7 보류 항목 |
| **budget / sales / cost** | 구간 표·대표값 방식 상이 | 공통 규칙: 원 단위 범위 칩(오름차순 6~7개) → 2단 '하한 / 상한 / 정확히 입력(만원 단위 키패드)' → `coachAmount` 통과 문자열('300만원', '3,250,000원') 전송. 개방 상단 구간은 로그 스케일 칩 또는 바로 키패드. '0원'만 1단 즉시 전송 |
| **capacity** | startup: 인력 4 + 업종 처리량 3 / operating: 인력 4 + 기간 3 + 스테퍼 | **인력 5 → 처리량(단위 칩 + 프리셋 숫자 + 가변 스테퍼)**, `" / "` join. 물류·공간도 처리량 축으로 통일 |
| **goal** | 세 묶음 모두 기간×지표×수치 | 기간 4 → 지표 8 → 수치(선택; '~까지/~더' 토글; 원 접미) 두 화면 |
| **조립 문자열 문법** | details-A `" · "`/`" — "`, details-B `" / "`, details-C `" · "` | **단계 구분 `" / "`, 다중 `", "`, 접두 `"라벨: "`(질문별 고정), 보충 입력은 마지막 조각.** 라벨에 `/`와 `,` 금지(라벨 내부 `·`는 공백 없음이라 `" / "`와 충돌 없음 — details-B 검토가 `" · "`와 라벨 `·` 충돌을 지적) |
| **숫자 전송값** | JS number vs 문자열 | **항상 `${n}${unit}` 문자열**('60분', '10시간', '400만원'). 정규식(`:112`)이 단위 접미를 허용하고 value는 number로 정규화, quote·말풍선에 단위가 남는다(`:149`, `:183`). 원 이외 단위는 콤마 제거 필수(`^\d+` 정규식) |
| **범위 칩의 대표값 저장** | exploring·details-C 설계: 대표값 자동 채움 | 원 단위 필드는 하한/상한/정확 3칩; **건수 필드(dailyShipments 등)는 '약 N건' 라벨의 대표치 칩을 즉시 전송**(모든 답변에 키패드 확정을 요구하지 않음). quote는 `displayIntakeValue(command.value)`(`:149`)라 구간 의도는 저장 불가 → 라벨에 '약'을 붙여 드러낸다 |

---

## 2. 컨트롤 카탈로그

모든 컨트롤 공통: '아직 미정' 버튼은 기존 `unknownButton`(`IntakePanels.tsx:94`, `onAnswer(null, true, id)`) 유지. 채팅 옵션 그리드는 2열·최소 높이 46px(`intake.module.css:189-192`), ≤400px 패딩 축소(`:284-285`). 한 화면 버튼 **8개 이내**(직접 입력·미정은 그리드 밖 하단 고정 줄로 분리해 계산에서 제외). `.optionDescription`을 쓰면 1열로 바뀌므로(`:190`) 칩 보조 텍스트는 별도 소형 클래스.

| 컨트롤 | 동작 | 전송값 / 저장 형식 | 표시 형식 | 모바일 규칙 |
|---|---|---|---|---|
| **single_chips** (kind single) | 탭 즉시 `onAnswer(value)`(`IntakePanels.tsx:42` 관례). value=내부 id(industry·candidate) 또는 **value=라벨**(신규 상세) | 서버 `:102-105` option.value 일치 | 말풍선·요약은 `intakeValueLabel`(:77-80) | 11개 업종은 추천 접힘(`:36-37,60-66`) 또는 3그룹 접기 검토 |
| **multi_chips** (kind multi) | 체크 토글(`:41`). **폼 안 '선택 완료(N개)' 버튼**이 `onAnswer(draft.selected)` 호출(현재는 composer 전송만 — `BusinessIntake.tsx:345,:363`). '없음/해당 없음' 칩은 클라이언트 배타 | 배열, **value=라벨**. 서버 `:106-109` | 요약·말풍선 라벨(`:60,:182`), 프롬프트 `intake-context.ts:29` join | 8개 이내, 초과 시 2단계 화면 |
| **hybrid_text_chips** (kind text + `options`) — 신규 | 칩 탭 → `draft.text`에 조립 문자열(`" / "`, `", "`) 기록. **'이대로 저장' 인라인 버튼** → `onAnswer(draft.text)`. composer는 덧붙이기·직접 입력 보조. 1단만 골라 저장 불가한 질문은 버튼 비활성(customer 필터, offer 형태). 후행 구분자·`○○` 잔존 시 비활성 | 문자열 1개. 서버 `:115 trim`. 배열 금지(`:92`) | 수정 seed: `answerText`(`BusinessIntake.tsx:322`) 문자열을 `" / "`→`", "`로 나눠 **옵션 라벨과 정확 일치하는 조각만 selected**, 나머지 text | 단계별 6~8개, 순차 노출 |
| **number_quick** (kind number) | 프리셋 칩 즉시 전송 + **가변 step 스테퍼**(<10 ±1, <100 ±10, <1,000 ±100, 그 이상 ±500; 시간류 ±5) + 개방 상단만 키패드. '직접 입력(키패드)'는 스테퍼와 중복이라 두지 않음 | `"${n}${unit}"` 문자열 → `:112` → number. 콤마 제거 | 요약 `:60`은 `String(value)`만 → **BusinessSummary(`IntakePanels.tsx:188-192`)에서 unit·period 부착** ('30건 / 시간'). 말풍선은 quote '30건' | 프리셋 6~7 + 스테퍼 = 8 |
| **range_chips_with_exact** (kind number, unit 원) | 1단 범위 칩(오름차순, 양 경계에 '원') → 2단 **'하한 / 상한 / 정확히 입력'**. 키패드 기본 단위 **만원**('원 단위' 토글). 개방 상단은 로그 칩(1억/1.5억/2억/3억…) 또는 즉시 키패드. '0원' 칩만 1단 즉시 전송 | '300만원' / '3,250,000원' / '0원' → `coachAmount`(`coach-feasibility.ts:13-14`, `:112`) → coach.fields '3000000원'(`:151`) | quote '300만원' → 말풍선 자연. 요약·BusinessBrief·business-launch는 '3000000원' 원문 → **클라이언트 천 단위 포맷**(`Intl.NumberFormat ko-KR`) 권장 | 1단 6~7 + 미정 |
| **period_presets** (kind text, id period) — 이미 구현 | 프리셋 → `periodPresetRange`(`model.ts:226-232`) → `"YYYY-MM-DD / YYYY-MM-DD"` 즉시 전송; '직접 선택' → date 2개 + '이 기간으로 저장'(`IntakePanels.tsx:79-85`) | 서버 `:93-101` 정규화. 소비자 파싱 없음(`intake-context.ts:43-44`) | 말풍선은 절대 날짜만(프리셋 이름 역산 불가) | 프리셋 6 + 직접 선택 + 미정 = 8 |
| **prefill_chips** (business 전용) | 탭 → composer에 프리필(저장 아님). 사용자가 전송 | text 경로(`:361`) | — | 6~8개 |

값 형식 정책(참고 지도 1 §6 준수):
- **내부 id 유지**: industry(sector id — `:103,:153`, `intake-questions.ts:197`, `intake-context.ts:39`), interest(sector id[] — `:107`, 태그 매칭 `:207-208`), candidate(idea id — `:157`), period(정규형 문자열).
- **coachAmount 통과 문자열**: price, budget, cost(+sales는 서버 검증만) — `coach.ts:92`, `coach-feasibility.ts:29`, `executive-summary.ts:54-55`, `proposal-business.ts:18`, `ExpertEditor.tsx:20`.
- **라벨 문자열**: customer, offer, problem, channel, capacity, goal, experience, 모든 상세 text/multi/single(신규) — 숫자 파서 없음.
- 금액이 들어가는 라벨은 각 경계에 '원'(`document-quality.ts:7-21`은 '원' 접미 수치만 허용 목록에 넣음; '10만~50만원'은 50만원만 등록).

---

## 3. 질문별 표

표기: **현재** = 작업 트리 kind. **컨트롤** = §2 카탈로그. **검토→반영** = ok=false 지적과 처리(✔ 반영 / ⏸ 보류 §4).

### 3.1 exploring (11) — `intake-questions.ts:43-50`

| id | 현재 | 컨트롤 | 선택지(요약) | 값 매핑 | 검토→반영 |
|---|---|---|---|---|---|
| interest 관심 분야 | multi, value=sector id | multi_chips | 11업종 라벨 + 미정 | **변경 없음**(id 배열). 표시는 `intakeValueLabel`(:60,:182) — 작업 트리에 이미 반영 | 하위: 설계의 '고칠 것' 3곳은 이미 수정됨 ✔ 기준선 정리. 인라인 '선택 완료' 버튼 이름 ≠ '답변 저장'(`browser.mts:66` strict) ✔ |
| experience 경험 | text | hybrid_text_chips(다중) | 12칩: 문서·사무·기획 / 개발·코딩·자동화 / 요리·카페·베이킹 / 판매·유통·상품 소싱 / 제조·공예·설계 / 교육·강의·코칭 / **청소·수납·방문 서비스** / 공간 운영·모임 진행 / 운전·배송·물류 / 사진·영상·글쓰기·디자인 / 영업·마케팅·고객 응대 / 미용·뷔티·건강·운동. 직접 입력·미정은 하단 줄 | text 유지. 라벨 `", "` join → coach.fields.experience(:151). interest 업종 대응 칩을 상단 정렬(클라이언트) | 하위(ok=false): '청소·**정리**·방문 서비스'가 b2b tags '정리'(`intake-questions.ts:159`)와 충돌해 실측 1위 b2b_service(이진 matches :215 + 카탈로그 순 :216) → **'청소·수납·방문 서비스'** 로 교체('수납'은 local tags :165에 있음) ✔. 칩별 1위 sector 단언 테스트 추가 ✔. 커버리지(ok=false): 영업·마케팅, 미용·뷔티, 전문 자격, 농업·반려동물 공백 → 영업·미용 2칩 추가, 전문 자격·농업은 직접 입력(12칩 상한) ✔ 부분; `CANDIDATE_IDEAS.tags`에 '영업','마케팅','미용','뷰티','운동' 추가 ✔ |
| hoursPerWeek | number 시간/주 | number_quick | 5 / 10 / 20 / 30 / 40 / 60시간 이상 + ±5 스테퍼 | '10시간' → `:112` → 10 → '10시간'(:151). ≤168 UI 차단(:113). 라벨 '40시간 (전업)' 같은 문구는 전송 금지 | 하위 ✔(라벨/값 분리). 커버리지: 60시간 칩 추가, ±5 step ✔ |
| budget 준비 예산 | number 원 | range_chips_with_exact | 0원 / 100만원 미만 / 100만원~300만원 / 300만원~1,000만원 / 1,000만원~3,000만원 / 3,000만원~1억원 / 1억원 이상 → 2단 하한/상한/정확 | '2,000,000원' → coachAmount → '2000000원'. 0원 즉시 | 커버리지(ok=false): 상단 구간 부족(반도체 부품·공유오피스·이사) → v1 `questions.ts:53,457` 어휘로 7구간 ✔. 대표값이 사용자 진술로 굳는 문제 → 대표값 제거, 하한/상한/정확 ✔. 개방 상단 대표값 미정 → 키패드 시작값 하한 ✔ |
| candidate 사업 후보 | single(동적) | single_chips | 후보 카드 3장(제목+한 줄; reasons·cautions는 '확인할 점' 접기) + '직접 생각한 사업' 토글 | 변경 없음(idea id, `:156-162`) | 커버리지(ok=false): `CANDIDATE_IDEAS` 업종당 1개·총 11개(`:158-170`)라 네일샵·이사·촬영 스튜디오·퀵·부품 제조가 카드에 없음 → **업종당 2~3개(25~30개)로 확장**, 정렬 1차 키 'interest sector 일치' 추가(`:216`) ✔(데이터 작업, Phase 1). 요약 패널 후보 id 노출(`intake-core.ts:58` 제외 → `IntakePanels.tsx:192 answerText`) → candidateIdeas title로 표시 ✔ |
| customer | text | hybrid_text_chips(≤2) | 업종 6 + 직접 입력 + 미정(부록 A). 1단 개인/사업자 필터는 저장 안 함 | text + options 주입(`intakeQuestions` :37 패턴, sector 기준). `", "` join | 하위: `descriptionSector`(`model.ts:55-64`)는 클라이언트 파일이라 lib에서 참조 불가 → **lib/plan-builder로 이동**(model.ts re-export) ✔. `getIntakeQuestion` 폴백(`BusinessIntake.tsx:316,:335`)은 options 없음 → 수정 화면 칩 부재(드묾) ⏸ 기록. 커버리지(ok=false): 괄호 라벨이 공개 문구(`from-plan.ts:62`, `business-launch.ts:52`) → 명사구 라벨 ✔; 생활 서비스 세트에 '외모·건강 관리를 원하는 직장인·학생' 추가 ✔; '특정 연령대 2단계' 삭제 ✔ |
| problem | text | hybrid_text_chips(≤2) | 업종 6 + 직접 입력 + 미정(11세트 전부, 부록 A) | 문장형 라벨, `", "` join | 커버리지(ok=false): 3세트만 초안 → 11세트 완성 ✔; B2B 업종 폴백 세트 ✔; 단일 즉시 전송 → 2개 다중 + '이대로 저장' ✔ |
| offer | text | hybrid_text_chips + 상품명 덧붙이기 | 업종 유형 6(부록 A) | 유형 칩 → composer 프리필 → 이름 덧붙이기(선택) → 저장. '유형: 이름' 또는 유형만 | 커버리지(ok=false): 유형 칩만 저장 시 홈페이지 제목(`from-plan.ts:61,:101,:147`) 품질 저하 → 2단 구조 ✔; 8세트 비어 있음 → 부록 A ✔. 하위: suggestedIntakeIndustry 이득 주장은 exploring에 industry 질문이 없어 무관 ✔ 삭제 |
| channel | text | hybrid_text_chips(≤3) | 공통 6(매장 방문 / 인스타그램·SNS / 네이버 검색·플레이스 / 유튜브·숏폼 / 지역 커뮤니티·당근·맘카페 / 지인·입소문) + 업종 슬롯 2(부록 A) | `", "` join | 커버리지(ok=false): 매장 방문·유튜브 누락 → 공통 재편 ✔; 3개 초과 시 나머지 비활성 + '선택 완료(2/3)' 카운터 ✔. 하위: 라벨 ≤20자 ✔ |
| price 판매 가격 | **text**(unit 원, period 판매 1건) | range_chips_with_exact | 업종별 5~6구간(부록 B) → 하한/상한/정확. **무료 칩 없음** | **kind number로 변경**. '12,000원' → coachAmount → 12000 → coach.fields '12000원'(:151). 질문 문구 '판매 기준도 함께' 삭제(`:31`) | 하위(ok=false): 깨지는 테스트 확정 — `core.test:87` sample '12000원/회'(33개 매트릭스 전체), `:408-409`, **`:414-416`**(설계 누락), `browser.mts:43` ✔ §6. 레거시 산문 price는 수정 seed(`BusinessIntake.tsx:323`)가 '대표 메뉴 1개 7500'을 시드해 재전송 불가 → **coachAmount 불통과면 빈 값 시드 + 원문 힌트** ✔. '무료→0원' 제거 ✔. 커버리지(ok=false): 판매 기준(월 구독·시간당·1박) 소실 → ⏸ §4-1 |
| goal 목표 | text | hybrid 2화면 | 기간(3개월/6개월/1년/미정) → 지표 8(첫 유료 고객·첫 판매 / 매장·공간 오픈 / 시제품·서비스 첫 출시 / 월 매출 N원 / 월 주문·계약 N건 / 손익분기 도달 / 본업 병행 부수입 / 전업 전환) → 수치(선택) | '6개월 안에 월 매출 300만원' 조립. 단계 선택은 `AnswerDraft.selected`에 인코딩, 전송 직전 문장화. 금액은 '원' 접미 | 커버리지(ok=false): 오픈·출시·지원사업 목표 누락 → 지표 8 ✔; 금액 칩에 3,000만원·정확 입력 ✔; 기간 미정 시 목표만 저장 규칙 ✔ |

순서 조정(선택, `questions.test:14` 갱신): interest → experience → candidate → customer → offer → problem → channel → price → hoursPerWeek → budget → goal. 근거: 후보 정렬은 interest/experience만 사용(`:206-209`), candidate가 sector를 확정(`:160`)한 뒤 업종 칩이 정확해진다.

### 3.2 startup (11) — `intake-questions.ts:51`

| id | 현재 | 컨트롤 | 선택지(요약) | 값 매핑 | 검토→반영 |
|---|---|---|---|---|---|
| industry | single | single_chips | 11업종 + **칩별 예시 업태 보조 텍스트**(생활·지역 — 청소·미용·네일·이사·수리 / 카페·음식점 — 카페·식당·반찬·베이커리 / 공간·숙박 — 공유오피스·스튜디오·파티룸 / 물류 — 퀵·용달·이사·정기 납품 / 새로운 사업 — 위에 없으면 여기). 추천 접힘 유지 | 변경 없음(sector id, `:153-154`) | 커버리지(ok=false): 클릭 진입은 추천 없음(`model.ts:66-72`는 business/offer만) + 12개 첫 화면 + 오분류가 후속 6질문에 증폭 → 예시 업태 텍스트(2열 유지 소형 클래스), 후속 화면 '업종 바꾸기' 링크(industry 재답변은 sector만 바꿈 `:152-155`) ✔. `inferProposalSector`/`descriptionSector` 키워드 보강(네일·미용실·이사·퀵·용달·반찬·도시락·공유오피스 무공백·과외·학원) ✔ Phase 1. 3그룹 접기 ⏸ 후속 검토 |
| business | text | **typed_exception** + prefill_chips | 업종별 업태 명사 6~8(생활·지역: 네일·미용 / 청소 / 이사 / 수리·설치 / 세탁 / 반려동물 돌봄 / 꽃집; 물류: 퀵 / 용달·이사 / 정기 납품 / 출고 대행; 카페·음식점: 카페 / 식당 / 반찬·도시락 / 베이커리·디저트 / 배달 전문; 공간: 공유오피스 / 스터디룸 / 촬영 스튜디오 / 파티룸 / 숙박; 제조: 부품·소재 / 생활 소품·굿즈 / 식품·화장품 / 가구·인테리어 …) | 칩 → composer 프리필(저장 아님) → '답변 저장'. text 경로(`:361`) → `setField` 부수효과(`:119-127`) | 하위: 즉시 저장 시 템플릿 문장이 ideaOrigin(:126)·name(:125)·plan.title·홈페이지 상호로 굳음 → **프리필로 변경**(사용자가 전송) ✔. `ui.test:205`(<button> 1개) 갱신 ✔. 커버리지(ok=false): 문장 3개가 표본 절반 미커버 → 업태 명사 칩 ✔ |
| customer | text | hybrid(≤2) | §1.3 통일 | 동일 | 하위(ok=false): 다중 선택 커밋 경로 부재(`IntakePanels.tsx:44,:95`, `BusinessIntake.tsx:345,:363,:443`) → `draft.text` join 방식 ✔. 커버리지(ok=false): 1단 중복 노출('개인 소비자, 인근 직장인') → 1단 필터화 ✔; 세트 보정(공간 '1인 창업자·소규모 팀', 물류 '이사·입주 가구') ✔ |
| problem | text | hybrid(≤2) | 업종 6(부록 A) | 동일 | 커버리지(ok=false): 카페 '매일 식사·반찬 준비가 부담된다', 생활 '원하는 스타일·결과를 맞춰 주는 곳이 없다', 공간 '장기 계약 부담', 물류 '이사·큰 짐' 추가 ✔; 즉시 저장 대신 프리필로 보충 허용 ✔ |
| offer | text | hybrid + 덧붙이기 | 업종 유형 6 | 동일 | 커버리지(ok=false): 생활 '미용·네일·케어'(방문 삭제), 물류 '이사·용달', 카페 '반찬·도시락·밀키트', 제조 '부품·소재(산업용)' ✔; 키워드 주장 삭제 ✔ |
| channel | text | hybrid(≤3) | 공통 6 + 업종 2 | 동일 | 커버리지(ok=false): 상·하위 중복(오픈마켓 vs 크몽) → 업종 칩이 공통 칩 대체 ✔; '화상 수업' 제거 ✔; 이사·부품 제조 슬롯 보정 ✔ |
| price | text | range_chips_with_exact | 부록 B | kind number | 하위(ok=false): '0원(무료)' 제거 ✔; 테스트 갱신 ✔; 레거시 seed ✔. 커버리지(ok=false): 판매 기준 고정 ⏸ §4-1; 2단 대표값 → 하한/상한/정확 ✔; 물류 300,000원 이상 구간 추가 ✔ |
| budget | number | range | 공통 7(§3.1) + 업종 상향(카페·공간·제조·**물류·생활**: '100만원 미만' 제거, '3,000만원~1억원 / 1억원 이상') | 동일 | 커버리지(ok=false): 개방 구간·업종 누락·대표값 ✔ |
| hoursPerWeek | number | number_quick | §3.1 | 동일 | ok |
| capacity | text | hybrid 2단 | 1단 인력 5(대표자 혼자 / 동업자·가족 / 직원·아르바이트 1~2명 / 프리랜서·외주 / 필요할 때 일용·외주) → 2단 처리량: 단위 칩(건/개/명/좌석·룸/회) + 프리셋(1/3/5/10/20/50/100/300/1,000) + 가변 스테퍼 | '대표자 혼자 / 하루 20건' → coach.fields.capacity(파서 없음, 지도 1 §3.9) | 커버리지(ok=false): 직원·동업자 누락, 물류 '차량 대수' 축 혼선, 제조 개방 구간, 공간 좌석 → 처리량 축 통일 ✔. 하이라이트 정규식(`coach-presentation.ts:13`)에 팀·석·대 없음 → 표시 개선 항목으로 기록 |
| goal | text | hybrid 2화면 | §3.1 + '재구매·재계약 고객' / 월 매출 칩 업종별(카페·공간·제조·물류: 500만/1,000만/3,000만/1억) | 동일 | 커버리지(ok=false): '첫 판매·오픈' 추가, 3,000만원 ✔ |

순서 조정(선택, `questions.test:15`): industry → business → customer → problem → offer → price → channel → capacity → hoursPerWeek → budget → goal.

### 3.3 operating (11) — `intake-questions.ts:52-64`

| id | 현재 | 컨트롤 | 선택지(요약) | 값 매핑 | 검토→반영 |
|---|---|---|---|---|---|
| industry | single | single_chips | §3.2와 동일 | 변경 없음 | 하위: '1번 시점에 추천이 절대 없다'는 절반만 맞음 — 타이핑 진입은 `typedEntryCommand`로 business 선저장(`browser.mts:230→253` 고정). 근거를 '버튼 진입 경로에서 추천 없음'으로 수정 ✔. 커버리지(ok=false): 정규식이 네일샵·이사·반찬·공유오피스 미포착 → 키워드 보강 + 추천 null 시 '가까운 업종 2~3개 위 + 다른 업종 보기' 접기 ✔ Phase 1 |
| business | text | **typed_exception** + prefill_chips | 문장 시작 칩 8(정규식 어휘 포함): '○○ 카페를 운영합니다' / '○○ 지역에서 ○○ 방문 서비스를 합니다' / '○○를 온라인 판매(스마트스토어)합니다' / '기업 서비스로 ○○ 대행을 합니다' / '○○ 교육·수업을 합니다' / '○○ 부품·제품을 제조해 납품합니다' / '○○ 공간 대여·숙박을 운영합니다' / '○○ 앱·소프트웨어를 운영합니다' | 프리필 → 사용자 전송. **`○○` 잔존 시 전송 비활성**(`BusinessIntake.tsx:443` 조건 추가) | 하위(ok=false): `ui.test:205`가 렌더하는 채팅 질문은 business(`:195`) → 칩 추가 시 파손, 갱신 ✔; `○○` 그대로 저장 시 상호(:125)·plan.title(`model.ts:173`)·홈페이지 오염 → 차단 ✔; 예문이 정규식 미매치(`proposal-blueprint.ts:136` '온라인 판매' 연속) → 어휘 재작성 ✔. 커버리지(ok=false): sectorAware 모순(business가 1번이면 sector=general) → sectorAware false, 업종 예문은 수정 시에만 ✔ |
| customer | text | hybrid(≤2) | §1.3 | 동일 | 하위(ok=false): `AnswerDraft.custom` 재사용 시 `settleDraft`(`model.ts:128`)·409 복구(`BusinessIntake.tsx:263`)가 키를 'candidate'로 바꿔 초안 영구 잔존('입력 중 · 이 기기에 보관' 고정) → **`custom && questionId === "candidate"`로 수정, 하이브리드는 custom 미사용** ✔; '둘 다' 단독 저장 차단 ✔; `", "` 분리 복원 ✔. 커버리지(ok=false): general 2단 재질문 → 1단 + 연령 칩 + 직접 입력 강조 ✔ |
| offer | text | hybrid + 덧붙이기 | 11세트(부록 A) | 후행 ' — ' strip, 1단 형태 저장 금지 | 하위(ok=false): '커피·음료 —' 저장·'서비스 제공' 제목 → 차단 규칙 ✔. 커버리지(ok=false): 3세트만 정의, §7 가격 단위를 offer로 오인 → 11세트 ✔ |
| problem | text | hybrid(≤2) | 공통 6(매출 정체·감소 / 신규 고객 부족 / 재방문·재구매 낮음 / 비용·원가 부담 / 인력·내 시간 부족 / 운영·홍보 방식 비효율) + 2단 업종 문제 칩(software 유료 전환·해지 / b2b·제조·물류 거래처 의존·미수금·납기 / space 공실·비수기 / food·retail 피크·폐기·수수료 / local 노쇼·이동시간 / education 이탈·정원 미달 / content 수정 과다·단가 하락) | '신규 고객이 부족하다 (특히 비수기 공실)' 괄호 보충 | 커버리지(ok=false): risks는 계약 항목이라 misfit, 10개 초과 → 6 + 업종 문제 칩 재정의 ✔ |
| period | text | period_presets(구현됨, 조정) | **지난달 / 최근 3개월 / 최근 6개월 / 최근 12개월 / 올해 / 작년** + 직접 선택 + 미정 = 8. 현재 `PERIOD_PRESETS`(`model.ts:212-218`)는 최근 1/3/6/12개월(오늘 종료)·올해 → 완료 월 기준·'작년' 추가·'최근 1개월' 제거로 조정. 오늘 날짜는 `Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'})` | `"YYYY-MM-DD / YYYY-MM-DD"`(`:93-101`). 소비자 무변경 | 하위: `ui.test:205`는 business 질문이라 period와 무관 ✔; 깨지는 것은 `browser.mts:43`(`#intake-answer-period` fill)·`:66` → 프리셋 클릭으로 갱신 ✔; 말풍선 프리셋 이름 역산 불가 → 절대 날짜만 ✔; 수정 seed는 `/\d{4}-\d{2}-\d{2}/g` 2개를 date input 초기값으로 ✔. 커버리지(ok=false): 9개·'이번 달' 부분 월·작년 누락 → 위 6 프리셋 ✔ |
| sales | number 원 | range_chips_with_exact | **월 기준 6구간**(100만 미만 / 100~300만 / 300~1,000만 / 1,000~3,000만 / 3,000만~1억 / 1억 이상) × period 개월수 n으로 라벨 동적 표시('최근 12개월: 1,200만원~3,600만원'). 상단 로그 칩(1억/1.5억/2억/3억/5억/10억). '매출 없음(0원)'은 최하 구간 2단으로 | **라벨 문자열 전송**('400만원' — raw number 전송 시 말풍선 '현재 매출: 4000000' `:149,:183`) → coachAmount → '4000000원' | 하위 ✔(문자열 전송). 커버리지(ok=false): 기간 비스케일링·개방 상단·9개·원 단위 키패드 → 위 ✔ |
| cost | number 원/월 | range | 6구간 오름차순(50만 미만 / 50~150만 / 150~400만 / 400~1,000만 / 1,000~3,000만 / 3,000만 이상) + 로그 칩 + 만원 키패드. 도움말 체크리스트(`questions.ts:514` 어휘)는 표시만 | '150만원' 전송 → '1500000원'(:151). prompt에 '월 고정비'·'건당 변동비…구분' 어휘 유지(`questions.test:94-95`) | 하위 ✔. 커버리지(ok=false): 비단조 순서 금지 ✔; 체크 항목 미저장 → ⏸ §4-3 |
| capacity | text | hybrid 2단 | §3.2 통일(인력 5 → 단위 칩 → 프리셋+가변 스테퍼) | 동일 | 커버리지(ok=false): 업종별 단위 어긋남·교육 2숫자·스테퍼 ±1·일용 인력 누락 → 단위 칩 선택, 교육은 '회당 정원'만, 프리셋+±10 ✔ |
| channel | text | hybrid(≤3) | 공통 6 + 업종 2(부록 A) | 동일 | 커버리지(ok=false): 10개, 지역 커뮤니티·직접 영업 누락 → 공통 재편 ✔ |
| goal | text | hybrid 2화면 | 기간 3 → 지표 8(월 매출 올리기 / 신규 고객·거래처 늘리기 / 재방문·재구매 늘리기 / 월 비용 줄이기 / 손익분기 넘기기 / 가동률·공실 개선 / 내 노동시간 줄이기·인력 보강 / 새 상품·채널 시작) → 수치('~까지 / ~만큼 더' 토글, 명/곳 자동) | 조립, 원 접미 | 커버리지(ok=false): 방향 모호·지표 누락·B2B 단위 ✔ |

순서 조정(권장, `questions.test:16` 갱신): **business → industry** → customer → offer → channel → problem → period → sales → cost → capacity → goal. business를 먼저 받으면 `suggestedIntakeIndustry`가 동작해 industry가 1탭으로 끝난다. period→sales 연속 유지.

후속 제안(이 문서 범위 밖): operating에 price·unitCost 선택 질문 추가 없이는 `coachFinancialReference` 안내문(`coach.ts:95`)이 진단만으로 사라지지 않는다(지도 1 §0-4).

### 3.4 details-A: b2b_service · software · content_media · education (16) — `intake-questions.ts:70-79, :100-103, :124-127`

| id | 현재 | 컨트롤 | 선택지(요약) | 값 매핑 | 검토→반영 |
|---|---|---|---|---|---|
| b2b.decisionMaker | text | hybrid 2단 | 1단 결정자 7(대표·오너 / 부서장·팀장 / 실무 담당자 본인 / 구매·총무 / 여러 사람 협의 / 외부 대행사 / **공공기관·기관 담당자**) → 2단 사용자 5 + **'아직 모름·해당 없음(1단만 저장)'** | `'결정: 대표·오너 직접 / 사용: 담당 실무자 1~2명'` | 하위: options 원소에 단계 `group` 필드 필요(`intake-questions.ts:11` 카탈로그 전용) ✔; directAnswer 보정 불필요(text면 '답변 저장' 라벨 유지) ✔ 정정. 커버리지(ok=false): 2단 미정이 질문 전체 null(`:94→:148-150`) → 단계 건너뛰기 칩 ✔; '실무 담당자 본인' 선택 시 2단 자동 축약 ✔ |
| b2b.deliverables | text | hybrid 2단 | 1단 납품물 8(보고서·분석 / 절차서·매뉴얼 / **개발·시스템 구축** / **시공·설치·현장 작업** / 교육·인수인계 / **정기 운영·신고 대행** / 디자인·제작물 / 직접 입력) → 2단 완료 기준 5(+**'월 정산·리포트로 확인'**) | `'납품: A, B / 완료 기준: C'` | 커버리지(ok=false): `model.ts:59`가 웹·앱 제작 대행을 b2b로 보내는데 칩 없음 등 → 재편 ✔ |
| b2b.deliveryDays | **number 일**(b2b 유일 unit+period → kind 유지, `questions.test:62`) | number_quick | **당일~3일(3)** / 1주(7) / 2주(14) / 1개월(30) / 2개월(60) / 3개월(90) / 3개월 이상→키패드 | '14일' → 14 | 하위: raw number면 말풍선 '14' → 문자열 ✔; 요약 단위 부착 ✔. 커버리지(ok=false): 하한 7일 → 3일 칩 ✔; 정기 계약 '건별 기간 없음' ⏸ §4-2 |
| b2b.paymentTerms | text | hybrid 2단 | 1단 8(착수금+잔금(비율 선택) / 전액 선결제 / 완료·검수 후 일괄 / 월 정산 / **플랫폼 정산(크몽·숨고)** / **세금계산서 발행 후 30일 내** / **단계별 분할(3회 이상)** / 직접 입력) → 2단 추가 요청 4 | 라벨 '50%'는 `document-quality.ts:9`가 source로 등록 → 유지 | 커버리지(ok=false) ✔ |
| software.workflow | text | hybrid + 보충 | 사용자 관점 8(자료 올리기·연동 / 만들기 / 자동화 규칙 / 예약·주문·결제 / 기록·관리 / 찾기·비교·매칭 / 분석·리포트 / 알림·메시지), ≤2 | `'예약·주문·결제하기 / 카톡 주문 정리'`(보충은 마지막 조각) | 하위: 구분자 ' — ' → `" / "` 통일 ✔. 커버리지(ok=false): 9개·관점 혼재·매칭·게임 누락 → 재편 ✔ |
| software.releaseStatus | single(id) | single_chips | 변경 없음 | id 유지. **`intake-context.ts:29-31`에 옵션 라벨 매핑**(detailQuestions options → `optionLabels` Map; value·valueWithUnit 모두 라벨), `artifact-update-source.ts:22` 동일 | 하위(ok=false): 순서 변경 시 `ui.test:200`(`detailQuestions("software")[1]`)·`questions.test:166-168`(options![0] → TypeError) 인덱스 → find로 갱신 ✔. 커버리지: (A) 적용 시 value도 라벨 치환 ✔ |
| software.billingUnit | text | hybrid 2단 | 1단 8(사용자 1인당 / 팀·워크스페이스당 / **매장·지점당** / 사용량 / 거래액 비율(중개) / 광고(사용자 무료) / 1회 구매 / 직접 입력) → 2단 주기 4 + **'무료 플랜 있음' 토글** | `'사용자 1인당 / 월마다 / 무료 플랜 있음'` | 커버리지(ok=false) ✔ |
| software.supportMinutes | number 분 | number_quick | 0(셀프) / 15 / 30 / 60 / 120 즉시 + 반나절 이상→키패드 | '60분' → 60; 0은 명시값(`core.test:223-231`) | 커버리지: 매 칩 키패드 → 즉시 전송 ✔ |
| content.format | text | hybrid 2단 | 1단 8(사진 / 숏폼 / 롱폼·다큐 / 일러스트·웹툰·캐릭터 / 디자인(썸네일·배너·3D·모션) / 글·카피·블로그 / 음성·음악·팟캐스트 / 라이브) → 2단 사용처 8(+**'내 채널에 직접 게재'**, **'해당 없음'**) | `'형식: A, B / 사용처: C'` | 커버리지(ok=false) ✔ |
| content.revisionRounds | number 회 → **text + options** | hybrid(단일) | 0회 / 1회 / 2회 / 3회 / 5회 / **무제한** / 직접 입력(→`'7회'`) | 문자열 '2회'·'무제한'. unit '회'·period 유지(averageTicket text+unit 선례 `:83`; `valueWithUnit` 중복 부착 없음 `intake-context.ts:31`). content_media의 unit+period number는 productionDays가 담당(`:62`) | 커버리지(ok=false): '무제한'을 미정+메모로 우회하면 타이핑 요구·결측 오기록(`intake-context.ts:9`) → kind text+options ✔ |
| content.usageRights | text | hybrid 2단 | 1단 기간 4 + **'아직 정하지 않음(2단만 저장)'** → 2단 8(이용 허락 / **저작권 전부 양도** / 원본·소스 인계 / 광고 집행 포함 / 광고 별도 요금 / 재판매 불가 / 포트폴리오 공개 / **크레딧 표기**) | `'사용 기간: 1년 / 이용 허락, 크레딧 표기'` | 커버리지(ok=false) ✔ |
| content.productionDays | number 일 | number_quick | **당일(1)** / 3일 / 7일 / 14일 / 30일 / 1개월 이상→키패드 | '7일' | 커버리지: 당일 납품 3으로 왜곡 → 1일 칩 ✔ |
| education.learningOutcome | text | hybrid + 보충 | 8(시험·자격 대비 / 학교 성적·입시 준비 / 언어 회화·의사소통 / 스스로 할 수 있는 기술 습득 / 작품·포트폴리오 완성 / 취업·부업 준비 / 아이 발달·놀이·정서 / 교양·취미·습관) | 상태 서술형 라벨('합격' 표현 회피 — `SECTOR_PROFILES.education.avoid`) | 커버리지(ok=false) ✔ |
| education.classSize | number 명 → **text + options** | hybrid(단일) | 1명(1:1) / 4명 / 8명 / 12명 / 20명 / 30명 이상(→키패드 `'45명'`) / **정원 제한 없음(녹화·자율 수강)** | 문자열. education의 unit+period number는 sessionMinutes(`:62`) | 커버리지(ok=false): 녹화 강의 정원 없음·대형 특강 → text+options ✔ (형식 질문 추가는 id 변경이라 채택하지 않음) |
| education.sessionMinutes | number 분 | number_quick | 25 / 40 / 50 / 60 / 90 / 120 / 180 즉시 + 스테퍼(5분) | '50분' | 커버리지(ok=false): 25·40분(화상영어·초등) 누락 ✔ |
| education.feedback | text → **multi** | multi_chips | 8(과제 첨삭 / 실습 결과물 확인 / 테스트·퀴즈 / 수업 중 관찰·구두 / 학습자 1:1 상담 / **학부모 상담·리포트** / **출석·진도 확인** / 별도 피드백 없음(배타)) | value=라벨 배열(`:106-109`). '선택 완료' 인라인 버튼 | 하위(ok=false): `artifact-update-source.ts:22` JSON.stringify → join ✔; 레거시 문자열 seed(`BusinessIntake.tsx:324` selected=[원문] → `:107 invalid_option`) → **seed 옵션 필터**(options에 있는 값만 selected, 나머지 text) ✔ |

순서 조정(선택, `questions.test:18-31,:57-58` + 위 인덱스 단언 갱신): software releaseStatus → workflow → billingUnit → supportMinutes; content format → productionDays → revisionRounds → usageRights; education learningOutcome → sessionMinutes → classSize → feedback.

### 3.5 details-B: food_beverage · retail_commerce · manufacturing (12) — `intake-questions.ts:82-97`

| id | 현재 | 컨트롤 | 선택지(요약) | 값 매핑 | 검토→반영 |
|---|---|---|---|---|---|
| food.signatureMenu | text | hybrid 2단 | 1단 유형 8(커피·음료 / 베이커리·디저트 / 식사(한식·양식·아시아) / 분식·간편식·도시락 / **반찬·밀키트** / 주류·안주 / **케이터링·단체·출장** / 직접 입력) → 2단 주문 7(카운터 / 테이블오더·QR·키오스크 / 배달앱 / 사전 주문·예약 / 테이크아웃·픽업 / **택배·정기배송** / 출장·케이터링) | `'베이커리·디저트 / 주문: 카운터, 배달앱'`; 직접 입력은 `'소금빵 / 주문: …'` | 하위(ok=false): 역파서 부재·구분자 규칙 → §2 문법 ✔; 하이브리드 렌더 분기(`IntakePanels.tsx:44,:87`) ✔. 커버리지(ok=false): 반찬·케이터링 누락, 선례는 period 피커(`:76-86`) ✔ |
| food.averageTicket | text(unit 원) | hybrid 범위 + 기록 | 7구간(5,000원 미만 ~ **35,000원~60,000원 / 60,000원 이상**) + '정확한 금액 알아요(기록 있음)' → 인라인 number 필드 | **text 유지**(실제/예상 구분 보존, `core.test:415-417`, `questions.test:100`). 구간 선택 시 자동 `' (예상)'`, 정확값은 `'13,500원 (실제 기록)'`. 양 경계에 '원' | 하위(ok=false): 범위 값 → AI 중간값 인용 시 `unsupported_number`(`section-generator.ts:411-414`) → operating은 키패드 기본, `INTAKE_CONTEXT_RULES`에 '구간은 경계 그대로 인용' 1줄 추가 ✔; 범위 목록은 클라이언트 상수 ✔. 커버리지(ok=false): 상한 35,000원, 근거 태그 모순, inputMode text → 위 ✔. 정확값 필드는 숫자 입력(선택 보조) |
| food.peakOrders | number 건/시간 | number_quick | 5 / 10 / 20 / 30 / 50 / 80 즉시 + ±5 스테퍼 | '30건' → 30(`core.test:207` 선례) | ok. '직접 입력' 제거, 요약 단위 부착 위치 `IntakePanels.tsx:188-192` ✔ |
| food.wasteHandling | text → multi | multi_chips | 8(당일 소진 / 냉장·냉동 기한 표시 / 마감 할인 / 선주문 후 준비 / 소량 자주 발주 / **본사·공급업체 정기 공급** / **장기 보존 재료 위주** / 폐기량 기록) | value=라벨 배열 | 하위(ok=false): 레거시 text seed → 옵션 필터 ✔. 커버리지(ok=false): 술집·가맹점·냉동 누락 ✔ |
| retail.sourcing | text → multi | multi_chips | 8(도매 사입 / 위탁판매 / 제조사·브랜드 직거래 / 해외 직구·구매대행·병행수입 / 자체 제작(디지털 포함) / OEM·ODM / **중고·리셀 매입** / **농·수산물 산지 직거래**) | 배열. minimumOrder 힌트는 `Array.isArray(value)` 가드 | 하위·커버리지(ok=false) ✔ |
| retail.minimumOrder | number 개 | number_quick | 1개(최소 없음) / 10 / 30 / 50 / 100 / 300 + 가변 스테퍼 | '50개' → 50. '1,000개' 콤마 거절(`:112`) → 콤마 제거 | ok |
| retail.fulfillment | text → multi | multi_chips | 8(직접 포장·일반 택배 / **냉장·냉동 택배** / 3PL / 공급사 직배송·배대지 / 플랫폼 물류 입고 / **화물·설치 배송** / 오프라인 판매·픽업 / 디지털 상품) | 배열 | 하위·커버리지(ok=false) ✔ |
| retail.returns | text | hybrid 2단 | 1단 5(7일 / 14일 / 30일 / 단순 변심 불가·불량만 교환 / **판매 플랫폼 기본 정책 따름**) → 2단 3(변심 고객 부담·불량 판매자 / 전액 판매자 / 정액 고객 부담) | `'수령 후 7일 이내 / 배송비: 단순 변심은 고객 부담·불량은 판매자 부담'`. 1단 '불가'·'플랫폼'이면 2단 생략 | 하위(ok=false): 조립 예와 라벨 불일치 → 라벨 그대로 이어 붙이기 ✔. 커버리지(ok=false): '고객 전액 부담' 삭제 ✔ |
| manufacturing.productStage | text → single | single_chips | 8(아이디어·사양 정리 / 설계·도면 완료 / 시제품 제작·시험 / 소량 시험 생산 / 양산 준비(금형·설비 또는 위탁 공장 확정) / 양산·공급 중 / **주문 제작·수주 생산** / **위탁 제조 진행 중(OEM·ODM)**) | value=라벨(id 사용 시 `intake-context.ts:29-31` 노출 회피) | 하위(ok=false): 레거시 seed 필터 ✔. 커버리지(ok=false): 수주형·위탁 제조 ✔ |
| manufacturing.minimumBatch | number 개 | number_quick | 1 / 50 / 100 / 500 / 1,000 / 3,000 / 10,000 + 가변 스테퍼 | '100개' | 커버리지(ok=false): MOQ 수천·±10 ✔ |
| manufacturing.qualityChecks | text | hybrid 2단 | 1단 6(없음(확인 완료) / 확인 중 / 예정 / 진행 중 / **일부 완료·일부 예정** / 모두 완료) → 2단 8(KC 안전·전자파 / 식품·위생(HACCP) / 화장품·건기식 / 의료기기 / **ISO·고객사 품질 승인** / **수출·환경 인증(CE·FCC·RoHS·UL)** / 자체 검사 기준 / 기타) | `'일부 완료·일부 예정 / 종류: KC 안전·전자파, ISO·고객사 승인'` | 하위(ok=false): ' · ' 구분자 충돌 → `" / "` ✔. 커버리지(ok=false) ✔ |
| manufacturing.leadDays | number 일 | number_quick | 3 / 7 / 14 / 30 / 60 / 90 / 180 + 가변 스테퍼(<14 ±1, <60 ±7, 이상 ±30) | '14일'(`core.test:426-427` '3일' 선례) | 커버리지(ok=false): 9개·±1 ✔ |

순서 조정(선택): food signatureMenu → peakOrders → averageTicket → wasteHandling; manufacturing productStage → qualityChecks → minimumBatch → leadDays.

### 3.6 details-C: local_service · space_hospitality · logistics · general (16) — `intake-questions.ts:106-133`

| id | 현재 | 컨트롤 | 선택지(요약) | 값 매핑 | 검토→반영 |
|---|---|---|---|---|---|
| local.serviceArea | text | hybrid + 보조 입력 | **매장·작업장으로 고객이 방문(출장 없음)** / 같은 동·도보권 / 같은 구·시 / 인접 시·군 / 수도권 / 전국 출장 / 직접 입력(지역명) + '온라인·비대면도 가능' 토글 | `'같은 구·시 안 / 온라인·비대면 가능 / 마포구'`. 복원은 칩 라벨 정확 일치 기반 | 하위: 역파싱을 구분자 split 아닌 라벨 정확 일치로 ✔; directAnswer 예외 → §1.3 통일(text 유지, 조립은 draft.text) ✔. 커버리지(ok=false): `proposal-blueprint.ts:138`이 미용·세탁·꽃집을 local로 보내는데 전부 출장 전제 → 매장 방문형 칩 ✔ |
| local.travelMinutes | number 분 | number_quick | **이동 없음(0분)** / 15 / 30 / 45 / 60 / 120 + 스테퍼(±5) | '60분'. serviceArea가 매장 방문형이면 0분 강조 | 하위: 문자열 전송 ✔. 커버리지(ok=false): 0분 누락 ✔ |
| local.responsibility | text → multi | multi_chips 2단 | 포함 6(사전 상담·견적 / 본 작업 / 재료·소모품 포함 / 출장·이동 포함 / 사후 점검·A/S / 잔여물·폐기물 처리) → 제외 5(재료·부품비 별도 / 고가품·귀중품 / 전기·설비·구조 공사 / 보증·A/S 없음 / 제외 항목 없음(배타)) | 배열 하나, '제외: ' 접두 라벨 | 커버리지(ok=false): 정리·수납 어휘 편향 → 업종 중립 ✔. 하위: 배타 규칙 서버 미강제 → 상세 multi에서 `typedChoice` 경로(`BusinessIntake.tsx:362`) 비활성 ✔ |
| local.cancellation | text → multi | multi_chips 2단(각 1개) | 취소 6(전날 무료 / 24시간 전 무료 / 예약금 미환불 / 50% 청구 / 수수료 없음 / **예약제 아님(해당 없음)**) → 노쇼 5(예약금 미환불 / 출장비만 / 50% / 전액 / 무료 재예약) | 배열 2요소. '예약제 아님'이면 2단 생략. '출장비' 칩은 출장형에서만 | 커버리지(ok=false) ✔. '50%' 라벨은 품질검사 source 등록 확인 |
| space.useConditions | text → multi | multi_chips 3단 | 목적 6(복수) → 공간 확보 4(내 소유 / 임차(용도 확인 완료) / 임차(확인 필요) / **전대·재임대**) → 인허가 4(숙박업 신고 완료 / 예정 / **숙박 아님(불필요)** / 미확인; '숙박' 미선택 시 자동) | 배열 ≤12(`intake-service.ts:21`은 전송 배열 길이 제한, 옵션 수 아님 — 정정) | 커버리지(ok=false): 소유·신고 축 혼합, 전대 누락 ✔ |
| space.guestLimit | number 명 | number_quick | **1** / 2 / 4 / 10 / 20 / 50 + 스테퍼 | '8명' | 커버리지(ok=false): 1인·대형 ✔ |
| space.turnoverMinutes | number 분 | number_quick | **정비 없음(0)** / 10 / 20 / 30 / 60 / 90 / 120 + 스테퍼 | '30분' | ok(+0분 칩) |
| space.damagePolicy | text → multi | multi_chips 2단 | 취소 6(7일 전 전액 / 3일 전 전액 / 전날 전액 / **계단식 환불** / 당일 환불 없음 / **플랫폼 정책 따름**) → 파손 5(보증금 / 실비 / 시설 보험 / **플랫폼 보상 제도** / 규정 없음) | 배열 | 커버리지(ok=false) ✔ |
| logistics.route | text | hybrid 2단 + 보조 | 범위 6(같은 구·시 / 수도권 / **고정 장거리 구간** / 전국 / 해외 포함 / **건별로 달라짐(이사·용달)** / **택배망 위탁**) → 방식(정기 / 비정기 / **둘 다**) + 출발→도착(선택) | `'수도권 안 / 정기 / 마포 → 성남'`. 자유입력에 ' / ' 금지 | 하위: 3조각 역파싱 규칙 ✔. 커버리지(ok=false) ✔ |
| logistics.dailyShipments | number 건/일(logistics 유일 → kind 유지) | number_quick(대표치 즉시) | 약 1~3건(2) / 5 / 10 / 20 / 50 / 100 / 200 이상(키패드) | `'20건'` 즉시 전송, 콤마 제거 | 하위(ok=false): '1,000' 콤마 거절 ✔. 커버리지(ok=false): 매 답변 키패드 확정 → 즉시 전송, 라벨 '약' ✔ |
| logistics.cargoConditions | text → multi | multi_chips | 8(소형 택배 / **가구·가전·이사 화물** / **조리 음식·즉시 배달** / 냉장·냉동 / 파손 주의 / 서류·귀중품 / 팔레트·대량 / 특수 조건 없음(배타)) | 배열 | 커버리지(ok=false) ✔ |
| logistics.exceptions | text → multi | multi_chips | 7(지연 사전 안내 / 재배송 1회 무료 / 재배송 추가 요금 / 분실·파손 실비 / 화물 보험 / 화주 협의 / 규정 없음(배타)) | 배열 | ok |
| general.smallestTrial | text | hybrid + 보조 | **이미 제공 중(현재 상품 그대로)**(operating 첫 칩) / 1회 체험 / 소량 판매(1~10개) / 무료 시범 후 유료 / 사전 예약·선주문 / 1:1 맞춤·소규모 모임 1회 / 직접 입력 | `'소량 판매(1~10개) / 손글씨 카드 세트'` | 커버리지(ok=false): 운영 사업자에게 창업 실험 어휘(상세는 mode 무관 `intake-core.ts:35`) ✔ |
| general.resources | text → multi | multi_chips | 8(나 혼자·노트북 / 소프트웨어·온라인 도구 / 작업·판매 공간 / 장비·재료·재고 / 차량 / 협업자 1~2명 / 외주·전문가 / **자격·허가·보험**) | 배열 | 하위(ok=false): **`core.test:530` `answer(f,"general.resources","도구")` 문자열 → `:107 invalid_option`** → 배열 라벨로 갱신 ✔ |
| general.trialDays | number 일 | number_quick | 1 / 3 / 7 / 14 / 30 / 60 + 스테퍼 | '7일'. smallestTrial '이미 제공 중'이면 자동 미정 | ok |
| general.reviewCriteria | text | hybrid(≤3) + 직접 입력 | 6(첫 유료 고객 1명 / **문의가 꾸준히 들어옴** / **유료 고객이 여러 명 생김** / 재구매·재이용 / 소개·추천 / **월 매출 또는 손익 목표 달성**) + 직접 입력 | **(b) 채택**: text 유지, `", "` join + 자유입력 마지막 조각 | 하위(ok=false): multi/text 택일 미결 → (b) ✔. 커버리지(ok=false): 임의 숫자 제거·매출 기준 추가 ✔ |

순서 조정(선택): logistics route → cargoConditions → dailyShipments → exceptions; local serviceArea → responsibility → travelMinutes → cancellation.

---

## 4. ok=false 항목 중 '보류'와 이유

위 표에서 ✔로 표시한 항목은 해결안이 확정됐다. 다음은 **보류**다.

| # | 항목 | 검토 지적 | 보류 이유 | 임시 조치 |
|---|---|---|---|---|
| 4-1 | **price의 판매 기준(개당/회당/월 구독/시간당/1박) 저장** | coach.fields에 period가 없고(`coach.ts:10` CoachField), `artifact-update-source.ts:42`는 hoursPerWeek·minutesPerSale에만 unit/period 부착. SaaS 월 구독·스튜디오 시간당·공유오피스 월 멤버십이 모두 '판매 1건 12000원'으로 AI(`coach.ts:116` 건당 정의)에 전달 | 저장 슬롯이 없다. 대안 (a) offer 값 뒤에 ' · 월 멤버십' 접미 — offer는 홈페이지 제목(`from-plan.ts:61`)이라 오염, (b) 새 CoachField `priceBasis` — **스키마 변경**, (c) 자유 메모 자동 저장 — 필드 오염 검증 필요. 셋 다 이 문서 범위에서 확정할 근거가 부족 | `intakeQuestions` 주입 단계에서 **sector별 `price.period`를 바꿔**(software '월 구독 1건', education '수업 1회', b2b '프로젝트 1건', content '납품물 1개', space는 1단 기준 칩 선택값) 질문 문구·컨텍스트 줄(`BusinessIntake.tsx:436`)·업종별 범위 세트에 반영. 저장은 안 되지만 사용자가 기준을 혼동하지 않는다. `questions.test:98`은 startup price만 단언하므로 안전. 결정은 후속 |
| 4-2 | **b2b.deliveryDays '정기 계약(건별 기간 없음)'** | 월 정액 대행·상주는 기간 개념이 없어 미정으로만 답함(미정=결측, `intake-context.ts:9`) | deliveryDays는 b2b_service의 **유일한 unit+period number**(`questions.test:62`)라 text로 바꿀 수 없고, 질문 추가는 id 목록(`:18-31,:57-58`) 변경 | paymentTerms '월 정산' 칩 선택 시 deliveryDays 도움말 '정기 계약이면 미정으로 두세요'. 후속: 질문 세트 재편 시 함께 검토 |
| 4-3 | **cost 체크리스트(포함 항목) 저장** | number kind라 값에 넣을 수 없고 quote는 원문(`:149`) | 자유 메모 자동 저장(`intake-service.ts` message 액션)은 `parseIntakeNote` 후보 생성 경로가 필드를 오염시킬 수 있어 검증 필요 | 도움말 체크리스트는 표시만. 후속 검토 |
| 4-4 | **industry 11개 3그룹 접기** | 클릭 진입 첫 화면 12개 | 접기 UI는 새 단계를 추가하고, 예시 업태 텍스트·키워드 보강으로 오분류가 충분히 줄어드는지 먼저 확인해야 함 | 예시 업태 보조 텍스트 + 추천 null 시 '가까운 업종 2~3개 위' 접기(§3.3) 먼저 적용 |
| 4-5 | **operating price·unitCost 질문 추가** | cost만 정확해도 `coach.ts:95` 안내문이 진단만으로 안 사라짐 | 핵심 id 순서 테스트 변경·질문 수 증가. 이 문서는 기존 77문항의 컨트롤 전환에 한정 | 후속 pack |
| 4-6 | **`getIntakeQuestion` 폴백 경로의 수정 화면**(`BusinessIntake.tsx:316,:335`) | 폴백 질문은 sector 옵션이 없어 칩 부재 | 폴백은 `intakeQuestions`에 질문이 없을 때만(드묾) | 폴백 시 composer 직접 입력 허용, 기록만 |

---

## 5. 확인된 결함 2개의 수정 위치(작업 트리 기준)

### 5.1 결함 1 — multi 답변 내부값 노출

| 지점 | 상태 | 남은 작업 |
|---|---|---|
| 요약 `intake-core.ts:60` | **반영됨** — `intakeValueLabel(question, answer.value)` | 없음 |
| 말풍선 `intake-core.ts:182-183` | **반영됨** — `selected = intakeValueLabel(...)` | 없음 |
| 후보 카드 사유 `intake-questions.ts:210-213` | **반영됨** — `readable()`이 `idea.sector`를 `SECTOR_PROFILES[...].label`로 치환 | 없음. 테스트 `questions.test:122-123` 갱신됨 |
| 과거 저장된 `coach.messages[].text` | 서버 문자열이 남음 | `ConversationHistory`(`IntakePanels.tsx:98-101` 영역)에서 `answers[*].value`로 라벨 재계산하는 클라이언트 보정(`AnswerHistory :122` 방식) — 선택 |
| 요약 패널의 candidate id(`intake-core.ts:58` 제외 → `IntakePanels.tsx:192 answerText`) | 미반영 | `question.id==="candidate"`면 `snapshot.candidateIdeas.find(...).title` 표시 |
| 상세 single 내부 id 프롬프트 노출(`software.releaseStatus`, `intake-context.ts:29-31`) | 미반영 | `confirmedIntakeContext`(`:40`)에 `optionLabels` Map 추가, value·valueWithUnit 라벨 치환; `artifact-update-source.ts:22` 동일 + 배열 join |
| 재발 방지 | — | 신규 상세 single/multi는 **value=라벨**로 정의 |

### 5.2 결함 2 — period 타이핑

| 지점 | 상태 | 남은 작업 |
|---|---|---|
| `IntakePanels.tsx:76-86` 프리셋 칩 + date 2개 + '이 기간으로 저장' | **반영됨** | 프리셋 조정(§3.3): 완료 월 기준, '작년' 추가, '최근 1개월' 제거, Asia/Seoul |
| `model.ts:212-233 PERIOD_PRESETS / periodPresetRange` | **반영됨** | 위와 동일 |
| 서버 `intake-core.ts:93-101` | 무변경 | — |
| `browser.mts:43`(`#intake-answer-period` fill)·`:66`('답변 저장') | 미갱신 | 프리셋 클릭 경로로 갱신 |
| 수정 모드 seed(`BusinessIntake.tsx:322-324`) | 미반영 | text에서 `/\d{4}-\d{2}-\d{2}/g` 2개를 date input 초기값으로 |
| 말풍선 | 서버 문자열 | 절대 날짜 그대로 두거나 `'2026-06-01 ~ 2026-08-31'` 재표시(프리셋 이름 역산 금지) |

---

## 6. 구현 단계 계획

각 단계는 독립 커밋 가능 단위. 건드리는 파일과 갱신할 테스트 단언을 함께 적었다.

### Phase 0 — 기준선 정렬 (반나절)
- `git diff HEAD -- lib/plan-builder/intake-core.ts lib/plan-builder/intake-questions.ts app/plan/chat/ scripts/business-intake-*.ts*` 로 이미 반영된 결함 1·2 확인. 4개 스위트(`npx tsc --noEmit`, `node --import tsx scripts/business-intake-{core,questions,ui,context}.test.*`) 통과 확인.
- 이 문서의 라인 번호와 어긋나는 곳이 있으면 문서를 갱신(동시 편집 진행 중).

### Phase 1 — 카탈로그·데이터·규칙 (서버 lib, AI 0회)
| 파일 | 변경 |
|---|---|
| `lib/plan-builder/intake-questions.ts` | `IntakeQuestion.options` 원소에 선택적 `group?: string`(단계), 질문에 `hint?: string`(도움말) — 카탈로그 전용, 영속 안 함. price `kind: "number"`(:31). 상세 kind 변경 14건(§1.1). 질문 문구 재작성(테스트 `:94-96` 어휘 유지, 44개 prompt 고유성 `:73`). `CANDIDATE_IDEAS` 업종당 2~3개로 확장 + tags 보강, 정렬 1차 키 interest sector(`:216`) |
| **신규** `lib/plan-builder/intake-options.ts` | 업종별 칩 세트(customer/problem/offer/channel/capacity 단위·프리셋, price/budget/sales/cost 범위 표, business 업태 칩·문장 칩, 상세 칩). 라벨 규칙: `/`·`,` 금지, ≤20자(channel), 금액은 양 경계 '원' |
| `lib/plan-builder/intake-core.ts` | `intakeQuestions`(`:143` 호출, 정의 `:33-38`)에서 candidate options 주입(:37 패턴)과 같은 방식으로 **sector 기준 options·period 주입**(customer/problem/offer/channel/capacity/price). `validatedAnswer` 무변경 |
| `lib/plan-builder/proposal-blueprint.ts:129-140` | `inferProposalSector` 키워드 보강(local: 네일·미용실·헤어·피부·마사지·세차·반려동물 미용·이사; logistics: 퀵·배달 대행·용달·택배; food: 반찬·도시락·밀키트·분식·주점·술집·디저트; space: 공유오피스·스튜디오 대관·파티룸·펜션; education: 과외·학원·레슨) |
| `app/plan/chat/intake-ui/model.ts:55-64 descriptionSector` | **`lib/plan-builder`로 이동**(model.ts는 re-export) — 서버 주입에서 참조 가능하게 |
| `lib/plan-builder/intake-context.ts:29-31,:40` | 상세 single/multi 옵션 라벨 매핑(`optionLabels`), `INTAKE_CONTEXT_RULES`에 '구간 값은 경계 그대로 인용, 중간값 금지' 1줄 |
| `lib/plan-builder/artifact-update-source.ts:22` | `Array.isArray(value) ? value.join(', ')`, 옵션 라벨 매핑 |
| 테스트 | `questions.test`: kind 화이트리스트 `:33` 유지, `:41-46` 옵션 규칙, `:62` unit+period number 존재(revisionRounds·classSize 전환 후 content/education은 productionDays/sessionMinutes로 충족), 순서 변경 시 `:14-16,:18-31,:57-58`, `:166-168` 인덱스→find, **experience 칩별 1위 sector 단언 추가**. `core.test`: `:87` sample price → `'12,000원'`, `:408-409`·`:414-416` → `'7500원'` 정규화 기대, `:530` general.resources → 배열 라벨. `context.test :37,:183` 무변경 확인. `business-source-projection.test:179-184` 무영향 |

### Phase 2 — 클라이언트 컨트롤 (app/plan/chat)
| 파일 | 변경 |
|---|---|
| `app/plan/chat/intake-ui/IntakePanels.tsx` | `:44 choice` 옆에 **hybrid 분기**(`kind==="text" && options?.length`): 단계별 칩(group), 칩 탭 → `onChange({...draft, text: 조립})`, '이대로 저장' 인라인 버튼 → `onAnswer(draft.text)`, 1단 단독·후행 구분자·`○○` 잔존 시 비활성. **multi 폼 안 '선택 완료(N개)' 버튼**(`onAnswer(draft.selected)`). **number_quick / range 컨트롤**(프리셋 칩 즉시 전송 `'${n}${unit}'`, 가변 스테퍼, 만원 키패드). business prefill 칩. industry 칩 보조 텍스트(소형 클래스, 2열 유지). `BusinessSummary`(`:188-192`)에 unit·period 부착, candidate title 표시(`:192`) |
| `app/plan/chat/BusinessIntake.tsx` | `:342-343` — hybrid text 질문은 directAnswer **유지**(composer = 보충·직접 입력, placeholder '직접 적을 때만'); number 질문도 유지(키패드 보조). `:263` 409 복구와 `model.ts:128 settleDraft`의 `custom ? "candidate"` → `custom && questionId === "candidate"`. `:319-324` seed: hybrid는 문자열을 `" / "`→`", "`로 나눠 옵션 라벨 정확 일치 조각만 selected; multi/single은 **options에 있는 값만 selected, 나머지 text**; number는 coachAmount/정규식 불통과 시 빈 값 + 원문 힌트(`:323`); period는 날짜 2개 추출. `:362 typedChoice`는 상세 multi(배타 규칙 있는 질문)에서 비활성. `:443` 전송 비활성 조건 추가 |
| `app/plan/chat/intake-ui/model.ts` | `PERIOD_PRESETS` 조정(§3.3), goal/capacity 단계 인코딩은 `AnswerDraft.selected` 배열 사용(`isAnswer :95-99`, `sameAnswer :116-118` 변경 없음) |
| `app/plan/chat/intake.module.css` | 가로 칩 스타일 신규(`.option`은 세로 카드형 `:67-71`), 스테퍼·키패드 시트, 칩 보조 텍스트 2열 유지, ≤400px 규칙(`:284-285`) 준수 |
| 테스트 | `ui.test:205`(business 채팅 질문 `<button>` 1개) → 'unknownButton 1개 + 프리필 칩 N개'; `:200` software 인덱스; `:187` interest 체크박스 11개 유지; `:192-194` 비채팅 number 인라인 유지; `:203-204` text 질문 textarea·'답변 저장' 없음 유지(인라인 버튼 이름 '이대로 저장'). `browser.mts:41-43` kind별 조작(period 프리셋 클릭, price `'30,000원'`), `:66` exact '답변 저장'은 composer 버튼만 매치되도록 인라인 버튼 이름 상이 확인, `:233-235` typedChoice(industry '소프트웨어') 유지, 뷰포트 오버플로 단언(`:87-105,:128-138`) |

### Phase 3 — 메시지·요약·표시
- `ConversationHistory`(`IntakePanels.tsx:98-101` 영역) 과거 메시지 라벨 재계산(선택), period 절대 날짜 표시.
- coach.fields 금액 표시 포맷(`Intl.NumberFormat`) — `WorkspaceContent.tsx:33-34`, `BusinessBrief.tsx`, `business-launch.ts` 메모는 원문 사용이므로 표시 계층에서만.
- `coach-presentation.ts:13` 하이라이트 단위에 팀·석·대 추가(표시 개선, 선택).

### Phase 4 — 순서 조정(선택, 별도 커밋)
- exploring/startup/operating 순서(§3.1~3.3), 상세 순서(§3.4~3.6). 각각 `questions.test:14-16`, `:18-31,:57-58`, `ui.test:200`, `questions.test:166-168` 갱신.

### Phase 5 — 검증(§8)

---

## 7. 위험과 미결 사항

| 주제 | 판단 |
|---|---|
| **AI 0회 원칙** | 유지. 칩 세트 선택은 `intake.sector`(industry/candidate가 설정 `:153,:160`) → general이면 `descriptionSector`(lib 이동 후) → 그래도 general이면 일반 세트. 후보 정렬·업종 추천 모두 정규식. 어떤 단계에서도 LLM 호출 없음. `answer` 액션은 AI 미사용(`intake-http.ts:78`) |
| **스키마 변경 필요 여부** | **불필요.** `intake-service.ts:21` 명령 스키마, `IntakeValue`(`intake-types.ts:7`), coach.fields 문자열, `intake/details`·`intake/period` 레코드 모두 그대로. 유일한 타입 추가는 카탈로그 전용 `options[].group?`·`question.hint?`(영속 안 함, `copyQuestion :138` spread 보존). 4-1(price 기준 저장)만 스키마 변경 후보로 보류 |
| **마이그레이션** | 저장 데이터 마이그레이션 **없음**. 레거시 값은 클라이언트 seed에서 처리: (a) kind→multi/single 전환 11+1건의 기존 text 답변 → 옵션 필터로 text 보존(미처리 시 `:107 invalid_option` 실패, `BusinessIntake.tsx:345`로 전송 버튼 활성 상태에서 실패 노출), (b) 산문형 price(`createIntake :21-24`가 검증 없이 역수입) → 빈 값 seed + 원문 힌트, (c) 과거 말풍선 문자열은 그대로(선택 보정) |
| **범위 라벨과 문서 품질 검사** | `document-quality.ts:7-21`은 '원' 접미 수치만 허용 목록에 넣고, 구간 입력은 AI 중간값 유도를 늘려 `unsupported_number`(`section-generator.ts:411-414` → `section-service.ts:220` 섹션 실패) 위험. 완화: coach.fields 금액은 정확값만 저장(범위는 UI 사다리), averageTicket만 구간 저장 허용 + 규칙 문구 1줄 |
| **대표값·구간의 진술 신뢰성** | 사용자가 모르는 정확값을 basis user로 굳히지 않도록 원 단위 필드는 하한/상한/정확 3칩(사용자가 아는 값만 저장). 건수 필드 대표치 칩은 라벨 '약'으로 표시 |
| **공개 문구 오염** | customer·offer는 홈페이지(`from-plan.ts:61-62,:101,:147`)·홍보 글(`business-launch.ts:52`)에 원문 삽입 → 1단 필터 값·형태 라벨·후행 구분자·`○○` 전송 차단(클라이언트). 서버는 `:115 trim`만 하므로 차단은 UI 책임 — 미결: 서버 측 2차 방어를 둘지(현재는 두지 않음) |
| **커버리지 의존성** | 업종 인식 칩의 품질은 (1) 업종 추론 정규식 보강, (2) CANDIDATE_IDEAS 확장, (3) 11업종 전부의 칩 세트 정의(부록 A)에 달려 있다. 셋 중 하나라도 빠지면 네일샵·이사·반찬·공유오피스·퀵·부품 제조가 general 세트나 직접 입력으로 떨어져 '클릭 우선'이 형식만 남는다(세 커버리지 검토 공통 결론) |
| **배타·단계 제약의 서버 미강제** | multi 배타('없음' 칩)·단계별 1개 규칙은 서버(`:106-109`)가 검증하지 않음. typedChoice 경로 차단으로 완화. 서버 검증 추가는 미결 |
| **계산 안내문 잔존** | unitCost는 어떤 모드에도 없고 startup/exploring에 cost, operating에 price가 없어 `coach.ts:95` 문장은 진단만으로 사라지지 않는다. price·cost·budget을 파서 호환으로 저장하는 것은 이후 AI 제안·전문가 편집이 나머지를 채울 때 계산이 살아나기 위한 전제 |
| **동시 편집** | 검토 중 intake 파일이 계속 바뀌었다. Phase 0에서 diff 확인 필수 |

---

## 8. 확인 계획

| 축 | 확인 항목 |
|---|---|
| **뷰포트 320 / 390 / 1440** | 가로 스크롤 0(`browser.mts:87-105,:128-138` 기준 320/390/526/768/1440), 각 칩 화면 버튼 ≤8(직접 입력·미정은 하단 줄), 2열 그리드 유지(industry 보조 텍스트가 1열로 바꾸지 않는지), composer가 대화 영역 아래·뷰포트 안, 마지막 답변과 다음 질문 동시 노출. ≤400px 패딩(`intake.module.css:284-285`). 스테퍼·키패드 시트가 44px 탭 타겟 |
| **세 진입 유형** | exploring: interest → experience 칩('청소·수납·방문 서비스' 선택 시 후보 1위 local_service) → candidate 3장 → 업종 칩 세트가 candidate sector로 뜨는지. startup: 클릭 진입 시 industry 예시 업태 텍스트, business 업태 칩 프리필 → 저장 → 6개 업종 칩 정확성, price 범위→하한/상한/정확 → coach.fields '12000원'. operating: business 문장 칩(`○○` 잔존 시 비활성) → industry 추천 1탭 → period 프리셋 → sales 라벨이 개월수로 스케일 → cost → 요약 패널 금액 포맷 |
| **표본 사업 10종** | 네일샵·이사업체·반찬가게·온라인 영어과외·굿즈 스마트스토어·소규모 SaaS·촬영 스튜디오·공유오피스·퀵배송·반도체 부품 제조를 각각 startup으로 입력해 industry 추천(정규식 보강 후) 정확도, 핵심 6질문·상세 4질문에서 '직접 입력' 없이 완주 가능한지 기록 |
| **두 탭 충돌** | 같은 플랜을 두 탭에서 열고 한쪽에서 hybrid 질문 답변 → 다른 쪽 409(`BusinessIntake.tsx:262-265`) → `editingId`가 'candidate'로 잘못 복원되지 않고 해당 questionId로 복원되는지(`custom && questionId==="candidate"` 수정 확인), 초안 상태가 '입력 중 · 이 기기에 보관'으로 고정되지 않는지 |
| **답변 수정** | (a) hybrid 조립 문자열 수정 진입 → 칩 selected 복원 + 보충 text 분리; (b) multi 전환 질문의 레거시 text 답변 수정 → 어떤 칩도 켜지지 않고 text에 원문, 전송 버튼은 옵션 선택 후에만 활성; (c) 산문형 price 수정 → 빈 값 + 원문 힌트, `'12,000원'` 저장 성공; (d) period 수정 → date 2개 초기값; (e) number 수정 → `numericText`(`:323`)가 단위 제거 후 스테퍼 초기값 |
| **저장 형식 회귀** | `coach.fields`: price '12000원', budget '2000000원', hoursPerWeek '10시간', customer/offer/channel/capacity/goal 라벨 문자열. `intake/details`: number value는 JS number + unit/period, multi는 라벨 배열, hybrid는 문자열. `intake/period` 정규형. quote에 단위·콤마 보존. `coachFinancialReference`가 price·cost 정확값 입력 후 unitCost만 남는지 |
| **문서 생성 품질** | 범위 라벨(averageTicket) 입력 후 문서 섹션 생성 시 `unsupported_number` 발생 여부; goal '300만원' 조립 후 AI가 '3,000,000원'을 써도 통과(`document-quality.ts:7-21` 정규화 실측 확인됨) |
| **자동 테스트** | Phase 1·2 테스트 갱신 목록 전부 통과 + `npx tsc --noEmit` |

---

## 부록 A. 업종별 칩 세트(customer · problem · offer · channel 슬롯) — 11업종 전부

표기: [코드] = `questions.ts`·`SECTOR_PROFILES`·`CANDIDATE_IDEAS`·추론 정규식 어휘에서 파생, 그 외는 [제안]. 각 6개(channel은 슬롯 2개). 라벨은 `/`·`,` 없음, 공개 문구용 명사구.

| sector | customer 6 | problem 6(창업) | offer 유형 6 | channel 슬롯 2 |
|---|---|---|---|---|
| b2b_service | 1인·소규모 사업자 / 10인 미만 스타트업·팀 / 중소기업 실무 부서 / 전문직 사무소(세무·법률·의료) / 프랜차이즈 본사·가맹점 / 공공기관·비영리 | 반복 업무에 시간이 새어 나감 / 문서·절차가 정리돼 있지 않음 / 담당자가 없어 대응이 늦음 / 외주 비용이 부담 / 검수 기준이 없어 결과가 흔들림 / 전문 인력을 채용할 여유가 없음 | 문서·보고서 작성 대행 / 업무 절차·템플릿 정리 / 마케팅·홍보 실행 대행 / 웹사이트·시스템 구축 대행 / 교육·워크숍 / 정기 자문(월 리테이너) | 직접 영업·제안(이메일·링크드인) / 크몽·숨고 |
| software | 개인 사용자 / 자영업자·소규모 매장 / 스타트업·개발팀 / 중소기업 특정 부서 / 프리랜서·크리에이터 / 교육·공공기관 | 기존 도구가 복잡하고 비쌈 / 엑셀·수기 관리로 실수가 남 / 여러 도구를 오가며 시간이 듦 / 우리 상황에 맞는 기능이 없음 / 데이터가 흩어져 있음 / 유료 전환·해지가 많음(운영) | 웹 서비스(구독) / 모바일 앱 / 업무 자동화 도구 / 예약·주문 관리 시스템 / 데이터·리포트 대시보드 / 맞춤 개발 | 검색·블로그 콘텐츠 / 앱스토어·런칭 커뮤니티 |
| food_beverage | 점심·테이크아웃을 찾는 인근 직장인 / 주거 상권 가족·주부 / 대학가·학원가 학생 / 관광객·나들이 방문객 / 배달로 식사하는 1인 가구 / 단체·모임 예약 손님 | 원하는 메뉴를 근처에서 못 찾음 / 기다리는 시간이 김 / 배달 메뉴의 가격·품질 불만 / 건강·알레르기 선택지 부족 / 단체·사전 주문이 어려움 / 매일 식사·반찬 준비가 부담됨 | 커피·음료 / 베이커리·디저트 / 식사 메뉴 / 반찬·도시락·밀키트 / 사전 주문·케이터링 / 주류·안주 | 배달앱(배민·쿠팡이츠) / 네이버 예약·단체 주문 |
| retail_commerce | 취향 소비를 즐기는 20~30대 / 육아 가정 / 1인 가구 / 반려동물 가구 / 취미·수집가 / 도매 구매 사업자 | 원하는 상품을 찾기 어려움 / 품질이 들쭉날쭉함 / 가격이 부담됨 / 배송·교환이 불편함 / 취향에 맞는 큐레이션이 없음 / 재고·품절이 잦음(운영) | 패션·잡화 / 문구·굿즈 / 식품·건강식품 / 생활·인테리어 / 뷰티 / 취미·수집품 | 스마트스토어·쿠팡·오픈마켓 / 자사몰·라이브커머스 |
| manufacturing | 일반 소비자 / 유통사·바이어 / 다른 제조사(부품·OEM) / 기업 판촉·굿즈 담당자 / 공공 조달 / 해외 바이어 | 소량·맞춤 주문을 받아주는 곳이 없음 / 납기가 길고 불확실함 / 품질 편차·불량 / 최소 수량이 너무 큼 / 단가·견적이 불투명함 / 기존 제품이 용도에 맞지 않음 | 부품·소재 납품(산업용) / 완제품 / OEM·ODM 생산 / 시제품·소량 제작 / 생활 소품·굿즈 / 설비·장비 | 전시회·직접 영업 / 도매·바이어 납품 |
| education | 초·중·고 학생(비용은 학부모) / 대학생·취업 준비생 / 직장인 자기계발 / 시니어 / 기업 임직원 교육 담당 / 창업 준비자·소상공인 | 혼자 배우면 꾸준히 못 함 / 실습 없이 이론만 배움 / 내 수준에 맞는 수업이 없음 / 시간·장소 맞추기가 어려움 / 배워도 실제로 못 씀 / 수강생 이탈·정원 미달(운영) | 1:1 과외·코칭 / 그룹 수업 / 온라인 라이브 / 녹화 강의 / 워크숍·특강 / 기업 출강 | 숨고·클래스 플랫폼 / 지역 커뮤니티·맘카페·기관 계약 |
| local_service | 외모·건강 관리를 원하는 직장인·학생 / 1인 가구·직장인 / 맞벌이·육아 가정 / 고령자·돌봄·이사 예정 가구 / 반려동물 가구 / 소규모 매장·사무실 | 맞는 업체를 찾기 어려움 / 예약·방문 시간이 안 맞음 / 가격이 불투명함 / 작업 범위·책임이 불명확함 / 원하는 스타일·결과를 맞춰 주는 곳이 없음 / 노쇼·취소 대응이 없음(운영) | 매장에서 받는 관리·시술(네일·헤어·피부) / 방문 청소·정리 / 이사·짐 운반 / 수리·설치 / 반려동물 돌봄·미용 / 운동·건강 코칭 | 숨고·당근 등 지역 앱 / 네이버 예약 |
| space_hospitality | 모임·파티 그룹 / 스터디·소규모 회의 / 촬영·행사 준비 고객 / 여행객·가족 숙박 / 1인 창업자·소규모 팀(사무 공간) / 기업 워크숍·행사 | 목적에 맞는 공간을 찾기 어려움 / 예약·결제가 번거로움 / 인원·시간 조건이 안 맞음 / 시설·청결이 기대에 못 미침 / 사무실·공간을 장기 계약하기엔 부담이 큼 / 공실·비수기 가동률(운영) | 상주 좌석·사무실 / 비상주 주소 / 회의실·강의실 대관 / 파티룸·스튜디오 대관 / 숙박(1박) / 장기 임대 | 스페이스클라우드·숙박 플랫폼 / 자체 홈페이지·재방문 |
| logistics | 지역 음식점·소상공인 / 온라인 셀러 / 기업 서류·샘플 발송 / 개인(퀵·용달) / 이사·입주 가구 / 대형 물류사 하도급 | 당일·시간 지정 배송이 없음 / 소량 정기 배송을 안 받아줌 / 파손·분실 책임이 불명확함 / 요금이 불투명함 / 이사·큰 짐 옮길 때 믿을 곳이 없음 / 특정 거래처 의존(운영) | 당일 퀵 / 정기 납품 배송 / 택배·풀필먼트 대행 / 용달·이사 운송 / 화물 운송 / 보관 | 화물·배달 플랫폼 / 화주 직접 영업 |
| content_media | 소상공인 매장 / 온라인 셀러 / 스타트업·기업 마케팅팀 / 개인(웨딩·가족·프로필) / 크리에이터 / 기관·학교 행사 | 직접 만들 시간·기술이 없음 / 기존 대행은 비싸고 느림 / 결과물이 브랜드와 안 맞음 / 수정·소통이 어려움 / 꾸준히 올릴 콘텐츠가 부족함 / 수정 요청 과다·단가 하락(운영) | 사진 촬영 / 영상 제작 / 디자인·썸네일 / 글·블로그 / SNS 운영 대행 / 자기 채널 운영 | 크몽·숨고 / 포트폴리오 사이트·대행사 제휴 |
| general | 개인 소비자 / 사업자 / 특정 관심사 커뮤니티 / 특정 지역 주민 / 특정 연령대 / 기관·단체 | 필요한데 해주는 곳이 없음 / 기존 방식이 불편함 / 비용이 부담됨 / 시간이 부족함 / 믿을 만한 정보가 없음 / 특정 거래처·채널 의존(B2B 폴백) | 1회 서비스 / 상품 판매 / 구독·회원 / 공간·장비 대여 / 디지털 콘텐츠 / 직접 입력 | 오픈마켓·플랫폼 / 자체 홈페이지 |

공통 channel 6: 매장 방문 / 인스타그램·SNS / 네이버 검색·플레이스 / 유튜브·숏폼 / 지역 커뮤니티·당근·맘카페 / 지인·입소문 [코드 `questions.ts:372,:401`]. 전화·카카오톡 문의는 local·food·space 슬롯에서 필요 시 교체.

## 부록 B. price 범위 세트(기준은 4-1 임시 조치의 sector별 period)

| sector | 기준(period) | 1단 범위(양 경계 '원') |
|---|---|---|
| b2b_service | 프로젝트 1건 | 30만원 미만 / 30만원~100만원 / 100만원~300만원 / 300만원~1,000만원 / 1,000만원 이상 |
| software | 월 구독 1건 | 5,000원 미만 / 5,000원~20,000원 / 20,000원~50,000원 / 50,000원~200,000원 / 200,000원 이상 (무료 모델은 '아직 미정' + billingUnit) |
| food_beverage | 대표 메뉴 1개 | 5,000원 미만 / 5,000원~10,000원 / 10,000원~20,000원 / 20,000원~40,000원 / 40,000원 이상 |
| retail_commerce | 대표 상품 1개 | 1,000원~5,000원 / 5,000원~10,000원 / 10,000원~30,000원 / 30,000원~100,000원 / 100,000원~300,000원 / 300,000원 이상 |
| manufacturing | 개당 | 1,000원 미만 / 1,000원~10,000원 / 10,000원~50,000원 / 50,000원~200,000원 / 200,000원~1,000,000원 / 1,000,000원 이상 |
| education | 1인 수업 1회 | 20,000원 미만 / 20,000원~50,000원 / 50,000원~100,000원 / 100,000원~300,000원 / 300,000원 이상 |
| local_service | 예약 1건 | 30,000원 미만 / 30,000원~50,000원 / 50,000원~100,000원 / 100,000원~300,000원 / 300,000원 이상(이사 포함) |
| space_hospitality | 1단 기준 칩(시간당 / 1박 / 월 멤버십) | 시간당 10,000원 미만~50,000원 이상 4구간 / 1박 50,000원 미만~200,000원 이상 4구간 / 월 100,000원 미만~500,000원 이상 4구간 |
| logistics | 1건 | 5,000원 미만 / 5,000원~10,000원 / 10,000원~30,000원 / 30,000원~100,000원 / 100,000원~300,000원 / 300,000원 이상 |
| content_media | 납품물 1개 | 50,000원 미만 / 50,000원~200,000원 / 200,000원~500,000원 / 500,000원~1,500,000원 / 1,500,000원 이상 |
| general | 1건 | 10,000원 미만 / 10,000원~50,000원 / 50,000원~200,000원 / 200,000원 이상 |

2단은 모든 세트 공통: **하한 / 상한 / 정확히 입력(만원 키패드)**. 개방 상단 구간은 바로 키패드(시작값 하한).

## 부록 C. 질문 문구 재작성(주의 문장은 `hint`로 분리)

핵심(startup 기준, 다른 mode는 동일 어휘): industry "어떤 업종에 가까운가요?" · business "어떤 사업인가요? 한 문장(60자 안)으로." · customer "주로 누가 이용하나요? (최대 2개)" · problem "그 고객의 어떤 불편을 해결하나요?" · offer "대표 상품이나 서비스는 무엇인가요?" · channel "처음 고객을 만날 곳은 어디인가요? (최대 3개)" · price "{기준} 가격은 얼마쯤인가요?" (현행 '판매 기준도 함께'는 삭제) · budget "준비에 쓸 수 있는 돈은 얼마인가요?" / hint "필요한 비용 추정치가 아니라 실제로 쓸 수 있는 금액" · hoursPerWeek "일주일에 몇 시간 쓸 수 있나요?" · capacity "처음에는 누가, 얼마나 감당하나요?" · goal "언제까지 무엇을 이루고 싶나요?" / hint "목표는 현재 실적과 따로 기록돼요".
operating 추가: period 라벨 "실적 기간 (시작일 / 종료일)" 유지(`questions.test:90-91`) · sales "{시작일}~{종료일} 매출 합계는 얼마였나요?"(prompt에 '실제 매출' 유지, `:96`) · cost "한 달 고정비는 대략 얼마인가요?"(prompt에 '월 고정비'·'건당 변동비…구분' 유지, `:94-95`).
상세 44개 문구는 각 묶음 설계안의 재작성 제안을 그대로 채택하되 44개 prompt 고유성(`questions.test:73`)을 유지한다.
