import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { renderShareCardPng, wrapCardText, CARD_WIDTH, CARD_HEIGHT } from "../lib/landing/share-card-png";
import assert from "node:assert/strict";
import { landingDraftFromPlan } from "../lib/landing/from-plan";
import { landingShareMetadata, shareCardPath, shareCardView, shareImage, shareOrigin, SHARE_FALLBACK_ORIGIN } from "../lib/landing/share-card";
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

// 업종별로 디자인 템플릿이 붙는다 — 카페(동네 가게)는 동네 가게, 교육은 상담 디자인
assert.equal(draftFor("카페 · 음식점", "새벽커피", "핸드드립 커피와 구움과자").pageData?.brainwave?.page, "0-2226");
assert.equal(draftFor("유통 · 온라인 판매", "문앞반찬", "반찬 정기배송").pageData?.brainwave?.page, "0-1102");
assert.equal(draftFor("교육 · 코칭", "바른글방", "초등 글쓰기 소그룹 수업").pageData?.brainwave?.page, "0-290");
assert.equal(draftFor("소프트웨어 · 플랫폼", "장부도우미", "가게 장부 정리 앱").pageData?.brainwave?.page, "0-290");
// 병원·치과·한의원은 업종 글로 병원 디자인(템플릿 종류와 상관없이)
assert.equal(draftFor("기업 서비스", "밝은하루치과", "충치·스케일링").pageData?.brainwave?.page, "0-2385");
assert.equal(draftFor("생활 · 지역 서비스", "온숨한의원", "침·추나").pageData?.brainwave?.page, "0-2385");
assert.equal(draftFor("생활 · 지역 서비스", "동네세탁", "와이셔츠 세탁").pageData?.brainwave?.page, "0-2226", "other shops keep their design");
// 사진이 곧 실력인 업종은 갤러리형, 필라테스·헤어 '스튜디오'는 동네 가게 그대로
assert.equal(draftFor("기업 서비스", "온결 인테리어", "아파트 리모델링").pageData?.brainwave?.page, "0-421");
assert.equal(draftFor("콘텐츠 · 미디어", "하루사진관", "프로필 촬영").pageData?.brainwave?.page, "0-421");
assert.equal(draftFor("공간 · 숙박", "솔숲펜션", "독채 펜션").pageData?.brainwave?.page, "0-421");
assert.equal(draftFor("생활 · 지역 서비스", "바른필라테스 스튜디오", "소그룹 필라테스").pageData?.brainwave?.page, "0-2226");
assert.equal(draftFor("생활 · 지역 서비스", "헤어 스튜디오 온", "커트·펌").pageData?.brainwave?.page, "0-2226");

// 공유 카드: 가게 이름 + 한 줄 소개 + 첫 화면 사진(카톡 비율로 잘라서, 절대 주소)
const cafe = draftFor("카페 · 음식점", "새벽커피", "핸드드립 커피와 구움과자");
cafe.pageData!.brainwave!.texts["0:2377"] = "출근길에 들르는 동네 핸드드립 카페";
const meta = landingShareMetadata(cafe, "https://oneulstart.com");
assert.equal(String(meta.metadataBase), "https://oneulstart.com/");
assert.ok(String(meta.title).startsWith("새벽커피 | "));
// 첫 화면 제목이 가게 이름과 같아 제목이 '새벽커피 | 한 줄 소개'면, 설명은 같은 소개를 또 쓰지 않고 첫 화면 부제목(대표 결정 r41)
assert.equal(cafe.headline, "새벽커피");
assert.equal(meta.title, "새벽커피 | 출근길에 들르는 동네 핸드드립 카페");
// 다만 계획서 내용이 모자라 채운 자동 문장('동네 직장인을 위한 서비스입니다.')이면 바꾸지 않고 지금처럼 한 줄 소개(대표 결정 r41-2)
assert.equal(cafe.subheadline, "동네 직장인을 위한 서비스입니다.");
assert.equal(meta.description, "출근길에 들르는 동네 핸드드립 카페");
const written = landingShareMetadata({ ...cafe, subheadline: "출근길 커피가 늦다 — 7시에 문 열고 3분 안에 드려요." }, "https://oneulstart.com");
assert.equal(written.description, "출근길 커피가 늦다 — 7시에 문 열고 3분 안에 드려요.", "사장님·AI가 쓴 부제목이면 그 문장");
// 부제목이 없거나 한 줄 소개와 같으면 지금처럼 한 줄 소개
assert.equal(landingShareMetadata({ ...cafe, subheadline: "" }, "https://oneulstart.com").description, "출근길에 들르는 동네 핸드드립 카페");
assert.equal(landingShareMetadata({ ...cafe, subheadline: "출근길에 들르는 동네 핸드드립 카페" }, "https://oneulstart.com").description, "출근길에 들르는 동네 핸드드립 카페");
// 첫 화면 제목이 따로 있으면 제목은 '가게 이름 | 첫 화면 제목', 설명은 한 줄 소개 그대로(두 번 나오지 않으니)
const titled = landingShareMetadata({ ...cafe, headline: "아침 7시에 문 여는 커피집" }, "https://oneulstart.com");
assert.equal(titled.title, "새벽커피 | 아침 7시에 문 여는 커피집");
assert.equal(titled.description, "출근길에 들르는 동네 핸드드립 카페");
const og = meta.openGraph as { siteName: string; images: Array<{ url: string; width?: number }> };
assert.equal(og.siteName, "새벽커피");
assert.match(og.images[0].url, /^https:\/\/images\.unsplash\.com\/.*w=1200.*h=630/);
assert.equal(og.images[0].width, 1200);
assert.equal((meta.twitter as { card: string }).card, "summary_large_image");

// 사장님이 올린 사진이 첫 화면에 있으면 그 사진
cafe.pageData!.brainwave!.images["0:2362/0/0"] = "https://files.example.com/my-cafe.jpg";
assert.equal(shareImage(cafe), "https://files.example.com/my-cafe.jpg");
// 템플릿 견본 사진뿐이면 사진 없이(남의 가게 사진이 카드에 뜨지 않게)
for (const id of Object.keys(cafe.pageData!.brainwave!.images)) cafe.pageData!.brainwave!.images[id] = "/brainwave/0-2226/sample.jpg";
cafe.heroImageUrl = "";
assert.equal(shareImage(cafe), null);
// 사진이 없으면 이름과 소개를 적은 카드 그림을 붙인다 — 카톡에 주소와 글만 뜨지 않게(2026-11-20)
const drawn = landingShareMetadata(cafe, "https://oneulstart.com");
assert.equal((drawn.twitter as { card: string }).card, "summary_large_image");
const drawnImage = (drawn.openGraph as { images: Array<{ url: string; width?: number; height?: number }> }).images[0];
assert.equal(drawnImage.url, `https://oneulstart.com${shareCardPath(cafe)}`);
assert.match(drawnImage.url, /^https:\/\/oneulstart\.com\/api\/public\/share-card\/[^?]+\?v=[a-z0-9]+$/);
assert.deepEqual([drawnImage.width, drawnImage.height], [1200, 630]);
// 연결한 내 도메인에서도 그림은 오늘창업 주소에서 받는다
assert.ok((landingShareMetadata(cafe, "https://shop.example.co.kr", "/", SHARE_FALLBACK_ORIGIN).openGraph as { images: Array<{ url: string }> }).images[0].url.startsWith("https://oneulstart.com/api/public/share-card/"));
// 이름이 바뀌면 그림 주소도 바뀐다(카톡이 옛 그림을 붙들지 않게). 이름과 같은 소개는 두 번 적지 않는다
assert.notEqual(shareCardPath(cafe), shareCardPath({ ...cafe, businessName: "한낮커피" }));
assert.equal(shareCardView(cafe).name, "새벽커피");
assert.ok(shareCardView(cafe).tagline.length > 0 && shareCardView(cafe).tagline.length <= 56);
assert.match(shareCardView(cafe).accent, /^#[0-9a-fA-F]{6}$/);
// 주소가 아직 없는 초안은 그림 없이
assert.equal((landingShareMetadata({ ...cafe, slug: "" }, "https://oneulstart.com").twitter as { card: string }).card, "summary");

// 주소: 연결한 도메인은 그대로 https, 이상한 값이면 오늘창업 주소
assert.equal(shareOrigin("shop.example.co.kr", "https"), "https://shop.example.co.kr");
assert.equal(shareOrigin("oneulstart.com, proxy.internal", "https"), "https://oneulstart.com");
assert.equal(shareOrigin("evil.com/<script>", "https"), SHARE_FALLBACK_ORIGIN);
assert.equal(shareOrigin(null, null), SHARE_FALLBACK_ORIGIN);
assert.equal(shareOrigin("localhost:3000", "http"), "http://localhost:3000");

// 카드 그림 — 글꼴 윤곽으로 직접 그린 1200×630 PNG. 글자가 실제로 칠해지고(잉크색 점), 글꼴에 없는 글자(이모지)에도 죽지 않는다
{
  const font = new Uint8Array(readFileSync("public/fonts/NanumGothic-Regular.ttf"));
  const png = Buffer.from(renderShareCardPng({ name: "달빛 캔들 공방 🕯", tagline: "집에서 쉬는 시간을 향으로 채우는 수제 소이 캔들", ink: "#2b2118", accent: "#9a5b34", paper: "#fffaf4" }, font));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [CARD_WIDTH, CARD_HEIGHT]);
  const idat = png.subarray(8 + 25 + 8, png.length - 12 - 4);
  const raw = inflateSync(idat);
  assert.equal(raw.length, (CARD_WIDTH * 3 + 1) * CARD_HEIGHT);
  const pixel = (x: number, y: number) => [...raw.subarray(y * (CARD_WIDTH * 3 + 1) + 1 + x * 3, y * (CARD_WIDTH * 3 + 1) + 4 + x * 3)];
  assert.deepEqual(pixel(10, 300), [0x9a, 0x5b, 0x34], "왼쪽 띠는 강조색");
  assert.deepEqual(pixel(1150, 20), [0xff, 0xfa, 0xf4], "바탕은 종이색");
  let inked = 0;
  for (let y = 0; y < CARD_HEIGHT; y += 1) for (let x = 120; x < 1100; x += 1) { const [r, g, b] = pixel(x, y); if (r === 0x2b && g === 0x21 && b === 0x18) inked += 1; }
  assert.ok(inked > 8_000, `이름 글자가 잉크색으로 칠해진다(${inked}점)`);
  // 줄 나누기: 낱말 단위, 줄 수를 넘으면 마지막 줄 끝에 …
  const measure = (text: string) => text.length * 10;
  assert.deepEqual(wrapCardText(measure, "가나다 라마바 사아자", 70, 2), ["가나다 라마바", "사아자"]);
  assert.deepEqual(wrapCardText(measure, "가나다 라마바 사아자 차카타 파하", 70, 2), ["가나다 라마바", "사아자 차카…"]);
  assert.deepEqual(wrapCardText(measure, "가나다라마바사아자차", 50, 3), ["가나다라마", "바사아자차"]);
}

console.log("landing-share-card: designed defaults for every sector, share card title/description (no repeated tagline, no filler subheadline)/photo, origin");
