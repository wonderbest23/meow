import "server-only";
import { withUsageContext } from "../llm/usage-context";
import { sweepDueLeadNotifications } from "../landing/lead-notifications";
import { runWeeklyReportsNow } from "../landing/weekly-report-runner";
import { pollAutoRegistrations } from "../landing/domain-registrar";
import { runTaxRemindersNow } from "../operations/tax-reminders";
import { PLAN_BLUEPRINT } from "./blueprint";
import { generateSection } from "./section-generator";
import { buildSectionOutline, OUTLINE_MAX_CHARS } from "./section-outline";
import { renderPlanMarkdown } from "./markdown";
import { resolveLLMConfig, resolvePlanningLLMConfig } from "../llm/config";
import { readCoach, coachContext, coachDocumentRevision, type CoachState } from "./coach";
import type { ServerPlan } from "./plan-server-store";
import { confirmedIntakeContext } from "./intake-context";
import { loadPlanState, savePlanState } from "./plan-server-store";
import { generateAndSaveCoach } from "./coach-job";
import { generateAndSaveDeck } from "./deck-job";
import { collectFinancialInputs, calculateFinancials, financialsToMarkdown, financialsToReference, projectYears, yearsToMarkdown } from "./financials";
import { financialTableOwner, needsMultiYear, chaptersForType } from "./blueprint";
import { findConsistencyIssues, issuesForSection } from "./consistency";
import { loadPlanEvidence, evidenceForSection, toPromptEvidence, sectionUsesEvidence } from "./market-research";
import { buildPlanBusinessContext } from "./context/build";
import { contextForSection, type SectionBusinessContext } from "./context/section";
import { ANALYSIS_KEY } from "./analyzer/domain";
import { resolveRegenQuota, recordRegen } from "./regen-quota";
import { executeProposalUpdate, proposalBackgroundJobSchema } from "./proposal-background";
import { executeArtifactChunk } from "./artifact-update-service";
import { z } from "zod";
import { documentOperatingContext } from "./document-editorial";
import { runIntakeJobWithBudget } from "./intake-execution.server";
import { betaApiBoundary } from "../staging/beta-boundary";

import { verifyBody } from "./section-signature";
import { PLAN_SECTION_INTERNAL_PATH, PLAN_SECTION_API_PATH, type PlanSectionJob, type PlanOutlineJob } from "./section-protocol";
import { intakeScenarioInputs, planFinancialReference, readIntake } from "./intake-core";
export type { PlanSectionJob, PlanOutlineJob } from "./section-protocol";
export { callPlanSectionService, callPlanOutlineService, callCoachService, callDeckService, callProposalUpdateService, callArtifactChunkService, callIntakeService } from "./section-transport";

/**
 * 진단(intake) 계획의 12개월 손익표. 질문 화면·요약·AI 사업안과 같은 입력(실적 기준 판매량 포함)을 쓰고,
 * 손익표를 두는 섹션에만 붙인다. 가격·변동비·고정비·판매량 중 하나라도 없으면 표를 만들지 않는다(추정치 금지).
 */
export function intakeFinancialTable(plan: Pick<ServerPlan, "planType" | "answers">, coach: CoachState, key: string): string | undefined {
  if (key !== financialTableOwner(plan.planType)) return undefined;
  const intake = readIntake(plan.answers);
  const scenario = intake ? intakeScenarioInputs(coach, intake) : null;
  if (!scenario || "missing" in scenario || !scenario.volume) return undefined;
  const result = calculateFinancials({ unitPrice: scenario.unitPrice, unitVariableCost: scenario.unitVariableCost, monthlyFixedCost: scenario.monthlyFixedCost, startingVolume: scenario.volume, monthlyGrowthPct: 0 });
  const table = financialsToMarkdown(result, { growthLabel: null, growthPct: 0 });
  // 판매량의 출처(실적 기준인지, 처리량 최대치인지)를 표 아래에 그대로 밝힌다.
  return scenario.notes.length ? `${table}\n\n판매량 기준: ${scenario.notes.join(" / ")}` : table;
}

/* 섹션을 최대 4개씩 동시에 저장하므로 충돌이 늘어난다(section-workflow.ts) */
const COMMIT_ATTEMPTS = 8;

/** 문서 설계도 — 저장하지 않고 워크플로에 돌려준다(워크플로가 단계 결과로 보관) */
export async function generatePlanOutline(job: PlanOutlineJob): Promise<{ ok: boolean; outline?: string }> {
  const state = await loadPlanState(job.ownerHash);
  const plan = state.plans.find((item) => item.id === job.planId);
  if (!plan) return { ok: false };
  const coach = readCoach(plan.answers);
  const config = coach ? resolvePlanningLLMConfig(job.ownerHash) : resolveLLMConfig(job.ownerHash, "anthropic");
  if (!config) return { ok: false };
  const context = coach ? coachContext(coach, planFinancialReference(coach, plan.answers)) : JSON.stringify(state.business ?? {});
  const outline = await buildSectionOutline(config, { planTitle: plan.title, planType: plan.planType, context, keys: job.sections.map(s => `${s.chapterId}/${s.sectionId}`) });
  return outline ? { ok: true, outline } : { ok: false };
}

export async function generateAndSaveSection(job: PlanSectionJob): Promise<{ ok: boolean; skipped?: string }> {
  const state = await loadPlanState(job.ownerHash);
  const plan = state.plans.find((item) => item.id === job.planId);
  if (!plan) return { ok: false, skipped: "PLAN_NOT_FOUND" };

  const chapter = PLAN_BLUEPRINT.find((item) => item.id === job.chapterId);
  const section = chapter?.sections.find((item) => item.id === job.sectionId);
  if (!chapter || !section) return { ok: false, skipped: "SECTION_UNKNOWN" };

  const key = `${chapter.id}/${section.id}`;
  const existing = plan.sections[key];
  if (existing?.edited || existing?.locked) return { ok: true, skipped: "USER_EDITED" };
  const initialCoach = readCoach(plan.answers);
  if (!initialCoach && existing?.markdown) return { ok: true, skipped: "ALREADY_GENERATED" };
  if (initialCoach && !chaptersForType(plan.planType).some(c => c.id === job.chapterId && c.sections.some(s => s.id === job.sectionId))) throw new Error("SECTION_OUT_OF_SCOPE");
  const revision = initialCoach ? coachDocumentRevision(initialCoach) : undefined;
  if (existing && revision != null && existing.coachRevision === revision) return { ok: true, skipped: "ALREADY_GENERATED" };
  if (existing && revision != null && (await resolveRegenQuota(plan.id)).remaining <= 0) throw new Error("REGEN_QUOTA_EXCEEDED");

  const answers = plan.answers[key];
  if (!answers || Object.keys(answers).length === 0) return { ok: true, skipped: "NO_ANSWERS" };

  // 재무 표는 한 섹션에만 싣고 나머지에는 요약만 넘긴다(문서에 같은 표가 반복되지 않도록)
  const FINANCIAL_SECTIONS = new Set([
    "financials/revenue",
    "financials/expenses",
    "financials/financing",
    "financials/staffing",
    "financials/assets",
    "market/products",
    "summary/executive",
  ]);
  let financialsMarkdown: string | undefined;
  let financialsReference: string | undefined;
  if (!initialCoach && FINANCIAL_SECTIONS.has(key)) {
    const { inputs, growthLabel, staffIncluded } = collectFinancialInputs(plan.answers);
    const result = calculateFinancials(inputs);
    if (result.unit || result.monthly.length) {
      if (key === financialTableOwner(plan.planType)) {
        financialsMarkdown = financialsToMarkdown(result, {
          growthLabel,
          growthPct: inputs.monthlyGrowthPct,
          staffIncluded,
          monthlyCapacity: inputs.monthlyCapacity,
        });
        if (needsMultiYear(plan.planType)) {
          const years = yearsToMarkdown(projectYears(inputs), { growthPct: inputs.monthlyGrowthPct, monthlyCapacity: inputs.monthlyCapacity });
          if (years) financialsMarkdown = `${financialsMarkdown}\n\n${years}`;
        }
      } else {
        financialsReference = financialsToReference(result);
      }
    }
  } else if (initialCoach) {
    financialsMarkdown = intakeFinancialTable(plan, initialCoach, key);
  }

  const all = findConsistencyIssues(plan.answers, state.business);
  const relevant = key === "summary/executive" ? all : issuesForSection(all, key);
  let conflicts = relevant.length ? relevant.map(({ title, detail }) => ({ title, detail })) : undefined;

  // AI 사업 분석 맥락 — 일반 생성 경로(app/api/plan/generate)와 같은 규칙
  let context: SectionBusinessContext | undefined;
  if (plan.answers[ANALYSIS_KEY]) {
    const ctx = buildPlanBusinessContext({ business: state.business, answers: plan.answers });
    context = contextForSection(key, ctx);
    if (ctx.conflicts.length) conflicts = [...(conflicts ?? []), ...ctx.conflicts];
  }

  // 앞 섹션 요약 — 뒤 섹션이 앞 내용을 이어받게 한다
  const priorSections = Object.entries(plan.sections)
    .filter(([sectionKey, value]) => sectionKey !== key && (!initialCoach || value.coachRevision === revision))
    .map(([, value]) => value.markdown);
  const priorSummary = priorSections.join("\n\n").slice(0, 4000) || undefined;
  const operatingContext = documentOperatingContext(plan.answers);

  // 공식 시장 근거 — 일반 생성 경로(app/api/plan/generate)와 같은 규칙으로 같은 섹션에만
  const evidence = sectionUsesEvidence(key)
    ? toPromptEvidence(evidenceForSection(key, await loadPlanEvidence(job.planId, job.ownerHash)))
    : [];

  const coach = readCoach(plan.answers);
  const config = coach ? resolvePlanningLLMConfig(job.ownerHash) : resolveLLMConfig(job.ownerHash, "anthropic");
  const { markdown, source } = await generateSection(config, {
    chapter,
    section,
    answers,
    planTitle: plan.title,
    planType: plan.planType,
    business: coach?.business ?? state.business,
    coachContext: coach ? coachContext(coach, planFinancialReference(coach, plan.answers)) : undefined,
    intakeContext: confirmedIntakeContext(plan.answers) || undefined,
    priorSummary,
    priorSections,
    operatingContext,
    financialsMarkdown,
    financialsReference,
    conflicts,
    evidence: evidence.length ? evidence : undefined,
    context,
    outline: job.outline,
  });

  /*
   * 실패했으면 저장하지 않고 던진다 — 워크플로가 다시 시도하고,
   * 끝내 안 되면 그 섹션만 실패로 남는다. 표를 본문인 척 저장하지 않는다.
   */
  if (source === "failed" || (coach && source !== "ai") || !markdown.trim()) throw new Error("SECTION_GENERATION_FAILED");

  let html = "";
  try {
    html = await renderPlanMarkdown(markdown);
  } catch {
    if (coach) throw new Error("SECTION_RENDER_FAILED");
    html = markdown.replace(/\n/g, "<br>");
  }

  // Retry only the commit, not the paid model call, when another tab or a sibling section saves meanwhile.
  for (let attempt = 0; attempt < COMMIT_ATTEMPTS; attempt++) {
    const fresh = await loadPlanState(job.ownerHash);
    const target = fresh.plans.find((item) => item.id === job.planId);
    if (!target) return { ok: false, skipped: "PLAN_NOT_FOUND" };
    const current = target.sections[key];
    const targetCoach = readCoach(target.answers);
    if (documentOperatingContext(target.answers) !== operatingContext) throw new Error("BUSINESS_CONTEXT_CHANGED");
    if (target.planType !== plan.planType || (targetCoach ? coachDocumentRevision(targetCoach) : undefined) !== revision) throw new Error("BUSINESS_CONTEXT_CHANGED");
    if (current?.edited || current?.locked) return { ok: true, skipped: "USER_EDITED" };
    if (current?.markdown && (!coach || current.coachRevision === coachDocumentRevision(coach))) return { ok: true, skipped: "ALREADY_GENERATED" };

    const updatedAt = target.updatedAt;
    const generatedAt = new Date(Math.max(Date.now(), Date.parse(updatedAt) + 1 || 0, Date.parse(current?.generatedAt ?? "") + 1 || 0)).toISOString();
    target.sections[key] = {
      markdown,
      html,
      generatedAt,
      ...(coach ? { coachRevision: coachDocumentRevision(coach) } : {}),
      ...(current ? { previous: { markdown: current.markdown, html: current.html } } : {}),
    };
    target.updatedAt = generatedAt;
    try {
      await savePlanState(job.ownerHash, fresh, { planId: target.id, coachRevision: targetCoach?.revision ?? 0, planUpdatedAt: updatedAt });
    } catch (error) {
      if (error instanceof Error && error.message === "PLAN_VERSION_CONFLICT" && attempt < COMMIT_ATTEMPTS - 1) { await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 250)); continue; }
      throw error;
    }
    if (existing && coach) await recordRegen(job.planId, job.ownerHash, key, true);
    return { ok: true };
  }
  throw new Error("PLAN_VERSION_CONFLICT");
}

/* 내부 작업 요청 — Workflow 가 서명해서 보낸다 */
const ownerId = z.string().min(1).max(128);
const planIdSchema = z.string().min(1).max(60);
const token = z.string().min(1).max(256);
const serviceRequestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("intake"), job: z.object({ ownerHash: ownerId, planId: planIdSchema, jobId: z.string().uuid() }).strict() }).strict(),
  z.object({ operation: z.literal("generateSection"), job: z.object({ ownerHash: ownerId, planId: planIdSchema, chapterId: z.string().min(1).max(128), sectionId: z.string().min(1).max(128), outline: z.string().max(OUTLINE_MAX_CHARS).optional() }).strict() }).strict(),
  z.object({ operation: z.literal("planOutline"), job: z.object({ ownerHash: ownerId, planId: planIdSchema, sections: z.array(z.object({ chapterId: z.string().min(1).max(128), sectionId: z.string().min(1).max(128) }).strict()).min(1).max(40) }).strict() }).strict(),
  z.object({ operation: z.literal("completeCoach"), job: z.object({ ownerHash: ownerId, planId: planIdSchema, token, operation: z.literal("coach").optional() }).strict() }).strict(),
  z.object({ operation: z.literal("completeDeck"), job: z.object({ ownerHash: ownerId, planId: planIdSchema, token, operation: z.literal("deck").optional() }).strict() }).strict(),
  z.object({ operation: z.literal("completeProposalUpdate"), job: proposalBackgroundJobSchema }).strict(),
  z.object({ operation: z.literal("artifactChunk"), job: z.object({ operation: z.literal("artifact_update"), ownerHash: ownerId, planId: planIdSchema, jobId: z.string().uuid(), index: z.number().int().min(0).max(79), attempt: z.number().int().min(0).max(2) }).strict() }).strict(),
  z.object({ operation: z.literal("sweepLeadNotifications"), job: z.object({}).strict() }).strict(),
]);

export async function handlePlanSectionServiceRequest(request: Request, env: { SUPABASE_SERVICE_ROLE_KEY?: string }) {
  const pathname = new URL(request.url).pathname;
  if (pathname !== PLAN_SECTION_INTERNAL_PATH && pathname !== PLAN_SECTION_API_PATH) return null;
  const betaBlocked = betaApiBoundary(request, process.env.INTAKE_BETA_SAFETY);
  if (betaBlocked) return betaBlocked;
  if (request.method !== "POST") return new Response(null, { status: 405 });
  const timestamp = request.headers.get("x-plan-timestamp") ?? "";
  const signature = request.headers.get("x-plan-signature") ?? "";
  const timestampNumber = Number(timestamp);
  const body = await request.text();
  const recent = /^\d+$/.test(timestamp) && Number.isFinite(timestampNumber) && Math.abs(Date.now() - timestampNumber) <= 60_000;
  const secret = env.SUPABASE_SERVICE_ROLE_KEY;
  const valid = !!secret && recent && await verifyBody(secret, timestamp, body, signature);
  if (!valid) return Response.json({ error: "NOT_FOUND" }, { status: 404 });
  let raw: unknown;
  try { raw = JSON.parse(body); } catch { return Response.json({ error: "INVALID_REQUEST" }, { status: 400 }); }
  const parsed = serviceRequestSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  const input = parsed.data;
  if (process.env.INTAKE_BETA_SAFETY === "1" && input.operation !== "intake" && input.operation !== "sweepLeadNotifications") return Response.json({ error: "BETA_SCOPE_RESTRICTED" }, { status: 403 });
  // 이 작업에서 부르는 AI 호출 기록에 사업(계획서)을 붙인다 — 사업별 비용 집계(lib/llm/usage-context.ts)
  const owner = input.job as { planId?: string; ownerHash?: string };
  return await withUsageContext({ planId: owner.planId, ownerHash: owner.ownerHash }, () => runServiceOperation(input));
}

async function runServiceOperation(input: z.infer<typeof serviceRequestSchema>) {
  try {
    switch (input.operation) {
      case "intake": return Response.json({ result: await runIntakeJobWithBudget(input.job) });
      case "generateSection": return Response.json({ result: await generateAndSaveSection(input.job) });
      case "planOutline": return Response.json({ result: await generatePlanOutline(input.job) });
      case "completeCoach": return Response.json({ result: await generateAndSaveCoach(input.job) });
      case "completeDeck": return Response.json({ result: await generateAndSaveDeck(input.job) });
      case "completeProposalUpdate": return Response.json({ result: await executeProposalUpdate(input.job) });
      case "sweepLeadNotifications": {
        // 같은 5분 예약 실행에서 주간 리포트도 몇 곳씩 보낸다 — 리포트가 실패해도 문의 알림 재시도는 그대로
        const leads = await sweepDueLeadNotifications();
        const weekly = await runWeeklyReportsNow().catch(() => ({ error: "WEEKLY_REPORT_FAILED" }));
        // 세금 신고 마감 문자 — 마감 7일·1일 전 9시 이후에만 일한다(그 밖에는 바로 돌아온다)
        const tax = await runTaxRemindersNow().catch(() => ({ error: "TAX_REMINDER_FAILED" }));
        // 도메인 자동 등록(.com) 진행 상태 확인 — 끝나면 등록 완료·연결·알림까지
        const domains = await pollAutoRegistrations().catch(() => ({ error: "DOMAIN_REGISTRAR_FAILED" }));
        return Response.json({ result: { ok: true, ...leads, weekly, tax, domains } });
      }
      case "artifactChunk": return Response.json({ result: await executeArtifactChunk(input.job.ownerHash, input.job.planId, input.job.jobId, input.job.index, input.job.attempt) });
    }
  } catch {
    return Response.json({ error: "PLAN_SECTION_FAILED" }, { status: 500 });
  }
}
