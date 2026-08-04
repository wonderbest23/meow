// 결제 전 노출되는 샘플 문서 3종 — 어드민이 실제 AI로 만든 완성본.
// 저장되지 않는 읽기 전용 데이터로, 목록·개요·문서 화면에서만 존재한다.

import { SAMPLE as COFFEE } from "./coffee";
import { SAMPLE as FLOWER_PSST } from "./flower-psst";
import { SAMPLE as FLOWER_FM } from "./flower-fm";

export interface SampleDoc {
  id: string;
  title: string;
  planType: string;
  sections: Record<string, { markdown: string; html: string }>;
}

export const SAMPLE_DOCS: SampleDoc[] = [COFFEE, FLOWER_PSST, FLOWER_FM].map((s) => ({
  id: s.id,
  title: s.title,
  planType: s.planType,
  sections: s.sections as SampleDoc["sections"],
}));

/** 샘플은 id 접두사로 판별 — 고치기·지우기·서버 저장 대상이 아니다 */
export function isSampleId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("sample_");
}
