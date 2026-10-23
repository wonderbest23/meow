/*
 * 사업 여정의 단계 목록 — 가져오는 것이 없는 가벼운 파일이라 고객센터 안내(lib/support-chat/faq.ts) 같은 곳에서도 쓴다.
 * 상태 계산(journeySteps·journeyNext)은 journey.ts 에 있고, journey.ts 가 이 목록을 그대로 다시 내보낸다.
 */
export type JourneyStepId = "chat" | "document" | "homepage" | "launch" | "care";
export const JOURNEY_ORDER: readonly JourneyStepId[] = ["chat", "document", "homepage", "launch", "care"];
/*
 * 단계 이름은 여기 한 곳에서만 정한다 — 왼쪽 메뉴·작업실 탭과 머리줄·잠금 안내·사업 관리 탭·첫 화면이 모두 이 이름을 쓴다.
 * 예전엔 같은 4단계가 '사업 시작하기'·'개업 준비'·'사업 시작 준비'로 화면마다 달랐다(점검 2026-10-23).
 */
export const JOURNEY_LABELS: Record<JourneyStepId, string> = {
  chat: "대화",
  document: "사업계획서",
  homepage: "홈페이지",
  launch: "개업 준비",
  care: "유지보수",
};
/** 자리가 좁은 곳(작업실 머리줄 진행 단계·휴대폰 탭)에서 쓰는 같은 단계의 짧은 이름 */
export const JOURNEY_SHORT_LABELS: Record<JourneyStepId, string> = { ...JOURNEY_LABELS, document: "계획서" };
/** 운영 중인 사업은 4단계 이름이 다르다 — 개업 준비가 아니라 운영 개선 */
export const OPERATING_LAUNCH_LABEL = "운영 개선";
export function journeyLabel(id: JourneyStepId, operating = false) { return id === "launch" && operating ? OPERATING_LAUNCH_LABEL : JOURNEY_LABELS[id]; }
export function journeyShortLabel(id: JourneyStepId, operating = false) { return id === "launch" && operating ? OPERATING_LAUNCH_LABEL : JOURNEY_SHORT_LABELS[id]; }
/** 글로 순서를 설명할 때(고객센터 안내 등) 쓰는 말 */
const JOURNEY_PHRASES: Record<JourneyStepId, string> = {
  chat: "대화로 사업안 정리",
  document: "사업계획서 작성",
  homepage: "홈페이지 만들기",
  launch: "개업 준비(운영 중이면 운영 개선)",
  care: "유지보수",
};
const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥"];
/** "① 대화로 사업안 정리 → ② 사업계획서 작성 → … → ⑤ 유지보수" */
export function journeyStepsText(): string {
  return JOURNEY_ORDER.map((id, index) => `${CIRCLED[index]} ${JOURNEY_PHRASES[id]}`).join(" → ");
}
