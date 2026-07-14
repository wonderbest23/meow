import { getServerSupabase, serverPersistenceMode } from "./persistence";
import type {
  ArtifactRecord,
  ProjectRecord,
  ProjectStageRecord,
  StageStatus,
} from "./service-domain";
import type { BusinessAssessment, BusinessSetup } from "./business/domain";
import type { BusinessPlanDocument } from "./business-plan/generator";
import type { MarketAnalysis, MarketWorkspace } from "./market/domain";
import type {
  OperationsAssessment,
  OperationsPackage,
  OperationsWorkspace,
} from "./operations/domain";
import type {
  ExecutionLoopAnalysis,
  ExecutionWorkspace,
} from "./execution-loop/domain";
import type { QualityAudit } from "./quality/domain";
import type { GrantAnalysis, GrantPackage, GrantWorkspace } from "./grants/domain";
import type { LaunchMissionWorkspace } from "./launch-missions/domain";
import type { GenerationJobRecord } from "./service-audit/domain";

type ProjectCreateInput = {
  opportunity: Record<string, unknown>;
  founderProfile: Record<string, unknown>;
  paymentStatus: "pending" | "test_paid" | "paid";
  packagePrice?: number;
  initialStageInputs?: Record<string, unknown>;
};

type DemoStore = Map<string, ProjectRecord & { guestTokenHash: string }>;

type DemoGenerationJob = GenerationJobRecord & { guestTokenHash: string; inputSnapshot: Record<string, unknown> };

declare global {
  var __ventureDnaDemoStore: DemoStore | undefined;
  var __ventureGenerationJobs: Map<string, DemoGenerationJob> | undefined;
}

const demoJobStore =
  globalThis.__ventureGenerationJobs ??
  (globalThis.__ventureGenerationJobs = new Map());

const demoStore =
  globalThis.__ventureDnaDemoStore ??
  (globalThis.__ventureDnaDemoStore = new Map());

function mapArtifact(row: Record<string, unknown>): ArtifactRecord {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    stageId: row.stage_id as string,
    stageIndex: row.stage_index as number,
    version: row.version as number,
    schemaVersion: row.schema_version as string,
    content: (row.content ?? {}) as Record<string, unknown>,
    explanations: (row.explanations ?? []) as string[],
    assumptions: (row.assumptions ?? []) as string[],
    sources: (row.sources ?? []) as ArtifactRecord["sources"],
    reviewStatus: row.review_status as ArtifactRecord["reviewStatus"],
    createdAt: row.created_at as string,
  };
}

function mapStage(
  row: Record<string, unknown>,
  artifacts: ArtifactRecord[],
): ProjectStageRecord {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    stageIndex: row.stage_index as number,
    status: row.status as StageStatus,
    inputs: (row.inputs ?? {}) as Record<string, unknown>,
    inputVersion: row.input_version as number,
    approvedArtifactId: (row.approved_artifact_id as string | null) ?? null,
    approvedAt: (row.approved_at as string | null) ?? null,
    artifacts: artifacts
      .filter((artifact) => artifact.stageId === row.id)
      .sort((a, b) => b.version - a.version),
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function persistenceMode() {
  return serverPersistenceMode();
}

export async function createProject(
  input: ProjectCreateInput,
  guestTokenHash: string,
  ownerId?: string | null,
): Promise<ProjectRecord> {
  const supabase = getServerSupabase();
  if (!supabase) {
    const now = new Date().toISOString();
    const projectId = crypto.randomUUID();
    const stages: ProjectStageRecord[] = Array.from({ length: 6 }, (_, stageIndex) => ({
      id: crypto.randomUUID(),
      projectId,
      stageIndex,
      status: stageIndex === 0
        ? input.initialStageInputs ? "ready_to_generate" : "collecting_input"
        : "not_started",
      inputs: stageIndex === 0 ? input.initialStageInputs ?? {} : {},
      inputVersion: 1,
      approvedArtifactId: null,
      approvedAt: null,
      artifacts: [],
    }));
    const project: ProjectRecord & { guestTokenHash: string } = {
      id: projectId,
      title: input.opportunity.title as string,
      status: "active",
      paymentStatus: input.paymentStatus,
      packagePrice: input.packagePrice ?? 990000,
      activeStage: 0,
      opportunity: input.opportunity,
      founderProfile: input.founderProfile,
      businessSetup: null,
      businessAssessment: null,
      marketWorkspace: null,
      marketAnalysis: null,
      businessPlan: null,
      operationsWorkspace: null,
      operationsAssessment: null,
      operationsPackage: null,
      executionWorkspace: null,
      executionAnalysis: null,
      grantWorkspace: null,
      grantAnalysis: null,
      grantPackage: null,
      launchMissionWorkspace: null,
      qualityAudit: null,
      stages,
      createdAt: now,
      updatedAt: now,
      guestTokenHash,
    };
    demoStore.set(projectId, project);
    return clone(project);
  }

  const { data: projectRow, error: projectError } = await supabase
    .from("projects")
    .insert({
      title: input.opportunity.title,
      opportunity: input.opportunity,
      founder_profile: input.founderProfile,
      payment_status: input.paymentStatus,
      package_price: input.packagePrice ?? 990000,
      guest_token_hash: guestTokenHash,
      owner_id: ownerId ?? null,
      status: "active",
    })
    .select()
    .single();
  if (projectError) throw projectError;

  const stageRows = Array.from({ length: 6 }, (_, stageIndex) => ({
    project_id: projectRow.id,
    stage_index: stageIndex,
    status: stageIndex === 0
      ? input.initialStageInputs ? "ready_to_generate" : "collecting_input"
      : "not_started",
    inputs: stageIndex === 0 ? input.initialStageInputs ?? {} : {},
  }));
  const { error: stageError } = await supabase.from("project_stages").insert(stageRows);
  if (stageError) throw stageError;
  const project = await getProject(projectRow.id, guestTokenHash);
  if (!project) throw new Error("생성한 프로젝트를 불러오지 못했습니다.");
  return project;
}

export async function getProject(
  projectId: string,
  guestTokenHash: string,
): Promise<ProjectRecord | null> {
  const supabase = getServerSupabase();
  if (!supabase) {
    const project = demoStore.get(projectId);
    if (!project || project.guestTokenHash !== guestTokenHash) return null;
    return clone(project);
  }

  const { data: projectRow, error } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("guest_token_hash", guestTokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!projectRow) return null;

  const [{ data: stageRows, error: stageError }, { data: artifactRows, error: artifactError }] =
    await Promise.all([
      supabase.from("project_stages").select("*").eq("project_id", projectId).order("stage_index"),
      supabase.from("stage_artifacts").select("*").eq("project_id", projectId).order("version", { ascending: false }),
    ]);
  if (stageError) throw stageError;
  if (artifactError) throw artifactError;
  const artifacts = (artifactRows ?? []).map((row) => mapArtifact(row));
  const projectMetadata = (projectRow.metadata ?? {}) as Record<string, unknown>;

  return {
    id: projectRow.id,
    title: projectRow.title,
    status: projectRow.status,
    paymentStatus: projectRow.payment_status,
    packagePrice: projectRow.package_price,
    activeStage: projectRow.active_stage,
    opportunity: projectRow.opportunity,
    founderProfile: projectRow.founder_profile,
    businessSetup: projectRow.business_setup ?? null,
    businessAssessment: projectRow.business_assessment ?? null,
    marketWorkspace: projectRow.market_workspace ?? null,
    marketAnalysis: projectRow.market_analysis ?? null,
    businessPlan: projectRow.business_plan ?? null,
    operationsWorkspace: projectRow.operations_workspace ?? null,
    operationsAssessment: projectRow.operations_assessment ?? null,
    operationsPackage: projectRow.operations_package ?? null,
    executionWorkspace: projectRow.execution_workspace ?? null,
    executionAnalysis: projectRow.execution_analysis ?? null,
    grantWorkspace: projectRow.grant_workspace ?? null,
    grantAnalysis: projectRow.grant_analysis ?? null,
    grantPackage: projectRow.grant_package ?? null,
    launchMissionWorkspace:
      projectRow.launch_mission_workspace ??
      projectMetadata.launchMissionWorkspace ??
      null,
    qualityAudit: projectRow.quality_audit ?? null,
    stages: (stageRows ?? []).map((row) => mapStage(row, artifacts)),
    createdAt: projectRow.created_at,
    updatedAt: projectRow.updated_at,
  };
}

export async function deleteProject(
  projectId: string,
  guestTokenHash: string,
): Promise<boolean> {
  const supabase = getServerSupabase();
  if (!supabase) {
    const project = demoStore.get(projectId);
    if (!project || project.guestTokenHash !== guestTokenHash) return false;
    return demoStore.delete(projectId);
  }

  const { data, error } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("guest_token_hash", guestTokenHash)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function saveLaunchMissionWorkspace(
  projectId: string,
  guestTokenHash: string,
  workspace: LaunchMissionWorkspace,
): Promise<ProjectRecord> {
  const supabase = getServerSupabase();
  const project = await getProject(projectId, guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");

  if (!supabase) {
    const stored = demoStore.get(projectId)!;
    stored.launchMissionWorkspace = clone(workspace);
    stored.updatedAt = new Date().toISOString();
    return clone(stored);
  }

  const { data: metadataRow, error: metadataError } = await supabase
    .from("projects")
    .select("metadata")
    .eq("id", projectId)
    .eq("guest_token_hash", guestTokenHash)
    .single();
  if (metadataError) throw metadataError;
  const metadata = (metadataRow.metadata ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("projects")
    .update({ metadata: { ...metadata, launchMissionWorkspace: workspace } })
    .eq("id", projectId)
    .eq("guest_token_hash", guestTokenHash);
  if (error) throw error;
  const updated = await getProject(projectId, guestTokenHash);
  if (!updated) throw new Error("PROJECT_NOT_FOUND");
  return updated;
}

export async function saveBusinessSetup(
  projectId: string,
  guestTokenHash: string,
  setup: BusinessSetup,
  assessment: BusinessAssessment,
): Promise<ProjectRecord> {
  const supabase = getServerSupabase();
  const project = await getProject(projectId, guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");

  if (!supabase) {
    const stored = demoStore.get(projectId)!;
    stored.businessSetup = clone(setup);
    stored.businessAssessment = clone(assessment);
    stored.businessPlan = null;
    stored.updatedAt = new Date().toISOString();
    return clone(stored);
  }

  const { error } = await supabase
    .from("projects")
    .update({
      business_setup: setup,
      business_assessment: assessment,
      business_plan: null,
    })
    .eq("id", projectId)
    .eq("guest_token_hash", guestTokenHash);
  if (error) throw error;
  const updated = await getProject(projectId, guestTokenHash);
  if (!updated) throw new Error("PROJECT_NOT_FOUND");
  return updated;
}

export async function saveMarketWorkspace(
  projectId: string,
  guestTokenHash: string,
  workspace: MarketWorkspace,
  analysis: MarketAnalysis,
): Promise<ProjectRecord> {
  const supabase = getServerSupabase();
  const project = await getProject(projectId, guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");

  if (!supabase) {
    const stored = demoStore.get(projectId)!;
    stored.marketWorkspace = clone(workspace);
    stored.marketAnalysis = clone(analysis);
    stored.businessPlan = null;
    stored.updatedAt = new Date().toISOString();
    return clone(stored);
  }

  const { error } = await supabase
    .from("projects")
    .update({
      market_workspace: workspace,
      market_analysis: analysis,
      business_plan: null,
    })
    .eq("id", projectId)
    .eq("guest_token_hash", guestTokenHash);
  if (error) throw error;
  const updated = await getProject(projectId, guestTokenHash);
  if (!updated) throw new Error("PROJECT_NOT_FOUND");
  return updated;
}

export async function saveBusinessPlan(
  projectId: string,
  guestTokenHash: string,
  plan: BusinessPlanDocument,
): Promise<ProjectRecord> {
  const supabase = getServerSupabase();
  const project = await getProject(projectId, guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");

  if (!supabase) {
    const stored = demoStore.get(projectId)!;
    stored.businessPlan = clone(plan);
    stored.updatedAt = new Date().toISOString();
    return clone(stored);
  }

  const { error } = await supabase
    .from("projects")
    .update({ business_plan: plan })
    .eq("id", projectId)
    .eq("guest_token_hash", guestTokenHash);
  if (error) throw error;
  const updated = await getProject(projectId, guestTokenHash);
  if (!updated) throw new Error("PROJECT_NOT_FOUND");
  return updated;
}

export async function saveOperationsWorkspace(
  projectId: string,
  guestTokenHash: string,
  workspace: OperationsWorkspace,
  assessment: OperationsAssessment,
  operationsPackage: OperationsPackage,
): Promise<ProjectRecord> {
  const supabase = getServerSupabase();
  const project = await getProject(projectId, guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");

  if (!supabase) {
    const stored = demoStore.get(projectId)!;
    stored.operationsWorkspace = clone(workspace);
    stored.operationsAssessment = clone(assessment);
    stored.operationsPackage = clone(operationsPackage);
    stored.updatedAt = new Date().toISOString();
    return clone(stored);
  }

  const { error } = await supabase
    .from("projects")
    .update({
      operations_workspace: workspace,
      operations_assessment: assessment,
      operations_package: operationsPackage,
    })
    .eq("id", projectId)
    .eq("guest_token_hash", guestTokenHash);
  if (error) throw error;
  const updated = await getProject(projectId, guestTokenHash);
  if (!updated) throw new Error("PROJECT_NOT_FOUND");
  return updated;
}

export async function saveExecutionLoop(
  projectId: string,
  guestTokenHash: string,
  workspace: ExecutionWorkspace,
  analysis: ExecutionLoopAnalysis,
): Promise<ProjectRecord> {
  const supabase = getServerSupabase();
  const project = await getProject(projectId, guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");

  if (!supabase) {
    const stored = demoStore.get(projectId)!;
    stored.executionWorkspace = clone(workspace);
    stored.executionAnalysis = clone(analysis);
    stored.updatedAt = new Date().toISOString();
    return clone(stored);
  }
  const { error } = await supabase
    .from("projects")
    .update({
      execution_workspace: workspace,
      execution_analysis: analysis,
    })
    .eq("id", projectId)
    .eq("guest_token_hash", guestTokenHash);
  if (error) throw error;
  const updated = await getProject(projectId, guestTokenHash);
  if (!updated) throw new Error("PROJECT_NOT_FOUND");
  return updated;
}

export async function saveGrantWorkspace(
  projectId: string,
  guestTokenHash: string,
  workspace: GrantWorkspace,
  analysis: GrantAnalysis,
  grantPackage: GrantPackage,
): Promise<ProjectRecord> {
  const supabase = getServerSupabase();
  const project = await getProject(projectId, guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");

  if (!supabase) {
    const stored = demoStore.get(projectId)!;
    stored.grantWorkspace = clone(workspace);
    stored.grantAnalysis = clone(analysis);
    stored.grantPackage = clone(grantPackage);
    stored.updatedAt = new Date().toISOString();
    return clone(stored);
  }

  const { error } = await supabase
    .from("projects")
    .update({
      grant_workspace: workspace,
      grant_analysis: analysis,
      grant_package: grantPackage,
    })
    .eq("id", projectId)
    .eq("guest_token_hash", guestTokenHash);
  if (error) throw error;
  const updated = await getProject(projectId, guestTokenHash);
  if (!updated) throw new Error("PROJECT_NOT_FOUND");
  return updated;
}

export async function saveQualityAudit(
  projectId: string,
  guestTokenHash: string,
  audit: QualityAudit,
): Promise<ProjectRecord> {
  const supabase = getServerSupabase();
  const project = await getProject(projectId, guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  if (!supabase) {
    const stored = demoStore.get(projectId)!;
    stored.qualityAudit = clone(audit);
    stored.updatedAt = new Date().toISOString();
    return clone(stored);
  }
  const { error } = await supabase
    .from("projects")
    .update({ quality_audit: audit })
    .eq("id", projectId)
    .eq("guest_token_hash", guestTokenHash);
  if (error) throw error;
  const updated = await getProject(projectId, guestTokenHash);
  if (!updated) throw new Error("PROJECT_NOT_FOUND");
  return updated;
}

export async function updateProjectPaymentStatus(
  projectId: string,
  status: ProjectRecord["paymentStatus"],
): Promise<void> {
  const supabase = getServerSupabase();
  if (!supabase) {
    const stored = demoStore.get(projectId);
    if (stored) {
      stored.paymentStatus = status;
      stored.updatedAt = new Date().toISOString();
    }
    return;
  }
  const { error } = await supabase
    .from("projects")
    .update({ payment_status: status })
    .eq("id", projectId);
  if (error) throw error;
}

export async function saveStageInputs(
  projectId: string,
  stageIndex: number,
  guestTokenHash: string,
  inputs: Record<string, unknown>,
): Promise<ProjectStageRecord> {
  const supabase = getServerSupabase();
  if (!supabase) {
    const project = demoStore.get(projectId);
    if (!project || project.guestTokenHash !== guestTokenHash) throw new Error("PROJECT_NOT_FOUND");
    const stage = project.stages[stageIndex];
    if (!stage) throw new Error("STAGE_NOT_FOUND");
    stage.inputs = clone(inputs);
    stage.inputVersion += 1;
    stage.status = "ready_to_generate";
    project.updatedAt = new Date().toISOString();
    return clone(stage);
  }

  const project = await getProject(projectId, guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const { data, error } = await supabase
    .from("project_stages")
    .update({
      inputs,
      input_version: project.stages[stageIndex].inputVersion + 1,
      status: "ready_to_generate",
    })
    .eq("project_id", projectId)
    .eq("stage_index", stageIndex)
    .select()
    .single();
  if (error) throw error;
  return mapStage(data, project.stages[stageIndex].artifacts);
}

function mapGenerationJob(row: Record<string, unknown>, stageIndex: number): GenerationJobRecord {
  return {
    id: row.id as string,
    projectId: row.project_id as string,
    stageId: row.stage_id as string,
    stageIndex,
    status: row.status as GenerationJobRecord["status"],
    attempt: row.attempt as number,
    model: (row.model as string | null) ?? null,
    artifactId: (row.artifact_id as string | null) ?? null,
    errorCode: (row.error_code as string | null) ?? null,
    errorMessage: (row.error_message as string | null) ?? null,
    retryable: Boolean(row.retryable ?? true),
    startedAt: (row.started_at as string | null) ?? null,
    finishedAt: (row.finished_at as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}

export async function beginGeneration(
  projectId: string,
  stageIndex: number,
  guestTokenHash: string,
  inputSnapshot: Record<string, unknown>,
  model: string,
) {
  const supabase = getServerSupabase();
  const project = await getProject(projectId, guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const stage = project.stages[stageIndex];
  if (!stage) throw new Error("STAGE_NOT_FOUND");
  if (!supabase) {
    stage.status = "generating";
    const stored = demoStore.get(projectId)!;
    stored.stages[stageIndex].status = "generating";
    const previous = [...demoJobStore.values()]
      .filter((job) => job.projectId === projectId && job.stageIndex === stageIndex)
      .sort((left, right) => right.attempt - left.attempt)[0];
    const attempt = (previous?.attempt ?? 0) + 1;
    const job: DemoGenerationJob = {
      id: crypto.randomUUID(),
      projectId,
      stageId: stage.id,
      stageIndex,
      status: "running",
      attempt,
      model,
      artifactId: null,
      errorCode: null,
      errorMessage: null,
      retryable: true,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      createdAt: new Date().toISOString(),
      guestTokenHash,
      inputSnapshot,
    };
    demoJobStore.set(job.id, job);
    return { id: job.id, stageId: stage.id, attempt };
  }

  const previousAttempt = await getLatestGenerationJob(projectId, stageIndex, guestTokenHash);
  const attempt = (previousAttempt?.attempt ?? 0) + 1;
  const { data: job, error } = await supabase
    .from("generation_jobs")
    .insert({
      project_id: projectId,
      stage_id: stage.id,
      status: "running",
      attempt,
      model,
      input_snapshot: inputSnapshot,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  await supabase.from("project_stages").update({ status: "generating" }).eq("id", stage.id);
  return { id: job.id, stageId: stage.id, attempt };
}

export async function finishGeneration(
  projectId: string,
  stageIndex: number,
  guestTokenHash: string,
  jobId: string,
  artifact: Omit<ArtifactRecord, "id" | "projectId" | "stageId" | "stageIndex" | "version" | "createdAt">,
): Promise<ArtifactRecord> {
  const supabase = getServerSupabase();
  const project = await getProject(projectId, guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const stage = project.stages[stageIndex];
  const version = (stage.artifacts[0]?.version ?? 0) + 1;
  if (!supabase) {
    const created: ArtifactRecord = {
      ...artifact,
      id: crypto.randomUUID(),
      projectId,
      stageId: stage.id,
      stageIndex,
      version,
      createdAt: new Date().toISOString(),
    };
    const stored = demoStore.get(projectId)!;
    stored.stages[stageIndex].artifacts.unshift(created);
    stored.stages[stageIndex].status = "ready_for_review";
    const job = demoJobStore.get(jobId);
    if (job) {
      job.status = "succeeded";
      job.artifactId = created.id;
      job.finishedAt = new Date().toISOString();
    }
    return clone(created);
  }

  const { data, error } = await supabase
    .from("stage_artifacts")
    .insert({
      project_id: projectId,
      stage_id: stage.id,
      stage_index: stageIndex,
      version,
      schema_version: artifact.schemaVersion,
      content: artifact.content,
      explanations: artifact.explanations,
      assumptions: artifact.assumptions,
      sources: artifact.sources,
      review_status: artifact.reviewStatus,
    })
    .select()
    .single();
  if (error) throw error;
  await Promise.all([
    supabase.from("project_stages").update({ status: "ready_for_review" }).eq("id", stage.id),
    supabase.from("generation_jobs").update({
      status: "succeeded",
      artifact_id: data.id,
      finished_at: new Date().toISOString(),
    }).eq("id", jobId),
  ]);
  return mapArtifact(data);
}

export async function failGeneration(
  projectId: string,
  stageIndex: number,
  guestTokenHash: string,
  jobId: string,
  errorCode: string,
  errorMessage: string,
  retryable = true,
) {
  const supabase = getServerSupabase();
  if (!supabase) {
    const job = demoJobStore.get(jobId);
    if (job) {
      job.status = "failed";
      job.errorCode = errorCode;
      job.errorMessage = errorMessage;
      job.retryable = retryable;
      job.finishedAt = new Date().toISOString();
    }
    const stored = demoStore.get(projectId);
    if (stored && stored.guestTokenHash === guestTokenHash) {
      stored.stages[stageIndex].status = "failed";
    }
    return;
  }
  const project = await getProject(projectId, guestTokenHash);
  if (!project) return;
  const stage = project.stages[stageIndex];
  await Promise.all([
    supabase.from("generation_jobs").update({
      status: "failed",
      error_code: errorCode,
      error_message: errorMessage,
      retryable,
      finished_at: new Date().toISOString(),
    }).eq("id", jobId),
    supabase.from("project_stages").update({ status: "failed" }).eq("id", stage.id),
  ]);
}

export async function getLatestGenerationJob(
  projectId: string,
  stageIndex: number,
  guestTokenHash: string,
): Promise<GenerationJobRecord | null> {
  const supabase = getServerSupabase();
  const project = await getProject(projectId, guestTokenHash);
  if (!project) return null;
  const stage = project.stages[stageIndex];
  if (!stage) return null;
  if (!supabase) {
    const jobs = [...demoJobStore.values()]
      .filter((job) => job.projectId === projectId && job.stageId === stage.id && job.guestTokenHash === guestTokenHash)
      .sort((left, right) => right.attempt - left.attempt || right.createdAt.localeCompare(left.createdAt));
    const latest = jobs[0];
    if (!latest) return null;
    const { guestTokenHash: _guest, inputSnapshot: _input, ...record } = latest;
    return structuredClone(record);
  }
  const { data, error } = await supabase
    .from("generation_jobs")
    .select("*")
    .eq("project_id", projectId)
    .eq("stage_id", stage.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapGenerationJob(data, stageIndex) : null;
}

export async function retryGenerationJob(
  projectId: string,
  stageIndex: number,
  guestTokenHash: string,
  inputSnapshot: Record<string, unknown>,
  model: string,
) {
  const latest = await getLatestGenerationJob(projectId, stageIndex, guestTokenHash);
  if (!latest || latest.status !== "failed" || !latest.retryable) {
    throw new Error("GENERATION_RETRY_NOT_ALLOWED");
  }
  if (latest.attempt >= 3) throw new Error("GENERATION_RETRY_LIMIT");
  const supabase = getServerSupabase();
  const project = await getProject(projectId, guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const stage = project.stages[stageIndex];
  if (!supabase) {
    stage.status = "generating";
    const job: DemoGenerationJob = {
      id: crypto.randomUUID(),
      projectId,
      stageId: stage.id,
      stageIndex,
      status: "running",
      attempt: latest.attempt + 1,
      model,
      artifactId: null,
      errorCode: null,
      errorMessage: null,
      retryable: true,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      createdAt: new Date().toISOString(),
      guestTokenHash,
      inputSnapshot,
    };
    demoJobStore.set(job.id, job);
    return { id: job.id, stageId: stage.id, attempt: job.attempt };
  }
  const { data: job, error } = await supabase
    .from("generation_jobs")
    .insert({
      project_id: projectId,
      stage_id: stage.id,
      status: "running",
      attempt: latest.attempt + 1,
      model,
      input_snapshot: inputSnapshot,
      started_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  await supabase.from("project_stages").update({ status: "generating" }).eq("id", stage.id);
  return { id: job.id, stageId: stage.id, attempt: job.attempt as number };
}

export async function approveArtifact(
  projectId: string,
  stageIndex: number,
  artifactId: string,
  guestTokenHash: string,
) {
  const supabase = getServerSupabase();
  const project = await getProject(projectId, guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const stage = project.stages[stageIndex];
  const artifact = stage.artifacts.find((item) => item.id === artifactId);
  if (!artifact) throw new Error("ARTIFACT_NOT_FOUND");
  const nextStage = Math.min(5, stageIndex + 1);

  if (!supabase) {
    const stored = demoStore.get(projectId)!;
    const storedStage = stored.stages[stageIndex];
    storedStage.approvedArtifactId = artifactId;
    storedStage.approvedAt = new Date().toISOString();
    storedStage.status = "approved";
    storedStage.artifacts.forEach((item: ArtifactRecord) => {
      item.reviewStatus = item.id === artifactId ? "approved" : item.reviewStatus;
    });
    if (stageIndex < 5) stored.stages[nextStage].status = "collecting_input";
    stored.activeStage = nextStage;
    if (stageIndex === 5) stored.status = "completed";
    return getProject(projectId, guestTokenHash);
  }

  await Promise.all([
    supabase.from("stage_artifacts").update({ review_status: "approved" }).eq("id", artifactId),
    supabase.from("project_stages").update({
      status: "approved",
      approved_artifact_id: artifactId,
      approved_at: new Date().toISOString(),
    }).eq("id", stage.id),
    supabase.from("projects").update({
      active_stage: nextStage,
      status: stageIndex === 5 ? "completed" : "active",
    }).eq("id", projectId),
    stageIndex < 5
      ? supabase.from("project_stages").update({ status: "collecting_input" }).eq("id", project.stages[nextStage].id)
      : Promise.resolve(),
  ]);
  return getProject(projectId, guestTokenHash);
}

export async function requestRevision(
  projectId: string,
  stageIndex: number,
  artifactId: string,
  instruction: string,
  guestTokenHash: string,
) {
  const supabase = getServerSupabase();
  const project = await getProject(projectId, guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const stage = project.stages[stageIndex];
  if (!stage.artifacts.some((artifact) => artifact.id === artifactId)) {
    throw new Error("ARTIFACT_NOT_FOUND");
  }
  if (!supabase) {
    const stored = demoStore.get(projectId)!;
    stored.stages[stageIndex].status = "revision_requested";
    return { id: crypto.randomUUID(), status: "open", instruction };
  }
  const { data, error } = await supabase
    .from("revision_requests")
    .insert({
      project_id: projectId,
      stage_id: stage.id,
      artifact_id: artifactId,
      instruction,
    })
    .select()
    .single();
  if (error) throw error;
  await supabase.from("project_stages").update({ status: "revision_requested" }).eq("id", stage.id);
  return data;
}
