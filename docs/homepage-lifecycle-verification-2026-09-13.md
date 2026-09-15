# 홈페이지 생성부터 문의 접수까지의 로컬 검증

기준일: 2026-09-13. 실제 로컬 Auth/PostgreSQL/Next API와 가상 사업으로 검증했다.
운영 Supabase, 8083 서버, 실제 PG, 유료 AI, 이메일/SMS 발송은 사용하지 않았다. 운영 배포 결과가 아니다.

## 이번 범위

같은 사업의 홈페이지 생성 -> 상품별 편집 권한 -> 저장 -> 재접속 -> 공개 -> 수정 공개 -> 이전 버전 복원 -> 공개 문의 접수 -> 소유자 조회를 연결했다.

기존 [저장 검증](./homepage-save-verification-2026-09-13.md)의 메모리/편집기 검사와 달리, 이번에는 실제 로컬 DB 트랜잭션과 인증된 `/plan/homepage`를 사용했다. 결제 상태만 로컬 테스트 주문으로 만들었으며 PG 승인 검증을 대신하지 않는다.

## 발견하고 수정한 문제

### 최초 생성 경합

동일 사업의 첫 홈페이지 요청이 겹치면 프로젝트가 두 개 생성되고 이후 단일 조회가 `PGRST116`으로 실패했다. 로컬 run `mtzq1rpv`에서 재현했다.

- `ensure_plan_project` RPC가 사업/소유자별 DB 잠금을 획득하고 프로젝트와 6개 단계를 한 트랜잭션에서 생성한다.
- 메모리 모드에서도 같은 소유자/사업의 진행 중 생성 요청을 공유한다.
- 기존 중복 데이터를 임의로 삭제하지 않는다. 중복 연결은 별도 검토 후 정리해야 한다.

### 공개와 초안의 경계

- 공개 버전은 저장 당시의 초안으로 고정한다. 공개 버전 생성과 공개 포인터 갱신을 한 트랜잭션으로 묶었다.
- 초안 주소 `slug`와 실제 공개 주소 `published_slug`를 분리했다. 초안에서 주소/내용을 수정해도 다시 공개하기 전에는 기존 주소와 내용이 유지된다.
- 공개/복원 API는 편집기가 확인한 `expectedUpdatedAt`을 요구한다. 오래된 탭은 409, 기준 버전이 없는 요청은 428로 거절한다.
- 동일한 공개 요청의 재전송은 현재 초안과 공개 결과가 그대로일 때만 기존 결과를 재사용한다. 중복 공개 버전을 만들지 않는다.
- 이전 버전을 복원할 때도 현재 초안을 확인한다. 이미 같은 상태로 복원된 요청은 재사용할 수 있다.
- 커스텀 도메인 렌더러의 문의 주소도 초안이 아닌 공개 스냅샷의 주소를 사용한다. 실제 도메인 연결은 이번에 실행하지 않았다.

### 문의 조회와 모바일 도구줄

- 문의 조회 실패를 빈 배열/0건으로 표시하던 처리를 제거했다. 오류 안내와 새로고침을 제공한다.
- 프로젝트 변경이나 컴포넌트 종료 시 이전 조회 요청을 중단한다.
- 모바일에서 오른쪽 도구 버튼이 잘리던 미리보기 상단을 줄바꿈 가능한 배치로 변경했다.

### 도메인 상태 조회 반복

인증된 홈페이지의 서버 로그에서 도메인 GET이 응답 직후 계속 반복되는 것을 확인했다. 부모의 `onSiteUpdated` 함수가 재렌더링마다 바뀌고, 이를 의존하던 조회 효과가 다시 실행됐다.

- 최신 콜백 참조와 조회 효과의 의존성을 분리했다. 도메인이 없는 화면을 가만히 둘 때 자동 조회 루프가 발생하지 않는다.
- 진행 중 조회가 있으면 다음 조회를 겹쳐 실행하지 않는다. 프로젝트 변경/화면 종료 시 이전 조회를 중단한다.
- 브라우저 진입 후 5초 동안 요청 수가 초기 로딩 범위를 넘지 않는지 검사했다. 실제 DNS/인증서 연결 완료 검사는 아니다.

## 검증 결과

| 검증 | 결과 | 확인한 범위 |
| --- | --- | --- |
| 로컬 Auth/DB/HTTP | 16/16 통과 | 최초 동시 생성, 권한, 조건부 저장, 공개/복원, 문의, 재로그인, 환불 |
| DB 장애 주입 | 통과 | 단계 INSERT 실패 시 프로젝트 전체 롤백, 공개 UPDATE 실패 시 버전 전체 롤백 |
| RPC 접근 제한 | 통과 | anon/인증 브라우저 역할 직접 호출 거절, 잘못된 소유자 거절 |
| 브라우저 | 11/11 통과 | 실제 이메일 로그인, 조회 반복 방지, PC/모바일 저장·공개, 문의 제출·조회·실패 후 새로고침, 도구 버튼 잘림/가로 넘침 검사 |
| 회귀 | 34/34 묶음 통과 | 외부 AI/PG 호출 차단. 메모리 공개/복원 회귀 추가 |
| 타입 검사 | 통과 | `tsc --noEmit --incremental false` |

16개 통합 검사에는 다음 경계가 포함된다.

1. 동시 첫 요청이 하나의 프로젝트/홈페이지/6단계를 만든다.
2. 미결제 미리보기는 비공개이며 다른 사업 정보와 내부 재무 데이터를 공개 초안으로 가져오지 않는다.
3. 브라우저 DB 역할은 내부 트랜잭션 RPC를 직접 실행할 수 없다.
4. 단계 생성 장애는 새 프로젝트까지 롤백한다.
5. 계획서 결제나 다른 사업의 홈페이지 결제로 현재 편집 권한이 열리지 않는다.
6. 같은 버전의 동시 저장은 200/409로 구분하고 먼저 저장한 내용을 보존한다.
7. 공개는 편집기가 저장한 버전을 확인한다.
8. 공개 포인터 갱신 실패 시 미완성 공개 버전을 남기지 않는다.
9. 중복 공개는 한 버전만 만든다.
10. 초안 주소/내용 수정은 현재 공개 페이지를 바꾸지 않는다.
11. 수정 공개는 새 주소/내용을 반영하면서 이전 버전을 보존한다.
12. 복원은 오래된 탭을 거절하고 선택한 공개 버전을 되살린다.
13. 문의는 동의/연락처/허니팟을 검사하고 소유자에게만 노출한다.
14. 새 로그인에서도 수정본/버전/문의가 복원된다.
15. 공개된 설정에서 문의 수집을 끄면 API에서도 차단한다.
16. 환불 후 편집/공개/복원 권한은 차단하지만 저장된 자료는 삭제하지 않는다.

증거: `artifacts/local-homepage-lifecycle/report-mtzqfm0u.json` 및 `browser-report.json`.
브라우저 계정 fixture는 무시되는 로컬 산출물에만 보관한다. 비밀번호나 세션을 문서/로그에 남기지 않는다.

## 재실행

```sh
node --import tsx scripts/local-account-lab.mts prepare
node --import tsx scripts/local-account-lab.mts migrate
node --import tsx scripts/local-account-lab.mts serve
```

서버가 열린 상태에서 별도 터미널로 실행한다.

```sh
node --import tsx scripts/local-homepage-lifecycle.test.mts
RUNTIME_NODE_MODULES=/path/to/bundled/node_modules node --import tsx scripts/local-homepage-browser.test.mts
node --import tsx scripts/reliability-tests.mts
```

- 앱 `127.0.0.1:8094`, Supabase API `127.0.0.1:55431`, DB `127.0.0.1:55432`만 허용한다.
- `.env.local`을 로드하지 않는다. 운영 키 대신 인식된 로컬 lab의 자격 증명만 사용한다.
- 브라우저 검사는 번들 Playwright/Chromium을 사용한다. 기존 인앱 브라우저 연결은 시간 초과되어 이 경로로 대체했다.
- 복사본 재시작 중 기존 Turbopack 생성 캐시에서 `cookies outside request scope` 오류가 발생했다. 테스트 복사본의 `.next`만 보존용 이름으로 옮겨 새로 컴파일한 뒤 로그인부터 11개 항목을 다시 통과했다. 운영 캐시나 DB는 변경하지 않았다.
- 외부 사진/폰트/Google 스크립트는 차단한다. 따라서 이미지 로딩이나 Google OAuth가 통과했다는 뜻이 아니다.
- 브라우저 테스트의 합성 홈페이지 주문은 종료 시 로컬에서 환불 상태로 돌린다. 비정상 종료 후 재실행도 같은 fixture의 테스트 주문만 정리한다.
- 검사 후 Next 서버를 종료하고 `node --import tsx scripts/local-account-lab.mts stop`으로 DB를 중지한다. 로컬 볼륨/검사 결과는 보존한다.

## 배포 전 조건

새 `0030_homepage_lifecycle.sql`은 **격리 로컬 DB에만 적용**했다. 운영에는 자동 적용하지 않았다.

1. 별도 스테이징과 백업을 준비한다.
2. 기존 중복 사업-프로젝트 연결, 중복 공개 주소, 없는 공개 버전 참조를 읽기 전용으로 점검한다. 발견한 행을 자동 삭제/병합하지 않는다.
3. DB 마이그레이션을 먼저 적용하고 새 API와 클라이언트를 함께 배포한다. 이전 클라이언트는 공개/복원에서 428 안내를 받을 수 있으므로 오래 열린 탭도 확인한다.
4. 스테이징 Google 로그인, PG 테스트 권한, Cloudflare에서 위 여정을 반복한다.
5. 공개 주소 변경/복원, 외부 이미지, 커스텀 도메인과 문의 처리 담당자를 확인한 뒤 제한 출시를 판단한다.

중복/누락 점검 예시이며 이번에 운영 DB에서 실행한 SQL은 아니다. 결과는 개수만 반환한다.

```sql
select count(*) as duplicate_plan_links from (
  select 1 from public.projects
  where opportunity->>'planId' is not null
  group by guest_token_hash, opportunity->>'planId' having count(*) > 1
) duplicates;

select count(*) as duplicate_public_slugs from (
  select 1 from public.landing_sites s
  join public.landing_versions v on v.site_id = s.id and v.version = s.published_version
  where v.config->>'slug' is not null
  group by v.config->>'slug' having count(*) > 1
) duplicates;

select count(*) as missing_public_versions from public.landing_sites s
left join public.landing_versions v on v.site_id = s.id and v.version = s.published_version
where s.published_version is not null and v.id is null;
```

현재 문의 수신은 DB 접수와 관리자 화면 조회까지다. 이메일/SMS 자동 알림 전달, 실제 휴대전화 키보드, 이미지 업로드, 블록 편집기 전체 상호작용, 공개 CDN 캐시, PG 콜백은 완료로 표시하지 않는다. 이번 단계에서 커밋/푸시/배포나 출시 플래그 활성화는 하지 않았다.
