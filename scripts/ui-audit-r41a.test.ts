import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/*
 * 화면 점검 r41-A(상태별 화면·접근성) — 고친 것이 다시 흩어지지 않게 소스로 지킨다.
 * 1) 로그인·가입·계정 확인이 실패해도 "Failed to fetch"·"Unexpected token '<'" 같은 원문을 보이지 않는다
 * 2) 결제 화면: 결제 여부 확인 실패(500·끊김·시간 초과)는 홈페이지 상품에서도 안내와 '다시 확인하기'를 보인다.
 *    오류 응답을 정상 값으로 읽어 '로그인이 필요해요'를 띄우지 않는다
 * 3) 결제·결제 결과 화면은 불러오는 동안 빈 칸 대신 불러오는 중 안내
 * 4) 홈페이지 탭 연결 실패는 '사업을 찾지 못했어요'가 아니라 '사업을 불러오지 못했어요'
 * 5) 내 계정: 환불·탈퇴 실패 안내도 원문 대신 한국어
 * 6) 내 사업 빈 화면 제목은 h2(머리줄 h1 '내 사업'과 겹치지 않게)
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

for (const path of ["components/account-auth-form.tsx", "app/account/page.tsx"]) {
  const src = read(path);
  assert.match(src, /await response\.json\(\)\.catch\(\(\) => null\)/, `${path}: HTML 오류 본문을 JSON 으로 읽다 영어 원문이 보인다`);
  assert.doesNotMatch(src, /setMessage\((error\.message|error instanceof Error \? error\.message)/, `${path}: 잡은 오류 원문을 그대로 보인다`);
  assert.match(src, /userErrorMessage\(/, `${path}: 사람용 오류 문구(userErrorMessage)를 쓰지 않는다`);
}

const checkout = read("app/plan/pay/PlanCheckout.tsx");
assert.match(checkout, /fetchWithTimeout\(`\/api\/plan\/access/, "결제 여부 확인에 시간 제한이 없다");
assert.match(checkout, /if \(!r\.ok\) throw new Error\("access"\)/, "결제 여부 오류 응답을 정상 값으로 읽는다(로그인이 필요해요가 뜬다)");
const priceBlock = checkout.slice(checkout.indexOf("{notSoldInApp ? null : extra ? ("), checkout.indexOf(") : isHomepage ? (", checkout.indexOf("{notSoldInApp ? null : extra ? (")));
assert.match(priceBlock, /infoFailed \?/, "홈페이지 상품에서 결제 여부 확인 실패가 드러나지 않는다");

for (const path of ["app/plan/pay/page.tsx", "app/plan/pay/result/page.tsx"]) {
  assert.doesNotMatch(read(path), /fallback=\{null\}/, `${path}: 불러오는 동안 빈 칸이 보인다`);
}

assert.match(read("app/plan/homepage/HomepageScreen.tsx"), /lastHydrationFailed\(\) \? \{ title: "사업을 불러오지 못했어요"/, "홈페이지 탭 연결 실패에 '사업을 찾지 못했어요'가 뜬다");

const me = read("app/plan/me/page.tsx");
assert.doesNotMatch(me, /error instanceof Error \? error\.message/, "내 계정 환불·탈퇴 실패에 오류 원문이 보인다");

assert.match(read("app/plan/PlanList.tsx"), /<BusinessEmptyState heading="h2"/, "내 사업 빈 화면 제목이 h1 이라 제목이 두 개가 된다");

console.log("ui audit r41-A: ok");
