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
import { chapterRef } from "./blueprint";
import { coachAmount, coachAmountLower, monthlyVolumeFromCapacity } from "./coach-feasibility";

export const cashflowScenariosEnabled = () => process.env.PLAN_CASHFLOW_SCENARIOS !== "0";

/*
 * 실제 금액으로 보기 어려운 돈 입력 — 이 판정이 맞으면 표·그래프를 만들지 않는다(계획서 품질 Q2, 2026-10-27).
 * 망원동 1인 도시락: 준비 예산·월 비용·생활비가 모두 3,000원으로 들어가, 본문은 '단위가 틀렸다'고 바르게 짚으면서도
 * 그 숫자로 만든 손익표·12개월 누적표(0원 12행)·가격 비교표·그래프가 두 쪽을 채웠다('한 달 1개').
 * 기준: 준비 예산·대표 생활비는 10만 원 미만이면 의심(0원은 '없음'·'고정비에 들어 있음'이라는 답이라 제외).
 * 월 고정비는 아주 작은 온라인 사업도 있어 1만 원 미만일 때만 혼자서 의심하고, 1만~10만 원은 다른 돈 입력도 의심일 때만 함께 센다.
 * 숫자를 고치지는 않는다 — 다시 입력할지는 대표가 정한다.
 */
export const IMPLAUSIBLE_MONEY_FLOOR = 100_000;
const IMPLAUSIBLE_FIXED_COST_ALONE = 10_000;
export type ImplausibleMoney = { key: "budget" | "cost" | "livingCost"; label: string; value: number };
const MONEY_LABELS: Record<ImplausibleMoney["key"], string> = { budget: "준비 예산", cost: "월 고정비", livingCost: "대표 생활비" };

export function implausibleMoneyInputs(values: { budget?: string; cost?: string; livingCost?: string }): ImplausibleMoney[] {
  const read = (key: ImplausibleMoney["key"]) => (key === "budget" ? coachAmountLower(values.budget) : coachAmount(values[key]));
  const small = (key: ImplausibleMoney["key"]) => { const value = read(key); return value != null && value > 0 && value < IMPLAUSIBLE_MONEY_FLOOR ? value : null; };
  const budget = small("budget"), cost = small("cost"), living = small("livingCost");
  const costCounts = cost != null && (cost < IMPLAUSIBLE_FIXED_COST_ALONE || budget != null || living != null);
  return ([["budget", budget], ["cost", costCounts ? cost : null], ["livingCost", living]] as const)
    .flatMap(([key, value]) => (value != null ? [{ key, label: MONEY_LABELS[key], value }] : []));
}

/** 대화에서 모은 값(budget·cost·livingCost)으로 판정한다 */
export function implausibleMoneyFromFields(fields: Array<{ key: string; value: string }>): ImplausibleMoney[] {
  const get = (key: string) => fields.find(field => field.key === key)?.value;
  return implausibleMoneyInputs({ budget: get("budget"), cost: get("cost"), livingCost: get("livingCost") });
}

const implausibleList = (items: ImplausibleMoney[]) => items.map(item => `${item.label} ${Math.round(item.value).toLocaleString("ko-KR")}원`).join(" · ");

/** 돈 장에 표·그래프 대신 붙는 빈 틀 한 블록(시스템이 본문 끝에 붙인다) */
export function implausibleMoneyMarkdown(items: ImplausibleMoney[]): string {
  return [
    "### 본전과 버티는 기간은 금액을 다시 넣은 뒤 채워집니다",
    "",
    `- 지금 들어간 금액: ${implausibleList(items)}`,
    "- 10만 원보다 적어 실제 금액으로 보기 어렵습니다. 그래서 이 금액으로 손익표·12개월 통장 흐름·가격 비교표·그래프를 만들지 않았습니다.",
    "- 본전 판매량: (금액을 다시 넣으면 계산)",
    "- 버티는 달수: (금액을 다시 넣으면 계산)",
    "",
    "준비 예산·월 비용·생활비를 실제 금액으로 다시 입력하면 여기에 본전·버티는 달수가 채워집니다.",
  ].join("\n");
}

/** 다른 장과 AI 문서 원천에 넘기는 참고 문장 — 이 금액으로 계산한 숫자를 쓰지 않게 한다 */
export function implausibleMoneyReference(items: ImplausibleMoney[], unit?: { unitPrice: number; unitVariableCost: number }): string {
  const contribution = unit ? unit.unitPrice - unit.unitVariableCost : 0;
  return [
    `계산 보류(입력 확인 필요): ${implausibleList(items)}은 10만 원보다 적어 실제 금액으로 보기 어렵습니다. 본전·판매량 목표·통장 흐름·버티는 기간·가격 비교는 계산하지 않았습니다.`,
    "- 이 금액으로 계산한 숫자(본전 판매량, 한 달 판매량, 남는 돈, 버티는 달수)를 본문과 표에 쓰지 않습니다.",
    `- 금액을 다시 확인해 달라는 안내는 ${chapterRef("financials/expenses")} 한 곳에서 한 번만 씁니다. 다른 장은 이 안내를 되풀이하지 않고 숫자 없이 씁니다.`,
    unit && unit.unitPrice > 0 && contribution > 0 ? `- 판매가 ${Math.round(unit.unitPrice).toLocaleString("ko-KR")}원 / 한 건당 비용 ${Math.round(unit.unitVariableCost).toLocaleString("ko-KR")}원 / 한 건에 남는 돈 ${Math.round(contribution).toLocaleString("ko-KR")}원(이 줄은 위 금액과 관계없이 계산됨)` : "",
  ].filter(Boolean).join("\n");
}

export type CashflowInputs = {
  unitPrice: number; unitVariableCost: number; monthlyFixedCost: number;
  capacity?: string; goal?: string; budget?: string; setupCost?: string;
  /** 대표 한 달 생활비. 0이면 고정비에 이미 들어 있다는 답이다(없음과 다르다) */
  livingCost?: string;
  /** 대표 상품 — '세트'처럼 처리량과 다른 단위로 파는지 알아보는 데만 쓴다 */
  offer?: string;
  /** 온라인으로 파는 사업(스마트스토어 등) — '문 열기 전/후', '월 26일 영업' 대신 '스토어 공개 전/후', '월 26일 작업'으로 쓴다 */
  online?: boolean;
};
/** 가게 문을 여는 사업과 스토어를 공개하는 사업의 말 */
type Words = { before: string; at: string; after: string; afterOpen: string; day: string };
const STORE_WORDS: Words = { before: "문 열기 전", at: "문 열 때", after: "문 연 뒤", afterOpen: "문을 연 뒤", day: "영업" };
const ONLINE_WORDS: Words = { before: "스토어 공개 전", at: "스토어 공개 때", after: "스토어 공개 뒤", afterOpen: "스토어를 공개한 뒤", day: "작업" };
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
  /** 남은 준비 예산이 이 아래로 내려가면 계속할지 다시 정한다(조심스러운 경우 3개월 적자분) */
  stopReserve: number | null;
  /** 가격을 바꾸면 본전·생활비선이 어떻게 되는지(한 건당 비용은 같다고 가정) */
  priceAlternatives: Array<{ price: number; breakEven: number; livingLine: number | null }>;
  /** 처리량 단위와 판매 단위가 다를 수 있다는 알림(예: 하루 120개 vs 세트) */
  unitNote: string | null;
  words: Words;
  /**
   * 준비 기간 생활비가 준비 예산을 거의 다 쓰는 경우의 두 번째 보기 — 생활비를 사업 예산 밖에서 낸다고 따로 가정한다.
   * 2026-10-22 캔들 스토어: 버티는 기간 표가 모두 '1개월도 못 버팀'이고 중단선(4,941,000원)이 공개 때 남는 돈보다 커서 표가 아무것도 알려 주지 못했다.
   */
  outside: { shortfall: number; stopReserve: number | null; survival: Array<{ spend: number; months: number }> } | null;
};

const MONTHS = 12;
/** 문 열기 전 준비 기간(개월) — 실행 장 '12주 할 일'과 같은 가정 */
const PREP_MONTHS = 3;
const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
const count = (value: number, unit: string) => `${Math.round(value).toLocaleString("ko-KR")}${unit}`;
/*
 * 하루 환산(월 26일 영업) — 처리량을 '하루 ○개'로 답한 사업(매장·카페처럼 날마다 파는 곳)만 쓴다.
 * 주·월 단위로 일하는 사업(출장 촬영, 학원)에 '하루 약 1건'을 붙이면 엉뚱한 기준이 된다. 하루 1개가 안 되면 말하지 않는다.
 */
const perDay = (daily: boolean, monthly: number, unit: string, wrap: (text: string) => string) => (daily && monthly / 26 >= 1 ? wrap(`하루 약 ${count(monthly / 26, unit)}`) : "");
/** 처리량 환산 문구('하루 20개 × 월 26일 영업')를 사업에 맞는 말로 */
const dayWord = (result: { words: Words }, text: string) => text.replace(/월 26일 영업/g, `월 26일 ${result.words.day}`);
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

export function buildCashflowScenarios(input: CashflowInputs): CashflowScenarios | null {
  const contribution = input.unitPrice - input.unitVariableCost;
  if (!(input.unitPrice > 0) || contribution <= 0 || input.monthlyFixedCost < 0) return null;
  const capacityParsed = monthlyVolumeFromCapacity(input.capacity);
  const capacity = capacityParsed && capacityParsed.volume > 0 ? { volume: capacityParsed.volume, note: capacityParsed.note } : null;
  const unit = capacityParsed?.unit || "건";
  const cap = (volume: number) => Math.max(0, Math.min(capacity?.volume ?? Infinity, Math.round(volume)));
  const breakEven = Math.ceil(input.monthlyFixedCost / contribution);
  // 대표 생활비가 있으면 매달 나가는 돈에 더한다 — 사업이 대표 생활까지 감당해야 하는 경우(품질기준 7번)
  const living = coachAmount(input.livingCost) ?? null;
  const livingBreakEven = living ? Math.ceil((input.monthlyFixedCost + living) / contribution) : null;
  const careful = cap(Math.ceil(breakEven / 2));
  const revenueGoal = parseRevenueGoal(input.goal), volumeGoal = revenueGoal ? null : parseVolumeGoal(input.goal);
  // 판매량 목표는 매출로 바꿔 같은 계산을 쓴다(표의 '대표 목표'도 매출로 보인다)
  const goal = revenueGoal ?? (volumeGoal ? { revenue: volumeGoal.volume * input.unitPrice, months: volumeGoal.months } : null);
  const make = (key: Scenario["key"], label: string, volumes: number[]): Scenario => {
    const net = volumes.map(volume => volume * contribution - input.monthlyFixedCost - (living ?? 0));
    const cumulative = net.reduce<number[]>((sum, value) => [...sum, (sum.at(-1) ?? 0) + value], []);
    return { key, label, volumes, net, cumulative };
  };
  const flat = (volume: number) => Array.from({ length: MONTHS }, () => volume);
  const scenarios = [
    make("careful", "조심스러운 경우", flat(careful)),
    livingBreakEven ? make("breakeven", "생활비까지 버는 경우", flat(cap(livingBreakEven))) : make("breakeven", "본전", flat(cap(breakEven))),
  ];
  if (goal) {
    const target = cap(Math.ceil(goal.revenue / input.unitPrice));
    const ramp = Array.from({ length: MONTHS }, (_, i) => (i + 1 >= goal.months || goal.months <= 1 ? target : cap(careful + (target - careful) * i / (goal.months - 1))));
    scenarios.push(make("goal", "목표 경우", ramp));
  }
  // 예산을 범위로 남겼으면 적은 쪽으로 계산한다(보수적)
  const budget = coachAmountLower(input.budget) ?? null, setupCost = coachAmount(input.setupCost) ?? null;
  const carefulWorst = Math.min(0, ...scenarios[0].cumulative);
  // 2026-10-10 진단: 문 열기 전 약 3개월은 수입 없이 생활비만 나간다 — 빼지 않으면 초기 지출 한도가 그만큼 느슨해진다
  const prepLiving = (living ?? 0) * PREP_MONTHS;
  const setupLimit = budget != null && setupCost == null ? budget + carefulWorst - prepLiving : null;
  // 초기 지출을 알면 실제 통장 잔고(준비 예산 − 초기 지출 + 누적)가 바닥나는 달을 센다
  const runOut = budget != null && setupCost != null
    ? scenarios.flatMap(s => { const month = s.cumulative.findIndex(value => budget - setupCost + value < 0); return month >= 0 ? [{ label: s.label, month: month + 1 }] : []; })
    : [];
  // 목표 경우에 한 달 남는 돈(생활비를 뺀 뒤)이 처음 0원 이상이 되는 달 — 그 달부터 사업에서 생활비를 가져갈 수 있다
  const goalScenario = scenarios.find(s => s.key === "goal");
  const payIndex = living && goalScenario ? goalScenario.net.findIndex(value => value >= 0) : -1;
  /*
   * 판단 기준: 계약처럼 큰돈을 쓰기 전 수요가 '생활비까지 버는 판매량(생활비를 모르면 본전)'에 닿아야 진행한다.
   * 본전의 절반(조심스러운 경우)을 기준으로 삼으면 기준을 넘겨도 매달 적자라 진행 판단을 잘못하게 된다.
   */
  const decision = { go: livingBreakEven ?? breakEven, goLabel: livingBreakEven ? "생활비까지 버는 판매량" : "본전 판매량", floor: careful };
  // 초기 지출에 따라 버티는 기간 — 준비 예산의 20·40·60·80%를 100만 원 단위로
  const shortfall = -scenarios[0].net[0];
  const survival = budget != null && shortfall > 0
    ? [...new Set([0.2, 0.4, 0.6, 0.8].map(share => Math.round(budget * share / 1_000_000) * 1_000_000))].filter(spend => spend > 0 && spend < budget).map(spend => ({ spend, months: Math.max(0, Math.floor((budget - spend - prepLiving) / shortfall)) }))
    : [];
  const stopReserve = shortfall > 0 ? shortfall * 3 : null;
  // 대안 가격: 가격 크기에 맞는 단위(500원·1,000원·1만 원)로 한 칸 낮게, 한두 칸 높게
  const step = input.unitPrice < 10_000 ? 500 : input.unitPrice < 100_000 ? 1_000 : 10_000;
  const priceAlternatives = [input.unitPrice - step, input.unitPrice + step, input.unitPrice + step * 2]
    .filter(price => price - input.unitVariableCost > 0)
    .map(price => ({ price, breakEven: Math.ceil(input.monthlyFixedCost / (price - input.unitVariableCost)), livingLine: living ? Math.ceil((input.monthlyFixedCost + living) / (price - input.unitVariableCost)) : null }));
  const words = input.online ? ONLINE_WORDS : STORE_WORDS;
  const unitNote = /세트/.test(input.offer ?? "") && capacityParsed && !/세트/.test(capacityParsed.unit)
    ? `처리량(${capacityParsed.note.replace(/월 26일 영업/g, `월 26일 ${words.day}`)})과 판매 단위(세트)를 같다고 보고 계산했습니다. 세트 하나에 상품이 여러 개 들어가면 팔 수 있는 세트 수가 그만큼 줄어듭니다.`
    : null;
  /*
   * 생활비를 예산에서 내면 공개 때 남는 돈이 중단선보다 적거나 버티는 기간이 모두 1개월 미만일 때만 두 번째 보기를 만든다.
   * 생활비를 뺀 조심스러운 경우 적자(고정비 − 한 건에 남는 돈 × 판매량)로 다시 센다. 숫자는 여기서만 계산한다.
   */
  const cashAtOpen = budget != null ? budget - prepLiving - (setupCost ?? 0) : null;
  const exhausted = !!living && budget != null && (survival.length > 0 && survival.every(row => row.months < 1) || stopReserve != null && cashAtOpen != null && cashAtOpen < stopReserve);
  const outsideShortfall = Math.max(0, input.monthlyFixedCost - careful * contribution);
  const outside = exhausted ? {
    shortfall: outsideShortfall,
    stopReserve: outsideShortfall > 0 ? outsideShortfall * 3 : null,
    survival: [...new Set([0.2, 0.4, 0.6, 0.8].map(share => Math.round(budget! * share / 1_000_000) * 1_000_000))].filter(spend => spend > 0 && spend < budget!)
      .map(spend => ({ spend, months: outsideShortfall > 0 ? Math.max(0, Math.floor((budget! - spend) / outsideShortfall)) : MONTHS })),
  } : null;
  return { unit, daily: /하루/.test(input.capacity ?? ""), unitPrice: input.unitPrice, monthlyFixedCost: input.monthlyFixedCost, contribution, breakEven, capacity, living, livingBreakEven, payFromMonth: payIndex >= 0 ? payIndex + 1 : null, goal, budget, setupCost, scenarios, carefulWorst, setupLimit, runOut, decision, survival, prepLiving, stopReserve, priceAlternatives, unitNote, words, outside };
}

const capacityShort = (result: CashflowScenarios) => !!result.capacity && result.capacity.volume < (result.livingBreakEven ?? result.breakEven);

function scenarioBasis(result: CashflowScenarios, s: Scenario): string {
  if (s.key === "careful") return "가정: 본전 판매량의 절반";
  if (s.key === "breakeven" && result.livingBreakEven) return capacityShort(result) ? `처리량 최대치로도 고정비와 생활비(월 ${count(result.livingBreakEven, result.unit)})를 못 메움` : `고정비와 대표 생활비 월 ${won(result.living!)}을 겨우 메우는 판매량`;
  if (s.key === "breakeven") return capacityShort(result) ? `처리량 최대치로도 본전(월 ${count(result.breakEven, result.unit)})에 못 미침` : "고정비를 겨우 메우는 판매량";
  return `대표 목표(월 매출 ${won(result.goal!.revenue)})까지 ${result.goal!.months}개월 동안 같은 폭으로 는다고 가정`;
}

/** 통장 흐름을 바로 읽히는 문장으로 — 표 아래 주석과 다른 장의 참고값에 같이 쓴다 */
function cashflowFindings(result: CashflowScenarios): string[] {
  const lines: string[] = [];
  const careful = result.scenarios[0];
  if (result.living) lines.push(`대표 생활비 월 ${won(result.living)}을 나가는 돈에 넣었습니다. 생활비까지 벌려면 팔아야 하는 양은 월 ${count(result.livingBreakEven!, result.unit)}${perDay(result.daily, result.livingBreakEven!, result.unit, text => `, ${text}`)}입니다.`);
  if (careful.net[0] < 0) lines.push(`조심스러운 경우 매달 ${won(-careful.net[0])}씩 모자라, 12개월 동안 ${result.living ? "생활비를 포함해 " : "사업에서 "}모자라는 돈은 ${won(-result.carefulWorst)}입니다.`);
  if (result.prepLiving > 0) lines.push(`${result.words.before} 준비 기간(12주, 약 3개월)에도 생활비 ${won(result.prepLiving)}이 수입 없이 준비 예산에서 나갑니다.`);
  if (result.setupLimit != null) lines.push(result.setupLimit > 0
    ? `준비 예산 ${won(result.budget!)}에서 ${result.prepLiving > 0 ? "준비 기간 생활비를 빼고 " : ""}초기 지출을 ${won(result.setupLimit)} 이하로 써야 조심스러운 경우에도 ${result.words.after} 12개월을 버팁니다.`
    : `조심스러운 경우 ${result.prepLiving > 0 ? "준비 기간 생활비와 " : ""}12개월 동안 모자라는 돈이 준비 예산 ${won(result.budget!)}보다 많습니다. 초기 지출 전에 이미 모자랍니다.`);
  if (result.stopReserve != null && result.budget != null) lines.push(`${result.words.afterOpen} 남은 준비 예산이 ${won(result.stopReserve)}(조심스러운 경우 3개월 적자분) 아래로 내려가면 계속할지 다시 정합니다.`);
  if (result.outside) {
    const cashAtOpen = result.budget! - result.prepLiving - (result.setupCost ?? 0);
    lines.push(`준비 예산 ${won(result.budget!)}으로는 대표 생활비를 감당하지 못합니다(준비 기간 생활비를 내면 ${result.words.at} 남는 돈 ${won(Math.max(0, cashAtOpen))}${cashAtOpen < 0 ? `, ${won(-cashAtOpen)} 모자람` : ""}).`);
    lines.push(result.outside.shortfall > 0
      ? `생활비를 사업 예산 밖에서 낸다고 따로 가정하면(별도 가정), 조심스러운 경우 매달 ${won(result.outside.shortfall)}씩 모자라고 중단선은 ${won(result.outside.stopReserve!)}(3개월 적자분)입니다.`
      : "생활비를 사업 예산 밖에서 낸다고 따로 가정하면(별도 가정), 조심스러운 경우에도 매달 고정비를 메웁니다.");
  }
  if (result.unitNote) lines.push(result.unitNote);
  for (const item of result.runOut) lines.push(`${item.label}에는 준비 예산에서 초기 지출을 뺀 돈이 ${item.month}개월차에 바닥납니다.`);
  const goal = result.scenarios.find(s => s.key === "goal");
  const recover = goal ? goal.cumulative.findIndex(value => value >= 0) : -1;
  if (result.living && goal) lines.push(result.payFromMonth ? `목표 경우에는 ${result.payFromMonth}개월차부터 한 달 매출로 고정비와 생활비를 모두 메워, 그때부터 사업에서 생활비를 가져갈 수 있습니다. 그 전까지 생활비는 준비 예산에서 나갑니다.` : "목표 경우에도 12개월 안에 한 달 매출로 생활비까지 메우지 못합니다.");
  if (goal && goal.net[0] < 0) lines.push(recover >= 0 ? `목표 경우에는 ${recover + 1}개월차에 그동안 모자랐던 돈을 모두 메웁니다.` : "목표 경우에도 12개월 안에 그동안 모자랐던 돈을 다 메우지 못합니다.");
  if (capacityShort(result)) lines.push(`처리량 최대치(${result.capacity!.note})를 다 팔아도 본전에 못 미칩니다. 가격·고정비·처리량을 다시 봐야 합니다.`);
  return lines;
}

/** 목표 경우의 월별 판매선 — 실행 장의 '매달 볼 숫자' 목표로 쓴다 */
function goalLine(result: CashflowScenarios): string {
  const goal = result.scenarios.find(s => s.key === "goal");
  if (!goal || !result.goal) return "";
  const months = goal.volumes.slice(0, result.goal.months).map((volume, i) => `${i + 1}개월차 ${count(volume, result.unit)}`);
  return `- 목표 경우 월별 판매선(매달 볼 숫자의 목표, ${chapterRef("summary/roadmap")}에서 씀): ${months.join(", ")}`;
}

/** 같은 기간끼리 비교하도록 하루(월 26일)·일주일(월 4.3주)·한 달을 함께 쓴다 */
const periods = (daily: boolean, monthly: number, unit: string) => [perDay(daily, monthly, unit, text => text), monthly / 4.3 >= 1 ? `일주일 약 ${count(monthly / 4.3, unit)}` : "", `한 달 ${count(monthly, unit)}`].filter(Boolean).join(" / ");
const monthsText = (months: number) => (months >= 12 ? "12개월 이상" : months < 1 ? "1개월도 못 버팀" : `약 ${months}개월`);
const outsideText = (months: number | undefined) => (months == null ? "-" : monthsText(months));

/*
 * 판단 기준 — 출시 전과 문 연 뒤 두 번(2026-10-11 유형 시뮬레이션 검토: 출시 전에 판매량 기준을 그대로 쓰면
 * 새로 모은 예약 의사로는 닿을 수 없거나 너무 느슨했다). 출시 전에는 작은 표본의 실제 비율과 '닿아야 하는 사람 수'로 본다.
 * 비율별 사람 수는 여기서 계산한다 — 본문이 숫자를 만들지 않게.
 */
function decisionLines(result: CashflowScenarios): string[] {
  const { decision, unit } = result;
  const reach = (rate: number) => {
    const monthly = Math.ceil(decision.go / rate);
    return result.daily ? `하루 약 ${Math.ceil(monthly / 26).toLocaleString("ko-KR")}명` : monthly / 4.3 >= 1 ? `일주일 약 ${Math.ceil(monthly / 4.3).toLocaleString("ko-KR")}명` : `한 달 ${monthly.toLocaleString("ko-KR")}명`;
  };
  return [
    `판단 기준(${chapterRef("summary/roadmap")}에서 씀): ${decision.goLabel}(${periods(result.daily, decision.go, unit)}) 이상이면 계획대로, 그보다 적고 본전의 절반(${periods(result.daily, decision.floor, unit)})보다 많으면 규모(공간·장비·상품 수)를 줄여서, 본전의 절반 이하면 시작안을 바꿉니다. 판단은 계약처럼 큰돈을 쓰기 전(출시 전)에 한 번, ${result.words.afterOpen}에 다시 합니다.`,
    `출시 전 판단: 돈을 받고 실제로 팔아 볼 수 있으면(이미 신고된 공간·시범 판매) 실제 판매 수를 위 기준과 같은 기간끼리 비교합니다. 아직 팔 수 없으면 판매량 기준을 그대로 쓰지 않습니다. 새로 모은 예약 의사 수는 수요보다 '얼마나 닿았는지'를 재기 때문입니다. 대신 작은 표본에서 잰 실제 비율(체험한 사람 중 등록한 비율, 찾아간 곳 중 계약한 비율, 의견을 준 사람 중 날짜·수량까지 남긴 비율)과 경쟁 자료(비슷한 가게의 빈자리·예약 달력·가동률)로 판단합니다.`,
    `${decision.goLabel}을 채우려면 닿아야 하는 사람 수(잰 비율에 맞춰 고름): 비율 10%면 ${reach(0.1)}, 20%면 ${reach(0.2)}, 30%면 ${reach(0.3)}. 그만큼의 사람에게 닿을 길(지나가는 사람, 단지 세대, 커뮤니티 회원 등)이 있어야 진행합니다.`,
    `${result.words.afterOpen}: 실제 판매 수를 위 기준과 매달 비교하고, 남은 준비 예산이 중단선 아래로 내려가면 계속할지 다시 정합니다. 관심 글의 댓글·공감 수는 판매 수가 아니므로 이 기준과 바로 비교하지 않습니다.`,
  ];
}

const chart = (title: string, values: number[], breakEvenMonth: number | null) =>
  ["```plan-chart", JSON.stringify({ kind: "cumulative", title, points: values.map((value, i) => ({ label: `${i + 1}개월차`, value })), breakEvenMonth, paybackMonth: null }), "```"].join("\n");

/** 돈 장에 붙는 표·그래프(시스템이 본문 끝에 붙인다). 숫자는 모두 이 파일에서 계산한다 */
export function cashflowMarkdown(result: CashflowScenarios): string {
  const { unit } = result;
  const opening = result.budget != null && result.setupCost != null ? result.budget - result.setupCost : null;
  const headLabel = opening != null ? "통장 잔고" : "통장 누적";
  const rows = Array.from({ length: 12 }, (_, i) => `| ${i + 1}개월차 | ${result.scenarios.map(s => won((opening ?? 0) + s.cumulative[i])).join(" | ")} |`);
  const goal = result.scenarios.find(s => s.key === "goal");
  return [
    `### ${kinds(result)} 경우로 본 한 달`,
    "",
    `판매가 ${won(result.unitPrice)}에서 한 건당 비용 ${won(result.unitPrice - result.contribution)}을 빼면 한 건에 ${won(result.contribution)}이 남습니다. 매달 나가는 ${won(result.monthlyFixedCost)}을 메우는 본전 판매량은 월 ${count(result.breakEven, unit)}${perDay(result.daily, result.breakEven, unit, text => `, ${text}(월 26일 ${result.words.day} 기준)`)}입니다.`,
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
    `- ${opening != null ? `통장 잔고는 준비 예산 ${won(result.budget!)}에서 초기 지출 ${won(result.setupCost!)}을 뺀 ${won(opening)}에서 시작합니다.` : "통장 누적은 사업에서 들어오고 나간 돈만 더한 값입니다. 초기 지출은 빠져 있습니다."} ${result.living ? "대표 생활비는 나가는 돈에 들어 있고, " : result.living === 0 ? "대표 생활비는 고정비에 들어 있다고 답했고, " : `대표 생활비(고정비 ${won(result.monthlyFixedCost)}에 들어 있지 않다면)와 `}부가세·소득세는 빠져 있습니다.`,
    result.capacity ? `- 처리량 최대치: ${dayWord(result, result.capacity.note)}. 어느 경우도 이보다 많이 팔지 않는다고 계산했습니다.` : undefined,
    ...(result.survival.length ? [
      "",
      "### 초기 지출에 따라 버티는 기간",
      "",
      `조심스러운 경우(매달 ${won(-result.scenarios[0].net[0])} 모자람)에 준비 예산 ${won(result.budget!)}으로 ${result.words.after} 버티는 기간입니다${result.prepLiving > 0 ? `(준비 기간 생활비 ${won(result.prepLiving)}을 먼저 뺌)` : ""}. 초기 지출 견적을 받으면 이 표로 판단합니다.`,
      ...(result.outside ? ["", `준비 예산으로는 대표 생활비를 감당하지 못합니다. 그래서 생활비를 사업 예산 밖에서 낸다고 따로 가정한 칸(생활비 빼고 매달 ${won(result.outside.shortfall)} 모자람)을 함께 둡니다.`] : []),
      "",
      `| 초기 지출 | 남는 준비 예산${result.prepLiving > 0 ? "(준비 기간 생활비 뺀 뒤)" : ""} | 버티는 기간 |${result.outside ? " 생활비를 예산 밖에서 낼 때(별도 가정) |" : ""}`,
      `| ---: | ---: | --- |${result.outside ? " --- |" : ""}`,
      ...result.survival.map((row, i) => `| ${won(row.spend)} | ${won(result.budget! - row.spend - result.prepLiving)} | ${monthsText(row.months)} |${result.outside ? ` ${outsideText(result.outside.survival[i]?.months)} |` : ""}`),
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
    perDay(result.daily, result.breakEven, result.unit, text => `- 하루 환산(월 26일 ${result.words.day} 가정): 본전 ${text}`),
    ...result.scenarios.map(s => `- ${s.label}(${scenarioBasis(result, s)}): 월 ${count(s.volumes.at(-1)!, result.unit)}${perDay(result.daily, s.volumes.at(-1)!, result.unit, text => `(${text})`)}${s.volumes[0] !== s.volumes.at(-1) ? `, 첫 달 월 ${count(s.volumes[0], result.unit)}${perDay(result.daily, s.volumes[0], result.unit, text => `(${text})`)}` : ""}, 한 달에 ${won(s.net.at(-1)!)}, 12개월 누적 ${won(s.cumulative.at(-1)!)}`),
    ...cashflowFindings(result).map(line => `- ${line}`),
    ...decisionLines(result).map(line => `- ${line}`),
    result.survival.length ? `- 초기 지출별 버티는 기간(조심스러운 경우${result.prepLiving > 0 ? ", 준비 기간 생활비를 먼저 뺌" : ""}): ${result.survival.map(row => `${won(row.spend)}이면 ${monthsText(row.months)}`).join(", ")}` : "",
    result.outside?.survival.length ? `- 생활비를 사업 예산 밖에서 낼 때(별도 가정) 초기 지출별 버티는 기간: ${result.outside.survival.map(row => `${won(row.spend)}이면 ${monthsText(row.months)}`).join(", ")}` : "",
    goalLine(result),
    result.priceAlternatives.length ? `- 가격을 바꾸면(${won(Math.abs(result.priceAlternatives[0].price - result.unitPrice))}씩, 한 건당 비용은 같다고 가정, ${chapterRef("strategy/price")}에서 씀): ${result.priceAlternatives.map(alt => `${won(alt.price)} → 본전 ${periods(result.daily, alt.breakEven, result.unit)}${alt.livingLine ? `, 생활비선 ${periods(result.daily, alt.livingLine, result.unit)}` : ""}`).join(" / ")}` : "",
    result.living != null ? "- 초기 지출(입력이 없으면)과 부가세·소득세는 이 계산에 빠져 있습니다." : "- 초기 지출(입력이 없으면), 대표 생활비(고정비에 없다면), 부가세·소득세는 이 계산에 빠져 있습니다.",
  ].filter(Boolean).join("\n");
}

/** 대화에서 모은 값(가격·변동비·고정비 + 처리량·목표·예산·초기 지출)으로 세 경우를 만든다 */
export function cashflowFromFields(fields: Array<{ key: string; value: string }>, money: { unitPrice: number; unitVariableCost: number; monthlyFixedCost: number; online?: boolean }): CashflowScenarios | null {
  const get = (key: string) => fields.find(field => field.key === key)?.value;
  return buildCashflowScenarios({ ...money, capacity: get("capacity"), goal: get("goal"), budget: get("budget"), setupCost: get("setupCost"), livingCost: get("livingCost"), offer: get("offer"), online: money.online });
}
