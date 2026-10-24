import { z } from "zod";
import { ANALYSIS_VERSION, analysisPayloadSchema, analysisResultSchema, analysisSelectionSchema, analysisTargetSchema, chosenActionSchema } from "./operating-analysis-contract";

export const OPERATING_KEY = "__business_operations";
export const METRICS = [
  { key: "inquiries", label: "문의", unit: "건" },
  { key: "orders", label: "주문", unit: "건" },
  { key: "revenue", label: "매출", unit: "원" },
  { key: "expenses", label: "지출", unit: "원" },
] as const;
export type MetricKey = typeof METRICS[number]["key"];
/*
 * 칸마다 한국어 안내를 붙인다 — 예전엔 13자리 금액을 넣으면 zod 원문 "Too big: expected number to be <=1000000000000"이
 * 기록 칸 위에 그대로 떴다(감사 r36). 화면은 이 안내와 칸 위치(issue.path)로 해당 칸에 바로 데려간다.
 */
const count = z.number({ error: "건수는 숫자로 적어 주세요" }).int("건수는 정수로 적어 주세요").min(0, "건수는 0 이상으로 적어 주세요").max(10_000_000, "건수는 1천만 건 이하로 적어 주세요").nullable();
const money = z.number({ error: "금액은 숫자로 적어 주세요" }).int("금액은 원 단위 정수로 적어 주세요").min(0, "금액은 0원 이상으로 적어 주세요").max(1_000_000_000_000, "금액은 1조 원 이하로 적어 주세요").nullable();
const note = (label: string, max: number) => z.string({ error: `${label}을 다시 적어 주세요` }).trim().max(max, `${label}은 ${max.toLocaleString("ko-KR")}자 이하로 적어 주세요`);
const periodShape = {
  start: z.string({ error: "시작일을 골라 주세요" }).date("시작일을 다시 골라 주세요"), end: z.string({ error: "종료일을 골라 주세요" }).date("종료일을 다시 골라 주세요"),
  metrics: z.object({ inquiries: count, orders: count, revenue: money, expenses: money }).strict(),
  feedback: note("고객 반응", 3000), keep: note("유지할 점", 1500),
  change: note("바꿀 점", 1500), nextAction: note("다음 개선 행동", 1500),
  successCriterion: note("확인 기준", 1000),
};
/** 입력 확인 실패를 사람용 안내와 칸 이름으로 — 한국어가 아닌 원문(zod 기본 문구)은 내보내지 않는다 */
export function periodIssue(error: z.ZodError): { message: string; field: string | null } {
  const issue = error.issues[0];
  const message = issue?.message && /[가-힣]/.test(issue.message) ? issue.message : "입력 내용을 확인해 주세요.";
  const path = (issue?.path ?? []).map(String);
  const index = path.lastIndexOf("metrics");
  const field = index >= 0 ? path[index + 1] ?? null : ["start", "end", "feedback", "keep", "change", "nextAction", "successCriterion"].find(key => path.includes(key)) ?? null;
  /* 종료일·기간 길이 확인(refine)은 칸 이름이 없다 — 종료일 칸으로 */
  return { message, field: field ?? (issue?.code === "custom" ? "end" : null) };
}
export const periodInputSchema = z.object(periodShape).strict().refine(p => p.start <= p.end, "종료일은 시작일 이후여야 해요").refine(p => periodDays(p) <= 366, "한 기록은 최대 366일까지 저장할 수 있어요");
export type PeriodInput = z.infer<typeof periodInputSchema>;
const periodSchema = z.object({ ...periodShape, id: z.string().uuid(), revision: z.number().int().positive(), createdAt: z.string(), updatedAt: z.string() });
export type OperatingPeriod = z.infer<typeof periodSchema>;
export const periodReferenceSchema = z.object({ id: z.string().uuid(), revision: z.number().int().positive(), baselineId: z.string().uuid().nullable(), baselineRevision: z.number().int().positive().nullable() }).strict();
export type PeriodReference = z.infer<typeof periodReferenceSchema>;
export const operatingAnalysisSchema = z.object({
  id: z.string().uuid(), reference: periodReferenceSchema, period: periodSchema, baseline: periodSchema.nullable(),
  status: z.enum(["running", "ready", "failed"]), startedAt: z.string(), finishedAt: z.string().optional(),
  consent: z.object({ version: z.literal(ANALYSIS_VERSION), hash: z.string(), at: z.string(), selection: analysisSelectionSchema, target: analysisTargetSchema }),
  input: analysisPayloadSchema, result: analysisResultSchema.optional(), error: z.string().optional(),
  usage: z.object({ inputTokens: z.number(), outputTokens: z.number(), model: z.string() }).optional(),
});
export type OperatingAnalysis = z.infer<typeof operatingAnalysisSchema>;
const reportSchema = z.object({
  id: z.string().uuid(), createdAt: z.string(), businessTitle: z.string(),
  period: periodSchema, baseline: periodSchema.nullable(), source: z.enum(["user-records", "ai-assisted"]),
  analysis: operatingAnalysisSchema.optional(), chosenAction: chosenActionSchema.optional(),
});
export type OperatingReport = z.infer<typeof reportSchema>;
const stateSchema = z.object({ version: z.literal(1), revision: z.number().int().nonnegative(), periods: z.array(periodSchema).max(120), reports: z.array(reportSchema).max(240), analyses: z.array(operatingAnalysisSchema).max(60).default([]) });
export type OperatingState = z.infer<typeof stateSchema>;
export const operatingCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: z.string().uuid(), expectedRevision: z.number().int().positive().nullable(), input: periodInputSchema }).strict(),
  z.object({ action: z.literal("report"), id: z.string().uuid(), reference: periodReferenceSchema }).strict(),
  z.object({ action: z.literal("analysis-report"), id: z.string().uuid(), analysisId: z.string().uuid(), chosenAction: chosenActionSchema }).strict(),
]);
export type OperatingCommand = z.infer<typeof operatingCommandSchema>;
export class OperatingError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}
export function readOperatingState(answers: Record<string, unknown>): OperatingState {
  if (answers[OPERATING_KEY] === undefined) return { version: 1, revision: 0, periods: [], reports: [], analyses: [] };
  const parsed = stateSchema.safeParse(answers[OPERATING_KEY]);
  if (!parsed.success) throw new OperatingError("INVALID_STORED_RECORD", "저장된 운영 기록을 읽지 못했어요. 기존 데이터는 변경하지 않았어요.", 500);
  return parsed.data;
}
export function periodDays(period: { start: string; end: string }) {
  return Math.round((Date.parse(`${period.end}T00:00:00Z`) - Date.parse(`${period.start}T00:00:00Z`)) / 86400000) + 1;
}
export function previousPeriod(periods: OperatingPeriod[], current: OperatingPeriod) {
  return periods.filter(p => p.id !== current.id && p.end < current.start).sort((a, b) => b.end.localeCompare(a.end))[0] ?? null;
}
export function referenceFor(period: OperatingPeriod, baseline: OperatingPeriod | null): PeriodReference {
  return { id: period.id, revision: period.revision, baselineId: baseline?.id ?? null, baselineRevision: baseline?.revision ?? null };
}
export function resolvePeriodReference(state: OperatingState, ref: PeriodReference) {
  const period = state.periods.find(p => p.id === ref.id);
  if (!period) throw new OperatingError("PERIOD_NOT_FOUND", "이 기간 기록을 찾을 수 없어요.", 404);
  const baseline = previousPeriod(state.periods, period);
  if (JSON.stringify(referenceFor(period, baseline)) !== JSON.stringify(ref)) throw new OperatingError("PERIOD_CHANGED", "기록 또는 이전 기간이 바뀌었어요. 최신 내용을 확인한 뒤 다시 진행해 주세요.");
  return { period, baseline };
}
export function reportIsCurrent(state: OperatingState, report: OperatingReport) {
  try { resolvePeriodReference(state, referenceFor(report.period, report.baseline)); return true; }
  catch { return false; }
}
export function comparePeriods(period: OperatingPeriod, baseline: OperatingPeriod | null) {
  return METRICS.map(metric => {
    const current = period.metrics[metric.key], previous = baseline?.metrics[metric.key] ?? null;
    const delta = current !== null && previous !== null ? current - previous : null;
    return { ...metric, current, previous, delta, percent: delta !== null && previous !== 0 && previous !== null ? delta / previous * 100 : null };
  });
}
export function applyOperatingCommand(state: OperatingState, command: OperatingCommand, businessTitle: string, at: string): OperatingState {
  if (command.action === "save") {
    const old = state.periods.find(p => p.id === command.id);
    const same = old && JSON.stringify(periodInputSchema.parse(oldInput(old))) === JSON.stringify(command.input);
    if (old && same && (command.expectedRevision === null && old.revision === 1 || old.revision === command.expectedRevision || old.revision === (command.expectedRevision ?? 0) + 1)) return state;
    if ((old?.revision ?? null) !== command.expectedRevision) throw new OperatingError("PERIOD_CHANGED", "다른 탭에서 수정한 기록이 있어요. 입력 내용은 유지했어요. 최신 기록을 먼저 확인해 주세요.");
    if (!old && state.periods.length >= 120) throw new OperatingError("PERIOD_LIMIT", "이 사업에는 최대 120개 기간을 보관할 수 있어요.", 400);
    if (state.periods.some(p => p.id !== command.id && p.start <= command.input.end && p.end >= command.input.start)) throw new OperatingError("PERIOD_OVERLAP", "이미 기록한 기간과 겹쳐요. 해당 기록을 수정하거나 다른 기간을 선택해 주세요.", 400);
    if (!Object.values(command.input.metrics).some(v => v !== null) && !command.input.feedback) throw new OperatingError("EMPTY_PERIOD", "실적을 하나 이상 입력하거나 고객 반응을 기록해 주세요.", 400);
    const period: OperatingPeriod = { ...command.input, id: command.id, revision: (old?.revision ?? 0) + 1, createdAt: old?.createdAt ?? at, updatedAt: at };
    return { ...state, revision: state.revision + 1, periods: [...state.periods.filter(p => p.id !== period.id), period].sort((a, b) => b.start.localeCompare(a.start)) };
  }
  const existing = state.reports.find(r => r.id === command.id);
  if (command.action === "analysis-report") {
    if (existing) {
      if (existing.analysis?.id !== command.analysisId || JSON.stringify(existing.chosenAction) !== JSON.stringify(command.chosenAction)) throw new OperatingError("REPORT_ID_REUSED", "다른 리포트 요청과 겹쳤어요.");
      return state;
    }
    if (state.reports.length >= 240) throw new OperatingError("REPORT_LIMIT", "이 사업에는 최대 240개 리포트를 보관할 수 있어요.", 400);
    const analysis = state.analyses.find(a => a.id === command.analysisId);
    if (!analysis || analysis.status !== "ready" || !analysis.result?.actions[command.chosenAction.index]) throw new OperatingError("ANALYSIS_NOT_READY", "완성된 분석과 개선 행동을 선택해 주세요.", 400);
    resolvePeriodReference(state, analysis.reference);
    if (state.reports.some(r => r.analysis?.id === analysis.id && JSON.stringify(r.chosenAction) === JSON.stringify(command.chosenAction))) throw new OperatingError("REPORT_EXISTS", "같은 개선안으로 보관한 리포트가 이미 있어요.");
    const report: OperatingReport = { id: command.id, createdAt: at, businessTitle: analysis.input.businessTitle, period: structuredClone(analysis.period), baseline: structuredClone(analysis.baseline), source: "ai-assisted", analysis: structuredClone(analysis), chosenAction: { ...command.chosenAction } };
    return { ...state, revision: state.revision + 1, reports: [report, ...state.reports] };
  }
  if (existing) {
    if (existing.source !== "user-records" || JSON.stringify(referenceFor(existing.period, existing.baseline)) !== JSON.stringify(command.reference)) throw new OperatingError("REPORT_ID_REUSED", "다른 리포트 요청과 겹쳤어요. 화면을 다시 열어 주세요.");
    return state;
  }
  if (state.reports.length >= 240) throw new OperatingError("REPORT_LIMIT", "이 사업에는 최대 240개 리포트를 보관할 수 있어요.", 400);
  const { period, baseline } = resolvePeriodReference(state, command.reference);
  if (!period.nextAction || !period.successCriterion) throw new OperatingError("ACTION_REQUIRED", "다음 개선 행동과 확인 기준을 기록한 뒤 리포트를 보관해 주세요.", 400);
  const duplicate = state.reports.find(r => r.source === "user-records" && JSON.stringify(referenceFor(r.period, r.baseline)) === JSON.stringify(command.reference));
  if (duplicate) throw new OperatingError("REPORT_EXISTS", "같은 기록으로 보관한 리포트가 이미 있어요. 리포트 보관함에서 확인해 주세요.");
  const report: OperatingReport = { id: command.id, createdAt: at, businessTitle, source: "user-records", period: structuredClone(period), baseline: baseline ? structuredClone(baseline) : null };
  return { ...state, revision: state.revision + 1, reports: [report, ...state.reports] };
}
export function oldInput(period: OperatingPeriod): PeriodInput {
  return { start: period.start, end: period.end, metrics: { ...period.metrics }, feedback: period.feedback, keep: period.keep, change: period.change, nextAction: period.nextAction, successCriterion: period.successCriterion };
}
export function periodLabel(period: Pick<PeriodInput, "start" | "end">) { return `${period.start} ~ ${period.end}`; }
/**
 * 좁은 선택칸용 짧은 기간 — '2026-10-18 ~ 2026-10-24' → '10.18 ~ 10.24'(360px 에서 끝이 잘렸다 · 휴대폰 점검 2026-10-24).
 * 시작·끝 해가 다르거나 올해가 아니면 해를 붙인다('2025.12.29 ~ 2026.01.04').
 */
export function periodShortLabel(period: Pick<PeriodInput, "start" | "end">, thisYear = new Date().getFullYear()) {
  const parts = (value: string) => /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const a = parts(period.start), b = parts(period.end);
  if (!a || !b) return periodLabel(period);
  const withYear = a[1] !== b[1] || Number(a[1]) !== thisYear;
  const one = (m: RegExpExecArray) => withYear ? `${m[1]}.${m[2]}.${m[3]}` : `${m[2]}.${m[3]}`;
  return `${one(a)} ~ ${one(b)}`;
}
export function metricValue(value: number | null, unit: string) { return value === null ? "미입력" : `${value.toLocaleString("ko-KR")}${unit}`; }
export function reportMarkdown(report: OperatingReport) {
  const { period, baseline } = report;
  return [
    `# ${report.businessTitle} 운영 개선 리포트`, `기록 기간: ${periodLabel(period)} (${periodDays(period)}일)`,
    `비교 기간: ${baseline ? `${periodLabel(baseline)} (${periodDays(baseline)}일)` : "이전 기록 없음"}`,
    `보관 시각: ${report.createdAt}`, report.source === "ai-assisted" ? "사용자 입력, AI 가설, 사용자가 선택한 행동을 구분한 리포트입니다. 실적이나 원인 관계가 검증된 결과가 아닙니다." : "사용자 입력과 기간 비교를 보관한 기록입니다. AI 분석이나 실적 검증 결과가 아닙니다.",
    baseline && periodDays(period) !== periodDays(baseline) ? "주의: 기간 길이가 달라 단순 합계의 증감을 성과 개선으로 판단할 수 없습니다." : "",
    "## 기간 비교", ...comparePeriods(period, baseline).map(row => `- ${row.label}: ${metricValue(row.current, row.unit)} / 이전 ${metricValue(row.previous, row.unit)} / 차이 ${row.delta === null ? "비교 불가" : `${row.delta > 0 ? "+" : ""}${metricValue(row.delta, row.unit)}`}`),
    "## 고객 반응", period.feedback || "미입력", "## 유지할 점", period.keep || "미입력", "## 바꿀 점", period.change || "미입력",
    report.source === "ai-assisted" ? "## 입력 당시 개선 행동" : "## 다음 개선 행동", period.nextAction, "## 입력 당시 확인 기준", period.successCriterion,
    ...(report.analysis?.result ? [
      "## AI 분석", report.analysis.consent.target.provider === "mock" ? "로컬 모의 AI 결과: 실제 AI의 품질 검증이 아닙니다." : `${report.analysis.consent.target.provider} / ${report.analysis.consent.target.model}`,
      `분석 기준: ${report.analysis.consent.version}`, report.analysis.result.summary,
      "### 원인 가설", ...report.analysis.result.hypotheses.map(h => `${h.title}\n${h.explanation}\n불확실한 점: ${h.uncertainty}\n연결한 입력: ${h.evidenceIds.join(", ")}`),
      "### 분석에 사용한 입력", ...report.analysis.input.evidence.map(e => `- ${e.id} / ${e.basis === "user" ? "사용자 입력" : "계산"} / ${e.label}: ${e.value}`),
      "### AI가 제안한 행동", ...report.analysis.result.actions.map((a, i) => `${i + 1}. ${a.title}\n${a.action}\n확인 기준: ${a.successCriterion}`),
      "### 한계", ...report.analysis.result.limitations,
      "## 사용자가 선택하고 확인한 행동", report.chosenAction?.action ?? "", "### 선택한 행동의 확인 기준", report.chosenAction?.successCriterion ?? "",
    ] : []),
  ].filter(Boolean).join("\n\n");
}
