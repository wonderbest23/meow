import {
  completeDraftPackageRun,
  completeDraftPackageStep,
  failDraftPackageRun,
  startDraftPackageStep,
  type DraftPackageWorkflowParams,
} from "./domain";
import {
  finishPreparedDraftStage,
  generatePreparedDraftStage,
  generateDraftBusinessPlan,
  generateDraftExecutionPlan,
  generateDraftGrantPackage,
  generateDraftOperations,
  prepareDraftStageGeneration,
  prepareDraftPackage,
  syncGeneratedLanding,
  type DraftPackageBuildContext,
  type GeneratedDraftStage,
} from "./runner";
import {
  getProject,
  updateDraftPackageRun,
  updateRefinementVersionStatus,
} from "../project-repository";
import type { OpenAIRuntimeConfig } from "../openai/session-config";

const internalPath = "/__internal/draft-package";

type DraftPackageServiceOperation =
  | "startMilestone"
  | "completeMilestone"
  | "preparePackage"
  | "prepareStage"
  | "generateStage"
  | "finishStage"
  | "syncLanding"
  | "generateBusinessPlan"
  | "generateOperations"
  | "generateExecutionPlan"
  | "generateGrantPackage"
  | "completeRun"
  | "failRun";

type DraftPackageServiceRequest = {
  operation: DraftPackageServiceOperation;
  args: unknown[];
};

function errorDetail(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = [record.code, record.message, record.details, record.hint]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (parts.length) return parts.join(" · ").slice(0, 1000);
    try {
      return JSON.stringify(error).slice(0, 1000);
    } catch {
      return "알 수 없는 서버 오류";
    }
  }
  return String(error || "알 수 없는 서버 오류").slice(0, 1000);
}

function encodeHex(value: ArrayBuffer) {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodeHex(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value)) return null;
  return Uint8Array.from(value.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function signBody(secret: string, timestamp: string, body: string) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(secret),
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  return encodeHex(signature);
}

async function verifyBody(secret: string, timestamp: string, body: string, signature: string) {
  const decoded = decodeHex(signature);
  if (!decoded) return false;
  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    decoded,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
}

export async function callDraftPackageService<T>(
  service: Fetcher,
  secret: string,
  operation: DraftPackageServiceOperation,
  args: unknown[],
): Promise<T> {
  const body = JSON.stringify({ operation, args } satisfies DraftPackageServiceRequest);
  const timestamp = Date.now().toString();
  const signature = await signBody(secret, timestamp, body);
  const response = await service.fetch(`https://draft-package.internal${internalPath}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-draft-timestamp": timestamp,
      "x-draft-signature": signature,
    },
    body,
  });
  const payload = await response.json() as { result?: T; error?: string };
  if (!response.ok) throw new Error(payload.error || "DRAFT_PACKAGE_SERVICE_FAILED");
  return payload.result as T;
}

async function startMilestone(params: DraftPackageWorkflowParams, stepIndex: number) {
  const project = await getProject(params.projectId, params.guestTokenHash);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  const currentRun = project.draftPackageRun;
  if (!currentRun || currentRun.id !== params.runId) throw new Error("DRAFT_PACKAGE_RUN_REPLACED");
  if (currentRun.steps[stepIndex]?.status === "complete") return false;
  await updateDraftPackageRun(
    params.projectId,
    params.guestTokenHash,
    params.runId,
    (run) => startDraftPackageStep(run, stepIndex),
  );
  return true;
}

function environmentOpenAIConfig(env: CloudflareEnv): OpenAIRuntimeConfig | null {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    model: env.OPENAI_MODEL?.trim() || "gpt-5.6-sol",
    source: "environment",
  };
}

async function dispatch(request: DraftPackageServiceRequest, env: CloudflareEnv) {
  const [params, first, second, third] = request.args as [
    DraftPackageWorkflowParams,
    number | DraftPackageBuildContext | GeneratedDraftStage | string | undefined,
    DraftPackageBuildContext | GeneratedDraftStage | string | undefined,
    string | undefined,
  ];
  switch (request.operation) {
    case "startMilestone":
      return startMilestone(params, first as number);
    case "completeMilestone":
      return updateDraftPackageRun(
        params.projectId,
        params.guestTokenHash,
        params.runId,
        (run) => completeDraftPackageStep(run, first as number),
      );
    case "preparePackage":
      return prepareDraftPackage(params);
    case "prepareStage":
      return prepareDraftStageGeneration(
        params,
        first as number,
        second as DraftPackageBuildContext,
        environmentOpenAIConfig(env),
      );
    case "generateStage":
      return generatePreparedDraftStage(
        params,
        first as number,
        second as DraftPackageBuildContext,
        third as string,
        environmentOpenAIConfig(env),
      );
    case "finishStage":
      return finishPreparedDraftStage(params, first as number, second as GeneratedDraftStage, third as string);
    case "syncLanding":
      return syncGeneratedLanding(params);
    case "generateBusinessPlan":
      return generateDraftBusinessPlan(params, first as DraftPackageBuildContext);
    case "generateOperations":
      return generateDraftOperations(params, first as DraftPackageBuildContext);
    case "generateExecutionPlan":
      return generateDraftExecutionPlan(params, first as DraftPackageBuildContext);
    case "generateGrantPackage":
      return generateDraftGrantPackage(params, first as DraftPackageBuildContext);
    case "completeRun": {
      const completed = await updateDraftPackageRun(
        params.projectId,
        params.guestTokenHash,
        params.runId,
        completeDraftPackageRun,
      );
      if (params.refinement) {
        await updateRefinementVersionStatus(
          params.projectId,
          params.guestTokenHash,
          params.runId,
          "applied",
        );
      }
      return completed;
    }
    case "failRun": {
      const failed = await updateDraftPackageRun(
        params.projectId,
        params.guestTokenHash,
        params.runId,
        (run) => failDraftPackageRun(run, first as string),
      );
      if (params.refinement) {
        await updateRefinementVersionStatus(
          params.projectId,
          params.guestTokenHash,
          params.runId,
          "failed",
        );
      }
      return failed;
    }
  }
}

export async function handleDraftPackageServiceRequest(request: Request, env: CloudflareEnv) {
  if (new URL(request.url).pathname !== internalPath) return null;
  if (request.method !== "POST") return new Response(null, { status: 405 });

  const timestamp = request.headers.get("x-draft-timestamp") ?? "";
  const signature = request.headers.get("x-draft-signature") ?? "";
  const timestampNumber = Number(timestamp);
  const body = await request.text();
  const recent = Number.isFinite(timestampNumber) && Math.abs(Date.now() - timestampNumber) <= 60_000;
  const valid = recent && await verifyBody(env.SUPABASE_SERVICE_ROLE_KEY, timestamp, body, signature);
  if (!valid) return Response.json({ error: "NOT_FOUND" }, { status: 404 });

  try {
    const input = JSON.parse(body) as DraftPackageServiceRequest;
    const result = await dispatch(input, env);
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: errorDetail(error) }, { status: 500 });
  }
}
