import { after } from "next/server";
import { createHash } from "node:crypto";
import { readBoundedJson, RequestBodyError } from "../http/bounded-json";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireGuestIdentity } from "../api-auth";
import { enforceRateLimit } from "../rate-limit";
import { resolvePlanningLLMConfig } from "../llm/config";
import { serverPersistenceMode } from "../persistence";
import { readCoach } from "./coach";
import { loadPlanState } from "./plan-server-store";
import { createIntake, IntakeError, intakeSnapshot, readIntake } from "./intake-core";
import { executeIntakeJob, expireStaleIntakeJob, intakeCommandSchema, saveIntakeCommand, updateIntakeJob } from "./intake-service";
import { intakeFeatureEnabled, type IntakeCommand, type IntakeJobRequest, type IntakePayload } from "./intake-types";
import { ksicPath, searchKsic, sectorForKsic } from "./ksic";

const json = (body: Partial<IntakePayload>, status = 200) => Response.json({ flowVersion: 2, enabled: intakeFeatureEnabled(), ...body }, { status, headers: { "Cache-Control": "private, no-store" } });
const ownerScope = (hash: string) => createHash("sha256").update(`intake-draft:${hash}`).digest("hex").slice(0, 32);
async function workflowBinding() { try { return (await getCloudflareContext({ async: true })).env.PLAN_SECTIONS_WORKFLOW ?? null; } catch { return null; } }

async function currentSnapshot(ownerHash: string, planId?: string | null) {
  const state = await loadPlanState(ownerHash);
  const plan = planId ? state.plans.find(item => item.id === planId) : state.plans.filter(item => readCoach(item.answers)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const coach = plan && readCoach(plan.answers);
  if (!plan || !coach) return null;
  const intake = readIntake(plan.answers) ?? createIntake(coach, coach.stage === "operating" ? "operating" : coach.stage === "exploring" ? "exploring" : "startup", plan.updatedAt);
  if (intake.job && ["queued", "running"].includes(intake.job.status) && Date.now() - Date.parse(intake.job.updatedAt) > 120_000) {
    const recovered = await expireStaleIntakeJob({ ownerHash, planId: plan.id, jobId: intake.job.id });
    if (recovered) return intakeSnapshot(recovered.plan, recovered.coach, recovered.intake);
  }
  return intakeSnapshot(plan, coach, intake);
}

export async function intakeGet(request: Request) {
  if (!intakeFeatureEnabled()) return json({ plan: null, code: "disabled", message: "새 사업 진단은 아직 공개 전이에요" }, 404);
  try {
    const identity = await requireGuestIdentity();
    const url = new URL(request.url);
    const search = url.searchParams.get("ksic");
    if (search !== null) {
      // 업종 이름 검색: 규칙 기반, 저장 없음, AI 0회. 6개까지.
      const candidates = searchKsic(search.slice(0, 80), { limit: 6, minLevel: 5 }).map(match => ({ code: match.entry.code, name: match.entry.name, path: ksicPath(match.entry.code), sector: sectorForKsic(match.entry.code) ?? "general" as const }));
      return json({ plan: null, ksicCandidates: candidates, authenticated: !!identity.userId, ownerScope: ownerScope(identity.hash) });
    }
    const plan = await currentSnapshot(identity.hash, url.searchParams.get("planId"));
    return json({ plan, authenticated: !!identity.userId, ownerScope: ownerScope(identity.hash) });
  } catch { return json({ code: "load_failed", message: "저장된 진단을 불러오지 못했어요. 새로 시작하지 말고 다시 불러와 주세요" }, 503); }
}

export async function dispatchIntakeJob(request: IntakeJobRequest) {
  const workflow = await workflowBinding();
  if (workflow && serverPersistenceMode() === "supabase") {
    const runId = `intake-${request.jobId}`;
    try { await workflow.create({ id: runId, params: { operation: "intake", ...request } }); }
    catch {
      try { await (await workflow.get(runId)).status(); }
      catch { return; }
    }
    await updateIntakeJob(request, (_plan, _coach, _intake, job) => { job.dispatched = true; }).catch(() => undefined);
  } else {
    // Local requests finish after persistence. No durable background promise is made here.
    after(async () => { await executeIntakeJob(request).catch(() => undefined); });
  }
}

export async function intakePost(request: Request, prepare: (request: Request) => Promise<Response>) {
  if (!intakeFeatureEnabled()) return json({ plan: null, code: "disabled", message: "새 사업 진단은 아직 공개 전이에요" }, 404);
  const limited = await enforceRateLimit("business-intake-save", request, { limit: 120, windowMs: 600_000 });
  if (limited) return json({ code: "rate_limited", message: "입력은 그대로 두고 잠시 후 저장해 주세요" }, 429);
  let body: unknown;
  try { body = await readBoundedJson(request, 48 * 1024); }
  catch (error) { return json({ code: error instanceof RequestBodyError ? error.code : "invalid_command", message: "입력 내용을 읽지 못했어요. 긴 메모는 나눠서 저장해 주세요" }, error instanceof RequestBodyError ? error.status : 400); }
  const parsed = intakeCommandSchema.safeParse(body);
  if (!parsed.success) return json({ code: "invalid_command", message: "입력 내용을 다시 확인해 주세요" }, 400);
  const command: IntakeCommand = parsed.data;
  try {
    const identity = await requireGuestIdentity();
    const scope = ownerScope(identity.hash);
    if (request.headers.has("x-business-intake-owner") && request.headers.get("x-business-intake-owner") !== scope) return json({ code: "owner_changed", message: "로그인 계정이 바뀌었어요. 임시 입력은 보관하고 현재 계정을 다시 확인해 주세요", ownerScope: scope }, 409);
    if (command.action === "prepare") {
      const forwarded = new Request(request.url, { method: "POST", headers: request.headers, body: JSON.stringify({ action: "prepare", planId: command.planId, revision: command.revision, requestId: command.requestId }) });
      const result = await prepare(forwarded);
      const payload = await result.json();
      return json({ plan: await currentSnapshot(identity.hash, command.planId), authenticated: !!identity.userId, ownerScope: scope,
        message: payload.message, login: payload.login, started: payload.started, paid: payload.paid }, result.status);
    }
    const needsAI = ["message", "extract", "extract-pending", "help", "design"].includes(command.action);
    const aiAvailable = needsAI && !!resolvePlanningLLMConfig(identity.hash);
    const aiLimited = needsAI && aiAvailable ? await enforceRateLimit("business-intake-ai", request, { key: identity.hash, limit: 24, windowMs: 600_000 }) : null;
    const result = await saveIntakeCommand(identity.hash, command, { aiAvailable, aiAllowed: !aiLimited });
    if (result.job) await dispatchIntakeJob({ ownerHash: identity.hash, planId: result.plan.id, jobId: result.job.id });
    return json({ plan: result.snapshot, authenticated: !!identity.userId, ownerScope: scope,
      ...(!aiAvailable && command.action === "message" && result.snapshot.intake.notes.some(note => note.status === "failed") ? { message: "원문은 저장했어요. 자동 정리는 나중에 다시 요청하거나 직접 항목에 입력할 수 있어요" } : {}) }, result.job ? 202 : 200);
  } catch (error) {
    if (error instanceof IntakeError) return json({ code: error.code, message: error.message }, error.status);
    const conflict = error instanceof Error && ["PLAN_VERSION_CONFLICT", "PLAN_OWNER_CHANGED"].includes(error.message);
    return json({ code: conflict ? "revision_conflict" : "save_failed", message: conflict ? "계정 또는 사업정보가 바뀌었어요. 입력은 보관한 뒤 최신 내용과 비교해 주세요" : "저장하지 못했어요. 입력한 내용은 그대로 두고 다시 시도해 주세요" }, conflict ? 409 : 503);
  }
}
