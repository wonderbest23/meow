import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGuestIdentity } from "../../../../lib/api-auth";
import {
  clearOpenAISessionConfig,
  getOpenAIConnectionStatus,
  getOpenAIRuntimeConfig,
  OpenAIConnectionError,
  setOpenAISessionConfig,
  validateOpenAIConnection,
} from "../../../../lib/openai/session-config";

const connectionSchema = z.object({
  apiKey: z.string().trim().min(20).max(500),
  model: z.string().trim().min(2).max(100).regex(/^[a-zA-Z0-9._:-]+$/),
});

const modelSchema = connectionSchema.pick({ model: true });

const privateJson = (body: unknown, init?: ResponseInit) => {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
};

export async function GET() {
  try {
    const identity = await requireGuestIdentity();
    return privateJson({ status: getOpenAIConnectionStatus(identity.hash) });
  } catch {
    return privateJson(
      { error: { code: "OPENAI_STATUS_FAILED", message: "OpenAI 연결 상태를 확인하지 못했습니다." } },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireGuestIdentity();
    const input = connectionSchema.parse(await request.json());
    await validateOpenAIConnection(input.apiKey, input.model);
    const status = setOpenAISessionConfig(identity.hash, input.apiKey, input.model);
    return privateJson({ status });
  } catch (error) {
    if (error instanceof OpenAIConnectionError) {
      return privateJson(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return privateJson(
      { error: { code: "OPENAI_CONNECTION_INVALID", message: "OpenAI 연결키(API 키)와 사용할 인공지능 모델을 확인해주세요." } },
      { status: 400 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requireGuestIdentity();
    const input = modelSchema.parse(await request.json());
    const current = getOpenAIRuntimeConfig(identity.hash);
    if (!current) {
      return privateJson(
        { error: { code: "OPENAI_NOT_CONNECTED", message: "먼저 OpenAI 연결키(API 키)를 연결해주세요." } },
        { status: 409 },
      );
    }
    await validateOpenAIConnection(current.apiKey, input.model);
    const status = setOpenAISessionConfig(identity.hash, current.apiKey, input.model);
    return privateJson({ status });
  } catch (error) {
    if (error instanceof OpenAIConnectionError) {
      return privateJson(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return privateJson(
      { error: { code: "OPENAI_MODEL_INVALID", message: "모델 입력을 확인해주세요." } },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  try {
    const identity = await requireGuestIdentity();
    return privateJson({ status: clearOpenAISessionConfig(identity.hash) });
  } catch {
    return privateJson(
      { error: { code: "OPENAI_DISCONNECT_FAILED", message: "OpenAI 세션 키를 삭제하지 못했습니다." } },
      { status: 400 },
    );
  }
}
