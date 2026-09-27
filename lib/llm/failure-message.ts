import type { LLMFailure } from "./complete";

/** AI 호출 실패 원인을 화면에 보여줄 상태 코드와 안내 문구로 바꾼다(어느 모델이든 같은 안내). */
export function aiFailureResponse(code: LLMFailure["code"] | undefined): { status: number; message: string } {
  switch (code) {
    case "quota_exhausted": return { status: 429, message: "AI 사용 한도에 도달했어요. 잠시 후 다시 시도해주세요." };
    case "rate_limited": return { status: 429, message: "요청이 몰리고 있어요. 잠시 후 다시 시도해주세요." };
    case "timeout": return { status: 504, message: "AI 응답 시간이 초과되었어요. 잠시 후 다시 시도해주세요." };
    case "refusal": return { status: 422, message: "이 요청은 AI가 처리하지 않았어요. 표현을 바꿔 다시 시도해주세요." };
    case "output_limit": return { status: 502, message: "AI 응답이 너무 길어 끝까지 받지 못했어요. 다시 시도해주세요." };
    default: return { status: 502, message: "AI 응답을 받지 못했어요. 잠시 후 다시 시도해주세요." };
  }
}

export const AI_NOT_CONNECTED_MESSAGE = "인공지능 연결이 준비되지 않았어요. 직접 수정과 저장은 지금도 가능합니다.";
