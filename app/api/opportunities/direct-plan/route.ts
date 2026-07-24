import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import {
  directPlanInputSchema,
  DirectIdeaPlannerError,
  generateDirectIdeaPlan,
} from "../../../../lib/direct-idea-planner";
import { getOpenAIRuntimeConfig } from "../../../../lib/openai/session-config";
import type { DirectPlanWorkflowParams } from "../../../../lib/direct-plan/workflow";

export const runtime = "nodejs";
export const maxDuration = 60;

type DirectPlanWorkflowResult = Awaited<ReturnType<typeof generateDirectIdeaPlan>>;

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

async function cloudflareEnvironment() {
  try {
    return (await getCloudflareContext({ async: true })).env;
  } catch {
    return null;
  }
}

async function jobProof(secret: string, identityHash: string, jobId: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${identityHash}.${jobId}`),
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function safeWorkflowMessage(status: WorkflowStatus) {
  if (status.status === "errored" || status.status === "terminated") {
    const technical = status.error?.message ?? "";
    if (technical.includes("OPENAI_NOT_CONNECTED")) {
      return "AI 사업 기획 연결이 준비되지 않았어요. 운영자에게 문의해주세요.";
    }
    return "사업 초안 제작이 잠시 멈췄어요. 다시 시작해주세요.";
  }
  return "";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const jobId = url.searchParams.get("jobId")?.trim() ?? "";
    const proof = url.searchParams.get("proof")?.trim() ?? "";
    if (!/^direct-[0-9a-f-]{36}$/i.test(jobId) || !/^[0-9a-f]{64}$/i.test(proof)) {
      return privateJson({
        error: { code: "DIRECT_PLAN_JOB_INVALID", message: "저장된 초안 작업 정보를 확인하지 못했어요." },
      }, { status: 400 });
    }

    const identity = await requireGuestIdentity();
    const env = await cloudflareEnvironment();
    if (!env?.DIRECT_PLAN_WORKFLOW || !env.SUPABASE_SERVICE_ROLE_KEY) {
      return privateJson({
        error: { code: "DIRECT_PLAN_WORKFLOW_UNAVAILABLE", message: "서버 초안 작업을 불러오지 못했어요." },
      }, { status: 503 });
    }
    const expectedProof = await jobProof(env.SUPABASE_SERVICE_ROLE_KEY, identity.hash, jobId);
    if (proof !== expectedProof) {
      return privateJson({
        error: { code: "DIRECT_PLAN_JOB_NOT_FOUND", message: "이 브라우저에서 시작한 초안 작업을 찾지 못했어요." },
      }, { status: 404 });
    }

    const instance = await env.DIRECT_PLAN_WORKFLOW.get(jobId);
    const status = await instance.status();
    const failed = status.status === "errored" || status.status === "terminated";
    return privateJson({
      job: { id: jobId, status: failed ? "error" : status.status },
      result: status.status === "complete"
        ? status.output as DirectPlanWorkflowResult | undefined
        : undefined,
      error: failed
        ? { code: "DIRECT_PLAN_JOB_FAILED", message: safeWorkflowMessage(status) }
        : undefined,
    });
  } catch {
    return privateJson({
      error: { code: "DIRECT_PLAN_JOB_STATUS_FAILED", message: "초안 제작 상태를 다시 확인하고 있어요." },
    }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireGuestIdentity();
    const input = directPlanInputSchema.parse(await request.json());
    const env = await cloudflareEnvironment();

    if (env?.DIRECT_PLAN_WORKFLOW) {
      if (!env.OPENAI_API_KEY?.trim() || !env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        return privateJson({
          error: {
            code: "OPENAI_NOT_CONNECTED",
            message: "AI 사업 기획 연결이 준비되지 않았어요. 운영자에게 문의해주세요.",
          },
        }, { status: 503 });
      }
      const jobId = `direct-${crypto.randomUUID()}`;
      const proof = await jobProof(env.SUPABASE_SERVICE_ROLE_KEY, identity.hash, jobId);
      const params: DirectPlanWorkflowParams = { input };
      await env.DIRECT_PLAN_WORKFLOW.create({ id: jobId, params });
      return privateJson({
        job: {
          id: jobId,
          proof,
          status: "queued",
          createdAt: new Date().toISOString(),
        },
      }, { status: 202 });
    }

    const config = getOpenAIRuntimeConfig(identity.hash);
    if (!config) {
      return privateJson({
        error: {
          code: "OPENAI_NOT_CONNECTED",
          message: "AI 사업 기획 연결이 준비되지 않았어요. 운영자에게 문의해주세요.",
        },
      }, { status: 503 });
    }
    return privateJson(await generateDirectIdeaPlan(input, config));
  } catch (error) {
    if (error instanceof DirectIdeaPlannerError) {
      return privateJson(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    if (error instanceof z.ZodError) {
      return privateJson({
        error: {
          code: "DIRECT_PLAN_INPUT_INVALID",
          message: "아이디어, 예산과 시간을 다시 확인해주세요.",
        },
      }, { status: 400 });
    }
    return privateJson({
      error: {
        code: "DIRECT_PLAN_FAILED",
        message: "사업 초안을 만들지 못했어요. 잠시 후 다시 시도해주세요.",
      },
    }, { status: 500 });
  }
}
