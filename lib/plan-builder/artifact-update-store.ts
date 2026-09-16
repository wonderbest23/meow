import { getServerSupabase } from "../persistence";
import { findProjectIdByPlan } from "../project-repository";
import { getLandingForProject } from "../landing/repository";
import type { LandingDraft, LandingSiteRecord } from "../landing/domain";
import { loadPlanState, type ServerPlan } from "./plan-server-store";
import { ProposalError } from "./proposal-editor";
import { artifactDigest } from "./artifact-update-source";
import type { ArtifactUpdate } from "./artifact-updates";

declare global { var __oneulArtifactUpdateStore: Map<string, ArtifactUpdate> | undefined; }
const memory = globalThis.__oneulArtifactUpdateStore ?? (globalThis.__oneulArtifactUpdateStore = new Map());
const key = (owner: string, plan: string, id: string) => `${owner}:${plan}:${id}`;
export async function loadArtifactContext(owner: string, planId: string) {
  const state = await loadPlanState(owner), plan = state.plans.find(item => item.id === planId);
  if (!plan) throw new ProposalError("not_found", "이 사업을 찾을 수 없어요", 404);
  const projectId = await findProjectIdByPlan(planId, owner);
  return { plan, site: projectId ? await getLandingForProject(projectId, owner) : null };
}
export async function listArtifactUpdates(owner: string, planId: string): Promise<ArtifactUpdate[]> {
  const db = getServerSupabase();
  if (!db) return structuredClone([...memory.values()].filter(item => item.ownerHash === owner && item.planId === planId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  const { data, error } = await db.from("plan_artifact_updates").select("data").eq("owner_hash", owner).eq("plan_id", planId).order("created_at", { ascending: false }).limit(30);
  if (error) throw new ProposalError("storage_unavailable", "연동 작업 저장소를 준비하지 못했어요", 503);
  return data.map(row => row.data as ArtifactUpdate);
}
export async function readArtifactUpdate(owner: string, planId: string, id: string): Promise<ArtifactUpdate | null> {
  const db = getServerSupabase();
  if (!db) return structuredClone(memory.get(key(owner, planId, id)) ?? null);
  const { data, error } = await db.from("plan_artifact_updates").select("data").eq("owner_hash", owner).eq("plan_id", planId).eq("id", id).maybeSingle();
  if (error) throw new ProposalError("storage_unavailable", "변경안을 불러오지 못했어요", 503);
  return data?.data as ArtifactUpdate | null ?? null;
}
type Commit = { beforePlan?: ServerPlan; nextPlan?: ServerPlan; site?: LandingSiteRecord; draft?: LandingDraft };

/** Production commits the job, selected plan, and homepage draft in one transaction. */
export async function writeArtifactUpdate(job: ArtifactUpdate, expectedRevision: number, commit: Commit = {}): Promise<ArtifactUpdate> {
  const db = getServerSupabase();
  if (db) {
    const { data, error } = await db.rpc("commit_artifact_update", { p_owner_hash: job.ownerHash, p_plan_id: job.planId, p_id: job.id,
      p_expected_revision: expectedRevision, p_data: job, p_expected_plan: commit.beforePlan ?? null, p_next_plan: commit.nextPlan ?? null,
      p_site_id: commit.site?.id ?? null, p_site_at: commit.site?.updatedAt ?? null, p_draft: commit.draft ?? null });
    if (error?.message === "ARTIFACT_CONCURRENCY_LIMIT") throw new ProposalError("limit_reached", "연동 요청 한도에 도달했어요", 429);
    if (error?.message === "ARTIFACT_REVIEW_PENDING") throw new ProposalError("review_pending", "진행 중인 변경안을 먼저 확인해 주세요");
    if (error) throw new ProposalError("storage_unavailable", "변경안을 저장하지 못했어요. 기존 결과물은 유지됩니다", 503);
    if (data !== "saved") throw new ProposalError(String(data), data === "limit_reached" ? "연동 요청 한도에 도달했어요" : "원문이나 작업 상태가 바뀌었어요. 최신 내용을 확인해 주세요", data === "limit_reached" ? 429 : 409);
    return job;
  }
  // No await between validation and writes: demo transactions share the existing in-process stores.
  const planStore = globalThis.__oneulPlanDemoStore, siteStore = globalThis.__ventureLandingStore;
  if (planStore?.claims.has(job.ownerHash)) throw new ProposalError("owner_changed", "로그인한 계정에서 다시 열어 주세요");
  const state = planStore?.plans.get(job.ownerHash), plan = state?.plans.find(item => item.id === job.planId);
  if (!plan || commit.beforePlan && artifactDigest(plan) !== artifactDigest(commit.beforePlan)) throw new ProposalError("source_changed", "원문이 바뀌었어요");
  const previous = memory.get(key(job.ownerHash, job.planId, job.id));
  if ((previous?.revision ?? 0) !== expectedRevision) throw new ProposalError("revision_conflict", "작업 상태가 바뀌었어요");
  if (previous && !["queued", "running"].includes(previous.status) && ["queued", "running"].includes(job.status)) {
    const otherJobs = [...memory.values()].filter(item => item.ownerHash === job.ownerHash && item.id !== job.id);
    if (otherJobs.some(item => item.planId === job.planId && ["queued", "running", "ready"].includes(item.status))) throw new ProposalError("review_pending", "진행 중인 변경안을 먼저 확인해 주세요");
    if (otherJobs.filter(item => ["queued", "running"].includes(item.status)).length >= 2) throw new ProposalError("limit_reached", "연동 요청 한도에 도달했어요", 429);
  }
  if (!previous) {
    const history = [...memory.values()].filter(item => item.ownerHash === job.ownerHash && item.planId === job.planId);
    const ownerJobs = [...memory.values()].filter(item => item.ownerHash === job.ownerHash);
    if (ownerJobs.filter(item => ["queued", "running"].includes(item.status)).length >= 2 || ownerJobs.filter(item => Date.now() - Date.parse(item.createdAt) < 86400000).length >= 12) throw new ProposalError("limit_reached", "연동 요청 한도에 도달했어요", 429);
    if (history.some(item => ["queued", "running", "ready"].includes(item.status))) throw new ProposalError("review_pending", "진행 중인 변경안을 먼저 확인해 주세요");
    if (history.length >= 30 || history.filter(item => Date.now() - Date.parse(item.createdAt) < 86400000).length >= 6) throw new ProposalError("limit_reached", "연동 요청 한도에 도달했어요", 429);
  }
  const site = commit.site ? siteStore?.sites.get(commit.site.id) : null;
  if (commit.site && (!site || site.updatedAt !== commit.site.updatedAt)) throw new ProposalError("source_changed", "홈페이지 초안이 바뀌었어요");
  const nextPlan = commit.nextPlan ? structuredClone(commit.nextPlan) : null, nextDraft = commit.draft ? structuredClone(commit.draft) : null, nextJob = structuredClone(job);
  if (nextPlan) state!.plans[state!.plans.findIndex(item => item.id === job.planId)] = nextPlan;
  if (nextDraft && site) { site.draft = nextDraft; site.updatedAt = new Date(Math.max(Date.now(), Date.parse(site.updatedAt) + 1)).toISOString(); }
  memory.set(key(job.ownerHash, job.planId, job.id), nextJob);
  return structuredClone(job);
}
