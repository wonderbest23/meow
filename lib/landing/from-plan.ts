import { createLandingDraft, type LandingDraft } from "./domain";
import { createLandingPageData } from "./page-data";

/*
 * 사업계획서 → 홈페이지 초안.
 *
 * 계획서를 다 쓰고 나면 이미 홈페이지에 필요한 말은 전부 답해 둔 상태다.
 * 대표 상품, 첫 고객, 문제와 해결, 가격, 성과 — 그걸 다시 묻지 않고 그대로 옮긴다.
 * 부족한 칸은 템플릿 기본값으로 채우고, 사용자가 편집 화면에서 다듬는다.
 */

export interface PlanLandingSource {
  planTitle: string;
  business: {
    name?: string;
    description?: string;
    industry?: string;
    region?: string;
  };
  /** allAnswers[챕터/섹션][질문id] */
  answers: Record<string, Record<string, unknown>>;
  /** 로그인 계정 이메일 — 개인정보 문의 연락처로 쓴다(없으면 공개가 막힌다) */
  contactEmail?: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  const single = text(value);
  return single ? [single] : [];
}

/** 문장 끝을 다듬는다 — 답변은 대개 명사구로 끝난다 */
function sentence(value: string, suffix = ""): string {
  if (!value) return "";
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!suffix) return trimmed;
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}${suffix}`;
}

/** 받침 유무로 을/를을 고른다 — "직장인를"처럼 읽히면 홈페이지 첫 줄이 망가진다 */
function objectParticle(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  // 한글 음절이 아니면(영문·숫자·기호) 판단할 수 없으므로 조사를 붙이지 않는다
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return "";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}

function clamp(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

export function landingDraftFromPlan(source: PlanLandingSource): LandingDraft {
  const get = (sectionKey: string, qid: string) => source.answers?.[sectionKey]?.[qid];

  const businessName = text(source.business.name) || source.planTitle || "새 사업";
  const contactEmail = text(source.contactEmail);
  const mainOffer = text(get("market/products", "main_offer"));
  const offerDetail = text(get("market/products", "offer_detail"));
  const firstTarget = text(get("market/segments", "first_target"));
  const whyFirst = text(get("market/segments", "why_first"));
  const problems = list(get("overview/problem", "problems"));
  const solutions = list(get("overview/problem", "solutions"));
  const whyBetter = text(get("overview/problem", "why_better"));
  const offerTypes = list(get("market/products", "offer_type"));
  const priceValue = text(get("market/products", "price_value"));
  /*
   * 성과는 '검증된 사실'로 읽히므로 실제로 이뤘다고 답한 것만 싣는다.
   * 아직 성과가 없으면(has_traction = no) 준비 중인 내용은 넣지 않는다 —
   * 홈페이지에서 준비 과정은 실적처럼 보여서는 안 된다.
   */
  const hasTraction = text(get("overview/achievements", "has_traction")) === "yes";
  const achievements = hasTraction
    ? [text(get("overview/achievements", "traction_detail")), ...list(get("overview/achievements", "traction_types"))]
        .filter(Boolean)
    : [];
  const city = text(get("overview/summary", "city")) || text(source.business.region);
  const buyerTypes = list(get("overview/summary", "buyer_type"));

  // 기본 골격은 기존 템플릿이 만들고, 계획서에서 확인된 값만 덮어쓴다
  const base = createLandingDraft({
    title: businessName,
    oneLiner: mainOffer,
    customer: firstTarget,
    model: offerTypes.join("·"),
    sector: text(source.business.industry),
  });

  const targetParticle = objectParticle(firstTarget);
  const headline = clamp(
    mainOffer
      ? firstTarget && targetParticle
        ? `${firstTarget}${targetParticle} 위한 ${mainOffer}`
        : mainOffer
      : base.headline,
    120,
  );

  /*
   * 소제목은 '어떤 문제를 어떻게 푸는가' 한 문장.
   * 문제도 해결도 못 적었으면 템플릿 문장을 그대로 둔다.
   */
  const subheadline = clamp(
    problems.length && solutions.length
      ? sentence(`${problems[0]} — ${solutions[0]}`, ".")
      : whyBetter
        ? sentence(whyBetter, ".")
        : base.subheadline,
    300,
  );

  /*
   * 선택 이유 3가지 — 계획서의 '해결 방식'을 그대로 쓴다.
   * 해결 방식이 하나뿐이면 나머지는 기존 대비 강점·첫 고객 근거로 채운다.
   */
  const benefitPool = [
    ...solutions.map((item, index) => ({
      title: clamp(item, 60),
      description: index === 0 && whyBetter ? clamp(sentence(whyBetter, "."), 300) : clamp(sentence(item, "."), 300),
    })),
    ...(whyBetter && !solutions.length
      ? [{ title: "기존 방식과 다른 점", description: clamp(sentence(whyBetter, "."), 300) }]
      : []),
    ...(whyFirst ? [{ title: "이 고객부터 시작합니다", description: clamp(sentence(whyFirst, "."), 300) }] : []),
  ].filter((item) => item.title);

  const benefits = benefitPool.length ? benefitPool.slice(0, 3) : base.benefits;

  const draft: LandingDraft = {
    ...base,
    businessName,
    headline,
    subheadline,
    heroLabel: buyerTypes.some((item) => item.includes("B2B"))
      ? "도입 상담을 받고 있어요"
      : base.heroLabel,
    benefits,
    offerTitle: mainOffer ? clamp(mainOffer, 60) : base.offerTitle,
    offerDescription: offerDetail ? clamp(sentence(offerDetail, "."), 600) : base.offerDescription,
    priceLabel: priceValue ? clamp(priceValue, 100) : base.priceLabel,
    proofItems: achievements.slice(0, 4).map((item) => clamp(item, 200)),
    privacyController: businessName,
    businessAddress: clamp(city, 300),
    /*
     * 개인정보 문의 연락처는 신청폼을 받는 홈페이지의 법정 필수 항목이다.
     * 비워 두면 공개 단계에서 막히므로 로그인 계정 이메일을 기본값으로 채운다.
     */
    privacyContact: contactEmail,
    privacyPolicy: contactEmail
      ? base.privacyPolicy.replace("6. 개인정보 문의: 공개 전 담당 연락처를 입력해야 합니다.", `6. 개인정보 문의: ${contactEmail}`)
      : base.privacyPolicy,
  };

  return { ...draft, pageData: createLandingPageData(draft, draft.templateId) };
}

/** 계획서에서 홈페이지를 만들 준비가 됐는지 — 최소한 대표 상품은 있어야 한다 */
export function planLandingReadiness(source: PlanLandingSource): { ready: boolean; missing: string[] } {
  const get = (sectionKey: string, qid: string) => source.answers?.[sectionKey]?.[qid];
  const missing: string[] = [];
  if (!text(get("market/products", "main_offer"))) missing.push("상품·서비스 › 가장 대표적인 상품·서비스");
  if (!text(get("market/segments", "first_target"))) missing.push("시장 세그먼트 › 가장 먼저 공략할 그룹");
  return { ready: missing.length === 0, missing };
}
