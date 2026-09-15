# 원격 테스트 앱 준비와 남은 검증

> 후속: 승인 응답 유실·중복 콜백·재접속 조회 복구를 구현하고 `newapp`에 0031을 반영했다. 회귀 48/48, 로컬 DB 9/9, 원격 롤백 5/5, HTTP·화면 6/6 통과. 비공개 Worker 최신 버전은 `0542085e-442d-4ec8-9c55-4adf605aa130`이며 URL/DB/AI/PG는 계속 비활성이다. Google origin 저장은 보안 승인 대기이며 Chrome 확장 업데이트도 필요하다. 아래는 최초 비공개 배포 기록이다. [최신 결제 복구 검증](./payment-recovery-verification-2026-09-15.md)

## 현재 판단

**비공개 스테이징 앱 배포와 테스트 결제 환경 분리는 완료했다. Google 로그인, PG sandbox 거래, 원격 Workflow 실행과 재접속 다운로드는 아직 미검증이다.** 이번 결과는 정식 출시나 결제 기능 정상 제공 승인이 아니다.

사용자가 승인한 외부 테스트 리소스 생성 범위 안에서 `today-startup-staging`만 변경했다. 운영 Worker, 운영 도메인, 기존 개발 서버, 요금제는 변경하지 않았다. DB 쓰기, AI 생성 요청, 결제 승인 요청도 실행하지 않았다.

## 실제 원격 변경

| 항목 | 확인된 상태 |
| --- | --- |
| Worker | `today-startup-staging` |
| 배포 버전 | `72c8b789-3854-4a9f-8cb2-8743261b31c2` |
| 코드 | 초기 503 전용 Worker에서 현재 Next/OpenNext 앱으로 교체 |
| 접근 정책 | Worker 전체 트래픽에 Access 적용, Cloudflare 계정 구성원만 허용, 세션 24시간 |
| 공개 | `workers_dev=false`, `preview_urls=false`, `routes=[]` 유지 |
| 앱 활성화 | `STAGING_READY=false` 유지 |
| DB | URL과 프로젝트 참조가 비어 있음, 비밀값 0개 |
| AI와 결제 | 비활성화, 키 업로드 없음 |
| Workflow | 아래 3개를 스테이징 전용 이름으로 등록, 실행 0회 |

- `today-startup-staging-draft-package`
- `today-startup-staging-direct-plan`
- `today-startup-staging-plan-sections`

자기 Worker 서비스 바인딩도 `today-startup-staging`을 가리킨다. 운영 Workflow를 연결하지 않았다. 배포 후 대시보드에서 Worker Access의 `전체 트래픽`과 `모든 URL에 로그인 필요: 프로덕션 및 프리뷰` 상태가 유지된 것을 확인했다. [Cloudflare Worker Access 문서](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)

접근 정책 식별값은 비밀키가 아니다. 다음 활성화 단계에서 발급자와 대상을 대조한다.

- Access app ID: `bb2054e9-415d-47d5-ad2f-3b1d0146ffaf`
- AUD: `ca2693561888c3e7f79c82e6f93a96975f2a53ee8f339225249c53a708cbc721`
- JWKS: `https://rena35200.cloudflareaccess.com/cdn-cgi/access/certs`

예정 주소 `https://today-startup-staging.rena35200.workers.dev`의 `/`, `/plan/chat?new=1`, `/api/auth/session`에 비로그인 GET을 보내 모두 404를 확인했다. **URL 비활성 상태의 확인이지 Access 로그인 성공이나 실제 앱 기능 통과가 아니다.** 공개 URL 활성화 후 별도의 비로그인 차단 검사가 필요하다.

## Google 설정 확인

Google Cloud `starry-center-473909-t9`의 웹 클라이언트 `오늘창업`을 확인했다. 클라이언트 ID는 앱에 이미 있던 `1003888311201-3ai90gt9sohnkc2u7oujs7i6igjo28ff.apps.googleusercontent.com`과 일치한다.

현재 JavaScript 허용 원본은 `https://oneulstart.com`, `https://www.oneulstart.com`, `http://localhost:8083` 세 개다. 스테이징 원본은 없다. 기존 원본을 유지하고 스테이징 원본 하나를 추가하는 승인을 요청했으며 **아직 저장하지 않았다.** 테스트에 사용할 Google 이메일도 확인 대기다. 클라이언트 비밀번호 생성, 교체, 다운로드는 하지 않았다.

앱의 로그인 경로는 Google Identity Services의 ID 토큰을 `/api/auth/google`로 전달한 뒤 Supabase에서 검증하는 방식이다. 허용 원본 등록뿐 아니라 실제 브라우저의 토큰 발급, Supabase audience 검증, 앱 세션 생성, 비회원 자료 이전을 모두 확인해야 한다.

## 테스트 결제 분리

기존 Nicepay 클라이언트는 승인 API가 운영 주소로 고정되어 있었다. 다음 분리를 구현했다.

- `NICEPAY_ENVIRONMENT=sandbox`일 때 승인과 취소는 `sandbox-api.nicepay.co.kr`만 사용한다.
- 테스트 모드는 `NICEPAY_SANDBOX_CLIENT_KEY`와 `NICEPAY_SANDBOX_SECRET_KEY`만 읽는다. 운영 키로 대체하지 않으며 운영 키가 함께 설정되면 거부한다.
- `APP_ENV=staging` 또는 `prelaunch`에서는 운영 결제 모드를 거부한다.
- 새 카드 주문에도 `PAYMENTS_ENABLED` 스위치를 적용한다. 이미 진행된 거래의 확인과 보상 취소까지 이 스위치로 차단하지는 않는다.
- SDK URL은 서버가 반환하고 브라우저가 정확한 허용 목록으로 검사한다. 중복 로딩을 합치고 로딩 실패 시 다시 시도할 수 있게 한다.
- 승인/취소 요청은 리디렉션을 거부하고 20초로 제한한다. SDK 로딩은 15초로 제한한다.

**Nicepay 공식 TEST 예제는 공통 결제창 SDK `https://pay.nicepay.co.kr/v1/js/`를 사용한다.** 테스트 가맹점 키와 서버 승인 API를 분리해야 하며 SDK 호스트 이름만 임의로 바꾸면 안 된다. 공개 SDK의 200 응답과 `AUTHNICE` 포함 여부만 확인했다. 거래를 실행한 것은 아니다. [Nicepay 공식 테스트 문서](https://github.com/nicepayments/nicepay-manual/blob/main/common/test.md)

현재 1차 스테이징 가드는 인증/저장 검증만 허용하므로 테스트 PG 키도 계속 거부한다. **결제를 검증하려면 별도 단계의 제한된 sandbox 허용 설정과 테스트 가맹점 확인이 먼저 필요하다.** 환경변수만 억지로 주입하거나 가드를 제거해 실행하지 않는다.

## 실행 결과

| 검사 | 결과 |
| --- | --- |
| 외부 호출 차단 회귀 | 최종 변경본 47/47 통과 |
| Nicepay 환경 테스트 | 주소 허용 목록, 키 분리, 결제 스위치, 서명, 혼합 환경 거부, SDK 실패 후 재시도 통과 |
| 격리 Next/OpenNext 빌드 | 통과, 환경파일 0개, 컴파일된 환경 객체 3개 모두 비어 있음 |
| 최종 Wrangler dry-run | 통과, 에셋 937개, gzip 6259.22 KiB |
| 실제 스테이징 배포 | 통과, Worker 시작 시간 128ms |
| 원격 Workflow 목록 | 스테이징 이름 3개 확인, 실행하지 않음 |
| 비로그인 GET | 비활성 URL 3개 모두 404 |
| 변경 파일 공백 검사 | `git diff --check` 통과 |

증거 파일:

- 격리 빌드: `/private/tmp/oneul-staging-build-gwIjfZ/staging-build-report.json`
- 배포: `artifacts/remote-staging/closed-deploy-2026-09-15.json`
- 배포 후 목록/HTTP: `artifacts/remote-staging/closed-status-2026-09-15.json`

로컬 결과의 실제 AI 호출은 모의 응답으로 대체되어 있다. 테스트 로그에 생성 성공 문구가 있어도 실제 AI·PG 검증으로 계산하지 않는다. 비밀값과 테스트 계정 암호는 문서에 포함하지 않았다.

## 다음 실행 순서와 통과 기준

1. **원격 앱 활성화 준비**: 승인된 `newapp` 공유 검증용 프로필을 별도로 구현한다. 다른 기존 DB 거부 정책은 유지하고, 승인된 프로젝트 참조와 정확한 원본을 고정한다. 기존 소유권 계산과 HMAC 키가 일치하는지 확인한다. 공유 DB이므로 기존 자료에는 쓰지 않고 새 테스트 계정과 표시된 가상 사업만 사용한다. Access 보호를 유지한 채 준비 검사가 통과한 뒤 테스트 URL을 연다.
2. **Google 로그인**: 스테이징 원본 추가 승인과 테스트 이메일 확인 후 비회원 대화 저장 → Google 로그인 → 같은 사업 ID/본문 복원 → 새 탭/재로그인 다운로드를 검증한다. 다른 계정 접근 거부, 중복 로그인, 오래된 탭의 덮어쓰기 거부도 포함한다.
3. **PG sandbox**: 테스트 가맹점과 키를 확인하고 한정된 sandbox 단계에서만 활성화한다. 성공, 사용자 취소, 인증 실패, 중복 클릭/콜백, 금액 불일치, 승인 응답 지연, 저장 실패, 보상 취소를 각각 대조한다. PG 반환 POST가 Access와 쿠키 정책을 통과하는지도 확인하되 전체 API를 보호 예외로 열지 않는다. 테스트 권한을 실제 고객 권한에 섞지 않는다.
4. **Workflow와 재접속**: 가상 사업 하나의 작업 ID를 기록하고 생성 중 탭 닫기 → 재접속 → 저장 상태 복원 → 파일 다운로드를 검증한다. 중복 실행, 중단 지점부터 재개, 소유자 격리, 최종 PPT 내용/편집 가능성, 파일 해시와 저장 버전을 대조한다. 비용 장부는 기존 누적 한도를 유지하며 실행 전 남은 예산을 다시 확인한다.
5. **운영 판단**: 실제 장애 알림, 처리 시간과 비용 기록, 복구 절차까지 확인한 뒤 제한 출시를 별도로 판단한다. 이 문서의 완료 항목으로 남은 검증을 통과 처리하지 않는다.

후속 작업에서 승인 통신 예외를 대기 상태로 분리하고 조회/대사 복구와 중복 승인 예약 방지를 구현했다. 실제 PG 결과와의 대조 및 완료 이후 환불에 따른 권한 회수는 여전히 남아 있다. 로컬 주문 상태 검사만으로 외부 거래 일관성을 보장하지 않는다. 최신 결과는 위 결제 복구 기록을 따른다.
