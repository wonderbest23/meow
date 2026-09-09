import type { CoachField, CoachState } from "./coach";

export const COACH_FIELD_LABELS: Record<CoachField["key"], string> = {
  business: "사업 소개", customer: "주요 고객", offer: "제공할 상품", price: "판매 가격",
  budget: "준비 예산", cost: "매달 나가는 비용", unitCost: "한 건당 비용", volume: "월 판매 목표",
  sales: "현재 매출", channel: "고객을 만나는 곳", capacity: "운영 범위", problem: "해결할 문제",
  experience: "경험", goal: "목표", setupCost: "처음 드는 비용", hoursPerWeek: "주당 가능한 시간",
  minutesPerSale: "한 건에 필요한 시간",
};

export function changedCoachFields(previous: CoachState | null, next: CoachState): CoachField["key"][] {
  return next.fields.filter(field => {
    const before = previous?.fields.find(item => item.key === field.key);
    return !before || before.value !== field.value || before.basis !== field.basis;
  }).map(field => field.key);
}

// These acknowledgements use saved fields only; no additional model call or new business claims.
export function coachTurnSummary(previous: CoachState | null, next: CoachState): string {
  if (!previous?.ready) return next.stage === "operating"
    ? "말씀하신 사업을 바탕으로 개선안을 정리했어요. 내 사업안에서 제안한 내용을 확인해 주세요."
    : "첫 사업안을 만들었어요. 어떤 상품을 누구에게 제공할지 정리했으니, 내 사업안에서 확인해 주세요.";
  const changed = changedCoachFields(previous, next);
  const conditions = next.fields.filter(field => changed.includes(field.key) && ["price", "budget", "hoursPerWeek"].includes(field.key));
  if (conditions.length) return `${conditions.map(field => `${COACH_FIELD_LABELS[field.key]} ${field.value}`).join(" · ")}으로 반영했어요. 바뀐 사업안을 확인해 주세요.`;
  return "요청하신 내용을 사업안에 반영했어요. 더 바꾸고 싶은 부분은 편하게 말씀해 주세요.";
}
