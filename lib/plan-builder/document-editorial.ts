import type { SectionGenInput } from "./section-generator";
import { comparePeriods, metricValue, periodDays, periodLabel, previousPeriod, readOperatingState } from "./operating-records";

export const DOCUMENT_SECTOR_FOCUS = {
  b2b_service: "수행 범위, 납품물, 검수 기준, 견적과 일정",
  software: "사용자 문제, 실제 기능과 준비 중인 기능, 도입 과정, 요금 단위",
  cafe_food: "메뉴, 주문과 제공 과정, 객단가, 원가와 처리 가능한 수량",
  commerce: "상품 구성, 판매 채널, 배송과 반품, 상품별 손익",
  manufacturing: "제품 사양, 공정, 시험과 인증의 확인 상태, 생산량과 납기",
  education: "대상 학습자, 커리큘럼, 수업 운영, 학습 결과 확인 방법",
  local_service: "서비스 지역과 범위, 예약, 작업 과정, 건당 운영 조건",
  space: "공간의 실제 상태, 이용 조건, 예약, 이용률과 고정비",
  logistics: "물류 처리 과정, 서비스 지역, 물량과 단가, 예외 대응",
  content: "콘텐츠와 포트폴리오, 제작 과정, 납품 범위, 수정과 사용 권리",
  general: "고객 문제, 최소 제공안, 확인할 가정, 필요한 자원",
} as const;
export type DocumentSector = keyof typeof DOCUMENT_SECTOR_FOCUS;

const sectorPatterns: Array<[DocumentSector, RegExp]> = [
  ["software", /소프트웨어|SaaS|앱 개발|플랫폼|software/i], ["cafe_food", /카페|커피|음식|식당|베이커리|cafe|food/i],
  ["manufacturing", /제조|공장|생산 공정|manufactur/i], ["education", /교육|학원|수업|강의|education/i],
  ["logistics", /물류|운송|택배|logistics/i], ["space", /공간|숙박|호텔|공유 오피스|space/i],
  ["commerce", /쇼핑몰|온라인 판매|이커머스|유통|commerce/i], ["content", /콘텐츠|촬영|디자인|영상|content/i],
  ["local_service", /꽃집|미용|수리|청소|지역 서비스|local.service/i], ["b2b_service", /기업|B2B|컨설팅|대행|b2b.service/i],
];

export function documentSector(input: Pick<SectionGenInput, "business">): DocumentSector {
  const industry = input.business?.industry ?? "";
  if (industry in DOCUMENT_SECTOR_FOCUS) return industry as DocumentSector;
  const explicit = sectorPatterns.find(([, pattern]) => pattern.test(industry));
  return explicit?.[0] ?? sectorPatterns.find(([, pattern]) => pattern.test(`${input.business?.name ?? ""} ${input.business?.description ?? ""}`))?.[0] ?? "general";
}

export function documentEditorialPrompt(input: Pick<SectionGenInput, "business" | "planType">): string {
  return [
    "[문서 편집 기준]",
    "소제목은 일반적인 작성 안내 대신 이 사업의 결론을 드러냅니다. 각 항목은 결론을 먼저 쓰고 제공된 근거와 실행 행동으로 연결합니다.",
    "근거와 다음 행동을 짧은 소제목으로 구분하되 같은 결론을 세 번 다시 쓰지 않습니다. 문서 본문에 대한 작성 요령은 쓰지 않습니다.",
    `업종별 관점: ${DOCUMENT_SECTOR_FOCUS[documentSector(input)]}. 적용되지 않는 사항은 억지로 추가하지 않습니다.`,
    "실제 실적, 계획 목표, AI 제안, 산식 결과를 구별합니다. 기록의 시작일과 종료일을 유지하고 서로 다른 기간의 합계를 같은 월 실적으로 비교하지 않습니다.",
    "비용 미입력은 비용 없음과 다릅니다. 계산 블록에 없는 합계, 이익, 성장률, 달성률, 시장 수치와 출처를 만들지 않습니다.",
    "본문은 필요한 범위만 씁니다. 앞 항목의 문단을 복사하지 않으며 빈 소제목과 빈 표 셀을 남기지 않습니다. 모르는 항목은 확인할 방법과 함께 마지막 참고 사항에 모읍니다.",
    /운영|성장|확장/.test(`${input.business?.stage} ${input.planType}`)
      ? "운영 사업은 현재 실적과 변화, 원인 가설, 유지할 것과 바꿀 것, 다음 행동과 확인 지표 순으로 씁니다. 원인 가설을 입증된 원인으로 표현하지 않습니다."
      : "신규 사업은 대상 고객과 제공안, 선택 근거, 감당 가능한 시작 범위, 다음 행동과 확인 지표 순으로 씁니다. 아직 없는 실적을 목표로 대체해 성과처럼 보이게 하지 않습니다.",
  ].join("\n");
}

/** The operating engine owns comparison arithmetic; prompts never calculate it again. */
export function documentOperatingContext(answers: Record<string, unknown>): string {
  const state = readOperatingState(answers);
  const current = [...state.periods].sort((a, b) => b.end.localeCompare(a.end))[0];
  if (!current) return "";
  const baseline = previousPeriod(state.periods, current);
  return [
    "[사용자가 기록한 실제 운영 실적 - 외부 검증 아님]",
    `현재 기간: ${periodLabel(current)} (${periodDays(current)}일), 기록 버전 ${current.revision}`,
    `이전 기간: ${baseline ? `${periodLabel(baseline)} (${periodDays(baseline)}일), 기록 버전 ${baseline.revision}` : "없음"}`,
    ...comparePeriods(current, baseline).map(row => `${row.label}: 현재 ${metricValue(row.current, row.unit)}, 이전 ${metricValue(row.previous, row.unit)}, 합계 차이 ${row.delta === null ? "비교 불가" : metricValue(row.delta, row.unit)}`),
    baseline && periodDays(current) !== periodDays(baseline) ? "기간 길이가 달라 합계 차이를 성과 개선이나 성장률로 해석하지 않습니다. 임의 월 환산과 목표 달성률 계산도 금지합니다." : "합계 차이만으로 원인을 확정하지 않습니다.",
    `기록한 고객 반응: ${current.feedback || "미입력"}`,
    `유지할 점: ${current.keep || "미입력"}`, `바꿀 점: ${current.change || "미입력"}`,
    `다음 행동: ${current.nextAction || "미입력"}`, `확인 기준: ${current.successCriterion || "미입력"}`,
  ].join("\n");
}
