import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { BUSINESS_TEMPLATE_PROFILES, businessTemplateManifest, createBusinessTemplate } from "../lib/landing/brainwave/business-content";

// CSS 모듈은 클래스 이름만 필요하다 — 이름을 그대로 돌려준다
const require = createRequire(import.meta.url);
require.extensions[".css"] = (module) => { module.exports = { default: new Proxy({}, { get: (_, key) => String(key) }) }; };
const { BrainwaveBusinessMobile } = require("../components/brainwave-business-mobile") as typeof import("../components/brainwave-business-mobile");

const content = { businessName: "카페피드", offer: "월 12회 게시물 촬영·편집·업로드", description: "사진부터 리포트까지 맡기는 카페 SNS 관리.", customer: "동네 카페 사장님", price: "390,000원", cta: "문의하기", image: "/qa-light-photo.png" };
const render = (data: ReturnType<typeof createBusinessTemplate>, onPick?: () => void) => renderToStaticMarkup(createElement(BrainwaveBusinessMobile, {
  pageId: data.page, overrides: data, hidden: new Set(data.hidden), sectionOrder: businessTemplateManifest[data.page].sections.map(section => section.id).reverse(), onPick, desktop: true,
}));
const count = (html: string, needle: string) => html.split(needle).length - 1;

// 예전 페이지(큰 제목 = 상호): 상호는 큰 제목으로 한 번만
const legacy = render(createBusinessTemplate(content, "0-290"));
assert.equal(count(legacy, ">카페피드<"), 1);
assert.match(legacy, /<h1[^>]*>카페피드<\/h1>/);
// 같은 사진은 공개 화면에서 한 번만, 편집 화면에서는 자리마다
assert.equal(count(legacy, 'src="/qa-light-photo.png"'), 1);
assert.ok(count(render(createBusinessTemplate(content, "0-290"), () => {}), 'src="/qa-light-photo.png"') > 1);

// 한 줄 소개가 있으면 상호가 그 위 작은 글씨, 소개가 큰 제목
const titled = render(createBusinessTemplate({ ...content, headline: "동네 카페 인스타, 매달 대신 채워 드려요" }, "0-290"));
assert.match(titled, /<h1[^>]*>동네 카페 인스타, 매달 대신 채워 드려요<\/h1>/);
assert.ok(titled.indexOf(">카페피드<") > -1 && titled.indexOf(">카페피드<") < titled.indexOf("<h1"), "brand sits above the headline");
for (const pageId of Object.keys(BUSINESS_TEMPLATE_PROFILES)) {
  const html = render(createBusinessTemplate({ ...content, headline: "한 줄 소개" }, pageId));
  assert.equal(count(html, "<h1"), 1, `${pageId}: one headline`);
  assert.ok(html.includes(">카페피드<"), `${pageId}: business name still visible`);
}
console.log(JSON.stringify({ passed: 7 }));
