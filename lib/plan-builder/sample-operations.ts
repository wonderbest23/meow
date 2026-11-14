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

/** 기간 기록 둘(앞 달 · 뒤 달)과 뒤 달 리포트 하나를 실제 저장 규칙으로 만든다 */
function twoMonths(name: string, periods: Array<{ id: string; at: string; input: PeriodInput }>, reportId: string, reportAt: string): OperatingState {
  let state = readOperatingState({});
  for (const period of periods) state = applyOperatingCommand(state, { action: "save", id: period.id, expectedRevision: null, input: period.input }, name, period.at);
  const latest = state.periods.find(period => period.id === periods[1].id), before = state.periods.find(period => period.id === periods[0].id) ?? null;
  if (latest) state = applyOperatingCommand(state, { action: "report", id: reportId, reference: referenceFor(latest, before) }, name, reportAt);
  return state;
}
const coffeeOperations = () => twoMonths("새벽커피", COFFEE_PERIODS, REPORT, "2026-02-02T09:10:00.000Z");

/*
 * 퇴근길 반찬가게 예시 둘 — 결제한 사람이 두 달 쓴 모습(대표 요청 2026-11-14: 예시의 유지보수 칸이 '아직 기간 기록이 없어요'로 비어 보였다).
 * 수치는 지어낸 예시 값이고 각 예시 계획서의 값에 맞췄다: 일반 모드 15,000원 · 한 묶음 비용 7,500원 · 월 고정비 280만원(본전 약 457묶음),
 * 전문가 모드 17,000원 · 7,000원 · 330만원. 나간 돈 = 판 묶음 × 한 묶음 비용 + 월 고정비.
 */
const banchanPeriods = (prefix: string, months: [orders: number, inquiries: number][], price: number, unitCost: number, fixed: number): Array<{ id: string; at: string; input: PeriodInput }> => [
  {
    id: `${prefix}01`, at: "2026-10-02T09:00:00.000Z",
    input: {
      start: "2026-09-01", end: "2026-09-30",
      metrics: { inquiries: months[0][1], orders: months[0][0], revenue: months[0][0] * price, expenses: months[0][0] * unitCost + fixed },
      feedback: "7시 넘어 오신 손님이 인기 반찬이 다 떨어졌다고 아쉬워했어요. 국이 있으면 좋겠다는 말도 여러 번 들었어요.",
      keep: "퇴근 시간(오후 6~8시)에 맞춘 진열과 3~4가지 묶음 구성",
      change: "늦게 오는 손님 몫이 남지 않아요. 전날 예약을 받아 볼게요.",
      nextAction: "홈페이지 문의로 전날 예약 받기",
      successCriterion: "10월 예약 묶음 하루 5개 이상",
    },
  },
  {
    id: `${prefix}02`, at: "2026-11-02T09:00:00.000Z",
    input: {
      start: "2026-10-01", end: "2026-10-30",
      metrics: { inquiries: months[1][1], orders: months[1][0], revenue: months[1][0] * price, expenses: months[1][0] * unitCost + fixed },
      feedback: "예약을 받으니 늦게 오신 손님도 원하는 묶음을 가져갔어요. 같은 반찬이 자주 나온다는 말이 있었어요.",
      keep: "전날 예약과 퇴근 시간 진열",
      change: "반찬이 겹쳐요. 주마다 바뀌는 반찬 표를 미리 알릴게요.",
      nextAction: "이번 주 반찬 표를 홈페이지와 매장 앞에 올리기",
      successCriterion: "11월 다시 온 손님 비율 40% 이상",
    },
  },
];
const BANCHAN: Record<string, () => OperatingState> = {
  sample_banchan_easy: () => twoMonths("퇴근길 반찬가게", banchanPeriods("5b2e7c10-9a4d-4e31-b7f2-1c6d8e0a2f", [[380, 24], [470, 41]], 15_000, 7_500, 2_800_000), "5b2e7c10-9a4d-4e31-b7f2-1c6d8e0a2f03", "2026-11-02T09:10:00.000Z"),
  sample_banchan_expert: () => twoMonths("퇴근길 반찬가게", banchanPeriods("5b2e7c10-9a4d-4e31-b7f2-1c6d8e0a3f", [[350, 21], [430, 37]], 17_000, 7_000, 3_300_000), "5b2e7c10-9a4d-4e31-b7f2-1c6d8e0a3f03", "2026-11-02T09:10:00.000Z"),
};

/** 예시 사업의 운영 기록 — 새벽커피와 퇴근길 반찬가게 둘은 두 달 기록과 리포트 하나, 다른 예시는 빈 기록 */
export function sampleOperatingState(planId: string): OperatingState {
  return planId === "sample_coffee" ? coffeeOperations() : BANCHAN[planId]?.() ?? readOperatingState({});
}
