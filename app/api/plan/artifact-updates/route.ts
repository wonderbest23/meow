import { NextResponse } from "next/server";
import { z } from "zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import { enforceRateLimit } from "../../../../lib/rate-limit";
import { resolvePlanAccess } from "../../../../lib/plan-builder/access";
import { loadArtifactContext } from "../../../../lib/plan-builder/artifact-update-store";
import { artifactCommandSchema, artifactErrorMessage, publicArtifactUpdate, type ArtifactJobRequest } from "../../../../lib/plan-builder/artifact-updates";
import { applyHomepageArtifactUpdate, approveArtifactUpdate, artifactRuntime, cancelArtifactUpdate, listArtifactUpdates, previewArtifactUpdate, queueArtifactUpdate, readArtifactUpdate, reconcileArtifactUpdate, reserveArtifactUpdate, resumeArtifactUpdate } from "../../../../lib/plan-builder/artifact-update-service";
import { ProposalError } from "../../../../lib/plan-builder/proposal-editor";
import { checkLandingEditAccess, landingEditErrorResponse } from "../../../../lib/landing/plan-entitlement";
import { readBoundedJson, RequestBodyError } from "../../../../lib/http/bounded-json";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers });
const planIdSchema = z.string().min(1).max(60);
async function binding(): Promise<Pick<Workflow<ArtifactJobRequest>, "create" | "get"> | null> {
  if (process.env.PROPOSAL_AI_ENABLED !== "true") return null;
  try { return (await getCloudflareContext({ async: true })).env.PLAN_SECTIONS_WORKFLOW ?? null; } catch { return null; }
}
function failure(error: unknown) {
  if (error instanceof ProposalError) return json({ code: error.code, message: error.message }, error.status);
  return json({ code: "unavailable", message: artifactErrorMessage() }, 503);
}
function sameRequestOrigin(request: Request, origin: string) {
  try {
    const url = new URL(request.url);
    // Next may use its internal hostname while the browser addresses the Host header.
    const expected = new URL(`${url.protocol}//${request.headers.get("host") ?? url.host}`);
    return new URL(origin).origin === expected.origin && origin === expected.origin;
  } catch { return false; }
}
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams, parsed = planIdSchema.safeParse(query.get("planId"));
    if (!parsed.success) return json({ message: "사업을 선택해 주세요" }, 400);
    const identity = await requireGuestIdentity();
    if (!identity.userId) return json({ code: "login_required", message: "로그인 후 확인할 수 있어요" }, 401);
    await loadArtifactContext(identity.hash, parsed.data);
    if (query.get("preview") === "1") return json(await previewArtifactUpdate(identity.hash, parsed.data, await binding() ? artifactRuntime(identity.hash)?.target ?? null : null));
    const id = query.get("id");
    if (id) { const job = await readArtifactUpdate(identity.hash, parsed.data, id); return job ? json({ job: publicArtifactUpdate(await reconcileArtifactUpdate(job)) }) : json({ code: "not_found", message: "변경안을 찾을 수 없어요" }, 404); }
    const jobs = await listArtifactUpdates(identity.hash, parsed.data), views = [];
    for (const job of jobs) views.push(publicArtifactUpdate(await reconcileArtifactUpdate(job)));
    return json({ jobs: views });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  const limited = await enforceRateLimit("artifact-update", request, { limit: 45, windowMs: 60000 });
  if (limited) return limited;
  const origin = request.headers.get("origin");
  if (origin && !sameRequestOrigin(request, origin)) return json({ message: "같은 사이트에서 요청해 주세요" }, 403);
  let body: unknown;
  try { body = await readBoundedJson(request, 100000); }
  catch (error) { return error instanceof RequestBodyError ? json({ code: error.code, message: error.message }, error.status) : json({ message: "요청 형식을 확인해 주세요" }, 400); }
  const parsed = z.object({ planId: planIdSchema, command: artifactCommandSchema }).strict().safeParse(body);
  if (!parsed.success) return json({ message: "선택한 항목과 저장 버전을 확인해 주세요" }, 400);
  try {
    const { planId, command } = parsed.data, identity = await requireGuestIdentity();
    if (!identity.userId) return json({ code: "login_required", message: "로그인 후 이용할 수 있어요" }, 401);
    const { plan, site } = await loadArtifactContext(identity.hash, planId);
    if (command.type !== "homepage_apply" && command.type !== "cancel") {
      const access = await resolvePlanAccess(plan.planType, planId);
      if (!access.paid) return json({ code: "payment_required", message: "이 사업의 문서 이용 권한이 필요해요" }, 402);
    }
    if (command.type === "homepage_apply" || command.type === "approve" && command.homepage === "replace" || command.type === "generate" && command.includeHomepage) {
      if (!site) return json({ code: "homepage_missing", message: "연결된 홈페이지가 없어요" }, 409);
      const access = await checkLandingEditAccess(site.projectId, identity.hash, identity.userId, identity.email);
      if (access !== "ok") { const error = landingEditErrorResponse(access); return json(error.body, error.status); }
    }
    if (command.type === "homepage_apply") {
      const job = await applyHomepageArtifactUpdate(identity.hash, planId, command);
      return json({ job: publicArtifactUpdate(job), site: (await loadArtifactContext(identity.hash, planId)).site });
    }
    if (command.type === "approve") return json({ job: publicArtifactUpdate(await approveArtifactUpdate(identity.hash, planId, command)) });
    if (command.type === "cancel") return json({ job: publicArtifactUpdate(await cancelArtifactUpdate(identity.hash, planId, command)) });
    const workflow = await binding(), ai = workflow ? artifactRuntime(identity.hash) : null;
    const job = command.type === "generate" ? await reserveArtifactUpdate(identity.hash, planId, command, ai) : await resumeArtifactUpdate(identity.hash, planId, command, ai);
    return json({ job: publicArtifactUpdate(await queueArtifactUpdate(job, workflow)) }, 202);
  } catch (error) { return failure(error); }
}
