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
  const amount = /^0(?:\.0+)?(?:억원?|천만원?|백만원?|만원?|천원?|백원?|원)?$/.test(normalized) ? 0 : parseAmount(normalized);
  return amount != null && Number.isSafeInteger(amount) && amount >= 0 ? amount : undefined;
}

const CAPACITY_MONTH_FACTOR: Record<string, number> = { "하루": 26, "일주일": 4.3, "한 달": 1 };
/** 처리량 답변("대표자 혼자 / 하루 20건")을 월 판매량으로 환산한다. 하루는 월 26일 영업, 일주일은 4.3주 가정이며 기간이 없으면 환산하지 않는다. */
export function monthlyVolumeFromCapacity(text: string | null | undefined): { volume: number; unit: string; note: string } | null {
  const match = text?.match(/(하루|일주일|한 달)\s*([\d,]+)\s*([가-힣·]*)/);
  if (!match) return null;
  const count = Number(match[2].replace(/,/g, ""));
  if (!Number.isFinite(count) || count < 0) return null;
  const factor = CAPACITY_MONTH_FACTOR[match[1]], unit = match[3] || "건", volume = Math.round(count * factor);
  const shown = (n: number) => n.toLocaleString("ko-KR");
  return { volume, unit, note: factor === 1 ? `월 ${shown(count)}${unit} 감당 기준` : `${match[1]} ${shown(count)}${unit} × ${factor === 26 ? "월 26일 영업" : "월 4.3주"} = 월 ${shown(volume)}${unit}` };
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
  const budget = money("budget"), setup = money("setupCost"), price = money("price"), unit = money("unitCost"), fixed = money("cost");
  const volume = quantity("volume", /^(\d+(?:\.\d+)?)$/);
  const hours = quantity("hoursPerWeek", /^(?:주)?(\d+(?:\.\d+)?)(?:시간)?$/);
  const minutes = quantity("minutesPerSale", /^(?:건당)?(\d+(?:\.\d+)?)(?:분)?$/);
  const budgetCheck: FeasibilityCheck = {
    code: "startup-budget", inputs: inputs("budget", "setupCost"), status: "unknown",
    detail: "초기 지출과 예산이 함께 정해지면 비교합니다. 미입력 비용을 0원으로 보지 않습니다.",
  };
  if (budget != null && setup == null && fixed != null && fixed > 0) {
    // 초기 지출을 묻지 않는 흐름에서도 예산이 쓰이도록: 매출이 늦게 붙는 동안 월 고정비를 몇 달 버틸 수 있는지 본다.
    const reserve = fixed * 3, months = budget / fixed;
    budgetCheck.inputs = inputs("budget", "cost");
    budgetCheck.status = budget < reserve ? "attention" : "within-inputs";
    budgetCheck.detail = budget < reserve
      ? `준비 예산은 월 고정비 약 ${format(months)}개월분입니다. 매출이 자리 잡기 전 3개월분(${format(reserve)}원)에 못 미치므로, 고정비를 줄이거나 시작 규모를 작게 잡는 안이 필요합니다. 초기 지출은 따로 확인해야 합니다.`
      : `준비 예산은 월 고정비 약 ${format(months)}개월분으로, 3개월분(${format(reserve)}원) 이상입니다. 초기 지출(장비·인테리어 등)은 이 비교에 들어 있지 않습니다.`;
  } else if (budget != null && setup != null) {
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
  } else if (volume == null && minutes == null && hours != null && hours > 0) {
    // 건당 작업시간을 묻지 않는 흐름: 처리량(월 환산)과 주당 가능 시간으로 1건에 쓸 수 있는 평균 시간을 보여 준다(판단이 아니라 기준값).
    const capacity = monthlyVolumeFromCapacity(map.get("capacity")?.value);
    if (capacity && capacity.volume > 0) {
      const perSale = hours * 52 / 12 * 60 / capacity.volume;
      workloadCheck.inputs = inputs("hoursPerWeek", "capacity");
      workloadCheck.detail = `주 ${format(hours)}시간으로 처리량 월 ${format(capacity.volume)}${capacity.unit}을 모두 소화하려면 1${capacity.unit}당 평균 ${format(perSale)}분 안에 끝내야 합니다(준비·영업·관리 시간 포함 전). 실제 건당 작업시간이 이보다 길면 처리량이나 가능 시간을 다시 잡아야 합니다.`;
    }
  } else if (volume != null && hours != null && minutes != null && Number.isSafeInteger(volume * minutes)) {
    const required = volume * minutes / 60, available = hours * 52 / 12;
    workloadCheck.status = required > available ? "attention" : "within-inputs";
    workloadCheck.detail = `월 작업시간 ${format(required)}시간 / 월평균 가능 시간 ${format(available)}시간(주당 시간 × 52 ÷ 12 가정). ${required > available ? "작업시간이 초과하므로 수량이나 제공 범위를 줄이는 안이 필요합니다." : "계산상 범위 이내입니다. 영업·관리·휴무 시간이 별도라면 추가 반영해야 합니다."}`;
  }
  return [budgetCheck, marginCheck, workloadCheck];
}
