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
/*
 * 2026-11-19 운영: AI 앞의 일에 3.9초가 걸려(배포 뒤 첫 요청) 시한 6.5초 중 AI에 2.6초만 남았고, 읽기가 시간 초과로 통째로 빠졌다 —
 * 사업이 아닌 말("고양이가 좋아")을 사업으로 잡는 보정도 함께 빠져 그 말이 그대로 제목이 됐다. 기다림을 8초 → 12초, 저장 시한을 6.5초 → 10.5초로 늘린다.
 * AI에 주는 시간은 그대로 최대 7초(idea-understanding)라, AI 앞의 일이 3.5초까지 걸려도 AI는 제 시간을 다 받는다.
 * 보통은 읽기가 끝나는 대로(3~6초) 넘어가므로 달라지지 않고, 느릴 때만 '적은 글을 읽고 있어요'가 길어진다.
 */
export const UNDERSTAND_WAIT_MS = 12_000;
export const UNDERSTAND_SAVE_BY_MS = 10_500;
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

/*
 * 첫 문장 읽기를 아직 할 때인지 — 손님이 다음 질문에 답했거나(직접 고른 값 · 적은 글을 읽은 값 · '잘 모르겠어요') 사업 방향이 나왔으면 하지 않는다.
 * 읽기는 저장에 성공해야만 '읽었음'(intake.understood)이 남는다. 처음 읽기가 늦거나 실패하면 표시가 없어서,
 * 예전엔 화면을 다시 열 때마다 AI를 다시 불렀다(Opus 두 번, 약 32원). 대화가 한참 지난 뒤 그 결과가 끼어들어 값이 바뀌고,
 * 바로 누른 '사업 방향 정리하기'가 '다른 화면에서 수정됐어요'(409)로 막혔다(2026-11-18 운영, 준비 자금 · 주당 시간까지 답한 손님).
 * 업종 기준값(:estimate · :guess:estimate)과 읽기가 넣은 값(:said)은 손님이 답한 것이 아니다. 사업 문장 · 업종 칸은 세지 않는다.
 */
export function understandStillUseful(answers: Record<string, { messageId: string } | undefined>, hasDesign: boolean): boolean {
  if (hasDesign) return false;
  return !Object.entries(answers).some(([id, answer]) => answer && id !== "business" && id !== "industry" && !answer.messageId.endsWith(":estimate") && !answer.messageId.endsWith(":said"));
}
