import type { BusinessDesign } from "../../lib/plan-builder/coach-design";

export function designFixture(scope = "동네 가게의 대표 메뉴를 촬영하고 사진과 소개문구를 전달하는 작은 상품을 제안합니다."): BusinessDesign {
  return {
    approach: "known-business",
    startingPlan: {
      scope,
      connectionToVision: "원래 구상을 유지하며 먼저 제공할 수 있는 범위만 나눈 제안입니다.",
      whyThis: "제공 범위를 좁혀 작업 부담을 확인하기 위한 제안입니다. 예산과 실제 수요는 아직 확인하지 못했습니다.",
      notIncluded: ["상시 고객 응대와 무제한 수정"],
    },
    alternatives: [{ name: "정기 제공", scope: "반복해서 제공하는 상품도 검토할 수 있습니다.", tradeoff: "일정과 제공 횟수를 먼저 합의해야 합니다." }],
    assumptions: [{ statement: "고객이 이 결과물에 비용을 지불할 의향이 있다는 가정입니다.", howToCheck: "상품 예시를 만들고 가능한 경우 관심 있는 사람에게 반응을 물어봅니다." }],
    nextAction: { action: "상품 예시 하나를 정리해봅니다.", doneWhen: "제공할 결과물과 제외할 범위가 적힌 예시가 있으면 완료입니다.", usableText: "이 상품은 합의한 범위의 결과물을 제공합니다. 추가 작업은 별도 협의합니다." },
  };
}
