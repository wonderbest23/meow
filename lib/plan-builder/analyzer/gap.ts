/*
 * Gap Analyzer — 규칙 기반, LLM 없음.
 *
 * "이 사업의 사업계획서를 쓰려면 아직 무엇이 없는가"를 계산한다.
 *  - 공통 5대 축(고객·문제·해결·수익·운영)은 분석 결과의 confirmed 로 채운다.
 *  - 팩 슬롯은 동적 답변(slots) 또는 기존 plan.answers 의 mapsTo 칸으로 채운다.
 *  - "아직 모르겠어요"(unknown)는 다시 묻지 않지만 충족으로 세지도 않는다.
 *
 * 여기서 나온 순서대로 최대 4개씩, 최대 2라운드만 묻는다.
 */
import { parseAmount } from "../financials";
import { questionsForSection } from "../questions";
import type { AnalysisRecord, BusinessAnalysis, SlotAnswer } from "./domain";
import { CORE_SLOTS, packForAnalysis, slotsForPack, type PackSlot, type QuestionPack, type SlotGrade } from "./packs";

export interface Gap {
  slot: string;
  label: string;
  grade: SlotGrade;
  why: string;
}

export const MAX_PER_ROUND = 4;
export const MAX_ROUNDS = 2;
/** blocking 충족률 기준 */
export const FINISH_RATIO = 0.85;

type Answers = Record<string, Record<string, unknown>>;

const GRADE_ORDER: Record<SlotGrade, number> = { blocking: 0, important: 1, optional: 2 };

function filled(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** 공통 슬롯 ↔ 분석 필드 */
const CORE_FROM_ANALYSIS: Record<string, keyof BusinessAnalysis> = {
  customer: "customer",
  problem: "problem",
  solution: "solution",
};

/**
 * 슬롯이 이미 채워졌는가 — 세 군데를 본다.
 *  1) 동적 답변(slots): confirmed 면 채움, unknown 이면 "물었음"(다시 안 묻지만 충족 아님)
 *  2) 분석의 confirmed 값 (공통 슬롯)
 *  3) 기존 plan.answers 의 mapsTo 칸 (위저드에서 이미 답한 것)
 */
export function slotState(
  slot: PackSlot,
  record: Pick<AnalysisRecord, "analysis" | "slots">,
  answers: Answers,
): "filled" | "asked_unknown" | "missing" {
  const dyn: SlotAnswer | undefined = record.slots[slot.id];
  if (dyn) {
    if (dyn.status === "confirmed" && filled(dyn.value)) return "filled";
    if (dyn.status === "unknown") return "asked_unknown";
  }
  const fromAnalysis = CORE_FROM_ANALYSIS[slot.id];
  if (fromAnalysis) {
    const f = record.analysis[fromAnalysis] as { value: unknown; status: string };
    if (f.status === "confirmed" && filled(f.value)) return "filled";
  }
  if (slot.mapsTo && filled(answers?.[slot.mapsTo.sectionKey]?.[slot.mapsTo.qid])) return "filled";
  return "missing";
}

export interface GapReport {
  pack: QuestionPack;
  gaps: Gap[];
  /** blocking 슬롯 중 채워진 비율 0~1 */
  completeness: number;
  /** 5대 축이 전부 confirmed 인가 */
  axesConfirmed: boolean;
  canFinish: boolean;
}

export function analyzeGaps(record: Pick<AnalysisRecord, "analysis" | "slots">, answers: Answers): GapReport {
  const pack = packForAnalysis(record.analysis);
  const slots = slotsForPack(pack);
  const hints = new Map(record.analysis.gapHints.map((g) => [g.slot, g.why]));

  const gaps: Gap[] = [];
  let blockingTotal = 0;
  let blockingFilled = 0;
  for (const s of slots) {
    const state = slotState(s, record, answers);
    if (s.grade === "blocking") {
      blockingTotal += 1;
      if (state === "filled") blockingFilled += 1;
    }
    if (state === "missing") gaps.push({ slot: s.id, label: s.label, grade: s.grade, why: hints.get(s.id) ?? s.why });
  }
  gaps.sort((a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade]);

  const a = record.analysis;
  const axesConfirmed = (["customer", "problem", "solution", "revenueModel", "deliveryModel"] as const).every((k) => {
    const f = a[k];
    if (f.status === "confirmed" && filled(f.value)) return true;
    // 공통 슬롯으로 나중에 답했으면 그것도 인정
    const dyn = record.slots[k];
    return Boolean(dyn && dyn.status === "confirmed" && filled(dyn.value));
  });

  const completeness = blockingTotal ? blockingFilled / blockingTotal : 1;
  /*
   * 종료 조건: blocking 이 하나도 "안 물은 채로" 남아 있지 않고, 5대 축이 확인됐을 때.
   * 비율(85%)만 보면 재료비 하나가 남았는데도 끝나 버린다(실측) — 비율은 화면 표시용이고,
   * 실제 판정은 남은 blocking 이 0개인지로 한다. "아직 모르겠어요"로 답한 것은 남은 것으로 세지 않는다.
   */
  const blockingLeft = gaps.some((g) => g.grade === "blocking");
  return { pack, gaps, completeness, axesConfirmed, canFinish: !blockingLeft && completeness >= FINISH_RATIO && axesConfirmed };
}

/** 이번 라운드에 물을 슬롯 — blocking 우선, 최대 4개 */
export function pickRoundSlots(report: GapReport, max = MAX_PER_ROUND): PackSlot[] {
  const all = slotsForPack(report.pack);
  return report.gaps
    .slice(0, max)
    .map((g) => all.find((s) => s.id === g.slot))
    .filter((s): s is PackSlot => Boolean(s));
}

/** 라운드를 더 돌아야 하는가 */
export function shouldContinue(record: Pick<AnalysisRecord, "rounds" | "finished">, report: GapReport): boolean {
  if (record.finished) return false;
  if (record.rounds >= MAX_ROUNDS) return false;
  if (report.canFinish) return false;
  return report.gaps.length > 0;
}

/* ───────── 답 적용 — 순수 함수, 클라이언트·서버 공용 ───────── */

function targetKind(sectionKey: string, qid: string): string | null {
  for (const g of questionsForSection(sectionKey, "")) {
    const q = g.questions.find((x) => x.id === qid);
    if (q) return q.input.kind;
  }
  return null;
}

/**
 * 슬롯 답 하나를 plan.answers 에 반영한다 (새 객체 반환).
 *  - 슬롯 화이트리스트 밖이면 아무것도 하지 않는다.
 *  - "아직 모르겠어요"(value=null) 는 __analysis 에만 남기고 기존 칸은 건드리지 않는다.
 *  - 기존 칸에 이미 답이 있으면 덮어쓰지 않는다 — 위저드에서 직접 적은 답이 우선.
 *    (overwrite=true 면 덮어쓴다: VERIFY 에서 사용자가 직접 고친 값)
 */
export function applySlotAnswer(
  answers: Answers,
  pack: QuestionPack,
  slotId: string,
  value: string | null,
  opts?: { overwrite?: boolean },
): Answers {
  const slot = slotsForPack(pack).find((s) => s.id === slotId);
  if (!slot) return answers;
  const next: Answers = { ...answers };
  const v = value?.trim() ?? "";
  if (!v) return next;
  if (slot.mapsTo) {
    const { sectionKey, qid } = slot.mapsTo;
    const sec = { ...(next[sectionKey] ?? {}) };
    if (opts?.overwrite || !filled(sec[qid])) {
      const kind = targetKind(sectionKey, qid);
      sec[qid] = kind === "multi" ? [v] : v;
      next[sectionKey] = sec;
    }
  }
  for (const extra of slot.alsoSet ?? []) {
    const sec = { ...(next[extra.sectionKey] ?? {}) };
    if (!filled(sec[extra.qid])) {
      sec[extra.qid] = extra.value;
      next[extra.sectionKey] = sec;
    }
  }
  return next;
}

/** 동적 답변의 숫자만 모은다 — 파생 판매량 계산용 */
export function numericSlots(slots: Record<string, SlotAnswer>): Record<string, number | undefined> {
  const out: Record<string, number | undefined> = {};
  for (const [k, v] of Object.entries(slots)) {
    if (v.status !== "confirmed" || !v.value) continue;
    // "2명 (2%)" 같은 괄호 표기는 괄호 안 숫자를 우선한다
    const paren = v.value.match(/\(([\d.,]+)\s*%?\)/);
    out[k] = paren ? Number(paren[1].replace(/,/g, "")) : parseAmount(v.value.replace(/%/, ""));
  }
  return out;
}

/** 공통 슬롯 목록 id */
export const CORE_SLOT_IDS = new Set(CORE_SLOTS.map((s) => s.id));

/* ───────── VERIFY 확정값 → 기존 답변 칸 ───────── */

const REVENUE_STREAM_BY_TAG: Record<string, string> = {
  unit_sale: "1회성 판매",
  commerce: "1회성 판매",
  seat: "1회성 판매",
  class: "시간·건당 요금",
  service_hour: "시간·건당 요금",
  subscription: "정기 구독·회원",
  commission: "중개 수수료",
  franchise: "중개 수수료",
  ad_content: "광고·제휴 수익",
};

const PROMO_OPTIONS = ["인스타그램", "네이버 검색·블로그", "지역 커뮤니티·맘카페", "유튜브·숏폼", "오프라인 전단·간판", "지인·입소문", "제휴처 소개"];

function matchPromo(label: string): string | null {
  const l = label.toLowerCase();
  if (/인스타/.test(l)) return "인스타그램";
  if (/네이버|블로그|검색/.test(l)) return "네이버 검색·블로그";
  if (/맘카페|커뮤니티|당근/.test(l)) return "지역 커뮤니티·맘카페";
  if (/유튜브|숏폼|틱톡|릴스|영상/.test(l)) return "유튜브·숏폼";
  if (/전단|간판|현수막/.test(l)) return "오프라인 전단·간판";
  if (/지인|입소문|소개/.test(l)) return "지인·입소문";
  if (/제휴/.test(l)) return "제휴처 소개";
  return PROMO_OPTIONS.includes(label) ? label : null;
}

function setIfEmpty(next: Answers, sectionKey: string, qid: string, value: unknown) {
  const sec = { ...(next[sectionKey] ?? {}) };
  if (filled(sec[qid])) return;
  sec[qid] = value;
  next[sectionKey] = sec;
}

/**
 * 분석 결과 중 confirmed 인 것만 기존 답변 칸에 옮긴다. inferred 는 절대 옮기지 않는다.
 * 이미 답이 있는 칸은 건드리지 않는다.
 */
export function applyAnalysisToAnswers(answers: Answers, analysis: BusinessAnalysis): Answers {
  const next: Answers = { ...answers };
  const ok = <T,>(f: { value: T | null; status: string }): T | null => (f.status === "confirmed" && filled(f.value) ? f.value : null);

  const customer = ok(analysis.customer);
  if (customer) setIfEmpty(next, "market/segments", "first_target", customer);
  const problem = ok(analysis.problem);
  if (problem) setIfEmpty(next, "overview/problem", "problems", [problem]);
  const solution = ok(analysis.solution);
  if (solution) {
    setIfEmpty(next, "overview/problem", "solutions", [solution]);
    setIfEmpty(next, "market/products", "main_offer", solution);
  }
  const delivery = ok(analysis.deliveryModel);
  if (delivery) setIfEmpty(next, "strategy/distribution", "delivery", delivery);

  const tags = ok(analysis.modelTags) ?? [];
  const streams = Array.from(new Set(tags.map((t) => REVENUE_STREAM_BY_TAG[t]).filter(Boolean)));
  if (streams.length) setIfEmpty(next, "financials/revenue", "revenue_streams", streams);

  const channels = ok(analysis.acquisitionChannels) ?? [];
  const promo = Array.from(new Set(channels.map(matchPromo).filter((x): x is string => Boolean(x))));
  if (promo.length) setIfEmpty(next, "strategy/promotion", "promo_channels", promo);

  return next;
}
