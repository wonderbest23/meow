import assert from "node:assert/strict";
import { applyHomepageCopy, homepageFillPrompt, normalizeHomepageCopy } from "../lib/landing/ai-fill";
import { landingDraftFromPlan } from "../lib/landing/from-plan";
import { landingDraftSchema } from "../lib/landing/domain";
import { createBusinessTemplate } from "../lib/landing/brainwave/business-content";
import { COACH_KEY, COACH_VERSION, coachDocumentRevision, type CoachState } from "../lib/plan-builder/coach";
import { photoSetFor } from "../lib/landing/photo-library";
import { needsAutoAiFill } from "../lib/landing/ai-fill-auto";

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
for (const rule of ["facts", "menu", "알리는 곳 이름을 연락처로 쓰지 않습니다", "메뉴판처럼 짧게", "계획서에 없는 메뉴를 지어내지 않습니다", "해요체", "계획서에 있는 것만", "후기", "문의 주시면 안내해 드려요", "JSON", "가격 단위", "위약금", "환불 규정은 홈페이지 약관", "가격 기준(1회·월 등)"]) assert.ok(prompt.system.includes(rule), rule);
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
// 문의 양식 글은 지난번 AI 버튼 글이면 새 버튼 글을 따라가고, 사장님이 쓴 글이면 그대로
assert.equal(applyHomepageCopy(filled, { ...copy!, cta: "정기권 문의하기" }).ctaLabel, "정기권 문의하기");
assert.equal(applyHomepageCopy({ ...filled, ctaLabel: "체험 신청" }, { ...copy!, cta: "정기권 문의하기" }).ctaLabel, "체험 신청");
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

// 동네 가게 템플릿: 좋은 점·숫자·메뉴·이용 순서·마무리, 오시는 길·영업시간은 사업자 정보에서
const localCopy = normalizeHomepageCopy({
  ...raw,
  facts: [{ value: "4명", label: "한 수업 정원" }, { value: "50분", label: "수업 시간" }, { value: "많음", label: "숫자 없는 값은 버린다" }, { value: "주 2회", label: "정기권 횟수" }],
  menu: { title: "수업·가격", intro: "정기권으로 다녀요.", items: [{ name: "4인 기구 필라테스(50분)", price: "220,000원" }, { name: "", price: "문의" }, { name: "체험 수업", price: "문의" }, { name: "개인 레슨", price: "문의" }, { name: "넘치는 메뉴", price: "" }] },
})!;
assert.deepEqual(localCopy.facts.map(fact => fact.value), ["4명", "50분", "주 2회"], "facts need a number");
assert.deepEqual(localCopy.menu.items.map(item => item.name), ["4인 기구 필라테스(50분)", "체험 수업", "개인 레슨"], "unnamed item dropped, three at most");
assert.deepEqual(copy!.facts, [], "older answers without facts still work");
const localDraft = structuredClone(created);
localDraft.pageData!.brainwave = createBusinessTemplate(localDraft.pageData!.businessContent!, "0-2226");
localDraft.businessAddress = "서울 마포구 월드컵로 12, 2층";
localDraft.openHours = "";
const localFilled = applyHomepageCopy(localDraft, localCopy, { industry: "필라테스" });
landingDraftSchema.parse(localFilled);
const lbw = localFilled.pageData!.brainwave!;
assert.equal(lbw.texts["0:2285"], "국 1종 + 반찬 4종");
assert.equal(lbw.texts["0:2349"], "4명");
assert.equal(lbw.texts["0:2345"], "수업·가격");
assert.equal(lbw.texts["0:2325"], "220,000원");
assert.equal(lbw.texts["0:2313"], "① 신청 — 채팅으로 신청해요\n② 받기 — 문 앞에서 받아요");
assert.equal(lbw.texts["0:2237"], copy!.closing);
assert.equal(lbw.texts["I0:2233;0:4557"], "구독 문의하기");
assert.equal(lbw.texts["0:2282"], "서울 마포구 월드컵로 12, 2층", "address from business info");
assert.equal(lbw.texts["0:2268"], "영업시간은 문의 주시면 안내해 드려요", "unknown hours stay as the pending note");
for (const id of ["0:2347", "0:2322", "0:2309", "0:2349", "0:2324", "0:2325", "0:2235"]) assert.ok(!lbw.hidden.includes(id), `${id} opened`);
// 사진 자리 — 첫 화면·메뉴 카드·이용 순서 사진(이 계획서의 대표 상품 '반찬'으로 음식 사진)
assert.equal(lbw.images["0:2362/0/0"], food.hero);
assert.equal(lbw.images["0:2329/0/0"], food.cards[0]);
assert.equal(lbw.images["0:2317/0/0"], food.band);
assert.equal(lbw.images["0:2321/0/0"], food.closing);
// 숫자·메뉴가 없으면 그 띠는 닫힌 채
const plainLocal = applyHomepageCopy(localDraft, copy!).pageData!.brainwave!;
assert.ok(plainLocal.hidden.includes("0:2347") && plainLocal.hidden.includes("0:2322"));
// 사장님이 고친 주소는 사업자 정보로 덮지 않는다
const ownerAddress = structuredClone(localFilled);
ownerAddress.pageData!.brainwave!.texts["0:2282"] = "망원역 2번 출구 앞 건물 2층";
assert.equal(applyHomepageCopy(ownerAddress, localCopy).pageData!.brainwave!.texts["0:2282"], "망원역 2번 출구 앞 건물 2층");

// 병원 템플릿: 진료 과목·병원 소개·진료 순서(제목·설명으로 나눔)·자주 묻는 질문, 진료 시간은 사업자 정보에서
const clinicCopy = normalizeHomepageCopy({
  ...raw,
  cards: [{ title: "충치·신경치료", body: "필요한 치료만 안내해요." }, { title: "스케일링", body: "잇몸 건강 관리" }, { title: "임플란트 상담", body: "과정을 설명드려요." }],
  process: { title: "진료 순서", steps: ["① 접수 — 전화로 예약해 주세요", "② 검진 — 구강 촬영 뒤 설명드려요", "치료"] },
  faq: [{ question: "예약 없이 가도 되나요?", answer: "예약 환자를 먼저 모셔요." }, { question: "", answer: "질문 없는 답은 버린다" }],
})!;
assert.equal(clinicCopy.faq.length, 1);
const clinicDraft = structuredClone(created);
clinicDraft.pageData!.brainwave = createBusinessTemplate(clinicDraft.pageData!.businessContent!, "0-2385");
clinicDraft.openHours = "평일 09:30–18:30";
const cbw = applyHomepageCopy(clinicDraft, clinicCopy, { industry: "치과" }).pageData!.brainwave!;
assert.equal(cbw.texts["0:2521"], "충치·신경치료");
assert.equal(cbw.texts["0:2512"], copy!.cardsTitle);
assert.equal(cbw.texts["0:2474"], "접수");
assert.equal(cbw.texts["0:2473"], "전화로 예약해 주세요");
assert.equal(cbw.texts["0:2477"], "1");
assert.equal(cbw.texts["0:2486"], "치료", "a step without a dash is the title");
assert.equal(cbw.texts["0:2422"], "예약 없이 가도 되나요?");
assert.equal(cbw.texts["0:2454/0"], "자주 묻는 질문");
assert.equal(cbw.texts["0:2418"], "평일 09:30–18:30", "hours from business info");
assert.equal(cbw.texts["0:2390"], copy!.closing);
for (const id of ["0:2508", "0:2470", "0:2420", "0:2389"]) assert.ok(!cbw.hidden.includes(id), `${id} opened`);
assert.ok(cbw.hidden.includes("0:2455"), "doctors stay hidden — the AI never writes them");
assert.equal(cbw.images["0:2459/0"], "", "no photo in the doctor slot");
// 사진은 업종·상호·대표 상품 글로 고른다(이 테스트 계획서의 대표 상품은 '반찬' → 음식 사진)
assert.equal(cbw.images["0:2550/0/0"], food.hero);
assert.equal(cbw.images["0:2491/0/0"], food.closing, "steps photo");
for (const rule of ["의료진 이름·경력·자격은 쓰지 않습니다", "효과·치료 결과"]) assert.ok(homepageFillPrompt(plan).system.includes(rule), rule);

// 갤러리형: 이런 일을 해요(여섯까지)·작업 과정·패키지(두 개)·마무리, 운영 시간·주소는 사업자 정보에서
const galleryDraft = structuredClone(created);
galleryDraft.pageData!.brainwave = createBusinessTemplate(galleryDraft.pageData!.businessContent!, "0-421");
galleryDraft.businessAddress = "경기 성남시 분당구 정자일로 95";
const gbw = applyHomepageCopy(galleryDraft, { ...localCopy, process: clinicCopy.process }, { industry: "인테리어" }).pageData!.brainwave!;
assert.equal(gbw.texts["0:565"], "국 1종 + 반찬 4종");
assert.equal(gbw.texts["0:583"], "가격 59,000원", "fourth card fills the fourth service");
assert.equal(gbw.texts["0:754"], "접수");
assert.equal(gbw.texts["0:753"], "전화로 예약해 주세요");
assert.equal(gbw.texts["0:531"], "4인 기구 필라테스(50분)");
assert.equal(gbw.texts["0:534/1"], "220,000원");
assert.equal(gbw.texts["0:553"], "체험 수업", "two packages at most");
assert.equal(gbw.texts["0:436"], copy!.closing);
assert.equal(gbw.texts["0:895"], "경기 성남시 분당구 정자일로 95");
for (const id of ["0:743", "0:461", "0:457", "0:583"]) assert.ok(!gbw.hidden.includes(id), `${id} opened`);
assert.ok(gbw.hidden.includes("0:611"), "reviews stay hidden — the AI never writes them");
assert.equal(gbw.images["0:875/0"], food.cards[0]);
assert.equal(gbw.images["0:958/0/0"], food.band, "studio photo");

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
// 지난번 AI 글만 든 채 숨겨진 섹션도 연다(운영: 첫 채우기 때 열지 못한 예전 홈페이지를 다시 채울 때)
const refill = structuredClone(applyHomepageCopy(legacy, copy!));
refill.pageData!.brainwave!.hidden.push("0:1329");
assert.ok(!applyHomepageCopy(refill, copy!).pageData!.brainwave!.hidden.includes("0:1329"));
// 사진 없이 만든 페이지는 사진 자리가 숨김으로 저장돼 있다 — 사진을 넣으면서 그 자리를 연다
const noPhoto = structuredClone(created);
const noPhotoBw = noPhoto.pageData!.brainwave!;
for (const id of Object.keys(noPhotoBw.images)) { noPhotoBw.images[id] = ""; noPhotoBw.hidden.push(id); }
const photoFilled = applyHomepageCopy(noPhoto, copy!, { industry: "유통 · 온라인 판매" }).pageData!.brainwave!;
assert.equal(photoFilled.images["0:1325/0/0"], food.hero);
assert.ok(!photoFilled.hidden.includes("0:1325/0/0") && !photoFilled.hidden.includes("0:1332/0/0"), "filled photo slots are shown");
// 사장님이 글을 넣고 숨긴 섹션은 그대로 숨김
const ownerHidden = structuredClone(legacy);
ownerHidden.pageData!.brainwave!.texts["0:1333"] = "사장님 카드";
assert.ok(applyHomepageCopy(ownerHidden, copy!).pageData!.brainwave!.hidden.includes("0:1329"));

// 처음 열 때 자동 채우기: 만든 뒤 채우지도 고치지도 않은 홈페이지만(첫 로딩 중 새로고침해도 놓치지 않게)
const site = (draft: typeof created, updatedAt = "2026-09-30T04:00:00.000Z", versions: unknown[] = []) => ({ createdAt: "2026-09-30T04:00:00.000Z", updatedAt, versions, draft });
assert.equal(needsAutoAiFill(site(created)), true, "created but never filled or saved");
assert.equal(needsAutoAiFill(site(filled)), false, "already filled");
assert.equal(needsAutoAiFill(site(created, "2026-09-30T04:05:00.000Z")), false, "owner saved it since");
assert.equal(needsAutoAiFill(site(created, undefined, [{}])), false, "already published");
assert.equal(needsAutoAiFill(site({ ...created, pageData: { ...created.pageData!, brainwave: undefined } })), false, "old block pages are not filled");

console.log("landing-ai-fill: prompt, normalize, shop and consult fill, owner edits kept, identity kept");
