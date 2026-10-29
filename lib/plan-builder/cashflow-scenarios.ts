/*
 * 돈 장 — 세 가지 경우의 12개월 통장 흐름(품질기준 6·7번, docs/사업계획서-품질기준-최종본-2026-10-09.md).
 * 신규 사업의 기본(2026-10-10 블라인드 검토 3회로 결정). PLAN_CASHFLOW_SCENARIOS=0 이면 예전 손익표로 돌아간다(서버 계산만 바뀐다).
 *
 * 예전 12개월 표는 처리량 최대치(빵집이면 하루 120개)를 매일 다 판다고 계산해 '1월부터 매달 흑자'로 보였다.
 * 새로 시작하는 사업은 실제 판매량을 모르므로, 판매량 하나를 정하지 않고 대표가 입력한 값에서 나오는 세 경우를 나란히 본다.
 * - 조심스러운 경우: 본전 판매량의 절반(가정 — Start Up Loans 현금흐름 안내의 '판매는 보수적으로'를 숫자로 둔 것)
 * - 본전: 사업 비용(월 고정비)만 겨우 메우는 판매량. 이때 대표가 가져가는 돈은 0원이다
 * - 목표 경우: 대표가 입력한 목표(예: '6개월 안에 월 매출 1,200만원')까지 첫 달 조심스러운 경우에서 매달 같은 폭으로 늘어난다고 가정
 * 모든 경우는 처리량 최대치를 넘지 않는다. 숫자는 여기서만 계산하고 AI는 인용·해석만 한다.
 *
 * 계획서 품질 Q3(대표 결정 2026-10-28): 창업자 개인 생활비는 이 계획서가 맡지 않는다 — 생활비 질문을 빼고 계산에서도 뺐다.
 * 이미 저장된 livingCost 답은 지우지 않고 계산에서만 무시한다. 대신 입력 없이 계산되는 '본전을 넘겨 1개 더 팔 때마다 대표 몫' 한 줄만 둔다.
 * 한 건에 남는 돈은 판매가에서 부가세(법정 비율)까지 뺀 '실제 남는 돈'으로 본다(2026-10-28 검토: 9,000원 − 재료비 3,500원 = 5,500원이 너무 낙관적).
 */
import { chapterRef } from "./blueprint";
import { coachAmount, coachAmountLower, monthlyVolumeFromCapacity } from "./coach-feasibility";

export const cashflowScenariosEnabled = () => process.env.PLAN_CASHFLOW_SCENARIOS !== "0";

/*
 * 실제 금액으로 보기 어려운 돈 입력 — 이 판정이 맞으면 표·그래프를 만들지 않는다(계획서 품질 Q2, 2026-10-27).
 * 망원동 1인 도시락: 준비 예산·월 비용이 모두 3,000원으로 들어가, 본문은 '단위가 틀렸다'고 바르게 짚으면서도
 * 그 숫자로 만든 손익표·12개월 누적표(0원 12행)·가격 비교표·그래프가 두 쪽을 채웠다('한 달 1개').
 * 기준: 준비 예산은 10만 원 미만이면 의심(0원은 '없음'이라는 답이라 제외).
 * 월 고정비는 아주 작은 온라인 사업도 있어 1만 원 미만일 때만 혼자서 의심하고, 1만~10만 원은 준비 예산도 의심일 때만 함께 센다.
 * 대표 생활비는 계산에 쓰지 않으므로 판정에서도 뺐다(Q3, 2026-10-28). 숫자를 고치지는 않는다 — 다시 입력할지는 대표가 정한다.
 */
export const IMPLAUSIBLE_MONEY_FLOOR = 100_000;
const IMPLAUSIBLE_FIXED_COST_ALONE = 10_000;
export type ImplausibleMoney = { key: "budget" | "cost"; label: string; value: number };
const MONEY_LABELS: Record<ImplausibleMoney["key"], string> = { budget: "준비 예산", cost: "월 고정비" };

export function implausibleMoneyInputs(values: { budget?: string; cost?: string }): ImplausibleMoney[] {
  const read = (key: ImplausibleMoney["key"]) => (key === "budget" ? coachAmountLower(values.budget) : coachAmount(values[key]));
  const small = (key: ImplausibleMoney["key"]) => { const value = read(key); return value != null && value > 0 && value < IMPLAUSIBLE_MONEY_FLOOR ? value : null; };
  const budget = small("budget"), cost = small("cost");
  const costCounts = cost != null && (cost < IMPLAUSIBLE_FIXED_COST_ALONE || budget != null);
  return ([["budget", budget], ["cost", costCounts ? cost : null]] as const)
    .flatMap(([key, value]) => (value != null ? [{ key, label: MONEY_LABELS[key], value }] : []));
}

/** 대화에서 모은 값(budget·cost)으로 판정한다 */
export function implausibleMoneyFromFields(fields: Array<{ key: string; value: string }>): ImplausibleMoney[] {
  const get = (key: string) => fields.find(field => field.key === key)?.value;
  return implausibleMoneyInputs({ budget: get("budget"), cost: get("cost") });
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
    "준비 예산·월 비용을 실제 금액으로 다시 입력하면 여기에 본전·버티는 달수가 채워집니다.",
  ].join("\n");
}

/** 다른 장과 AI 문서 원천에 넘기는 참고 문장 — 이 금액으로 계산한 숫자를 쓰지 않게 한다 */
export function implausibleMoneyReference(items: ImplausibleMoney[], unit?: { unitPrice: number; unitVariableCost: number }): string {
  const contribution = unit ? realUnitMargin(unit.unitPrice, unit.unitVariableCost) : 0;
  return [
    `계산 보류(입력 확인 필요): ${implausibleList(items)}은 10만 원보다 적어 실제 금액으로 보기 어렵습니다. 본전·판매량 목표·통장 흐름·버티는 기간·가격 비교는 계산하지 않았습니다.`,
    "- 이 금액으로 계산한 숫자(본전 판매량, 한 달 판매량, 남는 돈, 버티는 달수)를 본문과 표에 쓰지 않습니다.",
    `- 금액을 다시 확인해 달라는 안내는 ${chapterRef("financials/expenses")} 한 곳에서 한 번만 씁니다. 다른 장은 이 안내를 되풀이하지 않고 숫자 없이 씁니다.`,
    unit && unit.unitPrice > 0 && contribution > 0 ? `- 판매가 ${Math.round(unit.unitPrice).toLocaleString("ko-KR")}원 / 한 건당 비용 ${Math.round(unit.unitVariableCost).toLocaleString("ko-KR")}원 / 부가세 ${vatInPrice(unit.unitPrice).toLocaleString("ko-KR")}원(일반과세자 가정, 과세 유형 확인 필요) / 한 건에 실제 남는 돈 ${Math.round(contribution).toLocaleString("ko-KR")}원(포장·수수료 등은 확인 필요, 이 줄은 위 금액과 관계없이 계산됨)` : "",
  ].filter(Boolean).join("\n");
}

/*
 * 한 건에 실제 남는 돈 — 법으로 정해진 것만 계산하고 나머지는 '확인 필요' 칸으로 둔다(숫자를 지어내지 않는다).
 * - 부가세: 판매가에 부가세가 들어 있고 일반과세자면 판매가의 1/11(부가가치세법 세율 10%, 공급가액 = 판매가 ÷ 1.1).
 *   과세 유형(일반·간이·면세)은 대표가 아직 답하지 않았으므로 '확인 필요'로 밝힌다. 일반과세자로 보는 쪽이 남는 돈을 적게 잡는다(보수적).
 *   재료를 살 때 낸 부가세를 돌려받는 몫(매입세액 공제)은 영수증 종류에 따라 달라 빼 주지 않는다 — 이것도 보수적인 쪽이다.
 * - 포장·폐기·카드 수수료: 요율이 사업마다 달라 계산하지 않는다. 표에 '확인 필요' 칸으로 남기고, 그래서 본전이 낙관적이라고 밝힌다.
 */
export const vatInPrice = (price: number) => Math.round(price / 11);
/** 판매가에서 부가세(일반과세자 가정)와 한 건당 비용을 뺀 돈 */
export const realUnitMargin = (price: number, unitCost: number) => price - vatInPrice(price) - unitCost;
/** 포장·용기와 팔지 못해 버리는 몫(폐기)이 생기는 판매 단위 */
const GOODS_UNIT = /^(?:개|잔|세트|병|봉|봉지|판|상자|박스|인분|컵|통|팩|송이|다발|조각|권|켤레|마리)$/;

export type CashflowInputs = {
  unitPrice: number; unitVariableCost: number; monthlyFixedCost: number;
  capacity?: string; goal?: string; budget?: string; setupCost?: string;
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
  unit: string; daily: boolean; unitPrice: number; monthlyFixedCost: number;
  /** 판매가에 들어 있는 부가세(일반과세자, 판매가의 1/11) */
  vat: number;
  /** 한 건에 실제 남는 돈 = 판매가 − 부가세 − 한 건당 비용. 본전·통장 흐름은 모두 이 값으로 계산한다 */
  contribution: number;
  /** 포장·폐기처럼 상품에만 생기는 '확인 필요' 칸을 보일지 */
  goods: boolean;
  breakEven: number; capacity: { volume: number; note: string } | null;
  goal: { revenue: number; months: number } | null; budget: number | null; setupCost: number | null;
  scenarios: Scenario[]; carefulWorst: number;
  /**
   * 초기 지출 한도 — 중단선에서 거꾸로 계산한다(계획서 품질 Q6): 준비 예산 − 중단선 − 조심스러운 경우 판단 기간(REVIEW_MONTHS) 동안 모자라는 돈.
   * 예전에는 '준비 예산 − 조심스러운 경우 12개월 부족분'이라, 한도대로 쓰면 6개월차에 중단선에 걸려 두 기준이 어긋났다.
   */
  setupLimit: number | null;
  /** 조심스러운 경우 판단 기간 동안 모자라는 돈(양수) */
  reviewShortfall: number;
  /** 초기 지출을 한도(또는 입력한 초기 지출)만큼 쓰면 조심스러운 경우 남은 준비 예산이 중단선에 닿는 달(0이면 문 열 때부터, null이면 12개월 안에 닿지 않음) */
  stopMonth: number | null;
  runOut: { label: string; month: number }[];
  /** 진행·축소·변경을 가르는 판매량(월) — 장마다 기준이 달라지지 않게 여기서 한 번만 정한다(2026-10-10 블라인드 검토) */
  decision: { go: number; goLabel: string; floor: number };
  /** 매출이 없어도 월 고정비를 낼 수 있는 달수 — (준비 예산 − 초기 지출) ÷ 월 고정비. 초기 지출을 모를 때 대표가 정할 수 있게 몇 가지로 */
  survival: Array<{ spend: number; months: number }>;
  /** 남은 준비 예산이 이 아래로 내려가면 계속할지 다시 정한다(월 고정비 3개월분) */
  stopReserve: number | null;
  /** 가격을 바꾸면 본전이 어떻게 되는지(한 건당 비용은 같다고 가정, 부가세는 가격마다 다시 계산) */
  priceAlternatives: Array<{ price: number; breakEven: number }>;
  /** 처리량 단위와 판매 단위가 다를 수 있다는 알림(예: 하루 120개 vs 세트) */
  unitNote: string | null;
  words: Words;
  online: boolean;
};

const MONTHS = 12;
/*
 * 판단 기간(가정) — 문을 연 뒤 실제 판매로 계속할지 판단할 시간. 초기 지출 한도는 조심스러운 경우에도 이 기간 동안
 * 남은 준비 예산이 중단선(월 고정비 3개월분) 위에 있도록 거꾸로 계산한다(계획서 품질 Q6). 입력이 아닌 가정이라 문장에 '(가정)'으로 밝힌다.
 */
export const REVIEW_MONTHS = 6;
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
  const vat = vatInPrice(input.unitPrice);
  const contribution = realUnitMargin(input.unitPrice, input.unitVariableCost);
  if (!(input.unitPrice > 0) || contribution <= 0 || input.monthlyFixedCost < 0) return null;
  const capacityParsed = monthlyVolumeFromCapacity(input.capacity);
  const capacity = capacityParsed && capacityParsed.volume > 0 ? { volume: capacityParsed.volume, note: capacityParsed.note } : null;
  const unit = capacityParsed?.unit || "건";
  const cap = (volume: number) => Math.max(0, Math.min(capacity?.volume ?? Infinity, Math.round(volume)));
  // 본전은 사업 비용(월 고정비)만 메우는 판매량 하나로 정한다 — 대표 생활비는 넣지 않는다(Q3)
  const breakEven = Math.ceil(input.monthlyFixedCost / contribution);
  const careful = cap(Math.ceil(breakEven / 2));
  const revenueGoal = parseRevenueGoal(input.goal), volumeGoal = revenueGoal ? null : parseVolumeGoal(input.goal);
  // 판매량 목표는 매출로 바꿔 같은 계산을 쓴다(표의 '대표 목표'도 매출로 보인다)
  const goal = revenueGoal ?? (volumeGoal ? { revenue: volumeGoal.volume * input.unitPrice, months: volumeGoal.months } : null);
  const make = (key: Scenario["key"], label: string, volumes: number[]): Scenario => {
    const net = volumes.map(volume => volume * contribution - input.monthlyFixedCost);
    const cumulative = net.reduce<number[]>((sum, value) => [...sum, (sum.at(-1) ?? 0) + value], []);
    return { key, label, volumes, net, cumulative };
  };
  const flat = (volume: number) => Array.from({ length: MONTHS }, () => volume);
  const scenarios = [make("careful", "조심스러운 경우", flat(careful)), make("breakeven", "본전", flat(cap(breakEven)))];
  if (goal) {
    const target = cap(Math.ceil(goal.revenue / input.unitPrice));
    const ramp = Array.from({ length: MONTHS }, (_, i) => (i + 1 >= goal.months || goal.months <= 1 ? target : cap(careful + (target - careful) * i / (goal.months - 1))));
    scenarios.push(make("goal", "목표 경우", ramp));
  }
  // 예산을 범위로 남겼으면 적은 쪽으로 계산한다(보수적)
  const budget = coachAmountLower(input.budget) ?? null, setupCost = coachAmount(input.setupCost) ?? null;
  const carefulWorst = Math.min(0, ...scenarios[0].cumulative);
  const fixed = input.monthlyFixedCost;
  const stopReserve = fixed > 0 ? fixed * 3 : null;
  // 초기 지출 한도와 중단선은 같은 논리에서 나온다: 한도대로 쓰면 조심스러운 경우 판단 기간이 끝나는 달에 남은 예산이 중단선에 닿는다
  const reviewShortfall = -Math.min(0, scenarios[0].cumulative[REVIEW_MONTHS - 1]);
  const setupLimit = budget != null && setupCost == null ? budget - (stopReserve ?? 0) - reviewShortfall : null;
  const stopAt = (spend: number): number | null => {
    if (budget == null || stopReserve == null) return null;
    if (budget - spend <= stopReserve) return 0;
    const month = scenarios[0].cumulative.findIndex(value => value < 0 && budget - spend + value <= stopReserve);
    return month >= 0 ? month + 1 : null;
  };
  const stopMonth = setupCost != null ? stopAt(setupCost) : setupLimit != null && setupLimit > 0 ? stopAt(setupLimit) : null;
  // 초기 지출을 알면 실제 통장 잔고(준비 예산 − 초기 지출 + 누적)가 바닥나는 달을 센다
  const runOut = budget != null && setupCost != null
    ? scenarios.flatMap(s => { const month = s.cumulative.findIndex(value => budget - setupCost + value < 0); return month >= 0 ? [{ label: s.label, month: month + 1 }] : []; })
    : [];
  /*
   * 판단 기준: 계약처럼 큰돈을 쓰기 전 수요가 본전 판매량에 닿아야 진행한다.
   * 본전의 절반(조심스러운 경우)을 기준으로 삼으면 기준을 넘겨도 매달 적자라 진행 판단을 잘못하게 된다.
   */
  const decision = { go: breakEven, goLabel: "본전 판매량", floor: careful };
  // 버티는 기간 = (준비 예산 − 초기 지출) ÷ 월 고정비(매출이 하나도 없다고 볼 때). 초기 지출을 모르면 준비 예산의 20·40·60·80%를 100만 원 단위로
  const survival = budget != null && fixed > 0
    ? (setupCost != null ? [setupCost] : [...new Set([0.2, 0.4, 0.6, 0.8].map(share => Math.round(budget * share / 1_000_000) * 1_000_000))].filter(spend => spend > 0 && spend < budget))
      .map(spend => ({ spend, months: Math.max(0, Math.floor((budget - spend) / fixed)) }))
    : [];
  // 대안 가격: 가격 크기에 맞는 단위(500원·1,000원·1만 원)로 한 칸 낮게, 한두 칸 높게
  const step = input.unitPrice < 10_000 ? 500 : input.unitPrice < 100_000 ? 1_000 : 10_000;
  const priceAlternatives = [input.unitPrice - step, input.unitPrice + step, input.unitPrice + step * 2]
    .filter(price => realUnitMargin(price, input.unitVariableCost) > 0)
    .map(price => ({ price, breakEven: Math.ceil(input.monthlyFixedCost / realUnitMargin(price, input.unitVariableCost)) }));
  const words = input.online ? ONLINE_WORDS : STORE_WORDS;
  const unitNote = /세트/.test(input.offer ?? "") && capacityParsed && !/세트/.test(capacityParsed.unit)
    ? `처리량(${capacityParsed.note.replace(/월 26일 영업/g, `월 26일 ${words.day}`)})과 판매 단위(세트)를 같다고 보고 계산했습니다. 세트 하나에 상품이 여러 개 들어가면 팔 수 있는 세트 수가 그만큼 줄어듭니다.`
    : null;
  return { unit, daily: /하루/.test(input.capacity ?? ""), unitPrice: input.unitPrice, monthlyFixedCost: input.monthlyFixedCost, vat, contribution, goods: GOODS_UNIT.test(unit) || !!input.online, breakEven, capacity, goal, budget, setupCost, scenarios, carefulWorst, setupLimit, reviewShortfall, stopMonth, runOut, decision, survival, stopReserve, priceAlternatives, unitNote, words, online: !!input.online };
}

const capacityShort = (result: CashflowScenarios) => !!result.capacity && result.capacity.volume < result.breakEven;
const unitCostOf = (result: CashflowScenarios) => result.unitPrice - result.vat - result.contribution;

function scenarioBasis(result: CashflowScenarios, s: Scenario): string {
  if (s.key === "careful") return "가정: 본전 판매량의 절반";
  if (s.key === "breakeven") return capacityShort(result) ? `처리량 최대치로도 본전(월 ${count(result.breakEven, result.unit)})에 못 미침` : "월 고정비를 겨우 메우는 판매량, 대표 몫 0원";
  return `대표 목표(월 매출 ${won(result.goal!.revenue)})까지 ${result.goal!.months}개월 동안 같은 폭으로 는다고 가정`;
}

/*
 * 한 건에 실제 남는 돈 표의 '확인 필요' 칸 — 금액을 넣지 않는다(요율이 사업마다 달라 지어내면 안 된다).
 * 상품이면 포장·용기와 폐기, 온라인이면 포장·택배, 아니면 그 밖의 건당 비용, 그리고 결제 수수료.
 */
function unknownCostRows(result: CashflowScenarios): Array<{ item: string; note: string }> {
  const notIncluded = `위 한 ${result.unit}당 비용에 들어 있지 않다면`;
  const rows = result.online
    ? [{ item: "포장·택배", note: notIncluded }]
    : result.goods
      ? [{ item: "포장·용기", note: notIncluded }, { item: "팔지 못해 버리는 몫(폐기)", note: "만든 양 가운데 버리는 비율을 재서 반영" }]
      : [{ item: `그 밖에 한 ${result.unit}마다 드는 돈(이동비·소모품 등)`, note: notIncluded }];
  return [...rows, { item: result.online ? "스토어 판매·결제 수수료" : "카드·결제 수수료", note: result.online ? "입점한 스토어의 수수료율 확인" : "가맹한 카드사·결제 서비스의 수수료율 확인" }];
}

const VAT_BASIS = "판매가에 부가세가 들어 있고 일반과세자일 때 판매가의 1/11, 법정 세율 10%";
/* 과세 유형 안내를 다른 장에서 다시 풀지 않게 가리키는 한 줄 — 안내 본문은 돈 장의 표 아래(unitMarginMarkdown) 한 곳에만 */
const VAT_POINTER = "과세 유형(일반·간이·면세)에 따라 부가세가 달라진다는 안내는 돈 숫자를 맡은 장의 계산 표 아래에 한 번 실리므로, 본문에서는 다시 풀어 쓰지 않습니다.";
const VAT_OTHER = "간이과세자는 업종에 따라 매출의 약 1.5~4%를 부가세로 내고, 한 해 매출이 4,800만 원 미만이면 내지 않습니다. 부가세가 면제되는 사업이면 빼지 않습니다. 재료를 살 때 낸 부가세 일부를 돌려받을 수도 있습니다. 어느 쪽인지는 사업자등록 전에 관할 세무서·홈택스에서 확인합니다";

/*
 * 돌려받는 돈과 써서 없어지는 돈(계획서 품질 Q6) — 초기 지출 입력은 한 숫자라 여기서 나누지 않고, 나눠 적는 원칙만 둔다.
 * 보증금은 한도 안에 함께 센다: 계약 기간 동안은 통장에 없는 돈이라 중단선까지 버티는 데 쓸 수 없기 때문이다.
 */
const DEPOSIT_SPLIT = "초기 지출은 보증금처럼 계약이 끝나면 돌려받는 돈과 인테리어·장비·간판·권리금처럼 써서 없어지는 돈을 나눠 적습니다. 보증금도 계약 기간 동안은 통장에 없는 돈이라 초기 지출 한도 안에 함께 셉니다(돌려받는 때는 계약이 끝날 때입니다).";

/** 본전이 '대표 수입 0원'이라는 것과 본전을 넘긴 뒤 대표 몫 — 입력 없이 계산되는 한 줄 */
const ownerShareLine = (result: CashflowScenarios) =>
  `본전은 사업 비용만 메우는 판매량이라, 본전에서 대표님이 가져가는 돈은 0원입니다. 본전을 넘겨 1${result.unit} 더 팔 때마다 약 ${won(result.contribution)}이 대표님 몫으로 남습니다(소득세와 '확인 필요' 칸을 빼기 전).`;

/** 통장 흐름을 바로 읽히는 문장으로 — 표 아래 주석과 다른 장의 참고값에 같이 쓴다 */
function cashflowFindings(result: CashflowScenarios): string[] {
  const lines: string[] = [];
  const careful = result.scenarios[0];
  if (careful.net[0] < 0) lines.push(`조심스러운 경우 매달 ${won(-careful.net[0])}씩, 12개월 동안 사업에서 ${won(-result.carefulWorst)} 모자랍니다.`);
  if (result.stopReserve != null && result.budget != null) lines.push(`중단선: ${result.words.afterOpen} 남은 준비 예산이 ${won(result.stopReserve)}(월 고정비 3개월분)에 닿으면 계속할지 다시 정합니다.`);
  const reserve = result.stopReserve ?? 0;
  const reserveText = result.stopReserve != null ? ` − 중단선 ${won(result.stopReserve)}` : "";
  if (result.setupLimit != null) lines.push(result.reviewShortfall === 0
    ? `초기 지출 한도: 준비 예산 ${won(result.budget!)}${reserveText} = ${won(result.setupLimit)}. 조심스러운 경우에도 매달 모자라지 않아, 한도까지 써도 남은 준비 예산이 중단선 아래로 내려가지 않습니다.`
    : result.setupLimit > 0
      ? `초기 지출 한도: 준비 예산 ${won(result.budget!)}${reserveText} − 조심스러운 경우 ${REVIEW_MONTHS}개월 부족분 ${won(result.reviewShortfall)} = ${won(result.setupLimit)}. 한도까지 쓰면 조심스러운 경우 ${result.words.after} ${result.stopMonth ?? REVIEW_MONTHS}개월째에 중단선에 닿습니다(이 ${REVIEW_MONTHS}개월은 실제 판매로 판단할 기간, 가정).`
      : `준비 예산 ${won(result.budget!)}으로는 중단선${result.stopReserve != null ? `(${won(reserve)})` : ""}과 조심스러운 경우 ${REVIEW_MONTHS}개월 동안 모자라는 돈(${won(result.reviewShortfall)})을 함께 감당하지 못합니다(${won(-result.setupLimit)} 모자람). 초기 지출을 쓰기 전에 이미 판단 기간 ${REVIEW_MONTHS}개월(가정)이 확보되지 않으므로, 고정비·규모를 줄이거나 예산을 다시 봅니다.`);
  if (result.setupCost != null && result.stopReserve != null && result.budget != null) lines.push(result.stopMonth === 0
    ? `초기 지출 ${won(result.setupCost)}을 쓰면 ${result.words.at}부터 남은 준비 예산이 중단선 아래입니다.`
    : result.stopMonth != null
      ? `초기 지출 ${won(result.setupCost)}을 쓰면 조심스러운 경우 ${result.words.after} ${result.stopMonth}개월째에 남은 준비 예산이 중단선에 닿습니다.`
      : `초기 지출 ${won(result.setupCost)}을 써도 조심스러운 경우 12개월 안에 남은 준비 예산이 중단선에 닿지 않습니다.`);
  if (result.unitNote) lines.push(result.unitNote);
  for (const item of result.runOut) lines.push(`${item.label}에는 준비 예산에서 초기 지출을 뺀 돈이 ${item.month}개월차에 바닥납니다.`);
  const goal = result.scenarios.find(s => s.key === "goal");
  const recover = goal ? goal.cumulative.findIndex(value => value >= 0) : -1;
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
/** 관심 조사 결과와 견줄 한 기간 — 하루 판매 사업은 일주일(조사를 일주일 단위로 하므로), 그보다 적으면 한 달 */
const surveyPeriod = (monthly: number, unit: string) => (monthly / 4.3 >= 1 ? `일주일 약 ${count(monthly / 4.3, unit)}` : `한 달 ${count(monthly, unit)}`);
/*
 * 본전에 필요한 단골 수 = 본전 판매량 ÷ 한 사람이 같은 기간에 사는 횟수(가정) — 계획서 품질 Q5(2026-10-28 재측정).
 * '응답 30개로 일주일 본전 100건'처럼 응답 한 사람이 일주일에 몇 번 사야 하는지 따지지 않은 기준은 구조상 채울 수 없었다.
 * 횟수는 입력이 아니므로 세 값(가정)을 나란히 보이고, 어느 값을 쓸지는 조사에서 받은 수량으로 확인한다.
 */
const WEEKLY_PURCHASES = [1, 2, 3] as const, MONTHLY_PURCHASES = [1, 2] as const;
export function regularsNeeded(monthly: number): { period: "week" | "month"; rows: Array<{ times: number; people: number }> } {
  const weekly = monthly / 4.3 >= 1;
  const volume = weekly ? monthly / 4.3 : monthly;
  return { period: weekly ? "week" : "month", rows: (weekly ? WEEKLY_PURCHASES : MONTHLY_PURCHASES).map(times => ({ times, people: Math.ceil(Math.round(volume) / times) })) };
}
const regularsLine = (monthly: number, unit: string) => {
  const { period, rows } = regularsNeeded(monthly);
  const word = period === "week" ? "일주일" : "한 달";
  return `본전(${surveyPeriod(monthly, unit)}) ÷ 한 사람이 ${word}에 사는 횟수(가정) — ${rows.map(row => `${word}에 ${row.times}번이면 약 ${row.people.toLocaleString("ko-KR")}명`).join(", ")}(가정)`;
};
const monthsText = (months: number) => (months >= 12 ? "12개월 이상" : months < 1 ? "1개월도 못 버팀" : `약 ${months}개월`);

/*
 * 판단 기준 — 출시 전과 문 연 뒤 두 번(2026-10-11 유형 시뮬레이션 검토: 출시 전에 판매량 기준을 그대로 쓰면
 * 새로 모은 예약 의사로는 닿을 수 없거나 너무 느슨했다). 출시 전에는 작은 표본의 실제 비율과 '닿아야 하는 사람 수'로 본다.
 * 2026-10-28 검토: 계약 판단 칸이 비고, 관심 조사 결과를 '하루 만들 수 있는 개수(처리량)'와 비교했다 —
 * 관심 조사 결과는 본전 판매량과 같은 기간끼리 비교하고, 할인 원칙과 통과 기준을 '(제안)'으로 둔다. 숫자는 여기서 계산한다.
 */
/*
 * 관심 조사 할인 원칙 — 모든 장이 이 문장 하나를 인용한다(계획서 품질 Q6: 장마다 '절반'·'절반 이하'로 달랐고,
 * 적은 수량 합을 본전과 그대로 비교해 수요를 부풀렸다). 배수는 입력이 아닌 제안이라 '(제안)'으로 둔다.
 */
export const SURVEY_DISCOUNT = "할인 원칙(제안): 예상 구매 = 응답마다 적은 수량 × 배수의 합 — 지인·가족 응답 × 0.5(절반), 날짜·수량 없는 응답 × 0, 그 밖의 응답 × 1.";

function decisionLines(result: CashflowScenarios): string[] {
  const { decision, unit } = result;
  const reach = (rate: number) => {
    const monthly = Math.ceil(decision.go / rate);
    return result.daily ? `하루 약 ${Math.ceil(monthly / 26).toLocaleString("ko-KR")}명` : monthly / 4.3 >= 1 ? `일주일 약 ${Math.ceil(monthly / 4.3).toLocaleString("ko-KR")}명` : `한 달 ${monthly.toLocaleString("ko-KR")}명`;
  };
  return [
    `판단 기준(${chapterRef("summary/roadmap")}에서 씀): ${decision.goLabel}(${periods(result.daily, decision.go, unit)}) 이상이면 계획대로, 그보다 적고 본전의 절반(${periods(result.daily, decision.floor, unit)})보다 많으면 규모(공간·장비·상품 수)를 줄여서, 본전의 절반 이하면 시작안을 바꿉니다. 판단은 계약처럼 큰돈을 쓰기 전(출시 전)에 한 번, ${result.words.afterOpen}에 다시 합니다.`,
    `계약·개업 전 판단(관심 조사 결과를 볼 때): 적은 수량에 할인 원칙을 곱한 '예상 구매'를 처리량(하루에 만들 수 있는 양)이 아니라 본전 판매량과 같은 기간끼리 비교합니다. ${SURVEY_DISCOUNT} 날짜·수량을 남긴 응답 수는 본전에 필요한 단골 수와 비교합니다: ${regularsLine(decision.go, unit)}. 조사 글(질문 문구)에는 언제(날짜·요일) 몇 ${unit} 사겠는지 꼭 묻고, 날짜·수량을 남긴 응답만 셉니다(지인·가족인지도 물음). 통과 기준(제안): 예상 구매가 본전(${surveyPeriod(decision.go, unit)}) 이상이고 날짜·수량을 남긴 응답 수가 위 단골 수(쓴 횟수 가정을 함께 밝힘) 이상이면 계약을 검토하고, 예상 구매가 본전의 절반(${surveyPeriod(decision.floor, unit)}) 이하이면 계약하지 않고 시작안을 바꾸며, 그 사이면 규모를 줄여 다시 조사합니다. 목표 응답 수는 단골 수 이상으로 잡습니다(적으면 다 받아도 못 닿음). 예상 구매도 실제 구매보다 많게 나오므로, 이 기준을 넘어도 ${result.words.afterOpen} 실제 판매로 다시 판단합니다.`,
    `출시 전 판단: 돈을 받고 실제로 팔아 볼 수 있으면(이미 신고된 공간·시범 판매) 실제 판매 수를 위 기준과 같은 기간끼리 비교합니다. 아직 팔 수 없으면 주문 의사만으로 판매량 기준을 채웠다고 보지 않습니다. 예약 의사 수는 수요보다 '얼마나 닿았는지'를 재기 때문에, 작은 표본에서 잰 실제 비율(체험한 사람 중 등록한 비율, 찾아간 곳 중 계약한 비율, 의견을 준 사람 중 날짜·수량까지 남긴 비율)과 경쟁 자료를 함께 봅니다.`,
    `${decision.goLabel}을 채우려면 닿아야 하는 사람 수(잰 비율에 맞춰 고름): 비율 10%면 ${reach(0.1)}, 20%면 ${reach(0.2)}, 30%면 ${reach(0.3)}. 그만큼의 사람에게 닿을 길(지나가는 사람, 단지 세대, 커뮤니티 회원 등)이 있어야 진행합니다.`,
    `${result.words.afterOpen}: 실제 판매 수를 위 기준과 매달 비교하고, 남은 준비 예산이 중단선 아래로 내려가면 계속할지 다시 정합니다. 관심 글의 댓글·공감 수는 판매 수가 아니므로 이 기준과 바로 비교하지 않습니다.`,
  ];
}

const chart = (title: string, values: number[], breakEvenMonth: number | null) =>
  ["```plan-chart", JSON.stringify({ kind: "cumulative", title, points: values.map((value, i) => ({ label: `${i + 1}개월차`, value })), breakEvenMonth, paybackMonth: null }), "```"].join("\n");

/** 한 건에 실제 남는 돈 표 — 법정 부가세만 계산하고 나머지는 '확인 필요' 칸 */
function unitMarginMarkdown(result: CashflowScenarios): string[] {
  const { unit } = result;
  return [
    `### 한 ${unit}에 실제 남는 돈`,
    "",
    `| 항목 | 한 ${unit}당 | 근거 |`,
    "| --- | ---: | --- |",
    `| 판매가 | ${won(result.unitPrice)} | 대표 입력 |`,
    `| 부가세 | -${won(result.vat)} | ${VAT_BASIS}. 과세 유형 확인 필요 |`,
    `| 한 ${unit}당 비용 | -${won(unitCostOf(result))} | 대표 입력 |`,
    ...unknownCostRows(result).map(row => `| ${row.item} | 확인 필요 | ${row.note} |`),
    `| **한 ${unit}에 실제 남는 돈** | **${won(result.contribution)}** | 확인 필요 칸을 빼기 전 값 |`,
    "",
    `- 본전 판매량은 이 ${won(result.contribution)}으로 계산했습니다. '확인 필요' 칸이 채워지면 남는 돈이 줄고 본전 판매량은 늘어나므로, 아래 숫자는 낙관적인 쪽입니다.`,
    `- ${VAT_OTHER}.`,
    `- ${ownerShareLine(result)}`,
  ];
}

/** 돈 장에 붙는 표·그래프(시스템이 본문 끝에 붙인다). 숫자는 모두 이 파일에서 계산한다 */
export function cashflowMarkdown(result: CashflowScenarios): string {
  const { unit } = result;
  const opening = result.budget != null && result.setupCost != null ? result.budget - result.setupCost : null;
  const headLabel = opening != null ? "통장 잔고" : "통장 누적";
  const rows = Array.from({ length: 12 }, (_, i) => `| ${i + 1}개월차 | ${result.scenarios.map(s => won((opening ?? 0) + s.cumulative[i])).join(" | ")} |`);
  const goal = result.scenarios.find(s => s.key === "goal");
  return [
    ...unitMarginMarkdown(result),
    "",
    `### ${kinds(result)} 경우로 본 한 달`,
    "",
    `한 ${unit}에 실제 남는 돈 ${won(result.contribution)}으로 매달 나가는 ${won(result.monthlyFixedCost)}을 메우는 본전 판매량은 월 ${count(result.breakEven, unit)}${perDay(result.daily, result.breakEven, unit, text => `, ${text}(월 26일 ${result.words.day} 기준)`)}입니다.`,
    "",
    "| 경우 | 한 달 판매 | 들어오는 돈(매출) | 나가는 돈(부가세 포함) | 남거나 모자라는 돈 | 근거 |",
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
    result.budget != null ? `- ${DEPOSIT_SPLIT}` : undefined,
    `- ${opening != null ? `통장 잔고는 준비 예산 ${won(result.budget!)}에서 초기 지출 ${won(result.setupCost!)}을 뺀 ${won(opening)}에서 시작합니다.` : "통장 누적은 사업에서 들어오고 나간 돈만 더한 값입니다. 초기 지출은 빠져 있습니다."} 대표님 개인 생활비와 소득세는 이 계산에 넣지 않았습니다.`,
    result.capacity ? `- 처리량 최대치: ${dayWord(result, result.capacity.note)}. 어느 경우도 이보다 많이 팔지 않는다고 계산했습니다.` : undefined,
    ...(result.survival.length ? [
      "",
      "### 매출이 없어도 버티는 기간",
      "",
      `준비 예산 ${won(result.budget!)}에서 초기 지출을 뺀 돈으로 월 고정비 ${won(result.monthlyFixedCost)}을 몇 달 낼 수 있는지입니다(매출이 하나도 없다고 볼 때).${result.setupCost == null ? " 초기 지출 견적을 받으면 이 표로 판단합니다." : ""}`,
      "",
      "| 초기 지출 | 남는 준비 예산 | 버티는 기간 |",
      "| ---: | ---: | --- |",
      ...result.survival.map(row => `| ${won(row.spend)} | ${won(result.budget! - row.spend)} | ${monthsText(row.months)} |`),
    ] : []),
    "",
    // 그래프는 하나만(2026-10-10 빵집 시험: 표 3개·그래프 2개로 재무 장이 길다는 채점) — 목표 경우가 있으면 모자랐다가 메워지는 모습을 보인다
    goal
      ? chart(`목표 경우 ${headLabel}`, goal.cumulative.map(value => (opening ?? 0) + value), (() => { const i = goal.cumulative.findIndex(value => value >= 0); return i >= 0 ? i + 1 : null; })())
      : chart(`조심스러운 경우 ${headLabel}`, result.scenarios[0].cumulative.map(value => (opening ?? 0) + value), null),
  ].filter((line): line is string => line !== undefined).join("\n");
}

/**
 * 다른 장과 AI 문서 원천에 넘기는 참고 문장 — 표 없이 결론 숫자만.
 * '판매가 … / 변동비 …'·'손익분기: 월 …' 줄은 예전 손익 참고(financialsToReference)와 같은 머리말을 쓴다 — 다른 기능이 같은 문구를 찾는다.
 */
export function cashflowReference(result: CashflowScenarios, options: { basis?: string } = {}): string {
  const unknown = unknownCostRows(result).map(row => row.item).join("·");
  return [
    `계획 시나리오 계산(실적 아님). ${options.basis ? `${options.basis}으로 ` : ""}판매량을 하나로 정하지 않고 ${kinds(result)} 경우로 계산했습니다(처리량 최대치를 넘지 않음).`,
    `- 판매가 ${won(result.unitPrice)} / 변동비(한 ${result.unit}당 비용) ${won(unitCostOf(result))} / 부가세 ${won(result.vat)}(${VAT_BASIS}, 과세 유형 확인 필요) / 한 ${result.unit}에 실제 남는 돈 ${won(result.contribution)}`,
    `- 손익분기: 월 ${count(result.breakEven, result.unit)} (매출 ${won(result.breakEven * result.unitPrice)}) — 본전은 사업 비용(월 고정비)만 메우는 판매량 하나로 씁니다. 대표 생활비를 더한 판매량은 쓰지 않습니다.`,
    // 과세 유형 안내(VAT_OTHER)는 돈 장의 표 아래에만 싣는다 — 이 참고 문장은 모든 장에 들어가 같은 안내가 두 장에 거의 그대로 나왔다(계획서 품질 Q5)
    `- 한 ${result.unit}에 실제 남는 돈에서 ${unknown}는 아직 빼지 않았습니다(확인 필요). 그래서 본전 판매량은 낙관적인 쪽이고, 이 값을 지어서 채우지 않습니다. ${VAT_POINTER}`,
    `- ${ownerShareLine(result)}`,
    // 하루 환산(월 26일 영업 — 처리량 환산과 같은 가정): 실행 장이 '하루 몇 개면 바꾼다' 같은 판단 기준을 숫자를 지어내지 않고 세우게 한다
    perDay(result.daily, result.breakEven, result.unit, text => `- 하루 환산(월 26일 ${result.words.day} 가정): 본전 ${text}`),
    ...result.scenarios.map(s => `- ${s.label}(${scenarioBasis(result, s)}): 월 ${count(s.volumes.at(-1)!, result.unit)}${perDay(result.daily, s.volumes.at(-1)!, result.unit, text => `(${text})`)}${s.volumes[0] !== s.volumes.at(-1) ? `, 첫 달 월 ${count(s.volumes[0], result.unit)}${perDay(result.daily, s.volumes[0], result.unit, text => `(${text})`)}` : ""}, 한 달에 ${won(s.net.at(-1)!)}, 12개월 누적 ${won(s.cumulative.at(-1)!)}`),
    ...cashflowFindings(result).map(line => `- ${line}`),
    ...decisionLines(result).map(line => `- ${line}`),
    result.survival.length ? `- 매출이 없어도 버티는 기간((준비 예산 − 초기 지출) ÷ 월 고정비): ${result.survival.map(row => `초기 지출 ${won(row.spend)}이면 ${monthsText(row.months)}`).join(", ")}` : "",
    goalLine(result),
    result.priceAlternatives.length ? `- 가격을 바꾸면(${won(Math.abs(result.priceAlternatives[0].price - result.unitPrice))}씩, 한 건당 비용은 같다고 가정, 부가세는 가격마다 다시 뺌, ${chapterRef("strategy/price")}에서 씀): ${result.priceAlternatives.map(alt => `${won(alt.price)} → 본전 ${periods(result.daily, alt.breakEven, result.unit)}`).join(" / ")}` : "",
    "- 초기 지출(입력이 없으면), 대표님 개인 생활비, 소득세는 이 계산에 빠져 있습니다.",
  ].filter(Boolean).join("\n");
}

/*
 * 월 고정비를 아직 모를 때 — 본전 판매량을 세 가지 고정비 가정으로 보여 준다(가정 표시, 계획서 품질 Q3).
 * 판매가·한 건당 비용만 알면 계산되며, 이 세 금액은 사실이 아니라 '이만큼이면'이라는 가정이다. 실제 견적이 나오면 그 값으로 바꾼다.
 */
export const ASSUMED_FIXED_COSTS = [500_000, 1_500_000, 3_000_000] as const;
export type FixedCostAssumptions = { unit: string; daily: boolean; unitPrice: number; vat: number; contribution: number; rows: Array<{ fixed: number; breakEven: number }> };

export function fixedCostAssumptionsFromFields(fields: Array<{ key: string; value: string }>): FixedCostAssumptions | null {
  const get = (key: string) => fields.find(field => field.key === key)?.value;
  const price = coachAmount(get("price")), unitCost = coachAmount(get("unitCost"));
  if (price == null || unitCost == null || coachAmount(get("cost")) != null || !(price > 0)) return null;
  const contribution = realUnitMargin(price, unitCost);
  if (contribution <= 0) return null;
  const capacity = monthlyVolumeFromCapacity(get("capacity"));
  return { unit: capacity?.unit || "건", daily: /하루/.test(get("capacity") ?? ""), unitPrice: price, vat: vatInPrice(price), contribution, rows: ASSUMED_FIXED_COSTS.map(fixed => ({ fixed, breakEven: Math.ceil(fixed / contribution) })) };
}

export function fixedCostAssumptionReference(result: FixedCostAssumptions): string {
  return [
    `월 고정비를 아직 몰라 본전 판매량을 세 가지 고정비 가정으로 계산했습니다(가정 — 실제 월세·관리비·고정 인건비를 알면 그 값으로 바꿉니다). 한 건에 실제 남는 돈은 판매가 ${won(result.unitPrice)}에서 부가세 ${won(result.vat)}(${VAT_BASIS}, 과세 유형 확인 필요)와 한 건당 비용을 뺀 ${won(result.contribution)}입니다.`,
    ...result.rows.map(row => `- 월 고정비 ${won(row.fixed)}(가정)이면 본전 ${periods(result.daily, row.breakEven, result.unit)}`),
    "- 이 세 금액은 가정이므로 본문에서 실제 고정비처럼 쓰지 않고, 고정비 견적을 받는 일을 확인할 일로 둡니다.",
  ].join("\n");
}

export function fixedCostAssumptionMarkdown(result: FixedCostAssumptions): string {
  return [
    "### 월 고정비를 모를 때 본전 판매량(가정)",
    "",
    `한 ${result.unit}에 실제 남는 돈 ${won(result.contribution)}(판매가 ${won(result.unitPrice)} − 부가세 ${won(result.vat)} − 한 ${result.unit}당 비용, 포장·수수료 등은 확인 필요)으로 계산했습니다. 고정비 세 금액은 가정입니다.`,
    "",
    "| 월 고정비(가정) | 본전 판매량 |",
    "| ---: | --- |",
    ...result.rows.map(row => `| ${won(row.fixed)} | ${periods(result.daily, row.breakEven, result.unit)} |`),
    "",
    "- 실제 월세·관리비·고정 인건비 견적을 받으면 이 표 대신 세 가지 경우의 통장 흐름이 계산됩니다.",
  ].join("\n");
}

/** 대화에서 모은 값(가격·변동비·고정비 + 처리량·목표·예산·초기 지출)으로 세 경우를 만든다. 저장된 대표 생활비(livingCost)는 쓰지 않는다 */
export function cashflowFromFields(fields: Array<{ key: string; value: string }>, money: { unitPrice: number; unitVariableCost: number; monthlyFixedCost: number; online?: boolean }): CashflowScenarios | null {
  const get = (key: string) => fields.find(field => field.key === key)?.value;
  return buildCashflowScenarios({ ...money, capacity: get("capacity"), goal: get("goal"), budget: get("budget"), setupCost: get("setupCost"), offer: get("offer"), online: money.online });
}
