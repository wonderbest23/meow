# 외부 스테이징 진입 점검

> 최신 후속 상태: `today-startup-staging`에 전체 트래픽 Access 보호를 적용하고 실제 앱과 격리 Workflow 3개를 배포했다. 공개 주소와 DB/AI/결제는 닫혀 있으며 Google·PG·원격 생성은 미검증이다. 테스트 결제 환경 분리와 최종 회귀 47/47이 통과했다. [원격 테스트 앱 준비와 남은 검증](./remote-staging-preparation-2026-09-15.md). 아래 표의 초기 503 Worker·변경 없음은 이전 시점 기록이다.

## 현재 판단

2026-09-15 사용자가 `newapp`이 아직 출시 전인 플랫폼 DB이며 DB 테스트를 계속해도 된다고 확인했다. 이에 별도 테스트 DB 확보를 기다리지 않고, 새로운 가상 계정과 해당 계정의 자료만 사용하는 외부 DB 검증을 진행했다. **15/15 통과**이며 상세 범위는 [출시 전 DB 검증](./prelaunch-db-verification-2026-09-15.md)에 기록했다.

후속 요청에 따라 누락된 **0027~0030을 실제 반영**했다. 기존 자료 보존을 확인했고 계정 연결·홈페이지 공개/복원 DB 통합 **16/16**, 임시 로컬 앱의 실제 이메일 로그인·HTTP **8/8**, 회귀 **46/46**이 통과했다. [최신 구조 반영과 검증](./prelaunch-lifecycle-verification-2026-09-15.md)

이는 DB 초기화, 기존 자료 변경·삭제, 다른 프로젝트 정지, 유료 요금제 변경, 공개 배포 또는 실제 결제 승인이 아니다. Google/PG/Cloudflare 브라우저 여정은 아직 별도 검증이 필요하다.

## 승인 변경 전 외부 재확인

| 대상 | 확인 결과 | 수행한 변경 |
| --- | --- | --- |
| Supabase 조직 | Billing 화면에서 Free Plan 확인 | 없음 |
| `newapp` | `hagzlppubxxzxllsehbr`, ACTIVE_HEALTHY, 사용자 확인된 플랫폼 DB | 없음 |
| `testapp` | `nurpesdatxgspsifsllu`, ACTIVE_HEALTHY, 용도 미확인 | 없음 |
| 그 밖의 기존 DB 2개 | INACTIVE, 별도 스테이징으로 승인되지 않음 | 없음 |
| `today-startup-staging` | 기존 초기 503 Worker 버전 유지 | 없음 |
| 스테이징 공개 예정 URL | HTTP 404 | 없음 |
| 스테이징 비밀값 이름 목록 | 빈 배열 | 없음 |
| `.env.staging.local` | 아직 없음, runtime preflight 실패가 정상 | 생성하지 않음 |

Free 플랜의 활성 프로젝트 한도는 조직 전체를 합쳐 2개다. 현재 두 자리가 사용 중이다. 새 조직을 만들어 한도를 우회하지 않는다. [Supabase 과금 안내](https://supabase.com/docs/guides/platform/billing-on-supabase)

## 이번 보완

- 운영 DB뿐 아니라 현재 계정의 기존 프로젝트 4개 모두를 스테이징 DB 대상으로 거부한다. 이름이 `testapp`이거나 일시 정지 상태여도 자동 재사용하지 않는다.
- 런타임 검사에 더해 빌드 전 설정 검사도 DB 참조와 URL의 짝, 기존 DB 지정, 한쪽 값만 입력한 경우를 검사한다.
- 스테이징 Workflow 이름만 맞추고 `script_name`으로 운영 Worker를 가리키는 설정을 거절한다.
- 자기 Worker 서비스 바인딩에 다른 환경이 지정되면 거절한다.
- 설정 검사, 기존 DB 4개 차단, 교차 Worker/환경 차단, 외부 호출 없는 회귀 44/44, TypeScript가 통과했다.

당시 변경 파일은 `lib/staging/safety.ts`, `lib/staging/config.ts`, `scripts/staging-safety.test.ts`다. 실제 작업 저장소는 `/Users/juhong/Developer/meow-main`이다. 최초 승인 변경 이후에는 별도 `prelaunch-db` 검증을 두 번 실행해 가상 계정 4개와 사업 4개를 남겼다. 이후 이번 단계에서 0027~0030 DDL과 기존 공개 슬러그 보완을 반영하고 계정 연결·홈페이지용 가상 자료를 추가했다. 스테이징 배포 차단 정책은 완화하지 않았다. 기존 내용 삭제, Worker·요금제 변경, 유료 AI 호출, 실제 결제, 커밋·푸시는 없다.

## 다음 행동

`testapp` 정지나 새 DB 생성을 이 작업의 선행 조건으로 두지 않는다. `testapp`과 나머지 기존 프로젝트는 건드리지 않는다.

1. 완료: 중복 검사와 전후 기록을 보관한 뒤 `newapp`에 0027~0030을 반영했다. 기존 홈페이지 내용·버전과 사업 자료를 보존했다.
2. 완료: 실제 DB에서 비회원 자료 이전의 중복·경합·오래된 탭 보호와 홈페이지 공개·복원을 검증했다. 임시 앱의 이메일 로그인과 쿠키·HTTP 동작도 통과했다. localhost 검사 제한은 그대로다.
3. 다음: 승인된 테스트 앱 경로·접근 보호·Google 설정·Worker/Workflow 연결을 확정한다. 계정 연결 스위치는 아직 원래 서버에서 켜지 않았으며 소유권 HMAC 키 일치도 확인해야 한다. 기존 DB 거부 정책을 몰래 해제해 배포하지 않는다.
4. 비회원 → Google 로그인 → 같은 사업 복원 → PG sandbox → 결과물 재접속 다운로드를 브라우저로 확인한다. 이메일 로그인 통과를 Google 통과로 대체하지 않는다.
5. 실제 장애 알림 수신·비용 차단·운영 복구를 확인한 뒤 출시 여부를 따로 판단한다.
