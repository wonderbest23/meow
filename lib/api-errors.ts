/*
 * 고객에게 돌려줄 오류 문구를 고른다.
 *
 * 저장소 계층은 Supabase PostgrestError 를 그대로 던지고(Error 를 상속한다),
 * 라우트가 error.message 를 그대로 내보내면 'invalid input syntax for type uuid' 같은
 * 내부 DB 문구·스키마 정보가 고객 화면에 뜬다. 그래서 내보내도 되는 문구만 통과시킨다:
 *  - 일부러 만든 한국어 안내 문구(한글이 있고 DB 오류가 아닌 것)
 *  - 알려진 오류 코드(PROJECT_NOT_FOUND 등)를 한국어로 바꾼 것
 * 나머지는 한국어 기본 문구로 바꾸고, 원인 추적을 위해 서버 로그에만 남긴다.
 */

import { ZodError } from "zod";

const HANGUL = /[가-힣]/;

/** 여러 라우트가 공통으로 던지는 코드 → 고객용 문구 */
export const COMMON_ERROR_MESSAGES: Record<string, string> = {
  PROJECT_NOT_FOUND: "프로젝트를 찾을 수 없습니다.",
  ACCOUNT_LOGIN_REQUIRED: "로그인이 필요합니다.",
  STAGE_NOT_FOUND: "단계를 찾을 수 없습니다.",
  ARTIFACT_NOT_FOUND: "결과물을 찾을 수 없습니다.",
  GENERATION_RETRY_NOT_ALLOWED: "다시 만들 수 있는 실패 작업이 없습니다. 화면을 새로 열어주세요.",
  GENERATION_RETRY_LIMIT: "다시 만들기는 세 번까지 할 수 있습니다.",
  OPENAI_401: "AI 연결키가 유효하지 않습니다.",
  OPENAI_429: "AI 사용 한도에 도달했어요. 잠시 후 다시 시도해주세요.",
  OPENAI_TIMEOUT: "AI 응답 시간이 초과되었어요. 잠시 후 다시 시도해주세요.",
  OPENAI_UNAVAILABLE: "AI 응답을 받지 못했어요. 잠시 후 다시 시도해주세요.",
  OPENAI_EMPTY_OUTPUT: "AI 응답을 받지 못했어요. 잠시 후 다시 시도해주세요.",
  OPENAI_GENERATION_FAILED: "AI 가 결과물을 만들지 못했어요. 잠시 후 다시 시도해주세요.",
  OPENAI_INVALID_OUTPUT: "AI 결과를 정리하지 못했어요. 다시 시도해주세요.",
  OPENAI_QUALITY_GATE_FAILED: "AI 결과가 품질 기준을 통과하지 못했어요. 다시 시도해주세요.",
  OPENAI_REALITY_GATE_FAILED: "AI 결과에 확인되지 않은 내용이 있어 저장하지 않았어요. 다시 시도해주세요.",
};

/** PostgrestError 는 code·details·hint 를 함께 갖는다 — 한글이 섞여 있어도(입력값 반사) 내보내지 않는다 */
function isDatabaseError(error: unknown) {
  return typeof error === "object" && error !== null && ("details" in error || "hint" in error);
}

export function publicErrorMessage(
  error: unknown,
  fallbackKo: string,
  knownMap?: Record<string, string>,
): string {
  // ZodError.message 는 이슈 배열 JSON 이다 — 우리가 붙인 한국어 안내(첫 이슈)만 꺼내 쓴다
  if (error instanceof ZodError) {
    const first = error.issues[0]?.message ?? "";
    return HANGUL.test(first) ? first : fallbackKo;
  }
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const known = knownMap?.[raw] ?? COMMON_ERROR_MESSAGES[raw];
  if (raw && known) return known;
  if (raw && !isDatabaseError(error) && HANGUL.test(raw)) return raw;
  console.error("[api-error]", fallbackKo, error);
  return fallbackKo;
}

/*
 * 예전 라우트 중 code 자리에 error.message 를 그대로 넣던 곳용 —
 * 우리가 던지는 대문자 코드(PROJECT_NOT_FOUND 등)만 살리고 DB 문구는 기본 코드로 바꾼다.
 */
export function publicErrorCode(error: unknown, fallbackCode: string): string {
  const raw = error instanceof Error ? error.message : "";
  return /^[A-Z][A-Z0-9_]{2,63}$/.test(raw) && !isDatabaseError(error) ? raw : fallbackCode;
}
