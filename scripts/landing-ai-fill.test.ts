import assert from "node:assert/strict";
import { applyHomepageCopy, homepageFillPrompt, normalizeHomepageCopy } from "../lib/landing/ai-fill";
import { landingDraftFromPlan } from "../lib/landing/from-plan";
import { landingDraftSchema } from "../lib/landing/domain";
import { createBusinessTemplate } from "../lib/landing/brainwave/business-content";
import { COACH_KEY, COACH_VERSION, coachDocumentRevision, type CoachState } from "../lib/plan-builder/coach";
import { photoSetFor } from "../lib/landing/photo-library";

// 계획서 — 반찬 정기배송(운영에서 쓰는 테스트 계획서와 같은 모양)
const coach: CoachState = {
  version: COACH_VERSION, revision: 3, stage: "startup", depth: "quick", ready: true, messages: [], suggestions: [],
  business: { name: "문앞반찬", description: "", role: "", industry: "유통 · 온라인 판매", region: "", stage: "사업 기획" },
  fields: [
    { key: "offer", value: "주 2회 국·반찬 4종을 집 앞까지 정기배송", basis: "user", quote: "주 2회 국·반찬 4종을 집 앞까지 정기배송", messageId: "a" },
    { key: "customer", value: "근처 아파트에 사는 맞벌이 30~40대 부부", basis: "user", quote: "근처 아파트에 사는 맞벌이 30~40대 부부", messageId: "a" },
    { key: "price", value: "59,000원", basis: "user", quote: "59,000원", messageId: "a" },
    { key: "sales", value: "비공개 매출 80만원", basis: "user", quote: "비공개 매출 80만원", messageId: "a" },
  ],
};
const plan = {
  title: "문앞반찬",
  answers: { [COACH_KEY]: { state: coach } } as Record<string, Record<string, unknown>>,
  sections: {
    "market/products": { markdown: "## 첫 상품은 국 1종 + 반찬 4종 주 2회 구독\n건너뛰기: 결제 마감일 전까지 채팅으로 신청하면 그 주는 배송하지 않습니다." },
    "financials/expenses": { markdown: "월 고정비 3,200,000원 비밀 재무 내용" },
  },
};

// 프롬프트: 계획서 사실은 싣고, 재무 장·실적은 싣지 않는다. 규칙(지어내지 않기·해요체)이 들어 있다
const prompt = homepageFillPrompt(plan);
for (const fact of ["문앞반찬", "주 2회 국·반찬 4종", "맞벌이", "59,000원", "건너뛰기"]) assert.ok(prompt.user.includes(fact), fact);
assert.ok(!prompt.user.includes("비밀 재무"), "financial chapters stay out of homepage copy");
assert.ok(!prompt.user.includes("비공개 매출"), "sales figures stay out");
for (const rule of ["해요체", "계획서에 있는 것만", "후기", "문의 주시면 안내해 드려요", "JSON", "가격 단위", "위약금", "환불 규정은 홈페이지 약관"]) assert.ok(prompt.system.includes(rule), rule);
const proposal = structuredClone(plan);
(proposal.answers[COACH_KEY].state as CoachState).fields.find(f => f.key === "price")!.basis = "proposal";
assert.ok(homepageFillPrompt(proposal).user.includes("AI 제안 가격 — 확정 전"));

// 모델 답 다듬기: 넘친 글은 자르고, 빈 카드는 버리고, 카드가 3장 미만이면 못 쓴다
const raw = {
  tagline: "퇴근하면 문 앞에 국과 반찬이 와 있는 저녁",
  cardsTitle: "이렇게 보내 드려요", cardsIntro: "한 번 신청하면 일주일에 두 번 문 앞에 도착해요.",
  cards: [
    { title: "국 1종 + 반찬 4종", body: "주반찬 1종, 나물 2종, 조림·볶음 1종을 고르게 담아요." },
    { title: "주 2회, 문 앞까지", body: "정해진 시간대에 단지별로 묶어 배송해요." },
    { title: "", body: "제목 없는 카드" },
    { title: "건너뛰기 자유", body: "결제 마감 전까지 알려 주시면 그 주는 쉬어요." },
    { title: "가격 59,000원", body: "구독 단위는 문의 주시면 안내해 드려요.".repeat(8) },
  ],
  process: { title: "이용 순서", steps: ["① 신청 — 채팅으로 신청해요", "② 받기 — 문 앞에서 받아요", ""] },
  closing: "오늘 저녁 걱정, 문앞반찬에 맡겨 보세요", closingSub: "궁금한 점은 편하게 물어보세요.", cta: "구독 문의하기",
};
const copy = normalizeHomepageCopy(raw);
assert.ok(copy);
assert.equal(copy!.cards.length, 4, "untitled card dropped");
assert.ok(copy!.cards[3].body.length <= 110 && copy!.cards[3].body.endsWith("…"));
assert.equal(copy!.process.steps.length, 2);
assert.equal(normalizeHomepageCopy({ ...raw, cards: raw.cards.slice(0, 2) }), null, "fewer than three cards is not usable");
assert.equal(normalizeHomepageCopy("not json"), null);

// 온라인 상점 템플릿에 채우기
const created = landingDraftFromPlan({ planTitle: plan.title, business: {}, answers: plan.answers });
assert.equal(created.pageData?.brainwave?.page, "0-1102");
const filled = applyHomepageCopy(created, copy!, { industry: "유통 · 온라인 판매", now: "2026-09-30T00:00:00Z" });
landingDraftSchema.parse(filled);
const bw = filled.pageData!.brainwave!;
assert.equal(bw.texts["0:1328"], copy!.tagline, "tagline under the name when the plan had none");
assert.equal(bw.texts["0:1333"], "국 1종 + 반찬 4종");
assert.equal(bw.texts["0:1343"], "건너뛰기 자유", "the untitled card was dropped, so later cards move up");
assert.equal(bw.texts["0:1348"], "가격 59,000원");
assert.equal(bw.texts["0:1353"], "", "unused card slots are emptied");
assert.equal(bw.texts["0:1142"], "① 신청 — 채팅으로 신청해요\n② 받기 — 문 앞에서 받아요");
assert.ok(!bw.hidden.includes("0:1137"), "the steps band opens");
assert.equal(bw.texts["0:1111"], copy!.closing);
assert.equal(bw.texts["I0:1110;0:4626"], "구독 문의하기");
assert.equal(filled.ctaLabel, "구독 문의하기");
// 업종 사진 한 벌(대표 상품 글의 '반찬'으로 음식 사진)
const food = photoSetFor("반찬")!;
assert.equal(bw.images["0:1325/0/0"], food.hero);
assert.equal(bw.images["0:1332/0/0"], food.cards[0]);
assert.equal(bw.images["0:1146/0/0"], food.band);
assert.equal(bw.images["0:1108/0/0"], food.closing);

// 사장님이 고친 글·사진은 다시 채워도 그대로, 지난번 AI 글은 새 글로 바뀐다
const edited = structuredClone(filled);
edited.pageData!.brainwave!.texts["0:1333"] = "사장님이 직접 쓴 카드";
edited.pageData!.brainwave!.images["0:1325/0/0"] = "https://example.com/my-shop.jpg";
const again = applyHomepageCopy(edited, { ...copy!, cards: copy!.cards.map((card, index) => ({ ...card, title: `새 카드 ${index + 1}` })) }, { industry: "유통 · 온라인 판매" });
assert.equal(again.pageData!.brainwave!.texts["0:1333"], "사장님이 직접 쓴 카드");
assert.equal(again.pageData!.brainwave!.texts["0:1338"], "새 카드 2", "previous AI text is replaced");
assert.equal(again.pageData!.brainwave!.images["0:1325/0/0"], "https://example.com/my-shop.jpg");
// 사장님이 숨긴 섹션은 그대로 숨김
const hiddenByOwner = structuredClone(filled);
hiddenByOwner.pageData!.brainwave!.hidden.push("0:1104");
assert.ok(applyHomepageCopy(hiddenByOwner, copy!).pageData!.brainwave!.hidden.includes("0:1104"));

// 상담 서비스 템플릿: 서비스 카드(제목)와 문의 칸을 채우고 섹션을 연다
const consult = structuredClone(created);
const content = consult.pageData!.businessContent!;
consult.pageData!.brainwave = createBusinessTemplate(content, "0-290");
const consultFilled = applyHomepageCopy(consult, copy!).pageData!.brainwave!;
assert.equal(consultFilled.texts["0:397"], copy!.cardsTitle);
assert.equal(consultFilled.texts["0:373"], "국 1종 + 반찬 4종");
assert.equal(consultFilled.texts["0:309"], copy!.closing);
assert.ok(!consultFilled.hidden.includes("0:366"), "services section opens");

// 확정한 한 줄 소개가 있으면 AI 문구로 덮지 않는다
const designed = structuredClone(coach);
designed.design = {
  identity: { headline: "사장님이 고른 한 줄", pitch: "소개", names: [{ name: "문앞반찬", why: "짧다" }] },
  approach: "known-business", status: "proposal", sourceRevision: coachDocumentRevision(designed),
  startingPlan: { scope: "주 2회", connectionToVision: "연결", whyThis: "이유", notIncluded: [] },
  alternatives: [{ name: "대안", scope: "범위", tradeoff: "장단점" }],
  assumptions: [{ statement: "가정", howToCheck: "확인" }],
  nextAction: { action: "행동", doneWhen: "완료", usableText: "문구" },
};
const withIdentity = landingDraftFromPlan({ planTitle: plan.title, business: {}, answers: { [COACH_KEY]: { state: designed } } });
assert.equal(applyHomepageCopy(withIdentity, copy!).pageData!.brainwave!.texts["0:1328"], "사장님이 고른 한 줄");

// 예전에 만든 홈페이지: 카드 섹션이 비어 숨겨져 있고, 마무리 칸에는 예전 자동 문구('○○ 문의')가 남아 있다
const legacy = structuredClone(created);
const legacyBw = legacy.pageData!.brainwave!;
for (const id of ["0:1333", "0:1334", "0:1338", "0:1339", "0:1343", "0:1344"]) legacyBw.texts[id] = "";
legacyBw.hidden.push("0:1329");
legacyBw.texts["0:1111"] = "문앞반찬 문의";
const legacyFilled = applyHomepageCopy(legacy, copy!).pageData!.brainwave!;
assert.ok(!legacyFilled.hidden.includes("0:1329"), "an empty section hidden by the old layout opens");
assert.equal(legacyFilled.texts["0:1111"], copy!.closing, "old automatic closing text is replaced");
// 사장님이 글을 넣고 숨긴 섹션은 그대로 숨김
const ownerHidden = structuredClone(legacy);
ownerHidden.pageData!.brainwave!.texts["0:1333"] = "사장님 카드";
assert.ok(applyHomepageCopy(ownerHidden, copy!).pageData!.brainwave!.hidden.includes("0:1329"));

console.log("landing-ai-fill: prompt, normalize, shop and consult fill, owner edits kept, identity kept");
