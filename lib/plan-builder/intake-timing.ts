import type { IntakeJob } from "./intake-types";

export const IDEA_CALL_TIMEOUT_MS = 60_000;
export const IDEA_RESULT_DEADLINE_MS = 120_000;

export const INTAKE_JOB_TIMING: Record<IntakeJob["kind"], { expectedMs: number; limitMs: number }> = {
  ideas: { expectedMs: 60_000, limitMs: IDEA_RESULT_DEADLINE_MS },
  design: { expectedMs: 35_000, limitMs: 60_000 },
  help: { expectedMs: 8_000, limitMs: 20_000 },
  extract: { expectedMs: 8_000, limitMs: 20_000 },
  edit: { expectedMs: 8_000, limitMs: 20_000 },
};

export function intakeJobExpired(job: IntakeJob | null | undefined, nowMs: number): boolean {
  if (!job || !["queued", "running"].includes(job.status)) return false;
  const start = Date.parse(job.kind === "ideas" ? job.createdAt ?? job.updatedAt : job.updatedAt);
  return Number.isFinite(start) && nowMs - start >= (job.kind === "ideas" ? IDEA_RESULT_DEADLINE_MS : 120_000);
}

/*
 * 일반 모드 '적은 글 읽기'(/api/plan/chat/understand) 시간.
 * 화면은 UNDERSTAND_WAIT_MS 만 기다리고 요청을 끊은 뒤 질문을 보인다(BusinessIntake). 끊어도 서버(Cloudflare Workers)는 멈추지 않고 끝까지 돈다.
 * 그래서 서버는 '요청을 받은 때'부터 재서 UNDERSTAND_SAVE_BY_MS 안에 저장을 시작할 때만 저장한다 — 저장 · 응답이 화면의 기다림 안에 끝나게.
 * 늦은 읽기를 저장하면 화면이 모르는 새 판(coach.revision)이 생겨 다음 답이 '다른 화면에서 수정됐어요'(409)로 막혔다(2026-11-17 운영, 로그인 안 한 손님).
 * 예전엔 AI 시간(7초)만 쟀는데, AI 앞의 일(로그인 확인 · 요청 제한 · 저장본 읽기 · 손님 AI 한도 세기)이 늘면서 전체가 8초를 넘었다.
 */
export const UNDERSTAND_WAIT_MS = 8_000;
export const UNDERSTAND_SAVE_BY_MS = 6_500;
/** 남은 시간이 이보다 적으면 AI를 부르지 않는다 — 돈만 쓰고 저장하지 못한다 */
export const UNDERSTAND_AI_MIN_MS = 2_000;

/** AI에 줄 시간(밀리초). 저장 시한까지 남은 시간이 UNDERSTAND_AI_MIN_MS 보다 적으면 0(부르지 않는다) */
export function understandAiBudget(startedAt: number, nowMs: number): number {
  const left = UNDERSTAND_SAVE_BY_MS - (nowMs - startedAt);
  return left >= UNDERSTAND_AI_MIN_MS ? left : 0;
}

/** 읽은 값을 지금 저장해도 되는지 — 저장 시한이 지났으면 화면은 이미 기다림을 끝냈을 수 있어 저장하지 않는다 */
export function understandSaveOnTime(startedAt: number, nowMs: number): boolean {
  return nowMs - startedAt <= UNDERSTAND_SAVE_BY_MS;
}
