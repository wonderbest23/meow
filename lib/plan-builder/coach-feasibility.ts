import type { CoachField } from "./coach";
import { parseAmount } from "./financials";

export type FeasibilityCheck = {
  code: "startup-budget" | "unit-margin" | "workload";
  status: "unknown" | "attention" | "within-inputs";
  detail: string;
  inputs: CoachField[];
};

export function coachAmount(value: string | undefined): number | undefined {
  const normalized = value?.replace(/\s/g, "") ?? "";
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?(?:억원?|천만원?|백만원?|만원?|천원?|백원?|원)?$/.test(normalized)) return undefined;
  const amount = /^0(?:원)?$/.test(normalized) ? 0 : parseAmount(normalized);
  return amount != null && Number.isSafeInteger(amount) && amount >= 0 ? amount : undefined;
}

/** These are arithmetic checks on supplied/proposed inputs, not a business viability score. */
export function checkCoachFeasibility(fields: CoachField[]): FeasibilityCheck[] {
  const map = new Map(fields.map(f => [f.key, f]));
  const money = (key: CoachField["key"]) => coachAmount(map.get(key)?.value);
  const inputs = (...keys: CoachField["key"][]) => keys.flatMap(key => map.has(key) ? [map.get(key)!] : []);
  const format = (n: number) => new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 }).format(n);
  const quantity = (key: CoachField["key"], pattern: RegExp) => {
    const match = map.get(key)?.value.replace(/\s|,/g, "").match(pattern);
    const value = match ? Number(match[1]) : NaN;
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  const budget = money("budget"), setup = money("setupCost"), price = money("price"), unit = money("unitCost");
  const volume = quantity("volume", /^(\d+(?:\.\d+)?)$/);
  const hours = quantity("hoursPerWeek", /^(?:주)?(\d+(?:\.\d+)?)(?:시간)?$/);
  const minutes = quantity("minutesPerSale", /^(?:건당)?(\d+(?:\.\d+)?)(?:분)?$/);
  const budgetCheck: FeasibilityCheck = {
    code: "startup-budget", inputs: inputs("budget", "setupCost"), status: "unknown",
    detail: "초기 지출과 예산이 함께 정해지면 비교합니다. 미입력 비용을 0원으로 보지 않습니다.",
  };
  if (budget != null && setup != null) {
    budgetCheck.status = setup > budget ? "attention" : "within-inputs";
    budgetCheck.detail = setup > budget ? `입력한 초기 지출이 예산보다 ${format(setup - budget)}원 많습니다. 시작 범위를 줄이거나 추가 자금 조건을 따로 정해야 합니다.` : "입력한 초기 지출은 예산 이내입니다. 이후 운영비까지 확보됐다는 뜻은 아닙니다.";
  }
  const marginCheck: FeasibilityCheck = {
    code: "unit-margin", inputs: inputs("price", "unitCost"), status: "unknown",
    detail: "같은 상품의 판매가와 건당 변동비가 정해지면 비교합니다. 세금·월 고정비는 별도입니다.",
  };
  if (price != null && unit != null) {
    marginCheck.status = price <= unit ? "attention" : "within-inputs";
    marginCheck.detail = `입력값 기준 건당 판매가에서 변동비를 뺀 금액은 ${format(price - unit)}원입니다. ${price <= unit ? "월 고정비를 충당할 금액이 남지 않아 가격·제공 범위를 조정할 필요가 있습니다." : "월 고정비·세금 차감 전이며 실제 이익을 보장하지 않습니다."}`;
  }
  const workloadCheck: FeasibilityCheck = {
    code: "workload", inputs: inputs("volume", "hoursPerWeek", "minutesPerSale"), status: "unknown",
    detail: "주당 가능 시간·건당 작업시간·월 판매량이 함께 정해지면 비교합니다. 숫자가 없으면 가능하다고 단정하지 않습니다.",
  };
  if (hours != null && hours > 168) {
    workloadCheck.status = "attention";
    workloadCheck.detail = "주당 가능 시간이 일주일 전체 시간인 168시간을 넘습니다. 시간의 단위를 확인해야 하며 이 값으로 작업 가능량을 판단하지 않습니다.";
  } else if (volume != null && hours != null && minutes != null && Number.isSafeInteger(volume * minutes)) {
    const required = volume * minutes / 60, available = hours * 52 / 12;
    workloadCheck.status = required > available ? "attention" : "within-inputs";
    workloadCheck.detail = `월 작업시간 ${format(required)}시간 / 월평균 가능 시간 ${format(available)}시간(주당 시간 × 52 ÷ 12 가정). ${required > available ? "작업시간이 초과하므로 수량이나 제공 범위를 줄이는 안이 필요합니다." : "계산상 범위 이내입니다. 영업·관리·휴무 시간이 별도라면 추가 반영해야 합니다."}`;
  }
  return [budgetCheck, marginCheck, workloadCheck];
}
