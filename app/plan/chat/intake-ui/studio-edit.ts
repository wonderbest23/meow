import type { StudioEditProposal, StudioEditTarget } from "../../studio/StudioContext";

/*
 * 작업실 3단계 — 대화로 고치기(홈페이지 · 계획서 한 장)와 계획서를 쓰는 동안 보낸 요청 대기열.
 * 둘 다 사업 답변이 아니라 이 기기에서만 그리는 대화 기록이라 서버에 저장하지 않고, 사업마다 sessionStorage 에 둔다
 * (탭을 바꾸거나 새로 고쳐도 이 세션 동안은 남는다). 화면(BusinessIntake)과 떼어 두어 시험에서 바로 부를 수 있게 했다.
 */

/** 대화로 고치기 한 번(손님 말 + "이렇게 바꿀게요" 카드)의 상태 */
export type StudioEditTurnStatus = "proposing" | "proposed" | "applying" | "applied" | "undoing" | "undone" | "dismissed" | "failed" | "note";
/** 실패했을 때 [다시 시도]가 다시 할 일 */
export type StudioEditRetry = "propose" | "apply" | "undo";

export type StudioEditTurn = {
  id: string;
  target: StudioEditTarget;
  /** 칩에 보인 대상 이름(예: "홈페이지", "3장 사업 전략") */
  label: string;
  sectionId?: string;
  /** 손님이 보낸 말 그대로 */
  instruction: string;
  status: StudioEditTurnStatus;
  proposal?: StudioEditProposal;
  error?: string;
  retry?: StudioEditRetry;
  /**
   * 새로 고침으로 되살린 카드 — 제안 내용·되돌릴 값은 홈페이지 칸의 메모리에만 있어 새로 고치면 사라진다.
   * 그래서 단추 없는 기록으로만 보여 준다(누르면 "더 이상 쓸 수 없어요"만 반복됐다, 3단계 점검 2026-10-23).
   */
  archived?: boolean;
  at: number;
};

export type StudioEditState = { planId: string | null; turns: StudioEditTurn[] };

export type StudioEditAction =
  | { type: "load"; planId: string; turns: StudioEditTurn[] }
  | { type: "propose"; turn: Pick<StudioEditTurn, "id" | "target" | "label" | "instruction" | "at"> & { sectionId?: string } }
  | { type: "note"; turn: Pick<StudioEditTurn, "id" | "target" | "label" | "instruction" | "at"> & { sectionId?: string } }
  | { type: "proposed"; id: string; proposal: StudioEditProposal }
  | { type: "apply"; id: string }
  | { type: "applied"; id: string }
  | { type: "undo"; id: string }
  | { type: "undone"; id: string }
  | { type: "dismiss"; id: string }
  | { type: "failed"; id: string; error: string; retry: StudioEditRetry }
  | { type: "retry"; id: string };

/** 한 사업에 남겨 두는 고치기 기록 수 — 오래된 것부터 지운다(세션 저장소가 무한히 커지지 않게) */
export const STUDIO_EDIT_TURN_LIMIT = 30;
/** 계획서를 쓰는 동안 기다리게 할 수 있는 요청 수 */
export const STUDIO_QUEUE_LIMIT = 5;
/** 새로 고침 등으로 하던 일이 끊긴 카드에 보일 말 */
export const STUDIO_EDIT_INTERRUPTED = "하던 중에 화면이 새로 열려 멈췄어요. 다시 시도해 주세요.";

const IN_FLIGHT: Partial<Record<StudioEditTurnStatus, StudioEditRetry>> = { proposing: "propose", applying: "apply", undoing: "undo" };
/** 다시 시도할 때 돌아갈 진행 상태 */
const RETRY_STATUS: Record<StudioEditRetry, StudioEditTurnStatus> = { propose: "proposing", apply: "applying", undo: "undoing" };

/** 지금 무언가 하고 있는 카드인지(만드는 중 · 바꾸는 중 · 되돌리는 중) — 그동안 다음 요청을 보내지 않는다 */
export function editTurnBusy(turn: Pick<StudioEditTurn, "status">): boolean {
  return turn.status in IN_FLIGHT;
}

function patch(turns: StudioEditTurn[], id: string, from: StudioEditTurnStatus[], next: (turn: StudioEditTurn) => StudioEditTurn): StudioEditTurn[] {
  let changed = false;
  const result = turns.map(turn => {
    if (turn.id !== id || !from.includes(turn.status)) return turn;
    changed = true;
    return next(turn);
  });
  return changed ? result : turns;
}

function append(turns: StudioEditTurn[], turn: StudioEditTurn): StudioEditTurn[] {
  if (turns.some(item => item.id === turn.id)) return turns;
  return [...turns, turn].slice(-STUDIO_EDIT_TURN_LIMIT);
}

/**
 * 고치기 카드 상태 바꾸기. 순서에 맞지 않는 알림(이미 끝난 카드에 늦게 온 결과, 다른 사업으로 바뀐 뒤 온 결과)은 무시한다 —
 * 사업을 바꾸면 load 로 목록이 통째로 바뀌므로 앞 사업의 id 는 찾지 못해 아무 일도 없다.
 */
export function studioEditReducer(state: StudioEditState, action: StudioEditAction): StudioEditState {
  if (action.type === "load") return { planId: action.planId, turns: action.turns.slice(-STUDIO_EDIT_TURN_LIMIT) };
  const turns = state.turns;
  let next = turns;
  switch (action.type) {
    case "propose": next = append(turns, { ...action.turn, status: "proposing" }); break;
    case "note": next = append(turns, { ...action.turn, status: "note" }); break;
    case "proposed": next = patch(turns, action.id, ["proposing"], turn => ({ ...turn, status: "proposed", proposal: action.proposal, error: undefined, retry: undefined })); break;
    case "apply": next = patch(turns, action.id, ["proposed"], turn => ({ ...turn, status: "applying", error: undefined, retry: undefined })); break;
    case "applied": next = patch(turns, action.id, ["applying"], turn => ({ ...turn, status: "applied" })); break;
    case "undo": next = patch(turns, action.id, ["applied"], turn => ({ ...turn, status: "undoing", error: undefined, retry: undefined })); break;
    case "undone": next = patch(turns, action.id, ["undoing"], turn => ({ ...turn, status: "undone" })); break;
    case "dismiss": next = patch(turns, action.id, ["proposed"], turn => ({ ...turn, status: "dismissed" })); break;
    case "failed": next = patch(turns, action.id, ["proposing", "applying", "undoing"], turn => ({ ...turn, status: "failed", error: action.error, retry: action.retry })); break;
    case "retry": next = patch(turns, action.id, ["failed"], turn => ({ ...turn, status: RETRY_STATUS[turn.retry ?? "propose"], error: undefined })); break;
  }
  return next === turns ? state : { ...state, turns: next };
}

const TARGETS: StudioEditTarget[] = ["homepage", "plan-section"];
const STATUSES: StudioEditTurnStatus[] = ["proposing", "proposed", "applying", "applied", "undoing", "undone", "dismissed", "failed", "note"];

function readProposal(value: unknown): StudioEditProposal | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== "string" || !TARGETS.includes(item.target as StudioEditTarget) || typeof item.summary !== "string" || !Array.isArray(item.changes)) return undefined;
  const changes = item.changes.filter((change): change is { label: string; before: string; after: string } => !!change && typeof change === "object"
    && typeof (change as Record<string, unknown>).label === "string" && typeof (change as Record<string, unknown>).before === "string" && typeof (change as Record<string, unknown>).after === "string")
    .map(({ label, before, after }) => ({ label, before, after }));
  return { id: item.id, target: item.target as StudioEditTarget, summary: item.summary, changes, ...(typeof item.cost === "string" && item.cost ? { cost: item.cost } : {}) };
}

/**
 * 세션 저장소에서 꺼낸 고치기 기록. 모양이 틀린 것은 버리고, 하던 중이던 카드(만드는 중 · 바꾸는 중 · 되돌리는 중)는
 * 그 일을 이어 받을 수 없으니(오른쪽 칸의 처리기도 새로 만들어졌다) '멈췄어요 · 다시 시도'로 바꾼다.
 */
export function restoreEditTurns(raw: string | null): StudioEditTurn[] {
  if (!raw) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(value)) return [];
  const turns: StudioEditTurn[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== "string" || !TARGETS.includes(item.target as StudioEditTarget) || typeof item.instruction !== "string" || !STATUSES.includes(item.status as StudioEditTurnStatus)) continue;
    const proposal = readProposal(item.proposal);
    let status = item.status as StudioEditTurnStatus;
    // 카드가 있어야 하는 상태인데 카드가 없으면 다시 만들게 한다
    if (["proposed", "applying", "applied", "undoing", "undone", "dismissed"].includes(status) && !proposal) status = "proposing";
    const retry = IN_FLIGHT[status] ?? (["propose", "apply", "undo"].includes(item.retry as string) ? item.retry as StudioEditRetry : undefined);
    const interrupted = status in IN_FLIGHT;
    turns.push({
      id: item.id, target: item.target as StudioEditTarget, label: typeof item.label === "string" ? item.label : "", instruction: item.instruction,
      ...(typeof item.sectionId === "string" && item.sectionId ? { sectionId: item.sectionId } : {}),
      status: interrupted ? "failed" : status,
      ...(proposal ? { proposal } : {}),
      ...(!interrupted && (status === "proposed" || status === "applied") ? { archived: true } : {}),
      ...(interrupted ? { error: STUDIO_EDIT_INTERRUPTED, retry } : status === "failed" ? { error: typeof item.error === "string" && item.error ? item.error : STUDIO_EDIT_INTERRUPTED, retry: retry ?? "propose" } : {}),
      at: typeof item.at === "number" ? item.at : 0,
    });
  }
  return turns.slice(-STUDIO_EDIT_TURN_LIMIT);
}

/** 오른쪽 칸이 던진 오류 → 손님에게 보일 한 줄. 칸이 한국어 문장을 던지면 그대로, 연결 끊김은 쉬운 말로 */
export function studioEditError(caught: unknown, fallback: string): string {
  if (!(caught instanceof Error)) return fallback;
  if (caught.name === "TypeError" || /failed to fetch|load failed|networkerror|network request failed/i.test(caught.message)) return "인터넷 연결이 잠시 끊겼어요. 다시 시도해 주세요.";
  if (caught.name === "AbortError") return "응답이 늦어 멈췄어요. 다시 시도해 주세요.";
  return /[가-힣]/.test(caught.message) ? caught.message : fallback;
}

/** 입력창 위 대상 칩의 글 — "홈페이지 고치기", "3장 사업 전략 고치기" */
export function studioTargetChipText(label: string): string {
  const name = label.trim() || "내용";
  return /고치기$/.test(name) ? name : `${name} 고치기`;
}

/** 장 이름만(끝의 '고치기'를 뗀다) — 기다리는 요청 말풍선 앞의 "[3장 시장과 고객]" */
export function sectionHint(label: string): string {
  return label.replace(/\s+/g, " ").replace(/\s*고치기$/, "").trim();
}

/* ── 계획서를 쓰는 동안 보낸 요청 대기열 ───────────────── */

export type QueuedStudioRequest = {
  id: string;
  text: string;
  /** 계획서 한 장을 고치던 중에 보낸 것이면 그 장 */
  section?: { label: string; sectionId?: string };
  at: number;
};

export function editTurnsKey(planId: string): string {
  return `oneul:studio-edit-turns:${planId}`;
}
export function requestQueueKey(planId: string): string {
  return `oneul:studio-request-queue:${planId}`;
}

export function readRequestQueue(raw: string | null): QueuedStudioRequest[] {
  if (!raw) return [];
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(value)) return [];
  const items: QueuedStudioRequest[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== "string" || typeof item.text !== "string" || !item.text.trim()) continue;
    const section = item.section && typeof item.section === "object" && typeof (item.section as Record<string, unknown>).label === "string" ? item.section as { label: string; sectionId?: unknown } : null;
    items.push({ id: item.id, text: item.text, ...(section ? { section: { label: section.label, ...(typeof section.sectionId === "string" && section.sectionId ? { sectionId: section.sectionId } : {}) } } : {}), at: typeof item.at === "number" ? item.at : 0 });
  }
  return items.slice(0, STUDIO_QUEUE_LIMIT);
}

/** 대기열에 넣기 — 꽉 찼거나 같은 글이 이미 기다리면 넣지 않는다(ok: false) */
export function enqueueRequest(queue: QueuedStudioRequest[], item: QueuedStudioRequest, limit = STUDIO_QUEUE_LIMIT): { queue: QueuedStudioRequest[]; ok: boolean } {
  const text = item.text.trim();
  if (!text || queue.length >= limit) return { queue, ok: false };
  if (queue.some(existing => existing.text.trim() === text && existing.section?.sectionId === item.section?.sectionId && existing.section?.label === item.section?.label)) return { queue, ok: false };
  return { queue: [...queue, { ...item, text }], ok: true };
}

export function cancelQueuedRequest(queue: QueuedStudioRequest[], id: string): QueuedStudioRequest[] {
  const next = queue.filter(item => item.id !== id);
  return next.length === queue.length ? queue : next;
}

/**
 * 계획서를 다 쓴 뒤 기다리던 요청을 어디로 보낼지 — 계획서 한 장 요청은 그 장을 고치는 처리기가 있으면 그리로,
 * 아니면 예전 채팅 수정(계획서 내용 바꾸기)으로, 채팅 수정도 꺼져 있으면 메모로만 남긴다.
 */
export function queuedRequestRoute(item: QueuedStudioRequest, available: { sectionHandler: boolean; editChat: boolean }): "section" | "edit" | "note" {
  if (item.section && available.sectionHandler) return "section";
  return available.editChat ? "edit" : "note";
}

/** 기다리는 요청 아래 한 줄 — 쓰는 중이면 '다 쓰면', 다 썼는데 앞 요청을 확인 중이면 그 뒤에 */
export function queuedRequestStatus(generating: boolean): string {
  return generating ? "대기 중 · 다 쓰면 반영할게요" : "대기 중 · 앞 요청을 확인하면 보낼게요";
}
