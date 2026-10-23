import { applyOperatingCommand, readOperatingState, referenceFor, type OperatingState, type PeriodInput } from "./operating-records";

/*
 * 예시 사업(sample_*)의 유지보수 기록 — 보기 전용.
 *
 * 예시 사업은 브라우저에만 있는 읽기 전용 사업이라 서버의 운영 기록(/api/plan/operations)이 '이 사업을 찾을 수 없어요'로 답했다
 * (점검 r36). 그래서 첫 화면 '유지보수' 카드가 예시 대신 새 대화로 가야 했다. 예시 사업은 서버를 부르지 않고 이 기록을 보여 준다.
 * 저장하는 길(기간 기록 추가·수정·리포트 보관)은 화면에서 감춘다. 기록 모양이 실제 저장과 같도록 실제 저장 규칙(applyOperatingCommand)으로 만든다.
 * 수치는 새벽커피 예시 계획서(월 약 1,400건 · 객단가 4,900원)에 맞췄다.
 */
const DECEMBER = "7c1e4a52-3b9d-4f21-8a6e-0d5b2c9f1e01";
const JANUARY = "7c1e4a52-3b9d-4f21-8a6e-0d5b2c9f1e02";
const REPORT = "7c1e4a52-3b9d-4f21-8a6e-0d5b2c9f1e03";

const COFFEE_PERIODS: Array<{ id: string; at: string; input: PeriodInput }> = [
  {
    id: DECEMBER,
    at: "2026-01-02T09:00:00.000Z",
    input: {
      start: "2025-12-01", end: "2025-12-31",
      metrics: { inquiries: 38, orders: 1400, revenue: 6860000, expenses: 5900000 },
      feedback: "앱을 깔아야 주문할 수 있어서 처음 오신 손님이 그냥 줄을 서는 일이 많았어요.",
      keep: "8시 전 픽업 시간대와 이름만 확인하고 가져가는 동선",
      change: "앱 설치 없이 주문할 수 있는 길이 필요해요.",
      nextAction: "앱 설치 없이 주문하는 웹 주문 열기",
      successCriterion: "1월 신규 손님 첫 주문 전환율 31% → 40%",
    },
  },
  {
    id: JANUARY,
    at: "2026-02-02T09:00:00.000Z",
    input: {
      start: "2026-01-01", end: "2026-01-31",
      metrics: { inquiries: 52, orders: 1360, revenue: 6720000, expenses: 5850000 },
      feedback: "웹 주문을 연 뒤 앱 없이 첫 주문하는 손님이 늘었어요. 추운 날 아침에는 픽업 대기 시간을 묻는 문의가 많았어요.",
      keep: "웹 주문 첫 화면과 8시 전 픽업 시간대",
      change: "추운 날 건수가 줄어요. 단골에게 구독을 먼저 안내해 볼게요.",
      nextAction: "웹 주문 완료 화면에 원두 구독 안내 넣기",
      successCriterion: "2월 구독 가입 120명 이상",
    },
  },
];

function coffeeOperations(): OperatingState {
  let state = readOperatingState({});
  for (const period of COFFEE_PERIODS) state = applyOperatingCommand(state, { action: "save", id: period.id, expectedRevision: null, input: period.input }, "새벽커피", period.at);
  const january = state.periods.find(period => period.id === JANUARY);
  const december = state.periods.find(period => period.id === DECEMBER) ?? null;
  if (january) state = applyOperatingCommand(state, { action: "report", id: REPORT, reference: referenceFor(january, december) }, "새벽커피", "2026-02-02T09:10:00.000Z");
  return state;
}

/** 예시 사업의 운영 기록 — 새벽커피는 두 달 기록과 리포트 하나, 다른 예시는 빈 기록 */
export function sampleOperatingState(planId: string): OperatingState {
  return planId === "sample_coffee" ? coffeeOperations() : readOperatingState({});
}
