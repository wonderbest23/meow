import assert from "node:assert/strict";
import { landingDraftFromPlan } from "../lib/landing/from-plan";
import { landingShareMetadata, shareImage, shareOrigin, SHARE_FALLBACK_ORIGIN } from "../lib/landing/share-card";
import { BRAINWAVE_DEFAULT_FOR_TEMPLATE } from "../lib/landing/brainwave/catalog";
import { BUSINESS_DESIGNED_PAGES } from "../lib/landing/brainwave/business-content";
import { COACH_KEY, COACH_VERSION, type CoachState } from "../lib/plan-builder/coach";

// 모든 업종이 디자인을 옮긴 템플릿으로 시작한다(간이 화면으로 시작하는 업종이 없다)
for (const [template, page] of Object.entries(BRAINWAVE_DEFAULT_FOR_TEMPLATE)) assert.ok(BUSINESS_DESIGNED_PAGES.has(page), `${template} → ${page} is designed`);

const coach = (industry: string, name: string, offer: string): CoachState => ({
  version: COACH_VERSION, revision: 1, stage: "startup", depth: "quick", ready: true, messages: [], suggestions: [],
  business: { name, description: "", role: "", industry, region: "", stage: "사업 기획" },
  fields: [
    { key: "offer", value: offer, basis: "user", quote: offer, messageId: "a" },
    { key: "customer", value: "동네 직장인", basis: "user", quote: "동네 직장인", messageId: "a" },
  ],
});
const draftFor = (industry: string, name: string, offer: string) => landingDraftFromPlan({ planTitle: name, business: {}, answers: { [COACH_KEY]: { state: coach(industry, name, offer) } } });

// 업종별로 디자인 템플릿이 붙는다 — 카페(동네 가게)는 사진 카드가 많은 상점, 교육은 상담 디자인
assert.equal(draftFor("카페 · 음식점", "새벽커피", "핸드드립 커피와 구움과자").pageData?.brainwave?.page, "0-1102");
assert.equal(draftFor("교육 · 코칭", "바른글방", "초등 글쓰기 소그룹 수업").pageData?.brainwave?.page, "0-290");
assert.equal(draftFor("소프트웨어 · 플랫폼", "장부도우미", "가게 장부 정리 앱").pageData?.brainwave?.page, "0-290");

// 공유 카드: 가게 이름 + 한 줄 소개 + 첫 화면 사진(카톡 비율로 잘라서, 절대 주소)
const cafe = draftFor("카페 · 음식점", "새벽커피", "핸드드립 커피와 구움과자");
cafe.pageData!.brainwave!.texts["0:1328"] = "출근길에 들르는 동네 핸드드립 카페";
const meta = landingShareMetadata(cafe, "https://oneulstart.com");
assert.equal(String(meta.metadataBase), "https://oneulstart.com/");
assert.ok(String(meta.title).startsWith("새벽커피 | "));
assert.equal(meta.description, "출근길에 들르는 동네 핸드드립 카페");
const og = meta.openGraph as { siteName: string; images: Array<{ url: string; width?: number }> };
assert.equal(og.siteName, "새벽커피");
assert.match(og.images[0].url, /^https:\/\/images\.unsplash\.com\/.*w=1200.*h=630/);
assert.equal(og.images[0].width, 1200);
assert.equal((meta.twitter as { card: string }).card, "summary_large_image");

// 사장님이 올린 사진이 첫 화면에 있으면 그 사진
cafe.pageData!.brainwave!.images["0:1325/0/0"] = "https://files.example.com/my-cafe.jpg";
assert.equal(shareImage(cafe), "https://files.example.com/my-cafe.jpg");
// 템플릿 견본 사진뿐이면 사진 없이(남의 가게 사진이 카드에 뜨지 않게)
for (const id of Object.keys(cafe.pageData!.brainwave!.images)) cafe.pageData!.brainwave!.images[id] = "/brainwave/0-1102/sample.jpg";
cafe.heroImageUrl = "";
assert.equal(shareImage(cafe), null);
assert.equal((landingShareMetadata(cafe, "https://oneulstart.com").twitter as { card: string }).card, "summary");

// 주소: 연결한 도메인은 그대로 https, 이상한 값이면 오늘창업 주소
assert.equal(shareOrigin("shop.example.co.kr", "https"), "https://shop.example.co.kr");
assert.equal(shareOrigin("oneulstart.com, proxy.internal", "https"), "https://oneulstart.com");
assert.equal(shareOrigin("evil.com/<script>", "https"), SHARE_FALLBACK_ORIGIN);
assert.equal(shareOrigin(null, null), SHARE_FALLBACK_ORIGIN);
assert.equal(shareOrigin("localhost:3000", "http"), "http://localhost:3000");

console.log("landing-share-card: designed defaults for every sector, share card title/description/photo, origin");
