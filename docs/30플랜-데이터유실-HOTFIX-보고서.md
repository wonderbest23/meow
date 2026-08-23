# 30개 초과 플랜 데이터 유실 위험 제거 — HOTFIX 0

> **성격**: DATA INTEGRITY HOTFIX. 새 기능 없음.
> 시장조사·Writer·Reviewer·질문팩·재무모델·UI·병렬화·결제정책 **일절 손대지 않음**.
> 변경 파일 2개(+테스트 1개). 배포 완료 후 운영 데이터 READ-ONLY 확인.

---

## 실제 원인

감사 보고서를 그대로 믿지 않고 HEAD 코드에서 전수 재확인했다.

**플랜 개수 제한은 코드베이스 전체에서 단 한 곳뿐이었다.**

```
lib/plan-builder/plan-server-store.ts:75
    plans: plans.slice(0, 30).map((p) => ({
```

전수 검색 결과 `MAX_PLANS` 상수는 없고, 다른 `slice`는 전부 문자열 길이 캡이거나 무관한 배열(덱 슬라이드, 이슈 목록 등)이다. 유일한 UI 쪽 플랜 제한은 `app/plan/PlanList.tsx:209`의 `ownPlans.slice(0, 8)`인데, 이는 사이드바 **진행률 막대그래프**에만 쓰이는 표시용이고 목록 자체는 제한이 없다. 결제/quota 코드는 플랜 개수를 전혀 세지 않는다.

### 왜 최신 플랜이 사라지는가

세 가지가 겹쳐야 성립하는데, 셋 다 성립했다.

**(1) 절단이 읽기·쓰기 양쪽에 걸려 있다.**
`normalizeState()`는 두 경로를 모두 지난다.
```
loadPlanState()  → normalizeState(data.data)        ← 읽을 때 자름
savePlanState()  → normalizeState(state)            ← 쓸 때 자름
POST/PUT /api/plan/state → normalizeState(body)     ← 요청 파싱 때도 자름
```

**(2) 저장 순서가 오래된 것부터다.**
`mergeStates()`가 `createdAt` **오름차순**으로 정렬한다.
```
plan-server-store.ts:121
  [...byId.values()].sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))
```
클라이언트 `plan-store.ts:707`도 같은 오름차순으로 정렬한다. 운영 데이터에서도 확인됐다 — 배열 앞이 `1970-01-01`, 뒤가 `2026-08-22`.

**(3) `slice(0, 30)`은 배열 앞 30개를 남긴다.**
앞 = 가장 오래된 것. 따라서 **버려지는 쪽은 가장 최근에 만든 플랜**이다.

### 유실이 확정되는 순서

```
DB에 플랜 31개
  ↓ GET /api/plan/state
loadPlanState → normalizeState → slice(0,30) → 오래된 30개만 반환 (31번째 소실)
  ↓ 클라이언트 병합(로컬에는 아직 31개 있음) → 31개
  ↓ pushToServer (PUT)
route: normalizeState(body)        → 30개로 절단
savePlanState: stored = load()     → 30개 (이미 절단된 것)
             incoming = normalize  → 30개
             mergeStates(30, 30)   → 30개
  ↓ upsert
DB에 30개  ← 사용자가 지우지 않은 최신 플랜이 영구 삭제됨
```

로컬 캐시에는 남아 있어 화면에서는 한동안 보이지만, **다른 기기·캐시 삭제·로그아웃 시점에 사라진다.** 그리고 그 사이 모든 저장 요청이 그 플랜을 되살리지 못한다.

---

## 기존 `slice(0, 30)`의 목적

`git log -L`로 도입 시점을 추적했다.

```
5aac7fb  2026-07-29  feat(plan): 사업 1개 → 플랜 여러 개 구조 + 내 플랜 목록(대시보드)
+    plans: plans.slice(0, 30).map((p) => ({
```

`normalizeState`가 원래 하던 일은 **문자열 길이 캡**이다(`name` 120자, `description` 1000자, `region` 80자 …). 플랜을 다중화하면서 그 캡들 사이에 배열 상한을 같은 감각으로 끼워 넣은 것이다.

판정: **A(저장 제한) 형태로 작성됐지만 의도는 D — 페이로드 크기를 막으려던 과거 코드의 임의 제한.**
- B(표시 제한) 아님 — UI는 별도로 8개를 쓴다.
- C(성능 최적화) 아님 — 성능 관련 주석·측정 흔적 없음.
- 결제/quota와 무관.

문자열을 자르는 것과 **레코드를 통째로 버리는 것**은 성격이 완전히 다른데, 그 구분 없이 같은 함수에 들어갔다.

---

## 수정 파일

| 파일 | 변경 |
|---|---|
| `lib/plan-builder/plan-server-store.ts` | `plans.slice(0, 30)` → `plans` (절단 제거) + 재발 방지 주석 |
| `package.json` | `test:plan-capacity` 스크립트 등록 |
| `scripts/plan-store-capacity.test.ts` | **신규** 회귀 테스트 A~L |

정렬 규칙, 병합 규칙, 삭제 규칙, 활성 플랜 선택 규칙은 **한 줄도 바꾸지 않았다.**

### 단순히 30 → 100으로 바꾸지 않은 이유

지시대로 숫자를 늘리는 땜질은 하지 않았다. 저장 계층에서 사용자 레코드를 개수로 버리는 동작 자체를 제거했다. 100으로 늘렸다면 101번째에서 같은 사고가 난다.

**새로운 임의 상한도 추가하지 않았다.** 예를 들어 "500개 넘으면 거부" 같은 가드를 넣을까 검토했지만 넣지 않았다. 이유는 두 가지다. 첫째, 지시 §7이 개수 제한은 사전 고지와 명시적 archive/delete 정책이 있는 **제품 정책**이어야 한다고 규정한다 — 내가 임의로 숫자를 정할 자리가 아니다. 둘째, 거부형 가드는 한도에 도달한 사용자가 **아무것도 저장하지 못하는 잠금 상태**가 되어 삭제보다 나을 것이 없다. 대신 이로 인해 남는 노출은 아래 §아직 남은 데이터 무결성 위험에 기록했다.

---

## 수정 전 데이터 흐름

```
클라이언트 state (플랜 N개)
        ↓ PUT /api/plan/state
normalizeState(body)          ── 앞 30개만 남기고 나머지 버림
        ↓
savePlanState
  ├ loadPlanState → normalizeState ── DB에서 읽을 때도 앞 30개만
  └ mergeStates(stored≤30, incoming≤30)
        ↓ createdAt 오름차순 정렬
DB upsert (최대 30개)         ── 최신 플랜부터 영구 삭제
```

## 수정 후 데이터 흐름

```
클라이언트 state (플랜 N개)
        ↓ PUT /api/plan/state
normalizeState(body)          ── 형태 보정 + 문자열 길이 캡만. 플랜은 전부 통과
        ↓
savePlanState
  ├ loadPlanState → normalizeState ── DB의 플랜 전부 반환
  └ mergeStates(stored, incoming)   ── id 기준 합집합, 같은 id면 updatedAt 최신 승
        ↓ createdAt 오름차순 정렬 (변경 없음)
DB upsert (전부 보존)
        ↓
삭제는 오직 deletePlanById  ── 사용자가 직접 지운 경우에만
```

**저장 순서(storage ordering)는 그대로 `createdAt` 오름차순**이므로 화면 정렬(display ordering)도 이전과 동일하다. 사용자가 보는 순서는 바뀌지 않는다.

---

## 31개에서 왜 최신 플랜이 사라졌는지

위 §실제 원인에 서술한 대로 **저장 정렬이 오름차순(오래된 것이 앞)인데 `slice`가 앞을 남기기 때문**이다.

이것을 회귀 테스트로 재현했다. 수정을 되돌리고 같은 테스트를 실행한 결과:

```
AssertionError: B: 31개 전부 남아야 한다
+ actual - expected
  [ 'plan_001', 'plan_002', ... 'plan_030',
-   'plan_031'          ← 가장 최근에 만든 플랜만 정확히 사라짐
  ]
```

**추측이 아니라 실행으로 확인한 결과다.** 그리고 수정본에서는 같은 테스트가 통과한다.

---

## 30 / 31 / 35 / 50개 테스트

`scripts/plan-store-capacity.test.ts` — Supabase 미설정 시의 인메모리 저장소를 쓰지만 `normalizeState` → `savePlanState` → `mergeStates` → `loadPlanState` **동일 코드 경로**를 그대로 지난다.

지시 §13에 따라 **개수를 세지 않는다.** 모든 검증이 `assert.deepEqual(실제 id 집합.sort(), 기대 id 집합.sort())` 완전 일치 비교다.

| # | 시나리오 | 결과 |
|---|---|---|
| **A** | 30개 save → load | `plan_001..030` 완전 일치 ✅ |
| **B** | 31개 save → load | `plan_001..031` 완전 일치 + `plan_031` 존재 단언 ✅ |
| **C** | 35개 normalize → save → reload | normalize 직후 35개 + reload 후 35개 완전 일치 ✅ |
| **D** | 50개 | `plan_001..050` 완전 일치 ✅ |
| **E** | 50개 중 **가장 오래된** 플랜 수정 | 50개 유지 + 수정 반영 ✅ |
| **F** | 50개 중 **가장 최근** 플랜 수정 | 50개 유지 + 수정 반영 ✅ |
| **G** | 사용자가 `plan_017` 삭제 | 정확히 그 하나만 사라짐(34개, 집합 일치) ✅ |
| **H** | merge: remote 20~50 + local 1~35 | 합집합 `plan_001..050` 완전 일치 ✅ |
| **I** | 동일 id 충돌 | `updatedAt` 최신이 승리, 옛 내용이 최신을 덮지 않음 ✅ |
| **J** | 이어받기로 31번째 생성 | 기존 30개 유지 + `inheritedFrom` 보존 + 새 플랜이 활성 ✅ |
| **K** | 저장 정렬 순서 | `createdAt` 오름차순 그대로 ✅ |
| **L** | 45개에서 섹션·답변 내용 보존 | 1·31·45번 플랜 모두 섹션/답변 유지 ✅ |

```bash
npm run test:plan-capacity
```

**테스트가 실제로 결함을 잡는지 검증했다.** `slice(0, 30)`을 되돌린 상태에서 실행하면 B가 실패한다(위 §31개에서 왜). 4차 감사에서 "같은 그룹 필드를 하나라도 받으면 통과" 같은 관대한 판정 때문에 유실 10건을 놓친 전례가 있어, 이번에는 통과뿐 아니라 **실패 재현까지 확인했다.**

---

## local/remote merge 테스트

**H 케이스**가 이것이다. remote에 20~50, local에 1~35을 순차 저장하면 겹치는 20~35는 id로 합쳐지고 고유 플랜 1~50이 전부 남는다.

수정 전이라면 remote 저장 시점에 이미 20~49만 남고(31개 중 앞 30개), local 저장 후에도 1~30만 남아 **20개가 사라졌을 것**이다.

**I 케이스**로 병합 정책이 그대로인지 확인했다. 서로 다른 plan id는 개수 때문에 버리지 않고, 같은 plan id일 때만 `updatedAt` 최신 규칙으로 하나를 고른다. 오래된 페이로드가 뒤늦게 도착해도 최신을 덮지 않는다.

클라이언트 쪽 `lib/plan-builder/plan-store.ts:699`의 `mergeStates`도 함께 감사했다 — **개수 제한이 없고** id 기준 합집합이므로 수정할 것이 없었다. 기존 `plan-merge` / `plan-sync` 테스트도 통과한다.

---

## 기존 quota와의 관계

**완전히 별개이며 아무것도 바꾸지 않았다.**

- 결제/quota 코드는 플랜 **개수**를 세지 않는다. `app/api/plan/regen-quota/route.ts`가 `state.plans`를 참조하는 것은 "이 planId가 내 것인가" 소유권 확인 한 줄뿐이다.
- `scripts/payment-security.test.ts` 통과.
- 배포 후 운영 확인: 활성 플랜의 재생성 쿼터 `allowed 20 / used 5 / remaining 15`, 추가팩 `10회 4,900원` — 배포 전과 동일.

"새 플랜을 만들 권한이 없음"(quota)과 "이미 만든 플랜이 삭제됨"(이번 버그)은 다른 문제이고, 이번 수정은 후자만 건드렸다.

---

## 저장소 크기 영향

운영 계정에서 READ-ONLY로 실측했다(2026-08-23).

| 항목 | 실측 |
|---|---|
| 플랜 수 | **27개** (감사 시점 24개 → 3개 증가, 한도까지 **3개** 남았었음) |
| state 전체 직렬화 크기 | **411.7 KB** |
| 플랜 평균 | 15.2 KB |
| 최대 플랜 | **217.1 KB** (섹션 15개) |
| 2위 | 164.8 KB (섹션 18개) |
| 나머지 | 대부분 5 KB 미만 (섹션 0~1개인 실험 플랜) |

섹션당 약 **9~14 KB**(markdown + html + 되돌리기용 `previous`).

### 예상 크기

| 구성 | 예상 |
|---|---|
| 30개 (현재 비율 유지) | 약 0.5 MB |
| 50개 (현재 비율 유지) | 약 0.8 MB |
| 30개가 **전부** 25섹션 완성 문서 | 약 **8~10 MB** |
| 50개가 **전부** 25섹션 완성 문서 | 약 **13~17 MB** |

### 실제 저장소 한계

- **Supabase Postgres `jsonb` 컬럼** — TOAST 압축·외부 저장으로 컬럼당 최대 1 GB. **DB는 병목이 아니다.**
- **실질 병목은 `GET /api/plan/state`의 응답 크기** — 전체 state를 한 번에 직렬화해 반환한다. 현재 411 KB는 문제없고, 8~17 MB 구간이면 첫 로딩이 눈에 띄게 느려진다.
- **브라우저 localStorage(5~10 MB)** 가 먼저 막힌다 — 아래 §아직 남은 위험 참조.

**지시 §6대로 이번 HOTFIX에서 DB 구조 변경은 하지 않았다.** 플랜을 별도 행으로 쪼개거나 섹션 본문을 분리 저장하는 설계는 필요해지면 별도 작업으로 다뤄야 한다. 현재 규모(0.4 MB)에서는 불필요하다.

---

## 운영 기존 27개 보존 확인

지시 §11대로 **운영 계정에 테스트 플랜을 만들지 않았다.** 검증은 전부 로컬 fixture로 했고, 운영은 GET만 했다.

배포 전 스냅샷과 배포 후를 id 집합으로 비교:

```json
{ "before": 27, "after": 27,
  "idSetIdentical": true,
  "lost": [], "added": [],
  "sectionsBefore": 34, "sectionsAfter": 34,
  "activeSame": true, "bizSame": true }
```

추가 확인(활성 플랜 `1인 무인꽃집`):
- 답변 키 17개 유지
- `__review` 가상 키 유지, 저장된 완성도 점수 **64** 그대로
- 섹션 15개 유지
- 사업 정보·활성 플랜 id 동일

**운영 플랜을 수정하거나 삭제하지 않았다.**

---

## 회귀 테스트 결과

| 테스트 | 결과 | 덮는 범위 |
|---|---|---|
| `plan-store-capacity` (신규) | **PASS** | 30/31/35/50, merge, 삭제, 이어받기, 정렬, 내용 보존 |
| `plan-guest-persist` | PASS | createPlan, saveAnswers, hydrateFromServer |
| `plan-sync` | PASS | local/remote sync |
| `plan-merge` | PASS | 병합 규칙 |
| `plan-section-service` | PASS | saveSection, 큐 저장 경로 |
| `plan-review` | PASS | Reviewer, `__review` |
| `plan-review-resolution` | PASS | 보완질문 매핑 |
| `plan-analyzer` | PASS | Analyzer, `__analysis` |
| `plan-context` | PASS | PlanBusinessContext |
| `plan-market-research` | PASS | 시장조사 도메인 |
| `plan-target-plan` | PASS | 대상 플랜 선택 |
| `planning-inputs` | PASS | 입력 정규화 |
| `payment-security` | PASS | 결제/quota |
| `generation-queue` | PASS | 생성 큐 |
| `tsc --noEmit` | **PASS** | 타입 |
| `plan-landing-chain` | **FAIL** | ⚠️ 아래 참조 |

**`plan-landing-chain` 실패는 이번 변경과 무관한 사전 존재 결함이다.** 확인 방법: 변경을 `git stash`로 되돌린 원본 코드에서 실행해도 **동일하게 실패**한다. 원인은 랜딩 초안의 `headline`이 5자 미만이라 Zod 검증에 걸리는 것이고(`lib/landing/repository.ts:17`), 플랜 저장 계층과 무관하다. 이번 HOTFIX 범위가 아니므로 **고치지 않고 기록만 한다.**

운영 라이브 확인(READ-ONLY): 배포 후 `GET /api/plan/state`가 정상 응답 — 이것이 곧 운영 환경에서 `loadPlanState` → `normalizeState`가 27개를 온전히 통과시킨다는 증거다.

---

## 아직 남은 데이터 무결성 위험

이번에 제거하지 않은, 알고 있는 위험들이다.

### 1. localStorage quota 초과가 조용히 무시된다 — 중간

```
lib/plan-builder/plan-store.ts:146
function persist(state: PlanState) {
  try { window.localStorage.setItem(KEY, JSON.stringify(clean)); }
  catch { /* ignore quota errors */ }
}
```
브라우저 localStorage는 보통 5~10 MB다. 완성 문서가 30~40개를 넘으면 이 `setItem`이 실패하기 시작하는데 **아무 알림 없이 삼킨다.**

다만 **서버가 진실의 원천**이므로 즉시 데이터 유실은 아니다. `pushToServer`는 별도로 동작해 서버에는 저장되고, 다시 열 때 `hydrateFromServer`가 서버에서 복원한다. 증상은 "오프라인/새로고침 직후 로컬 캐시가 낡아 보인다"에 가깝다. 그래도 **실패를 조용히 삼키는 것 자체**가 이번 버그와 같은 종류의 설계다.

### 2. 저장 계층에 상한이 전혀 없어졌다 — 낮음

`slice`를 제거하고 새 상한을 넣지 않았으므로, 이론상 인증된 사용자가 거대한 페이로드를 `PUT /api/plan/state`로 보내 자기 행을 부풀릴 수 있다.

완화 요인: `requireGuestIdentity()` 인증 필요, `plan-state-save` 레이트리밋 60회/60초, 영향 범위가 **본인 행으로 한정**(멀티테넌트 위험 없음). 그리고 원래의 `slice(0,30)`도 실질적으로는 저장 증가를 막지 못했다 — 병합 때문에 누적되는 구조는 그대로였고, 대신 사용자 데이터를 지웠을 뿐이다.

필요하다면 §7이 규정한 대로 **사전 고지 + 명시적 보관함 정책**으로 다뤄야 하고, 그건 제품 결정이다.

### 3. `GET /api/plan/state`가 전체 state를 한 번에 반환 — 낮음(현재)

현재 411 KB라 무해하다. 완성 문서가 수십 개 쌓이면 첫 로딩 지연으로 나타난다. 구조 변경(플랜별 조회)이 필요해지는 시점의 신호는 **응답 크기 2~3 MB**쯤으로 보면 된다.

### 4. 감사에서 발견된 다른 항목들은 그대로다

시장근거 검색 P0, `owner_pay` 미반영, 보완 답변이 영향 섹션에 도달하지 않는 10건 등은 **이번 범위가 아니므로 손대지 않았다.** 종합감사 보고서를 참조.

---

## 완료 조건 대조

| # | 조건 | 결과 |
|---|---|---|
| 1 | 서로 다른 plan 50개가 save → load → merge 후에도 정확히 50개 | ✅ D·H 케이스, id 집합 완전 일치 |
| 2 | 특정 plan 하나를 수정해도 나머지 id가 하나도 사라지지 않음 | ✅ E(가장 오래된)·F(가장 최근) 모두 50개 유지 |
| 3 | 사용자가 직접 삭제하지 않은 plan을 시스템이 개수 제한으로 제거하는 경로 **0개** | ✅ 전수 검색 결과 절단 지점은 한 곳뿐이었고 제거함. 삭제 경로는 `deletePlanById` 하나 |
| 4 | 기존 결제/quota 정책 그대로 | ✅ 코드 무변경, 운영 쿼터 20/5/15 동일 |
| 5 | 운영의 기존 플랜 변경 없음 | ✅ 27개 id 집합·섹션 수·활성 플랜·`__review` 점수 전부 동일 |
