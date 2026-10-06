import { readLaunch } from "../plan-builder/business-launch";
import { readCoach } from "../plan-builder/coach";
import { readIntake } from "../plan-builder/intake-core";
import { ksicStructure } from "../plan-builder/ksic";
import type { Plan } from "../plan-builder/plan-store";
import { SERVICE_CATALOG, type ServiceItem } from "./catalog";

/*
 * '다음 단계'에서 이 사업에 맞는 서비스에 배지를 단다.
 *
 * AI 를 부르지 않는다 — 사업 시작하기 화면(business-launch)에서 사장님이 고른 값(사업자등록 여부·일할 곳)과
 * 확정한 업종(KSIC)의 구조, 대화에서 정한 판매 경로 글자만 본다. 같은 사업이면 늘 같은 배지가 나온다.
 * 법적 판단이 아니라 '먼저 살펴보세요'라는 안내다 — 그래서 '필요해요'는 온라인 판매처럼 분명한 경우에만 쓴다.
 */

export type ServiceSignals = {
  /** 사업자등록을 했는지 — 사업 시작하기 화면에서 고른 값 */
  registered: "yes" | "no" | "unknown";
  /** 일할 곳 — remote(사무실 없이)·shared(소호·공유)·shop(점포) */
  workplace: "unknown" | "remote" | "shared" | "shop";
  /** 온라인으로 주문·결제를 받는지 */
  onlineSelling: boolean;
  /** 업종에 신고·허가·자격이 따로 있는지(KSIC 구조 기준) */
  licensed: boolean;
  /** 홈페이지를 공개했는지 */
  homepagePublished: boolean;
};

export type ServiceBadge = { tone: "need" | "first" | "check" | "suggest" | "done"; label: string; reason: string };

/* 판매 경로 글에 이런 말이 있으면 온라인 판매로 본다. '인스타'처럼 홍보만 하는 곳은 넣지 않는다 */
const ONLINE_SELLING_WORDS = /온라인\s*(판매|주문|쇼핑|몰|스토어)|스마트\s*스토어|쇼핑몰|오픈\s*마켓|자사몰|쿠팡|11번가|지마켓|G마켓|옥션|위메프|티몬|에이블리|지그재그|아이디어스|라이브\s*커머스|통신\s*판매|택배\s*(판매|배송)|전국\s*배송|온라인\s*결제/i;

export const EMPTY_SIGNALS: ServiceSignals = { registered: "unknown", workplace: "unknown", onlineSelling: false, licensed: false, homepagePublished: false };

export function serviceSignalsFromPlan(plan: Plan, homepagePublished: boolean): ServiceSignals {
  const launch = readLaunch(plan);
  const coach = readCoach(plan.answers);
  const channel = coach?.fields.find((field) => field.key === "channel")?.value ?? "";
  const offer = coach?.fields.find((field) => field.key === "offer")?.value ?? "";
  const intake = readIntake(plan.answers as Record<string, Record<string, unknown>>);
  const structure = intake?.ksic ? ksicStructure(intake.ksic) : undefined;
  const onlineByIndustry = Boolean(intake?.ksic?.startsWith("4791")) || (structure?.offering === "goods" && (structure.delivery === "online" || structure.delivery === "delivery"));
  return {
    registered: launch.registered,
    workplace: launch.workplace,
    onlineSelling: onlineByIndustry || ONLINE_SELLING_WORDS.test(`${channel} ${offer}`),
    licensed: structure ? ["registration", "permit", "professional"].includes(structure.license) : false,
    homepagePublished,
  };
}

/** 서비스 id → 배지. 배지가 없는 서비스는 빠진다 */
export function serviceBadges(signals: ServiceSignals): Record<string, ServiceBadge> {
  const badges: Record<string, ServiceBadge> = {};
  if (signals.registered === "no") badges["business-registration"] = { tone: "first", label: "먼저 해요", reason: "사업자등록을 아직 안 하셨다고 하셨어요. 판매를 시작하기 전에 필요해요." };
  else if (signals.registered === "unknown") badges["business-registration"] = { tone: "check", label: "확인해요", reason: "사업자등록을 했는지 아직 모르겠어요. 안 하셨다면 먼저 해요." };
  if (signals.registered !== "yes" && (signals.workplace === "remote" || signals.workplace === "shared")) {
    badges["soho-office"] = { tone: "first", label: "먼저 해요", reason: "사무실 없이 시작하신다면, 사업자등록에 쓸 주소지가 먼저 있어야 해요." };
  } else if (signals.registered === "no" && signals.workplace === "unknown") {
    badges["soho-office"] = { tone: "suggest", label: "추천", reason: "등록할 주소지가 아직 없다면 비상주 사무실이 가장 저렴해요." };
  }
  if (signals.onlineSelling) badges["mail-order-report"] = { tone: "need", label: "필요해요", reason: "온라인으로 주문·결제를 받으면 통신판매업 신고가 필요해요." };
  if (signals.licensed) badges["industry-license"] = { tone: "check", label: "확인해요", reason: "이 업종은 영업 전에 따로 신고·허가가 필요한 경우가 많아요." };
  if (signals.homepagePublished) badges["blog-distribution"] = { tone: "suggest", label: "추천", reason: "홈페이지를 열었으니, 검색에 가게가 보이게 블로그 글부터 퍼뜨려 보세요." };
  return badges;
}

const TONE_ORDER: Record<ServiceBadge["tone"], number> = { first: 0, need: 1, check: 2, suggest: 3, done: 10 };

/** 배지 있는 서비스를 앞으로(먼저 해요 → 필요해요 → 확인해요 → 추천), 나머지는 목록 순서 그대로 */
export function orderServices(items: readonly ServiceItem[], badges: Record<string, ServiceBadge>): ServiceItem[] {
  const index = new Map(SERVICE_CATALOG.map((item, i) => [item.id, i]));
  const rank = (item: ServiceItem) => (badges[item.id] ? TONE_ORDER[badges[item.id].tone] : 9);
  return [...items].sort((a, b) => rank(a) - rank(b) || (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0));
}
