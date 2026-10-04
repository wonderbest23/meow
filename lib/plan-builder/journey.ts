import { businessChatHref, businessHubState, documentHref, workspaceHref } from "./business-hub";
import type { Plan } from "./plan-store";

/*
 * 사용자가 겪는 흐름은 네 단계가 전부다 — 대화로 시작해서, 계획서를 만들고,
 * 홈페이지를 만들고, 사업과 홈페이지를 계속 돌본다(유지보수).
 * 어느 화면에 있든 지금 몇 단계인지, 다음에 무엇을 누르면 되는지가 보여야 한다.
 */
export type JourneyStepId = "chat" | "document" | "homepage" | "care";
export type JourneyState = "done" | "active" | "todo";
/** 홈페이지 상태 — 서버에서 확인하기 전이면 null */
export type HomepageStatus = "none" | "draft" | "published" | null;

export const JOURNEY_LABELS: Record<JourneyStepId, string> = {
  chat: "대화",
  document: "사업계획서",
  homepage: "홈페이지",
  care: "유지보수",
};

export function homepageHref(id: string) { return `/plan/homepage?planId=${encodeURIComponent(id)}`; }
export function careHref(id: string) { return `${workspaceHref(id)}&tab=operations`; }

export function journeySteps(plan: Plan, homepage: HomepageStatus, runStatus?: string | null) {
  const hub = businessHubState(plan, runStatus);
  const state: Record<JourneyStepId, JourneyState> = {
    chat: hub.coach?.ready || hub.documents.length ? "done" : "active",
    document: hub.complete ? "done" : hub.documents.length || hub.running ? "active" : "todo",
    homepage: homepage === "published" ? "done" : homepage === "draft" ? "active" : "todo",
    /* 유지보수는 끝나는 단계가 아니다 — 홈페이지를 공개하면 그때부터 계속 이어진다 */
    care: homepage === "published" ? "active" : "todo",
  };
  const href: Record<JourneyStepId, string> = {
    chat: businessChatHref(plan.id),
    document: documentHref(plan.id),
    homepage: homepageHref(plan.id),
    care: careHref(plan.id),
  };
  return (Object.keys(JOURNEY_LABELS) as JourneyStepId[]).map(id => ({ id, label: JOURNEY_LABELS[id], state: state[id], href: href[id] }));
}

/** 계획서를 다 만든 뒤 크게 보여 줄 다음 할 일 하나 */
export function journeyNext(plan: Plan, homepage: HomepageStatus): { step: JourneyStepId; title: string; note: string; href: string } {
  if (homepage === "published") return { step: "care", title: "유지보수 하기", note: "홈페이지를 고치고, 문의와 실적을 관리해요", href: careHref(plan.id) };
  if (homepage === "draft") return { step: "homepage", title: "홈페이지 다듬고 공개하기", note: "만들어 둔 홈페이지를 고쳐서 인터넷에 공개해요", href: homepageHref(plan.id) };
  return { step: "homepage", title: "홈페이지 만들기", note: "이 계획서 내용으로 초안을 바로 만들어요", href: homepageHref(plan.id) };
}
