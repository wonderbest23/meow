import { businessChatHref, businessHubState, documentHref, workspaceHref } from "./business-hub";
import { launchStatus, launchSteps, readLaunch } from "./business-launch";
import { readCoach } from "./coach";
import type { Plan } from "./plan-store";
import { JOURNEY_ORDER, journeyLabel, type JourneyStepId } from "./journey-steps";
import { withJourneyGuide } from "./journey-guides";

/*
 * 사용자가 겪는 흐름은 다섯 단계가 전부다 — 대화로 시작해서, 계획서를 만들고, 홈페이지를 만들고,
 * 사업 시작을 준비하고(운영 중이면 운영 개선), 사업과 홈페이지를 계속 돌본다(유지보수).
 * 어느 화면에 있든 지금 몇 단계인지, 다음에 무엇을 누르면 되는지가 보여야 한다.
 * 단계 목록은 journey-steps.ts 한 곳에서 정한다 — 왼쪽 목록·공개 뒤 다음 단계·고객센터 안내가 모두 이 순서를 쓴다
 * (예전엔 메뉴는 5단계, 공개 뒤에는 4단계를 건너뛰고 유지보수, 고객센터는 4단계로 서로 달랐다 — 여정 점검 2026-10-22).
 */
export type JourneyState = "done" | "active" | "todo";
/** 홈페이지 상태 — 서버에서 확인하기 전이면 null */
export type HomepageStatus = "none" | "draft" | "published" | null;
export { JOURNEY_LABELS, JOURNEY_ORDER, JOURNEY_SHORT_LABELS, OPERATING_LAUNCH_LABEL, journeyLabel, journeyShortLabel, journeyStepsText, type JourneyStepId } from "./journey-steps";

export function homepageHref(id: string) { return `/plan/homepage?planId=${encodeURIComponent(id)}`; }
export function careHref(id: string) { return `${workspaceHref(id)}&tab=operations`; }
/** 개업 준비(운영 중이면 운영 개선) — 사업 관리의 준비 과정·홍보 키트 */
export function launchHref(id: string) { return `${workspaceHref(id)}&tab=launch`; }
/** 사업 관리 화면이 탭을 바꿀 때 보내는 신호 — 왼쪽 목록이 지금 탭을 다시 표시한다 */
export const WORKSPACE_TAB_EVENT = "oneulstart:workspace-tab";
/**
 * 왼쪽 목록이 사업 관리 화면에게 탭을 바꿔 달라고 보내는 신호 — 이미 사업 관리 화면에 있으면 링크로 주소만 바뀌고
 * 화면은 처음 연 탭 그대로였다(점검 2026-10-21). 화면이 받아서 자기 탭 바꾸기(저장 안 한 수정 확인 포함)로 처리한다.
 */
export const WORKSPACE_TAB_REQUEST = "oneulstart:workspace-tab-request";

/* 결제 화면에서 '나중에 하기'·← 가 돌아갈 곳 — 홈페이지 쪽 상품은 그 사업의 홈페이지, 나머지는 그 사업의 계획서 */
const PAY_HOMEPAGE_PRODUCTS = ["homepage", "domain", "domain-purchase", "tokens", "bundle"];
const RESULT_HOMEPAGE_PRODUCTS = ["homepage", "domain", "domain-purchase", "tokens"];
function payReturn(homepageSide: boolean, planId: string | null | undefined) {
  if (homepageSide) return planId ? homepageHref(planId) : "/plan/homepage";
  return planId ? documentHref(planId) : "/plan";
}
/** 결제 화면(/plan/pay)에서 돌아갈 곳 */
export function payBackHref(product: string | null | undefined, planId: string | null | undefined) { return payReturn(PAY_HOMEPAGE_PRODUCTS.includes(product ?? ""), planId); }
/** 결제 결과 화면(/plan/pay/result)에서 돌아갈 곳 — 묶음 상품은 결제가 끝나면 계획서부터 */
export function payResultBackHref(product: string | null | undefined, planId: string | null | undefined) { return payReturn(RESULT_HOMEPAGE_PRODUCTS.includes(product ?? ""), planId); }

/** 4단계(개업 준비·운영 개선) 진행 — 진행 방식을 정하면 진행 중, 모든 단계를 마치거나 미뤄 두면 완료 */
export function launchProgress(plan: Plan): JourneyState {
  const state = readLaunch(plan);
  if (!state.configured) return "todo";
  return launchSteps(plan, state).every(step => ["done", "skipped"].includes(launchStatus(state, step))) ? "done" : "active";
}

export function journeySteps(plan: Plan, homepage: HomepageStatus, runStatus?: string | null) {
  const hub = businessHubState(plan, runStatus);
  const operating = readCoach(plan.answers)?.stage === "operating";
  const state: Record<JourneyStepId, JourneyState> = {
    chat: hub.coach?.ready || hub.documents.length ? "done" : "active",
    document: hub.complete ? "done" : hub.documents.length || hub.running ? "active" : "todo",
    homepage: homepage === "published" ? "done" : homepage === "draft" ? "active" : "todo",
    launch: launchProgress(plan),
    /* 유지보수는 끝나는 단계가 아니다 — 홈페이지를 공개하면 그때부터 계속 이어진다 */
    care: homepage === "published" ? "active" : "todo",
  };
  const href: Record<JourneyStepId, string> = {
    chat: businessChatHref(plan.id),
    document: documentHref(plan.id),
    homepage: homepageHref(plan.id),
    launch: launchHref(plan.id),
    care: careHref(plan.id),
  };
  return JOURNEY_ORDER.map(id => ({ id, label: journeyLabel(id, operating), state: state[id], href: href[id] }));
}

export type JourneyNext = { step: JourneyStepId; title: string; note: string; href: string; secondary?: { title: string; href: string } };

/**
 * 계획서를 다 만든 뒤 크게 보여 줄 다음 할 일 하나(+ 건너뛰는 길 하나).
 * 홈페이지가 다음 단계지만 결제 없이도 개업 준비로 넘어갈 수 있다 — 예전엔 홈페이지 결제 화면에서 막혔다.
 * 홈페이지를 공개했으면 순서대로 4단계(개업 준비)부터, 그것까지 마쳤으면 유지보수.
 * 단계를 넘긴 다음 할 일에는 그 단계의 대화 세트(guide=, journey-guides.ts)를 싣는다 — 작업실이 말풍선과 미리 넣는 문장을 보인다.
 * 만들어 둔 홈페이지 다듬기(draft)는 단계를 넘긴 게 아니라 싣지 않는다.
 */
export function journeyNext(plan: Plan, homepage: HomepageStatus): JourneyNext {
  const operating = readCoach(plan.answers)?.stage === "operating";
  const launchTitle = `${journeyLabel("launch", operating)} 먼저 하기`;
  const launchDone = launchProgress(plan) === "done";
  const skipToLaunch = launchDone ? undefined : { title: launchTitle, href: launchHref(plan.id) };
  if (homepage === "published") {
    if (!launchDone) return { step: "launch", title: `${journeyLabel("launch", operating)}하기`, note: operating ? "지금 운영에서 바꿀 일과 홍보를 차례로 정리해요" : "업종 신고·사업자등록·결제·첫 홍보를 차례로 준비해요", href: withJourneyGuide(launchHref(plan.id), "homepage-published"), secondary: { title: "유지보수하기", href: careHref(plan.id) } };
    return { step: "care", title: "유지보수하기", note: "홈페이지를 고치고, 문의와 실적을 관리해요", href: withJourneyGuide(careHref(plan.id), "launch-done") };
  }
  if (homepage === "draft") return { step: "homepage", title: "홈페이지 다듬고 공개하기", note: "만들어 둔 홈페이지를 고쳐서 인터넷에 공개해요", href: homepageHref(plan.id), secondary: skipToLaunch };
  return { step: "homepage", title: "홈페이지 만들기", note: "이 계획서 내용으로 초안을 바로 만들어요", href: withJourneyGuide(homepageHref(plan.id), "plan-complete"), secondary: skipToLaunch };
}
