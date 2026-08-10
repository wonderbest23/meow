import { activePlan, loadState, priorSectionsSummary, saveSection } from "./plan-store";

/**
 * 본문 생성을 뒤에서 처리하는 큐.
 *
 * 예전에는 '완료하고 생성'을 누르면 생성이 끝날 때까지 그 화면에 묶여 있었다.
 * 25개 섹션을 그렇게 하면 기다리는 시간만 쌓인다 — 이제 요청만 걸어 두고
 * 사용자는 바로 다음 질문으로 넘어간다. 결과는 도착하는 대로 저장된다.
 *
 * 앞 섹션의 결과가 뒤 섹션 생성에 참고되므로 한 번에 하나씩(순차) 돌린다.
 */

export interface GenerationJob {
  key: string;
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

async function runOne(job: GenerationJob): Promise<void> {
  const state = loadState();
  const plan = activePlan(state);
  if (!plan) throw new Error("NO_ACTIVE_PLAN");

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
  if (!res.ok) throw new Error(`GENERATE_FAILED_${res.status}`);
  const data = (await res.json()) as { markdown?: string; html?: string };
  if (!data.markdown || !data.html) throw new Error("GENERATE_EMPTY");
  saveSection(job.key, data.markdown, data.html, { keepPrevious: true });
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

/** 생성 요청을 걸어 둔다. 이미 대기 중인 같은 섹션은 최신 답변으로 교체한다. */
export function enqueueGeneration(job: GenerationJob): void {
  failed.delete(job.key);
  const waiting = queue.findIndex((item) => item.key === job.key);
  if (waiting >= 0) queue[waiting] = job;
  else queue.push(job);
  notify();
  void drain();
}
