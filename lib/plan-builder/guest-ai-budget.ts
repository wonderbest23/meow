import { checkRateLimit, type RateLimitResult } from "../rate-limit";

/*
 * 손님(로그인 전) AI 하루 한도 — 사장님 결정(2026-11-17): "한도 걸고 열어줘".
 *
 * 손님도 사업 정보 대화(질문 · 답 · AI 보조 · 사업 방향 정리)를 무료로 끝까지 할 수 있게 열면서, 하루에 쓸 AI 비용에 울타리를 친다.
 * 비용 근거(2026-10-18 실측, Opus 5.5): 손님 한 명이 대화를 끝까지 하면 약 180~270원 —
 * 첫 설명 의견 ~8원, 답 추천 ~15원, 도움말 ~15원, 메모 추출 ~10원, 사업 방향 정리 ~120원. AI 읽기(Haiku)는 한 번 0.6원.
 *
 * '단위'로 센다: 큰 작업(사업 방향 정리 · 새 사업 제안) 8, 그 밖의 Opus 보조 호출 1, Haiku AI 읽기 0(세지 않는다 — IP별 10분 제한만 둔다).
 * 한도: 손님 전체 하루 2,000단위(1단위 ≈ 15원 → 약 3만 원), 손님 1명 하루 60단위. GUEST_AI_DAILY_UNITS · GUEST_AI_PER_GUEST_UNITS 로 바꾼다.
 * 로그인한 사람은 세지 않는다(계정마다 따로 있는 한도를 그대로 쓴다). 로그인 서버가 없는 곳(로컬 · 시험)은 손님 구분이 없으니 세지 않는다.
 *
 * 세는 곳은 AI를 실제로 부르기 바로 앞이다 — 요청 거절 · 같은 요청 다시 보내기 · 캐시 응답 · AI가 필요 없는 저장은 세지 않는다.
 * 카운터는 lib/rate-limit.ts 의 checkRateLimit(운영은 RATE_LIMIT_BACKEND=supabase 라 전역 공유, 실패하면 서버별 메모리로 내려감)를 쓴다.
 * 공유 카운터는 한 번에 1씩 올라가므로 N단위는 N번 올린다. 넘친 뒤 올라간 몫은 그날 창이 끝나면 함께 사라진다.
 */

export const GUEST_AI_UNITS = { big: 8, assist: 1, read: 0 } as const;
export const DEFAULT_GUEST_AI_DAILY_UNITS = 2000;
export const DEFAULT_GUEST_AI_PER_GUEST_UNITS = 60;
export const GUEST_AI_WINDOW_MS = 86_400_000;
/** 한도에 닿은 손님에게 보이는 한 줄 — 로그인 창 위에 뜬다(대화 화면의 안내 상자 + '로그인하고 이어가기') */
export const GUEST_AI_LIMIT_MESSAGE = "오늘 무료 대화가 많아요. 로그인하면 지금까지 적은 내용 그대로 이어서 할 수 있어요.";
/** saveIntakeCommand 가 던지는 오류 번호 — 대화 경로(intake-http)가 로그인 필요 응답으로 바꿔 돌려준다 */
export const GUEST_AI_LIMIT_CODE = "guest_ai_limit";

const PER_GUEST_BUCKET = "guest-ai-units";
const DAILY_BUCKET = "guest-ai-units-all";

type Env = Record<string, string | undefined>;
type Check = (name: string, key: string, options: { limit: number; windowMs: number }) => Promise<RateLimitResult>;

function positiveInt(raw: string | undefined, fallback: number) {
  const value = Number(raw?.trim());
  return raw?.trim() && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/** 하루 한도(전체 · 1명). 값이 비었거나 숫자가 아니면 기본값 */
export function guestAiLimits(env: Env = process.env) {
  return { daily: positiveInt(env.GUEST_AI_DAILY_UNITS, DEFAULT_GUEST_AI_DAILY_UNITS), perGuest: positiveInt(env.GUEST_AI_PER_GUEST_UNITS, DEFAULT_GUEST_AI_PER_GUEST_UNITS) };
}

/** 대화 AI 작업 종류별 단위 — 사업 방향 정리(design) · 새 사업 제안(ideas)은 큰 작업, 메모 추출 · 도움말 · 채팅 수정은 보조 */
export function intakeJobUnits(kind: string): number {
  return kind === "design" || kind === "ideas" ? GUEST_AI_UNITS.big : GUEST_AI_UNITS.assist;
}

async function spend(check: Check, bucket: string, key: string, units: number, limit: number) {
  const results = await Promise.all(Array.from({ length: units }, () => check(bucket, key, { limit, windowMs: GUEST_AI_WINDOW_MS })));
  return results.every(result => result.ok);
}

export type GuestAiSpend = { ok: boolean; counted: number; limit?: "guest" | "daily" };

/**
 * 손님 AI 단위를 쓴다. ok=false 면 AI를 부르지 않는다.
 * 1명 한도를 먼저 본다 — 이미 막힌 손님이 계속 눌러도 전체 한도는 깎이지 않게.
 */
export async function spendGuestAiUnits(
  input: { userId: string | null; guestHash: string; units: number; loginAvailable: boolean },
  deps: { check?: Check; env?: Env } = {},
): Promise<GuestAiSpend> {
  if (input.userId || !input.loginAvailable || input.units <= 0) return { ok: true, counted: 0 };
  const check = deps.check ?? checkRateLimit;
  const limits = guestAiLimits(deps.env);
  const units = Math.ceil(input.units);
  if (!(await spend(check, PER_GUEST_BUCKET, input.guestHash, units, limits.perGuest))) return { ok: false, counted: units, limit: "guest" };
  if (!(await spend(check, DAILY_BUCKET, "all", units, limits.daily))) return { ok: false, counted: units, limit: "daily" };
  return { ok: true, counted: units };
}

/** 대화 본 경로의 한도 초과 응답 — 로그인 필요 응답(login_required)과 같은 모양이라 화면이 로그인 안내를 띄운다 */
export function guestAiLimitBody(ownerScope: string) {
  return { code: "login_required", login: true, authenticated: false, ownerScope, message: GUEST_AI_LIMIT_MESSAGE } as const;
}
