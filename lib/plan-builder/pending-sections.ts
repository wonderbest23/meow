import { chaptersForType } from "./blueprint";

/*
 * 답은 있는데 본문이 아직 없는 '문서 섹션' — 서버가 만들고 있거나 만들 것.
 * plan.answers 에는 섹션 말고도 내부 저장 칸(__business_coach, __business_intake, intake/details …)이
 * 함께 들어 있다. 예전엔 그것까지 세서, 계획서가 다 끝나도 "생성 중"이 사라지지 않았다.
 */
export function pendingSectionKeys(plan: { planType: string; answers: Record<string, Record<string, unknown> | undefined>; sections: Record<string, unknown> }): string[] {
  const sectionKeys = new Set(chaptersForType(plan.planType).flatMap(chapter => chapter.sections.map(section => `${chapter.id}/${section.id}`)));
  return Object.keys(plan.answers).filter(key => {
    const answers = plan.answers[key];
    return sectionKeys.has(key) && !!answers && Object.keys(answers).length > 0 && !plan.sections[key];
  });
}
