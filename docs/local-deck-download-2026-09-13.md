# 로그인과 PPT 재다운로드 검증

기준: 2026-09-13 로컬 작업본. 운영 배포나 실제 PG 결제 통과 기록이 아니다.

## 범위와 결과

격리된 Supabase Auth/PostgreSQL과 Next 앱의 실제 HTTP API로 **15/15 통과**했다.
앱은 `http://127.0.0.1:8094`, DB API는 `http://127.0.0.1:55431`만 사용했다.
운영 환경 파일, AI 키, PG 키, 메시징 키는 검증 앱에 전달하지 않았다.

이전 단계에서 실제 AI로 생성/검토한 가상 사업의 `deck-plan.json`을 로컬 DB의 완료 작업으로 가져왔다.
생성 당시의 입력 5개 문단은 공통 fixture로 보존하고 manifest 해시로 동일성을 확인했다.
앱의 기존 계획서 섹션에 문단을 배치했으므로 섹션 표제와 fingerprint는 로컬 저장 형식에 맞게 계산했다.
이는 완료 결과를 가져온 뒤의 인증/권한/파일 검증이며 Cloudflare Workflow의 생성 완료 저장을 검증한 것은 아니다.

| 확인한 흐름 | 결과 |
| --- | --- |
| 비회원 완료 자료 다운로드 | 401, 기존 자료 보존 |
| 이메일 로그인과 사업 이전 | 같은 사업 ID, 원문, 수정 잠금, 검토 완료 PPT 구성 보존 |
| 이전 비회원 쿠키와 다른 계정 | 자료 GET 404, 무권한 생성 POST 402 |
| 미결제, 접수, 취소, 실패 주문 | 다운로드 402 |
| 홈페이지 상품과 다른 계획서 구매 | 해당 PPT 권한이 열리지 않음 |
| 로컬 승인 상태 반영 | 실제 PPTX HTTP 응답 200, 9장/노트 9개, ZIP CRC와 선언된 파일 존재 확인 |
| 중복 승인 처리 | 같은 거래만 재확인, 최초 승인 시각/응답 보존, 다른 거래 ID는 차단 |
| 생성 버튼 중복 요청 | 동일 완료 작업 반환, 새 작업/AI 호출 없음 |
| 늦은 실패 처리 | 이미 승인된 주문을 실패로 덮어쓰지 않음 |
| 로그아웃과 새 세션 로그인 | 로그아웃 후 접근 차단, 재로그인 후 같은 슬라이드/노트 다운로드 |
| 액세스 토큰 만료 | 갱신 뒤 동일 자료 다운로드 |
| 문서 수정 | stale 표시, 이전 PPT 다운로드 409, 기존 완료 구성은 보존 |
| 환불 | 기존 다운로드 이력과 관계없이 다음 요청 402 |
| 환불 뒤 늦은 승인 처리 | 상태 충돌로 차단, 환불/접근 제한 유지 |
| AI 사용량과 예산 | 추가 기록 0건, 누적 비용 장부 변경 없음 |

결제 주문은 실제 주문 생성/권한 함수를 사용하지만 승인 응답과 취소/환불 상태는 테스트가 로컬 DB에 부여했다.
**실제 PG 요청과 결제는 0건**이며 PG 테스트 서버의 승인·취소·환불 결과와 동일시하면 안 된다.
다운로드는 HTTP 클라이언트로 확인했다. 브라우저의 로그인 UI 및 다운로드 버튼/저장 창은 이번 범위에 포함하지 않았다.

## 발견한 문제와 수정

1. `markPlanOrderPaid`가 상태 조건 없이 주문을 완료로 갱신해 환불 후 지연 승인이 접근 권한을 다시 열 수 있었다. 로컬 재현 run `mtzplf6w`에서 기대한 차단이 일어나지 않았다. 이제 `created` 주문만 원자적으로 승인하고 이미 완료된 동일 거래만 멱등 재확인한다. 취소·실패·환불·다른 거래 ID·없는 주문은 `PAYMENT_STATE_CONFLICT`로 차단한다. 콜백도 종료된 주문이면 PG 승인 전에 멈춘다.
2. PG 자동 취소 함수가 `false`를 반환해도 콜백의 `.then(() => true)`가 성공으로 바꾸고 있었다. 실제 반환값을 유지하도록 수정했다. DB 저장 실패와 PG 취소 실패를 모의 테스트로 만들었을 때 자동 취소 완료 안내 대신 주문번호를 포함한 처리 실패 안내가 나오는지 확인했다.

수정 범위는 `lib/payments/plan-orders.ts`, `app/api/payments/plan/return/route.ts`다.
추가 마이그레이션이나 운영 환경변수 변경은 없다.

## 증거와 재실행

- 통합 결과: `artifacts/local-deck-download/report-mtzppnvz.json` (15/15)
- 재로그인 후 받은 파일: `artifacts/local-deck-download/mtzppnvz-reconnect-download.pptx`
- 최초/재로그인/토큰 갱신 파일 모두 9장. 슬라이드와 발표자 노트 XML은 동일하다. ZIP 시각 메타데이터 때문에 전체 파일 해시/바이트 수는 달라질 수 있다.
- 결제 단위 회귀: `scripts/plan-payment-status.test.ts`, DB/PG 모두 모의이며 외부 요청 0건
- 기존 계정/기간 리포트 통합 재실행: `artifacts/local-account-integration/report-mtzpq11k.json`, 21/21
- 전체 회귀 33/33 및 TypeScript 검사 통과

실제 AI 결과가 위 artifacts 폴더에 있어야 아래 통합 테스트를 실행할 수 있다. fixture가 달라지면 기존 결과를 재사용하지 않고 검사에서 중단한다.

```sh
node --import tsx scripts/local-account-lab.mts prepare
node --import tsx scripts/local-account-lab.mts migrate
node --import tsx scripts/local-account-lab.mts serve
```

다른 터미널에서 실행한다. 운영 `.env.local`을 로드하지 않는다.

```sh
node --import tsx scripts/local-deck-download.test.mts
node --import tsx scripts/plan-payment-status.test.ts
```

종료 시 검증 앱을 중지한 뒤 `node --import tsx scripts/local-account-lab.mts stop`으로 이 테스트 DB만 중지한다.

## 남은 검증

외부 스테이징의 Google OAuth, 실제 PG 테스트 콜백, 브라우저 파일 저장 UI, Cloudflare Workflow, 홈페이지 공개/문의 수신은 남아 있다.
운영에서 완료된 결제의 PG 상태와 DB 상태를 대조하는 처리, 보상 취소의 결과 보관/알림, 운영자 복구 절차도 검증이 필요하다.
이번 결과만으로 유료 출시를 승인하거나 PPT/결제 플래그를 켜지 않는다.
