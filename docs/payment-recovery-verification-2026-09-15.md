# 결제 응답 지연과 재접속 복구 검증

## 결론

결제 승인 응답이 유실됐을 때 실패로 단정하거나 다시 승인하지 않고, 같은 거래를 조회해 복구하는 경로를 구현했다. 승인된 출시 전 `newapp`에는 마이그레이션 `0031_nicepay_reconciliation.sql`을 반영했다. 기존 주문과 이용권은 변경하지 않았다.

**실제 Google 로그인, Nicepay sandbox 거래, 원격 Workflow 실행과 재접속 다운로드는 아직 미검증이다. 이번 결과로 정식 출시나 정상 결제 제공을 선언하지 않는다.** 이번 실제 PG 호출과 유료 AI 호출은 모두 0회다.

## 구현

- 승인 요청 전에 DB에서 `created → confirming`을 한 번만 예약한다. 동시 콜백이나 프로세스 재시작 후에는 같은 주문의 승인을 다시 보내지 않는다.
- 응답 지연, 통신 실패, DB 저장 실패는 `pending`으로 남긴다. PG의 읽기 전용 거래 조회로 거래번호, 주문번호, 금액, 통화, 최종 상태를 대조한다.
- 주문 완료와 다시 생성 이용권 지급은 같은 DB 트랜잭션에서 처리한다. 저장 응답만 유실돼도 재확인으로 복구할 수 있다.
- 확인되지 않은 콜백은 주문 상태를 변경하지 않는다. 취소된 주문을 지연 콜백으로 완료 상태로 되돌리지 않는다.
- 로그인한 주문 소유자만 결과 확인 API를 호출할 수 있다. 다른 origin과 과도한 조회를 차단한다.
- 결과 확인 화면은 대기 중 새 결제 링크를 숨기고 같은 주문의 확인 버튼을 제공한다. 로그인 만료 시 주문번호가 포함된 복귀 주소를 보존한다.
- 결제의 반환 주소와 origin 검사는 설정된 앱 원본을 우선한다. Next의 로컬 `127.0.0.1 → localhost` 정규화는 같은 포트의 실제 로컬 Host에 한해서 처리하며 임의의 `x-forwarded-host`를 신뢰하지 않는다.

조회 API와 상태값은 [Nicepay 공식 거래 조회 문서](https://github.com/nicepayments/nicepay-manual/blob/main/api/status-transaction.md)를 기준으로 구현했다. 모의 응답 테스트는 실제 가맹점 승인/조회 왕복을 대체하지 않는다.

## 확인한 결과

| 검사 | 결과 |
| --- | --- |
| 외부 호출을 차단한 회귀 | 48/48 통과 |
| 로컬 Supabase 실제 SQL 통합 | 9/9 통과 |
| 원격 newapp 트랜잭션 검사 | 5/5 통과, 모든 가상 주문 ROLLBACK |
| 기존 원격 자료 보존 | 주문 1건, 이용권 0건의 전후 해시 동일 |
| 함수 권한 | anon/authenticated 실행 불가, service_role만 실행 가능 |
| 최종 Next/OpenNext 빌드 | 통과, TypeScript 통과, 환경파일 0개, 컴파일 환경 객체 비어 있음 |
| 실제 로컬 HTTP·격리 브라우저 | 6/6 통과, 390px/1440px 화면 확인, 가로 넘침과 런타임 오류 없음 |
| 비공개 스테이징 갱신 | 버전 `0542085e-442d-4ec8-9c55-4adf605aa130`, 비밀값 0개, 외부 URL 3개 404 |
| 변경 파일 공백 검사 | `git diff --check` 통과 |

로컬 SQL 검사는 중복 승인 예약, 금액/통화 불일치, 잘못된 거래번호, 취소 후 재승인 방지, 이용권 중복 지급과 원자성, 동일 사업의 동시 주문, 익명 실행 차단을 포함한다. 원격 검사는 가상 주문만 트랜잭션 안에서 생성했으며 실제 PG와 연결하지 않았다.

증거:

- `artifacts/local-nicepay/9eb21614.json`
- `artifacts/prelaunch-payment-migration/2026-09-15T04-01-22.758Z/report.json`
- `artifacts/prelaunch-payment-smoke/8e999b19.json`
- `artifacts/local-payment-recovery/1789445799948/report.json`
- `/private/tmp/oneul-staging-build-LTbff4/staging-build-report.json`
- `artifacts/remote-staging/payment-recovery-closed-deploy-2026-09-15.json`
- `artifacts/remote-staging/payment-recovery-closed-status-2026-09-15.json`
- 마이그레이션 SHA-256: `ff8ec40c496609c711186c34225e324d17f2e5bff431d7b7d25bec4f3d30d4fb`

HTTP 검사는 실제 Next 서버에서 다른 원본 403, 비로그인 401, 비정상 콜백 303과 반환 원본/no-store를 확인했다. 브라우저는 모바일·PC 화면, 주문을 유지한 로그인 복귀, 중복 클릭 1회, 확인 성공 전환과 조회 오류 유지를 검사했다. 성공/오류 전환의 PG 결과는 모의 응답이고 외부 폰트 요청도 차단했다. 1차 HTTP 검사에서 발견한 로컬 주소 정규화 문제를 수정하고 최종 빌드로 재실행한 결과다.

검증용 임시 서버는 종료했다. 별도로 키 없는 결과 화면 미리보기만 `http://127.0.0.1:8103/plan/pay/result?status=pending&orderId=PB-preview&planId=plan-preview`에 열었다. 이 서버는 실제 로그인·결제·DB 연결 검증용이 아니다. PID와 로그는 최종 격리 빌드 폴더의 `payment-preview.json`, `payment-preview.log`에 있다.

원격 404는 URL이 비활성임을 확인한 결과다. Access 로그인 성공이나 원격 복구 API 통과가 아니다. Workflow 3개 등록은 확인했지만 실행하지 않았다. 이번 후속에서 Access UI 자체는 확장 오류로 다시 확인하지 못했으며 정책을 변경하지 않았다.

## 외부 검증의 차단 조건

1. Google Cloud `오늘창업` 클라이언트에 스테이징 origin을 입력했지만 **저장은 보안 검토에서 거부됐다**. 해당 origin 추가에 대한 명시적 승인을 요청한 상태다. 기존 origin과 리디렉션은 변경하지 않았다.
2. 이후 Chrome 확장 프로그램 업데이트 요구로 사용자 브라우저 조작도 중단됐다. 다른 도구로 Google 보안 설정 변경을 우회하지 않았다.
3. 테스트 Google 이메일과 Nicepay sandbox 가맹점 설정이 아직 확인되지 않았다. 비밀키는 채팅으로 받지 않는다.
4. 원격 Worker는 URL 비활성, `STAGING_READY=false`, DB 비밀값 없음, AI/PG 비활성을 유지한다. `newapp` 공유 검증용 런타임 프로필과 소유권 HMAC 일치 검증도 별도 단계다. 새 DB 함수 반영을 원격 앱 연결 완료로 해석하지 않는다.

## 다음 통과 기준

1. Google origin 추가 승인과 브라우저 확장 업데이트 후, 접근 보호를 유지한 테스트 앱 설정을 마친다. 비회원 → Google 로그인 → 같은 사업 복원 → 계정 전환과 새 탭 검사를 실행한다.
2. 테스트 전용 PG 키와 제한된 sandbox 설정을 확인한다. 성공/취소/인증 실패/중복/지연 응답/재접속/DB 실패를 실제 PG 결과와 비교한다. Access가 반환 POST를 막는 경우 전체 API 보호를 해제하지 말고 반환 경로의 보호 설계를 별도로 검토한다.
3. 가상 사업 한 개의 원격 Workflow ID를 기록하고 생성 중 이탈 → 재접속 → 문서/PPT 다운로드를 검증한다. 기존 AI 예산 장부의 잔액을 확인한 뒤에만 유료 호출한다.
4. 장시간 `confirming`인 주문의 운영자 알림과 수동 대사, 환불 후 권한 회수, 실제 알림 수신까지 확인하고 제한 출시를 판단한다.

승인 예약 직후 프로세스가 멈춰 PG 상태가 `ready`로 남는 경우는 자동 재승인하지 않는다. 이미 완료된 주문의 나중 환불/부분 취소에 따른 권한 회수와, 결제 대기 중 별도 결제 화면 진입을 먼저 막는 UX는 남은 범위다. 새 승인 예약은 DB에서 차단하지만 이를 모든 외부 결제 시나리오의 완료로 간주하지 않는다.

운영 배포, 실결제, 요금제 변경, 커밋/푸시는 하지 않았다.
