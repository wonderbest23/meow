import { z } from "zod";
import type { LandingDraft } from "./domain";
import { landingPageDataSchema, type LandingPageData } from "./page-data";
import { BUSINESS_TEMPLATE_PROFILES, businessTemplateDefaults, businessTemplateManifest, createBusinessTemplate } from "./brainwave/business-content";
import { applyPhotoSet, photoSetFor } from "./photo-library";
import { currentBusinessDesign, readCoach } from "../plan-builder/coach";
import { formatPriceText } from "./from-plan";

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
});
export type HomepageCopy = z.infer<typeof homepageCopySchema>;

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
  const parsed = homepageCopySchema.safeParse({
    tagline: clip(value.tagline, 48),
    cardsTitle: clip(value.cardsTitle, 28),
    cardsIntro: clip(value.cardsIntro, 90),
    cards,
    process: { title: clip(process.title, 28), steps },
    closing: clip(value.closing, 40),
    closingSub: clip(value.closingSub, 90),
    cta: clip(value.cta, 14),
  });
  return parsed.success ? parsed.data : null;
}

type PlanLike = { title: string; answers: Record<string, Record<string, unknown>>; sections?: Record<string, { markdown?: string }> };

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
    "- 가격 단위(1회·주·월)가 [사업 정보]의 가격에 적혀 있지 않으면 단위를 붙이지 말고, 가격 카드에 '구독 단위는 문의 주시면 안내해 드려요'라고 씁니다.",
    "- 배송비·위약금·환불·청약철회·교환 같은 거래 조건과 '무료·없음·포함' 같은 말은 [사업 정보]나 계획서에 확정된 문장으로 있을 때만 씁니다. 계획서에 '(제안)'으로만 있으면 쓰지 않습니다. 환불 규정은 홈페이지 약관에서 따로 안내하므로 카드에 쓰지 않습니다.",
    "- cards 는 4~6장: 상품 구성·손님이 얻는 것·약속(건너뛰기·보상 같은 이용 기준)을 담고, 가격이 있으면 가격 카드를 꼭 1장 넣습니다(계획서의 금액 그대로, 쉼표 포함).",
    "- process 는 손님 입장의 이용 순서 2~4단계(신청 → 받기처럼). 각 단계는 '① 무엇 — 설명' 한 줄.",
    "- tagline 은 사업 이름 아래 한 줄 소개(28자 안팎). 확정한 한 줄 소개가 있으면 그 뜻을 살립니다.",
    "- closing 은 페이지 마지막 큰 문장(24자 안팎), closingSub 는 그 아래 한 문장, cta 는 버튼 글(10자 안팎, 예: 구독 문의하기).",
    "JSON 객체 하나만 출력합니다:",
    '{"tagline":"","cardsTitle":"","cardsIntro":"","cards":[{"title":"","body":""}],"process":{"title":"","steps":[""]},"closing":"","closingSub":"","cta":""}',
  ].join("\n");
  const user = ["[사업 정보]", ...facts, "", "[계획서 발췌]", ...excerpts].join("\n");
  return { system, user };
}

/*
 * 채운 글을 템플릿 자리에 넣는다 — 디자인을 옮긴 템플릿(0-1102·0-290)만 칸을 모두 쓰고,
 * 나머지는 큰 제목 아래 한 줄 소개만 넣는다.
 */
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
    ["0:373", "0:380", "0:387", "0:394"].forEach((id, index) => { texts[id] = copy.cards[index]?.title ?? ""; });
    texts["0:309"] = copy.closing;
    texts["0:308"] = copy.closingSub;
    if (copy.cta) for (const id of ["I0:416;0:4460", "I0:420;0:4613", "I0:302;0:4557"]) texts[id] = copy.cta;
    return { texts, show: copy.cards.length >= 3 ? ["0:366", "0:297"] : ["0:297"] };
  }
  return { texts, show: [] };
}

/**
 * 채운 글·사진을 초안에 넣는다. 사장님이 고친 자리는 건드리지 않는다:
 * 지금 글이 비었거나, 처음 만든 글(기준)과 같거나, 지난번 AI 가 쓴 글과 같을 때만 바꾼다.
 * 기본으로 숨겨 둔 섹션은 채우면서 연다 — 사장님이 직접 숨긴 섹션은 그대로 둔다.
 */
export function applyHomepageCopy(draft: LandingDraft, copy: HomepageCopy, options: { industry?: string; now?: string } = {}): LandingDraft {
  const now = options.now ?? new Date().toISOString();
  const data = draft.pageData;
  const bw = data?.brainwave;
  if (!data || !bw || !data.businessContent || !businessTemplateManifest[bw.page]) return draft;
  const baseline = createBusinessTemplate(data.businessContent, bw.page);
  const last = data.aiFill;
  /*
   * 손대지 않은 자리: 비었거나, 지금 템플릿의 기준 글이거나, 사업 정보로 자동으로 들어간 문구
   * (예전 배치의 '○○ 문의' 같은 글 포함)이거나, 지난번 AI 글. 그 밖의 글은 사장님이 쓴 것이다.
   */
  const defaults = businessTemplateDefaults(data.businessContent);
  const untouched = (current: string | undefined, id: string, base: string | undefined) =>
    !current?.trim() || current === base || defaults.has(current.trim()) || current === last?.texts[id];
  const { texts, show } = copyNodes(bw.page, copy, Boolean(data.businessContent.headline?.trim()));
  const nextTexts = { ...bw.texts };
  const written: Record<string, string> = {};
  for (const [id, value] of Object.entries(texts)) {
    if (!untouched(bw.texts[id], id, baseline.texts[id])) continue;
    nextTexts[id] = value;
    written[id] = value;
  }
  // 사진 — 업종 사진 한 벌(빈 자리·첫 화면 사진이 복사된 자리·템플릿 기본 사진만 바꾼다)
  const photos = photoSetFor(`${options.industry ?? ""} ${data.businessContent.businessName} ${data.businessContent.offer}`);
  const nextImages = photos ? applyPhotoSet(bw.images, bw.page, photos) : bw.images;
  const writtenImages = Object.fromEntries(Object.entries(nextImages).filter(([id, url]) => url !== bw.images[id]));
  /*
   * 채운 칸이 든 섹션을 연다 — 기본으로 숨겨 둔 것(기준에서도 숨김)이거나, 숨겨진 채로
   * 글이 하나도 없던 것(예전 배치에서 비어 있어 숨긴 섹션)만. 사장님이 글을 넣고 숨긴 섹션은 그대로 둔다.
   */
  const sectionEmpty = (id: string) => (businessTemplateManifest[bw.page].sections.find((section) => section.id === id)?.nodes ?? [])
    .every((node) => !bw.texts[node]?.trim() || defaults.has(bw.texts[node].trim()));
  const hidden = bw.hidden.filter((id) => !(show.includes(id) && (baseline.hidden.includes(id) || sectionEmpty(id))));
  // 채운 카드 자리 중 글이 들어간 것은 연다(기준에서 빈 사실 칸이라 숨겨 둔 라벨·값)
  const opened = new Set(Object.entries(written).filter(([, value]) => value).map(([id]) => id));
  const nextHidden = hidden.filter((id) => !opened.has(id));
  const next: LandingPageData = landingPageDataSchema.parse({
    ...data,
    brainwave: { ...bw, texts: nextTexts, images: nextImages, hidden: nextHidden },
    aiFill: { at: now, texts: { ...(last?.texts ?? {}), ...written }, images: { ...(last?.images ?? {}), ...writtenImages } },
  });
  const hero = photos ? next.brainwave!.images[BUSINESS_HERO_SLOT[bw.page] ?? ""] : undefined;
  return {
    ...draft,
    ...(copy.cta && draft.ctaLabel === "문의하기" ? { ctaLabel: copy.cta } : {}),
    ...(hero && !draft.heroImageUrl ? { heroImageUrl: hero } : {}),
    pageData: next,
  };
}

const BUSINESS_HERO_SLOT: Record<string, string> = { "0-1102": "0:1325/0/0", "0-290": "0:411/0" };
