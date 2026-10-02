import assert from "node:assert/strict";
import { marketingKitPrompt, normalizeMarketingKit } from "../lib/marketing/kit";

/* 홍보 키트: 형식이 맞을 때만 쓰고, 지어낸 후기·보장 표현은 버리며, AI 제안을 사실처럼 넘기지 않는다 */
const week = (n: number) => ({ week: n, theme: `${n}주차 주제`, posts: [{ day: "월", format: "사진", idea: "오늘 구운 빵 진열대", caption: "오늘 아침에 구운 빵이에요." }, { day: "목", format: "짧은 영상", idea: "반죽하는 손", caption: "새벽 반죽 과정을 보여드려요." }] });
const kit = {
  placeIntro: "출근길 직장인을 위한 동네 빵집입니다. 아침 7시부터 갓 구운 식빵과 샌드위치를 준비해요. [주소]",
  openingMessage: "[상호]가 문을 열었어요. 출근길에 들러 주세요.",
  flyer: { headline: "출근길에 갓 구운 빵", body: "아침 7시부터 문을 열어요.\n식빵·샌드위치 [가격]", cta: "지도에서 [상호]를 찾아 주세요" },
  posts: [1, 2, 3].map(n => ({ channel: n === 1 ? "인스타그램" : n === 2 ? "블로그" : "동네 커뮤니티", body: `첫 게시물 ${n}`, hashtags: ["동네빵집", "#출근길", "식 빵"] })),
  reviewRequest: "다녀가셨다면 지도에 짧은 후기를 남겨 주세요. 큰 힘이 돼요.",
  calendar: [3, 1, 4, 2].map(week),
};
const normalized = normalizeMarketingKit(kit);
assert.ok(normalized, "a well-formed kit is accepted");
assert.deepEqual(normalized!.posts[0].hashtags, ["#동네빵집", "#출근길", "#식빵"], "hashtags get # and lose spaces");
assert.deepEqual(normalized!.calendar.map(item => item.week), [1, 2, 3, 4], "weeks are ordered");
assert.equal(normalizeMarketingKit({ ...kit, placeIntro: "동네 최고의 빵집, 별점 4.9!" }), null, "fabricated ratings and superlatives are rejected");
assert.equal(normalizeMarketingKit({ ...kit, flyer: { ...kit.flyer, body: "효과 보장 다이어트 빵" } }), null, "guaranteed effects are rejected");
assert.equal(normalizeMarketingKit({ ...kit, posts: kit.posts.slice(0, 2) }), null, "exactly three posts");
assert.equal(normalizeMarketingKit({ ...kit, calendar: kit.calendar.slice(0, 3) }), null, "four weeks");

const plan = {
  title: "새벽빵 구상",
  answers: { __business_coach: { state: {
    version: "1", revision: 1, stage: "startup", depth: "quick", ready: true, suggestions: [], messages: [],
    business: { name: "새벽빵", description: "", role: "", industry: "제과점", region: "서울 마포구", stage: "사업 기획", nameConfirmed: true },
    fields: [
      { key: "offer", value: "식빵·샌드위치", basis: "user", messageId: "m1", quote: "" },
      { key: "price", value: "6,500원", basis: "proposal", messageId: "m2", quote: "" },
      { key: "customer", value: "출근길 직장인", basis: "user", messageId: "m3", quote: "" },
    ],
  } } },
};
const prompt = JSON.parse(marketingKitPrompt(plan as never).user) as { business: Record<string, string | boolean> };
assert.equal(prompt.business.name, "새벽빵");
assert.equal(prompt.business.offer, "식빵·샌드위치");
assert.equal(prompt.business.price, "", "an AI-proposed price is not passed as a fact");
assert.equal(prompt.business.region, "서울 마포구");
console.log("marketing-kit: format, banned claims, hashtags, facts-only prompt passed");
