import { NextResponse } from "next/server";
import { requireGuestIdentity } from "../../../../../lib/api-auth";
import {
  getOpenAIRuntimeConfig,
  OpenAIConnectionError,
  runOpenAISmokeTest,
} from "../../../../../lib/openai/session-config";

const privateJson = (body: unknown, init?: ResponseInit) => {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
};

export async function POST() {
  try {
    const identity = await requireGuestIdentity();
    const config = getOpenAIRuntimeConfig(identity.hash);
    if (!config) {
      return privateJson(
        { error: { code: "OPENAI_NOT_CONNECTED", message: "먼저 OpenAI 연결키(API 키)를 연결해주세요." } },
        { status: 409 },
      );
    }
    return privateJson({ result: await runOpenAISmokeTest(config) });
  } catch (error) {
    if (error instanceof OpenAIConnectionError) {
      return privateJson(
        { error: { code: error.code, message: error.message } },
        { status: error.status },
      );
    }
    return privateJson(
      { error: { code: "OPENAI_TEST_FAILED", message: "OpenAI 샘플 생성 테스트에 실패했습니다." } },
      { status: 502 },
    );
  }
}
