import { COACH_KEY, COACH_VERSION, type CoachState, type CoachField } from "../lib/plan-builder/coach";
import { OPERATING_KEY, type OperatingPeriod } from "../lib/plan-builder/operating-records";
import type { ServerPlan } from "../lib/plan-builder/plan-server-store";

export function executiveFixture(stage: "exploring" | "startup" | "operating" = "startup", industry = "b2b_service", planType = "일반 사업계획서"): ServerPlan {
  const at = "2026-09-15T01:00:00.000Z";
  const values: Partial<Record<CoachField["key"], string>> = { business: "지역 제조사의 제품 소개 자료를 제작하는 온결 스튜디오", customer: "제품 설명 자료가 필요한 지역 제조사의 영업 담당자", offer: "제품 소개서와 납품용 원본 파일", price: "180만원", unitCost: "30만원", cost: "200만원", volume: "4", channel: "기존 거래처 소개와 직접 제안", goal: "다음 기간에 반복 발주 의사를 확인", experience: "제품 촬영과 편집 업무 경험" };
  const coach: CoachState = { version: COACH_VERSION, revision: 2, documentRevision: 2, stage, depth: "practical", ready: stage !== "exploring", messages: [], suggestions: [],
    business: { name: "온결 스튜디오", description: values.business!, role: "", industry, region: "", stage: stage === "operating" ? "운영 중" : "사업 기획" },
    fields: Object.entries(values).map(([key, value]) => ({ key: key as CoachField["key"], value, basis: key === "price" || key === "volume" ? "proposal" : "user", quote: value, messageId: "fixture-user" })),
    directAction: { sourceRevision: 2, action: "기존 거래처에 제품 소개서의 납품 범위와 수정 조건을 전달", doneWhen: "검토할 제품과 제공 자료를 회신받음", usableText: "제품 소개서 제작을 제안드립니다" },
  };
  const period = (id: string, start: string, end: string, revenue: number, expenses: number | null): OperatingPeriod => ({ id, start, end, revision: 1, createdAt: at, updatedAt: at, metrics: { inquiries: 8, orders: 3, revenue, expenses }, feedback: "납품 원본의 수정 편의성이 중요하다는 고객 의견", keep: "원본 파일 제공", change: "수정 범위를 계약 전에 확인", nextAction: "거래처에 변경된 수정 조건을 안내", successCriterion: "수정 조건에 대한 회신 기록", });
  return { id: "summary-fixture", title: coach.business.name, planType, createdAt: at, updatedAt: at, sections: {}, answers: { [COACH_KEY]: { state: coach }, ...(stage === "operating" ? { [OPERATING_KEY]: { version: 1, revision: 2, periods: [period("00000000-0000-4000-8000-000000000001", "2026-09-01", "2026-09-14", 5400000, null), period("00000000-0000-4000-8000-000000000002", "2026-08-01", "2026-08-31", 3600000, 2000000)], reports: [], analyses: [] } } : {}) } };
}
