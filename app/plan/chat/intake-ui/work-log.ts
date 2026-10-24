import type { IntakeSnapshot } from "../../../../lib/plan-builder/intake-types";
import type { GenerationProgress } from "../../../../lib/plan-builder/generation-progress";
import { formatWon } from "../../../../lib/plan-builder/intake-options";
import { parseWonAmount } from "../../../../lib/plan-builder/answer-number";
import { getIntakeQuestion } from "../../../../lib/plan-builder/intake-questions";

/*
 * 작업실 PC 대화 칸의 '작업 기록' 줄 — 체크 아이콘 + 한 줄(+ 접었다 펴는 목록).
 * 모두 이미 있는 데이터(답 · 사업 방향 · 계획서 작성 진행 · 고치기 제안)에서만 만든다. 걸린 시간은 시작·끝 시각이 다 있을 때만 붙인다.
 * 화면(WorkLog.tsx)과 떼어 두어 시험에서 바로 부를 수 있게 했다.
 */
export type WorkLogItem = { id: string; text: string; sub?: string; detail?: string[] };

/** 걸린 시간 — 1초 미만이거나 두 시간이 넘으면(시각이 어긋난 것) 보이지 않는다 */
export function formatDuration(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < 1000 || ms > 2 * 60 * 60 * 1000) return null;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60), rest = seconds % 60;
  return rest ? `${minutes}분 ${rest}초` : `${minutes}분`;
}

export function durationBetween(start: string | null | undefined, end: string | number | null | undefined): string | null {
  if (!start || end === null || end === undefined) return null;
  const from = Date.parse(start), to = typeof end === "number" ? end : Date.parse(end);
  return Number.isFinite(from) && Number.isFinite(to) ? formatDuration(to - from) : null;
}

/** 답 아래 시각 — '오후 10:31'. 읽을 수 없으면 빈 글 */
export function clockLabel(at: string | null | undefined): string {
  const time = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(time)) return "";
  return new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" }).format(time);
}

/** 사업 방향 정리 — 정리 결과가 있을 때만. 정리 작업이 지금 작업으로 남아 있으면 걸린 시간을 붙인다 */
export function designLogItem(plan: IntakeSnapshot): WorkLogItem | null {
  if (!plan.coach.design) return null;
  const job = plan.intake.job;
  const sub = job?.kind === "design" && job.status === "complete" ? durationBetween(job.createdAt, job.updatedAt) : null;
  return { id: "design", text: "사업 방향을 정리했어요", ...(sub ? { sub } : {}) };
}

/** 계획서 작성 — 맡은 항목을 다 썼을 때만. finishedAt 은 이 화면에서 끝나는 걸 지켜봤을 때의 시각(없으면 시간을 붙이지 않는다) */
export function planLogItem(state: Pick<GenerationProgress, "total" | "done" | "startedAt" | "sections"> | null | undefined, finishedAt?: number | null): WorkLogItem | null {
  if (!state || state.total <= 0 || state.done < state.total) return null;
  const sub = finishedAt ? durationBetween(state.startedAt, finishedAt) : null;
  // 작성 단위는 장 안의 항목이다 — 계획서 칸 머리('10개 항목')와 같은 말로 센다(장은 5개처럼 더 적다)
  return { id: "plan", text: `계획서 ${state.done}개 항목을 썼어요`, ...(sub ? { sub } : {}), detail: state.sections.filter(section => section.done).map(section => section.title) };
}

/*
 * '계획서에 지금 답이 다 반영됐어요' 줄은 두지 않는다(r37 글 점검) — 할 일이 없다는 말이라 군더더기였다.
 * 반영이 필요할 때는 머리줄 상태('사업계획서 · 수정 내용 반영 필요')와 계획서 칸의 '계획서에 반영하기'가 알린다.
 */

const wonValue = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" ? parseWonAmount(value) ?? null : null;

/**
 * 남는 돈 — 판매 가격과 1건 비용에 모두 숫자로 답했으면 그 차이. 둘 중 나중에 답한 메시지 뒤에 붙인다(anchor).
 * 계산만 보여 주고 판단(좋다·나쁘다)은 하지 않는다 — 손해면 손해라고만 적는다.
 */
export function marginLogItem(plan: IntakeSnapshot): (WorkLogItem & { anchor: string }) | null {
  const price = plan.intake.answers.price, cost = plan.intake.answers["structure.unitCost"];
  if (price?.status !== "answered" || cost?.status !== "answered") return null;
  const priceWon = wonValue(price.value), costWon = wonValue(cost.value);
  if (priceWon === null || costWon === null || priceWon <= 0) return null;
  const order = (id: string) => plan.coach.messages.findIndex(message => message.id === id);
  const anchor = order(price.messageId) > order(cost.messageId) ? price.messageId : cost.messageId;
  if (order(anchor) < 0) return null;
  /* 단위는 대화에 보인 질문('프로젝트 1건에 드는 … 비용')과 같은 낱말로 — 오른쪽 요약 숫자 칸('프로젝트 1건 남는 돈')과도 같다(r37 점검) */
  const asked = plan.questions.find(question => question.id === "structure.unitCost" || question.fieldKey === "unitCost");
  const unit = asked?.period ?? getIntakeQuestion(plan.intake.mode, plan.intake.sector, "structure.unitCost", plan.structure?.values)?.period ?? "하나";
  const margin = priceWon - costWon;
  return { id: "margin", anchor, text: "남는 돈을 계산했어요", sub: margin >= 0 ? `${unit}에 ${formatWon(margin)}` : `${unit}에 ${formatWon(-margin)} 손해`, detail: [`판매 가격 ${formatWon(priceWon)}`, `드는 비용 ${formatWon(costWon)}`] };
}

/** 고치기 제안 — 바꿀 곳이 몇 군데인지 */
export function editFoundItem(count: number): WorkLogItem | null {
  return count > 0 ? { id: "edit-found", text: `바꿀 곳 ${count}군데를 찾았어요` } : null;
}
