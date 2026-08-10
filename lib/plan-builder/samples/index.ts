// 결제 전 노출되는 샘플 문서 3종 — 어드민이 실제 AI로 만든 완성본.
// 저장되지 않는 읽기 전용 데이터로, 목록·개요·문서 화면에서만 존재한다.

import { SAMPLE as COFFEE } from "./coffee";
import { SAMPLE as FLOWER_PSST } from "./flower-psst";
import { SAMPLE as FLOWER_FM } from "./flower-fm";
import { SAMPLE_ANSWERS as COFFEE_ANSWERS } from "../sample-answers";

export interface SampleDoc {
  id: string;
  title: string;
  planType: string;
  sections: Record<string, { markdown: string; html: string }>;
  /*
   * 이 문서를 만든 답변.
   * 완성본만 보여주면 "무엇을 답하면 이런 글이 나오는지"를 알 수 없다.
   * 답변이 있는 샘플은 질문 화면에서 그대로 보여준다(수정은 막는다).
   */
  answers: Record<string, Record<string, unknown>>;
}

const SAMPLE_ANSWER_SETS: Record<string, Record<string, Record<string, unknown>>> = {
  // 새벽커피만 답변까지 준비돼 있다 — 나머지는 완성 문서만 보여준다
  sample_coffee: COFFEE_ANSWERS,
};

export const SAMPLE_DOCS: SampleDoc[] = [COFFEE, FLOWER_PSST, FLOWER_FM].map((s) => ({
  id: s.id,
  title: s.title,
  planType: s.planType,
  sections: s.sections as SampleDoc["sections"],
  answers: SAMPLE_ANSWER_SETS[s.id] ?? {},
}));

/** 샘플은 id 접두사로 판별 — 고치기·지우기·서버 저장 대상이 아니다 */
export function isSampleId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("sample_");
}
