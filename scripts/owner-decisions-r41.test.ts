import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { businessDisplayName, draftBusinessTitle, isUnnamedBusiness, UNNAMED_BUSINESS } from "../lib/plan-builder/business-name";
import { reorderHref, reorderTarget } from "../lib/payments/reorder";
import { landingShareMetadata } from "../lib/landing/share-card";
import type { LandingDraft } from "../lib/landing/domain";

/*
 * 대표 결정 r41 — 정한 것이 다시 흩어지지 않게 지킨다.
 * 1) 계좌이체 '입금 기한이 지났어요'에 주 단추 '새로 주문하기 ›' — 같은 사업·같은 상품 결제 화면, 모르면 내 사업. 제목→본문 8px · 본문→단추 24px
 * 2) '이미 사업 중이에요'(운영 중)로 시작한 새 대화의 머리줄 제목은 '새 사업 구상' 대신 '내 사업 개선'
 * 3) 이름이 빈 사업은 모든 화면에서 '이름 없는 사업'('새 플랜' 같은 저장소 기본값이 보이지 않게, 저장 값은 그대로)
 * 4) 공개 홈페이지 공유 카드 — 제목과 설명에 같은 한 줄 소개가 두 번이면 설명은 첫 화면 부제목(없으면 지금처럼)
 */
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

// 1) 새로 주문하기
assert.equal(reorderHref(reorderTarget({ planId: "plan_1", planType: "창업 초기 · 사업계획서", product: "homepage" })), "/plan/pay?planId=plan_1&planType=%EC%B0%BD%EC%97%85+%EC%B4%88%EA%B8%B0+%C2%B7+%EC%82%AC%EC%97%85%EA%B3%84%ED%9A%8D%EC%84%9C&product=homepage");
assert.equal(reorderHref(reorderTarget({ planId: "plan_1", planType: "t", product: "plan" })), "/plan/pay?planId=plan_1&planType=t&product=plan");
assert.equal(reorderHref(reorderTarget({ planId: "plan_1", planType: "t", product: "domain-purchase", domainRequest: { domain: "mybrand.com", status: "requested" } })), "/plan/pay?planId=plan_1&planType=t&product=domain-purchase&domain=mybrand.com");
for (const missing of [null, {}, { planId: "plan_1", planType: "t" }, { planId: "plan_1", product: "plan" }, { planType: "t", product: "plan" }, { planId: "plan_1", planType: "t", product: "unknown" }, { title: "예전 진단 주문" }]) {
  assert.equal(reorderHref(reorderTarget(missing as Record<string, unknown> | null)), "/plan", `주문에서 모르면 내 사업으로: ${JSON.stringify(missing)}`);
}
const orders = read("app/api/payments/orders/route.ts");
assert.match(orders, /reorder: reorderTarget\(order\.opportunity\)/, "주문 조회가 다시 주문할 곳을 알려 준다");
const transfer = read("app/payment/transfer/page.tsx");
assert.match(transfer, /const reorder = expired \|\| order\.status === "expired";/);
assert.match(transfer, /\{reorder && <Link className="manual-reorder" href=\{reorderHref\(order\.reorder\)\}>새로 주문하기<ChevronRight aria-hidden="true" \/><\/Link>\}/, "주 단추 '새로 주문하기 ›'(lucide ChevronRight)");
assert.doesNotMatch(transfer, /홈으로 돌아가 새 주문을/, "안내 글이 단추와 다른 길(홈)을 말하지 않는다");
const css = read("app/globals.css");
assert.match(css, /\.manual-payment-card\.status-expired \.manual-payment-state h1 \{ margin-bottom: 8px; \}/, "제목→본문 8px");
assert.match(css, /\.manual-reorder \{[^}]*min-height: 52px; margin-top: 24px;/, "본문→단추 24px, 누르는 자리 44px 이상");

// 2) 운영 중으로 시작한 대화의 머리줄
assert.equal(draftBusinessTitle("새 사업 구상", true), "내 사업 개선");
assert.equal(draftBusinessTitle("새 사업", true), "내 사업 개선");
assert.equal(draftBusinessTitle("새 사업 구상", false), "새 사업 구상", "처음 창업은 그대로");
assert.equal(draftBusinessTitle("동네 세탁소", true), "동네 세탁소", "이름이 생기면 그 이름");
const studio = read("app/plan/studio/Studio.tsx");
assert.match(studio, /draftBusinessTitle\(draftTitle, shownCoach\?\.stage === "operating"\)/, "작업실 머리줄이 운영 중 임시 이름을 쓴다");
assert.match(read("components/home-prompt-sections.tsx"), /title: "이미 사업 중이에요"[^}]*entry: "operating"/, "'이미 사업 중이에요' 입구는 운영 중으로 시작한다");

// 3) 이름 없는 사업
assert.equal(UNNAMED_BUSINESS, "이름 없는 사업");
for (const empty of ["", "  ", null, undefined, "새 플랜"]) assert.equal(businessDisplayName(empty), "이름 없는 사업");
assert.equal(businessDisplayName(" 새벽커피 "), "새벽커피");
assert.ok(!isUnnamedBusiness("새 사업 구상"), "대화 임시 이름은 이름 없는 사업이 아니다");
const screens: Array<[string, RegExp]> = [
  ["app/plan/PlanList.tsx", /<strong className=\{mine\.title\}>\{businessDisplayName\(p\.title\)\}<\/strong>/],
  ["app/plan/me/page.tsx", /\{businessDisplayName\(plan\.title\)\}/],
  ["app/plan/BusinessRailTree.tsx", /<span>\{businessDisplayName\(plan\.title\)\}<\/span>/],
  ["app/plan/PlanRailNav.tsx", /\{businessDisplayName\(plan\.title\)\}<\/span>/],
  ["components/support-chat-home.tsx", /<b>\{businessDisplayName\(plan\.title\)\}<\/b>/],
  ["app/plan/workspace/BusinessWorkspace.tsx", /<WorkspaceIdentity title=\{businessDisplayName\(plan\.title\)\}/],
  ["app/plan/chat/page.tsx", /title=\{plan \? businessDisplayName\(plan\.title\) : "내 사업안"\}/],
  ["app/plan/document/PlanDocumentBody.tsx", /setTitle\(businessDisplayName\(plan\.title\)\)/],
  ["app/plan/studio/Studio.tsx", /plan && isUnnamedBusiness\(draftTitle\) \? businessDisplayName\(draftTitle\)/],
  ["app/plan/chat/intake-ui/IntakePanels.tsx", /<h2 className=\{styles\.resultName\}>\{businessDisplayName\(current\)\}<\/h2>/],
  ["app/plan/chat/BusinessBrief.tsx", /<h1 tabIndex=\{-1\}>\{businessDisplayName\(coach\.business\.name\)\}<\/h1>/],
];
for (const [path, pattern] of screens) {
  const source = read(path);
  assert.match(source, pattern, `${path}: 사업 이름은 businessDisplayName 으로 보인다`);
  assert.doesNotMatch(source, /\|\| "새 플랜"|\?\? "새 플랜"|\|\| "이름 없는 사업"/, `${path}: 화면마다 따로 기본값을 두지 않는다`);
}
assert.match(read("app/plan/PlanList.tsx"), /setName\(isUnnamedBusiness\(p\.title\) \? "" : p\.title\)/, "이름 변경 칸에 '새 플랜'을 채워 두지 않는다");
// 저장 값은 그대로(표시만) — 저장소의 기본값은 바꾸지 않았다
assert.match(read("lib/plan-builder/plan-server-store.ts"), /\|\| "새 플랜"/);

// 4) 공유 카드
const draft = (patch: Partial<LandingDraft>) => ({ businessName: "새벽커피", headline: "새벽커피", subheadline: "아침 7시부터 갓 내린 핸드드립을 드려요.", ...patch }) as LandingDraft;
const repeated = landingShareMetadata(draft({ headline: "" }), "https://oneulstart.com");
assert.equal(repeated.title, "새벽커피 | 아침 7시부터 갓 내린 핸드드립을 드려요.");
assert.equal(repeated.description, "아침 7시부터 갓 내린 핸드드립을 드려요.", "디자인 소개가 없으면 소개 = 부제목, 지금처럼");
const designed = (patch: Partial<LandingDraft>) => draft({ pageData: { brainwave: { page: "0-2226", texts: { "0:2377": "출근길에 들르는 동네 핸드드립 카페" }, images: {}, links: {}, sizes: {}, hidden: [], order: [] } } as unknown as LandingDraft["pageData"], ...patch });
const card = landingShareMetadata(designed({}), "https://oneulstart.com");
assert.equal(card.title, "새벽커피 | 출근길에 들르는 동네 핸드드립 카페");
assert.equal(card.description, "아침 7시부터 갓 내린 핸드드립을 드려요.", "제목에 나온 한 줄 소개를 설명에서 또 쓰지 않는다 — 첫 화면 부제목");
assert.equal(landingShareMetadata(designed({ subheadline: "" }), "https://oneulstart.com").description, "출근길에 들르는 동네 핸드드립 카페", "부제목이 없으면 지금처럼");
assert.equal(landingShareMetadata(designed({ headline: "아침 7시에 문 여는 커피집" }), "https://oneulstart.com").description, "출근길에 들르는 동네 핸드드립 카페", "두 번 나오지 않으면 지금처럼");

console.log("owner decisions r41: ok");
