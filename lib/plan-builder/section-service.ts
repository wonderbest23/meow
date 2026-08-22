import { PLAN_BLUEPRINT } from "./blueprint";
import { generateSection } from "./section-generator";
import { renderPlanMarkdown } from "./markdown";
import { resolveLLMConfig } from "../llm/config";
import { loadPlanState, savePlanState } from "./plan-server-store";
import { collectFinancialInputs, calculateFinancials, financialsToMarkdown, financialsToReference, projectYears, yearsToMarkdown } from "./financials";
import { financialTableOwner, needsMultiYear } from "./blueprint";
import { findConsistencyIssues, issuesForSection } from "./consistency";
import { loadPlanEvidence, evidenceForSection, toPromptEvidence, sectionUsesEvidence } from "./market-research";

/*
 * 본문 생성을 서버 안에서 처리하기 위한 내부 통로.
 *
 * 워크플로는 Worker 런타임에서 도는데, Supabase·LLM 설정은 Next 앱 쪽
 * 환경에서만 제대로 읽힌다. 그래서 워크플로가 자기 워커로 되돌아 호출해
 * 여기서 실제 생성을 한다(draft-package가 쓰던 방식과 같다).
 *
 * 외부에서 부를 수 없도록 서비스 롤 키로 서명한 요청만 받는다.
 */

const internalPath = "/__internal/plan-section";

export interface PlanSectionJob {
  ownerHash: string;
  planId: string;
  chapterId: string;
  sectionId: string;
}

type ServiceRequest = { operation: "generateSection"; job: PlanSectionJob };

function encodeHex(value: ArrayBuffer) {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeHex(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signBody(secret: string, timestamp: string, body: string) {
  return encodeHex(await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(`${timestamp}.${body}`)));
}

async function verifyBody(secret: string, timestamp: string, body: string, signature: string) {
  const decoded = decodeHex(signature);
  if (!decoded) return false;
  return crypto.subtle.verify("HMAC", await hmacKey(secret), decoded, new TextEncoder().encode(`${timestamp}.${body}`));
}

export async function callPlanSectionService(service: Fetcher, secret: string, job: PlanSectionJob): Promise<{ ok: boolean }> {
  const body = JSON.stringify({ operation: "generateSection", job } satisfies ServiceRequest);
  const timestamp = Date.now().toString();
  const signature = await signBody(secret, timestamp, body);
  const response = await service.fetch(`https://plan-section.internal${internalPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-plan-timestamp": timestamp,
      "x-plan-signature": signature,
    },
    body,
  });
  const payload = (await response.json()) as { result?: { ok: boolean }; error?: string };
  if (!response.ok) throw new Error(payload.error || "PLAN_SECTION_SERVICE_FAILED");
  return payload.result ?? { ok: false };
}

/**
 * 한 섹션을 만들어 저장한다.
 *
 * 이미 만들어져 있거나 사용자가 직접 고친 섹션은 건드리지 않는다 —
 * 뒤늦게 도착한 생성이 사람이 쓴 글을 덮으면 안 된다.
 */
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
  if (FINANCIAL_SECTIONS.has(key)) {
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
  }

  const all = findConsistencyIssues(plan.answers, state.business);
  const relevant = key === "summary/executive" ? all : issuesForSection(all, key);
  const conflicts = relevant.length ? relevant.map(({ title, detail }) => ({ title, detail })) : undefined;

  // 앞 섹션 요약 — 뒤 섹션이 앞 내용을 이어받게 한다
  const priorSummary = Object.entries(plan.sections)
    .filter(([sectionKey]) => sectionKey !== key)
    .map(([, value]) => value.markdown)
    .join("\n\n")
    .slice(0, 4000) || undefined;

  // 공식 시장 근거 — 일반 생성 경로(app/api/plan/generate)와 같은 규칙으로 같은 섹션에만
  const evidence = sectionUsesEvidence(key)
    ? toPromptEvidence(evidenceForSection(key, await loadPlanEvidence(job.planId, job.ownerHash)))
    : [];

  const config = resolveLLMConfig(job.ownerHash, "anthropic");
  const { markdown, source } = await generateSection(config, {
    chapter,
    section,
    answers,
    planTitle: plan.title,
    planType: plan.planType,
    business: state.business,
    priorSummary,
    financialsMarkdown,
    financialsReference,
    conflicts,
    evidence: evidence.length ? evidence : undefined,
  });

  /*
   * 실패했으면 저장하지 않고 던진다 — 워크플로가 다시 시도하고,
   * 끝내 안 되면 그 섹션만 실패로 남는다. 표를 본문인 척 저장하지 않는다.
   */
  if (source === "failed" || !markdown.trim()) throw new Error("SECTION_GENERATION_FAILED");

  let html = "";
  try {
    html = await renderPlanMarkdown(markdown);
  } catch {
    html = markdown.replace(/\n/g, "<br>");
  }

  /*
   * 저장 직전에 상태를 다시 읽는다 — 생성하는 동안 사용자가 다른 섹션을
   * 저장했을 수 있고, 통째로 덮으면 그 변경이 사라진다.
   */
  const fresh = await loadPlanState(job.ownerHash);
  const target = fresh.plans.find((item) => item.id === job.planId);
  if (!target) return { ok: false, skipped: "PLAN_NOT_FOUND" };
  const current = target.sections[key];
  if (current?.edited || current?.locked) return { ok: true, skipped: "USER_EDITED" };

  target.sections[key] = {
    markdown,
    html,
    generatedAt: new Date().toISOString(),
    ...(current ? { previous: { markdown: current.markdown, html: current.html } } : {}),
  };
  target.updatedAt = new Date().toISOString();
  await savePlanState(job.ownerHash, fresh);
  return { ok: true };
}

export async function handlePlanSectionServiceRequest(request: Request, env: CloudflareEnv) {
  if (new URL(request.url).pathname !== internalPath) return null;
  if (request.method !== "POST") return new Response(null, { status: 405 });

  const timestamp = request.headers.get("x-plan-timestamp") ?? "";
  const signature = request.headers.get("x-plan-signature") ?? "";
  const timestampNumber = Number(timestamp);
  const body = await request.text();
  const recent = Number.isFinite(timestampNumber) && Math.abs(Date.now() - timestampNumber) <= 60_000;
  const valid = recent && (await verifyBody(env.SUPABASE_SERVICE_ROLE_KEY, timestamp, body, signature));
  // 서명이 맞지 않으면 이 경로가 있다는 사실 자체를 알리지 않는다
  if (!valid) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  try {
    const input = JSON.parse(body) as ServiceRequest;
    const result = await generateAndSaveSection(input.job);
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "PLAN_SECTION_FAILED" }, { status: 500 });
  }
}
