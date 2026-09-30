import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LANDING_THEMES, themeForSector, themeStyle } from "../lib/landing/themes";
import { landingPageDataSchema } from "../lib/landing/page-data";
import { landingDraftFromPlan } from "../lib/landing/from-plan";
import { COACH_KEY, COACH_VERSION, type CoachState } from "../lib/plan-builder/coach";

// 분위기 다섯 + 기본. 고르면 디자인이 읽는 색 변수(--t-*)와 문의 양식 색이 같이 내려간다
assert.deepEqual(LANDING_THEMES.map(theme => theme.id), ["warm", "modern", "fresh", "luxe", "vivid"]);
assert.equal(themeStyle(undefined), undefined, "base keeps each design's own colors");
assert.equal(themeStyle("unknown"), undefined);
const warm = themeStyle("warm") as Record<string, string>;
for (const key of ["--t-ink", "--t-accent", "--t-strong", "--t-highlight", "--t-soft", "--t-paper", "--landing-accent"]) assert.match(warm[key], /^#[0-9a-f]{6}$/, key);

// 다섯 디자인 모두 분위기 색을 받고, 없으면 원래 색으로 돌아간다
for (const design of ["consult", "shop", "local", "clinic", "gallery"]) {
  const css = readFileSync(new URL(`../components/brainwave-business-${design}.module.css`, import.meta.url), "utf8");
  const page = css.slice(css.indexOf(".page {"), css.indexOf("}", css.indexOf(".page {")));
  for (const token of ["--t-ink", "--t-accent", "--t-paper"]) assert.ok(page.includes(`var(${token}, `) || page.includes(`var(${token},`), `${design}: ${token} with a fallback`);
}

// 저장: 알려진 분위기만(모르는 값은 막는다), 없어도 된다(예전 페이지)
assert.equal(landingPageDataSchema.parse({ root: {}, content: [], theme: "luxe" }).theme, "luxe");
assert.equal(landingPageDataSchema.parse({ root: {}, content: [] }).theme, undefined);
assert.throws(() => landingPageDataSchema.parse({ root: {}, content: [], theme: "neon" }));

// 업종에 맞는 처음 분위기 — 겹치는 말은 더 구체적인 쪽(필라테스 '스튜디오'는 산뜻한, 헤어 '스튜디오'는 생기)
const cases: Array<[string, string | undefined]> = [
  ["브런치 카페", "warm"], ["반찬가게", "warm"], ["치과", "fresh"], ["필라테스 스튜디오", "fresh"], ["입주 청소", "fresh"],
  ["웨딩홀", "luxe"], ["감성 펜션", "luxe"], ["세무 회계", "luxe"], ["헤어 스튜디오", "vivid"], ["애견 미용", "vivid"],
  ["인테리어", "modern"], ["프로필 사진", "modern"], ["가게 장부 앱", "modern"], ["무역업", undefined],
];
for (const [text, theme] of cases) assert.equal(themeForSector(text), theme, text);

const coach = (industry: string, name: string, offer: string): CoachState => ({
  version: COACH_VERSION, revision: 1, stage: "startup", depth: "quick", ready: true, messages: [], suggestions: [],
  business: { name, description: "", role: "", industry, region: "", stage: "사업 기획" },
  fields: [{ key: "offer", value: offer, basis: "user", quote: offer, messageId: "a" }],
});
const draftFor = (industry: string, name: string, offer: string) => landingDraftFromPlan({ planTitle: name, business: {}, answers: { [COACH_KEY]: { state: coach(industry, name, offer) } } });
assert.equal(draftFor("카페 · 음식점", "새벽커피", "핸드드립").pageData?.theme, "warm");
assert.equal(draftFor("기업 서비스", "밝은하루치과", "스케일링").pageData?.theme, "fresh");
assert.equal(draftFor("무역", "온결무역", "원자재 수입").pageData?.theme, undefined, "unknown business keeps the design's colors");

console.log("landing-themes: 5 themes, every design reads them, saved safely, sector defaults");
