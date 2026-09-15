# 스테이징 검증 실행 계획

> 2026-09-15 최신 상태: 사용자 승인으로 출시 전 `newapp`에 0027~0030을 반영하고 기존 자료 보존을 확인했다. 계정 연결·홈페이지 공개/복원 DB 통합 16/16, 임시 앱의 이메일 로그인 브라우저·HTTP 8/8 통과. `testapp` 정지나 새 DB 확보는 선행 조건이 아니다. 아래의 별도 DB 생성 계획은 이전 기록이며 [수정된 외부 진입 계획](./staging-gate-2026-09-15.md)과 [최신 DB·브라우저 검증](./prelaunch-lifecycle-verification-2026-09-15.md)을 우선한다.

> 2026-09-14 정정: 사용자가 `newapp`을 오늘창업 플랫폼 DB로 확인했다. `testapp`의 용도는 미확인이며 두 프로젝트 모두 정지·삭제·재사용하지 않는다. AI 전송 및 추가 5달러 승인은 받았고 실제 가상 자료 검증을 완료했다. 아래는 최초 준비 단계의 기록이다. [최신 검증 및 출시 관문](./document-proposal-ai-verification-2026-09-14.md)

기준: 2026-09-13, `/Users/juhong/Developer/meow-main` 작업본.
`localhost:8083`도 이 작업본에서 실행 중이다. Desktop의 동명 저장소는 별개이며 수정하지 않았다.

## 목표와 승인 범위

로컬에서 확인한 기능을 운영과 분리된 Cloudflare/Supabase에서 재검증하고, 유료 출시 여부를 증거로 판단한다.
외부 테스트 리소스 생성은 사용자 승인 완료. 유료 플랜 변경, 운영 배포, 운영 DB 수정, 실제 결제는 승인 범위 밖이다.
AI 검증의 기존 누적 한도는 5달러다. 이전 실제 호출 3건의 장부를 유지하며 이번 단계에서는 추가 유료 호출을 하지 않는다.

## 현재까지 실행한 일

| 항목 | 상태 | 증거 / 제한 |
| --- | --- | --- |
| 전용 Worker | 생성 완료 | `today-startup-staging`, 초기 버전 `ecf41cd7-567a-40b1-af44-14357964d494` |
| 공개 차단 | 확인 완료 | `workers_dev=false`, `preview_urls=false`, 도메인 연결 없음. 생성 후 공개 예정 주소는 HTTP 404 |
| 초기 코드 | 준비 중 응답만 배포 | 503 JSON만 반환. DB/AI/PG/운영 도메인 바인딩 없음. 실제 앱 배포가 아님 |
| 스테이징 설정 / 검사 | 구현 및 검사 통과 | Worker/Workflow 이름 분리, 운영 DB 거부, AI/결제 키 거부, 준비 전 503 |
| Google 설정 분리 | 구현 | 스테이징에서 client ID가 없으면 운영 client ID로 대체하지 않음 |
| 격리 빌드 도구 | 구현 및 실빌드 통과 | OpenNext 빌드/최종 Wrangler dry-run 통과. 환경 파일 0개, 컴파일된 환경 객체 3개 모두 비어 있음 |
| 로컬 Worker 차단 | 5/5 통과 | 홈페이지/로그인/AI/결제/내부 요청 모두 503 + no-store + noindex. 8097 테스트 서버는 검사 후 종료 |
| 회귀 / 타입 | 통과 | 외부 호출을 차단한 35/35 묶음 및 TypeScript 검사 |
| 전용 Supabase | 보류 | 조직은 Free, 활성 프로젝트 2개. 사용자가 기존 테스트 프로젝트의 사용 여부를 확인해야 함 |
| 운영 변경 / 실제 PG / 추가 AI | 실행하지 않음 | 운영 Worker/도메인/DB를 수정하지 않았고 커밋/푸시도 하지 않음 |

## 실행 순서와 통과 기준

| 단계 | 수행할 작업 | 통과 기준 | 현재 상태 |
| --- | --- | --- | --- |
| 1 환경 분리 | 전용 Worker, 전용 DB, 독립 비밀값, Access 보호 | 운영 리소스 참조 없음, 비허용 사용자는 앱 접근 불가 | Worker 완료, DB 대기 |
| 2 배포 리허설 | 새 DB에 0001~0030, 테스트 Google 설정, 격리 앱 빌드, 전용 Workflow | DB 마이그레이션/보호 정책 통과, 공개 전에 준비 상태 확인 | 빌드/로컬 Worker 통과, 외부 DB 미적용 |
| 3 계정 연결 | 비회원 → Google 로그인 → 같은 사업 복원 → 계정 전환/재로그인/다중 탭 | 사업 ID와 문서 내용 유지, 타 계정 접근 차단, 실패 후 기존 데이터 유지 | 미실행 |
| 4 결제와 결과물 | PG sandbox 승인/취소/실패/중복/환불, 저장된 실제 PPT 브라우저 다운로드 | 주문·권한 일치, 중복 청구 없음, 환불 후 차단, 재접속 다운로드 내용 동일 | 미실행 |
| 5 홈페이지와 개선 루프 | 편집/공개/복원/문의, 기간 실적 비교/개선 리포트 보관 | 공개본과 편집본 분리, 충돌 보호, 보관 시점 값 보존, 문의 전달 확인 | 로컬 통과, 외부 재검증 대기 |
| 6 제한 출시 | 장애 알림/비용 차단/지원 담당/복구 절차, 사용자 최종 승인 | 미해결 중대 결함 0건, 출시 체크리스트 승인 | 보류 |

각 단계는 앞 단계가 통과한 뒤 진행한다. 실패한 항목은 재현 절차, 오류 코드, 저장된 범위, 재개 위치를 남기고 수정 후 다시 검사한다.
테스트 성공을 운영 배포 성공이나 서비스 제공 보장으로 바꾸어 표현하지 않는다.

## 테스트 DB 생성의 현재 제약

로그인된 Supabase 조직은 `etdpagfavrehqszcspdj`이며 Free 플랜임을 Billing 화면에서 확인했다.
활성 프로젝트는 다음 두 개다.

| 프로젝트 | 참조 | 처리 원칙 |
| --- | --- | --- |
| `newapp` | `hagzlppubxxzxllsehbr` | 현재 운영 DB. 변경/정지/복사 금지 |
| `testapp` | `nurpesdatxgspsifsllu` | 용도 미확인. 임의 정지/삭제/재사용 금지 |

Free는 관리하는 조직 전체에서 활성 프로젝트 2개 한도다. 새 조직을 만드는 방식으로 이 한도를 우회하지 않는다.
기존 `testapp`이 사용하지 않는 테스트 프로젝트인지 사용자가 확인하고 일시 정지를 승인하면, 정지 후 별도 `today-startup-staging` 프로젝트를 만든다.
사용 중이라면 별도 비용 승인과 용량 계획이 필요하며 현재 승인만으로 유료 전환하지 않는다. [Supabase 과금 안내](https://supabase.com/docs/guides/platform/billing-on-supabase)

## 설정 원칙

| 구분 | 설정 | 취급 |
| --- | --- | --- |
| 공개 빌드값 | `NEXT_PUBLIC_APP_ENV`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_PPT_GENERATION_VERIFIED` | 스테이징 전용 값만 사용. 변경 후 재빌드 필요 |
| 런타임 공개값 | `APP_ENV`, `PLATFORM_APP_ORIGIN`, `STAGING_SUPABASE_PROJECT_REF`, `SUPABASE_URL` | 전용 DB와 Worker 일치 검사 |
| 런타임 비밀값 | `SUPABASE_SERVICE_ROLE_KEY`, `AUTH_PROJECT_SECRET`, `ADMIN_CHAT_PASSWORD`, `ADMIN_SESSION_SECRET` | 새 테스트 리소스 값만 보관. 채팅/소스/빌드 번들에 넣지 않음 |
| 1단계 금지값 | OpenAI/Anthropic/PG 키, SaaS 도메인 토큰, 운영 알림 URL | 비어 있어야 통과. 결제·AI·PPT 제공 플래그는 `false` |

`AUTH_PROJECT_SECRET`는 운영과 독립된 값으로 생성하고 검증 중 임의 회전하지 않는다. 회전하면 기존 소유권 복원이 달라질 수 있다.
현재 `.env.staging.example`은 빈 양식이다. 전용 DB 준비 후 `.env.staging.local`에만 넣는다. 기존 `.gitignore`가 이 로컬 파일을 제외한다.
`STAGING_READY`는 준비 단계 스위치일 뿐 접근 인증이 아니다. 공개 URL을 켜기 전 Cloudflare Access 등으로 테스터를 제한하고 검색 제외 응답도 적용해야 한다.

Cloudflare의 bindings/vars는 환경별로 별도 지정해야 한다. 이 작업은 실수로 운영 기본 설정을 선택하지 않도록 별도 Wrangler 파일을 사용한다. [Cloudflare 환경 설정](https://developers.cloudflare.com/workers/wrangler/environments/)

## 빌드와 사전 검사

아래 명령은 실제 작업 저장소에서 실행한다.

```sh
node --import tsx scripts/staging-preflight.mts
node --import tsx scripts/staging-preflight.mts --runtime
node --import tsx scripts/staging-build.mts
```

- 기본 preflight는 설정 파일만 검사한다. `ready:true`도 실제 앱/DB/인증 통과를 의미하지 않는다.
- `--runtime`은 `.env.staging.local`만 읽고 부족한 항목의 코드만 출력한다. 파일이 없으면 실패가 정상이다.
- 빌드 도구는 허용 목록의 소스와 의존성만 `/private/tmp/oneul-staging-build-*`에 복사한다. 환경 파일이나 배포 옵션을 받지 않는다.
- Next가 기본 Wrangler 설정을 읽더라도 스테이징만 보도록 임시 폴더의 기본 설정도 스테이징으로 만든다.
- OpenNext의 `next-env.mjs`에 production/development/test 모두 빈 환경 객체만 들어갔는지 검사한다. 결과는 임시 폴더의 `staging-build-report.json`에 보관한다.
- 이 빌드는 비밀값 없는 배포 리허설이다. 실제 Google client ID가 준비되면 공개 빌드값 주입 경로를 별도로 검증하고 다시 빌드한다. 현재 빌드 결과를 로그인 가능한 앱으로 공개하면 안 된다.

OpenNext는 프로젝트 `.env` 파일을 Worker 결과물에 포함할 수 있고 `NEXT_PUBLIC_*`는 빌드 시 결정된다. 따라서 운영 환경 파일이 있는 원본 폴더에서 스테이징 빌드를 하지 않는다. [OpenNext 환경변수 안내](https://opennext.js.org/cloudflare/howtos/env-vars)

이번 검증 복사본은 `/private/tmp/oneul-staging-build-6uIYKZ`다. Next 16.2.12, OpenNext Cloudflare 1.20.2, Wrangler 4.115.0으로 통과했다.
최종 dry-run은 에셋 931개, Worker 원본 32,303.64 KiB / gzip 6,157.84 KiB를 보고했다. 현재 공식 크기 제한은 압축 전 64 MiB이며, 크기 통과만으로 원격 시작 시간이나 실제 DB/Workflow 실행까지 통과했다고 판단하지 않는다. [Cloudflare 제한](https://developers.cloudflare.com/workers/platform/limits/)
외부에는 초기 준비 중 Worker만 배포되어 있다. 전체 앱/Workflow의 원격 실행, 계정의 CPU 한도 및 비용 정책은 DB 준비 후 확인한다.

`npm run deploy`나 기본 `wrangler.jsonc`는 운영용이므로 스테이징 작업에서 사용하지 않는다.
현재 GitHub Actions는 `main` 푸시에 운영 배포를 실행한다. 사용자 승인 없이 커밋/푸시하여 우회 배포하지 않는다.

## DB와 인증 적용 절차

1. Free 활성 슬롯을 확보한 뒤 새 프로젝트를 만들고 새 참조를 기록한다. 운영 DB 덤프/실사용자/기존 프로젝트 설정을 가져오지 않는다.
2. 별도 임시 Supabase 작업 폴더에 마이그레이션 0001~0030만 복사하고 새 프로젝트에만 연결한다. 원본 저장소의 Supabase link는 변경하지 않는다.
3. 대상 참조가 운영 denylist에 없고 새 프로젝트인지 다시 확인한 뒤 빈 DB에 마이그레이션을 적용한다. service-role 권한, RLS, 0027/0028 계정 이전, 0029 관측, 0030 홈페이지 CAS/RPC를 확인한다.
4. 테스트 계정과 가상 사업만 생성한다. 기존 로컬 검증 스크립트의 localhost 제한을 풀어 외부로 돌리지 말고 스테이징 전용 대상 검사를 둔다.
5. Google 테스트 OAuth client의 Authorized JavaScript origin에 보호된 스테이징 origin을 등록하고 Supabase Google provider의 허용 client ID를 맞춘다.
6. 실제 구현은 GIS ID token을 `/api/auth/google`에 전달한 뒤 Supabase `signInWithIdToken`으로 검증한다. 일반적인 OAuth redirect 경로를 추가하는 것만으로 검증 완료 처리하지 않는다.
7. Google client ID를 반영해 다시 빌드하고 전용 Worker/Workflow에만 배포한다. 보호된 환경에서 준비 검사를 통과한 뒤 `STAGING_READY`를 활성화한다.

Google 설정은 [Supabase Google 로그인 안내](https://supabase.com/docs/guides/auth/social-login/auth-google)와 [ID token 로그인 API](https://supabase.com/docs/reference/javascript/auth-signinwithidtoken)를 따른다.

## 시나리오별 증거

| 시나리오 | 남길 증거 | 실패 판정 |
| --- | --- | --- |
| 비회원 → Google | 이전/이후 사업 ID, 문서 내용 비교, 서버 소유권 | 새 빈 사업으로 바뀜, 자료 소실, 다른 계정 노출 |
| 두 탭/재로그인 | 동시 저장 결과, 409 처리, 새 세션의 복원 | 오래된 탭이 최신 자료 덮어씀 |
| PG sandbox | 테스트 거래 ID, 상태 전이, 서버 권한, 취소 결과 | 지연 승인으로 환불 권한 복구, 중복 청구/중복 처리 |
| 실제 PPT | 다운로드 응답/파일, 슬라이드·노트 내용 비교, PowerPoint 열기 | 권한 없이 접근, 재접속 불가, 파일 손상/빈 내용 |
| 홈페이지 | 초안/공개본 버전, 재접속/복원, 모바일 저장 화면, 문의 레코드 | 미공개 편집 노출, 공개본 유실, 중복 문의, 알림 누락 |
| 개선 리포트 | 이전·현재 기간 수치, 보관 당시 입력, 재다운로드 | 과거 보관본이 새 실적으로 바뀜, 사업 간 혼합 |
| 운영 장애 | 작업 단계별 시간/오류, 실제 알림 수신, 비용 차단 결과 | 원인 미표시, 무제한 재시도, 미저장 내용을 저장 완료로 표시 |

PG 키는 공급자의 테스트 계약/가맹점 설정을 확인한 뒤 연결한다. 키 문자열만 보고 sandbox라고 단정하지 않는다.
1단계 가드는 PG/AI 키 자체를 거부하므로, 다음 단계에서 테스트 전용 허용 정책을 검토하고 검사한 뒤 필요한 범위만 연다.
PPT는 우선 이미 생성된 가상 사업 결과로 재다운로드를 검사하여 추가 AI 호출을 피한다. 새 생성 표본이 필요할 때만 기존 5달러 누적 장부로 비용을 예약한다.

## 중단과 복구

- 외부 테스트 실패 시 공개 경로를 다시 끄고 테스트 Worker를 초기 503 버전으로 되돌린다. 운영 Worker를 롤백하지 않는다.
- 테스트 DB는 자동 삭제/초기화하지 않는다. 오류 증거를 보관하고 파괴적 재생성은 별도 확인한다.
- 비밀값 오류는 값을 출력하지 않고 필요한 설정 이름과 오류 코드만 남긴다.
- 운영 적용은 새 승인 후 백업/기존 데이터 점검 → DB 마이그레이션 → 앱 배포 → 첫 사용자 여정 확인 순서로 진행한다. 계정 소유권 보호 코드를 과거 방식으로 되돌리지 않는다.

## 출시 판단

현재는 로컬 핵심 흐름 검증과 외부 환경 준비 단계이며 유료 정식 출시 통과가 아니다.
각 단계의 보고서와 미해결 항목을 [출시 검증 현황](./launch-validation-2026-09-13.md)에 누적한다.
