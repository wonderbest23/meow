import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { createBusinessTemplate } from "../lib/landing/brainwave/business-content";
import { LANDING_LAYOUT_VARY, landingLayoutHint, withLandingVary } from "../lib/landing/layout-hint";
import { jsonLdText, landingLocalBusinessJsonLd, localBusinessType, parseOpenHours, usablePhone } from "../lib/landing/local-business-jsonld";
import type { LandingDraft } from "../lib/landing/domain";

/* 심사 뒤 S3 — 공개 홈페이지 휴대폰 첫 화면 밀림(CLS)과 검색용 가게 정보(LocalBusiness JSON-LD) */

// CSS 모듈·next/font 는 이름만 있으면 된다
const require = createRequire(import.meta.url);
require.extensions[".css"] = (module) => { module.exports = { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }; };
const fontStub = require.resolve("next/font/local");
require.cache[fontStub] = { id: fontStub, filename: fontStub, loaded: true, exports: { __esModule: true, default: () => ({ variable: "bw-font", className: "bw-font", style: {} }) } } as never;
const { BrainwaveStage, BrainwaveLayoutHintContext } = require("../components/brainwave-page") as typeof import("../components/brainwave-page");

// 1) 요청 머리말 → 처음 배치. 휴대폰이 확실하면 mobile, PC 가 확실하면 desktop, 태블릿·알 수 없음은 either
const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  androidPhone: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  app: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 OneulstartApp",
};
assert.equal(landingLayoutHint(UA.iphone, null), "mobile");
assert.equal(landingLayoutHint(UA.app, null), "mobile", "아이폰 앱 안에서도 휴대폰");
assert.equal(landingLayoutHint(UA.androidPhone, "?1"), "mobile");
assert.equal(landingLayoutHint(UA.androidPhone, null), "mobile");
assert.equal(landingLayoutHint(UA.androidTablet, "?0"), "either", "안드로이드 태블릿은 폭을 재야 안다");
assert.equal(landingLayoutHint(UA.ipad, null), "either", "iPad 는 UA 에 Mobile/ 이 있어도 태블릿");
assert.equal(landingLayoutHint(UA.mac, "?0"), "desktop");
assert.equal(landingLayoutHint(UA.windows, null), "desktop");
assert.equal(landingLayoutHint("", null), "either");
assert.equal(landingLayoutHint(null, "?1"), "mobile");
assert.equal(LANDING_LAYOUT_VARY, "User-Agent, Sec-CH-UA-Mobile");

// 2) 무대: 휴대폰이면 서버 HTML 부터 휴대폰 배치, PC 면 지금처럼 PC 배치, 애매하면 둘 다 싣고 CSS 가 고른다
const page = JSON.parse(readFileSync("lib/landing/brainwave/pages/0-2226.json", "utf8"));
const overrides = createBusinessTemplate({ businessName: "망원소금빵", offer: "소금빵", description: "아침마다 굽는 소금빵", customer: "동네 주민", price: "3,000원", cta: "전화하기", image: "/qa-light-photo.png" }, "0-2226");
const stage = (hint: "mobile" | "desktop" | "either" | null, extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(BrainwaveLayoutHintContext.Provider, { value: hint }, createElement(BrainwaveStage, { page, overrides, ...extra })));
const desktopDesign = "bw-business-flow";
const phone = stage("mobile");
assert.ok(phone.includes("bw-stage bw-mobile") && !phone.includes(desktopDesign), "휴대폰: 처음부터 휴대폰 배치");
assert.ok(phone.includes("망원소금빵"), "휴대폰 배치에 글이 들어 있다(빈 칸으로 그리지 않음)");
const pc = stage("desktop");
assert.ok(pc.includes(desktopDesign) && !pc.includes("bw-mobile"), "PC: 지금처럼 PC 배치");
assert.equal(stage(null), pc, "힌트가 없으면(편집기 미리보기) 예전과 같다");
const either = stage("either");
assert.ok(either.includes(desktopDesign) && either.includes("bw-stage bw-mobile") && either.includes("dual"), "애매하면 두 배치를 함께 싣는다");
assert.ok(!either.includes("measured"), "폭을 재기 전에는 CSS(@container)가 고른다");
assert.equal(stage("mobile", { onPick: () => {} }).includes("bw-mobile"), true, "편집기 안에서도 힌트를 받으면 같은 규칙");
assert.equal(stage("mobile", { mode: "desktop" }), stage(null, { mode: "desktop" }), "mode=desktop(편집기 컴퓨터 보기)은 힌트를 따르지 않는다");
assert.equal(stage("desktop", { mode: "mobile" }), stage(null, { mode: "mobile" }), "mode=mobile(편집기 휴대폰 보기)은 힌트를 따르지 않는다");
const css = readFileSync("components/brainwave-stage.module.css", "utf8");
assert.match(css, /@container \(max-width: 640px\)/, "CSS 기준은 무대 판정(폭 640 이하 = 휴대폰)과 같다");
const stageSource = readFileSync("components/brainwave-page.tsx", "utf8");
assert.match(stageSource, /width > 0 \? width <= \(hint === "mobile" \? PHONE_LAYOUT_MAX : 640\) : guess === "mobile"/, "폭을 재면 잰 폭을 따른다 — 휴대폰이 확실하면 가로(960px 까지)도 휴대폰 배치");
assert.match(stageSource, /const PHONE_LAYOUT_MAX = 960;/);

// 3) 공개 홈페이지만 힌트를 넣고, 응답에 Vary 를 붙인다(캐시가 휴대폰·PC HTML 을 섞지 않게)
for (const file of ["app/launch/[slug]/page.tsx", "app/customer-site/page.tsx"]) {
  const source = readFileSync(file, "utf8");
  assert.match(source, /layoutHint=\{landingLayoutHintFromHeaders\(/, `${file} 가 힌트를 넘긴다`);
  assert.match(source, /application\/ld\+json/, `${file} 가 가게 정보를 싣는다`);
}
assert.match(readFileSync("components/public-landing-client.tsx", "utf8"), /<BrainwaveLayoutHintContext\.Provider value=\{layoutHint\}>/);
const varied = (path: string) => withLandingVary(path, new Response("x", { headers: { Vary: "rsc, Accept-Encoding", "Cache-Control": "private, no-store" } })).headers.get("Vary");
assert.equal(varied("/launch/salt-bread"), "rsc, Accept-Encoding, User-Agent, Sec-CH-UA-Mobile", "공개 홈페이지 응답에 Vary 를 덧붙인다(Next 의 Vary 는 그대로)");
assert.equal(varied("/customer-site"), "rsc, Accept-Encoding, User-Agent, Sec-CH-UA-Mobile", "내 도메인 응답에도");
assert.equal(varied("/plan"), "rsc, Accept-Encoding", "다른 화면은 그대로");
assert.equal(varied("/launch/salt-bread/event"), "rsc, Accept-Encoding");
assert.match(readFileSync("cloudflare-worker.ts", "utf8"), /return withLandingVary\(new URL\(forwarded\.url\)\.pathname, await handler\.fetch\(forwarded, env, context\)\);/, "워커가 Next 가 다 그린 뒤 붙인다");
assert.ok(!readFileSync("app/sitemap.ts", "utf8").includes("launch"), "사장님 홈페이지는 사이트맵에 넣지 않는다(보류)");

// 4) 가게 정보(JSON-LD) — 실제로 채운 값만. 하나라도 미덥지 않으면 싣지 않는다
const draft = (patch: Partial<LandingDraft>) => ({
  businessName: "망원소금빵", headline: "아침마다 굽는 소금빵", offerTitle: "소금빵",
  businessAddress: "서울 마포구 망원로 12 1층", businessPhone: "02-336-7788", businessContact: "", businessEmail: "salt@mangwon.kr",
  openHours: "화-일 08:00~20:00, 월 휴무", logoImageUrl: "", heroImageUrl: "", pageData: null, ...patch,
}) as LandingDraft;
const full = landingLocalBusinessJsonLd(draft({}), "https://oneulstart.com/launch/salt");
assert.deepEqual(full, {
  "@context": "https://schema.org", "@type": "Bakery", name: "망원소금빵", url: "https://oneulstart.com/launch/salt", telephone: "02-336-7788",
  address: { "@type": "PostalAddress", addressRegion: "서울", addressLocality: "마포구", streetAddress: "망원로 12 1층", addressCountry: "KR" },
  email: "salt@mangwon.kr",
  openingHoursSpecification: [{ "@type": "OpeningHoursSpecification", dayOfWeek: ["Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => `https://schema.org/${day}`), opens: "08:00", closes: "20:00" }],
});
assert.equal(landingLocalBusinessJsonLd(draft({ businessAddress: "서울 마포구" }), "u"), null, "계획서가 채운 지역 이름만 있으면 싣지 않는다");
assert.equal(landingLocalBusinessJsonLd(draft({ businessAddress: "" }), "u"), null);
assert.equal(landingLocalBusinessJsonLd(draft({ businessPhone: "", businessContact: "" }), "u"), null, "전화가 없으면 싣지 않는다");
assert.equal(landingLocalBusinessJsonLd(draft({ businessPhone: "010-0000-0000" }), "u"), null, "견본 번호");
assert.equal(landingLocalBusinessJsonLd(draft({ businessPhone: "010-1234-5678" }), "u"), null, "견본 번호");
assert.equal(landingLocalBusinessJsonLd(draft({ businessName: "아파트 상가 아침 빵집" }), "u"), null, "계획서 제목이 그대로 들어온 설명 문장");
assert.equal(landingLocalBusinessJsonLd(draft({ businessName: "테스트 가게" }), "u"), null, "시험 값");
assert.equal(landingLocalBusinessJsonLd(draft({ businessAddress: "테스트로 1" }), "u"), null, "시험 값");
assert.equal(landingLocalBusinessJsonLd(draft({ businessPhone: "", businessContact: "010-4821-3390" }), "u")?.telephone, "010-4821-3390", "연락처 칸의 전화번호도 쓴다");
assert.equal(landingLocalBusinessJsonLd(draft({ businessEmail: "hello@example.com" }), "u")?.email, undefined, "견본 이메일은 뺀다");
assert.equal(landingLocalBusinessJsonLd(draft({ heroImageUrl: "https://images.unsplash.com/photo-1?w=1" }), "u")?.image, undefined, "업종 견본 사진은 가게 사진이 아니다");
assert.equal(landingLocalBusinessJsonLd(draft({ heroImageUrl: "https://cdn.mangwon.kr/front.jpg" }), "u")?.image, "https://cdn.mangwon.kr/front.jpg");
assert.equal(landingLocalBusinessJsonLd(draft({ heroImageUrl: "data:image/png;base64,AAAA" }), "u")?.image, undefined, "올린 그림(data:)은 주소가 아니다");
assert.ok(!("description" in full!), "소개 문장(자동 문장일 수 있음)은 싣지 않는다");

// 영업시간 — 형식이 확실할 때만, 한 칸이라도 못 읽으면 통째로 뺀다
assert.equal(landingLocalBusinessJsonLd(draft({ openHours: "평일 10시부터" }), "u")?.openingHoursSpecification, undefined);
assert.equal(parseOpenHours("평일 10:00~19:00 (점심 12~1시)"), null);
assert.equal(parseOpenHours("매일 10:00~21:00, 문의 바람"), null);
assert.equal(parseOpenHours(""), null);
assert.equal(parseOpenHours("미정"), null);
assert.equal(parseOpenHours("월~금 09:00~18:00, 수 10:00~12:00"), null, "같은 요일이 겹치면 못 읽은 것으로");
assert.deepEqual(parseOpenHours("평일 09:00-18:00, 토 10:00-14:00, 일 휴무")?.map((spec) => [spec.dayOfWeek.length, spec.opens, spec.closes]), [[5, "09:00", "18:00"], [1, "10:00", "14:00"]]);
assert.deepEqual(parseOpenHours("매일 18:00~24:00")?.map((spec) => spec.closes), ["23:59"], "24:00 은 구글 권장대로 23:59");
assert.deepEqual(parseOpenHours("매일 18:00~02:00")?.map((spec) => [spec.opens, spec.closes]), [["18:00", "02:00"]], "자정 넘어 닫는 가게");

// 전화 꼴
assert.equal(usablePhone("+82 10-9876-5432"), "010-9876-5432");
assert.equal(usablePhone("0507-1388-2201"), "0507-1388-2201");
assert.equal(usablePhone("1588-7788"), "1588-7788");
assert.equal(usablePhone("hello@shop.kr"), null);
assert.equal(usablePhone("12345"), null);

// 업종 → 하위 형식(먼저 나온 말이 그 가게)
assert.equal(localBusinessType({ businessName: "헤어온 미용실", headline: "카페 같은 분위기", offerTitle: "" }), "HairSalon");
assert.equal(localBusinessType({ businessName: "맑은피부과의원", headline: "", offerTitle: "" }), "MedicalClinic");
assert.equal(localBusinessType({ businessName: "바른세무", headline: "세무 상담", offerTitle: "" }), "LocalBusiness", "모르면 LocalBusiness");

// script 안에서 끊기지 않게
assert.ok(!jsonLdText({ name: "</script><script>alert(1)</script>" }).includes("</script>"));
assert.equal(localBusinessType({ businessName: "행복동물병원", headline: "", offerTitle: "" }), "LocalBusiness", "동물병원은 사람 병원(MedicalClinic)이 아니다");
console.log("landing-layout-seo-s3 ok");
