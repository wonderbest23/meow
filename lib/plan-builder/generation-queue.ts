import { rememberRegenQuota } from "./regen-store";
import { activePlan, loadState, priorSectionsSummary, pushToServer, saveSection } from "./plan-store";

/**
 * 본문 생성을 뒤에서 처리하는 큐.
 *
 * 예전에는 '완료하고 생성'을 누르면 생성이 끝날 때까지 그 화면에 묶여 있었다.
 * 25개 섹션을 그렇게 하면 기다리는 시간만 쌓인다 — 이제 요청만 걸어 두고
 * 사용자는 바로 다음 질문으로 넘어간다. 결과는 도착하는 대로 저장된다.
 *
 * 앞 섹션의 결과가 뒤 섹션 생성에 참고되므로 한 번에 하나씩(순차) 돌린다.
 *
 * 가능하면 서버에 맡긴다(/api/plan/queue) — 그러면 창을 닫아도 계속 만들어진다.
 * 서버 워크플로를 쓸 수 없는 환경(로컬 개발)에서는 여기 브라우저 큐가 대신 돈다.
 */

export interface GenerationJob {
  key: string;
  /** 이 본문이 들어갈 플랜 — 끝날 때 활성 플랜이 바뀌어 있을 수 있다 */
  planId?: string;
  chapterId: string;
  sectionId: string;
  title: string;
  answers: Record<string, unknown>;
  /** 재무 계산에 필요한 플랜 전체 답변(현재 섹션·보정값 포함) */
  allAnswers: Record<string, Record<string, unknown>>;
}

type Listener = () => void;

const queue: GenerationJob[] = [];
const listeners = new Set<Listener>();
let current: GenerationJob | null = null;
/** 생성에 실패한 섹션 — 개요에서 다시 시도할 수 있게 남긴다 */
const failed = new Set<string>();

function notify() {
  for (const fn of listeners) fn();
}

export function subscribeGeneration(fn: Listener): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** 이 섹션이 지금 만들어지는 중인지(대기 포함) */
export function isGenerating(key: string): boolean {
  return current?.key === key || queue.some((job) => job.key === key);
}

/** 만들어지는 중인 섹션 수(대기 포함) */
export function generatingCount(): number {
  return (current ? 1 : 0) + queue.length;
}

/** 지금 만들고 있는 섹션 제목 */
export function generatingTitle(): string | null {
  return current?.title ?? null;
}

export function generationFailed(key: string): boolean {
  return failed.has(key);
}

export function failedCount(): number {
  return failed.size;
}

/*
 * 서버가 왜 거절했는지.
 *
 * 지금까지는 실패를 전부 '만들지 못했습니다' 한 줄로 뭉쳤다. 결제가 필요한
 * 것인지, 다시 생성 횟수를 다 쓴 것인지, 무료 문서 수가 찼는지 — 이유가
 * 다른데 화면은 같은 말을 했다. 서버가 보낸 설명을 그대로 들고 온다.
 */
let lastFailureMessage: string | null = null;

export function generationFailureMessage(): string | null {
  return lastFailureMessage;
}

async function runOne(job: GenerationJob): Promise<void> {
  const state = loadState();
  /*
   * 생성은 몇십 초가 걸린다. 그동안 사용자가 다른 플랜을 열면 활성 플랜이
   * 바뀐다 — 그때 활성 플랜에 저장하면 다른 사업의 문서에 이 본문이 들어간다.
   * 시작할 때의 플랜을 끝까지 들고 간다.
   */
  const plan = job.planId
    ? state.plans.find((p) => p.id === job.planId) ?? null
    : activePlan(state);
  if (!plan) throw new Error("PLAN_NOT_FOUND");

  const res = await fetch("/api/plan/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chapterId: job.chapterId,
      sectionId: job.sectionId,
      answers: job.answers,
      planTitle: plan.title,
      planType: plan.planType,
      planId: plan.id,
      business: state.business,
      priorSummary: priorSectionsSummary(job.key),
      allAnswers: job.allAnswers,
    }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { message?: string } | null;
    lastFailureMessage = typeof detail?.message === "string" ? detail.message : null;
    throw new Error(`GENERATE_FAILED_${res.status}`);
  }
  lastFailureMessage = null;
  const data = (await res.json()) as { markdown?: string; html?: string; quota?: unknown };
  /* 서버가 알려준 남은 횟수를 화면이 쓸 수 있게 담아 둔다 */
  rememberRegenQuota(plan.id, data.quota);
  if (!data.markdown || !data.html) throw new Error("GENERATE_EMPTY");
  saveSection(job.key, data.markdown, data.html, { keepPrevious: true, planId: plan.id });
}

async function drain(): Promise<void> {
  if (current) return;
  const next = queue.shift();
  if (!next) return;
  current = next;
  notify();
  try {
    await runOne(next);
    failed.delete(next.key);
  } catch {
    // 실패해도 다음 섹션은 계속 만든다 — 개요에서 다시 시도할 수 있게 표시만 남긴다
    failed.add(next.key);
  } finally {
    current = null;
    notify();
    void drain();
  }
}

/** 서버가 이어서 만들고 있는 섹션 수 — 창을 닫아도 도는 쪽 */
let serverPending = 0;

export function serverPendingCount(): number {
  return serverPending;
}

/** 브라우저 큐 + 서버 큐를 합친 대기 수(화면 표시용) */
export function totalPendingCount(): number {
  return generatingCount() + serverPending;
}

/** 서버에 맡긴 생성이 얼마나 남았는지 확인한다 */
export async function refreshServerPending(planId: string): Promise<void> {
  try {
    const res = await fetch(`/api/plan/queue?planId=${encodeURIComponent(planId)}`);
    if (!res.ok) return;
    const data = (await res.json()) as { pending?: number };
    const next = typeof data.pending === "number" ? data.pending : 0;
    if (next !== serverPending) {
      serverPending = next;
      notify();
    }
  } catch {
    // 확인에 실패해도 화면은 그대로 둔다 — 잘못된 0을 보여주지 않는다
  }
}

/**
 * 생성 요청을 걸어 둔다.
 *
 * 먼저 서버에 맡겨 본다 — 성공하면 창을 닫아도 계속 만들어진다.
 * 서버가 받지 못하면(로컬 개발·미로그인) 브라우저 큐로 대신 돌린다.
 */
export function enqueueGeneration(input: GenerationJob): void {
  // 지금 열려 있는 플랜을 새겨 둔다 — 끝날 때 활성 플랜이 바뀌어 있어도 여기로 간다
  const job: GenerationJob = { ...input, planId: input.planId ?? activePlan(loadState())?.id };
  failed.delete(job.key);
  void (async () => {
    if (await tryServerQueue(job)) return;
    const waiting = queue.findIndex((item) => item.key === job.key);
    if (waiting >= 0) queue[waiting] = job;
    else queue.push(job);
    notify();
    void drain();
  })();
  notify();
}

async function tryServerQueue(job: GenerationJob): Promise<boolean> {
  const state = loadState();
  const plan = (job.planId ? state.plans.find((p) => p.id === job.planId) : null) ?? activePlan(state);
  if (!plan) return false;
  /*
   * 본문이 이미 있는 섹션(답을 고쳐 다시 만드는 경우)은 서버 큐에 보내지 않는다.
   *
   * 서버 워크플로는 '처음 만들기' 전용이라 완성된 섹션을 건너뛴다 — 보내면
   * 조용히 무시되어 손님은 다시 만들어지길 기다리기만 하게 된다. 다시 만들기는
   * 브라우저 경로(/api/plan/generate)로 보내야 유료 횟수도 올바르게 센다.
   */
  if (plan.sections?.[job.key]?.markdown) return false;
  try {
    /*
     * 서버 워크플로는 저장된 답변을 읽어 본문을 만든다.
     * 방금 쓴 답변이 아직 올라가지 않았으면 '답변 없음'으로 건너뛰므로,
     * 큐에 걸기 전에 업로드가 끝나기를 기다린다.
     */
    await pushToServer();
    const res = await fetch("/api/plan/queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planId: plan.id,
        sections: [{ chapterId: job.chapterId, sectionId: job.sectionId }],
      }),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { started?: boolean };
    if (!data.started) return false;
    serverPending += 1;
    notify();
    return true;
  } catch {
    return false;
  }
}
