/*
 * 돈 장 — 세 가지 경우의 12개월 통장 흐름(품질기준 6·7번, docs/사업계획서-품질기준-최종본-2026-10-09.md).
 * 신규 사업의 기본(2026-10-10 블라인드 검토 3회로 결정). PLAN_CASHFLOW_SCENARIOS=0 이면 예전 손익표로 돌아간다(서버 계산만 바뀐다).
 *
 * 예전 12개월 표는 처리량 최대치(빵집이면 하루 120개)를 매일 다 판다고 계산해 '1월부터 매달 흑자'로 보였다.
 * 새로 시작하는 사업은 실제 판매량을 모르므로, 판매량 하나를 정하지 않고 대표가 입력한 값에서 나오는 세 경우를 나란히 본다.
 * - 조심스러운 경우: 본전 판매량의 절반(가정 — Start Up Loans 현금흐름 안내의 '판매는 보수적으로'를 숫자로 둔 것)
 * - 본전: 고정비를 겨우 메우는 판매량
 * - 목표 경우: 대표가 입력한 목표(예: '6개월 안에 월 매출 1,200만원')까지 첫 달 조심스러운 경우에서 매달 같은 폭으로 늘어난다고 가정
 * 모든 경우는 처리량 최대치를 넘지 않는다. 숫자는 여기서만 계산하고 AI는 인용·해석만 한다.
 */
import { coachAmount, monthlyVolumeFromCapacity } from "./coach-feasibility";

export const cashflowScenariosEnabled = () => process.env.PLAN_CASHFLOW_SCENARIOS !== "0";

export type CashflowInputs = {
  unitPrice: number; unitVariableCost: number; monthlyFixedCost: number;
  capacity?: string; goal?: string; budget?: string; setupCost?: string;
  /** 대표 한 달 생활비. 0이면 고정비에 이미 들어 있다는 답이다(없음과 다르다) */
  livingCost?: string;
  /** 대표 상품 — '세트'처럼 처리량과 다른 단위로 파는지 알아보는 데만 쓴다 */
  offer?: string;
  /**
   * 매달 돈을 내는 손님(구독·월 계약)으로 버는 사업인지. 그러면 판매량은 '그달 새로 판 수'가 아니라 '지금 돈을 내는 손님 수'다
   * (2026-10-12 다섯 사업 시뮬레이션: 월 계약을 매달 새로 파는 것처럼 계산해 '일주일에 10곳을 찾아가야' 같은 숫자가 나왔다).
   */
  recurring?: boolean;
  /** 매장·사무실처럼 공간을 빌려 여는 사업인지 — 아니면 고정비(도구·통신·서버)가 준비 기간 첫날부터 나간다 */
  premises?: boolean;
  /** 사업 유형(business-types.ts) — 첫 유료 판매까지의 준비 기간을 정한다 */
  businessTypeId?: string | null;
};

/*
 * 첫 유료 판매까지의 준비 기간(주) — 사업 유형마다 다르다(2026-10-13 3차 검토: 모든 사업을 12주로 고정해
 * B2B는 5주차·앱은 9주차에 첫 판매를 하는 12주 장과 숫자가 어긋났다). 12주 장은 이 주차에 첫 판매를 둔다.
 */
export const PREP_WEEKS_BY_TYPE: Record<string, number> = { store: 12, space: 12, lesson: 8, ship: 8, platform: 8, app: 8, visit: 6, b2b: 6 };
const DEFAULT_PREP_WEEKS = 12;
/** 공간을 빌리는 사업은 계약부터 첫 판매까지(공사·신고) 월세가 나간다 — 두 달로 센다 */
const PREMISES_PREP_MONTHS = 2;
type Scenario = { key: "careful" | "breakeven" | "goal"; label: string; volumes: number[]; net: number[]; cumulative: number[] };
export type CashflowScenarios = {
  unit: string; daily: boolean; unitPrice: number; monthlyFixedCost: number; contribution: number; breakEven: number; capacity: { volume: number; note: string } | null;
  living: number | null; livingBreakEven: number | null; payFromMonth: number | null;
  goal: { revenue: number; months: number } | null; budget: number | null; setupCost: number | null;
  scenarios: Scenario[]; carefulWorst: number; setupLimit: number | null; runOut: { label: string; month: number }[];
  /** 진행·축소·변경을 가르는 판매량(월) — 장마다 기준이 달라지지 않게 여기서 한 번만 정한다(2026-10-10 블라인드 검토) */
  decision: { go: number; goLabel: string; floor: number };
  /** 조심스러운 경우 초기 지출에 따라 버티는 개월 수(초기 지출을 모를 때 대표가 정할 수 있게) */
  survival: Array<{ spend: number; months: number }>;
  /** 첫 유료 판매까지의 준비 기간(주) */
  prepWeeks: number;
  /** 준비 기간 동안 수입 없이 나가는 생활비 */
  prepLiving: number;
  /** 준비 기간에 나가는 고정비 — 공간을 빌리는 사업은 문 열기 두 달 전부터(계약·공사·신고), 아니면 준비 기간 내내 */
  prepFixed: number;
  /** 남은 준비 예산이 이 아래로 내려가면 계속할지 다시 정한다(조심스러운 경우 3개월 적자분) */
  stopReserve: number | null;
  /**
   * 초기 지출이 0원이어도 문 여는 날 남는 돈이 중단선보다 적다 — 중단선이 처음부터 깨져 판단에 쓸 수 없다
   * (2026-10-12 시뮬레이션: 네 사업에서 '문 열자마자 중단 검토'가 나왔다). 그러면 중단선 대신 시작 전 결정을 묻는다.
   */
  stopBroken: boolean;
  /** 판단선대로 가도(계획대로인 경우) 석 달 안에 중단선 아래로 내려간다 */
  stopBrokenOnPlan: boolean;
  /** 판단선대로 가도 통장이 바닥날 때, 그때까지 메워야 하는 돈 */
  paceShortfall: number | null;
  /** 조심스러운 경우 12개월 동안 통장을 0원 위로 두려면 메울 돈(판단선 기준 최소치보다 클 때만) */
  slowShortfall: number | null;
  /** 초기 지출을 이 금액 이하로 써야 문 여는 날 중단선 위에서 시작한다(초기 지출을 모를 때) */
  setupBeforeStop: number | null;
  /** 초기 지출 한도가 계획 경로(이 이름의 경우)까지 선 위에 남도록 줄어들었는지 */
  setupOnPlan: string | null;
  /** 계획 경로가 중단선 아래로 내려가 그동안 표의 같은 줄과 견줘야 하는 경우 */
  planDip: { label: string; recovery: number | null; lines: number[]; shortfall: number; hardLimit: number } | null;
  /** 판매가에 부가세 10%가 들어 있다고 볼 때(일반과세자) 한 건에 남는 돈과 생활비선(없으면 본전) */
  vat: { contribution: number; line: number };
  /** 처리량 최대치를 다 팔아도 생활비선(없으면 본전)에 못 미칠 때, 다 판 달에 남거나 모자라는 돈 */
  capacityNet: number | null;
  recurring: boolean;
  /** 공간을 빌려 여는 사업인지 */
  premises: boolean;
  /** 문 여는 날 남는 돈(초기 지출을 모르면 0원으로 본 최대치)과 조심스러운 경우 그 돈으로 버티는 개월 수 */
  opening: { cash: number; months: number } | null;
  /** 조심스러운 경우 문 연 뒤 6개월을 버티는 데 모자라는 돈(중단선을 둘 수 없을 때 시작 전 결정이 메울 금액) */
  coverNeeded: number | null;
  /** 매달 돈 내는 사업이 판단선대로 늘어도 통장이 바닥나는 달(문 연 뒤) */
  paceRunOut: number | null;
  /** 매달 돈을 내는 사업: 생활비선(없으면 본전)의 손님 수를 채우는 기간과 그동안 매달 새로 늘어야 하는 손님 수(해지 없을 때) */
  recurringPace: { months: number; perMonth: number } | null;
  /** 재방문·단골 수 목표(매달 판매량이 아닌 목표) */
  repeatGoal: { count: number; months: number; unit: string; label: string } | null;
  businessTypeId: string | null;
  /** 가격을 바꾸면 본전·생활비선이 어떻게 되는지(한 건당 비용은 같다고 가정) */
  priceAlternatives: Array<{ price: number; breakEven: number; livingLine: number | null }>;
  /** 처리량 단위와 판매 단위가 다를 수 있다는 알림(예: 하루 120개 vs 세트) */
  unitNote: string | null;
  /** 목표를 판매량으로 바꾼 근거(예: '가동률 50% = 월 390시간') — 없으면 매출로 보인다 */
  goalNote: string | null;
  /** 1회 값을 파는데 목표가 사람 수일 때의 환산(판매량은 '회') */
  sessionNote: string | null;
};

const MONTHS = 12;
/** 매달 돈을 내는 사업의 조심스러운 경우가 본전의 절반에 닿는 달(가정 — 손님이 0명에서 매달 같은 수씩 는다) */
const RECURRING_RAMP_MONTHS = 6;
const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
const count = (value: number, unit: string) => `${Math.round(value).toLocaleString("ko-KR")}${unit}`;
/*
 * 하루 환산(월 26일 영업) — 처리량을 '하루 ○개'로 답한 사업(매장·카페처럼 날마다 파는 곳)만 쓴다.
 * 주·월 단위로 일하는 사업(출장 촬영, 학원)에 '하루 약 1건'을 붙이면 엉뚱한 기준이 된다. 하루 1개가 안 되면 말하지 않는다.
 */
// 하루 10건이 안 되면 소수 한 자리까지 — '약 3건'과 '약 4건'처럼 반올림이 차이를 부풀리지 않게(2026-10-13 3차 검토: 3.46건과 3.58건)
const perDayCount = (value: number, unit: string) => (value < 10 ? `${Number(value.toFixed(1)).toLocaleString("ko-KR")}${unit}` : count(value, unit));
const perDay = (daily: boolean, monthly: number, unit: string, wrap: (text: string) => string) => (daily && monthly / 26 >= 1 ? wrap(`하루 약 ${perDayCount(monthly / 26, unit)}`) : "");
/** 경우가 두 개(목표가 매출이 아닐 때)인지 세 개인지 */
const kinds = (result: { scenarios: unknown[] }) => (result.scenarios.length === 3 ? "세 가지" : "두 가지");

/** '6개월 안에 월 매출 1,200만원' → 월 매출 12,000,000원, 6개월. 월 매출 목표가 아니면 null(다른 목표는 지어서 바꾸지 않는다) */
export function parseRevenueGoal(goal: string | undefined): { revenue: number; months: number } | null {
  const revenue = goal?.match(/월\s*매출\s*([\d,.]+\s*(?:억|천만|백만|만|천)?\s*원?)/);
  const amount = revenue ? coachAmount(revenue[1].replace(/\s/g, "").replace(/(\d)$/, "$1원")) : undefined;
  if (!amount) return null;
  return { revenue: amount, months: goalMonths(goal) };
}

/** '6개월 안에' → 6, '1년 안에' → 12. 없으면 6개월(목표까지 늘어나는 기간 가정) */
function goalMonths(goal: string | undefined): number {
  const months = Number(goal?.match(/(\d+)\s*개월/)?.[1] ?? 0);
  if (months >= 1 && months <= MONTHS) return months;
  return /1\s*년|일\s*년/.test(goal ?? "") ? MONTHS : 6;
}

/*
 * 판매량으로 적은 목표('6개월 안에 월 40건', '3개월 안에 하루 150잔') → 월 판매량. 매출 목표가 없을 때만 쓴다.
 * '재방문 고객 100명', '단골 가게 20곳'처럼 한 달 판매량이 아닌 목표는 바꾸지 않는다(없는 숫자를 만들지 않는다).
 */
export function parseVolumeGoal(goal: string | undefined): { volume: number; months: number } | null {
  // '월 거래 600건'처럼 단위 앞에 낱말 하나가 끼어도 읽는다(9차: 펫시터 목표를 못 읽어 한도 초과를 계산이 몰랐다)
  const monthly = goal?.match(/월\s*(?:[가-힣]+\s+)?([\d,]+)\s*(?:건|개|잔|명|곳|회|벌|박)(?:\s*판매)?/);
  const daily = goal?.match(/하루\s*([\d,]+)\s*(?:건|개|잔|명|회|벌)/);
  const volume = monthly ? Number(monthly[1].replace(/,/g, "")) : daily ? Number(daily[1].replace(/,/g, "")) * 26 : 0;
  return volume > 0 ? { volume, months: goalMonths(goal) } : null;
}

/** '6개월 안에 재방문 고객 100명', '3개월 안에 단골 20명' → 다시 온 손님 수 목표(한 달 판매량이 아니다) */
export function parseRepeatGoal(goal: string | undefined): { count: number; months: number; unit: string; label: string } | null {
  const repeat = goal?.match(/((?:재방문|단골|재구매)\s*(?:고객|손님|가게|가구)?)\s*([\d,]+)\s*(명|곳|가구)/);
  const count = repeat ? Number(repeat[2].replace(/,/g, "")) : 0;
  return count > 0 ? { count, months: goalMonths(goal), unit: repeat![3], label: `${repeat![1].replace(/\s+/g, " ")} ${count.toLocaleString("ko-KR")}${repeat![3]}` } : null;
}

/** 매달 돈을 내는 사업의 목표('6개월 안에 고객 가게 10곳', '1년 안에 유료 구독 500명') → 그때 돈을 내는 손님 수 */
export function parseActiveGoal(goal: string | undefined): { volume: number; months: number } | null {
  const active = goal?.match(/([\d,]+)\s*(?:곳|명|개사|팀|가구)/);
  const volume = active ? Number(active[1].replace(/,/g, "")) : 0;
  return volume > 0 ? { volume, months: goalMonths(goal) } : null;
}

/** 0명에서 시작해 months개월차에 to에 닿도록 매달 같은 수씩 는다 */
const rampFromZero = (to: number, months: number, cap: (volume: number) => number) =>
  Array.from({ length: MONTHS }, (_, i) => cap(to * Math.min(i + 1, months) / months));

export function buildCashflowScenarios(input: CashflowInputs): CashflowScenarios | null {
  const contribution = input.unitPrice - input.unitVariableCost;
  if (!(input.unitPrice > 0) || contribution <= 0 || input.monthlyFixedCost < 0) return null;
  const capacityParsed = monthlyVolumeFromCapacity(input.capacity);
  const capacity = capacityParsed && capacityParsed.volume > 0 ? { volume: capacityParsed.volume, note: capacityParsed.note } : null;
  // 16차 업종 점검(한국어 과외): '1:1 회화 60분'처럼 1회 값을 파는데 목표가 '정기 학생 10명'이면 학생 1명의 한 달 값으로 계산해 본전이 약 4배 가혹했다 — 판매량은 '회'로 세고 사람 수는 환산해서 보인다
  const perSession = /\d+\s*분|1\s*회|회당/.test(input.offer ?? "") && !/월\s*[\d,]/.test(input.offer ?? "") ? input.goal?.match(/([가-힣]+)\s*([\d,]+)\s*명/) : null;
  const weekly = Number(`${input.offer ?? ""} ${input.goal ?? ""}`.match(/주\s*(\d)\s*회/)?.[1] ?? 1);
  const session = perSession ? { perPerson: weekly * 4, weekly, people: Number(perSession[2].replace(/,/g, "")), who: perSession[1] } : null;
  const unit = session ? "번" : capacityParsed?.unit || (input.recurring ? "명" : "건");
  const cap = (volume: number) => Math.max(0, Math.min(capacity?.volume ?? Infinity, Math.round(volume)));
  const breakEven = Math.ceil(input.monthlyFixedCost / contribution);
  // 대표 생활비가 있으면 매달 나가는 돈에 더한다 — 사업이 대표 생활까지 감당해야 하는 경우(품질기준 7번)
  const living = coachAmount(input.livingCost) ?? null;
  const livingBreakEven = living ? Math.ceil((input.monthlyFixedCost + living) / contribution) : null;
  const careful = cap(Math.ceil(breakEven / 2));
  const recurring = !!input.recurring;
  const revenueGoal = parseRevenueGoal(input.goal), parsedVolume = revenueGoal ? null : parseVolumeGoal(input.goal) ?? (recurring ? parseActiveGoal(input.goal) : null);
  // 17차 맞대결(연습실, 두 차수 연속): '6개월 안에 가동률 50%'를 읽지 못해 목표 경우 줄이 없었다 — 처리 한도 × 비율로 바꾼다
  const utilization = !revenueGoal && !parsedVolume && capacity ? Number(input.goal?.match(/가동률\s*(\d+(?:\.\d+)?)\s*%/)?.[1] ?? 0) : 0;
  const utilizationGoal = utilization > 0 && utilization <= 100 ? { volume: Math.round(capacity!.volume * utilization / 100), months: goalMonths(input.goal) } : null;
  const volumeGoal = session && parsedVolume ? { volume: session.people * session.perPerson, months: parsedVolume.months } : parsedVolume ?? utilizationGoal;
  // 판매량 목표는 매출로 바꿔 같은 계산을 쓴다(표의 '대표 목표'도 매출로 보인다)
  const goal = revenueGoal ?? (volumeGoal ? { revenue: volumeGoal.volume * input.unitPrice, months: volumeGoal.months } : null);
  const make = (key: Scenario["key"], label: string, volumes: number[]): Scenario => {
    const net = volumes.map(volume => volume * contribution - input.monthlyFixedCost - (living ?? 0));
    const cumulative = net.reduce<number[]>((sum, value) => [...sum, (sum.at(-1) ?? 0) + value], []);
    return { key, label, volumes, net, cumulative };
  };
  const flat = (volume: number) => Array.from({ length: MONTHS }, () => volume);
  // 매달 돈을 내는 사업은 손님이 0명에서 쌓인다 — 첫 달부터 본전의 절반이 돈을 낸다고 보면 버티는 기간이 부풀려진다
  const scenarios = [
    make("careful", "조심스러운 경우", recurring ? rampFromZero(careful, RECURRING_RAMP_MONTHS, cap) : flat(careful)),
    // 매달 돈 내는 사업은 첫 달부터 손님이 꽉 차지 않는다 — 판단선(생활비선을 정한 기간에 채우는 길)을 표에 그대로 보인다(2026-10-13 4차: 메울 금액의 근거 줄이 표에 없었다)
    recurring
      ? make("breakeven", "판단선대로 느는 경우", Array.from({ length: MONTHS }, (_, i) => cap(Math.ceil((livingBreakEven ?? breakEven) * Math.min(i + 1, goal?.months ?? RECURRING_RAMP_MONTHS) / (goal?.months ?? RECURRING_RAMP_MONTHS)))))
      // 처리 한도에 막혀 생활비선(또는 본전)에 못 미치면 이름도 근거대로(2026-10-13 맞대결: '생활비까지 버는 경우'가 적자 줄이었다)
      : livingBreakEven ? make("breakeven", capacity && capacity.volume < livingBreakEven ? "처리 한도를 다 채운 경우" : "생활비까지 버는 경우", flat(cap(livingBreakEven))) : make("breakeven", capacity && capacity.volume < breakEven ? "처리 한도를 다 채운 경우" : "본전", flat(cap(breakEven))),
  ];
  if (goal) {
    // 실제 API 8건(캔들·펫시터): 목표가 한도를 넘으면 매달 볼 목표는 한도의 80%인데 표의 경로는 한도 100%까지 늘어 숫자가 갈렸다 — 경로도 80%에서 멈춘다
    const wanted = Math.ceil(goal.revenue / input.unitPrice);
    const target = capacity && wanted > capacity.volume ? Math.floor(capacity.volume * 0.8) : cap(wanted);
    const ramp = recurring
      ? rampFromZero(target, goal.months, cap)
      : Array.from({ length: MONTHS }, (_, i) => (i + 1 >= goal.months || goal.months <= 1 ? target : cap(careful + (target - careful) * i / (goal.months - 1))));
    // 16차 맞대결(펫시터): 목표(월 600건)가 한도(월 520건)를 넘어 한도에서 멈추는데 이름이 '목표 경우'라 목표에 닿는 것처럼 읽혔다
    scenarios.push(make("goal", capacity && Math.ceil(goal.revenue / input.unitPrice) > capacity.volume ? "한도의 80%까지 느는 경우" : "목표 경우", ramp));
  }
  const budget = coachAmount(input.budget) ?? null, setupCost = coachAmount(input.setupCost) ?? null;
  const carefulWorst = Math.min(0, ...scenarios[0].cumulative);
  // 2026-10-10 진단: 문 열기 전 약 3개월은 수입 없이 생활비만 나간다 — 빼지 않으면 초기 지출 한도가 그만큼 느슨해진다
  const prepWeeks = (input.businessTypeId && PREP_WEEKS_BY_TYPE[input.businessTypeId]) || DEFAULT_PREP_WEEKS;
  const prepMonths = prepWeeks / 4; // 12주 = 3개월(실행 장의 12주와 같은 셈)
  const prepLiving = Math.round((living ?? 0) * prepMonths);
  // 2026-10-12 시뮬레이션: 앱의 도구·서버비, 매장의 개업 전 월세처럼 준비 기간에도 고정비가 나간다
  // 실제 API 8건(2026-10-13, 연습실): 실행표는 계약(4주)부터 첫 판매(11주)까지 약 7주인데 월세를 한 달만 뺐다 — 계약·공사·신고 기간 두 달로 센다
  const prepFixed = Math.round(input.monthlyFixedCost * (input.premises ? Math.min(PREMISES_PREP_MONTHS, prepMonths) : prepMonths));
  const prepOut = prepLiving + prepFixed;
  const setupLimit = budget != null && setupCost == null ? budget + carefulWorst - prepOut : null;
  // 초기 지출을 알면 실제 통장 잔고(준비 예산 − 준비 기간에 나간 돈 − 초기 지출 + 누적)가 바닥나는 달을 센다
  const runOut = budget != null && setupCost != null
    ? scenarios.flatMap(s => { const month = s.cumulative.findIndex(value => budget - prepOut - setupCost + value < 0); return month >= 0 ? [{ label: s.label, month: month + 1 }] : []; })
    : [];
  // 목표 경우에 한 달 남는 돈(생활비를 뺀 뒤)이 처음 0원 이상이 되는 달 — 그 달부터 사업에서 생활비를 가져갈 수 있다
  const goalScenario = scenarios.find(s => s.key === "goal");
  const payIndex = living && goalScenario ? goalScenario.net.findIndex(value => value >= 0) : -1;
  /*
   * 판단 기준: 계약처럼 큰돈을 쓰기 전 수요가 '생활비까지 버는 판매량(생활비를 모르면 본전)'에 닿아야 진행한다.
   * 본전의 절반(조심스러운 경우)을 기준으로 삼으면 기준을 넘겨도 매달 적자라 진행 판단을 잘못하게 된다.
   */
  const decision = { go: livingBreakEven ?? breakEven, goLabel: livingBreakEven ? "생활비까지 버는 판매량" : "본전 판매량", floor: careful };
  // 초기 지출에 따라 버티는 기간 — 준비 예산의 20·40·60·80%를 100만 원 단위로. 조심스러운 경우의 실제 누적으로 센다(매달 같은 적자가 아닐 수 있다)
  const careful0 = scenarios[0];
  const lastsMonths = (cash: number) => { const month = careful0.cumulative.findIndex(value => cash + value < 0); return month < 0 ? MONTHS : month; };
  const survival = budget != null && careful0.net.some(value => value < 0)
    ? [...new Set([0.2, 0.4, 0.6, 0.8].map(share => Math.round(budget * share / 1_000_000) * 1_000_000))].filter(spend => spend > 0 && spend < budget).map(spend => ({ spend, months: lastsMonths(budget - spend - prepOut) }))
    : [];
  // 중단선: 조심스러운 경우 석 달 적자분(손님이 쌓이는 사업은 가장 큰 적자 석 달)
  const shortfall = Math.max(0, ...careful0.net.map(value => -value));
  const stopReserve = shortfall > 0 ? [...careful0.net].sort((a, b) => a - b).slice(0, 3).reduce((sum, value) => sum - Math.min(0, value), 0) : null;
  const openingMax = budget != null ? budget - prepOut - (setupCost ?? 0) : null;
  const stopBrokenAtOpen = stopReserve != null && openingMax != null && openingMax <= stopReserve;
  const opening = openingMax != null ? { cash: openingMax, months: lastsMonths(openingMax) } : null;
  // 부가세: 일반과세자가 부가세를 넣은 가격으로 받으면 판매가의 1/11은 나라에 낸다(매입세액 공제는 따로)
  const vatContribution = input.unitPrice / 1.1 - input.unitVariableCost;
  const vatLine = vatContribution > 0 ? Math.ceil((input.monthlyFixedCost + (living ?? 0)) / vatContribution) : Infinity;
  const capacityNet = capacity && capacity.volume < (livingBreakEven ?? breakEven) ? capacity.volume * contribution - input.monthlyFixedCost - (living ?? 0) : null;
  const paceMonths = goal?.months ?? RECURRING_RAMP_MONTHS;
  const recurringPace = recurring ? { months: paceMonths, perMonth: Math.ceil((livingBreakEven ?? breakEven) / paceMonths) } : null;
  // 2026-10-13 2차 검토: '메울 길을 정하라'만 있고 얼마인지 없었다 / 판단선대로 가도 5개월차에 바닥나는 걸 알리지 않았다
  // 2026-10-13 3차 검토: 메울 금액을 '접어야 할' 조심스러운 경우로 세면 따를 수 없는 숫자가 된다 — 매달 돈 내는 사업은 판단선(계획대로인 경우)으로 센다
  const pacePath = recurringPace ? scenarios[1].cumulative : null;
  const planPath = pacePath ?? careful0.cumulative;
  const roundUp = (value: number) => Math.ceil(value / 10_000) * 10_000;
  const paceIndex = pacePath && openingMax != null ? pacePath.findIndex(value => openingMax + value < 0) : -1;
  const paceRunOut = paceIndex >= 0 ? paceIndex + 1 : null;
  // 17차 맞대결(레시피 앱·SNS): 메울 돈이 계획 경로의 바닥(0원)만 메워, 메운 뒤에도 '한 달에 나가는 돈 아래면 다시 정함' 선에 바로 걸렸다 — 한 달 나가는 돈만큼 남게 센다
  const outPerMonth = input.monthlyFixedCost + (living ?? 0);
  const paceShortfall = pacePath && openingMax != null && paceRunOut ? roundUp(outPerMonth - (openingMax + Math.min(...pacePath))) : null;
  // 7차 맞대결: 판단선 기준 최소치만 주면 손님이 더 느리게 늘 때 첫 결정이 모자란다 — 조심스러운 경우 금액을 나란히 준다
  // 10차 맞대결(SNS): 12개월 끝까지 세면 판단에서 멈춰야 할 실패 경로를 끝까지 버틸 돈처럼 읽혔다 — 메울 금액과 같은 6개월까지
  const carefulLow = openingMax != null ? openingMax + Math.min(...careful0.cumulative.slice(0, 6)) : 0;
  const slowShortfall = paceShortfall && carefulLow < 0 && roundUp(outPerMonth - carefulLow) > paceShortfall ? roundUp(outPerMonth - carefulLow) : null;
  // 판단선대로 가도 석 달 안에 중단선 아래로 내려가면, 중단선은 처음부터 쓸 수 없는 선이다
  const stopBrokenOnPlan = !!(pacePath && stopReserve != null && openingMax != null && openingMax > stopReserve && pacePath.slice(0, 3).some(value => openingMax + value < stopReserve));
  const sixMonthLow = Math.min(0, ...planPath.slice(0, 6));
  const coverNeeded = (stopBrokenAtOpen || stopBrokenOnPlan) && openingMax != null && openingMax + sixMonthLow < outPerMonth ? roundUp(outPerMonth - (openingMax + sixMonthLow)) : null;
  const stopBroken = stopBrokenAtOpen || stopBrokenOnPlan;
  const stopStart = stopReserve != null && budget != null && setupCost == null && !stopBroken ? budget - prepOut - stopReserve : null;
  /*
   * 16차 업종 점검: 계획 경로(매달 내는 사업은 판단선, 아니면 목표 경우)가 중단선 아래로 내려가면 '선 위에서 시작하는 한도'만으로는 계획대로인데도 선이 깨진다.
   * 이사는 목표대로 가도 12개월 내내 선 아래였고(15차의 '4개월차부터 이 선'도 틀림), 한국어 과외는 한도까지 쓰면 첫 달에 선이 깨졌다.
   * 계획 경로가 선 위에 남는 한도를 주고, 그런 한도가 없으면 그 경로가 손실을 다 메울 때까지는 표의 같은 줄과 견준다.
   */
  const planScenario = recurring ? scenarios[1] : goalScenario ?? scenarios[1];
  const planLow = Math.min(0, ...planScenario.cumulative);
  const planGap = stopStart != null ? stopStart + planLow : null;
  const recoveryIndex = planScenario.cumulative.findIndex(value => value >= 0);
  const planDip = stopStart != null && planGap! <= 0 && openingMax != null
    ? { label: planScenario.label, recovery: recoveryIndex >= 0 ? recoveryIndex + 1 : null, lines: planScenario.cumulative.slice(0, 3).map(value => openingMax + value - shortfall), shortfall, hardLimit: openingMax + planLow }
    : null;
  const setupBeforeStop = stopStart == null ? null : planDip ? (planDip.hardLimit > 0 ? planDip.hardLimit : null) : planGap!;
  const setupOnPlan = stopStart != null && !planDip && planLow < 0 ? planScenario.label : null;
  // 대안 가격: 가격 크기에 맞는 단위(500원·1,000원·1만 원)로 한 칸 낮게, 한두 칸 높게
  const step = input.unitPrice < 10_000 ? 500 : input.unitPrice < 100_000 ? 1_000 : 10_000;
  const priceAlternatives = [input.unitPrice - step, input.unitPrice + step, input.unitPrice + step * 2]
    .filter(price => price - input.unitVariableCost > 0)
    .map(price => ({ price, breakEven: Math.ceil(input.monthlyFixedCost / (price - input.unitVariableCost)), livingLine: living ? Math.ceil((input.monthlyFixedCost + living) / (price - input.unitVariableCost)) : null }));
  const unitNote = /세트/.test(input.offer ?? "") && capacityParsed && !/세트/.test(capacityParsed.unit)
    ? `처리량(${capacityParsed.note})과 판매 단위(세트)를 같다고 보고 계산했습니다. 세트 하나에 상품이 여러 개 들어가면 팔 수 있는 세트 수가 그만큼 줄어듭니다.`
    : null;
  const sessionNote = session
    ? `가격 ${won(input.unitPrice)}은 1회 값이라 판매량은 '번(수업 횟수)'으로 셉니다. ${session.who} 1명이 주 ${session.weekly}회(한 달 ${session.perPerson}번, 가정)라면 목표 ${session.who} ${session.people.toLocaleString("ko-KR")}명은 월 ${count(session.people * session.perPerson, "번")}, ${livingBreakEven ? "생활비까지 버는 판매량" : "본전"} 월 ${count(livingBreakEven ?? breakEven, "번")}은 ${session.who} 약 ${Math.ceil((livingBreakEven ?? breakEven) / session.perPerson).toLocaleString("ko-KR")}명입니다. 실제 수업 횟수를 정하면 이 환산부터 고칩니다.`
    : null;
  return { unit, sessionNote, goalNote: utilizationGoal ? `가동률 ${utilization}% = 처리 한도 월 ${count(capacity!.volume, unit)}의 ${utilization}%, 월 ${count(utilizationGoal.volume, unit)}` : null, setupOnPlan, planDip, daily: /하루/.test(input.capacity ?? ""), unitPrice: input.unitPrice, monthlyFixedCost: input.monthlyFixedCost, contribution, breakEven, capacity, living, livingBreakEven, payFromMonth: payIndex >= 0 ? payIndex + 1 : null, goal, budget, setupCost, scenarios, carefulWorst, setupLimit, runOut, decision, survival, prepWeeks, prepLiving, prepFixed, stopReserve, stopBroken, stopBrokenOnPlan, paceShortfall, slowShortfall, setupBeforeStop, vat: { contribution: vatContribution, line: vatLine }, capacityNet, recurring, premises: !!input.premises, opening, coverNeeded, paceRunOut, recurringPace, repeatGoal: recurring ? null : parseRepeatGoal(input.goal), businessTypeId: input.businessTypeId ?? null, priceAlternatives, unitNote };
}

const capacityShort = (result: CashflowScenarios) => !!result.capacity && result.capacity.volume < (result.livingBreakEven ?? result.breakEven);

function scenarioBasis(result: CashflowScenarios, s: Scenario): string {
  if (s.key === "careful") return result.recurring ? `가정: ${result.sessionNote ? "그달 결제 횟수가" : "돈 내는 손님이"} 0에서 매달 같은 수씩 늘어 ${RECURRING_RAMP_MONTHS}개월차에 본전의 절반` : "가정: 본전 판매량의 절반";
  if (s.key === "breakeven" && result.recurring) return `${result.livingBreakEven ? "생활비선" : "본전"} ${count(result.livingBreakEven ?? result.breakEven, result.unit)}을 ${result.recurringPace!.months}개월에 채우도록 매달 같은 수씩 는다고 가정(판단 기준 줄과 같은 길)`;
  if (s.key === "goal" && result.recurring) return `대표 목표(${result.sessionNote ? "그달 결제" : "돈 내는 손님"} ${count(s.volumes.at(-1)!, result.unit)})까지 0에서 ${result.goal!.months}개월 동안 같은 폭으로 는다고 가정`;
  if (s.key === "breakeven" && result.livingBreakEven) return capacityShort(result) ? `처리량 최대치로도 고정비와 생활비(월 ${count(result.livingBreakEven, result.unit)})를 못 메움` : `고정비와 대표 생활비 월 ${won(result.living!)}을 겨우 메우는 ${result.recurring ? "돈 내는 손님 수" : "판매량"}`;
  if (s.key === "breakeven") return capacityShort(result) ? `처리량 최대치로도 본전(월 ${count(result.breakEven, result.unit)})에 못 미침` : `고정비를 겨우 메우는 ${result.recurring ? "돈 내는 손님 수" : "판매량"}`;
  const wanted = Math.ceil(result.goal!.revenue / result.unitPrice);
  if (result.capacity && wanted > result.capacity.volume) return `대표 목표(월 ${count(wanted, result.unit)})는 처리 한도(월 ${count(result.capacity.volume, result.unit)})를 넘어 닿을 수 없으므로, 한도의 80%(월 ${count(Math.floor(result.capacity.volume * 0.8), result.unit)})까지 ${result.goal!.months}개월 동안 같은 폭으로 는다고 가정`;
  return `대표 목표(${result.goalNote ?? `월 매출 ${won(result.goal!.revenue)}`})까지 ${result.goal!.months}개월 동안 같은 폭으로 는다고 가정`;
}

/** 준비 기간에 나가는 돈의 설명 — 생활비와 고정비 */
const prepOut = (result: CashflowScenarios) => result.prepLiving + result.prepFixed;
function prepText(result: CashflowScenarios): string {
  const parts = [result.prepLiving > 0 ? `생활비 ${won(result.prepLiving)}` : "", result.prepFixed > 0 ? `고정비 ${won(result.prepFixed)}(${result.prepFixed < Math.round(result.monthlyFixedCost * result.prepWeeks / 4) ? "문 열기 두 달 전부터" : "준비 기간 내내"})` : ""].filter(Boolean);
  return parts.join("과 ");
}

/** 통장 흐름을 바로 읽히는 문장으로 — 표 아래 주석과 다른 장의 참고값에 같이 쓴다 */
function cashflowFindings(result: CashflowScenarios): string[] {
  const lines: string[] = [];
  const careful = result.scenarios[0];
  if (result.recurringPace) lines.push(`매달 돈을 내는 사업이라 판매량은 ${result.sessionNote ? "'그달 결제된 수업 횟수'" : "'그달 돈을 내는 손님 수'"}입니다. ${result.livingBreakEven ? "생활비선" : "본전"} ${count(result.livingBreakEven ?? result.breakEven, result.unit)}을 ${result.recurringPace.months}개월 안에 채우려면 해지가 없을 때 매달 새로 약 ${count(result.recurringPace.perMonth, result.unit)}씩 늘어야 하고, 해지가 생기면 그만큼 더 필요합니다.`);
  if (result.living) lines.push(`대표 생활비 월 ${won(result.living)}을 나가는 돈에 넣었습니다. 생활비까지 벌려면 팔아야 하는 양은 월 ${count(result.livingBreakEven!, result.unit)}${perDay(result.daily, result.livingBreakEven!, result.unit, text => `, ${text}`)}입니다.`);
  if (careful.net.some(value => value < 0)) lines.push(careful.net.every(value => value === careful.net[0])
    ? `조심스러운 경우 매달 ${won(-careful.net[0])}씩 모자라, 12개월 동안 ${result.living ? "생활비를 포함해 " : "사업에서 "}모자라는 돈은 ${won(-result.carefulWorst)}입니다.`
    : `조심스러운 경우 첫 달 ${won(-careful.net[0])}이 모자라고, 12개월 동안 ${result.living ? "생활비를 포함해 " : "사업에서 "}가장 많이 모자라는 때의 누적은 ${won(-result.carefulWorst)}입니다.`);
  if (prepOut(result) > 0) {
    const weekly = ((result.living ?? 0) + result.monthlyFixedCost) / 4;
    // 실행 장이 첫 판매를 앞당기면 줄어드는 돈을 직접 곱해 쓰지 않도록 미리 준다(7차: 근거 없는 숫자로 잡혔다)
    /*
     * 8차 맞대결: '앞당기면 준비 기간 지출이 줄어든다'는 문 연 뒤에도 같은 돈이 매주 나간다는 점을 가렸다.
     * 같은 날짜로 견주면 나아지는 돈은 그 기간 판매분(조심스러운 경우 첫 달 판매 × 한 건에 남는 돈 ÷ 4)뿐이다.
     */
    const weeklySales = (result.scenarios[0].volumes[0] ?? 0) * result.contribution / 4;
    const earlier = weeklySales > 0 ? Array.from({ length: Math.min(result.prepWeeks - 1, 6) }, (_, i) => `${i + 1}주 약 ${won(weeklySales * (i + 1))}`) : [];
    lines.push(`이 계산은 첫 유료 판매 전 준비 기간을 가장 길게 ${result.prepWeeks}주로 잡았습니다(통장 표의 시작 잔고도 이 기준). 그동안 ${prepText(result)}이 수입 없이 준비 예산에서 나갑니다. 첫 판매를 앞당겨도 그 주들에 나가는 돈(한 주 약 ${won(weekly)})은 문 연 뒤에도 그대로 나가므로, 같은 날짜로 견주면 나아지는 돈은 그 기간에 판 돈뿐입니다${earlier.length ? `(조심스러운 경우 ${earlier.join(" · ")})` : ""}. 첫 판매가 늦어지면 그만큼 판매분이 덜 들어오고, 문 여는 날 잔고는 한 주에 약 ${won(weekly)}씩 줄어듭니다.`);
  }
  if (result.setupLimit != null) lines.push(result.setupLimit > 0
    ? `준비 예산 ${won(result.budget!)}에서 ${prepOut(result) > 0 ? "준비 기간에 나가는 돈을 빼고 " : ""}초기 지출을 ${won(result.setupLimit)} 이하로 써야 조심스러운 경우에도 문 연 뒤 12개월을 버팁니다. 보증금처럼 나중에 돌려받는 돈도 문 여는 날 통장에서는 빠지므로 초기 지출에 넣습니다.`
    : `조심스러운 경우 ${prepOut(result) > 0 ? "준비 기간에 나가는 돈과 " : ""}12개월 동안 모자라는 돈이 준비 예산 ${won(result.budget!)}보다 많습니다. 초기 지출 전에 이미 모자랍니다.`);
  // 중단선을 둘 수 없어도 멈출 기준은 있어야 한다(맞대결: 메운 돈까지 다 쓸 때까지 기준이 없었다)
  const monthlyOut = result.monthlyFixedCost + (result.living ?? 0);
  /*
   * 9차 맞대결(SNS): 메운 돈을 더해도 계획대로 가는 길의 잔고가 6개월 안에 '한 달에 나가는 돈' 아래로 내려가,
   * 다시 정하는 선이 계획대로인 2개월차에 걸렸다. 그럴 때는 절대 금액 대신 표의 같은 줄과 견준다.
   */
  const planRow = result.scenarios[result.recurring ? 1 : 0];
  const cover = result.coverNeeded ?? result.paceShortfall ?? 0;
  const planLow = result.opening ? result.opening.cash + cover + Math.min(...planRow.cumulative.slice(0, 6)) : Infinity;
  const fallbackStop = result.recurring && planLow < monthlyOut
    ? `대신 문 연 뒤에는 메운 돈을 더한 통장 잔고를 표의 '${planRow.label}' 줄(메운 돈을 더한 값)과 매달 견주어, 그보다 한 달에 나가는 돈(${won(monthlyOut)}) 이상 적어지면 계속할지 다시 정합니다. 계획대로 가도 잔고가 ${won(monthlyOut)} 아래로 내려가는 달이 있어, 잔고 금액 하나로 정하면 잘 되는 중에도 멈추게 되기 때문입니다.`
    : `대신 문 연 뒤에는 메운 돈을 더한 통장 잔고가 한 달에 나가는 돈(${won(monthlyOut)}) 아래로 내려가면 계속할지 다시 정합니다.`;
  if (result.stopBrokenOnPlan && result.opening) lines.push(`판단선대로 손님이 늘어도(계획대로인 경우) 석 달 안에 남은 준비 예산이 석 달 버틸 돈보다 적어져, 남은 준비 예산으로 정하는 중단선은 둘 수 없습니다. 시작하기 전에 다른 수입을 이어 갈지, 생활비·고정비를 줄일지, 준비 예산을 늘릴지 하나를 정합니다.${result.coverNeeded ? ` 문 연 뒤 6개월 동안 통장에 한 달 나가는 돈(${won(result.monthlyFixedCost + (result.living ?? 0))})이 남아 있으려면 약 ${won(result.coverNeeded)}을 이 방법들로 메워야 합니다. 이 금액은 최소치입니다(초기 지출 ${result.setupCost != null ? won(result.setupCost) : "0원"}, 세금${result.recurring ? "·해지" : ""} 빼고 — 견적이 나오면 그만큼 더 필요합니다).` : ""} ${fallbackStop}`);
  else if (result.stopBroken && result.opening) lines.push(`초기 지출이 ${result.setupCost != null ? won(result.setupCost) : "0원"}이어도 문 여는 날 남는 돈(${won(Math.max(0, result.opening.cash))})이 조심스러운 경우 석 달 적자분(${won(result.stopReserve!)})보다 적어, 문 연 뒤에 볼 중단선을 둘 수 없습니다. 조심스러운 경우 이 돈으로 문 연 뒤 ${result.opening.months < 1 ? "1개월도 버티지 못합니다" : result.opening.months >= 12 ? "12개월 이상 버팁니다" : `약 ${result.opening.months}개월 버팁니다`}. 시작하기 전에 다른 수입을 이어 갈지, 생활비·고정비를 줄일지, 준비 예산을 늘릴지 하나를 정합니다.${result.coverNeeded ? ` ${result.recurring ? "판단선대로 가도" : "조심스러운 경우"} 문 연 뒤 6개월 동안 통장에 한 달 나가는 돈(${won(result.monthlyFixedCost + (result.living ?? 0))})이 남아 있으려면 준비 예산 밖에서 약 ${won(result.coverNeeded)}을 이 방법들로 메워야 합니다. 이 금액은 최소치입니다(초기 지출 ${result.setupCost != null ? won(result.setupCost) : "0원"}, 세금${result.recurring ? "·해지" : ""} 빼고 — 견적이 나오면 그만큼 더 필요합니다).` : ""} ${fallbackStop}`);
  else if (result.stopReserve != null && result.budget != null) {
    const dip = result.planDip;
    const start = result.setupBeforeStop != null && !dip ? ` 문 여는 날 이 선 위에서 시작${result.setupOnPlan ? `하고 '${result.setupOnPlan}'대로 갈 때도 이 선 아래로 내려가지 않으${"려면"}` : "하려면"} 초기 지출을 ${won(result.setupBeforeStop)} 이하로 씁니다.` : "";
    const dipText = dip
      ? ` 다만 '${dip.label}'대로 가도 잔고가 이 선보다 낮아지는 달이 있어, 이 선만 보면 계획대로인데도 '다시 정함'이 됩니다. 그래서 ${dip.recovery ? `'${dip.label}'이 모자랐던 돈을 다 메우는 ${dip.recovery}개월차 전까지는` : "12개월 동안"} 잔고를 표의 '${dip.label}' 줄과 견주어, 그 줄에서 실제로 쓴 초기 지출과 한 달 적자분(${won(dip.shortfall)})을 뺀 값보다 낮으면 다시 정합니다(초기 지출 0원이면 ${dip.lines.map((value, i) => `${i + 1}개월차 ${won(value)}`).join(" · ")}).${dip.recovery ? ` ${dip.recovery}개월차부터 이 선을 씁니다.` : ""} ${dip.hardLimit > 0 ? `초기 지출을 ${won(dip.hardLimit)} 이하로 써야 '${dip.label}'대로 갈 때 가장 낮은 달에도 통장이 0원 아래로 내려가지 않습니다.` : `'${dip.label}'대로 가도 초기 지출 0원에서 통장이 0원 아래로 내려가므로 초기 지출 여유가 없습니다(메울 돈부터 정함).`}`
      : "";
    lines.push(`중단선: 문을 연 뒤 남은 준비 예산이 ${won(result.stopReserve)}(조심스러운 경우 석 달 적자분) 아래로 내려가면 계속할지 다시 정합니다.${start}${dipText}`);
  }
  // 9차 맞대결(펫시터): 목표(월 600건)가 한도(월 520건)를 넘는다고만 하고 대신 볼 목표가 없었다
  const goalTarget = result.goal ? Math.ceil(result.goal.revenue / result.unitPrice) : null;
  if (goalTarget && result.capacity && goalTarget > result.capacity.volume) lines.push(`대표 목표(월 ${count(goalTarget, result.unit)})가 처리 한도(월 ${count(result.capacity.volume, result.unit)})보다 많아 그대로는 닿을 수 없습니다. 한도를 늘릴 방법(사람·시간·자동화)을 정하기 전까지 매달 볼 판매 목표는 한도의 80%인 월 ${count(Math.floor(result.capacity.volume * 0.8), result.unit)}으로 둡니다.${result.livingBreakEven && result.livingBreakEven > result.capacity.volume ? " 다만 이 목표에 닿아도 생활비선이 한도 안에 들어오기 전까지는 매달 모자라므로 '계획대로'로 보지 않습니다." : ""}`);
  // 실제 API 8건(2026-10-13): 생활비를 안 적었거나 0원인 사업은 대표가 언제 생활비를 가져갈 수 있는지가 계획서에 없었다 — 흔한 두 금액으로 선을 보인다
  if (!result.living) {
    const lineFor = (amount: number) => Math.ceil((result.monthlyFixedCost + amount) / result.contribution);
    const examples = [1_000_000, 1_500_000].map(amount => `월 ${won(amount)}이면 생활비까지 버는 판매량 월 ${count(lineFor(amount), result.unit)}${result.capacity && lineFor(amount) > result.capacity.volume ? "(처리 한도를 넘음)" : ""}`);
    lines.push(`대표 생활비가 계산에 ${result.living === 0 ? "0원으로 들어가" : "빠져"} 있습니다. 나중에 사업에서 생활비를 가져가려면 ${examples.join(", ")}입니다(예시 금액). 1주차에 실제 생활비를 정하면 이 선부터 고칩니다.`);
  }
  if (result.unitNote) lines.push(result.unitNote);
  if (result.sessionNote) lines.push(result.sessionNote);
  for (const item of result.runOut) lines.push(`${item.label}에는 준비 예산에서 초기 지출을 뺀 돈이 ${item.month}개월차에 바닥납니다.`);
  const goal = result.scenarios.find(s => s.key === "goal");
  const recover = goal ? goal.cumulative.findIndex(value => value >= 0) : -1;
  if (result.living && goal) lines.push(result.payFromMonth ? `${goal.label}에는 ${result.payFromMonth}개월차부터 한 달 매출로 고정비와 생활비를 모두 메워, 그때부터 사업에서 생활비를 가져갈 수 있습니다. 그 전까지 생활비는 준비 예산에서 나갑니다.` : `${goal.label}에도 12개월 안에 한 달 매출로 생활비까지 메우지 못합니다.`);
  if (goal && goal.net[0] < 0) lines.push(recover >= 0 ? `${goal.label}에는 ${recover + 1}개월차에 그동안 모자랐던 돈을 모두 메웁니다.` : `${goal.label}에도 12개월 안에 그동안 모자랐던 돈을 다 메우지 못합니다.`);
  // 본전과 생활비선을 따로 말한다 — 예전엔 생활비선에 못 미쳐도 '본전에 못 미친다'고 써 틀렸다(펫시터: 한도 520건 > 본전 334건)
  if (result.capacity && result.capacity.volume < result.breakEven) lines.push(`처리량 최대치(${result.capacity.note})를 다 팔아도 본전에 못 미칩니다. 가격·고정비·처리량을 다시 봐야 합니다.`);
  else if (result.capacityNet != null && result.livingBreakEven) lines.push(`처리량 최대치(${result.capacity!.note})를 다 팔아도 생활비까지는 못 법니다. 다 판 달에도 생활비를 넣으면 ${won(-result.capacityNet)}이 모자랍니다. 판매를 늘리는 것보다 가격·수수료·처리량을 먼저 다시 정해야 합니다.${capacityFixLine(result)}`);
  if (result.paceRunOut) lines.push(`판단선대로 손님이 늘어도(계획대로인 경우) 통장은 문 연 뒤 ${result.paceRunOut}개월차에 바닥납니다. 그 전에 약 ${won(result.paceShortfall ?? 0)}(가장 낮은 달에도 한 달 나가는 돈이 남는 금액)을 메울 길(다른 수입·예산 늘리기)을 정해 두지 않으면 잘 되고 있어도 멈춰야 합니다.${result.slowShortfall ? ` 이 금액은 판단선대로 늘 때의 최소치입니다. 손님이 더 느리게 늘면(조심스러운 경우) 문 연 뒤 6개월까지 약 ${won(result.slowShortfall)}이 필요합니다. 그때까지 판단선의 절반에도 못 미치면 시작안을 바꾸므로, 그 뒤 적자를 메울 돈은 따로 마련하지 않습니다. 메울 금액은 '최소 ${won(result.paceShortfall ?? 0)}, 느리면 약 ${won(result.slowShortfall)}'으로 잡습니다.` : ""}`);
  // 공간 없는 사업의 고정비는 나뉘지 않은 경우가 많다 — 절반이면 결론이 어떻게 바뀌는지(맞대결: 모든 결론이 나뉘지 않은 고정비 하나에 달려 있었다)
  if (!result.premises && result.monthlyFixedCost > 0) {
    const half = result.monthlyFixedCost / 2;
    const halfBreakEven = Math.ceil(half / result.contribution), halfLiving = result.living ? Math.ceil((half + result.living) / result.contribution) : null;
    lines.push(`월 고정비 ${won(result.monthlyFixedCost)}이 무엇으로 이루어졌는지 1주차에 나눠 적습니다. 고정비가 절반(${won(half)})이면 본전은 월 ${count(halfBreakEven, result.unit)}${halfLiving ? `, 생활비선은 월 ${count(halfLiving, result.unit)}` : ""}으로 바뀝니다.`);
  }
  // 부가세(2026-10-12 시뮬레이션: 다섯 사업 모두 가격에 부가세가 들었는지 정하지 않아 한 건에 남는 돈이 부풀려졌다)
  // 8차 맞대결: '생활비까지 버는 경우'가 월 몇만 원만 남는데, 부가세를 넣으면 이 줄도 적자라는 점이 표에 없었다
  const thin = result.scenarios[1];
  const thinNet = thin && thin.key === "breakeven" && !result.recurring ? thin.net[0] : null;
  if (thinNet != null && thinNet >= 0 && thinNet < result.monthlyFixedCost * 0.1 && Number.isFinite(result.vat.line)) {
    const vatNet = Math.round(thin.volumes[0] * result.vat.contribution - result.monthlyFixedCost - (result.living ?? 0));
    if (vatNet < 0) lines.push(`'${thin.label}'도 한 달에 ${won(thinNet)}만 남습니다(세금 전). 판매가에 부가세가 들어 있으면(일반과세자) 이 경우도 매달 약 ${won(-vatNet)}씩 모자라고, 결제 수수료(카드 수수료, 판매·예약 플랫폼 이용료)도 이 계산에 빠져 있습니다. 이 줄을 '버는 경우'로 읽지 않습니다.`);
  }
  if (Number.isFinite(result.vat.line)) lines.push(`판매가 ${won(result.unitPrice)}에 부가세가 들어 있다면(일반과세자) 한 건에 남는 돈은 약 ${won(result.vat.contribution)}으로 줄고, ${result.livingBreakEven ? "생활비선" : "본전"}은 월 ${count(result.vat.line, result.unit)}이 됩니다. 간이과세자는 계산이 다르므로, 사업자등록 때 과세 유형과 가격에 부가세를 넣을지를 함께 정합니다.`);
  return lines;
}

/** 목표 경우의 월별 판매선 — 실행 장의 '매달 볼 숫자' 목표로 쓴다 */
function goalLine(result: CashflowScenarios): string {
  const goal = result.scenarios.find(s => s.key === "goal");
  // 매달 돈을 내는 사업은 판단 기준 줄의 월별 선이 매달 볼 목표다 — 두 줄이면 같은 달 결론이 갈린다
  if (!goal || !result.goal || result.recurring) return "";
  const months = goal.volumes.slice(0, result.goal.months).map((volume, i) => `${i + 1}개월차 ${count(volume, result.unit)}`);
  // 17차 맞대결(캔들): 판매선(45개)과 '계획대로' 선(25개)이 함께 있어 30개를 판 달을 어떻게 읽을지 알 수 없었다
  return `- ${goal.label} 월별 판매선(매달 볼 숫자의 목표, 실행 장에서 씀): ${months.join(", ")}. 판매선은 목표입니다. 판매선에 못 미쳐도 판단 기준의 '계획대로' 선 이상이면 계획대로이고(목표보다 느리므로 알리는 방법을 손봄), 판정은 판단 기준 줄 하나로 합니다.`;
}

/** 같은 기간끼리 비교하도록 하루(월 26일)·일주일(월 4.3주)·한 달을 함께 쓴다 */
const periods = (daily: boolean, monthly: number, unit: string) => [perDay(daily, monthly, unit, text => text), monthly / 4.3 >= 1 ? `일주일 약 ${count(monthly / 4.3, unit)}` : "", `한 달 ${count(monthly, unit)}`].filter(Boolean).join(" / ");
const monthsText = (months: number) => (months >= 12 ? "12개월 이상" : months < 1 ? "1개월도 못 버팀" : `약 ${months}개월`);

/*
 * 판단 기준 — 출시 전과 문 연 뒤 두 번(2026-10-11 유형 시뮬레이션 검토: 출시 전에 판매량 기준을 그대로 쓰면
 * 새로 모은 예약 의사로는 닿을 수 없거나 너무 느슨했다). 출시 전에는 작은 표본의 실제 비율과 '닿아야 하는 사람 수'로 본다.
 * 비율별 사람 수는 여기서 계산한다 — 본문이 숫자를 만들지 않게.
 */
function decisionLines(result: CashflowScenarios): string[] {
  const { decision, unit, recurringPace: pace } = result;
  // 매달 돈을 내는 사업은 쌓이는 손님 수로 본다 — 결제를 연 지 몇 주 만에 한 달 목표와 비교하면 잘 되는 시험도 '바꾼다'가 된다
  // 판단선과 매달 목표를 한 줄로(2026-10-13 2차 시뮬레이션: '지난 달 수 × 2곳'과 목표 월별선이 따로 있어 같은 달에 결론이 갈렸다)
  const checkpoints = pace ? Array.from({ length: pace.months }, (_, i) => `${i + 1}개월차 ${count(Math.ceil(decision.go * (i + 1) / pace.months), unit)}`).join(", ") : "";
  const first = pace
    ? `판단 기준(실행 장에서 씀, 매달 볼 숫자의 목표도 이 줄): 결제를 연 뒤 ${result.sessionNote ? "그달 결제된 횟수" : "돈을 내는 손님 수"}가 ${checkpoints} 이상이면 계획대로, 그 절반 이상이면 규모(쓰는 돈·시간·상품 수)를 줄여서, 절반 미만이면 시작안을 바꿉니다. ${result.sessionNote ? decision.goLabel : decision.goLabel.replace("판매량", "손님 수")} ${count(decision.go, unit)}을 ${pace.months}개월에 채우는 선입니다. 같은 때 해지한 손님 수도 함께 봅니다. 판단은 계약처럼 큰돈을 쓰기 전(출시 전)에 한 번, 결제를 연 뒤에 다시 합니다.`
    : `판단 기준(실행 장에서 씀): ${decision.goLabel}(${periods(result.daily, decision.go, unit)}) 이상이면 계획대로, 그보다 적고 본전의 절반(${periods(result.daily, decision.floor, unit)})보다 많으면 규모(쓰는 돈·시간·상품 수)를 줄여서, 본전의 절반 이하면 시작안을 바꿉니다. 판단은 계약처럼 큰돈을 쓰기 전(출시 전)에 한 번, 문을 연 뒤에 다시 합니다.`;
  // 처리 한도로 닿을 수 없는 기준은 그대로 쓰지 않는다(2026-10-13: 펫시터 생활비선 778건 > 한도 520건인데 판단 기준으로 썼다)
  const unreachable = result.capacity && result.capacity.volume < decision.go
    ? ` 다만 ${decision.goLabel}(월 ${count(decision.go, unit)})이 처리 한도(월 ${count(result.capacity.volume, unit)})보다 많아 판매량만으로는 닿을 수 없습니다. 그래서 '계획대로'는 한도의 80% 이상을 채우고 가격·수수료를 바꾼 안의 생활비선이 한도 안에 들어올 때로 봅니다. 판단표 맨 윗줄에 닿을 수 없는 월 ${count(decision.go, unit)}을 쓰지 않습니다.`
    : "";
  const reach = (rate: number) => {
    const monthly = Math.ceil((pace ? pace.perMonth : decision.go) / rate);
    return result.daily ? `하루 약 ${Math.ceil(monthly / 26).toLocaleString("ko-KR")}명` : monthly / 4.3 >= 1 ? `일주일 약 ${Math.ceil(monthly / 4.3).toLocaleString("ko-KR")}명` : `한 달 ${monthly.toLocaleString("ko-KR")}명`;
  };
  // 10차 맞대결(네일·SNS): 부가세 주석이 기준선을 바꾸는데 매달 목표에는 바뀐 선이 없었다
  const vatGo = Number.isFinite(result.vat.line) && result.vat.line > decision.go && !(result.capacity && result.capacity.volume < decision.go)
    ? ` 판매가에 부가세가 들어 있으면(일반과세자) 이 선은 월 ${count(result.vat.line, unit)}으로 바뀝니다. 매달 볼 숫자에 두 선을 함께 적고, 사업자등록 뒤 과세 유형에 맞는 선 하나만 남깁니다.`
    : "";
  // 업종 점검(2026-10-13): 앱은 결제 손님 수만, 공간 대여는 대화 비율로 판단해 그 업종의 판단 단위와 어긋났다
  const typeJudge: Record<string, string> = {
    app: "앱·콘텐츠형은 결제 손님 수보다 먼저 그달 실제로 쓴 사람(활성 이용자)과 2주 안 재방문 비율을 매달 봅니다. 위 손님 수 선은 돈이 버티는지 보는 참고선이고, 1~3개월차 판단은 활성 이용자·재방문·결제 비율로 합니다.",
    space: "공간 대여는 신고 전에 돈을 받을 수 없으므로, 출시 전 판단은 대화 비율보다 비슷한 공간의 예약 달력(가동률)과 문의 수로 합니다.",
    platform: "연결형은 공급자(돌봄·서비스를 하는 사람)를 먼저 확인·등록합니다. 신청 창구는 하루 처리량을 감당할 공급자가 등록된 뒤 엽니다.",
  };
  const typeLine = result.businessTypeId && typeJudge[result.businessTypeId] ? [typeJudge[result.businessTypeId]] : [];
  /*
   * 17차 맞대결(펫시터·캔들·연습실): 목표 경우는 첫 달 조심스러운 경우(=본전의 절반)에서 출발해 늘어나는데, 판단 기준은 첫 달부터 생활비선(본전)이라
   * 목표대로 가도 '줄여서'·'바꿈'으로 판정됐다. 늘어나는 동안은 그 달 판매선을 '계획대로' 선으로 쓴다(매달 돈 내는 사업의 판단선과 같은 방식).
   */
  const goalPath = !pace ? result.scenarios.find(s => s.key === "goal") : undefined;
  const goEff = result.capacity && result.capacity.volume < decision.go ? Math.ceil(result.capacity.volume * 0.8) : decision.go;
  const rampMonths = goalPath && result.goal ? goalPath.volumes.slice(0, result.goal.months).findIndex(volume => volume >= goEff) : -1;
  const rampCount = goalPath && result.goal ? (rampMonths < 0 ? Math.min(result.goal.months, MONTHS) : rampMonths) : 0;
  const ramp = goalPath && rampCount > 0
    ? ` 다만 손님이 늘어나는 처음 ${rampCount}개월은 '${goalPath.label}' 판매선(${goalPath.volumes.slice(0, rampCount).map((volume, i) => `${i + 1}개월차 ${count(volume, unit)}`).join(", ")})을 그 달의 '계획대로' 선으로 씁니다. 그 선 이상이면 계획대로, 그 절반 이상이면 규모를 줄여서, 절반 미만이면 시작안을 바꿉니다.${rampCount < MONTHS ? ` ${rampCount + 1}개월차부터 위 선을 씁니다.` : ""}`
    : "";
  return [
    first + unreachable + ramp + vatGo,
    `출시 전 판단: 돈을 받고 실제로 팔아 볼 수 있으면(이미 신고된 공간·시범 판매) 실제 판매 수를 위 기준과 같은 기간끼리 비교합니다. 시범 판매가 일부 시간·자리만 쓰면(예: 남의 가게 저녁 한 자리 2주) 판매 수를 그대로 비교하지 않고 연 시간 중 채운 비율과 재예약으로 봅니다. 아직 팔 수 없으면 판매량 기준을 그대로 쓰지 않습니다. 새로 모은 예약 의사 수는 수요보다 '얼마나 닿았는지'를 재기 때문입니다. 대신 작은 표본에서 잰 실제 비율(체험한 사람 중 등록한 비율, 찾아간 곳 중 계약한 비율, 문의한 사람 중 날짜를 잡거나 돈을 낸 비율)과 경쟁 자료(비슷한 가게의 빈자리·예약 달력·가동률)로 판단합니다. 비율의 분모는 직접 이야기를 나눈 사람(찾아간 곳·체험한 사람·문의한 사람), 분자는 날짜를 잡거나 돈을 낸 사람입니다. 글을 본 사람 수(노출)는 분모로 쓰지 않고, 질문에 얼마나 꼼꼼히 답했는지도 비율로 쓰지 않습니다. 노출 대비 비율은 아래 10~30%보다 훨씬 낮아 기준이 늘 못 미치게 되기 때문입니다. 이야기를 나눈 수가 10보다 적으면 비율로 판단하지 않고 더 모읍니다(몇 곳 중 몇 곳으로 적음).`,
    `${pace ? `매달 새로 늘어야 하는 손님(약 ${count(pace.perMonth, unit)})을 채우려면` : `${decision.goLabel}을 채우려면`} 직접 이야기를 나눠야 하는 사람 수(잰 비율에 맞춰 고름): 비율 10%면 ${reach(0.1)}, 20%면 ${reach(0.2)}, 30%면 ${reach(0.3)}. 이 수는 문을 연 뒤 필요한 손님 흐름을 가늠하는 참고값이고, 계약할지 가르는 기준이 아닙니다. 계약 판단은 위 '출시 전 판단'(이야기를 나눈 사람 중 날짜를 잡거나 돈을 낸 수와 비율)으로 합니다. 이 수는 판매가 모두 새 손님이라고 본 값이라, 다시 오는 손님이 많을수록 새로 이야기할 사람은 줄어듭니다.`,
    `문을 연 뒤: 실제 판매 수를 위 기준과 매달 비교하고, ${result.stopBroken ? "중단선 대신 시작 전에 정한 결정(다른 수입·생활비 줄이기·예산 늘리기)을 지킵니다" : (result.planDip ? `잔고가 표의 '${result.planDip.label}' 줄에서 실제로 쓴 초기 지출과 한 달 적자분을 뺀 값보다 낮으면 계속할지 다시 정합니다${result.planDip.recovery ? `(${result.planDip.recovery}개월차부터는 중단선)` : ""}` : "남은 준비 예산이 중단선 아래로 내려가면 계속할지 다시 정합니다")}. 관심 글의 댓글·공감 수는 판매 수가 아니므로 이 기준과 바로 비교하지 않습니다.`,
    ...repeatGoalLines(result),
    ...typeLine,
  ];
}

/*
 * 7·9차 맞대결(펫시터): 생활비선이 처리 한도를 넘는다고만 하고, 한도 안에 드는 조합을 계산해 보이지 않았다.
 * 가격마다 '고정비가 얼마 이하면 한도 안'을 바로 계산한다(한도 × 한 건에 남는 돈 − 생활비).
 */
function capacityFixLine(result: CashflowScenarios): string {
  if (!result.capacity || !result.livingBreakEven || result.living == null) return "";
  const step = result.unitPrice < 10_000 ? 500 : result.unitPrice < 100_000 ? 1_000 : 10_000;
  const variable = result.unitPrice - result.contribution;
  const options = [0, 1, 2].map(k => { const price = result.unitPrice + step * k; return { price, fixedMax: Math.floor((result.capacity!.volume * (price - variable) - result.living!) / 10_000) * 10_000 }; })
    .filter(item => item.fixedMax > 0);
  if (!options.length) return ` 가격을 ${won(result.unitPrice + step * 2)}까지 올리고 고정비를 0원으로 해도 한도 안에 들지 않아, 처리 한도부터 늘려야 합니다.`;
  return ` 한도(월 ${count(result.capacity.volume, result.unit)}) 안에서 생활비까지 벌려면 ${options.map(item => `가격 ${won(item.price)}이면 월 고정비 ${won(item.fixedMax)} 이하`).join(", ")}여야 합니다(지금 월 고정비 ${won(result.monthlyFixedCost)}). 1주차에 고정비 항목을 나눠 이 선에 맞출 수 있는지 봅니다.`;
}

/*
 * 8차 맞대결: '6개월 안에 재방문 고객 100명'을 매달 진도와 필요한 첫 방문 수로 나누지 않아,
 * 매달 새 손님이 몇 명 와야 하는지와 처리 한도 안에 드는지 알 수 없었다. 비율은 모르므로 세 값으로 보인다.
 */
function repeatGoalLines(result: CashflowScenarios): string[] {
  const goal = result.repeatGoal;
  if (!goal) return [];
  const perMonth = Math.ceil(goal.count / goal.months);
  const rates = [0.2, 0.3, 0.5].map(rate => { const total = Math.ceil(goal.count / rate); return { rate, total, monthly: Math.ceil(total / goal.months) }; });
  const over = result.capacity ? rates.filter(item => item.monthly > result.capacity!.volume) : [];
  // 9차 맞대결(네일): 조심스러운 경우(월 24건)로는 6개월 판매가 144건이라 재방문 100명(첫 방문 100 + 다시 온 100 = 최소 200건)이 불가능한데 짚지 않았다
  const careful = result.scenarios[0].volumes[0] ?? 0;
  const carefulTotal = careful * goal.months;
  const carefulNote = carefulTotal < goal.count * 2 ? ` 조심스러운 경우(월 ${count(careful, result.unit)})로는 ${goal.months}개월 판매가 ${count(carefulTotal, result.unit)}이라, 다시 오는 비율이 100%여도 이 목표(첫 방문 ${goal.count.toLocaleString("ko-KR")} + 다시 온 ${goal.count.toLocaleString("ko-KR")} = 최소 ${count(goal.count * 2, result.unit)})에 닿지 않습니다.` : "";
  return [`대표 목표 '${goal.label}'(${goal.months}개월)는 한 달 판매량이 아니라 다시 온 손님 수입니다. 매달 약 ${count(perMonth, goal.unit)}씩 늘어야 합니다(매달 볼 숫자에 누적으로 적음). 처음 온 손님 중 다시 오는 비율이 ${rates.map(item => `${item.rate * 100}%`).join("·")}면 ${goal.months}개월 동안 첫 방문 손님이 각각 약 ${rates.map(item => item.total.toLocaleString("ko-KR")).join("·")}${goal.unit}(한 달 약 ${rates.map(item => item.monthly.toLocaleString("ko-KR")).join("·")}${goal.unit}) 필요합니다. 다시 오는 비율은 첫 달 기록으로 재고, 그 비율에 맞는 한 달 첫 방문 수를 매달 볼 숫자에 함께 적습니다.${over.length ? ` 비율이 ${over.map(item => `${item.rate * 100}%`).join("·")}면 한 달 첫 방문만으로 처리 한도(월 ${count(result.capacity!.volume, result.unit)})를 넘어, 그 비율에서는 목표 기간을 늘리거나 목표를 줄입니다.` : ""}${carefulNote}`];
}

const chart = (title: string, values: number[], breakEvenMonth: number | null) =>
  ["```plan-chart", JSON.stringify({ kind: "cumulative", title, points: values.map((value, i) => ({ label: `${i + 1}개월차`, value })), breakEvenMonth, paybackMonth: null }), "```"].join("\n");

/** 돈 장에 붙는 표·그래프(시스템이 본문 끝에 붙인다). 숫자는 모두 이 파일에서 계산한다 */
export function cashflowMarkdown(result: CashflowScenarios): string {
  const { unit } = result;
  // 준비 예산을 알면 표는 문 여는 날 실제 잔고에서 시작한다(2026-10-13: 0에서 시작한 누적표는 언제 바닥나는지 읽을 수 없었다)
  const opening = result.budget != null ? result.budget - prepOut(result) - (result.setupCost ?? 0) : null;
  const headLabel = opening == null ? "통장 누적" : result.setupCost != null ? "통장 잔고" : "통장 잔고(초기 지출 전)";
  const rows = Array.from({ length: 12 }, (_, i) => `| ${i + 1}개월차 | ${result.scenarios.map(s => won((opening ?? 0) + s.cumulative[i])).join(" | ")} |`);
  const goal = result.scenarios.find(s => s.key === "goal");
  return [
    `### ${kinds(result)} 경우로 본 한 달`,
    "",
    `판매가 ${won(result.unitPrice)}에서 한 건당 비용 ${won(result.unitPrice - result.contribution)}을 빼면 한 건에 ${won(result.contribution)}이 남습니다. 매달 나가는 ${won(result.monthlyFixedCost)}을 메우는 본전 판매량은 월 ${count(result.breakEven, unit)}${perDay(result.daily, result.breakEven, unit, text => `, ${text}(월 26일 영업 기준)`)}입니다.`,
    "",
    "| 경우 | 한 달 판매 | 들어오는 돈(매출) | 나가는 돈 | 남거나 모자라는 돈 | 근거 |",
    "| --- | ---: | ---: | ---: | ---: | --- |",
    ...result.scenarios.map(s => {
      const first = s.volumes[0], last = s.volumes.at(-1)!;
      const volume = first === last ? count(last, unit) : `${count(first, unit)} → ${count(last, unit)}`;
      const revenue = first === last ? won(last * result.unitPrice) : `${won(first * result.unitPrice)} → ${won(last * result.unitPrice)}`;
      const outflow = (volume: number, i: number) => volume * result.unitPrice - s.net[i];
      const out = first === last ? won(outflow(last, 0)) : `${won(outflow(first, 0))} → ${won(outflow(last, s.net.length - 1))}`;
      const net = first === last ? won(s.net[0]) : `${won(s.net[0])} → ${won(s.net.at(-1)!)}`;
      return `| ${s.label} | ${volume} | ${revenue} | ${out} | ${net} | ${scenarioBasis(result, s)} |`;
    }),
    "",
    `### 12개월 ${headLabel}`,
    "",
    "개월차는 첫 유료 판매를 시작한 주부터 셉니다(첫 판매 주부터 4주가 1개월차). 실행 장의 주차와 견줄 때는 첫 판매 주에 4주씩 더해 맞춥니다.",
    "",
    `| 월 | ${result.scenarios.map(s => `${s.label} ${headLabel}`).join(" | ")} |`,
    `| --- | ${result.scenarios.map(() => "---:").join(" | ")} |`,
    ...rows,
    "",
    ...cashflowFindings(result).map(line => `- ${line}`),
    `- ${opening != null ? `통장 잔고는 준비 예산 ${won(result.budget!)}에서 ${prepOut(result) > 0 ? `준비 기간에 나가는 돈 ${won(prepOut(result))}${result.setupCost != null ? "과 " : "을 "}` : ""}${result.setupCost != null ? `초기 지출 ${won(result.setupCost)}을 ` : ""}뺀 ${won(opening)}에서 시작합니다.${result.setupCost == null ? " 초기 지출을 쓰면 그만큼 모든 달의 잔고가 줄어듭니다." : ""}` : "통장 누적은 사업에서 들어오고 나간 돈만 더한 값입니다. 초기 지출은 빠져 있습니다."} ${result.living ? "대표 생활비는 나가는 돈에 들어 있고, " : result.living === 0 ? "대표 생활비는 0원으로 넣으셨고(고정비에 이미 넣었거나 다른 수입으로 메우는 경우), " : `대표 생활비(고정비 ${won(result.monthlyFixedCost)}에 들어 있지 않다면)와 `}부가세·소득세는 빠져 있습니다.`,
    result.capacity ? `- 처리량 최대치: ${result.capacity.note}. 어느 경우도 이보다 많이 팔지 않는다고 계산했습니다.` : undefined,
    // 어느 초기 지출이든 1개월도 못 버티면 표 대신 위의 '시작 전 결정' 한 줄로 충분하다(같은 줄 네 번 반복)
    ...(result.survival.some(row => row.months > 0) ? [
      "",
      "### 초기 지출에 따라 버티는 기간",
      "",
      `조심스러운 경우(첫 달 ${won(-result.scenarios[0].net[0])} 모자람)에 준비 예산 ${won(result.budget!)}으로 문 연 뒤 버티는 기간입니다${prepOut(result) > 0 ? `(준비 기간에 나가는 돈 ${won(prepOut(result))}을 먼저 뺌)` : ""}. 초기 지출 견적을 받으면 이 표로 판단합니다.`,
      "",
      `| 초기 지출 | 남는 준비 예산${prepOut(result) > 0 ? "(준비 기간에 나가는 돈 뺀 뒤)" : ""} | 버티는 기간 |`,
      "| ---: | ---: | --- |",
      ...result.survival.map(row => `| ${won(row.spend)} | ${won(result.budget! - row.spend - prepOut(result))} | ${monthsText(row.months)} |`),
    ] : []),
    "",
    // 그래프는 하나만(2026-10-10 빵집 시험: 표 3개·그래프 2개로 재무 장이 길다는 채점) — 목표 경우가 있으면 모자랐다가 메워지는 모습을 보인다
    goal
      ? chart(`${goal.label} ${headLabel}`, goal.cumulative.map(value => (opening ?? 0) + value), (() => { const i = goal.cumulative.findIndex(value => value >= 0); return i >= 0 ? i + 1 : null; })())
      : chart(`조심스러운 경우 ${headLabel}`, result.scenarios[0].cumulative.map(value => (opening ?? 0) + value), null),
  ].filter((line): line is string => line !== undefined).join("\n");
}

/** 다른 장과 AI 문서 원천에 넘기는 참고 문장 — 표 없이 결론 숫자만 */
/**
 * 다른 장과 AI 문서 원천에 넘기는 참고 문장 — 표 없이 결론 숫자만.
 * unitLines: 예전 손익 참고의 '판매가/변동비/공헌이익'·'손익분기' 줄(financialsToReference) — 다른 기능이 같은 문구를 읽으므로 그대로 둔다.
 */
export function cashflowReference(result: CashflowScenarios, options: { basis?: string; unitLines?: string } = {}): string {
  return [
    `계획 시나리오 계산(실적 아님). ${options.basis ? `${options.basis}으로 ` : ""}판매량을 하나로 정하지 않고 ${kinds(result)} 경우로 계산했습니다(처리량 최대치를 넘지 않음).`,
    options.unitLines ?? `- 판매가 ${won(result.unitPrice)} / 한 건당 비용 ${won(result.unitPrice - result.contribution)} / 한 건에 남는 돈 ${won(result.contribution)}\n- 손익분기: 월 ${count(result.breakEven, result.unit)} (매출 ${won(result.breakEven * result.unitPrice)})`,
    // 하루 환산(월 26일 영업 — 처리량 환산과 같은 가정): 실행 장이 '하루 몇 개면 바꾼다' 같은 판단 기준을 숫자를 지어내지 않고 세우게 한다
    perDay(result.daily, result.breakEven, result.unit, text => `- 하루 환산(월 26일 영업 가정): 본전 ${text}`),
    ...result.scenarios.map(s => `- ${s.label}(${scenarioBasis(result, s)}): 월 ${count(s.volumes.at(-1)!, result.unit)}${perDay(result.daily, s.volumes.at(-1)!, result.unit, text => `(${text})`)}${s.volumes[0] !== s.volumes.at(-1) ? `, 첫 달 월 ${count(s.volumes[0], result.unit)}${perDay(result.daily, s.volumes[0], result.unit, text => `(${text})`)}` : ""}, 한 달에 ${won(s.net.at(-1)!)}, 12개월 누적 ${won(s.cumulative.at(-1)!)}`),
    ...cashflowFindings(result).map(line => `- ${line}`),
    ...decisionLines(result).map(line => `- ${line}`),
    result.survival.length && result.survival.every(row => row.months === 0) ? `- 초기 지출별 버티는 기간: 초기 지출이 ${won(result.survival[0].spend)}만 돼도 조심스러운 경우 문 연 뒤 1개월도 못 버팁니다.` : "",
    result.survival.some(row => row.months > 0) ? `- 초기 지출별 버티는 기간(조심스러운 경우${prepOut(result) > 0 ? ", 준비 기간에 나가는 돈을 먼저 뺌" : ""}): ${result.survival.map(row => `${won(row.spend)}이면 ${monthsText(row.months)}`).join(", ")}` : "",
    goalLine(result),
    result.priceAlternatives.length ? `- 가격을 바꾸면(${won(Math.abs(result.priceAlternatives[0].price - result.unitPrice))}씩, 한 건당 비용은 같다고 가정, 가격 장에서 씀): ${result.priceAlternatives.map(alt => `${won(alt.price)} → 본전 ${periods(result.daily, alt.breakEven, result.unit)}${alt.livingLine ? `, 생활비선 ${periods(result.daily, alt.livingLine, result.unit)}` : ""}`).join(" / ")}` : "",
    result.living != null ? "- 초기 지출(입력이 없으면)과 부가세·소득세는 이 계산에 빠져 있습니다." : "- 초기 지출(입력이 없으면), 대표 생활비(고정비에 없다면), 부가세·소득세는 이 계산에 빠져 있습니다.",
  ].filter(Boolean).join("\n");
}

/** 대화에서 모은 값(가격·변동비·고정비 + 처리량·목표·예산·초기 지출)으로 세 경우를 만든다 */
export function cashflowFromFields(
  fields: Array<{ key: string; value: string }>,
  money: { unitPrice: number; unitVariableCost: number; monthlyFixedCost: number; structure?: { revenue?: string; delivery?: string; capital?: string }; premises?: boolean; businessTypeId?: string | null },
): CashflowScenarios | null {
  const get = (key: string) => fields.find(field => field.key === key)?.value;
  const { structure, premises, businessTypeId, unitPrice, unitVariableCost, monthlyFixedCost } = money;
  const amounts = { unitPrice, unitVariableCost, monthlyFixedCost };
  return buildCashflowScenarios({
    ...amounts, capacity: get("capacity"), goal: get("goal"), budget: get("budget"), setupCost: get("setupCost"), livingCost: get("livingCost"), offer: get("offer"),
    recurring: isRecurring(structure?.revenue, get("offer")),
    premises: premises ?? (structure?.capital === "storefront" || structure?.delivery === "store"),
    businessTypeId,
  });
}

/** 매달 돈을 내는 사업인가 — 구독 구조이거나, 대표 상품이 '월 12회 게시물'·'월 4,900원 프리미엄'·'정기'처럼 한 달 단위다 */
export function isRecurring(revenue: string | undefined, offer: string | undefined): boolean {
  return revenue === "subscription" || /(?:^|\s)월\s*[\d,]+\s*(?:원|회|번)|매달|매월|정기\s*(?:결제|구독|관리|배송)|구독/.test(offer ?? "");
}

/*
 * 운영 중 사업의 돈 표(2026-10-13 5차 검토: 매출이 줄고 있는 가게에 같은 숫자를 12달 복사한 표, 달력 '1월~12월', '흑자 전환 1개월차'가 붙었다).
 * '지금 그대로'와 '목표까지 가는 길'을 나란히 보이고, 대표 생활비를 뺀 뒤의 남는 돈까지 적는다. 세금 전이라는 점과 '건'의 단위를 밝힌다.
 */
function vatLine(input: { unitPrice: number; unitVariableCost: number; monthlyFixedCost: number; volume: number }, living: number | null): string | null {
  const vatContribution = input.unitPrice / 1.1 - input.unitVariableCost;
  if (vatContribution <= 0) return null;
  const line = Math.ceil((input.monthlyFixedCost + (living ?? 0)) / vatContribution);
  const net = Math.round(input.volume * vatContribution - input.monthlyFixedCost - (living ?? 0));
  return `- 메뉴 가격에 부가세가 들어 있다면(일반과세자) 한 건에 남는 돈은 약 ${won(vatContribution)}이고, ${living ? "생활비까지 버는 선" : "본전"}은 월 ${count(line, "건")}입니다. 지금 실적(월 ${count(input.volume, "건")})으로는 ${living ? "생활비를 가져간 뒤 " : ""}한 달에 ${net >= 0 ? `약 ${won(net)} 남습니다` : `약 ${won(-net)} 모자랍니다`}. 과세 유형은 사업자등록증으로 1주차에 확인하고, 일반과세자면 매달 부가세로 낼 돈(카드·현금 매출 ÷ 11)을 따로 떼어 둡니다.`;
}

export function operatingFlowMarkdown(input: { unitPrice: number; unitVariableCost: number; monthlyFixedCost: number; volume: number; livingCost?: string; goal?: string }): string {
  const contribution = input.unitPrice - input.unitVariableCost;
  const living = coachAmount(input.livingCost) ?? null;
  const breakEven = contribution > 0 ? Math.ceil(input.monthlyFixedCost / contribution) : null;
  const livingLine = living && contribution > 0 ? Math.ceil((input.monthlyFixedCost + living) / contribution) : null;
  const goal = parseRevenueGoal(input.goal);
  const target = goal ? Math.ceil(goal.revenue / input.unitPrice) : null;
  const months = Math.min(goal?.months ?? 6, 12);
  const net = (volume: number) => volume * contribution - input.monthlyFixedCost;
  // 7차 맞대결: 6개월만 보이고, 고치기도 전인 1개월차부터 늘었다 — 12개월로 보이고 1개월차는 지금 그대로(고친 효과는 다음 달부터)
  const path = Array.from({ length: 12 }, (_, i) => (target && target > input.volume && months > 1 ? Math.round(input.volume + (target - input.volume) * Math.min(i, months - 1) / (months - 1)) : input.volume));
  const head = living ? "| 개월차 | 지금 그대로 남는 돈 | 목표 길 판매(건) | 목표 길 남는 돈 | 목표 길에서 생활비 뺀 뒤 |" : "| 개월차 | 지금 그대로 남는 돈 | 목표 길 판매(건) | 목표 길 남는 돈 |";
  const rows = path.map((volume, i) => `| ${i + 1}개월차 | ${won(net(input.volume))} | ${count(volume, "")} | ${won(net(volume))} |${living ? ` ${won(net(volume) - living)} |` : ""}`);
  return [
    "### 지금 한 달과 목표까지 가는 길",
    "",
    `판매가 ${won(input.unitPrice)}에서 한 건당 비용 ${won(input.unitVariableCost)}을 빼면 한 건에 ${won(contribution)}이 남습니다. 지금 실적은 월 약 ${count(input.volume, "건")}이고, 고정비 ${won(input.monthlyFixedCost)}을 빼면 한 달에 ${won(net(input.volume))}이 남습니다(세금 전).${breakEven ? ` 본전은 월 ${count(breakEven, "건")}` : ""}${livingLine ? `, 대표 생활비 월 ${won(living!)}까지 버는 선은 월 ${count(livingLine, "건")}입니다.` : breakEven ? "입니다." : ""}`,
    "",
    head,
    `| --- | ---: | ---: | ---: |${living ? " ---: |" : ""}`,
    ...rows,
    "",
    target ? `- 목표 길: 1개월차는 고치는 중이라 지금 그대로 두고, 2개월차부터 ${months}개월차 월 ${count(target, "건")}(매출 목표 ${won(goal!.revenue)})까지 매달 같은 폭으로 는다고 본 계산입니다. 그 뒤는 목표 수준이 이어진다고 봤습니다. 목표에서 거꾸로 잡은 값(가정)이라 어떤 개선이 이만큼 늘릴지는 아직 근거가 없습니다. 3개월차 실적이 목표 길(월 ${count(path[2], "건")})보다 20% 넘게 밑이면 목표 시점이나 방법을 다시 정합니다.` : "- 매출 목표가 없어 지금 그대로만 계산했습니다.",
    // 10차 맞대결(김밥): 매출이 줄고 있는 가게인데 '지금 그대로'를 12개월 내내 고정했다 — 감소가 이어질 때를 가정으로 보인다
    `- 판매가 지금부터 매달 2%씩 줄면(가정) 6개월차에 월 약 ${count(Math.round(input.volume * 0.98 ** 6), "건")}, 한 달에 ${won(net(Math.round(input.volume * 0.98 ** 6)))}이 남습니다${living ? `(생활비를 빼면 ${won(net(Math.round(input.volume * 0.98 ** 6)) - living)})` : ""}. 실제로 줄어든 폭은 최근 석 달 실적으로 1주차에 확인합니다.`,
    ...(livingLine && livingLine >= input.volume ? [`- 지금 실적이 생활비까지 버는 선(월 ${count(livingLine, "건")})${livingLine > input.volume ? "보다 낮아" : "과 같아"} 판매가 줄면 바로 생활비가 모자랍니다. 판매가 10%(월 약 ${count(Math.round(input.volume / 10), "건")}) 줄면 한 달에 약 ${won(Math.round(input.volume / 10) * contribution)}이 더 모자랍니다. 쓸 수 있는 비상금(통장 잔고)을 1주차에 적고, 비상금을 한 달에 모자라는 돈으로 나눠 버티는 달 수를 셉니다.`] : []),
    `- '건'은 판매 가격 ${won(input.unitPrice)}짜리 1개 기준이라 주문 건수와 다릅니다. 비교할 때는 매출 ÷ ${won(input.unitPrice)}로 바꿔 셉니다.`,
    // 9차 맞대결(김밥): 세전 남는 돈이 생활비와 같은데 부가세를 0으로 두어, 일반과세면 이미 모자라는 걸 보이지 않았다
    ...(vatLine(input, living) ? [vatLine(input, living)!] : []),
    "- 남는 돈은 부가세·소득세를 내기 전 금액입니다. 매출이 줄고 있다면 '지금 그대로'보다 실제가 낮을 수 있습니다.",
  ].join("\n");
}
