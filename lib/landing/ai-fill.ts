import { z } from "zod";
import type { LandingDraft } from "./domain";
import { landingPageDataSchema, type LandingPageData } from "./page-data";
import { BUSINESS_TEMPLATE_PROFILES, businessTemplateDefaults, businessTemplateManifest, createBusinessTemplate, visitInfoTexts } from "./brainwave/business-content";
import { applyPhotoSet, photoSetFor } from "./photo-library";
import { currentBusinessDesign, readCoach } from "../plan-builder/coach";
import { formatPriceText } from "./from-plan";
import { applyContactMethod, ctaButtons, DEFAULT_CONTACT, draftPhone } from "./contact-method";
import type { BrainwaveData } from "./page-data";

/*
 * 계획서로 홈페이지 채우기(AI).
 *
 * 홈페이지 템플릿에는 카드 여섯 장, 한 주 흐름 띠, 마무리 문구 같은 칸이 있는데
 * 계획서 필드(대표 상품·고객·가격)만으로는 세 줄밖에 못 채웠다. 계획서 본문에는
 * 손님에게 할 말(구성, 약속, 이용 과정, 건너뛰기·보상 기준)이 이미 다 있다 —
 * AI 가 그걸 손님 말투로 옮겨 칸을 채운다. 없는 사실은 만들지 않는다.
 */

const clip = (value: unknown, max: number) => {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
};

export const homepageCopySchema = z.object({
  tagline: z.string().max(48),
  cardsTitle: z.string().max(28),
  cardsIntro: z.string().max(90),
  cards: z.array(z.object({ title: z.string().min(1).max(26), body: z.string().max(110) })).min(3).max(6),
  process: z.object({ title: z.string().max(28), steps: z.array(z.string().min(1).max(80)).max(5) }),
  closing: z.string().min(1).max(40),
  closingSub: z.string().max(90),
  cta: z.string().max(14),
  /* 동네 가게 디자인 — 계획서에 있는 숫자(정원·시간·횟수)와 메뉴·가격. 없으면 비워 두고 그 칸을 열지 않는다 */
  facts: z.array(z.object({ value: z.string().min(1).max(12), label: z.string().min(1).max(40) })).max(3).default([]),
  menu: z.object({ title: z.string().max(28), intro: z.string().max(90), items: z.array(z.object({ name: z.string().min(1).max(40), price: z.string().max(24) })).max(3) }).default({ title: "", intro: "", items: [] }),
  /* 자주 묻는 질문 — 계획서에 답이 있는 것만(예약 방법·주차·준비물). 병원 디자인이 쓴다 */
  faq: z.array(z.object({ question: z.string().min(1).max(40), answer: z.string().min(1).max(160) })).max(4).default([]),
});
export type HomepageCopy = z.infer<typeof homepageCopySchema>;

/*
 * 영업시간·여는 시각·주소를 문의로 물어보라는 문장은 뺀다(재검증 2026-10-22 2차: 이용 순서 첫 단계가 '여는 날 확인 — 홈페이지의
 * 문의 버튼으로 여는 요일과 시각을 물어봐 주세요'였다). 이 셋은 '오시는 길·영업시간' 칸이 사업자 정보로 따로 안내한다.
 */
const ASKS_VISIT_INFO = /(영업\s*시간|운영\s*시간|여는\s*(?:요일|날|시각|시간)|문\s*여는|오픈\s*시간|주소|위치|오시는\s*길)[^.!?\n]*(문의|물어|여쭤|연락\s*주)/;
export function dropVisitInfoAsks(text: string): string {
  if (!ASKS_VISIT_INFO.test(text)) return text;
  return (text.match(/[^.!?\n]+(?:[.!?]+|$)/g) ?? [text]).map((sentence) => sentence.trim()).filter((sentence) => sentence && !ASKS_VISIT_INFO.test(sentence)).join(" ").trim();
}

/** 카드·이용 순서·자주 묻는 질문·마무리에서 그런 문장을 뺀다 — 그 말뿐인 단계·답·카드는 통째로 뺀다 */
export function withoutVisitInfoAsks(copy: HomepageCopy): HomepageCopy {
  const cards = copy.cards.flatMap((card) => {
    const body = dropVisitInfoAsks(card.body);
    if (ASKS_VISIT_INFO.test(card.title) || (card.body && !body)) return [];
    return [{ ...card, body }];
  });
  return {
    ...copy,
    cardsIntro: dropVisitInfoAsks(copy.cardsIntro),
    cards: cards.length >= 3 ? cards : copy.cards.map((card) => ({ ...card, body: dropVisitInfoAsks(card.body) })),
    process: { ...copy.process, steps: copy.process.steps.filter((step) => !ASKS_VISIT_INFO.test(step)) },
    closingSub: dropVisitInfoAsks(copy.closingSub),
    menu: { ...copy.menu, intro: dropVisitInfoAsks(copy.menu.intro) },
    faq: copy.faq.map((item) => ({ ...item, answer: dropVisitInfoAsks(item.answer) })).filter((item) => item.answer),
  };
}

/** 모델 답을 칸 크기에 맞게 다듬는다 — 조금 넘친 글은 자르고, 빈 카드는 버린다. 못 쓰면 null */
export function normalizeHomepageCopy(raw: unknown): HomepageCopy | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const cards = (Array.isArray(value.cards) ? value.cards : [])
    .map((card) => (card && typeof card === "object" ? { title: clip((card as Record<string, unknown>).title, 26), body: clip((card as Record<string, unknown>).body, 110) } : null))
    .filter((card): card is { title: string; body: string } => Boolean(card?.title))
    .slice(0, 6);
  const process = (value.process && typeof value.process === "object" ? value.process : {}) as Record<string, unknown>;
  const steps = (Array.isArray(process.steps) ? process.steps : []).map((step) => clip(step, 80)).filter(Boolean).slice(0, 5);
  const record = (item: unknown) => (item && typeof item === "object" ? item as Record<string, unknown> : {});
  const facts = (Array.isArray(value.facts) ? value.facts : []).map(record)
    .map((fact) => ({ value: clip(fact.value, 12), label: clip(fact.label, 40) }))
    .filter((fact) => fact.value && fact.label && /\d/.test(fact.value)).slice(0, 3);
  const menu = record(value.menu);
  const items = (Array.isArray(menu.items) ? menu.items : []).map(record)
    .map((item) => ({ name: clip(item.name, 40), price: formatPriceText(clip(item.price, 24)) }))
    .filter((item) => item.name).slice(0, 3);
  const faq = (Array.isArray(value.faq) ? value.faq : []).map(record)
    .map((item) => ({ question: clip(item.question, 40), answer: clip(item.answer, 160) }))
    .filter((item) => item.question && item.answer).slice(0, 4);
  const parsed = homepageCopySchema.safeParse({
    tagline: clip(value.tagline, 48),
    cardsTitle: clip(value.cardsTitle, 28),
    cardsIntro: clip(value.cardsIntro, 90),
    cards,
    process: { title: clip(process.title, 28), steps },
    closing: clip(value.closing, 40),
    closingSub: clip(value.closingSub, 90),
    cta: clip(value.cta, 14),
    facts,
    menu: { title: clip(menu.title, 28), intro: clip(menu.intro, 90), items },
    faq,
  });
  return parsed.success ? withoutVisitInfoAsks(parsed.data) : null;
}

type PlanLike = { title: string; answers: Record<string, Record<string, unknown>>; sections?: Record<string, { markdown?: string }> };

/** 사장님이 직접 정한 가격(AI 제안 가격은 빼고) — 홈페이지 메뉴의 '문의' 자리를 채울 때만 쓴다 */
export function homepageKnownPrice(plan: Pick<PlanLike, "answers">): string {
  const price = readCoach(plan.answers)?.fields.find((item) => item.key === "price" && item.basis === "user")?.value?.trim() ?? "";
  return price ? formatPriceText(price) : "";
}

/*
 * 가격이 하나뿐일 때 — 상품이 둘(식빵·소금빵)이고 가격이 4,500원 하나면 AI 가 메뉴를 모두 '문의'로 비웠다(실제 AI 점검 2026-10-22).
 * 메뉴에 금액이 하나도 없으면 그 가격을 넣는다: 메뉴가 하나면 그대로, 여럿이면 'N원부터'. 금액이 있는 메뉴는 그대로.
 */
export function withKnownPrice(copy: HomepageCopy, price: string): HomepageCopy {
  const value = price.trim();
  if (!value || !/\d/.test(value) || !copy.menu.items.length) return copy;
  if (copy.menu.items.some((item) => /\d/.test(item.price))) return copy;
  const label = copy.menu.items.length === 1 || /(부터|~|이상|대$)/.test(value) ? value : `${value}부터`;
  return { ...copy, menu: { ...copy.menu, items: copy.menu.items.map((item) => ({ ...item, price: clip(label, 24) })) } };
}

/* 손님에게 할 말이 들어 있는 계획서 장 — 재무·위험 분석은 싣지 않는다 */
const CUSTOMER_SECTIONS = ["summary/executive", "market/products", "overview/problem", "strategy/price", "strategy/distribution", "strategy/promotion", "market/personas"];

export function homepageFillPrompt(plan: PlanLike): { system: string; user: string } {
  const coach = readCoach(plan.answers);
  const field = (key: string) => coach?.fields.find((item) => item.key === key);
  const design = coach ? currentBusinessDesign(coach) : undefined;
  const price = field("price");
  const facts = [
    `사업 이름: ${coach?.business.name || plan.title}`,
    coach?.business.industry ? `업종: ${coach.business.industry}` : "",
    coach?.business.region ? `지역: ${coach.business.region}` : "",
    design?.identity ? `확정한 한 줄 소개: ${design.identity.headline} / ${design.identity.pitch}` : "",
    field("offer") ? `대표 상품: ${field("offer")!.value}` : "",
    field("customer") ? `주요 고객: ${field("customer")!.value}` : "",
    field("problem") ? `고객이 겪는 문제: ${field("problem")!.value}` : "",
    price ? `가격: ${formatPriceText(price.value)}${price.basis === "proposal" ? " (AI 제안 가격 — 확정 전)" : ""}` : "가격: 정하지 않음",
    field("channel") ? `알리는 곳: ${field("channel")!.value}` : "",
    design?.startingPlan ? `시작 범위: ${design.startingPlan.scope}` : "",
    design?.startingPlan?.notIncluded.length ? `이번에 하지 않는 것: ${design.startingPlan.notIncluded.join(" / ")}` : "",
  ].filter(Boolean);
  let budget = 11_000;
  const excerpts: string[] = [];
  for (const key of CUSTOMER_SECTIONS) {
    const markdown = plan.sections?.[key]?.markdown?.trim();
    if (!markdown || budget <= 0) continue;
    const piece = markdown.slice(0, Math.min(2_600, budget));
    budget -= piece.length;
    excerpts.push(`### ${key}\n${piece}`);
  }
  const system = [
    "당신은 동네 가게·1인 사업 홈페이지의 카피라이터입니다. 사업계획서를 읽고, 손님이 홈페이지에서 읽을 글을 씁니다.",
    "규칙:",
    "- 손님에게 말하는 해요체. 짧고 구체적으로. 계획서 말투(시나리오, 손익분기, 가설, 검증, 시범 운영, 제안, 확인 필요, 사용자 제공)는 쓰지 않습니다.",
    "- 사실은 계획서에 있는 것만 씁니다. 숫자(가격·횟수·개수·시간)도 계획서에 있는 것만. 후기, 고객 수, 만족도, 수상, '1위·최고·유일' 같은 말은 쓰지 않습니다.",
    "- 아직 정하지 않은 것(가격 단위, 배송 요일, 영업시간 등)은 단정하지 말고 '문의 주시면 안내해 드려요'처럼 씁니다.",
    "- '이번에 하지 않는 것'은 약속하지 않습니다.",
    "- 가격 단위(1회·주·월)가 [사업 정보]의 가격이나 대표 상품에 적혀 있지 않으면 단위를 붙이지 말고, 가격 카드에 '가격 기준(1회·월 등)은 문의 주시면 안내해 드려요'라고 씁니다. '구독'은 대표 상품이 구독일 때만 씁니다.",
    "- 배송비·위약금·환불·청약철회·교환 같은 거래 조건과 '무료·없음·포함' 같은 말은 [사업 정보]나 계획서에 확정된 문장으로 있을 때만 씁니다. 계획서에 '(제안)'으로만 있으면 쓰지 않습니다. 환불 규정은 홈페이지 약관에서 따로 안내하므로 카드에 쓰지 않습니다.",
    "- cards 는 4~6장: 상품 구성·손님이 얻는 것·약속(건너뛰기·보상 같은 이용 기준)을 담고, 가격이 있으면 가격 카드를 꼭 1장 넣습니다(계획서의 금액 그대로, 쉼표 포함).",
    "- process 는 손님 입장의 이용 순서 2~4단계(신청 → 받기처럼). 각 단계는 '① 무엇 — 설명' 한 줄.",
    "- [사업 정보]의 '알리는 곳'은 사장님이 홍보하는 채널이지 손님이 연락하는 곳이 아닙니다. 신청·문의 단계는 '홈페이지의 문의 버튼으로'처럼 쓰고, 알리는 곳 이름을 연락처로 쓰지 않습니다.",
    "- 영업시간·여는 요일과 시각·주소는 홈페이지의 '오시는 길·영업시간' 칸이 사업자 정보로 따로 안내합니다. 카드·이용 순서·faq·마무리 글에서 손님에게 이것들을 문의 버튼이나 연락으로 물어보라고 쓰지 않습니다. 정해지지 않았으면 그 내용은 빼고, 이용 순서라면 '찾아오시는 길 확인'처럼 중립적인 단계로 쓰거나 그 단계를 뺍니다.",
    "- tagline 은 사업 이름 아래 한 줄 소개(28자 안팎). 확정한 한 줄 소개가 있으면 그 뜻을 살립니다.",
    "- closing 은 페이지 마지막 큰 문장(24자 안팎), closingSub 는 그 아래 한 문장, cta 는 버튼 글(10자 안팎, 예: 구독 문의하기).",
    "- facts 는 손님이 한눈에 볼 숫자 0~3개: value 는 계획서에 적힌 숫자 그대로(예: 4명, 50분, 주 2회), label 은 그 뜻(예: 한 수업 정원). 매출·고객 수·목표·원가 같은 사업 숫자는 넣지 않습니다. 없으면 빈 배열.",
    "- menu 는 손님이 고르는 메뉴·상품·수업 0~3개와 가격표: name 은 계획서에 있는 상품 이름을 메뉴판처럼 짧게(20자 안팎, 예: 4인 기구 필라테스 정기권) — 자세한 구성은 intro 나 카드에, price 는 계획서의 금액 그대로(쉼표 포함, 단위가 적혀 있을 때만 단위)이고 금액이 없으면 '문의'. 계획서에 없는 메뉴를 지어내지 않습니다. 없으면 items 를 빈 배열로.",
    "- faq 는 손님이 자주 물을 질문 0~4개와 답: 답이 [사업 정보]나 계획서에 있는 것만(예약 방법, 준비물, 이용 시간, 주차처럼). 효과·치료 결과·부작용 없음 같은 약속, 다른 곳과의 비교는 쓰지 않습니다. 답이 없으면 빈 배열.",
    "- 병원·의원·치과·약국이면 cards 는 진료 과목·진료 항목, process 는 접수부터 진료 뒤까지의 순서로 쓰고, 의료진 이름·경력·자격은 쓰지 않습니다(사장님이 직접 적습니다).",
    "- [사업 정보]의 가격이 하나뿐인데 메뉴가 여럿이면 모든 메뉴를 '문의'로 두지 말고, 그 금액을 'N원부터'처럼 씁니다(계획서의 금액 그대로). 메뉴마다 다른 금액을 지어내지 않습니다.",
    "- cta 는 손님이 할 행동입니다('문의하기', '예약 문의하기'처럼). 아직 정하지 않은 것을 묻는 말('영업시간 문의하기', '주소 문의하기')은 쓰지 않습니다.",
    "JSON 객체 하나만 출력합니다:",
    '{"tagline":"","cardsTitle":"","cardsIntro":"","cards":[{"title":"","body":""}],"process":{"title":"","steps":[""]},"closing":"","closingSub":"","cta":"","facts":[{"value":"","label":""}],"menu":{"title":"","intro":"","items":[{"name":"","price":""}]},"faq":[{"question":"","answer":""}]}',
  ].join("\n");
  const user = ["[사업 정보]", ...facts, "", "[계획서 발췌]", ...excerpts].join("\n");
  return { system, user };
}

/*
 * 채운 글을 템플릿 자리에 넣는다 — 디자인을 옮긴 템플릿(0-1102·0-290·0-2226·0-2385·0-421)만 칸을 모두 쓰고,
 * 나머지는 큰 제목 아래 한 줄 소개만 넣는다.
 */
/** '① 접수 — 설명' 한 줄을 번호·제목·설명 칸으로 나눈다(대시가 없으면 제목만) */
function stepTexts(line: string | undefined, index: number, number: string, title: string, body: string): Record<string, string> {
  const step = line?.replace(/^(?:[\u2460-\u2473]|\d{1,2}[.)])\s*/, "").trim() ?? "";
  const [head, ...rest] = step.split(/\s+[—–-]\s+/);
  return { [number]: step ? String(index + 1) : "", [title]: rest.length ? head.trim() : step, [body]: rest.join(" — ").trim() };
}

/** 설명 없이는 뜻이 안 되는 카드 이름('가격', '위치' …) */
const LABEL_ONLY_TITLE = /^(가격|요금|가격\s*안내|메뉴|위치|주소|시간|영업\s*시간|운영\s*시간|문의|연락처|오시는\s*길|안내|이용\s*안내|구성|대상|이용\s*대상)$/;

function copyNodes(page: string, copy: HomepageCopy, hasTagline: boolean): { texts: Record<string, string>; show: string[] } {
  const texts: Record<string, string> = {};
  const profile = BUSINESS_TEMPLATE_PROFILES[page];
  if (profile && !hasTagline && copy.tagline) texts[profile.description] = copy.tagline;
  if (page === "0-1102") {
    const cards = [["0:1333", "0:1334"], ["0:1338", "0:1339"], ["0:1343", "0:1344"], ["0:1348", "0:1349"], ["0:1353", "0:1354"], ["0:1358", "0:1359"]];
    cards.forEach(([title, body], index) => { texts[title] = copy.cards[index]?.title ?? ""; texts[body] = copy.cards[index]?.body ?? ""; });
    if (copy.process.steps.length) {
      texts["0:1141"] = copy.process.title;
      texts["0:1142"] = copy.process.steps.join("\n");
    }
    texts["0:1111"] = copy.closing;
    if (copy.cta) { texts["I0:1110;0:4626"] = copy.cta; texts["I0:1140;0:4572"] = copy.cta; }
    return { texts, show: ["0:1329", ...(copy.process.steps.length ? ["0:1137"] : [])] };
  }
  if (page === "0-290") {
    texts["0:397"] = copy.cardsTitle;
    texts["0:396"] = copy.cardsIntro;
    /*
     * 이 디자인의 카드는 이름만 보인다 — '가격'처럼 설명이 있어야 뜻이 되는 이름은 빈 제목만 남아(재검증 2026-10-22 2차) 건너뛴다.
     * 옮겨 담기는 카드 이름으로 짝을 찾으므로(homepageCopyOf) 건너뛰어도 설명은 그대로 남는다.
     */
    const named = copy.cards.filter((card) => !LABEL_ONLY_TITLE.test(card.title.trim()));
    ["0:373", "0:380", "0:387", "0:394"].forEach((id, index) => { texts[id] = named[index]?.title ?? ""; });
    const show = named.length >= 3 ? ["0:366", "0:297"] : ["0:297"];
    /* '이용 안내'(제공 내용·이용 대상·가격 안내 꼬리표 칸) 자리에는 AI 가 쓴 이용 순서를 문장으로 */
    if (copy.process.steps.length >= 2) {
      texts["0:365"] = copy.process.title || "이용 안내";
      texts["0:364"] = "";
      [["0:340", "0:337", "0:336"], ["0:346", "0:343", "0:342"], ["0:352", "0:349", "0:348"]].forEach(([number, title, body], index) => Object.assign(texts, stepTexts(copy.process.steps[index], index, number, title, body)));
      show.push("0:332");
    }
    // 숫자 — 둘 이상 있을 때만 띠를 연다
    if (copy.facts.length >= 2) {
      [["0:400", "0:401"], ["0:403", "0:404"], ["0:406", "0:407"]].forEach(([value, label], index) => { texts[value] = copy.facts[index]?.value ?? ""; texts[label] = copy.facts[index]?.label ?? ""; });
      show.push("0:398");
    }
    texts["0:309"] = copy.closing;
    texts["0:308"] = copy.closingSub;
    if (copy.cta) for (const id of ["I0:416;0:4460", "I0:420;0:4613", "I0:302;0:4557"]) texts[id] = copy.cta;
    return { texts, show };
  }
  if (page === "0-2226") {
    const show = ["0:2283", "0:2238", "0:2228"];
    // 좋은 점 카드 셋
    [["0:2285", "0:2286"], ["0:2294", "0:2295"], ["0:2301", "0:2302"]].forEach(([title, body], index) => { texts[title] = copy.cards[index]?.title ?? ""; texts[body] = copy.cards[index]?.body ?? ""; });
    // 숫자 셋 — 둘 이상 있을 때만 띠를 연다
    if (copy.facts.length >= 2) {
      [["0:2349", "0:2350"], ["0:2352", "0:2353"], ["0:2355", "0:2356"]].forEach(([value, label], index) => { texts[value] = copy.facts[index]?.value ?? ""; texts[label] = copy.facts[index]?.label ?? ""; });
      show.push("0:2347");
    }
    // 메뉴·가격 — 사진 카드 셋
    if (copy.menu.items.length) {
      texts["0:2345"] = copy.menu.title || "메뉴·가격";
      texts["0:2346"] = copy.menu.intro;
      [["0:2324", "0:2325"], ["0:2331", "0:2332"], ["0:2338", "0:2339"]].forEach(([name, price], index) => { texts[name] = copy.menu.items[index]?.name ?? ""; texts[price] = copy.menu.items[index]?.price ?? ""; });
      show.push("0:2322");
    }
    // 이용 순서
    if (copy.process.steps.length) {
      texts["0:2312/0"] = copy.process.title;
      texts["0:2313"] = copy.process.steps.join("\n");
      show.push("0:2309");
    }
    texts["0:2237"] = copy.closing;
    texts["0:2235"] = copy.closingSub;
    if (copy.cta) { texts["I0:2372;0:4557"] = copy.cta; texts["I0:2233;0:4557"] = copy.cta; }
    return { texts, show };
  }
  if (page === "0-421") {
    const show = ["0:558", "0:422"];
    // 이런 일을 해요 — 여섯까지
    if (copy.cardsTitle) texts["0:609/0"] = copy.cardsTitle;
    [["0:565", "0:566"], ["0:571", "0:572"], ["0:577", "0:578"], ["0:583", "0:584"], ["0:591", "0:592"], ["0:601", "0:602"]].forEach(([title, body], index) => { texts[title] = copy.cards[index]?.title ?? ""; texts[body] = copy.cards[index]?.body ?? ""; });
    // 작업 과정 — 제목·설명으로 나눈 세 단계
    if (copy.process.steps.length >= 2) {
      texts["0:745"] = copy.process.title;
      [["0:752", "0:754", "0:753"], ["0:758", "0:760", "0:759"], ["0:764", "0:766", "0:765"]].forEach(([number, title, body], index) => Object.assign(texts, stepTexts(copy.process.steps[index], index, number, title, body)));
      show.push("0:743");
    }
    // 패키지·가격 — 두 개까지(계획서 금액 그대로, 없으면 '문의')
    if (copy.menu.items.length) {
      texts["0:512"] = copy.menu.title || "패키지·가격";
      texts["0:513"] = copy.menu.intro;
      [["0:531", "0:534/1"], ["0:553", "0:556/1"]].forEach(([name, price], index) => { texts[name] = copy.menu.items[index]?.name ?? ""; texts[price] = copy.menu.items[index]?.price ?? ""; });
      show.push("0:461");
    }
    texts["0:436"] = copy.closing;
    texts["0:457"] = copy.closingSub;
    if (copy.cta) for (const id of ["I0:1090;0:4557", "I0:1101;0:4613", "I0:535;0:4557", "I0:557;0:4557"]) texts[id] = copy.cta;
    return { texts, show };
  }
  if (page === "0-2385") {
    const show = ["0:2519", "0:2393", "0:2387"];
    // 진료 과목 셋
    [["0:2521", "0:2522"], ["0:2528", "0:2529"], ["0:2534", "0:2535"]].forEach(([title, body], index) => { texts[title] = copy.cards[index]?.title ?? ""; texts[body] = copy.cards[index]?.body ?? ""; });
    // 병원 소개(사진 넷 위 제목·소개)
    if (copy.cardsTitle) { texts["0:2512"] = copy.cardsTitle; texts["0:2511"] = copy.cardsIntro; show.push("0:2508"); }
    // 숫자 셋 — 둘 이상일 때만
    if (copy.facts.length >= 2) {
      [["0:2499", "0:2500"], ["0:2502", "0:2503"], ["0:2505", "0:2506"]].forEach(([value, label], index) => { texts[value] = copy.facts[index]?.value ?? ""; texts[label] = copy.facts[index]?.label ?? ""; });
      show.push("0:2497");
    }
    // 진료 순서 — '① 접수 — 설명' 을 제목과 설명으로 나눠 세 단계까지
    if (copy.process.steps.length >= 2) {
      texts["0:2496"] = copy.process.title;
      [["0:2477", "0:2474", "0:2473"], ["0:2483", "0:2480", "0:2479"], ["0:2489", "0:2486", "0:2485"]].forEach(([number, title, body], index) => Object.assign(texts, stepTexts(copy.process.steps[index], index, number, title, body)));
      show.push("0:2470");
    }
    // 자주 묻는 질문
    if (copy.faq.length) {
      texts["0:2454/0"] = "자주 묻는 질문";
      [["0:2422", "0:2423"], ["0:2431", "0:2432"], ["0:2439", "0:2440"], ["0:2447", "0:2448"]].forEach(([question, answer], index) => { texts[question] = copy.faq[index]?.question ?? ""; texts[answer] = copy.faq[index]?.answer ?? ""; });
      show.push("0:2420");
    }
    texts["0:2390"] = copy.closing;
    texts["0:2389"] = copy.closingSub;
    if (copy.cta) for (const id of ["I0:2546;0:4460", "I0:2554;0:4613", "I0:2391;0:4460"]) texts[id] = copy.cta;
    return { texts, show };
  }
  return { texts, show: [] };
}

/*
 * 문의 버튼 글.
 * 동네 가게 디자인에서 AI 가 '영업시간 문의하기'를 첫 화면·마무리·문의 양식에 모두 넣었다(실제 AI 점검 2026-10-22) —
 * 아직 정하지 않은 것을 묻는 말이 손님 버튼이 됐다. 찾아오는 가게는 전화번호가 있으면 '전화하기'(전화 연결),
 * 주소만 있으면 첫 화면 버튼을 '오시는 길'(지도 검색)로. 그 밖에는 AI 버튼 글('예약 문의하기' 등), 쓸 수 없는 말이면 '문의하기'.
 */
const CTA_ASKS_UNKNOWN = /(영업\s*시간|여는\s*시간|운영\s*시간|주소|위치|오시는\s*길|가격|휴무)/;
export const WALK_IN_PAGES = new Set(["0-2226"]);

export function homepageCta(aiCta: string, page: string, draft: Pick<LandingDraft, "businessPhone" | "businessContact" | "businessAddress" | "contact">): { label: string; hero?: { label: string; href: string }; callPhone: boolean } {
  const usable = aiCta.trim().length >= 2 && !CTA_ASKS_UNKNOWN.test(aiCta) ? aiCta.trim() : "문의하기";
  if (!WALK_IN_PAGES.has(page)) return { label: usable, callPhone: false };
  const contact = draft.contact ?? DEFAULT_CONTACT;
  const phone = draftPhone(draft);
  /* 사장님이 연락 방법을 따로 골랐으면(카톡·예약 등) 그 방법을 따른다 */
  if (contact.method !== "form" && contact.method !== "phone") return { label: usable, callPhone: false };
  if (phone) return { label: "전화하기", callPhone: true };
  const address = draft.businessAddress.trim();
  if (address) return { label: usable, hero: { label: "오시는 길", href: `https://map.naver.com/p/search/${encodeURIComponent(address)}` }, callPhone: false };
  return { label: usable, callPhone: false };
}

/** 문의 양식 제목으로 써도 되는 버튼 글인지('전화하기'·'오시는 길'은 양식 제목이 될 수 없다) */
const formTitleLike = (label: string) => /(문의|신청|예약|상담)/.test(label) && !CTA_ASKS_UNKNOWN.test(label);

/**
 * 채운 글·사진을 초안에 넣는다. 사장님이 고친 자리는 건드리지 않는다:
 * 지금 글이 비었거나, 처음 만든 글(기준)과 같거나, 지난번 AI 가 쓴 글과 같을 때만 바꾼다.
 * 기본으로 숨겨 둔 섹션은 채우면서 연다 — 사장님이 직접 숨긴 섹션은 그대로 둔다.
 * 쓴 글은 디자인과 상관없는 모양(copy)으로도 남긴다 — 디자인을 바꾸면 새 디자인 자리에 다시 옮겨 담는다.
 */
export function applyHomepageCopy(draft: LandingDraft, rawCopy: HomepageCopy, options: { industry?: string; description?: string; now?: string } = {}): LandingDraft {
  const now = options.now ?? new Date().toISOString();
  const data = draft.pageData;
  const bw = data?.brainwave;
  if (!data || !bw || !data.businessContent || !businessTemplateManifest[bw.page]) return draft;
  const cta = homepageCta(rawCopy.cta, bw.page, draft);
  const copy: HomepageCopy = { ...rawCopy, cta: cta.label };
  const baseline = createBusinessTemplate(data.businessContent, bw.page);
  const last = data.aiFill;
  /*
   * 손대지 않은 자리: 비었거나, 지금 템플릿의 기준 글이거나, 사업 정보로 자동으로 들어간 문구
   * (예전 배치의 '○○ 문의' 같은 글 포함)이거나, 지난번 AI 글. 그 밖의 글은 사장님이 쓴 것이다.
   */
  const defaults = businessTemplateDefaults(data.businessContent);
  const untouched = (current: string | undefined, id: string, base: string | undefined) =>
    !current?.trim() || current === base || defaults.has(current.trim()) || current === last?.texts[id];
  const { texts: copied, show } = copyNodes(bw.page, copy, Boolean(data.businessContent.headline?.trim()));
  const profile = BUSINESS_TEMPLATE_PROFILES[bw.page];
  /* 주소만 있는 동네 가게 — 첫 화면 버튼은 '오시는 길'(지도), 나머지는 문의 양식 */
  const links = { ...bw.links };
  if (cta.hero && profile) {
    copied[profile.button] = cta.hero.label;
    const hero = ctaButtons(bw.page).find((button) => button.text === profile.button);
    if (hero && (links[hero.button] === undefined || links[hero.button] === "contact")) links[hero.button] = cta.hero.href;
  }
  // 오시는 길·영업시간은 AI 가 아니라 사업자 정보에서(적어 둔 것만)
  const texts = { ...copied, ...visitInfoTexts(bw.page, { address: draft.businessAddress, hours: draft.openHours }) };
  const nextTexts = { ...bw.texts };
  const written: Record<string, string> = {};
  for (const [id, value] of Object.entries(texts)) {
    if (!untouched(bw.texts[id], id, baseline.texts[id])) continue;
    nextTexts[id] = value;
    written[id] = value;
  }
  // 사진 — 업종 사진 한 벌(빈 자리·첫 화면 사진이 복사된 자리·템플릿 기본 사진만 바꾼다)
  const photos = photoSetFor(`${options.industry ?? ""} ${data.businessContent.businessName} ${(options.description ?? "").slice(0, 200)} ${data.businessContent.offer}`);
  const nextImages = photos ? applyPhotoSet(bw.images, bw.page, photos) : bw.images;
  const writtenImages = Object.fromEntries(Object.entries(nextImages).filter(([id, url]) => url !== bw.images[id]));
  /*
   * 채운 칸이 든 섹션을 연다 — 기본으로 숨겨 둔 것(기준에서도 숨김)이거나, 숨겨진 채로
   * 사장님 글이 하나도 없던 것(비었거나 자동 문구·지난번 AI 글뿐인 섹션)만.
   * 사장님이 글을 넣고 숨긴 섹션은 그대로 둔다.
   */
  const sectionEmpty = (id: string) => (businessTemplateManifest[bw.page].sections.find((section) => section.id === id)?.nodes ?? [])
    .every((node) => untouched(bw.texts[node], node, baseline.texts[node]));
  const hidden = bw.hidden.filter((id) => !(show.includes(id) && (baseline.hidden.includes(id) || sectionEmpty(id))));
  // 채운 카드 자리 중 글이 들어간 것은 연다(기준에서 빈 사실 칸이라 숨겨 둔 라벨·값)
  // 사진을 넣은 자리도 연다 — 사진 없이 만든 페이지는 사진 자리가 숨김으로 저장돼 있어, 넣어도 안 보였다
  const opened = new Set([...Object.entries(written).filter(([, value]) => value).map(([id]) => id), ...Object.keys(writtenImages)]);
  const nextHidden = hidden.filter((id) => !opened.has(id));
  const next: LandingPageData = landingPageDataSchema.parse({
    ...data,
    brainwave: { ...bw, texts: nextTexts, images: nextImages, links, hidden: nextHidden },
    aiFill: { at: now, texts: { ...(last?.texts ?? {}), ...written }, images: { ...(last?.images ?? {}), ...writtenImages }, copy },
  });
  const hero = photos ? next.brainwave!.images[BUSINESS_HERO_SLOT[bw.page] ?? ""] : undefined;
  // 문의 양식 제목 — 기본 글이거나 지난번 AI 버튼 글이면 새 버튼 글로(양식 제목이 될 수 있는 글일 때만, 아니면 '문의하기')
  const autoCtaLabel = draft.ctaLabel === "문의하기" || Object.values(last?.texts ?? {}).includes(draft.ctaLabel) || CTA_ASKS_UNKNOWN.test(draft.ctaLabel);
  const result: LandingDraft = {
    ...draft,
    ...(autoCtaLabel ? { ctaLabel: formTitleLike(copy.cta) ? copy.cta : "문의하기" } : {}),
    ...(hero && !draft.heroImageUrl ? { heroImageUrl: hero } : {}),
    pageData: next,
  };
  /* 전화번호가 있는 동네 가게 — 문의 양식 대신 전화로 연결(사장님이 아직 연락 방법을 고르지 않았을 때만) */
  if (cta.callPhone && (draft.contact ?? DEFAULT_CONTACT).method === "form") {
    const switched = applyContactMethod(result, { ...result, contact: { ...(draft.contact ?? DEFAULT_CONTACT), method: "phone" } });
    // 링크만 전화로 — 버튼 글은 방금 넣은 '전화하기', 양식 제목은 그대로
    const switchedBw = switched.pageData?.brainwave;
    return { ...switched, ctaLabel: result.ctaLabel, pageData: switchedBw ? { ...switched.pageData!, brainwave: { ...switchedBw, texts: next.brainwave!.texts } } : switched.pageData };
  }
  return result;
}

/*
 * 디자인을 바꿀 때 AI 글 옮겨 담기.
 *
 * 예전엔 디자인을 바꾸면 템플릿 기본 글('제공 내용 / 식빵·소금빵 / 이용 대상 …')로 새로 만들어
 * AI 가 쓴 '오늘의 빵'·카드·이용 순서가 사라졌고, 원래 디자인으로 돌아가도 되살아나지 않았다(실제 AI 점검 2026-10-22).
 * 이제 AI 글을 역할(한 줄 소개·카드·이용 순서·메뉴·마무리·버튼)로 읽어 새 디자인의 같은 역할 자리에 넣는다.
 * 디자인마다 칸 수가 달라 다 들어가지 않는 글은 copy 에 남아 있어, 칸이 많은 디자인으로 돌아가면 다시 나온다.
 */
const MARKER = "\u0000";
function markerCopy(): HomepageCopy {
  const m = (key: string) => `${MARKER}${key}${MARKER}`;
  return {
    tagline: m("tagline"), cardsTitle: m("cardsTitle"), cardsIntro: m("cardsIntro"),
    cards: Array.from({ length: 6 }, (_, i) => ({ title: m(`card.${i}.title`), body: m(`card.${i}.body`) })),
    process: { title: m("process.title"), steps: Array.from({ length: 5 }, (_, i) => `${m(`step.${i}.head`)} — ${m(`step.${i}.body`)}`) },
    closing: m("closing"), closingSub: m("closingSub"), cta: m("cta"),
    facts: Array.from({ length: 3 }, (_, i) => ({ value: m(`fact.${i}.value`), label: m(`fact.${i}.label`) })),
    menu: { title: m("menu.title"), intro: m("menu.intro"), items: Array.from({ length: 3 }, (_, i) => ({ name: m(`menu.${i}.name`), price: m(`menu.${i}.price`) })) },
    faq: Array.from({ length: 4 }, (_, i) => ({ question: m(`faq.${i}.question`), answer: m(`faq.${i}.answer`) })),
  };
}

/** 한 디자인의 글(노드 id → 글)을 역할별 글로 읽는다. 그 디자인이 AI 글을 쓰지 않는 디자인이면 null */
export function copyFromNodes(page: string, texts: Record<string, string>): HomepageCopy | null {
  const { texts: layout } = copyNodes(page, markerCopy(), false);
  if (!Object.keys(layout).length) return null;
  const roles: Record<string, string> = {};
  const steps: Array<{ head?: string; body?: string }> = [];
  let stepLines: string[] | null = null;
  const markerRe = new RegExp(`${MARKER}([^${MARKER}]+)${MARKER}`, "g");
  for (const [id, pattern] of Object.entries(layout)) {
    const value = texts[id]?.trim();
    if (!value) continue;
    const keys = [...pattern.matchAll(markerRe)].map((match) => match[1]);
    if (keys.length > 2 || (keys.length === 2 && keys[0].startsWith("step."))) {
      // 이용 순서를 한 칸에 줄바꿈으로 넣는 디자인
      if (keys.every((key) => key.startsWith("step."))) stepLines = value.split("\n").map((line) => line.trim()).filter(Boolean);
      continue;
    }
    if (keys.length !== 1) continue;
    const key = keys[0];
    const step = key.match(/^step\.(\d)\.(head|body)$/);
    if (step) { const index = Number(step[1]); steps[index] = { ...steps[index], [step[2]]: value }; continue; }
    if (!(key in roles)) roles[key] = value;
  }
  const take = (key: string) => roles[key] ?? "";
  const stepList = stepLines ?? steps.filter(Boolean).map((step) => (step.body ? `${step.head ?? ""} — ${step.body}` : step.head ?? "").trim()).filter(Boolean);
  return {
    tagline: take("tagline"), cardsTitle: take("cardsTitle"), cardsIntro: take("cardsIntro"),
    cards: Array.from({ length: 6 }, (_, i) => ({ title: take(`card.${i}.title`), body: take(`card.${i}.body`) })).filter((card) => card.title),
    process: { title: take("process.title"), steps: stepList.slice(0, 5) },
    closing: take("closing"), closingSub: take("closingSub"), cta: take("cta"),
    facts: Array.from({ length: 3 }, (_, i) => ({ value: take(`fact.${i}.value`), label: take(`fact.${i}.label`) })).filter((fact) => fact.value && fact.label),
    menu: { title: take("menu.title"), intro: take("menu.intro"), items: Array.from({ length: 3 }, (_, i) => ({ name: take(`menu.${i}.name`), price: take(`menu.${i}.price`) })).filter((item) => item.name) },
    faq: Array.from({ length: 4 }, (_, i) => ({ question: take(`faq.${i}.question`), answer: take(`faq.${i}.answer`) })).filter((item) => item.question && item.answer),
  };
}

/** 저장된 AI 글(copy)을 읽는다 — 형식이 어긋나도 쓸 수 있는 칸만 */
function storedCopy(raw: unknown): HomepageCopy | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<HomepageCopy>;
  const list = <T,>(items: unknown): T[] => (Array.isArray(items) ? items as T[] : []);
  // 예전에 저장된 AI 글의 '여는 시각은 문의로' 문장도 디자인을 바꿀 때 다시 나오지 않게
  return withoutVisitInfoAsks({
    tagline: clip(value.tagline, 48), cardsTitle: clip(value.cardsTitle, 28), cardsIntro: clip(value.cardsIntro, 90),
    cards: list<{ title: string; body: string }>(value.cards).map((card) => ({ title: clip(card?.title, 26), body: clip(card?.body, 110) })).filter((card) => card.title).slice(0, 6),
    process: { title: clip(value.process?.title, 28), steps: list<string>(value.process?.steps).map((step) => clip(step, 80)).filter(Boolean).slice(0, 5) },
    closing: clip(value.closing, 40), closingSub: clip(value.closingSub, 90), cta: clip(value.cta, 14),
    facts: list<{ value: string; label: string }>(value.facts).map((fact) => ({ value: clip(fact?.value, 12), label: clip(fact?.label, 40) })).filter((fact) => fact.value && fact.label).slice(0, 3),
    menu: { title: clip(value.menu?.title, 28), intro: clip(value.menu?.intro, 90), items: list<{ name: string; price: string }>(value.menu?.items).map((item) => ({ name: clip(item?.name, 40), price: clip(item?.price, 24) })).filter((item) => item.name).slice(0, 3) },
    faq: list<{ question: string; answer: string }>(value.faq).map((item) => ({ question: clip(item?.question, 40), answer: clip(item?.answer, 160) })).filter((item) => item.question && item.answer).slice(0, 4),
  });
}

/*
 * 카드 합치기 — 제목과 설명은 한 짝이다.
 * 예전엔 지금 디자인에서 읽은 카드를 통째로 썼는데, 상담 서비스처럼 카드에 이름만 있는 디자인을 거치면 설명이 ""로 읽혀
 * 동네 가게로 돌아왔을 때 카드 셋이 제목만 남았다(재검증 2026-10-22 2차, 그대로 저장·공개됐다).
 * 이제 저장해 둔 카드 순서를 기준으로, 지금 디자인의 카드를 같은 제목(없으면 같은 자리)에 겹치고, 지금 디자인에 설명 칸이 없으면
 * 저장해 둔 설명을 그대로 둔다. 칸이 적은 디자인에 못 들어간 뒤쪽 카드도 저장해 둔 글로 남는다.
 */
function mergeCards(current: HomepageCopy["cards"], stored: HomepageCopy["cards"]): HomepageCopy["cards"] {
  if (!stored.length) return current;
  const out = stored.map((card) => ({ ...card }));
  const taken = new Set<number>();
  const rest: Array<{ card: HomepageCopy["cards"][number]; index: number }> = [];
  current.forEach((card, index) => {
    const at = out.findIndex((item, i) => !taken.has(i) && item.title === card.title);
    if (at < 0) { rest.push({ card, index }); return; }
    taken.add(at);
    out[at] = { title: card.title, body: card.body || out[at].body };
  });
  // 제목을 고친 카드 — 같은 자리(그 자리가 이미 짝을 찾았으면 비어 있는 첫 자리)에
  for (const { card, index } of rest) {
    const at = !taken.has(index) && index < out.length ? index : out.findIndex((_, i) => !taken.has(i));
    if (at < 0) { out.push(card); continue; }
    taken.add(at);
    out[at] = { title: card.title, body: card.body || out[at].body };
  }
  return out.slice(0, 6);
}

/**
 * 지금 페이지에 들어 있는 AI 글 — 저장해 둔 copy 위에, 지금 디자인의 AI 자리에 들어 있는 글(사장님이 그 뒤 고친 글 포함)을 겹친다.
 * AI 로 채운 적이 없으면 null.
 */
export function homepageCopyOf(data: LandingPageData | null | undefined): HomepageCopy | null {
  const bw = data?.brainwave;
  if (!data?.aiFill || !bw) return null;
  const stored = storedCopy(data.aiFill.copy);
  const aiIds = new Set(Object.keys(data.aiFill.texts));
  const current = copyFromNodes(bw.page, Object.fromEntries(Object.entries(bw.texts).filter(([id]) => aiIds.has(id))));
  if (!stored && !current) return null;
  if (!stored) return current;
  if (!current) return stored;
  const pick = <T,>(a: T[], b: T[]) => (a.length >= b.length ? a : b.length ? b : a);
  return {
    tagline: current.tagline || stored.tagline,
    cardsTitle: current.cardsTitle || stored.cardsTitle,
    cardsIntro: current.cardsIntro || stored.cardsIntro,
    cards: mergeCards(current.cards, stored.cards),
    process: { title: current.process.title || stored.process.title, steps: pick(current.process.steps, stored.process.steps) },
    closing: current.closing || stored.closing,
    closingSub: current.closingSub || stored.closingSub,
    cta: current.cta || stored.cta,
    facts: pick(current.facts, stored.facts),
    menu: { title: current.menu.title || stored.menu.title, intro: current.menu.intro || stored.menu.intro, items: pick(current.menu.items, stored.menu.items) },
    faq: pick(current.faq, stored.faq),
  };
}

/**
 * 디자인 바꾸기 — 새 디자인을 사업 정보로 만들고(오시는 길·영업시간·연락 방법 포함),
 * AI 로 채운 적이 있으면 그 글을 새 디자인의 같은 역할 자리에 옮겨 담는다.
 */
export function switchHomepageDesign(draft: LandingDraft, page: string, build: (draft: LandingDraft) => BrainwaveData): LandingDraft {
  const data = draft.pageData;
  if (!data) return draft;
  const copy = homepageCopyOf(data);
  const brainwave = build(draft);
  Object.assign(brainwave.texts, visitInfoTexts(page, { address: draft.businessAddress, hours: draft.openHours }));
  const fresh: LandingDraft = { ...draft, pageData: { ...data, brainwave, content: [] } };
  // 새 템플릿의 문의 버튼도 지금 연락 방법으로(전화면 전화) — 새로 만든 버튼은 '문의 양식'에서 시작한다
  const linked = applyContactMethod({ ...fresh, contact: DEFAULT_CONTACT }, fresh);
  if (!copy) return linked;
  return applyHomepageCopy(linked, copy, { now: data.aiFill?.at, description: draft.offerDescription });
}

const BUSINESS_HERO_SLOT: Record<string, string> = { "0-1102": "0:1325/0/0", "0-290": "0:411/0", "0-2226": "0:2362/0/0", "0-2385": "0:2550/0/0", "0-421": "0:1082/0/0" };

/**
 * 편집기 안에서 디자인을 바꿀 때 — 편집기는 초안 전체(주소·연락 방법)를 모르므로 글 자리만 옮겨 담는다.
 * 지금 편집 중인 글(current)에서 AI 글을 읽어 새 디자인(next)의 같은 역할 자리에 넣는다.
 */
export function carryCopyToDesign(data: LandingPageData, current: BrainwaveData, next: BrainwaveData): BrainwaveData {
  const copy = homepageCopyOf({ ...data, brainwave: current });
  if (!copy || !data.businessContent) return next;
  const stub = {
    pageData: { ...data, brainwave: next }, businessAddress: "", openHours: "", businessPhone: "", businessContact: "",
    ctaLabel: "문의하기", heroImageUrl: "kept", offerDescription: "",
  } as unknown as LandingDraft;
  return applyHomepageCopy(stub, copy, { now: data.aiFill?.at }).pageData?.brainwave ?? next;
}
