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
};
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
  /** 문 열기 전 준비 기간(12주) 동안 수입 없이 나가는 생활비 — 실행 장의 12주와 같은 가정 */
  prepLiving: number;
  /** 준비 기간에 나가는 고정비 — 공간을 빌리는 사업은 문 열기 한 달 전부터(계약·설치), 아니면 준비 기간 내내 */
  prepFixed: number;
  /** 남은 준비 예산이 이 아래로 내려가면 계속할지 다시 정한다(조심스러운 경우 3개월 적자분) */
  stopReserve: number | null;
  /**
   * 초기 지출이 0원이어도 문 여는 날 남는 돈이 중단선보다 적다 — 중단선이 처음부터 깨져 판단에 쓸 수 없다
   * (2026-10-12 시뮬레이션: 네 사업에서 '문 열자마자 중단 검토'가 나왔다). 그러면 중단선 대신 시작 전 결정을 묻는다.
   */
  stopBroken: boolean;
  /** 초기 지출을 이 금액 이하로 써야 문 여는 날 중단선 위에서 시작한다(초기 지출을 모를 때) */
  setupBeforeStop: number | null;
  /** 판매가에 부가세 10%가 들어 있다고 볼 때(일반과세자) 한 건에 남는 돈과 생활비선(없으면 본전) */
  vat: { contribution: number; line: number };
  /** 처리량 최대치를 다 팔아도 생활비선(없으면 본전)에 못 미칠 때, 다 판 달에 남거나 모자라는 돈 */
  capacityNet: number | null;
  recurring: boolean;
  /** 문 여는 날 남는 돈(초기 지출을 모르면 0원으로 본 최대치)과 조심스러운 경우 그 돈으로 버티는 개월 수 */
  opening: { cash: number; months: number } | null;
  /** 매달 돈을 내는 사업: 생활비선(없으면 본전)의 손님 수를 채우는 기간과 그동안 매달 새로 늘어야 하는 손님 수(해지 없을 때) */
  recurringPace: { months: number; perMonth: number } | null;
  /** 가격을 바꾸면 본전·생활비선이 어떻게 되는지(한 건당 비용은 같다고 가정) */
  priceAlternatives: Array<{ price: number; breakEven: number; livingLine: number | null }>;
  /** 처리량 단위와 판매 단위가 다를 수 있다는 알림(예: 하루 120개 vs 세트) */
  unitNote: string | null;
};

const MONTHS = 12;
/** 문 열기 전 준비 기간(개월) — 실행 장 '12주 할 일'과 같은 가정 */
const PREP_MONTHS = 3;
/** 매달 돈을 내는 사업의 조심스러운 경우가 본전의 절반에 닿는 달(가정 — 손님이 0명에서 매달 같은 수씩 는다) */
const RECURRING_RAMP_MONTHS = 6;
const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
const count = (value: number, unit: string) => `${Math.round(value).toLocaleString("ko-KR")}${unit}`;
/*
 * 하루 환산(월 26일 영업) — 처리량을 '하루 ○개'로 답한 사업(매장·카페처럼 날마다 파는 곳)만 쓴다.
 * 주·월 단위로 일하는 사업(출장 촬영, 학원)에 '하루 약 1건'을 붙이면 엉뚱한 기준이 된다. 하루 1개가 안 되면 말하지 않는다.
 */
const perDay = (daily: boolean, monthly: number, unit: string, wrap: (text: string) => string) => (daily && monthly / 26 >= 1 ? wrap(`하루 약 ${count(monthly / 26, unit)}`) : "");
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
  const monthly = goal?.match(/월\s*([\d,]+)\s*(?:건|개|잔|명|곳|회|벌|박)(?:\s*판매)?/);
  const daily = goal?.match(/하루\s*([\d,]+)\s*(?:건|개|잔|명|회|벌)/);
  const volume = monthly ? Number(monthly[1].replace(/,/g, "")) : daily ? Number(daily[1].replace(/,/g, "")) * 26 : 0;
  return volume > 0 ? { volume, months: goalMonths(goal) } : null;
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
  const unit = capacityParsed?.unit || (input.recurring ? "명" : "건");
  const cap = (volume: number) => Math.max(0, Math.min(capacity?.volume ?? Infinity, Math.round(volume)));
  const breakEven = Math.ceil(input.monthlyFixedCost / contribution);
  // 대표 생활비가 있으면 매달 나가는 돈에 더한다 — 사업이 대표 생활까지 감당해야 하는 경우(품질기준 7번)
  const living = coachAmount(input.livingCost) ?? null;
  const livingBreakEven = living ? Math.ceil((input.monthlyFixedCost + living) / contribution) : null;
  const careful = cap(Math.ceil(breakEven / 2));
  const recurring = !!input.recurring;
  const revenueGoal = parseRevenueGoal(input.goal), volumeGoal = revenueGoal ? null : parseVolumeGoal(input.goal) ?? (recurring ? parseActiveGoal(input.goal) : null);
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
    livingBreakEven ? make("breakeven", "생활비까지 버는 경우", flat(cap(livingBreakEven))) : make("breakeven", "본전", flat(cap(breakEven))),
  ];
  if (goal) {
    const target = cap(Math.ceil(goal.revenue / input.unitPrice));
    const ramp = recurring
      ? rampFromZero(target, goal.months, cap)
      : Array.from({ length: MONTHS }, (_, i) => (i + 1 >= goal.months || goal.months <= 1 ? target : cap(careful + (target - careful) * i / (goal.months - 1))));
    scenarios.push(make("goal", "목표 경우", ramp));
  }
  const budget = coachAmount(input.budget) ?? null, setupCost = coachAmount(input.setupCost) ?? null;
  const carefulWorst = Math.min(0, ...scenarios[0].cumulative);
  // 2026-10-10 진단: 문 열기 전 약 3개월은 수입 없이 생활비만 나간다 — 빼지 않으면 초기 지출 한도가 그만큼 느슨해진다
  const prepLiving = (living ?? 0) * PREP_MONTHS;
  // 2026-10-12 시뮬레이션: 앱의 도구·서버비, 매장의 개업 전 월세처럼 준비 기간에도 고정비가 나간다
  const prepFixed = input.monthlyFixedCost * (input.premises ? 1 : PREP_MONTHS);
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
  const stopBroken = stopReserve != null && openingMax != null && openingMax <= stopReserve;
  const opening = openingMax != null ? { cash: openingMax, months: lastsMonths(openingMax) } : null;
  const setupBeforeStop = stopReserve != null && budget != null && setupCost == null && !stopBroken ? budget - prepOut - stopReserve : null;
  // 부가세: 일반과세자가 부가세를 넣은 가격으로 받으면 판매가의 1/11은 나라에 낸다(매입세액 공제는 따로)
  const vatContribution = input.unitPrice / 1.1 - input.unitVariableCost;
  const vatLine = vatContribution > 0 ? Math.ceil((input.monthlyFixedCost + (living ?? 0)) / vatContribution) : Infinity;
  const capacityNet = capacity && capacity.volume < (livingBreakEven ?? breakEven) ? capacity.volume * contribution - input.monthlyFixedCost - (living ?? 0) : null;
  const paceMonths = goal?.months ?? RECURRING_RAMP_MONTHS;
  const recurringPace = recurring ? { months: paceMonths, perMonth: Math.ceil((livingBreakEven ?? breakEven) / paceMonths) } : null;
  // 대안 가격: 가격 크기에 맞는 단위(500원·1,000원·1만 원)로 한 칸 낮게, 한두 칸 높게
  const step = input.unitPrice < 10_000 ? 500 : input.unitPrice < 100_000 ? 1_000 : 10_000;
  const priceAlternatives = [input.unitPrice - step, input.unitPrice + step, input.unitPrice + step * 2]
    .filter(price => price - input.unitVariableCost > 0)
    .map(price => ({ price, breakEven: Math.ceil(input.monthlyFixedCost / (price - input.unitVariableCost)), livingLine: living ? Math.ceil((input.monthlyFixedCost + living) / (price - input.unitVariableCost)) : null }));
  const unitNote = /세트/.test(input.offer ?? "") && capacityParsed && !/세트/.test(capacityParsed.unit)
    ? `처리량(${capacityParsed.note})과 판매 단위(세트)를 같다고 보고 계산했습니다. 세트 하나에 상품이 여러 개 들어가면 팔 수 있는 세트 수가 그만큼 줄어듭니다.`
    : null;
  return { unit, daily: /하루/.test(input.capacity ?? ""), unitPrice: input.unitPrice, monthlyFixedCost: input.monthlyFixedCost, contribution, breakEven, capacity, living, livingBreakEven, payFromMonth: payIndex >= 0 ? payIndex + 1 : null, goal, budget, setupCost, scenarios, carefulWorst, setupLimit, runOut, decision, survival, prepLiving, prepFixed, stopReserve, stopBroken, setupBeforeStop, vat: { contribution: vatContribution, line: vatLine }, capacityNet, recurring, opening, recurringPace, priceAlternatives, unitNote };
}

const capacityShort = (result: CashflowScenarios) => !!result.capacity && result.capacity.volume < (result.livingBreakEven ?? result.breakEven);

function scenarioBasis(result: CashflowScenarios, s: Scenario): string {
  if (s.key === "careful") return result.recurring ? `가정: 돈 내는 손님이 0에서 매달 같은 수씩 늘어 ${RECURRING_RAMP_MONTHS}개월차에 본전의 절반` : "가정: 본전 판매량의 절반";
  if (s.key === "goal" && result.recurring) return `대표 목표(돈 내는 손님 ${count(s.volumes.at(-1)!, result.unit)})까지 0에서 ${result.goal!.months}개월 동안 같은 폭으로 는다고 가정`;
  if (s.key === "breakeven" && result.livingBreakEven) return capacityShort(result) ? `처리량 최대치로도 고정비와 생활비(월 ${count(result.livingBreakEven, result.unit)})를 못 메움` : `고정비와 대표 생활비 월 ${won(result.living!)}을 겨우 메우는 ${result.recurring ? "돈 내는 손님 수" : "판매량"}`;
  if (s.key === "breakeven") return capacityShort(result) ? `처리량 최대치로도 본전(월 ${count(result.breakEven, result.unit)})에 못 미침` : `고정비를 겨우 메우는 ${result.recurring ? "돈 내는 손님 수" : "판매량"}`;
  return `대표 목표(월 매출 ${won(result.goal!.revenue)})까지 ${result.goal!.months}개월 동안 같은 폭으로 는다고 가정`;
}

/** 준비 기간에 나가는 돈의 설명 — 생활비와 고정비 */
const prepOut = (result: CashflowScenarios) => result.prepLiving + result.prepFixed;
function prepText(result: CashflowScenarios): string {
  const parts = [result.prepLiving > 0 ? `생활비 ${won(result.prepLiving)}` : "", result.prepFixed > 0 ? `고정비 ${won(result.prepFixed)}(${result.prepFixed >= result.monthlyFixedCost * PREP_MONTHS ? "준비 기간 내내" : "문 열기 한 달 전부터"})` : ""].filter(Boolean);
  return parts.join("과 ");
}

/** 통장 흐름을 바로 읽히는 문장으로 — 표 아래 주석과 다른 장의 참고값에 같이 쓴다 */
function cashflowFindings(result: CashflowScenarios): string[] {
  const lines: string[] = [];
  const careful = result.scenarios[0];
  if (result.recurringPace) lines.push(`매달 돈을 내는 사업이라 판매량은 '그달 돈을 내는 손님 수'입니다. ${result.livingBreakEven ? "생활비선" : "본전"} ${count(result.livingBreakEven ?? result.breakEven, result.unit)}을 ${result.recurringPace.months}개월 안에 채우려면 해지가 없을 때 매달 새로 약 ${count(result.recurringPace.perMonth, result.unit)}씩 늘어야 하고, 해지가 생기면 그만큼 더 필요합니다.`);
  if (result.living) lines.push(`대표 생활비 월 ${won(result.living)}을 나가는 돈에 넣었습니다. 생활비까지 벌려면 팔아야 하는 양은 월 ${count(result.livingBreakEven!, result.unit)}${perDay(result.daily, result.livingBreakEven!, result.unit, text => `, ${text}`)}입니다.`);
  if (careful.net.some(value => value < 0)) lines.push(careful.net.every(value => value === careful.net[0])
    ? `조심스러운 경우 매달 ${won(-careful.net[0])}씩 모자라, 12개월 동안 ${result.living ? "생활비를 포함해 " : "사업에서 "}모자라는 돈은 ${won(-result.carefulWorst)}입니다.`
    : `조심스러운 경우 첫 달 ${won(-careful.net[0])}이 모자라고, 12개월 동안 ${result.living ? "생활비를 포함해 " : "사업에서 "}가장 많이 모자라는 때의 누적은 ${won(-result.carefulWorst)}입니다.`);
  if (prepOut(result) > 0) lines.push(`첫 유료 판매 전 준비 기간을 12주(약 3개월)로 잡으면, 그동안 ${prepText(result)}이 수입 없이 준비 예산에서 나갑니다. 첫 판매가 빨라지면 그만큼 덜 나갑니다.`);
  if (result.setupLimit != null) lines.push(result.setupLimit > 0
    ? `준비 예산 ${won(result.budget!)}에서 ${prepOut(result) > 0 ? "준비 기간에 나가는 돈을 빼고 " : ""}초기 지출을 ${won(result.setupLimit)} 이하로 써야 조심스러운 경우에도 문 연 뒤 12개월을 버팁니다. 보증금처럼 나중에 돌려받는 돈도 문 여는 날 통장에서는 빠지므로 초기 지출에 넣습니다.`
    : `조심스러운 경우 ${prepOut(result) > 0 ? "준비 기간에 나가는 돈과 " : ""}12개월 동안 모자라는 돈이 준비 예산 ${won(result.budget!)}보다 많습니다. 초기 지출 전에 이미 모자랍니다.`);
  if (result.stopBroken && result.opening) lines.push(`초기 지출이 ${result.setupCost != null ? won(result.setupCost) : "0원"}이어도 문 여는 날 남는 돈(${won(Math.max(0, result.opening.cash))})이 조심스러운 경우 석 달 적자분(${won(result.stopReserve!)})보다 적어, 문 연 뒤에 볼 중단선을 둘 수 없습니다. 조심스러운 경우 이 돈으로 문 연 뒤 ${monthsText(result.opening.months)}입니다. 시작하기 전에 다른 수입을 이어 갈지, 생활비·고정비를 줄일지, 준비 예산을 늘릴지 하나를 정합니다.`);
  else if (result.stopReserve != null && result.budget != null) lines.push(`문을 연 뒤 남은 준비 예산이 ${won(result.stopReserve)}(조심스러운 경우 석 달 적자분) 아래로 내려가면 계속할지 다시 정합니다.${result.setupBeforeStop != null ? ` 문 여는 날 이 선 위에서 시작하려면 초기 지출을 ${won(result.setupBeforeStop)} 이하로 씁니다.` : ""}`);
  if (result.unitNote) lines.push(result.unitNote);
  for (const item of result.runOut) lines.push(`${item.label}에는 준비 예산에서 초기 지출을 뺀 돈이 ${item.month}개월차에 바닥납니다.`);
  const goal = result.scenarios.find(s => s.key === "goal");
  const recover = goal ? goal.cumulative.findIndex(value => value >= 0) : -1;
  if (result.living && goal) lines.push(result.payFromMonth ? `목표 경우에는 ${result.payFromMonth}개월차부터 한 달 매출로 고정비와 생활비를 모두 메워, 그때부터 사업에서 생활비를 가져갈 수 있습니다. 그 전까지 생활비는 준비 예산에서 나갑니다.` : "목표 경우에도 12개월 안에 한 달 매출로 생활비까지 메우지 못합니다.");
  if (goal && goal.net[0] < 0) lines.push(recover >= 0 ? `목표 경우에는 ${recover + 1}개월차에 그동안 모자랐던 돈을 모두 메웁니다.` : "목표 경우에도 12개월 안에 그동안 모자랐던 돈을 다 메우지 못합니다.");
  // 본전과 생활비선을 따로 말한다 — 예전엔 생활비선에 못 미쳐도 '본전에 못 미친다'고 써 틀렸다(펫시터: 한도 520건 > 본전 334건)
  if (result.capacity && result.capacity.volume < result.breakEven) lines.push(`처리량 최대치(${result.capacity.note})를 다 팔아도 본전에 못 미칩니다. 가격·고정비·처리량을 다시 봐야 합니다.`);
  else if (result.capacityNet != null && result.livingBreakEven) lines.push(`처리량 최대치(${result.capacity!.note})를 다 팔아도 생활비까지는 못 법니다. 다 판 달에도 생활비를 넣으면 ${won(-result.capacityNet)}이 모자랍니다. 판매를 늘리는 것보다 가격·수수료·처리량을 먼저 다시 정해야 합니다.`);
  // 부가세(2026-10-12 시뮬레이션: 다섯 사업 모두 가격에 부가세가 들었는지 정하지 않아 한 건에 남는 돈이 부풀려졌다)
  if (Number.isFinite(result.vat.line)) lines.push(`판매가 ${won(result.unitPrice)}에 부가세가 들어 있다면(일반과세자) 한 건에 남는 돈은 약 ${won(result.vat.contribution)}으로 줄고, ${result.livingBreakEven ? "생활비선" : "본전"}은 월 ${count(result.vat.line, result.unit)}이 됩니다. 간이과세자는 계산이 다르므로, 사업자등록 때 과세 유형과 가격에 부가세를 넣을지를 함께 정합니다.`);
  return lines;
}

/** 목표 경우의 월별 판매선 — 실행 장의 '매달 볼 숫자' 목표로 쓴다 */
function goalLine(result: CashflowScenarios): string {
  const goal = result.scenarios.find(s => s.key === "goal");
  // 매달 돈을 내는 사업은 판단 기준 줄의 월별 선이 매달 볼 목표다 — 두 줄이면 같은 달 결론이 갈린다
  if (!goal || !result.goal || result.recurring) return "";
  const months = goal.volumes.slice(0, result.goal.months).map((volume, i) => `${i + 1}개월차 ${count(volume, result.unit)}`);
  return `- 목표 경우 월별 판매선(매달 볼 숫자의 목표, 실행 장에서 씀): ${months.join(", ")}`;
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
    ? `판단 기준(실행 장에서 씀, 매달 볼 숫자의 목표도 이 줄): 결제를 연 뒤 돈을 내는 손님 수가 ${checkpoints} 이상이면 계획대로, 그 절반 이상이면 규모(쓰는 돈·시간·상품 수)를 줄여서, 절반 미만이면 시작안을 바꿉니다. ${decision.goLabel.replace("판매량", "손님 수")} ${count(decision.go, unit)}을 ${pace.months}개월에 채우는 선입니다. 같은 때 해지한 손님 수도 함께 봅니다. 판단은 계약처럼 큰돈을 쓰기 전(출시 전)에 한 번, 결제를 연 뒤에 다시 합니다.`
    : `판단 기준(실행 장에서 씀): ${decision.goLabel}(${periods(result.daily, decision.go, unit)}) 이상이면 계획대로, 그보다 적고 본전의 절반(${periods(result.daily, decision.floor, unit)})보다 많으면 규모(쓰는 돈·시간·상품 수)를 줄여서, 본전의 절반 이하면 시작안을 바꿉니다. 판단은 계약처럼 큰돈을 쓰기 전(출시 전)에 한 번, 문을 연 뒤에 다시 합니다.`;
  // 처리 한도로 닿을 수 없는 기준은 그대로 쓰지 않는다(2026-10-13: 펫시터 생활비선 778건 > 한도 520건인데 판단 기준으로 썼다)
  const unreachable = result.capacity && result.capacity.volume < decision.go
    ? ` 다만 ${decision.goLabel}(월 ${count(decision.go, unit)})이 처리 한도(월 ${count(result.capacity.volume, unit)})보다 많아 판매량만으로는 닿을 수 없습니다. 그래서 '계획대로'는 한도를 거의 채우고 가격·수수료를 바꾼 안의 생활비선이 한도 안에 들어올 때로 봅니다.`
    : "";
  const reach = (rate: number) => {
    const monthly = Math.ceil((pace ? pace.perMonth : decision.go) / rate);
    return result.daily ? `하루 약 ${Math.ceil(monthly / 26).toLocaleString("ko-KR")}명` : monthly / 4.3 >= 1 ? `일주일 약 ${Math.ceil(monthly / 4.3).toLocaleString("ko-KR")}명` : `한 달 ${monthly.toLocaleString("ko-KR")}명`;
  };
  return [
    first + unreachable,
    `출시 전 판단: 돈을 받고 실제로 팔아 볼 수 있으면(이미 신고된 공간·시범 판매) 실제 판매 수를 위 기준과 같은 기간끼리 비교합니다. 시범 판매가 일부 시간·자리만 쓰면(예: 남의 가게 저녁 한 자리 2주) 판매 수를 그대로 비교하지 않고 연 시간 중 채운 비율과 재예약으로 봅니다. 아직 팔 수 없으면 판매량 기준을 그대로 쓰지 않습니다. 새로 모은 예약 의사 수는 수요보다 '얼마나 닿았는지'를 재기 때문입니다. 대신 작은 표본에서 잰 실제 비율(체험한 사람 중 등록한 비율, 찾아간 곳 중 계약한 비율, 본 사람 중 날짜를 잡거나 돈을 낸 비율)과 경쟁 자료(비슷한 가게의 빈자리·예약 달력·가동률)로 판단합니다. 비율의 분모는 닿은 사람(본 사람·찾아간 곳), 분자는 날짜를 잡거나 돈을 낸 사람이고, 질문에 얼마나 꼼꼼히 답했는지는 비율로 쓰지 않습니다. 닿은 수가 10보다 적으면 비율로 판단하지 않고 더 모읍니다(몇 곳 중 몇 곳으로 적음).`,
    `${pace ? `매달 새로 늘어야 하는 손님(약 ${count(pace.perMonth, unit)})을 채우려면` : `${decision.goLabel}을 채우려면`} 닿아야 하는 사람 수(잰 비율에 맞춰 고름): 비율 10%면 ${reach(0.1)}, 20%면 ${reach(0.2)}, 30%면 ${reach(0.3)}. 그만큼의 사람에게 닿을 길(지나가는 사람, 단지 세대, 커뮤니티 회원 등)이 있어야 진행합니다.`,
    `문을 연 뒤: 실제 판매 수를 위 기준과 매달 비교하고, ${result.stopBroken ? "중단선 대신 시작 전에 정한 결정(다른 수입·생활비 줄이기·예산 늘리기)을 지킵니다" : "남은 준비 예산이 중단선 아래로 내려가면 계속할지 다시 정합니다"}. 관심 글의 댓글·공감 수는 판매 수가 아니므로 이 기준과 바로 비교하지 않습니다.`,
  ];
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
    `| 월 | ${result.scenarios.map(s => `${s.label} ${headLabel}`).join(" | ")} |`,
    `| --- | ${result.scenarios.map(() => "---:").join(" | ")} |`,
    ...rows,
    "",
    ...cashflowFindings(result).map(line => `- ${line}`),
    `- ${opening != null ? `통장 잔고는 준비 예산 ${won(result.budget!)}에서 ${prepOut(result) > 0 ? `준비 기간에 나가는 돈 ${won(prepOut(result))}${result.setupCost != null ? "과 " : "을 "}` : ""}${result.setupCost != null ? `초기 지출 ${won(result.setupCost)}을 ` : ""}뺀 ${won(opening)}에서 시작합니다.${result.setupCost == null ? " 초기 지출을 쓰면 그만큼 모든 달의 잔고가 줄어듭니다." : ""}` : "통장 누적은 사업에서 들어오고 나간 돈만 더한 값입니다. 초기 지출은 빠져 있습니다."} ${result.living ? "대표 생활비는 나가는 돈에 들어 있고, " : result.living === 0 ? "대표 생활비는 고정비에 들어 있다고 답했고, " : `대표 생활비(고정비 ${won(result.monthlyFixedCost)}에 들어 있지 않다면)와 `}부가세·소득세는 빠져 있습니다.`,
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
      ? chart(`목표 경우 ${headLabel}`, goal.cumulative.map(value => (opening ?? 0) + value), (() => { const i = goal.cumulative.findIndex(value => value >= 0); return i >= 0 ? i + 1 : null; })())
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
  money: { unitPrice: number; unitVariableCost: number; monthlyFixedCost: number; structure?: { revenue?: string; delivery?: string; capital?: string }; premises?: boolean },
): CashflowScenarios | null {
  const get = (key: string) => fields.find(field => field.key === key)?.value;
  const { structure, premises, unitPrice, unitVariableCost, monthlyFixedCost } = money;
  const amounts = { unitPrice, unitVariableCost, monthlyFixedCost };
  return buildCashflowScenarios({
    ...amounts, capacity: get("capacity"), goal: get("goal"), budget: get("budget"), setupCost: get("setupCost"), livingCost: get("livingCost"), offer: get("offer"),
    recurring: isRecurring(structure?.revenue, get("offer")),
    premises: premises ?? (structure?.capital === "storefront" || structure?.delivery === "store"),
  });
}

/** 매달 돈을 내는 사업인가 — 구독 구조이거나, 대표 상품이 '월 12회 게시물'·'월 4,900원 프리미엄'·'정기'처럼 한 달 단위다 */
export function isRecurring(revenue: string | undefined, offer: string | undefined): boolean {
  return revenue === "subscription" || /(?:^|\s)월\s*[\d,]+\s*(?:원|회|번)|매달|매월|정기\s*(?:결제|구독|관리|배송)|구독/.test(offer ?? "");
}
