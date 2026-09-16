# 사업 진단 두 경로 실행 계획 — 자유 대화 / 안내 흐름 (2026-09-16, 검토 반영 v2)

작성 근거: 지도 1(예전 자유 대화 엔진), 지도 2(새 진단 서비스와 보호 장치), 지도 3(진입 화면과 클라이언트 상태), 세 접근 심사 결과(접근 B 1위, 합계 81), 그리고 v1 문서에 대한 회의적 검토(세 관점: 보호 장치 불변식 / 소유자 결정 충실도 / 비용과 출시). 검토가 지적한 blocker 3건·major 15건·minor 23건의 처리는 문서 끝 "검토 반영 기록"에 항목별로 적었다. 모든 코드 인용은 `/Users/juhong/Developer/meow-main` 기준 `파일:라인`이며 v2 작성 시 다시 실측했다. `app/plan/chat/intake-ui/IntakePanels.tsx`는 다른 작업으로 라인이 크게 이동했으므로 함수명으로 인용한다. 이 문서는 계획이며 코드는 바꾸지 않았다.

전제: 안내 흐름(카드 경로)의 질문별 선택형 컨트롤은 `docs/intake-select-first-spec-2026-09-16.md`(이하 "선택형 설계서")가 정의한다. 두 문서가 어긋나는 지점은 4.4에 정리했고, 본 문서(두 경로 분리)가 진입·입력창 의미·유형 확정 규칙을, 선택형 설계서가 질문별 컨트롤을 각각 소유한다. 검토 반영으로 설계서 §1.2·§6 Phase 2 두 곳의 문구 갱신이 필요해졌다(4.4).

---

## 1. 결정 요약과 두 경로의 정의

### 1.1 제품 소유자 결정(그대로)

> `/plan/chat?new=1`에서 자유채팅을 하는 사람은 자유채팅으로 넘어가고, 3가지 섹션(아이디어를 찾고 있어요 / 생각한 사업이 있어요 / 사업을 운영 중이에요)을 누르는 사람은 각 섹션에 맞게 디테일하게 분리되는 안내 흐름으로 간다. 두 개로 정확하게 나눈다. 안내 흐름은 반드시 클릭 혹은 선택으로 답하게 하고, 특별하지 않는 한 타이핑을 유도하지 않는다.

### 1.2 채택한 뼈대 — 접근 B "진단 서비스 확장"

자유 대화를 새 진단 서비스의 명령 하나(`chat`)와 작업 kind 하나(`chat`)로 추가한다. 예전 엔진(`completeCoachReply`, `__coach_job`, `postLegacyChat`의 `message` 경로)은 새 화면에서 호출하지 않는다. 채택 이유(심사 공통):

- 소유자 결정에 문자 그대로 대응한다: 카드 = `start {mode}`(AI 0회), 입력창 = `chat`(매 메시지 AI 답변).
- AI가 알아낸 값은 예외 없이 `intake.candidates(pending)` → `ExtractionReview` → `confirm-extraction` → `applyIntakeCandidates`(`intake-core.ts:184-206`)만 통과한다. "사용자 확인을 거쳐 저장"을 코드 구조로 보장한다.
- 하나의 화면(`IntakeWorkspace`), 하나의 API 경로(`intakePost`), 하나의 작업 슬롯(`intake.job`), 하나의 저장 형태(`CoachState` + `IntakeState`).
- 비용 상한이 호출부 옵션이 아니라 재사용 함수(`boundedJson`, `intake-extraction.ts:83-106`)에 고정된다.

**플래그 0 운영 경로에 대한 정확한 주장(v1 "한 줄도 바꾸지 않는다"를 정정):** 라우팅 분기(`route.ts:231-232`)와 legacy 핸들러의 AI 답변 본문(`postLegacyChat`의 job 생성·디스패치, `completeCoachReply`)은 바꾸지 않는다. 다만 다음 세 곳은 플래그 0 경로가 공유하는 파일이므로 회귀 단언과 함께 바꾼다.

1. **롤백 안전망(신규, 필수)**: `postLegacyChat`에서 job 생성·consult 턴 차감(`route.ts:297`) **이전**에 `plan.answers.__business_intake`가 있으면 409 `intake_plan`("이 사업은 새 진단 화면에서 이어갈 수 있어요. 입력은 보관됐어요")을 돌려준다. 현재 코드는 턴을 먼저 차감하고 `generateAndSaveCoach`가 `COACH_JOB_SUPERSEDED`로 거부(`coach-job.ts:27`)해 502 + "다시 시도" 버튼이 반복된다(`route.ts:311-318`). legacy `BusinessCoach`는 이 코드에서 입력창을 닫고 안내만 표시한다. `preparePlan`은 `readIntake(plan.answers)?.modeConfirmed === false`면 400 `mode_required`(1.5)를 돌려주고, 그 외 intake plan의 `prepare`는 그대로 허용한다.
2. **상호배제의 방향 수정**: 첫 intake 명령이 진행 중인 legacy 작업을 무조건 failed로 이관하던 규칙(`intake-service.ts:70-73, 90-93`)을 "`isCoachJobActive && !isCoachJobStale`(`coach-job-types.ts:15-20`)이면 409 `legacy_busy`, stale(10분 초과)한 것만 failed 이관"으로 바꾼다. 이미 `completeCoachReply`를 호출 중인 Workflow가 다음 phase 갱신(`coach-job.ts:38` → `updateCoachJob` 토큰 불일치)에서야 멈추는 창을 없애고, 같은 사업에서 유료 호출 2건이 겹치지 않게 한다. `coach-job.ts:27, 44`의 "intake 존재 시 거부"는 유지한다.
3. **공유 유틸의 하위 호환 확장**: `coach.ts` `COACH_SYSTEM` 규칙 문장의 export 분리(문자열 동일성 단언), `lib/llm/usage.ts` `recordLlmUsage`는 **마지막 선택 인자** `context?: {ownerHash?, planId?}`로만 확장해 기존 호출부(`complete.ts:265`)를 바꾸지 않는다. `coach-expert-service.ts:30`의 busy 판정에 intake job을 더한다(3.5).

플래그 0 회귀 증명은 `scripts/chat-entry-style.test.ts`(page.tsx AST: `ENTRY_OPTIONS`·`submit(option)`, `:19-24`)와 `scripts/business-intake-prepare.test.ts`(플래그 0/1 라우트 전환, `:24, :126, :269`)에 단언을 추가해 수행한다. v1이 지정한 `scripts/business-coach-ui.test.ts`는 고정 경로 Chrome과 `localhost:8083` 픽스처 서버가 필요한 puppeteer 테스트(`:16-18`)이고 `reliability-tests.mts` 묶음에도 없으므로 "선택 실행(로컬 Chrome 필요)"로만 표기한다.

심사에서 채택한 이식(graft) 항목은 각 장에 "[이식]" 표시로, 회의적 검토에서 반영한 항목은 "[검토]" 표시로 넣었다.

### 1.3 두 경로의 정의

| 항목 | 자유 대화 경로 | 안내 흐름 경로 |
| --- | --- | --- |
| 진입 | 환영 화면 하단 입력창에 문장을 적고 전송 | 환영 화면 카드 3장 중 하나를 클릭 |
| 서버 명령 | `chat`(신규) | `start {mode}` → `answer`/`details`(기존) |
| AI 호출 | 메시지마다 1회(20초, 출력 800토큰, 폴백 없음). 인사·확인만 있는 메시지는 규칙 고정 답변(0회) | 기본 진단 0회. `extract`/`help`/`design`은 사용자가 명시적으로 요청할 때만 |
| 답변 방식 | 타이핑 | 클릭·선택. 입력창은 기본 접힘, "직접 입력"을 누른 질문과 business 예외 2개에서만 펼침(4.2) |
| 사업 정보 저장 | AI 후보 → 사용자 확인(`confirm-extraction`) → `basis:"user"` 필드 | 답변 즉시 `basis:"user"` 필드(`applyIntakeAnswer`, `intake-core.ts:135-182`) |
| **유형(mode) 확정** [검토] | 사용자가 카드 3장 중 하나를 클릭할 때까지 `modeConfirmed:false`. 그동안 `coach.stage="exploring"`, `ready=false`, `planType` 미갱신, `design`/`prepare`/`details` 400 `mode_required`(1.5) | 카드 클릭이 곧 확정(`modeConfirmed:true`) |
| 저장 위치 | `plan.answers.__business_coach.state`(`coach.ts:6, 39-42`) + `__business_intake.state` | 동일 |
| 대화 기록 | `coach.messages`에 원문 user 메시지(id=requestId) + `${requestId}-reply` 어시스턴트 메시지 | `coach.messages`에 `"라벨: 값"` user 메시지(`intake-core.ts:182`) |
| stage 파생 | `intake.mode`+`modeConfirmed`에서만. AI 판단은 `intake.stageHint`(카드 프리셀렉트 전용) | `intake.mode`에서 파생 |

### 1.4 전환 규칙

- **자유 대화 → 안내**: 어시스턴트 답변 아래 "남은 N개 항목을 질문으로 채우기" 버튼 → 입력 모드가 `answer`로 바뀐다. `nextQuestion`(`intake-core.ts:64`)은 `answeredIntakeQuestion`(`intake-core.ts:40-43`)이 user-basis 필드가 있는 질문을 건너뛰므로, 대화에서 확정한 후보만큼 질문이 줄어든다. 서버 추가 코드 없음.
- **유형 확정은 전환 여부와 무관한 필수 단계** [검토]: 대화로 시작한 사업(`entry:"chat"`)은 **첫 AI 답변 직후** 스레드 안에 카드 3장(`ModeChoiceInline`)이 항상 뜬다. `stageHint`가 있으면 그 카드를 프리셀렉트(시각 강조)만 하고 자동 선택하지 않는다. 카드 클릭 → `start {mode}`(`:81 mode_conflict`를 `!modeConfirmed`일 때 허용) → `modeConfirmed:true`. 사용자가 카드를 무시하고 대화를 계속하면 카드는 요약 패널 상단과 "사업안 만들기/계획서 만들기" 버튼 자리("먼저 단계를 골라 주세요")에 남는다.
- **안내 → 자유 대화**: footer의 "자유 대화로 전환" 버튼 → 모드 `chat` → 타이핑. 서버 변경 없음. `intake.mode`는 이미 확정이므로 카드 재선택은 뜨지 않는다.
- **[이식] 후보의 원클릭 승격**: 안내 질문 상단에 그 질문의 `fieldKey`와 일치하는 pending 후보가 있으면 "대화에서 말한 값 사용: {value}" 칩을 두어 클릭 1회로 `answer` 저장. 데이터 소스는 `intake.candidates(pending)`로 한정하고 proposal 값은 저장하지 않는다.
- 두 경로 어디서든 요약 패널(`BusinessSummary`), 사업안(`design`), 계획서(`prepare`) 버튼은 같은 `coach.ready`를 보되, `ready`는 1.5의 규칙으로 계산된다.

### 1.5 유형 미확정(`modeConfirmed:false`) 상태의 규칙 [검토, blocker 해결]

v1은 대화로 시작한 사업을 `createIntake(coach, "startup", at)`로 만들고 `modeConfirmed:false`를 UI 힌트로만 썼다. 그러나 현재 코드는 `intake.mode`에서 stage·ready(`intake-core.ts:179-181, 203-205`), `planType`(`intake-service.ts:126`), 계획서 챕터(`route.ts:172` `chaptersForType(plan.planType)`), 요약 패널 eyebrow(`BusinessSummary`, `IntakePanels.tsx:302`)를 파생하고, `preparePlan`은 `coach.ready`만 본다(`route.ts:168`). 그대로면 운영 중인 사장이 자유 대화로 사업을 소개하고 business 후보를 확정하는 순간 `ready=true`가 되어 유형을 한 번도 고르지 않은 채 "창업" 유형의 유료 사업안·계획서가 나온다. 소유자 결정 "각 섹션에 맞게 디테일하게 분리"와 불변식 13·14를 어긴다. 다음 규칙으로 막는다.

| 층 | 규칙 | 위치 |
| --- | --- | --- |
| stage/ready | `recomputeStage(coach, intake)` 헬퍼(`intake-core.ts:179-181`과 `:203-205`의 3줄 공용화): `intake.modeConfirmed === false`이면 `coach.stage = "exploring"`, `coach.business.stage = "사업 기획"`, `coach.ready = false`로 고정. 확정 후에는 기존 규칙(`mode==="operating"` → operating, business user 필드 있음 → startup, 아니면 exploring) | `intake-core.ts` (applyIntakeAnswer·applyIntakeCandidates·start 확정·chat job 저장 네 곳에서 호출) |
| planType | `!Object.keys(plan.sections).length`일 때의 `plan.planType` 갱신(`intake-service.ts:126`)을 `intake.modeConfirmed !== false`일 때만 수행. 미확정 동안 `planType`은 생성 시 기본값(`COACH_TYPES.startup`, `:66`)이 남지만 `prepare`가 막혀 소비되지 않는다 | `intake-service.ts:126` |
| 서버 거절 | `design`·`details`(`intake-service.ts:110-117` 블록)·`prepare`(`intake-http.ts:71` 전달 직전, 그리고 `preparePlan` `route.ts:168` 직전에도 방어)에서 `intake.modeConfirmed === false` → 400 `mode_required`("먼저 어느 단계인지 골라 주세요"). `business_required`보다 먼저 검사해 화면이 원인을 구분한다 | `intake-service.ts`, `intake-http.ts`, `route.ts` |
| 화면 | 요약 패널: 미확정이면 eyebrow("운영 중인 사업/사업 구상")와 진행도(N/`coreTotal`)를 숨기고 그 자리에 카드 3장 인라인, "사업안 만들기/계획서 만들기/상세 질문 4개 추가"는 `disabled` + 문구 "먼저 단계를 골라 주세요". 스레드: 첫 AI 답변 직후 `ModeChoiceInline` 항상 노출(1.4) | `IntakePanels.tsx` `BusinessSummary`·`ModeChoiceInline` |
| 테스트 | `business-intake-service.test.ts` 신규: "chat 시작 → business 후보 확정 → `ready=false`, `design` 400 `mode_required`, `details` 400, `prepare` 전달 전 400 → `start {mode:"operating"}` 후 `ready=true`, `planType=operating`, `answers` 유지". `business-intake-ui.test.tsx`: "미확정 스냅샷의 요약 패널에 eyebrow·진행도가 없고 카드 3장이 있다" | Phase 1 |

이 규칙은 Phase 1에 들어간다(v1은 Phase 2 "추가"에 두었다). Phase 1이 이미 `chat`으로 plan을 만들기 때문에, 미리보기에서 카드를 누르면 `mode_conflict` 409가 나던 문제(`intake-service.ts:81`)도 같은 단계에서 해소된다.

---

## 2. 환영 화면 명세 (`/plan/chat?new=1`)

### 2.1 현재 동작과 문제의 코드 원인

- `BusinessIntake.tsx:423`: `!plan && newEntry` → `EntryChoices`. 카드 3장 클릭 → `send({action:"start", mode})`.
- 입력창은 footer(`BusinessIntake.tsx:435-448`)에 시작 전부터 존재(HANDOFF.md:28). `submitComposer` `!plan` 분기가 `typedEntryCommand(text)`(`model.ts:27-35`)를 호출한다.
- `typedEntryCommand`는 정확 문구 3군(`:30-32`)을 카드 mode로, **그 외 모든 문장을 `{action:"start", mode: startup|operating, questionId:"business", value:text}`**(`:33-34`)로 바꾼다. 서버 `start`(`intake-service.ts:82-87`)는 이를 `applyIntakeAnswer`로 첫 답변으로 저장하고 다음 질문 `industry`를 내놓는다. AI 응답 텍스트는 어디에도 생성되지 않는다. 이것이 "자유 대화처럼 보이지만 설문으로 가는" 원인이다.
- [검토] 추가 원인: `send()`의 가드 `if (input?.action !== "start" && !existing && !planRef.current) return;`(`BusinessIntake.tsx:236`). plan이 없을 때 `start`가 아닌 명령은 pending 기록(`writeDraft`, `:248`)·소유자 사전 GET·POST 어느 단계에도 도달하지 않고 조용히 버려진다. `submitComposer`만 바꾸면 환영 화면의 첫 문장이 사라진다.

### 2.2 두 구역 명세

| 구역 | 위치 | 내용 |
| --- | --- | --- |
| 제목 | `EntryChoices` 상단 `CoachWelcome tagline={false}` | 유지: "어떤 사업을 / 생각하고 계세요?" |
| 위 구역 — 안내 흐름 | 카드 3장 | 소제목 1줄 "단계를 골라 질문에 선택으로 답하기". 카드 라벨 유지: "아이디어를 찾고 있어요 / 생각한 사업이 있어요 / 사업을 운영 중이에요". 보조 문구 "AI 호출 없이 질문만으로 정리돼요". 클릭 동작 변경 없음 |
| 구분 | 카드 아래 | "또는 아래에 자유롭게 이야기해 주세요" |
| 아래 구역 — 자유 대화 | footer 입력창 | placeholder `"생각을 들려주세요"` → "자유롭게 이야기하면 AI가 답하고, 사업 정보는 확인 후 저장돼요". `aria-label` → "AI와 자유 대화". `maxLength` 1200 → 4000. Enter 전송 규칙 유지 |
| 링크 | 하단 | "저장한 사업 불러오기 → /plan" 유지. [검토] 추가: 24시간 내 갱신된 `entry:"chat"` plan이 있으면 "최근 대화 이어가기 → /plan/chat?planId=" 링크(서버가 `intakeGet`의 plan 없음 응답에 `recentChatPlanId`를 실어 준다) |
| 제거 | `initialMessage` 블록 | `introMessage`에 값을 쓰는 곳이 `parseDraft`(`model.ts:115`)뿐이므로 제거. `BusinessIntake.tsx:306-309`의 자동 `message` 전송 효과도 함께 제거 |

모드 셀렉터는 plan이 없을 때 표시하지 않는 현재 규칙(`:436`) 유지.

### 2.3 입력창 동작 변화

`submitComposer` `!plan` 분기를 다음으로 교체한다.

```
const text = draftRef.current.chat.trim();
if (text.length > 4000) { setError("한 번에 4,000자까지 보낼 수 있어요"); return; }
if (text) void send({ action: "chat", message: text }, { text });
```

- [검토] `send()` 가드 `:236`을 `!["start", "chat"].includes(input?.action ?? "") && !existing && !planRef.current`로 완화한다. 이 한 줄이 없으면 위 호출이 무시된다. `business-intake-ui.test.tsx`의 소스 정규식 단언 방식(`:234-249`)으로 "가드가 `chat`을 통과시킨다"와 "`:243` `beginReply` 조건에 `chat`이 없다"를 함께 고정한다.
- `typedEntryCommand`·`entryMessage`(`model.ts:27-40`) 호출 제거.
- `beginReply` 조건(`:243-246`, `start|answer|details`)에 `chat`을 넣지 않는다 — 600ms 연출이 아니라 AI 작업 진행 표시가 맞다. `previewIntakeAnswer`(`:239`)는 `answer` 전용이라 `null`을 돌려주므로 그대로.
- 낙관적 표시: `pending.command.action === "chat"`이고 `plan.coach.messages`에 같은 requestId가 없으면 사용자 말풍선 + `messageStatus` "보내는 중"(legacy `optimistic` 패턴, `page.tsx:48, 269`).
- 응답 스냅샷 → `installPlan` → `updateUrl(planId)` → URL이 `?planId=`로 바뀌고 `newEntry=false`. `needsPolling`(`model.ts`)이 `job.status queued|running`을 보므로 폴링이 자동 시작된다.

### 2.4 `typedEntryCommand` 폐기

- `model.ts:27-35` 함수 삭제. 정확 문구 매칭(`:30-32`)도 삭제한다 — 소유자 결정은 "타이핑 = 자유 대화"이며, "사업을 운영 중이에요"를 타이핑한 사용자도 자유 대화로 간다. AI 응답의 `stageHint`가 카드 프리셀렉트로만 쓰인다.
- [검토] 테스트 갱신은 라인이 아니라 함수명으로: `business-intake-ui.test.tsx` **import 줄(`:11`)에서 `entryMessage`·`typedEntryCommand` 제거**(삭제 시 단언보다 먼저 컴파일이 깨진다), `typedEntryCommand` 단언 5개(`:33-37`)와 `entryMessage` 단언 2개(`:38-39`) 삭제 → "입력창 문장은 `{action:"chat", message}`가 된다" 단언으로 교체.
- `business-intake-browser.mts`(첫 문장 Enter → `industry` 질문) 시나리오는 "첫 문장 Enter → 200/202 + URL `?planId=` + 사용자 말풍선"으로 재작성한다.
- **[이식] 서버 측 `start`의 `questionId/value` 원자 처리(`intake-service.ts:82-87`)는 남긴다.** UI가 더 이상 부르지 않아도 서비스 계약 테스트(`business-intake-service.test.ts:152, 173`)를 회귀 기준으로 유지한다.

### 2.5 재접속 화면

- `/plan/chat?planId=X` → `intakeGet` → `currentSnapshot`(`intake-http.ts:19-30`). 120초 넘은 활성 job은 여기서 failed(`:25-28`).
- `ConversationHistory`(`IntakePanels.tsx:225-`)의 첫 사용자 말풍선 합성(`intake.mode` 라벨 고정)은 `intake.entry !== "chat"`이고 **`!intake.legacyImported`**일 때만 그린다. **[이식]** 플래그 전환 전 legacy plan의 첫 메시지는 카드 라벨이 아니므로 `legacyImported`(`intake-core.ts:20`)에서도 생략한다.
- [검토] **질문 프롬프트 합성 규칙 변경**: 현재 `answerEntry = answers.find(a => a.messageId === message.id)`(`:231`)로 질문을 찾아 프롬프트 말풍선과 수정 연필(`:240`)을 붙인다. chat 후보를 확정하면 `applyIntakeCandidates`가 `answers[q].messageId = candidate.noteId`(= 사용자 chat 메시지 id, `intake-core.ts:200`)로 기록하므로 자유 대화 말풍선이 사후에 설문 Q&A 모양으로 다시 그려지고, 연필을 누르면 채팅 원문 전체가 답변 초안으로 시드된다(`editQuestion`, `BusinessIntake.tsx:312-326`). 규칙을 **`message.role === "user" && message.text.startsWith(`${question.label}: `)`인 안내 답변 메시지에만** 프롬프트를 합성하고 연필을 붙이는 것으로 바꾼다(데이터 변경 없음, `:233`의 두 조건 중 `answerEntry` 경로 제거). 자유 메시지에서 확정된 값은 해당 AI 답변 아래 상태 줄 "저장됨: 사업 소개 · 가격"으로만 표시하고 수정은 요약 패널 연필로 보낸다. 단언: "채팅 메시지는 확정 후에도 질문 프롬프트가 삽입되지 않는다".
- 어시스턴트 role 메시지는 이미 렌더된다. 자유 대화 답변 표시에 새 컴포넌트가 필요하지 않다.
- 입력창 기본 모드: 드래프트가 없으면 `intake.entry === "chat" ? "chat" : "answer"`.

### 2.6 환영 화면에서 문장을 적어 둔 채 카드를 누른 경우 [검토]

`draft.chat`이 비어 있지 않은 상태에서 카드를 클릭하면, 카드 진입(`answer` 모드)에서는 그 문장이 화면에서 사라진 것처럼 보이다가 나중에 자유 대화 모드로 바꾸면 갑자기 나타난다. `EntryChoices`의 카드 클릭 핸들러는 `draft.chat.trim()`이 있으면 `start`를 보내기 전에 인라인 선택을 띄운다: "적어 둔 이야기를 첫 대화로 보낼까요?" — [첫 대화로 보내기] → `start {mode}` 성공 후 `chat`을 1회 자동 전송(사용자가 직접 적은 문장이므로 자유 대화 예산 규칙을 따른다) / [지우기] → `draft.chat=""` 후 `start`. 두 버튼 외 진행 경로는 없다.

---

## 3. 자유 대화 경로 명세

### 3.1 요청 (클라이언트 `send()`, `BusinessIntake.tsx:232-293`)

기존 파이프라인 그대로: `requestId = crypto.randomUUID()`, 전송 전 `writeDraft({pending})`(`:248`), 소유자 사전 GET(`:254-256`), POST 헤더 `x-business-intake: 2` + `x-business-intake-owner`(`:257`), 25초 타임아웃(`:252`). 우회 없음.

추가·변경:
- [검토] **revision 값에 의존하지 않는 명령(`chat`, `chat-retry`, `details`)은 전송 직전 GET 스냅샷을 `installPlan`하고 그 revision으로 POST한다.** 현재 `:254-256`의 GET 결과는 ownerScope 비교에만 쓰인다. CAS·영수증·소유자 검증은 그대로 통과하며 서버 규칙은 바뀌지 않는다. 값 의존 명령(`answer`, `confirm-extraction`, `start+value`)은 기존대로 로컬 revision을 보낸다.
- [검토] **chat job 활성 중 잠금은 모드와 무관**: `blocked`(`:337`)에 `aiBusy && job.kind === "chat"`을 포함해 질문 카드·전송을 함께 잠근다(문구 "답변을 기다리고 있어요"). v1은 `draft.mode === "chat"`에만 잠금을 걸어, 안내 모드로 토글한 사용자가 답변을 보내는 사이 chat job 완료가 `coach.revision`을 올려 매번 `revision_conflict` 409 → 전체 잠금 → 수동 "최신 내용 불러오기"가 반복되는 문제가 있었다.
- [검토] **`chat`의 `revision_conflict` 자동 복구 1회**: 409 처리(`:262-265`)에서 `data.code === "revision_conflict"`이고 pending이 `chat`/`chat-retry`이면 `conflictRef`를 세우지 않고 `reload()` 후 **새 requestId**로 같은 본문을 1회 재전송한다(revision만 고쳐 보내면 서명이 달라 `request_reused` 409가 되므로 새 id가 유일하게 안전하다). 두 번째도 409면 기존 conflict 처리로 떨어진다. `answer`/`confirm-extraction`은 상태 의존이므로 자동 재전송하지 않는다.
- [검토] **저빈도 폴링**: `entry === "chat"` plan은 활성 job이 없어도 탭이 보일 때 20초 간격으로 GET해 다른 기기의 답변·후보를 받아온다(`needsPolling`에 `idleIntervalMs` 추가). 두 탭·폰+PC 병행에서 revision 격차를 줄인다.
- `settleDraft`(`model.ts`)에 chat 분기: `next.chat === pending.text`일 때만 비운다.
- 브라우저 테스트: "두 탭에서 chat을 교차 전송해도 충돌 잠금 없이 이어진다".

### 3.2 서버 접수 (`intakePost`, `intake-http.ts:57-89` → `saveIntakeCommand`, `intake-service.ts:46-135`)

**게이트(`intake-http.ts:78-81` 자리) — 읽기 전용 확인만 하고 슬롯을 소비하지 않는다** [검토]:
- `needsAI`에 `"chat"`, `"chat-retry"` 추가.
- `aiAvailable = !!resolveChatLLMConfig(hash) && chatEnabled()`. `resolveChatLLMConfig`는 env `INTAKE_CHAT_MODEL`이 **없으면 `null`**을 돌려준다(planning 설정으로 폴백하지 않는다 — v1의 폴백은 운영에서 매 무료 대화 턴이 `PLANNING_MODEL || "gpt-6-astra"`(`config.ts:39-43`)로 나가는 "기본값=최고가"였다). `chatEnabled()`는 런타임 var `INTAKE_CHAT_ENABLED === "1"`(3.7 킬 스위치).
- `aiAllowed`: chat은 `enforceRateLimit`(`intake-http.ts:80`)를 쓰지 않는다. 그 함수는 `RATE_LIMIT_BACKEND=supabase`가 아니면 isolate별 인메모리이고 RPC 오류 시 인메모리로 "열리는" 방향으로 폴백하며(`rate-limit.ts:72-74, 83-99`), 운영 `wrangler.jsonc` vars(`:38-53`)에는 그 키가 없다(스테이징 `wrangler.staging.jsonc:25`에만 있음). 또 `saveIntakeCommand` 이전에 카운트해 409로 끝난 요청도 한도를 깎는다. 대신 **`peekChatAllowance(ownerHash)`**: Supabase면 `rate_limits`를 읽기 전용 select(현재 윈도우의 `business-intake-chat-daily` 소유자 count, `business-intake-chat-10m` count, 전역 count)로 조회해 어느 하나가 상한 이상이면 `aiAllowed=false`와 사유·초기화 시각을 돌려준다. 조회 실패는 `aiAllowed=false`(fail-closed). demo-memory는 인메모리 카운터를 읽는다. **증가(bump)는 실행 시점에만**(3.3 ②).
- `aiAllowed`에 추가 조건: 소유자 전체 plan의 활성 intake job 수 < 2(계정 단위 동시성, 3.7).
- 스냅샷에 `chatAllowance: {remainingToday, resetsAt}`를 실어 클라이언트가 전송 전에 입력창을 잠그고 CTA를 보이게 한다.
- 응답에 `durable: !!workflow && supabase 모드`(불리언)를 실어 "화면을 닫아도 계속" 문구의 근거로 쓴다(`IntakeJob`에 `durable`이 없고 `dispatched`는 로컬 `after()` 실행에서도 claim 시 true가 되어(`intake-service.ts:175`) 클라이언트가 구분할 수 없다).

**`saveIntakeCommand` 변경:**
- `intakeCommandSchema`(`:17-24`, `.strict()` 유지) action enum에 `chat`, `chat-retry` 추가. `message ≤8000`은 그대로 두고 chat 분기에서 4,000자 초과를 400으로 거절.
- `:52 start_required` 검사를 `!["start","chat"].includes(action)`으로 완화.
- [검토] **plan 재사용 규칙**: `chat`이고 `planId`가 없으면, 소유자 plan 중 `entry === "chat"`이고 user-basis 필드가 0개이고 `updatedAt`이 24시간 이내인 최신 plan이 있으면 그 plan에 이어 붙인다(없을 때만 `plan_${requestId}` 생성, `:65-68`). 인사말 한 줄마다 plan 슬롯(계정당 20, `:62`)을 쓰던 문제를 막는다. 재사용 시 `planId` 없는 명령의 revision CAS는 3.1의 전송 직전 GET으로 맞춘 값이 아니라 **재사용 대상 plan의 현재 revision을 서버가 채택**하되, 클라이언트가 `revision:0`을 보낸 "새 plan" 요청인 경우에 한한다(`planId`가 있으면 기존 CAS).
- 새 plan이면 `createIntake(coach, "startup", at)` + `entry:"chat"`, `modeConfirmed:false`. `recomputeStage`로 `coach.stage="exploring"`, `ready=false`(1.5).
- [검토] **legacy 작업 상호배제 방향**(1.2 ②): `readCoachJob(plan.answers)`가 `isCoachJobActive && !isCoachJobStale`이면 `start`/`chat` 모두 409 `legacy_busy`("이전 답변을 정리 중이에요. 잠시 뒤 다시 보내 주세요"). stale이면 기존대로 `__intake_legacy_job` 이관 + failed.
- **chat 분기**(`:109`와 `:110` 사이):
  1. 빈 메시지 → 400 `message_required`.
  2. [검토] **영수증 없는 메시지 id 재사용은 멱등 처리**: `:61`의 "messages에 같은 id → 409 `request_reused`"는 chat/chat-retry에서는 "영수증이 잘렸지만 메시지가 있음 = 이미 처리된 정직한 재전송"으로 보고 `duplicate:true` 스냅샷 200을 돌려준다. 영수증 보존 수도 128 → 256(`:122`)으로 올린다(메시지 상한 160과의 불일치 완화).
  3. `coach.messages.length >= 160` 또는 누적 240,000자(legacy `route.ts:271-272` 기준 이식) → 413 `chat_limit`. **[이식]** 사업당 대화 턴 상한(제안 60, `-reply` 메시지 수로 파생)도 함께 확인.
  4. [검토] **인사·확인만 있는 메시지**(`intake-extraction.ts:51-55` `isEmptyOrAcknowledgement` 재사용)는 AI 호출 없이 고정 답변("안녕하세요. 어떤 사업을 생각하고 계신지, 또는 지금 운영 중인 사업이 있는지 편하게 이야기해 주세요")을 `${requestId}-reply`로 같은 CAS 쓰기에 저장하고 job을 만들지 않는다(200).
  5. `coach.messages.push({id: requestId, role:"user", text, at})`. `coach.suggestions = []`.
  6. 노트(`intake.notes`)는 만들지 않는다. 후보의 `noteId`는 사용자 메시지 id를 가리키고 검증 원문은 `coach.messages`에서 찾는다(legacy 관례 `coach.ts:54`).
  7. [검토] **활성 job이 있어도 메시지는 저장한다**: v1의 "`active(intake.job)`이면 409 `ai_busy`(저장 안 함)"는 불변식 10(원문 선저장)을 어겼고, 자동 `extract-pending`(`BusinessIntake.tsx:299-304`)이 슬롯을 점유한 순간 원문이 유실됐다. `message` 액션과 같이 **저장은 성공, job은 만들지 않음, 200 + message "앞선 AI 작업이 끝나면 답변을 요청할 수 있어요"**. 클라이언트는 `-reply`가 없는 마지막 사용자 메시지에 "답변 요청"(`chat-retry`) 버튼을 노출한다.
  8. `aiAvailable && aiAllowed && !active(intake.job)`이면 `newIntakeJob(coach, intake, "chat", at, text)`(`:31-44`, `noteIds=[]`, `messageId=requestId`, `dailyLimit`) → 202. 아니면 **메시지는 저장하고** `intake.job = {kind:"chat", status:"failed", error(사유), messageId, dispatched:false}`를 같은 CAS 쓰기에 기록 → 200(불변식 10).
  9. [검토] **pending 후보 정리**: 새 chat job을 만들 때 24개를 넘는 pending 후보는 오래된 것부터 `superseded`로 바꾼다(3.3 ⑦의 fieldKey 대체 규칙과 함께).
- `finishIntakeMutation`(`:119`) → `coach.revision+1`, `documentRevision` 불변. `stateRevision+1`(`:123`), 저장 가드(`:128`, `plan-server-store.ts:265-272`).
- `chat-retry` 분기: `-reply`가 없는 마지막 사용자 메시지가 있을 때만(대상 `messageId`는 서버가 계산) 새 job 생성. 메시지는 추가하지 않는다. **[이식]** `job.attempt`를 기록하고 3회 초과 → 429. 이는 예산 계층이 아니라 UX 규칙이다(3.7).

### 3.3 작업 실행 (`executeIntakeJob`, `intake-service.ts:167-225`에 `kind === "chat"` 분기)

1. claim(`:172-178`) — 중복 전달 시 유료 호출 1회 보장(테스트 `:408` 패턴). [검토] `dispatched=true` 기록(`intake-http.ts:50`, `.catch(() => undefined)`)이 CAS 충돌로 삼켜지면 1회 재시도한다. 30초 조기 failed(3.6)는 별도 코드 `dispatch_unconfirmed`로 표시하고, claim이 그 코드를 120초 이내에 만나면 running으로 되살린다(거짓 실패 → "다시 요청" → 두 번째 Workflow 생성을 막는다).
2. **일일·10분·전역 한도 fail-closed(유료 호출 직전, 권위 있는 증가)**: `bump_rate_limit`를 세 버킷(`business-intake-chat-daily` 소유자 / `business-intake-chat-10m` 소유자 / `business-intake-chat-daily` `"global"`)에 대해 호출하고 오류·비숫자·상한 초과면 `ai_limit`(`:183-187` 패턴, "isolate-local로 폴백 금지"). 기존 `business-intake-ai-daily` 24/일은 extract/help/design 전용으로 남긴다. 3.2의 peek가 대부분을 접수 시점에 걸러내므로 여기서 걸리는 것은 경합 케이스뿐이다. 실패 문구에는 초기화 시각(`resetsAt`, 윈도우가 epoch 정렬 고정이라 UTC 00:00 = KST 09:00)을 명시한다. KST 자정 정렬이 필요하면 `p_now`에 +9h를 넘기되 같은 버킷의 모든 호출자(peek 포함)가 동일하게 넘겨야 한다(구현 선택, 기본은 문구 명시).
3. 컨텍스트: `{stage, mode, modeConfirmed, business.name, fields:[{key, value(≤180자), basis}], nextQuestionLabel, history: 최근 12개 메시지 각 ≤300자, message}`. 총 8,000자(`intake-extraction.ts:12`)를 넘으면 오래된 history부터 제외.
4. 호출: 신규 `chatIntake(config, context, message)`(`intake-extraction.ts`, `boundedJson` 재사용). `allowFallback:false`, 20초, `effort:"low"`, `anthropicJsonSchema`, `maxOutputTokens`를 매개변수화해 chat은 800. [검토] Anthropic `cache:true`(`complete.ts:36-44`: "한 번만 부르는 곳에 켜면 쓰기 요금 1.25배만 내고 손해")는 **시스템 프롬프트 토큰이 공급자 최소 캐시 길이 이상일 때만** 켠다. Phase 3 완료 기준에 `[llm] call` 로그의 `cache_read > 0` 확인을 넣고, 미달이면 끄고 문서에 기록한다.
   - 스키마: `{message: string(1..600), candidates: [{fieldKey, value, quote, noteId}] ≤6, suggestions: string(≤40)[] ≤3, stageHint?: exploring|startup|operating}`.
   - **[이식] 프롬프트 규칙은 복사하지 않는다.** `coach.ts`의 `COACH_SYSTEM`(`:100-122`)에서 대화 규칙 문장을 export 상수로 분리해 chat 시스템 프롬프트와 legacy가 같은 문장을 import한다. 추출 규칙(`intake-extraction.ts:109-114`)과 "noteId는 history/message에 표시된 사용자 메시지 id만"을 덧붙인다.
5. 검증(`verifyChatCandidates`, 순수 함수, `lib/plan-builder/chat-candidates.ts`): `quote ⊂ 해당 user 메시지.text && value ⊂ quote`. 하나라도 어긋나면 **candidates 전체 폐기**, `message`는 유지. [검토] 응답 속 URL이 입력에 없으면 `IntakeError("unsafe_reply")`를 던져 ⑨의 failed 경로로 합류한다(메시지 보존, `chat-retry` 가능, `[business-intake-job]` failed 로그에 code). v1은 "message도 폐기"라고만 적고 job 상태를 정하지 않아 유료 호출 뒤 무응답이 남았다. 서비스 테스트에 추가.
6. **AI 값은 후보로만**: `IntakeCandidate`에 basis가 없고(`intake-types.ts:10`) 소유자 결정이 "확인 후 저장"이므로 proposal 값은 저장하지 않는다.
7. 저장(`updateIntakeJob` `:137-151` mutate): `current.status !== "running"`이면 `job_superseded`. `coach.messages.push({id: \`${job.messageId}-reply\`, role:"assistant", text, at})`; `coach.suggestions = suggestions`; `coach.revision += 1`(불변식 2); `documentRevision` 불변(불변식 3); 후보 `intake.candidates.push({id: \`${job.id}:${i}\`, ..., baseValue: job.baseValues[key], baseFieldRevision: job.baseFieldRevisions[key], status:"pending"})`(job 시작 시점 스냅샷, 불변식 5); [검토] **같은 `fieldKey`의 기존 pending 후보는 `superseded`로** 바꿔 리뷰 패널에서 "같은 항목은 하나만"·덮어쓰기 동의가 반복되지 않게 한다; `intake.stageHint = stageHint`(`coach.stage`는 `recomputeStage` 규칙만 따름, 불변식 13); `current.status="complete"`. `job.reply`는 채우지 않는다.
8. **[이식] 사용량 기록**: `onUsage`로 `job.usage = {elapsedMs, calls:[{provider, model, inputTokens, outputTokens}]}`를 legacy `lastGeneration` 형식(`coach-reply.ts:17-19`)으로 남긴다. `recordLlmUsage(..., context: {ownerHash, planId})`(선택 인자).
9. 실패(`:216-223`): `job.failed + error(code)`. 메시지는 이미 저장됨. 자동 재시도 없음(Workflow step 2분·retries 0, `section-workflow.ts:41`). 타임아웃 실패도 한도에서 되돌리지 않는다(단순성) — 게스트 한도 산정에 이를 반영한다(7장).

### 3.4 폴링과 표시

- `needsPolling`: `job.status queued|running`이면 2.5초(`BusinessIntake.tsx:201`), 숨김 탭 스킵·`visibilitychange` 즉시. [검토] `entry === "chat"`이고 탭이 보이면 유휴 20초 폴링 추가(3.1).
- 현재 턴: chat job 상태에 따라 `ReplyTyping`(aria-label "답변 준비 중") / 제안 칩 / 실패 라인. `:425`의 job 상태 블록은 `kind === "chat"`일 때 `job.reply` 블록을 만들지 않는다. [검토] "다시 요청" 버튼은 kind별로 분기한다(`chat` → `chat-retry`, `extract` → `extract`, `design` → `design`; `help`는 UI에서 제거되므로 `draft.help` 참조 삭제).
- **[이식] 대기 문구**: legacy `PHASES`(`page.tsx:29`) 문구를 재사용하고, 응답의 `durable`(3.2)이 true일 때만 "화면을 닫아도 서버에서 계속 만들어요"를 붙인다. `job.updatedAt` 기준 경과 시간으로 0~20초 "말씀하신 내용을 살펴보고 있어요", 20초 초과 "답변이 늦어지고 있어요. 메시지는 저장됐어요".
- 완료 스냅샷이 오면 `ConversationHistory`가 어시스턴트 말풍선을 렌더. [검토] `coach.suggestions` 칩은 **`draft.mode === "chat"`일 때만** 렌더한다. 안내 모드에서는 숨기되, 마지막 답변 아래 "제안 보기"를 누르면 모드가 `chat`으로 바뀌는 것이 화면에 보인 뒤 칩이 나타난다(암묵적 AI 전송 방지).
- 첫 AI 답변 직후 `ModeChoiceInline`(카드 3장, `stageHint` 프리셀렉트) 항상 노출(1.4, `modeConfirmed:false`일 때).
- 말풍선 시각은 공용 `components/coach-chat-ui.tsx`의 `CoachMessage`/`CoachSpeaker`를 재사용.
- [검토] `legacyJobActive: boolean`을 스냅샷에 노출해(`intakeSnapshot`에 `isCoachJobActive(readCoachJob(plan.answers))`) 플래그 전환 직후 legacy 답변이 진행 중인 plan에서 "이전 답변을 정리 중이에요" 대기 문구를 보이고 전송을 잠근다.

### 3.5 추출 후보 확인 UX

- `ExtractionReview`(`IntakePanels.tsx:260-`) 재사용. 위치는 어시스턴트 답변 직후.
- [검토] 라벨을 출처별 함수로: 제목 "대화에서 찾은 내용 N / 메모에서 찾은 내용 N", `<dt>`(`:276` "메모에서 찾은 값") → "대화에서 찾은 값 / 메모에서 찾은 값", 안내 문구(`:278`)도 동일 함수. 출처 판정 `chatCandidateSource(snapshot, candidate)` = `coach.messages.some(m => m.id === candidate.noteId)`.
- [검토] 기본 표시는 **최신 턴의 pending 후보**만, 나머지는 "이전 대화에서 찾은 N개" 접기.
- 충돌 규칙(`candidateConflict`; 서버 `intake-core.ts:194-198`) 변경 없음. 반영 → `applyIntakeCandidates` → `setField(basis:"user", messageId=사용자 메시지 id)` + 핵심 질문 답변 미러(`:198-201`) → `recomputeStage`(1.5) → `nextQuestion` 건너뜀. 확정 시에만 `documentRevision`이 오른다. 스레드 표시는 2.5의 규칙(프롬프트 합성 없음, 상태 줄).
- **[이식] 다른 화면의 끼어들기 차단(필수)**: `coach-expert-service.ts:30`의 `business_busy` 판정에 `readIntake(plan.answers)?.job` 활성도 포함한다. [검토] `preparePlan`(`route.ts:169-170`)도 legacy `__coach_job`만 확인하므로 intake job 활성(`readIntake(plan.answers)?.job`이 `queued|running`이고 120초 이내)이면 `prepareConflict()`로 응답한다. design job 실행 중 계획서 예약이 가능해 design 완료(`documentRevision+1`, `:208-210`)가 예약된 문서를 곧바로 stale로 만들던 틈을 막는다.

### 3.6 AI 불가·한도 시 폴백

모든 경우에 **사용자 메시지는 저장된다**(불변식 10). 실패 화면의 주 버튼은 "질문에 답해서 계속하기"(모드 전환; 미확정이면 카드 3장 인라인)로 통일한다(접근 C 이식).

| 상황 | 서버 | 화면 |
| --- | --- | --- |
| 킬 스위치 off 또는 `INTAKE_CHAT_MODEL` 미설정(`aiAvailable=false`) | 메시지 저장 + job `failed`("AI 답변은 지금 연결되지 않았어요") → 200 | 실패 라인 + 주 버튼 "질문에 답해서 계속하기". "다시 요청" 숨김 |
| 접수 시 peek로 한도 도달(`aiAllowed=false`) | 동일 저장, error에 사유·`resetsAt` → 200. **job·Workflow·폴링을 만들지 않는다**(v1은 202 → job → Workflow → CAS 3~4회 → 폴링 뒤 실패가 매 메시지 반복됐다) | 동일 + 비회원이면 로그인 링크. 스냅샷 `chatAllowance`로 전송 전에 입력창을 잠근다 |
| 실행 시 bump로 한도 도달(경합, `ai_limit`) | job `failed`, error "오늘 AI 대화 한도(N회)에 도달했어요. {resetsAt}에 초기화" | 동일 |
| 20초 타임아웃·`invalid_json`·`unsafe_reply` | job `failed`(code) | 실패 라인 + "다시 요청"(`chat-retry`, attempt ≤3) + "질문으로 이어가기" |
| 활성 job 점유(자동 `extract-pending` 포함) | **메시지 저장, job 없음, 200** + message | `-reply` 없는 마지막 메시지에 "답변 요청"(`chat-retry`) 버튼 |
| `legacy_busy` 409 | 저장 안 함(legacy 답변 진행 중) | pending 제거·`draft.chat` 보존·"이전 답변을 정리 중이에요", `legacyJobActive` 폴링 후 자동 해제 |
| `revision_conflict` 409 (chat) | 기존 CAS | `reload()` 후 새 requestId로 1회 자동 재전송(3.1) |
| 디스패치 유실(`queued && !dispatched`) | `currentSnapshot`에서 30초 넘으면 `dispatch_unconfirmed`로 조기 failed; claim이 120초 내 만나면 running 복귀(3.3 ①) | "다시 요청" |

### 3.7 모델 티어·킬 스위치·상한·비용 모델

**코드로 고정되는 값**: 턴당 유료 호출 1회, `allowFallback:false`, 20초, `effort:"low"`, 출력 800토큰, 입력 8,000자. legacy 대비: `completeCoachReply`는 1~2회, 6,000/6,500토큰, 각 120초, 폴백 허용 → 최악 4회.

**모델 선택(fail-closed 기본값)** [검토]: 신규 `resolveChatLLMConfig(hash)`는 `INTAKE_CHAT_MODEL`이 설정된 경우에만 config를 돌려주고, 미설정이면 `null` → `aiAvailable=false` → 3.6 첫 행. 모델명은 소유자가 env로 지정한다(7장 #1).

**런타임 킬 스위치** [검토]: `NEXT_PUBLIC_BUSINESS_INTAKE_V2`는 빌드 시 인라인되는 값이라(`page.tsx:33`, `intake-types.ts:46-48`) 전환·롤백 모두 `opennextjs-cloudflare build && deploy`(`package.json:12`) 재실행이다. 지출이 튀어도 재배포 외 수단이 없으므로 접수 시점(`intake-http.ts:78` 자리)에 읽는 런타임 var `INTAKE_CHAT_ENABLED`(wrangler `vars`, 서버 코드에서 `process.env`로 읽음)를 둔다. 꺼지면 chat만 `aiAvailable=false`(저장+실패 라인), 카드 경로는 영향 없음. Phase 4 게이트에 "킬 스위치 동작 확인"을 넣는다.

**전역 서킷 브레이커의 코드 기본값** [검토]: "미결정=무제한"을 막기 위해 코드에 보수적 기본값을 두고 env `INTAKE_CHAT_GLOBAL_DAILY`로 올린다. 기본값 = 게스트 일일 한도 × 예상 DAU(7장 #3에서 소유자가 두 수를 채움; 채우기 전 코드 기본값 200/일).

**횟수 상한(예산 계층)**:

| 층 | 값 | 확인 시점 |
| --- | --- | --- |
| IP | `business-intake-save` 120/10분 | 접수(`intake-http.ts:59` 기존) |
| 소유자 10분 | `business-intake-chat-10m`, 상한 24(제안) | 접수 peek(읽기) → 실행 bump(권위) |
| 소유자 일 | `business-intake-chat-daily`, 값 7장 #2 | 동일 |
| 전역 일 | `business-intake-chat-daily` key `"global"`, 값 7장 #3 | 동일 |
| 계정 동시성 | 소유자 전체 plan의 활성 intake job < 2 | 접수 |
| 사업당 | 메시지 ≤160 / 누적 ≤240,000자 / 턴 ≤60(제안) / 메시지 1건 ≤4,000자 / 활성 AI job 1개 / pending 후보 ≤24 | 접수 |
| 계정당 | coach plan ≤20(재사용 규칙으로 인사말은 새 plan을 만들지 않음) | 접수 |

**UX 규칙(예산 계층이 아님)**: `chat-retry` attempt ≤3(새 메시지는 새 호출이므로 비용 상한이 아니다). "사업당 활성 AI job 1개"도 계정 단위 동시성은 막지 못하므로 위 표의 "계정 동시성" 행이 실효 상한이다.

**비용 모델 — Phase 3 착수 전 측정 절차** [검토, blocker]: 이 저장소에 단가 근거가 없고 기억으로 단가를 적지 않는다. 대신 다음 절차로 표를 채워 소유자가 "승인/수정"만 하게 한다.
1. 격리 미리보기(플래그 1, 실제 키, `INTAKE_CHAT_MODEL` 후보 모델)에서 한국어 12턴 샘플 대화 3종(탐색/창업/운영)을 돌리고 `[llm] call` 로그(`complete.ts:264`)와 `job.usage`에서 턴별 `inputTokens/outputTokens`(system+history+message 포함)를 읽는다. 입력 상한이 문자 8,000(`intake-extraction.ts:12`)이라 토큰 기준이 아니고 한국어는 문자당 토큰 비율이 높으므로 실측만 믿는다.
2. 후보 모델별 단가는 공급자 공식 문서(Anthropic은 `claude-api` 스킬의 가격표, OpenAI는 공식 pricing 페이지)에서 측정 당일 값으로 가져와 출처·날짜를 표에 적는다.
3. 턴당 원가 = 평균 입력 토큰 × 입력 단가 + 800 × 출력 단가(보수적으로 출력 상한 사용). 실패·타임아웃 턴도 과금되므로 실측 실패율을 곱해 가산한다.
4. 역산: 월 예산(7장 #5) → 일 전역 상한 = 월 예산 ÷ 30 ÷ 턴당 원가(보수) → 계정 일일 한도 = 전역 상한 ÷ 예상 DAU(하한: 게스트 3, 회원 20이라는 legacy consult 값 `lib/consult/repository.ts:117-122`과 비교).

측정 결과 표(빈 칸은 Phase 3 착수 전 채움):

| 모델(env 값) | 평균 입력 토큰/턴 | 출력 상한 | 입력 단가(출처·일자) | 출력 단가 | 턴당 원가(보수) | 월 예산 기준 일 전역 상한 |
| --- | --- | --- | --- | --- | --- | --- |
| 미결 | 미결 | 800 | 미결 | 미결 | 미결 | 미결 |

**계측**: `completeText`가 `[llm] call` 로그와 `recordLlmUsage(kind="intake-chat")`를 남긴다. `context` 선택 인자로 `owner_hash/plan_id`를 채운다. 어드민 `kind`별 집계(`app/api/admin/stats/route.ts:124-129`는 현재 건수만 세고 kind 그룹이 없다)와 "오늘 대화 턴 수"는 **Phase 3b**(6장). `llmFailureAlert`(`lib/llm/alert.ts:17-35`) 자동 적용.

---

## 4. 안내 흐름 경로 명세

### 4.1 이번 계획에서 바뀌지 않는 것

- 카드 클릭 → `start {mode}` → `saveIntakeCommand` start(`intake-service.ts:80-93`) → `createIntake`(`intake-core.ts:18-27`) → `nextQuestion`. AI 호출 0회.
- 답변 → `answer`(`intake-core.ts:135-182`): `validatedAnswer`, `setField(basis:"user")`, `coach.messages`에 `"라벨: 값"`(`:182`), stage/ready 재계산(→ `recomputeStage`로 공용화만).
- 상세 질문 4개(`details`), 자유 메모(`message`, 서버 명령은 유지·UI 제거), 도움말(`help`, 동일), 사업안(`design`), 계획서(`prepare`).

### 4.2 이번 계획에서 추가·변경되는 것

- `start`에 `entry:"cards"`, `modeConfirmed:true` 기록. `!modeConfirmed`일 때 다른 mode의 `start` 허용 → `mode`·`modeConfirmed=true`·`recomputeStage`(1.5). `intake.answers`는 질문 id 키(`:144`)라 mode 변경으로 유실되지 않는다. **Phase 1.**
- `recomputeStage(coach, intake)` 헬퍼 추출. **Phase 1.**
- 질문 상단 "대화에서 말한 값 사용" 원클릭 칩(1.4).
- [검토] **질문 답변 모드의 입력창 기본 상태 = 접힘**: footer에는 [직접 입력] [자유 대화로 전환] 두 버튼만 둔다. [직접 입력]을 누른 질문에서만 textarea가 펼쳐지고, business 예외 2개(`startup.business`·`operating.business`, 설계서 §1.2)는 기본 펼침. `hybrid_text_chips`의 칩 조립 결과는 폼 안 "이대로 저장"으로 끝내고 composer 프리필을 쓰지 않는다. 안내 모드에서 `typedChoiceAnswer`(`model.ts`, 선택지 이름 타이핑을 답변으로 인정)는 끈다. v1은 이 요구에 placeholder 문구("직접 적을 때만")로만 대응했는데, 소유자 요구 "특별하지 않는 한 타이핑을 유도하지 않는다"에 대해 항상 열린 textarea·모드 토글·프리필 칩은 그 자체가 유도다. 브라우저 테스트: "핵심 질문 11개 중 business 예외 외에는 textarea가 DOM에 없다".
- 모드 셀렉터 `MODE_LABELS`(`BusinessIntake.tsx:24-28`) 3상태 → footer 2버튼. `memo`/`help` 서버 명령은 남기되 UI에서 제거. [검토] 그 필드를 참조하는 `keepDraftAsMemo`(`BusinessIntake.tsx:328-334`, `mode:"memo"`·`memo`), `AnswerHistory`의 "자유 메모로 가져오기"(`IntakePanels.tsx:248-`, `onKeepAsMemo`), `:425`의 `draft.help` 재요청은 **Phase 1 범위**에서 "자유 대화 입력으로 가져오기"(`draft.chat` 병합)로 바꾸거나 제거한다.

### 4.3 선택형 컨트롤 — 선택형 설계서 참조

현재 코드에서 안내 흐름의 `text`/`number` 질문은 인라인 필드가 없고 하단 입력창이 `directAnswer`로 동작한다(`BusinessIntake.tsx:343-344`). 소유자 요구를 완성하는 질문별 컨트롤은 **선택형 설계서**가 정의한다. 본 문서가 가져오는 결론(설계서 §1~§2, §6): 77개 질문 중 75개 선택 우선, 타이핑 예외 2개, 컨트롤 7종, 저장 형식·스키마·AI 호출 0 유지, 구현 단계 Phase 0~5.

### 4.4 두 문서의 접점과 조정

| 접점 | 선택형 설계서 | 본 문서 | 조정 |
| --- | --- | --- | --- |
| `typedEntryCommand` | §1.2 business 예외의 완화책 (1) "입력창 첫 문장으로 시작한 사용자는 `typedEntryCommand`로 이미 저장" | 2.4에서 폐기 | **본 문서가 우선.** 대화로 시작한 사용자의 business는 (a) AI 후보 확정 또는 (b) 안내 전환 후 business 질문(예외 2개 중 하나, 기본 펼침)에서 채워진다. 설계서 §1.2 문구는 Phase 2 착수 시 갱신 |
| 하단 입력창의 의미 | `hybrid_text_chips`·business 예외에서 composer는 보조 경로, `directAnswer` 유지(설계서 §6 Phase 2 `:279` "hybrid text 질문은 directAnswer 유지 … prefill_chips → composer 프리필") | 4.2: 질문 답변 모드의 입력창은 **기본 접힘**, "직접 입력" 클릭 또는 business 예외에서만 펼침; 칩 조립은 폼 안 "이대로 저장"; 자유 대화 모드에서 타이핑은 `chat` | [검토] **본 문서가 우선**(소유자 요구의 직접 대상). 설계서 §6 Phase 2 `:279`의 "directAnswer 유지"·"composer 프리필" 두 문구를 "접힘 기본, 직접 입력 opt-in, 폼 안 저장"으로 갱신한다. `directAnswer`(`:343`)는 `draft.mode === "answer" && composerExpanded` 조건을 갖는다 |
| 환영 화면 입력창 | 언급 없음 | 2.2: plan 없을 때 입력창 = 자유 대화 | 충돌 없음 |
| business 질문의 프리필 칩 | `prefill_chips`: 탭 → composer 프리필 → 전송 | business 예외는 기본 펼침이므로 프리필 칩은 그 펼쳐진 textarea에 채움 | 충돌 없음. 프리필된 상태에서 "자유 대화로 전환"을 누르면 `draft.chat`이 아닌 `draft.answers[business].text`에 남아 있어야 한다(드래프트 필드 분리, 5.3) |
| "대화에서 말한 값 사용" 칩(1.4) | 없음 | pending 후보를 질문 안에서 클릭 1회로 `answer` | 각 컨트롤 상단에 조건부 1개 칩. 화면 버튼 8개 규칙(설계서 §2)에서는 "직접 입력·미정"처럼 계산 제외 |
| 결함 1·2(Phase 0) | §5 실측 기록 | 6장 Phase 0 | 동일 내용. 라인 번호는 설계서 §5 기준 |
| `settleDraft`/409 복구의 `custom ? "candidate"` 버그 | §6 Phase 2: `custom && questionId === "candidate"`로 수정 | 해당 없음 | 설계서 범위. 본 문서 Phase 1이 `settleDraft`를 건드리므로 병합 충돌 주의 |
| 서버 미강제 항목(배타 칩·단계 제약) | §7 미결 | 해당 없음 | 설계서 범위 |

---

## 5. 데이터 모델·API 변경

### 5.1 명령(action) 목록

| action | 경로 | 상태 |
| --- | --- | --- |
| `start`, `answer`, `details`, `message`, `confirm-extraction`, `extract`, `extract-pending`, `help`, `design`, `prepare` | 기존(`intake-service.ts:18`) | 유지. `start`는 `entry/modeConfirmed` 기록과 `!modeConfirmed` 시 mode 확정 허용. `design`/`details`/`prepare`는 `mode_required` 검사 추가 |
| `chat` | 신규 | 사용자 메시지 저장 + (가능하면) chat job. plan 없으면 재사용 또는 생성 |
| `chat-retry` | 신규 | `-reply` 없는 마지막 메시지의 답변 요청. 메시지 추가 없음. attempt ≤3 |

`intakeCommandSchema`(`.strict()`) 유지. legacy 형태(`retry` 등)는 계속 거절된다.

### 5.2 타입 (`lib/plan-builder/intake-types.ts`)

| 타입 | 변경 | 호환 |
| --- | --- | --- |
| `IntakeCommand.action`(`:27`) | `+ "chat" \| "chat-retry"` | — |
| `IntakeJob`(`:11-18`) | `kind += "chat"`, `messageId?`, `dailyLimit?`, `attempt?`, `usage?`, `error`에 code 포함(`dispatch_unconfirmed`, `unsafe_reply`, `ai_limit` 등) | 모두 선택 필드 |
| `IntakeCandidate.status`(`:10`) | `+ "superseded"` | 기존 값 유지. `ExtractionReview`는 `pending`만 렌더하므로 영향 없음 |
| `IntakeState`(`:19-25`) | `entry?: "cards" \| "chat"`(undefined=cards), `modeConfirmed?: boolean`(undefined=true), `stageHint?: IntakeMode` | `readIntake`는 `version/answers/notes/candidates`만 검사 → `INTAKE_VERSION=1` 유지 |
| `IntakeSnapshot`(`:32-39`) | `intake` spread로 새 필드 자동 노출 + `legacyJobActive: boolean`, `chatAllowance?: {remainingToday, resetsAt}` | `isIntakePayload`는 추가 필드를 거부하지 않음 |
| `intakeGet`/`intakePost` 응답 | `durable: boolean`, plan 없음 응답에 `recentChatPlanId?` | 응답 레벨 필드 |
| `CoachState`(`coach.ts:29-37`) | **변경 없음** | |

### 5.3 클라이언트 드래프트 (`app/plan/chat/intake-ui/model.ts`)

- `ComposerMode` = `"answer" | "chat"`. `IntakeDraft.chat: string`, `composerExpanded?: boolean` 추가, `memo`/`help`/`introMessage` 필드 제거.
- [검토] **`parseDraft` 검증 조건 변경(`:110`)**: 현재 `!["answer","memo","help"].includes(mode) || typeof memo !== "string" || typeof help !== "string"`이면 드래프트 전체를 버린다. 그대로 두면 새 형식(memo/help 없음) 드래프트가 복원 시 전부 폐기되어 pending(requestId 고정 재전송)까지 잃는다. 조건을 `typeof chat === "string"` 기준으로 바꾸고, 구 드래프트는 먼저 `mode memo/help → chat`, `chat = [memo, help].filter(Boolean).join("\n\n")`로 정규화한 뒤 검증한다. 단위 테스트: "새 형식 드래프트의 pending이 복원된다", "구 형식 memo/help가 chat으로 병합된다".
- pending 액션 화이트리스트(`:113`) += `chat`, `chat-retry`. `settleDraft` += chat 분기.
- `typedEntryCommand`, `entryMessage` 삭제. 신규 `chatCandidateSource()`, `needsPolling`에 `idleIntervalMs`.

### 5.4 서버 저장소·마이그레이션

- 상태 변경은 `plan_states.data` JSON 내부 → 마이그레이션 없음.
- `bump_rate_limit`(`0018_rate_limits.sql`)은 bucket 문자열 인자 → 새 버킷에 마이그레이션 불필요. peek는 `rate_limits` 테이블 select(서비스 롤).
- `llm_usage` `kind="intake-chat"` 텍스트 태그. `owner_hash/plan_id`는 `context` 선택 인자로 채움.
- [검토] **SQL 마이그레이션 1건(0037) 필요**: `claim_plan_state`(`0036_intake_account_claim.sql:18-23`)와 demo-memory `claimGuestPlanState`(`plan-server-store.ts:220`)는 `__business_intake.state.job.status in ('queued','running')`이면 **나이와 무관하게** busy로 거절한다. intake job의 120초 만료는 채팅 화면의 GET/POST(`intake-http.ts:25-28`, `intake-service.ts:75-78`)에서만 실행되므로, 디스패치가 유실된 chat job이나 실행기가 죽은 running job이 남은 채 `/account`로 가서 로그인하면 아무도 만료를 실행하지 않아 로그인이 무기한 `PLAN_CLAIM_BUSY`("진행 중인 대화 또는 문서 작업이 있어요", `account-linking.ts:10`)로 실패한다. chat은 메시지마다 job을 만들어 발생 빈도가 훨씬 높다. 0037: busy 판정에 `(plan#>>'{answers,__business_intake,state,job,updatedAt}')::timestamptz > now() - interval '120 seconds'` 조건을 추가하고, demo-memory에도 같은 120초 조건을 넣는다. 추가로 `claimGuestProjects` 진입 시 게스트 상태의 활성 intake job에 `expireStaleIntakeJob`를 먼저 적용한다(둘 중 하나만으로도 막히지만 두 층을 둔다).

### 5.5 지켜야 하는 불변식

1~15, 19는 v1과 같다(요지: requestId 유일, revision CAS+1, documentRevision은 fingerprint 변경 시만, AI 값은 후보 경유, base 스냅샷은 job 시작 시점, quote/value 서버 재검증, 사업당 활성 job 1개, 120초 만료, 유료 호출 직전 fail-closed, 원문 선저장, 데이터≠지시·URL 금지, `intakePost` 단일 경로, stage는 사용자 선택에서만, ready 규칙, stateRevision 경로, prepare 위임). [검토]로 추가·정밀화:

- 1′. chat/chat-retry에서 "영수증 없음 + 메시지 id 있음"은 409가 아니라 멱등 200(3.2 ②).
- 7′. 슬롯 점유는 chat 메시지 저장을 막지 않는다(3.2 ⑦).
- 9′. 접수 시점은 읽기(peek), 실행 시점은 증가(bump). 409로 끝난 요청은 한도를 소비하지 않는다.
- 13′. `modeConfirmed:false`이면 stage는 `exploring`으로 고정, AI `stageHint`는 프리셀렉트 전용.
- 14′. `ready`는 `modeConfirmed !== false && business(user) 존재`. `design`/`prepare`/`details`는 `mode_required`를 `business_required`보다 먼저 검사.
- 16′. 계정 이전(claim)의 busy 판정은 120초 이내 갱신된 활성 intake job에만 적용.
- 20. 두 경로 전환: 안내 → 자유 대화는 `coach.messages`가 컨텍스트; 자유 → 안내는 확정 후보가 다음 질문을 건너뛰게 함. 유형 확정은 전환과 별개의 필수 단계.
- 21. legacy 활성·비stale 작업이 있으면 intake `start`/`chat`은 409 `legacy_busy`; stale만 failed 이관.

---

## 6. 단계별 구현 계획

인원: **개발 1인 기준 dev-day**로 적는다(v1 "13일"은 인원 표기가 없고 Phase 2·3 병행이 2인을 전제했다). 캘린더 일수는 게이트 대기(키 교체·소유자 결정·24시간 관찰)를 더해 별도로 적는다. 플래그 `NEXT_PUBLIC_BUSINESS_INTAKE_V2`는 **빌드 인자**다: 전환·롤백 = 재빌드·재배포(`package.json:12`; 사용자 메모리 "배포가 멈출 때": 재배포가 즉시 보장되지 않는다). 런타임 스위치는 `INTAKE_CHAT_ENABLED`(3.7).

### Phase 0 — 즉시 수정(작업 트리에 이미 있음: 검증·커밋)

[검토] 대상은 **5개 파일**(`git status --short`: `BusinessIntake.tsx`, `IntakePanels.tsx`, `model.ts`, `intake-core.ts`, `intake-questions.ts` 수정 상태). v1은 4개로 적어 `BusinessIntake.tsx`의 diff가 검증 범위 밖이었다.

| 항목 | 파일:함수 | 내용 |
| --- | --- | --- |
| multi 라벨 버그 | `intake-core.ts` `intakeValueLabel`, `intakeSnapshot`; `intake-questions.ts` | 복수 선택 답변이 내부 값으로 표시되던 결함 |
| period 프리셋(임시) | `intake-questions.ts` 프롬프트; `model.ts` `periodPresetRange`; `IntakePanels.tsx` `QuestionForm`; `BusinessIntake.tsx` 관련 diff | 프리셋 칩 + 직접 선택. 전송 형식 불변 |

- 완료 기준: 타입 검사, `reliability-tests.mts` 전체 통과, 격리 미리보기 확인, 5개 파일 diff 전부 검토.
- 작업: 0.5 dev-day.

### Phase 1 — 환영 화면 분리 + 유형 확정 규칙 (2장, 1.5)

| 파일:함수 | 변경 |
| --- | --- |
| `app/plan/chat/intake-ui/model.ts` | `typedEntryCommand`·`entryMessage` 삭제, `ComposerMode` 2상태, `IntakeDraft.chat/composerExpanded`, `parseDraft`(검증 조건 `:110` 변경·화이트리스트·구 mode 병합), `settleDraft(chat)`, `needsPolling` idle |
| `app/plan/chat/BusinessIntake.tsx` | **`send()` 가드 `:236` 완화(start\|chat)** [검토], `submitComposer` `!plan` 분기 → `chat`, `beginReply` 조건에 chat 미포함 고정, footer 2버튼(직접 입력/자유 대화로 전환)·접힘 기본·placeholder/aria-label/maxLength, `introMessage` 효과(`:306-309`) 삭제, `hasLocalInput`, `keepDraftAsMemo`(`:328-334`)·`:425` `draft.help` 참조 정리 [검토], 카드 클릭 시 `draft.chat` 처리(2.6) |
| `app/plan/chat/intake-ui/IntakePanels.tsx` | `EntryChoices` 두 구역·최근 대화 링크·`initialMessage` 블록 제거, `ConversationHistory` 첫 말풍선 조건 + **프롬프트 합성을 `"라벨: "` 접두 메시지로 한정** [검토], `AnswerHistory` "자유 메모로 가져오기" 교체 [검토], `BusinessSummary` 미확정 표시(1.5), `ModeChoiceInline` |
| `app/plan/chat/intake.module.css` | 구역 소제목·구분선, 접힘 footer, 인라인 카드 |
| `lib/plan-builder/intake-types.ts` | `IntakeState.entry/modeConfirmed`, `IntakeCommand.action += "chat"` |
| `lib/plan-builder/intake-core.ts` | **`recomputeStage` 추출 + `modeConfirmed` 규칙** [검토] |
| `lib/plan-builder/intake-service.ts` | `start`에 `entry/modeConfirmed` 기록, **`!modeConfirmed` 시 `mode_conflict` 완화·mode 확정** [검토], `design`/`details` `mode_required`, `planType` 조건, `legacy_busy`(1.2 ②), chat 분기는 "메시지 저장 + job failed('AI 대화는 준비 중이에요')"로만 동작(실행기는 Phase 3) |
| `lib/plan-builder/intake-http.ts` | `prepare` 전달 전 `mode_required`, `legacyJobActive` 노출 |
| `app/api/plan/chat/route.ts` | `postLegacyChat` `message`에 `intake_plan` 409(턴 차감 전) [검토], `preparePlan`에 `mode_required` 방어 |
| `app/plan/chat/page.tsx` | legacy `BusinessCoach`: `intake_plan` 코드 처리(입력창 닫고 안내) |

- 갱신할 테스트 단언:
  - `business-intake-ui.test.tsx`: import(`:11`) 정리, `typedEntryCommand`(`:33-37`)·`entryMessage`(`:38-39`) 단언 삭제 → "입력창 문장은 `chat`", "EntryChoices 두 구역·intro 없음", "parseDraft 구 mode 병합 + 새 형식 pending 복원", "채팅 메시지는 확정 후에도 질문 프롬프트가 삽입되지 않는다", "미확정 요약 패널에 카드 3장·eyebrow 없음", 소스 정규식: "`send()` 가드가 chat 통과", "`beginReply` 조건에 chat 없음".
  - `business-intake-service.test.ts`: "chat 시작 → 후보 확정 → ready=false → design/details 400 `mode_required` → start{operating} → ready=true, planType=operating, answers 유지", "chat으로 시작한 사업에서 카드 3장 중 어느 것을 눌러도 start 성공", "legacy 활성 비stale → `legacy_busy`, stale → 이관". 기존 `:152, :173` 유지.
  - `business-intake-prepare.test.ts`: 플래그 0에서 헤더 없는 POST가 `postLegacyChat`에 도달하고 응답 형태가 `publicPlan`임, `__business_intake` plan의 `message`가 409 `intake_plan`이며 consult 턴이 차감되지 않음, `prepare`는 `modeConfirmed:false`면 400.
  - `chat-entry-style.test.ts`(`:19-24`) 유지 + `reliability-tests.mts` suites에 `chat-entry-style` push.
  - `business-intake-browser.mts`: "첫 문장 Enter → 200/202, URL `?planId=`, 사용자 말풍선"; 뷰포트 4종 `#intake-memo` 대체 셀렉터; 모드 버튼 → footer 2버튼.
- 완료 기준: 카드는 `start`, 타이핑은 `chat`으로 서버에 도달; 미확정 사업에서 유료 결과물이 열리지 않음; 플래그 0 회귀는 `chat-entry-style` + `business-intake-prepare`로 증명.
- 작업: **3 dev-day**(v1 2일 + 유형 확정 규칙·롤백 안전망·footer 접힘 이동분).

### Phase 2 — 안내 흐름 선택형 전환 (4.3, 선택형 설계서 §6 Phase 0~5)

세부는 설계서 §6이 소유한다. 접점:

| 설계서 단계 | 본 문서와의 접점 |
| --- | --- |
| Phase 0 | 본 문서 Phase 0과 동일 |
| Phase 1 카탈로그·규칙 | 서버 lib만. `intake-core.ts`는 양쪽이 건드리므로(`recomputeStage`는 본 문서 Phase 1에서 선행) 커밋 순서 조율 |
| Phase 2 클라이언트 컨트롤 | 본 문서 Phase 1 선머지. 설계서 `:279` "directAnswer 유지·composer 프리필" 문구를 4.4의 "접힘 기본·직접 입력 opt-in·폼 안 저장"으로 갱신하고 그 안에서 작업 |
| Phase 3 메시지·요약·표시 | `ConversationHistory` 라벨 재계산은 2.5의 규칙과 같은 함수 |
| Phase 5 검증(§8) | 본 문서 Phase 4 게이트에 포함 |

- 완료 기준: 핵심 질문 11개를 business 예외 2개를 제외하고 타이핑 없이 완료(브라우저 테스트: 예외 외 textarea DOM 없음). 서버 검증 코드 무변경.
- 작업: 카탈로그·규칙 1.5 + 클라이언트 컨트롤 7종 2 + 표시·검증 1 = **4.5 dev-day** + [검토] **카탈로그 콘텐츠 검수(11업종×4슬롯 칩·가격 범위 세트, 설계서 부록 A/B) 1 day(소유자 또는 도메인 검수자)** 별도.

### Phase 3a — 자유 대화 출시 경로 (3장)

| 파일:함수 | 변경 |
| --- | --- |
| `lib/plan-builder/intake-types.ts` | `IntakeJob.kind += "chat"`, `messageId/dailyLimit/attempt/usage`, `IntakeCandidate.status += superseded`, `IntakeState.stageHint`, `action += "chat-retry"`, 스냅샷 `chatAllowance` |
| `lib/plan-builder/intake-service.ts` | `intakeCommandSchema`, `saveIntakeCommand`(chat/chat-retry 분기: plan 재사용, 인사 고정 답변, 슬롯 점유 시 저장만, 멱등 200, 413 `chat_limit`, 턴 60, 후보 24), `newIntakeJob`(chat), `executeIntakeJob`(chat 분기, 세 버킷 bump, `unsafe_reply`, fieldKey 대체, usage, `dispatch_unconfirmed` 복귀) |
| `lib/plan-builder/intake-extraction.ts` | `boundedJson`(`maxOutputTokens`·`cache` 매개변수화), `chatIntake()`·`chatSchema`·`chatSystem` |
| `lib/plan-builder/chat-candidates.ts`(신규) | `verifyChatCandidates()` |
| `lib/plan-builder/chat-allowance.ts`(신규) | `peekChatAllowance()`(읽기), 버킷 이름·기본값·`resetsAt` 계산 |
| `lib/plan-builder/coach.ts` | `COACH_SYSTEM` 규칙 문장 export 분리(문자열 동일성 단언) |
| `lib/plan-builder/intake-http.ts` | `needsAI`, `resolveChatLLMConfig`+`chatEnabled` 게이트, peek, 계정 동시성, `durable`, `recentChatPlanId`, `currentSnapshot` 30초 `dispatch_unconfirmed`, dispatched 기록 재시도 |
| `lib/plan-builder/coach-expert-service.ts` | `business_busy`에 intake job 포함(`:30`) |
| `app/api/plan/chat/route.ts` | `preparePlan`에 intake job 활성 → `prepareConflict()` [검토] |
| `lib/llm/config.ts` | `resolveChatLLMConfig()`(미설정 → null) |
| `lib/llm/usage.ts` | `recordLlmUsage(..., context?)` 선택 인자(기존 호출부 무변경) |
| `lib/llm/complete.ts` | [검토] `LLM_ENDPOINT_OVERRIDE`(`NODE_ENV !== "production"` && 합성 manifest일 때만) — 공급자 URL 하드코딩 3곳(`:99, :170, :347`)에 적용 |
| `scripts/productization-preview.mts` | 고정 응답 LLM 픽스처 서버 기동(모의 공급자) |
| `plan-server-store.ts` + `supabase/migrations/0037_intake_claim_stale_job.sql` | claim busy 120초 조건(5.4) |
| `app/plan/chat/BusinessIntake.tsx` | chat job 잠금(모드 무관), 전송 직전 GET revision 채택, `revision_conflict` 1회 자동 재전송, `legacy_busy` 처리, 낙관적 말풍선, job 블록 kind별 재요청, "답변 요청" 버튼, `chatAllowance` 잠금, "남은 N개 항목을 질문으로" CTA, 대기 문구/`durable` |
| `app/plan/chat/intake-ui/IntakePanels.tsx` | `ExtractionReview` 출처별 라벨 함수·최신 턴 기본 표시, `ModeChoiceInline`(stageHint 프리셀렉트), `ReplyTyping` aria-label, 실패 라인, 저장됨 상태 줄, 제안 칩(chat 모드만) |
| `app/plan/chat/intake-ui/model.ts` | `chatCandidateSource()`, `needsPolling` idle |
| `app/plan/chat/intake.module.css` | 말풍선 상태, 제안 칩, 인라인 카드, 상태 줄 |

- 갱신할 테스트 단언:
  - `business-intake-service.test.ts` 신규: "chat이 plan을 만들고 메시지 id=requestId", "24시간 내 빈 chat plan 재사용", "인사만 → AI 0회 고정 답변", "AI 불가 → 저장 + failed + 200", "peek 한도 → 저장 + failed + job 없음(202 아님)", "활성 job 중 chat → 저장 + job 없음 200", "chat-retry가 `-reply` 없는 마지막 메시지에 job 생성, attempt 3 초과 429", "chat job 완료가 `-reply`·suggestions·후보(pending)를 만들고 fields 불변, documentRevision 불변", "같은 fieldKey 기존 pending → superseded, pending ≤24", "verbatim 실패 → 후보 전체 폐기·message 유지", "URL 미검증 → `unsafe_reply` failed, 메시지 보존", "실행 시 세 버킷 중 하나 초과 → ai_limit(fail-closed)", "영수증 잘린 chat 재전송 → 멱등 200", "modeConfirmed=false에서 stageHint가 stage를 바꾸지 않음", "중복 실행 1회 호출"(`:408` 패턴), "메시지 160/턴 60 → 413", "`dispatch_unconfirmed` 120초 내 claim → running". 기존 `:507` 유지.
  - `scripts/chat-candidates.test.ts`(신규) + `reliability-tests.mts` push. `business-intake-extraction.test.ts`: `chatIntake` 스키마.
  - `plan-account-linking.test.ts`: "121초 지난 running intake job은 claim을 막지 않는다", "119초 job은 busy".
  - `business-intake-ui.test.tsx`: 출처 라벨, `ModeChoiceInline`, 실패 라인 버튼 2개, 칩은 chat 모드에서만, 저장됨 상태 줄.
  - `business-intake-browser.mts`(모의 공급자): "문장 → 202 → 폴링 → 어시스턴트 말풍선 → 카드 인라인 → 후보 확인 → 반영 → 요약 반영", "남은 항목을 질문으로 → 질문", "안내 중 '자유 대화로 전환' → chat", "두 탭 교차 전송 충돌 잠금 없음", "킬 스위치 off → 저장+실패 라인". 모의 공급자가 범위를 넘으면 브라우저는 "AI 불가 경로"만 고정하고 말풍선·후보 렌더는 `renderToStaticMarkup`으로 대체한다고 명시.
  - `llm.test.ts`/`llm-usage.test.ts`: `recordLlmUsage` 기존 시그니처 호출과 `[llm] call` 로그 형식 동일성.
  - `business-design.test.ts`, `business-coach-job.test.ts`, `coach-job-status.test.ts`: 기본값 무변경으로 통과.
- 완료 기준: 위 단언 전부, `reliability-tests.mts` 전체 통과, 격리 미리보기(플래그 1, 모의 공급자)에서 왕복 전환 데이터 손실 없음. `[llm] call` 로그에 `kind=intake-chat`, `allowFallback:false`, 20초, 800토큰; `cache:true`를 켰다면 `cache_read>0`.
- 작업: **6 dev-day** + 모의 공급자 인프라 **1 dev-day** = 7.

### Phase 3b — 계측·부가 UI (출시 경로 밖, 병행 가능)

| 항목 | 내용 |
| --- | --- |
| 어드민 | `app/api/admin/stats/route.ts` kind별 그룹 쿼리(현재 `:124-129` 건수만), `app/admin/page.tsx` "오늘 대화 턴 수"·`kind=intake-chat` 실패율 |
| 제안 칩 폴리시·"대화에서 말한 값 사용" 칩 | 1.4·3.4 |
| PHASES 문구 다듬기 | 3.4 |
| 캐시 효과 측정 보고 | 3.3 ④ |

- 작업: **2 dev-day**.

### Phase 4 — 통합·출시 게이트

| 항목 | 내용 |
| --- | --- |
| 소유자 결정 확정 | 7장 항목 전부. **비용 모델 표(3.7)가 채워진 뒤** 수치 승인 |
| 키 교체 | HANDOFF §9 키 노출 이력 → 교체 |
| [검토] 운영 인프라 | `wrangler.jsonc` vars에 `RATE_LIMIT_BACKEND=supabase`, `INTAKE_CHAT_ENABLED`, `INTAKE_CHAT_MODEL`, `INTAKE_CHAT_GLOBAL_DAILY` 추가; 운영 DB에 `rate_limits` 테이블·purge 잡·0037 적용 확인 |
| [검토] 킬 스위치 리허설 | `INTAKE_CHAT_ENABLED=0`으로 chat이 저장+실패 라인으로 떨어지고 카드 경로는 무영향임을 운영에서 확인 |
| [검토] 플래그 전환 절차 | 플래그는 빌드 인자 — 전환/롤백 = 재빌드·재배포(예상 소요 N분을 리허설로 측정), 값을 넣는 위치(배포 워크플로 env)를 명시. **롤백 리허설(0→1→0 빌드)**을 게이트 항목으로 |
| 활성 legacy 작업 | `legacy_busy`(1.2 ②)가 코드로 막으므로 체크리스트는 보조. 어드민에 활성 `__coach_job` 수 표시 |
| 운영 검증 | 플래그 1 배포 후 `wrangler tail`로 `[llm] call`·`[business-intake-job]` 확인. 어드민 집계·`llmFailureAlert` |
| 문서 | `HANDOFF.md` §2·§9, `docs/business-intake-implementation-2026-09-16.md` 자유 대화 절, 선택형 설계서 §1.2·§6 Phase 2 문구 갱신 |
| 롤백(플래그 0) | 화면·서버 경로가 오늘과 동일 + `intake_plan` 안전망: chat plan에서 legacy 화면은 입력창을 닫고 "새 진단 화면에서 이어갈 수 있어요"를 보이며 consult 턴을 차감하지 않는다 |

- 완료 기준: 게이트 전부 체크, 플래그 1 배포 후 24시간 `llmFailureAlert` 무경보, 일일 버킷 카운터가 비용 모델 예상 범위.
- 작업: **1 dev-day** + 대기: 키 교체·소유자 결정(소유자 일정), 24시간 관찰 1일.

### 작업일 합계

개발 1인 기준: Phase 0 0.5 + Phase 1 3 + Phase 2 4.5 + Phase 3a 7 + Phase 3b 2 + Phase 4 1 = **18 dev-day**. 출시 경로만(3b 제외) 16. 여기에 카탈로그 검수 1 day(검수자), 소유자 결정·키 교체 대기, 24시간 관찰 1일이 캘린더에 더해진다. 2인이면 Phase 1 머지 후 Phase 2와 3a를 병행할 수 있다(공유 파일 `intake-core.ts`·`BusinessIntake.tsx`·`IntakePanels.tsx`·`model.ts` 커밋 순서 조율).

---

## 7. 소유자가 결정해야 할 항목

| # | 항목 | 현재 근거 | 제안/기본값 | 결정 필요 이유 |
| --- | --- | --- | --- | --- |
| 1 | 자유 대화 AI 모델(`INTAKE_CHAT_MODEL`) | `resolvePlanningLLMConfig`는 `gpt-6-astra`/`claude-sonnet-5`(`config.ts:39-43`); 운영 `wrangler.jsonc:39`엔 `OPENAI_MODEL: "gpt-5.6-sol"`만 | **미설정 = chat 비활성(fail-closed)**. 3.7 측정 표를 채운 뒤 저비용 티어 모델명을 env로 지정 | 기본값이 최고가 모델이 되는 것을 막고, 단가는 공급자 문서 실측으로만 |
| 2 | 계정당 일일 대화 턴 | legacy consult 비회원 3/회원 20(`repository.ts:117-122`) | 3.7 역산 결과로 채움. **함의**: 비회원 3턴이면 자유 대화는 사실상 3턴 티저 뒤 안내 흐름·로그인 유도로 끝난다. 대안: 비회원 8~10 / 회원 무제한 + 전역 서킷 | 실패·타임아웃 턴도 소비하므로 산정에 실패율 반영 |
| 3 | 전역 일일 서킷(`INTAKE_CHAT_GLOBAL_DAILY`) | 없음 | 코드 기본 200/일(미결정 시 안전값). 최종값 = 월 예산 ÷ 30 ÷ 턴당 원가(보수) | "미결정=무제한" 방지 |
| 4 | 사업당 대화 턴 상한 | 없음 | 60턴 | 한 사업의 예산 독점 방지 |
| 5 | 운영 월 예산과 경보 임계 | HANDOFF §9: 합성 장부 상한 $30, 예약 $18.99, 남은 $11.01 — 운영 예산 아님 | **미결(금액은 소유자만 정할 수 있음)**. 2~3의 수치는 이 금액에서 역산 | |
| 6 | 10분 버킷 | chat 전용 `business-intake-chat-10m` 24/10분(peek/bump) | 분리(v1 "공유"에서 변경) | 409로 끝난 요청이 한도를 깎지 않게 하려면 chat은 peek/bump 구조가 필요해 분리가 자연스럽다 |
| 7 | 출시 시점(플래그 1 빌드) | 운영은 플래그 0 | Phase 4 게이트 통과 후. 재빌드·재배포 필요 | 결정 1~5 없이 켜면 매 메시지 유료 호출 |
| 8 | 키 교체 | HANDOFF §9 노출 이력 | 출시 전 | 소유자만 가능 |
| 9 | 롤백 시 chat plan 처리 | `intake_plan` 안전망(1.2 ①) | 안전망 수용(legacy 답변 생성은 하지 않음) | 예전 엔진 격리 유지 |
| 10 | business 질문 타이핑 예외 2개 | 설계서 §1.2 | 예외 수용 + 기본 펼침 + 프리필 칩 | '특별한 경우'로 인정할지 |
| 11 [검토] | 안내 모드 입력창 접힘 기본 | 4.2 | [직접 입력] opt-in | 설계서 §6 Phase 2 문구 갱신을 수반 |
| 12 [검토] | 카드 클릭 시 적어 둔 문장 처리 | 2.6 | "첫 대화로 보내기 / 지우기" 인라인 선택 | 카드 경로에서 사용자 선택으로 1회 AI 호출이 발생할 수 있음 |
| 13 [검토] | 예상 DAU(전역 상한 기본값 계산용) | 없음 | 미결 | #3 기본값 산정 |
| 14 [검토] | 일일 윈도우 정렬 | `bump_rate_limit` epoch 고정(UTC 00:00 = KST 09:00) | 문구에 초기화 시각 명시(기본) / KST 정렬은 `p_now` 오프셋(선택) | 사용자 체감 |

---

## 8. 위험과 대응

| 위험 | 근거 | 대응 |
| --- | --- | --- |
| chat 답변 저장이 `coach.revision`을 올려 다른 명령이 `revision_conflict` | design `:209`과 같은 정책 | chat job 활성 중 모드 무관 잠금; chat/chat-retry/details는 전송 직전 GET revision 채택 + chat은 1회 자동 재전송; 유휴 20초 폴링. 값 의존 명령만 conflict 잠금 유지. 대안 "답변을 `job.reply`에만"은 이력 손실이라 불채택 |
| 유형 미확정 사업에서 잘못된 유형의 유료 결과물 | `intake-core.ts:179-181, 203-205`, `intake-service.ts:126`, `route.ts:168, 172` | 1.5 규칙(`mode_required`, ready=false, planType 미갱신, 카드 인라인 필수) |
| 운영 예산·상한·모델 미결정 상태에서 플래그 1 | HANDOFF §9 | 모델 미설정 = 비활성, 전역 기본값 200, 킬 스위치, Phase 4 게이트 |
| 지출 급증 시 재배포 외 수단 없음 | 플래그는 빌드 인자 | `INTAKE_CHAT_ENABLED` 런타임 스위치 |
| 10분 버킷이 isolate별·fail-open | `rate-limit.ts:72-99`, 운영 vars 누락 | chat은 peek/bump로 `bump_rate_limit` 직접 호출(fail-closed); Phase 4에 `RATE_LIMIT_BACKEND=supabase` |
| 한도 초과 메시지마다 job·Workflow·폴링 낭비 | v1 실행 시점 검사 | 접수 peek로 job 없이 저장+실패 200 |
| 계정 이전이 죽은 intake job에 무기한 busy | `0036:20-23`, `plan-server-store.ts:220` | 0037 + demo-memory 120초 조건 + claim 전 만료 |
| 플래그 전환 중 legacy 답변과 chat 유료 호출 겹침 | `intake-service.ts:70-73`, Workflow 8분 | `legacy_busy` 409 + `legacyJobActive` 대기 문구 |
| 롤백 후 chat plan에서 502 반복·턴 차감 | `route.ts:297, 311-318`, `coach-job.ts:27` | `intake_plan` 409 안전망(턴 차감 전) |
| 슬롯 점유로 chat 원문 유실 | v1 3.2 ⑤ | 저장 우선, job 없음, "답변 요청" 버튼 |
| 20초 상한이 history 12개+컨텍스트에 빡빡 | design은 60초 | 메시지는 남고 `chat-retry`. 실패율 높으면 출력/history부터 줄임 |
| verbatim 실패 시 후보 전체 폐기 → "대화에서 찾은 내용"이 드묾 | fail-closed 정책 | 유지. 프롬프트 강조·스키마 호환 확인. 안내 전환이 대안 |
| pending 후보 누적·반복 충돌 | `MAX_CANDIDATES=12`는 1회 상한 | fieldKey 대체 superseded, 전체 24, 최신 턴만 기본 표시 |
| 디스패치 유실 → 거짓 실패 → 두 번째 Workflow | `intake-http.ts:50` | dispatched 재시도, `dispatch_unconfirmed` 120초 복귀 |
| Anthropic 캐시가 손해 | `complete.ts:41-42` | 최소 길이 이상일 때만, `cache_read` 확인 |
| 브라우저 회귀에 모의 공급자 없음 | `complete.ts:99, 170` 하드코딩 | `LLM_ENDPOINT_OVERRIDE`(비운영·합성 한정) + 픽스처 서버, 1 dev-day |
| 안내 모드에서 textarea·칩·토글이 타이핑을 유도 | `BusinessIntake.tsx:343-346, 435-448` | 접힘 기본, 직접 입력 opt-in, 폼 안 저장, `typedChoiceAnswer` off |
| 자유 대화 말풍선이 확정 후 설문 Q&A로 재렌더 | `IntakePanels.tsx:231-240` | 프롬프트 합성을 `"라벨: "` 접두 메시지로 한정, 상태 줄 |
| `parseDraft`가 새 형식 드래프트를 폐기 | `model.ts:110` | 검증 조건 변경 + 구 형식 병합 |
| 인사말마다 plan 생성 → plan_limit | `intake-service.ts:62, 65-68` | 24시간 빈 chat plan 재사용 + 인사 고정 답변 |
| 영수증 128 vs 메시지 160 불일치 | `:61, :122` | chat 멱등 200 + 보존 256 |
| 프롬프트 인젝션 | 사용자 메시지·history가 입력 | "데이터, 지시 아님", URL 필터(`unsafe_reply`), stage/ready 미반영 |
| `IntakeWorkspace` 비대화 | `BusinessIntake.tsx` 단일 함수 | 스레드 렌더는 `intake-ui/` 표현 컴포넌트로, fetch/상태는 부모 |
| 네 파일을 Phase 1·2·3이 모두 건드림 | 설계서 §7 | Phase 1 선머지, 기능별 커밋, 각 커밋 전 `git diff HEAD` |

---

## 부록 A. 심사에서 채택한 이식(graft) 항목 대조표

| 출처 | 항목 | 반영 위치 |
| --- | --- | --- |
| A | `completeCoachReply` options 객체(legacy 비용 하드닝) | 별도 커밋, 범위 밖·병행 권고 |
| A | 전역 일일 서킷 브레이커 | 3.3 ②, 3.7(코드 기본값), 7장 #3 |
| A | 사업당 대화 턴 상한 | 3.2 ③, 7장 #4 |
| A | PHASES·durable 문구 | 3.4(`durable`은 응답 불리언) |
| A | "대화에서 말한 값 사용" 칩 | 1.4, Phase 3b |
| A | `COACH_SYSTEM` 규칙 문장 export 분리 | 3.3 ④ |
| A | `lastGeneration` 형식 사용량 기록 | 3.3 ⑧ |
| A | 재시도 attempt ≤3 | 3.2(UX 규칙) |
| A | 어드민 집계, `recordLlmUsage` 컨텍스트 | 3.7 계측, Phase 3b(선택 인자) |
| A | sessionStorage 구 mode 매핑 | 5.3 |
| C | `coach-expert-service.ts:30` busy에 intake job | 3.5 |
| C | 실패 시 "질문에 답해서 계속하기" 주 버튼 | 3.6 |
| C | `queued && !dispatched` 30초 조기 failed | 3.6(`dispatch_unconfirmed`) |
| C | 서버 `start` questionId/value 원자 처리 유지 | 2.4 |
| C | `ConversationHistory` 첫 말풍선 `legacyImported` 생략 | 2.5 |
| C | 플래그 전환 체크리스트 | Phase 4(보조; 주 방어는 `legacy_busy`) |
| C | 플래그 0 롤백 회귀 테스트 | Phase 1(`chat-entry-style` + `business-intake-prepare`) |

---

## 9. 검토 반영 기록

v1(2026-09-16 초판)에 대한 회의적 검토 41건의 처리. "반영"은 본문에 해결안이 들어간 것, "미결"은 해결안 구조는 넣었으나 수치·금액을 소유자가 정해야 하는 것.

### 9.1 blocker

| # | 관점 | 지적 요지 | 처리 | 반영 위치 |
| --- | --- | --- | --- | --- |
| B1 | 보호 장치 | `modeConfirmed:false`를 stage/ready/planType/prepare/design 어디서도 보지 않아 유형 미선택 상태에서 유료 결과물이 열림 | 반영 | 1.5(`recomputeStage` 규칙, `mode_required`, planType 조건, 카드 인라인 필수), Phase 1 테스트 |
| B2 | 소유자 결정 | 같은 문제의 제품 측면(운영 사장이 '창업' 문서를 받음), planType·eyebrow·챕터 | 반영 | 1.3 표 "유형 확정" 행, 1.4, 1.5 화면 규칙 |
| B3 | 비용·출시 | 비용 모델 없음, 기본 모델이 최고가 티어로 폴백 | 반영(구조) + **미결(수치)** | 3.7 `resolveChatLLMConfig` null 기본, 측정 절차·표 템플릿·역산식; 7장 #1·#3·#5·#13 |

### 9.2 major

| # | 관점 | 지적 요지 | 처리 | 반영 위치 |
| --- | --- | --- | --- | --- |
| M1 | 보호 장치 | claim busy가 죽은 intake job에 무기한 | 반영 | 5.4(0037 + demo-memory + claim 전 만료), 5.5 16′, Phase 3a, 8장 |
| M2 | 보호 장치 | `send()` `:236` 가드가 환영 화면 chat을 버림 | 반영 | 2.1, 2.3, Phase 1 표·테스트 |
| M3 | 보호 장치 | chat job 완료 revision+1이 안내 모드 답변과 충돌 → 전체 잠금 | 반영((a) 모드 무관 잠금 + chat만 (b) 자동 재전송) | 3.1, 8장 1행 |
| M4 | 소유자 결정 | 후보 확정 후 자유 말풍선이 설문 Q&A로 재렌더, 연필이 채팅 원문을 시드 | 반영 | 2.5(프롬프트 합성 규칙), Phase 1 테스트 |
| M5 | 소유자 결정 | 안내 모드 textarea·토글·프리필이 타이핑 유도 | 반영 | 4.2(접힘 기본), 4.4 2행(설계서 문구 갱신), 7장 #11 |
| M6 | 소유자 결정 | 두 탭·폰+PC에서 `revision_conflict` 잠금 반복 | 반영 | 3.1(전송 직전 GET revision, 자동 재전송, 유휴 폴링), 브라우저 테스트 |
| M7 | 소유자 결정 | 롤백 후 chat plan에서 502·턴 차감 반복 | 반영 | 1.2 ①(`intake_plan` 409), Phase 1 route.ts·page.tsx, Phase 4 롤백 행, 7장 #9 |
| M8 | 소유자 결정 | `modeConfirmed`·`mode_conflict` 완화가 Phase 2에 있어 Phase 1 미리보기에서 카드가 409 | 반영 | 1.5 마지막 단락, 4.2, Phase 1 표 |
| M9 | 비용·출시 | 런타임 킬 스위치 없음, 전역 서킷 기본값 없음 | 반영 | 3.7(`INTAKE_CHAT_ENABLED`, 기본 200), Phase 4 리허설 |
| M10 | 비용·출시 | 10분 버킷 isolate별·fail-open, 409 요청도 카운트 | 반영 | 3.2 게이트(peek/bump), 3.3 ②, Phase 4 인프라, 7장 #6 |
| M11 | 비용·출시 | 일일 한도가 디스패치 뒤 검사 → 매 메시지 낭비, UTC 윈도우 | 반영(peek) + 윈도우는 문구 기본·KST 선택 | 3.2, 3.3 ②, 3.6 2행, 7장 #14 |
| M12 | 비용·출시 | 플래그 전환 시 진행 중 legacy 답변을 죽임, 체크리스트만 | 반영 | 1.2 ②(`legacy_busy`), 3.4 `legacyJobActive`, 5.5 21 |
| M13 | 비용·출시 | 브라우저 시나리오용 모의 LLM 공급자가 없음 | 반영 | Phase 3a(`LLM_ENDPOINT_OVERRIDE`, 픽스처 서버, 1 dev-day, 대체 경로 명시) |
| M14 | 비용·출시 | 13일에 인원 없음, Phase 3 5일 비현실 | 반영 | 6장 서두·3a/3b 분리·합계 18 dev-day·검수 1 day·대기 일수 |
| M15 | 비용·출시 | 플래그 0 회귀를 puppeteer 테스트에 걸었음 | 반영 | 1.2 마지막 단락, Phase 1 완료 기준, reliability push |

### 9.3 minor — 반영

| # | 지적 요지 | 반영 위치 |
| --- | --- | --- |
| m1 | legacy 상호배제 한 방향 | 1.2 ②(M12와 합침) |
| m2 | `preparePlan`이 intake job을 보지 않음 | 3.5, Phase 3a route.ts |
| m3 | 영수증 128 vs 메시지 id 검사 불일치 | 3.2 ②, 5.5 1′ |
| m4 | `ai_busy` 409가 원문 유실 | 3.2 ⑦, 3.6, 5.5 7′ |
| m5 | "플래그 0 한 줄도 안 바꿈" 부정확, `recordLlmUsage` 시그니처 | 1.2 정정·③, Phase 3a llm 테스트 |
| m6 | `parseDraft` `:110` 검증이 새 드래프트를 폐기 | 5.3 |
| m7 | URL 필터 실패 후 job 상태 미정 | 3.3 ⑤(`unsafe_reply`) |
| m8 | 후보 확정 messageId가 스레드 표시를 흐림 | 2.5(M4와 합침) |
| m9 | Phase 0 파일 5개, `durable` 판정 불가 | Phase 0, 3.2 `durable` 응답 필드 |
| m10 | 문장마다 새 plan, 인사말도 유료 호출 | 3.2 plan 재사용·인사 고정 답변, 2.2 최근 대화 링크 |
| m11 | 일일 한도 fail-closed의 함의, 사전 잠금 | 3.2 `chatAllowance`, 7장 #2 |
| m12 | pending 후보 상한·대체 없음 | 3.2 ⑨, 3.3 ⑦, 3.5 |
| m13 | `memo`/`help` 참조 잔존 | 4.2, Phase 1 표 |
| m14 | 10분 버킷 선소비 | 3.2(peek/bump, M10과 합침) |
| m15 | 제안 칩이 안내 모드에서 AI 전송, 리뷰 라벨 '메모' | 3.4, 3.5 |
| m16 | `draft.chat` + 카드 클릭 조합 미정의 | 2.6, 7장 #12 |
| m17 | 플래그가 빌드 인자임을 절차에 미기재 | 6장 서두, Phase 4 |
| m18 | 테스트 라인 인용 어긋남, import 줄 컴파일 | 2.4 |
| m19 | `cache:true` 효과 미검증 | 3.3 ④, Phase 3a 완료 기준 |
| m20 | `chat-retry ≤3`은 예산 계층 아님 | 3.7 UX 규칙 |
| m21 | 계정 단위 동시성 | 3.2 게이트, 3.7 표 |
| m22 | dispatched 기록 유실 시 거짓 실패·중복 Workflow | 3.3 ①, 3.6 |
| m23 | 어드민 집계 범위 과소 | 3.7 계측, Phase 3b, `recordLlmUsage` 선택 인자 |

### 9.4 검토 후 기각·부분 반영

| # | 제안 | 결정 | 이유 |
| --- | --- | --- | --- |
| M3(b) 일부 | `answer`에도 `revision_conflict` 자동 재전송 | 부분 기각 — chat/chat-retry/details만 자동 재전송 | `answer`·`confirm-extraction`은 서버 상태(질문 목록·후보 base)에 의존해 재비교 없이 재전송하면 잘못된 값을 저장할 수 있다. 값 의존 명령은 기존 conflict 처리 유지 |
| M11 일부 | `p_now`에 KST 오프셋 | 부분 반영 — 기본은 초기화 시각 문구, KST 정렬은 선택 | 같은 버킷의 모든 호출자(peek·bump)가 동일 오프셋을 써야 하고 기존 `business-intake-ai-daily` 버킷과 정렬이 달라진다. 문구 명시가 위험 없이 체감을 해결 |
| m3 일부 | 영수증 보존 수만 올리기 | 부분 반영 — 256으로 올리되 chat 멱등 200을 주 해법으로 | 영수증은 메시지를 만들지 않는 명령(confirm/details/design)도 소비하므로 보존 수만으로는 장기 사업에서 다시 어긋난다 |
| M1 일부 | 0037 없이 `claimGuestProjects` 진입 시 만료만 | 두 층 모두 채택 | 만료만 두면 Supabase RPC의 busy 판정이 여전히 나이를 보지 않아 RPC 직전 경합에서 같은 문제가 남는다 |
| 검토가 요구한 단가 수치 기재 | 문서에 모델별 단가 표를 채우기 | 미결(표 템플릿·절차만) | 저장소에 단가 근거가 없고 기억으로 쓰지 않는다는 원칙. Phase 3 착수 전 공급자 문서 실측으로 채운다 |
