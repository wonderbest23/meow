// Saved business sources -> sector/purpose storyboard -> reviewed presentation content.

import { completeJson, parseJsonObject, type LLMConfig } from "../llm/complete";
import { calculateFinancials, collectFinancialInputs } from "./financials";
import { reviewCoachSection } from "./coach-review";
import { createProposalBlueprint, proposalBlueprintPrompt, type ProposalBlueprint, type ProposalOptions, type ProposalSlot } from "./proposal-blueprint";
import type { ProposalSlideEdits, ProposalChart, ProposalImage } from "./proposal-revision";

export interface DeckSlide {
  placement?: ProposalSlideEdits["layout"];
  alignment?: ProposalSlideEdits["alignment"];
  appendix?: boolean;
  id?: string;
  composition?: Pick<ProposalSlot, "role" | "layout" | "treatment" | "missingEvidence">;
  table?: { headers: string[]; rows: string[][] };
  image?: ProposalImage | null;
  chart?: ProposalChart | null;
  /**
   * 슬라이드 성격.
   * statement = 사업 정의 한 방(청중이 "무슨 사업인지" 즉시 이해),
   * vision = 비전·목표 강조. 나머지는 일반 본문.
   */
  kind?: "statement" | "vision";
  /** 상단 작은 라벨 */
  eyebrow: string;
  title: string;
  /** 한 줄 요약 — 표지·간지에서 크게 쓰인다 */
  lead?: string;
  /** 본문 항목 (최대 4개) */
  points?: { id?: string; label: string; detail: string }[];
  /** 강조 수치 (최대 4개) */
  metrics?: { label: string; value: string; note?: string }[];
  /** 하단 보조 문장 */
  note?: string;
  /** 원문 계획서의 근거 항목. 발표자 노트에도 보관한다. */
  sourceSections?: string[];
}

export interface DeckPlan {
  schemaVersion?: 3;
  blueprint?: ProposalBlueprint;
  brandName: string;
  slogan: string;
  slides: DeckSlide[];
}

export type DeckBuildEvent = { stage: "generating" | "reviewing" | "repairing" | "validating" | "rendering" | "ready" | "failed"; attempt: number; code?: string };
export type DeckBuildInput = {
  businessName: string; businessDescription?: string; planType?: string;
  sections: Array<{ chapterTitle: string; sectionTitle: string; markdown: string }>;
  allAnswers: Record<string, Record<string, unknown>>; businessContext?: string;
  presentation?: ProposalOptions;
  /** Only application-approved inline assets; the model cannot request a path or URL. */
  assets?: Array<{ id: string; data: string; alt: string }>;
};

const SYSTEM_PROMPT = [
  "당신은 고객·협력사에게 사업을 설명하는 사업소개 발표자료를 만드는 전문가입니다. 투자 요청은 사용 목적에 명시된 경우에만 다룹니다.",
  "주어진 사업계획서 내용만 근거로 사용하세요. 없는 수치·고객사·수상 이력을 지어내지 마세요.",
  "슬라이드는 읽는 문서가 아니라 말하면서 보여주는 자료입니다. 문장을 짧게 끊고 군더더기를 지우세요.",
  "각 항목은 한 줄로 읽히게 쓰고, 같은 말을 다른 슬라이드에서 반복하지 마세요.",
  "근거가 약한 값은 슬라이드에 넣지 말고 빼세요. 빈칸이 과장보다 낫습니다.",
  "업종별 편집 설계의 id와 역할 및 순서를 지키세요. 모든 업종을 투자 유치 이야기로 바꾸지 마세요.",
  "고객 문제와 해결은 대응 구조로, 수행 범위는 표로, 이용 과정은 단계로 편집하세요. 장식용 카드의 반복을 피하세요.",
  "현재 제공하는 것과 제안하는 것, 실제 실적과 예상 계산을 구분하세요. 상세 내용은 note로 분리하되 중요한 거래 조건을 숨기지 마세요.",
  "제목은 이 사업의 구체적인 대상이나 근거 있는 결론을 적으세요. '범위를 명확하게', '먼저 정합니다' 같은 작성 지시나 일반론을 제목으로 쓰지 마세요.",
  "같은 제목과 표 구성을 반복하지 말고 편집 설계에 맞춰 과정, 비교, 일정, 실제 이미지 설명을 구분하세요. 이미지나 실적이 없으면 검증 계획으로 대체하세요.",
].join("\n");

/** 슬라이드 구성 요청에 쓰는 JSON 형식 안내 */
const SHAPE_GUIDE = `{
  "brandName": "표지에 넣을 사업명",
  "slogan": "한 줄 슬로건(20자 이내)",
  "slides": [
    {
      "id": "편집 설계에 지정된 id",
      "kind": "statement | vision (해당 슬라이드에만, 그 외 생략)",
      "eyebrow": "상단 라벨(예: 사업 소개, 문제, 해결, 비전)",
      "title": "슬라이드 제목(25자 이내)",
      "lead": "핵심 한 문장(60자 이내, 선택)",
      "points": [{ "label": "짧은 제목(12자 이내)", "detail": "설명 한 줄(60자 이내)" }],
      "metrics": [{ "label": "지표 이름", "value": "값", "note": "보조 설명(선택)" }],
      "table": { "headers": ["항목", "내용", "조건"], "rows": [["원문 항목", "원문 내용", "원문 조건"]] },
      "imageId": "제공된 이미지 id 중 하나(선택, 이미지가 없으면 생략)",
      "note": "하단 보조 문장(선택)",
      "sourceSections": ["계획서의 챕터명 · 항목명"]
    }
  ]
}`;

/**
 * 유형별 서사 아키타입 — 검증된 덱들의 이야기 순서를 유형마다 고정한다.
 * (Sequoia 피치덱 구성, 국내 PSST 심사자료 순서를 규칙화)
 */
const ARCHETYPES: Record<string, string> = {
  "일반 사업계획서": "사업 소개용입니다. 표지 → 누구에게 무엇을 파는가(statement) → 고객의 문제 → 상품 구성 → 이용 과정 → 제안 가격과 이유 → 판매 방법 → 작은 실행 범위 → 다음 실행 순서 → 다음 대화. 투자금 요청과 근거 없는 시장 규모는 넣지 않습니다. 확정되지 않은 내용은 제안으로 표시합니다.",
  "사업 운영·개선 계획서": "대표와 팀의 운영 회의용입니다. 표지 → 현재 사업(statement) → 사용자 제공 운영 현황 → 당면 문제 → 원인 가설 → 유지할 것 → 개선할 것 → 실행 부담과 비용 → 결과 확인 기준 → 다음 실행. 실제 수치가 없으면 가정으로 대체했다고 밝히고 실적으로 표현하지 않습니다.",
  "정부지원 · PSST 사업계획서": [
    "이 덱은 정부지원 심사용입니다. 슬라이드 순서를 반드시 다음 서사로 구성하세요:",
    "표지 → 사업 정의(statement) → 문제인식(창업 동기·필요성) → 실현가능성(개발·준비 현황, 차별성)",
    "→ 성장전략·비전(vision, 자금을 받으면 언제까지 무엇을 달성하는지) → 시장·고객 → 재무 → 팀·대표 역량 → 요청.",
    "화려한 수사보다 근거와 숫자를 앞세우고, 심사위원이 검증할 수 없는 수치는 빼세요.",
  ].join(" "),
  "성장·확장 · 사업계획서": [
    "이 덱은 실적 기반 확장 제안입니다. 순서: 표지 → 사업 정의(statement) → 지금까지의 실적(숫자 먼저)",
    "→ 병목과 확장 논리 → 비전·목표(vision) → 확장 계획 → 재무 → 요청.",
    "창업 배경 서사는 줄이고 실적→확장 인과를 또렷하게.",
  ].join(" "),
};
const DEFAULT_ARCHETYPE = [
  "슬라이드 순서는 검증된 피치덱 서사를 따르세요:",
  "표지 → 사업 정의(statement) → 문제 → 해결 → 왜 지금인가(또는 시장) → 상품·수익 구조",
  "→ 비전·목표(vision) → 재무 → 실행·검증 계획 → 요청.",
].join(" ");

export function archetypeFor(planType?: string): string {
  return (planType && ARCHETYPES[planType]) || DEFAULT_ARCHETYPE;
}

/** 계획서 본문을 슬라이드 재료로 압축 (프롬프트가 너무 길어지지 않게) */
export function digestSections(
  sections: Array<{ chapterTitle: string; sectionTitle: string; markdown: string }>,
  perSection = 6000,
): string {
  return sections
    .map((s) => {
      const body = s.markdown
        .replace(/```[\s\S]*?```/g, "") // 차트 펜스 제거
        .replace(/\n{2,}/g, "\n")
        .trim()
        ;
      const excerpt = body.length <= perSection ? body : `${body.slice(0, Math.floor(perSection * .65))}\n[중간 본문 일부 생략]\n${body.slice(-Math.floor(perSection * .35))}`;
      return `## ${s.chapterTitle} · ${s.sectionTitle}\n${excerpt}`;
    })
    .join("\n\n");
}

/** 계산된 재무 수치를 슬라이드에 그대로 쓸 수 있는 형태로 */
export function deckFinancialMetrics(allAnswers: Record<string, Record<string, unknown>>): DeckSlide["metrics"] {
  const { inputs } = collectFinancialInputs(allAnswers);
  const r = calculateFinancials(inputs);
  const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
  const out: NonNullable<DeckSlide["metrics"]> = [];
  if (r.unit) {
    out.push({ label: "건당 공헌이익", value: won(r.unit.contributionMargin), note: `이익률 ${r.unit.contributionMarginPct}%` });
  }
  if (r.breakEven) {
    out.push({ label: "손익분기", value: `월 ${r.breakEven.units.toLocaleString("ko-KR")}건`, note: won(r.breakEven.revenue) });
  }
  if (r.yearTotal) {
    out.push({ label: "1년 매출", value: won(r.yearTotal.revenue), note: "12개월 합계" });
    out.push({
      label: "1년 영업손익",
      value: won(r.yearTotal.operatingProfit),
      note: r.breakEvenMonth ? `${r.breakEvenMonth}개월차 월 흑자` : "12개월 내 흑자 전환 없음",
    });
  }
  return out.length ? out : undefined;
}

export function blueprintForDeckInput(input: DeckBuildInput): ProposalBlueprint {
  let context: { stage?: string; fields?: Array<{ key?: string; value?: string; basis?: string }> } = {};
  try { context = JSON.parse(input.businessContext ?? "{}"); } catch { /* Older context can be plain text. */ }
  const fields = new Map((Array.isArray(context?.fields) ? context.fields : []).filter(field => field && typeof field.key === "string").map(field => [field.key, field]));
  const has = (key: string) => typeof fields.get(key)?.value === "string" && Boolean(fields.get(key)!.value!.trim());
  const evidence = {
    images: Boolean(input.assets?.length), pricing: has("price"),
    financials: input.businessContext ? ["price", "unitCost", "cost"].every(has) : Boolean(deckFinancialMetrics(input.allAnswers)?.length),
    actuals: context?.stage === "operating" && fields.get("sales")?.basis === "user" && has("sales"),
    ...input.presentation?.evidence,
  };
  return createProposalBlueprint({ ...input, options: {
    ...(context?.stage === "operating" ? { stage: "operating" as const } : context?.stage === "exploring" ? { stage: "idea" as const } : {}),
    ...input.presentation, evidence,
  } });
}

function normalize(raw: Record<string, unknown>, fallbackName: string, blueprint?: ProposalBlueprint, assets: DeckBuildInput["assets"] = []): DeckPlan | null {
  const slidesRaw = Array.isArray(raw.slides) ? raw.slides : null;
  if (!slidesRaw?.length) return null;
  if (blueprint && (slidesRaw.length !== blueprint.slots.length || slidesRaw.some((slide, index) => slide?.id !== blueprint.slots[index].id))) return null;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const slides: DeckSlide[] = [];
  for (const [index, item] of slidesRaw.slice(0, 16).entries()) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const title = text(s.title, 60);
    if (!title) continue;
    const slot = blueprint?.slots[index];
    if (slot && (typeof s.title !== "string" || s.title.length > 50 || s.title.split("\n").length > 2 || (Array.isArray(s.points) && s.points.length > 4) || (Array.isArray(s.metrics) && s.metrics.length > 4))) return null;
    if (slot) {
      const within = (value: unknown, max: number) => value == null || (typeof value === "string" && value.length <= max);
      if (!within(s.lead, 100) || !within(s.note, 160)) return null;
      const detailLimit = slot.layout === "summary" ? 40 : Array.isArray(s.points) && s.points.length === 4 ? 60 : 90;
      if (Array.isArray(s.points) && !s.points.every(point => point && within(point.label, 20) && within(point.detail, detailLimit))) return null;
      if (Array.isArray(s.metrics) && !s.metrics.every(metric => metric && within(metric.label, 24) && within(metric.value, 30) && within(metric.note, 40))) return null;
      if (Array.isArray(s.sourceSections) && s.sourceSections.length > 4) return null;
    }
    let table: DeckSlide["table"];
    if (slot && s.table != null) {
      const rawTable = s.table as Record<string, unknown>;
      if (!Array.isArray(rawTable.headers) || rawTable.headers.length < 2 || rawTable.headers.length > 4 || !rawTable.headers.every(v => typeof v === "string" && v.length <= 12)) return null;
      const columns = rawTable.headers.length;
      if (!Array.isArray(rawTable.rows) || rawTable.rows.length < 1 || rawTable.rows.length > 5 || !rawTable.rows.every(row => Array.isArray(row) && row.length === columns && row.every(v => typeof v === "string" && v.length <= 160))) return null;
      const rowHeight = Math.min(.8, 3.2 / rawTable.rows.length);
      const lines = Math.max(1, Math.floor((rowHeight * 72 - 13) / (13 * 1.2)));
      const maxCellChars = Math.floor((11.89 / columns * 72 - 23) / 13 * lines * .9);
      if (!rawTable.rows.every(row => row.every((cell: string) => cell.length <= maxCellChars))) return null;
      table = { headers: rawTable.headers as string[], rows: rawTable.rows as string[][] };
    }
    const imageId = typeof s.imageId === "string" ? s.imageId : (s.image as DeckSlide["image"])?.id;
    const approvedImage = imageId ? assets.find(asset => asset.id === imageId && /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(asset.data) && asset.data.length <= 4_000_000) : undefined;
    if (slot && imageId && !approvedImage) return null;
    const points = Array.isArray(s.points)
      ? s.points
          .slice(0, 4)
          .map((p) => {
            const o = (p ?? {}) as Record<string, unknown>;
            return { label: text(o.label, 30), detail: text(o.detail, 120) };
          })
          .filter((p) => p.label || p.detail)
      : undefined;
    const metrics = Array.isArray(s.metrics)
      ? s.metrics
          .slice(0, 4)
          .map((m) => {
            const o = (m ?? {}) as Record<string, unknown>;
            return { label: text(o.label, 24), value: text(o.value, 30), note: text(o.note, 40) || undefined };
          })
          .filter((m) => m.label && m.value)
      : undefined;
    const kindRaw = text(s.kind, 12);
    if (slot && slot.role !== "cover" && !text(s.lead, 140) && !points?.length && !metrics?.length && !table?.rows.length) return null;
    slides.push({
      ...(slot ? { id: slot.id, composition: { role: slot.role, layout: slot.layout, treatment: slot.treatment, missingEvidence: slot.missingEvidence }, ...(table ? { table } : {}), ...(approvedImage ? { image: approvedImage } : {}) } : {}),
      kind: kindRaw === "statement" || kindRaw === "vision" ? kindRaw : undefined,
      eyebrow: text(s.eyebrow, 24) || "SECTION",
      title,
      lead: text(s.lead, 140) || undefined,
      points: points?.length ? points : undefined,
      metrics: metrics?.length ? metrics : undefined,
      note: text(s.note, 160) || undefined,
      sourceSections: Array.isArray(s.sourceSections) ? s.sourceSections.filter((v): v is string => typeof v === "string").slice(0, 4) : undefined,
    });
  }
  if (!slides.length) return null;
  return {
    ...(blueprint ? { blueprint } : {}),
    brandName: text(raw.brandName, 60) || fallbackName,
    slogan: text(raw.slogan, 60),
    slides,
  };
}

export function normalizeProposalReplacements(deck: DeckPlan, slides: DeckSlide[]): DeckSlide[] | null {
  if (!deck.blueprint) return null;
  const ids = new Set(slides.map(slide => slide.id));
  const slots = deck.blueprint.slots.filter(slot => ids.has(slot.id));
  if (slots.length !== slides.length) return null;
  const ordered = slots.map(slot => slides.find(slide => slide.id === slot.id)!);
  return normalize({ slides: ordered }, deck.brandName, { ...deck.blueprint, slots })?.slides ?? null;
}

function deckReviewJson(plan: DeckPlan): string {
  // Source assets and deterministic layout rules do not belong in a paid text-review request.
  return JSON.stringify({ brandName: plan.brandName, slogan: plan.slogan, slides: plan.slides.map(({ composition: _composition, image, ...slide }) => ({ ...slide, ...(image ? { imageId: image.id } : {}) })) });
}

/**
 * 완성한 계획서로 슬라이드 구성을 만든다.
 * 키가 없거나 응답이 형식을 벗어나면 null — 호출부가 이유를 사용자에게 알린다.
 */
export async function buildDeckPlan(
  config: LLMConfig | null,
  input: DeckBuildInput,
  onEvent?: (event: DeckBuildEvent) => void | Promise<void>,
  checkpoint?: { draft?: DeckPlan; saveDraft: (draft: DeckPlan) => Promise<void> },
): Promise<DeckPlan | null> {
  if (!config) { await onEvent?.({ stage: "failed", attempt: 0, code: "ai_unavailable" }); return null; }

  const financial = input.businessContext ? undefined : deckFinancialMetrics(input.allAnswers);
  // Persisted v1 checkpoints keep their old shape. New jobs must follow the v2 storyboard.
  const blueprint = checkpoint?.draft && !checkpoint.draft.blueprint ? undefined : blueprintForDeckInput(input);
  const assets = input.assets ?? checkpoint?.draft?.slides.flatMap(slide => slide.image ? [slide.image] : []) ?? [];
  const normalizePlan = (raw: Record<string, unknown>) => normalize(raw, input.businessName, blueprint, assets);
  const sourceNames = new Set(input.sections.map(s => `${s.chapterTitle} · ${s.sectionTitle}`));
  const source = [
    `[사업]`,
    `이름: ${input.businessName}`,
    input.businessDescription ? `설명: ${input.businessDescription}` : "",
    input.planType ? `문서 유형: ${input.planType}` : "",
    "",
    `[계획서 본문]`,
    digestSections(input.sections, Math.min(6000, Math.max(200, Math.floor(32000 / Math.max(1, input.sections.length))))),
    input.businessContext ? `[공통 사업 정보와 계산값]\n${input.businessContext}\n실제 실적과 예상 목표를 구분하고 투자금 요청·시장 통계를 새로 만들지 마세요. design이 있으면 장기 구상과 startingPlan의 시작 범위를 구별하고 alternatives는 미선택 대안으로만 표시하세요. feasibility는 산술 검사이지 사업성 검증이 아닙니다. 최신 fields와 다른 가격이나 운영 범위를 새로 정하지 마세요.` : "",
    financial
      ? `\n[계산된 재무 수치 — 이 값만 사용하고 새로 만들지 마세요]\n${financial.map((m) => `- ${m.label}: ${m.value}${m.note ? ` (${m.note})` : ""}`).join("\n")}`
      : "",
    blueprint ? proposalBlueprintPrompt(blueprint) : "",
    assets.length ? `[사용 가능한 이미지]\n${assets.map(asset => `${asset.id}: ${asset.alt}`).join("\n")}` : "사용 가능한 이미지 없음. imageId를 생성하지 마세요.",
  ].filter(Boolean).join("\n");
  const user = [
    source,
    blueprint ? "본문에 위 편집 설계를 적용하세요. 표지와 다음 단계도 원문의 근거를 표기하세요." : `[서사 구성]\n${archetypeFor(input.planType)}`,
    "",
    blueprint ? `위 내용으로 정확히 ${blueprint.slots.length}장을 구성하세요. id를 추가·삭제·변경하지 마세요.` : "위 내용으로 8~10장짜리 사업 발표자료를 구성하세요.",
    "첫 장은 표지, 마지막 장은 요청·다음 단계로 하세요.",
    "재무 슬라이드에는 위에 준 계산 값을 metrics로 그대로 넣으세요.",
    "표지와 마지막 장을 포함한 모든 슬라이드의 sourceSections에는 실제로 참고한 계획서 항목을 '챕터명 · 항목명'으로 정확히 넣으세요. 제안과 목표의 표시를 요약하면서 삭제하지 마세요.",
    "",
    "다음 JSON 형식으로만 답하세요:",
    SHAPE_GUIDE,
  ]
    .filter(Boolean)
    .join("\n");

  // Retry malformed/truncated content once with shorter rows, preserving stable slide IDs.
  const attempts = [
    { maxOutputTokens: 8000, effort: "medium" as const, extra: "" },
    { maxOutputTokens: 12000, effort: "medium" as const, extra: "\n요청한 id와 장수는 유지하고, points·metrics와 표의 행을 슬라이드당 3개 이하로 간결하게 하세요." },
  ];
  for (const [index, a] of attempts.entries()) {
    const attempt = index + 1;
    await onEvent?.({ stage: index === 0 && checkpoint?.draft ? "reviewing" : "generating", attempt });
    let failure: string | undefined;
    const raw = index === 0 && checkpoint?.draft ? checkpoint.draft as unknown as Record<string, unknown> : await completeJson(config, {
      kind: "deck",
      system: SYSTEM_PROMPT,
      user: user + a.extra,
      maxOutputTokens: a.maxOutputTokens,
      effort: a.effort,
      timeoutMs: 120000,
      allowFallback: false,
      onFailure: event => { failure = event.code; },
    });
    if (!raw && failure && ["quota_exhausted", "timeout", "rate_limited", "unavailable"].includes(failure)) {
      await onEvent?.({ stage: "failed", attempt, code: `provider_${failure}` });
      return null;
    }
    let plan = raw ? normalizePlan(raw) : null;
    if (!plan || plan.slides.length < 8) {
      await onEvent?.({ stage: "failed", attempt, code: raw ? "invalid_slides" : failure === "output_limit" ? "generation_output_limit" : "generation_empty" });
      continue;
    }
    if (plan && plan.slides.length >= 8) {
      await checkpoint?.saveDraft(plan);
      {
        const checked = await reviewCoachSection(config, source, deckReviewJson(plan), "json", event => onEvent?.({ stage: event === "reviewing" || event === "repairing" ? event : "failed", attempt, ...(event === "reviewing" || event === "repairing" ? {} : { code: event }) }), async repaired => {
          const parsed = parseJsonObject(repaired);
          const draft = parsed ? normalizePlan(parsed) : null;
          if (draft && draft.slides.length >= 8 && draft.slides.every(slide => slide.sourceSections?.length && slide.sourceSections.every(name => sourceNames.has(name)))) await checkpoint?.saveDraft(draft);
        }, { compact: true, allowFallback: false });
        // Checkpoints remain unapproved until the final review and validation succeed.
        if (!checked) return null;
        await onEvent?.({ stage: "validating", attempt });
        const parsed = parseJsonObject(checked);
        plan = parsed ? normalizePlan(parsed) : null;
        if (!plan || plan.slides.length < 8 || plan.slides.some(s => !s.sourceSections?.length || s.sourceSections.some(name => !sourceNames.has(name)))) {
          await onEvent?.({ stage: "failed", attempt, code: !plan ? "review_json_invalid" : "source_validation_failed" });
          continue;
        }
      }
      await onEvent?.({ stage: "ready", attempt });
      return plan;
    }
  }
  return null;
}
