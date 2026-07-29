// 재무 자동 계산 — 사용자가 입력한 숫자로 단위경제·손익분기·12개월 손익표를 계산한다.
// 추정이 아니라 산식으로만 계산하며, 입력이 없으면 계산하지 않고 '추가 정의 필요'로 남긴다.

export interface FinancialInputs {
  /** 1건(1인) 평균 판매 금액 */
  unitPrice?: number;
  /** 1건당 변동비 (재료·수수료·파트너 지급 등) */
  unitVariableCost?: number;
  /** 월 고정비 합계 (임대료·인건비·통신 등) */
  monthlyFixedCost?: number;
  /** 첫 달 예상 판매 건수 */
  startingVolume?: number;
  /** 월 성장률(%) — 없으면 0 */
  monthlyGrowthPct?: number;
  /** 초기 투자(시설·장비 등) */
  initialInvestment?: number;
}

export interface UnitEconomics {
  unitPrice: number;
  unitVariableCost: number;
  /** 건당 공헌이익 */
  contributionMargin: number;
  /** 공헌이익률(%) */
  contributionMarginPct: number;
}

export interface BreakEven {
  /** 손익분기 월 판매 건수 */
  units: number;
  /** 손익분기 월 매출 */
  revenue: number;
}

export interface MonthlyRow {
  month: number;
  volume: number;
  revenue: number;
  variableCost: number;
  contribution: number;
  fixedCost: number;
  operatingProfit: number;
  /** 누적 영업손익 */
  cumulative: number;
}

export interface FinancialResult {
  unit: UnitEconomics | null;
  breakEven: BreakEven | null;
  monthly: MonthlyRow[];
  /** 12개월 합계 */
  yearTotal: { revenue: number; variableCost: number; contribution: number; fixedCost: number; operatingProfit: number } | null;
  /** 누적 손익이 처음 0을 넘는 월 (없으면 null) */
  breakEvenMonth: number | null;
  /** 초기 투자 회수 월 (없으면 null) */
  paybackMonth: number | null;
}

/** 숫자만 있는 문자열 → 값 (없으면 0) */
function plainNumber(s: string): number {
  const digits = s.replace(/[^\d.]/g, "");
  if (!digits) return 0;
  const n = parseFloat(digits);
  return Number.isFinite(n) ? n : 0;
}

/** 천·백 단위까지 포함한 부분 파싱. "3천"=3000, "5백"=500, "1500"=1500 */
function parseSubUnit(s: string): number {
  if (!s.trim()) return 0;
  let total = 0;
  let rest = s;
  const cheon = rest.match(/^(.*?)천/);
  if (cheon) {
    total += (plainNumber(cheon[1]) || 1) * 1_000;
    rest = rest.slice(cheon[0].length);
  }
  const baek = rest.match(/^(.*?)백/);
  if (baek) {
    total += (plainNumber(baek[1]) || 1) * 100;
    rest = rest.slice(baek[0].length);
  }
  return total + plainNumber(rest);
}

/**
 * 금액 파싱. 복합 한글 단위를 지원한다.
 * "49,000원"→49000, "150만원"→1500000, "3천만원"→30000000, "1억5천만"→150000000
 */
export function parseAmount(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw > 0 ? raw : undefined;
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (!s) return undefined;

  // 한글 단위가 없으면 숫자만 추출
  if (!/[억만천백]/.test(s)) {
    const n = plainNumber(s);
    return n > 0 ? Math.round(n) : undefined;
  }

  let total = 0;
  let rest = s;

  const eok = rest.match(/^(.*?)억/);
  if (eok) {
    total += (parseSubUnit(eok[1]) || 1) * 100_000_000;
    rest = rest.slice(eok[0].length);
  }
  const man = rest.match(/^(.*?)만/);
  if (man) {
    total += (parseSubUnit(man[1]) || 1) * 10_000;
    rest = rest.slice(man[0].length);
  }
  total += parseSubUnit(rest);

  return total > 0 ? Math.round(total) : undefined;
}

/** 퍼센트 입력 파싱 ("10%", "10") */
export function parsePercent(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return undefined;
  const digits = raw.replace(/[^\d.-]/g, "");
  if (!digits) return undefined;
  const n = parseFloat(digits);
  return Number.isFinite(n) ? n : undefined;
}

export function calculateFinancials(input: FinancialInputs): FinancialResult {
  const { unitPrice, unitVariableCost, monthlyFixedCost, startingVolume, monthlyGrowthPct, initialInvestment } = input;

  // 단위경제: 판매가와 변동비가 모두 있어야 계산
  let unit: UnitEconomics | null = null;
  if (unitPrice != null && unitVariableCost != null && unitPrice > 0) {
    const cm = unitPrice - unitVariableCost;
    unit = {
      unitPrice,
      unitVariableCost,
      contributionMargin: cm,
      contributionMarginPct: Math.round((cm / unitPrice) * 1000) / 10,
    };
  }

  // 손익분기: 공헌이익이 양수이고 고정비가 있어야 계산
  let breakEven: BreakEven | null = null;
  if (unit && unit.contributionMargin > 0 && monthlyFixedCost != null && monthlyFixedCost > 0) {
    const units = Math.ceil(monthlyFixedCost / unit.contributionMargin);
    breakEven = { units, revenue: units * unit.unitPrice };
  }

  // 12개월 손익: 단위경제 + 첫 달 물량이 있어야 계산
  const monthly: MonthlyRow[] = [];
  let breakEvenMonth: number | null = null;
  let paybackMonth: number | null = null;
  if (unit && startingVolume != null && startingVolume > 0) {
    const growth = (monthlyGrowthPct ?? 0) / 100;
    const fixed = monthlyFixedCost ?? 0;
    let cumulative = 0;
    for (let m = 1; m <= 12; m += 1) {
      const volume = Math.round(startingVolume * Math.pow(1 + growth, m - 1));
      const revenue = volume * unit.unitPrice;
      const variableCost = volume * unit.unitVariableCost;
      const contribution = revenue - variableCost;
      const operatingProfit = contribution - fixed;
      cumulative += operatingProfit;
      monthly.push({ month: m, volume, revenue, variableCost, contribution, fixedCost: fixed, operatingProfit, cumulative });
      if (breakEvenMonth === null && operatingProfit > 0) breakEvenMonth = m;
      if (paybackMonth === null && initialInvestment != null && initialInvestment > 0 && cumulative >= initialInvestment) {
        paybackMonth = m;
      }
    }
  }

  const yearTotal = monthly.length
    ? monthly.reduce(
        (acc, r) => ({
          revenue: acc.revenue + r.revenue,
          variableCost: acc.variableCost + r.variableCost,
          contribution: acc.contribution + r.contribution,
          fixedCost: acc.fixedCost + r.fixedCost,
          operatingProfit: acc.operatingProfit + r.operatingProfit,
        }),
        { revenue: 0, variableCost: 0, contribution: 0, fixedCost: 0, operatingProfit: 0 },
      )
    : null;

  return { unit, breakEven, monthly, yearTotal, breakEvenMonth, paybackMonth };
}

/** 성장 양상 선택지 → 월 성장률 가정(%) */
const GROWTH_MAP: Record<string, number> = {
  "천천히 안정 성장": 5,
  "초기 느리다 후반 가속": 12,
  "계절 영향 큼": 6,
  "예측 어려움": 0,
};

/**
 * 사용자가 검토 화면에서 고친 값을 담는 가상 섹션 키.
 * 실제 질문 섹션이 아니라 보정값 저장 전용이므로 진행률·문서에는 포함되지 않는다.
 */
export const FINANCIAL_OVERRIDE_KEY = "financials/__review";

/** 검토 화면에 노출할 입력 항목 정의 — 원문 답변이 어디서 왔는지 함께 알려준다. */
export const FINANCIAL_FIELDS = [
  { id: "unitPrice", label: "1건당 판매가", from: "financials/revenue", qid: "unit_price", unit: "원", kind: "money" },
  { id: "startingVolume", label: "첫 달 판매 건수", from: "financials/revenue", qid: "monthly_volume", unit: "건", kind: "count" },
  { id: "unitVariableCost", label: "1건당 변동비", from: "financials/expenses", qid: "variable_per_unit", unit: "원", kind: "money" },
  { id: "fixedBase", label: "월 고정비(인건비 제외)", from: "financials/expenses", qid: "fixed_total", unit: "원", kind: "money" },
  { id: "staffMonthly", label: "월 인건비", from: "financials/staffing", qid: "staff_monthly", unit: "원", kind: "money" },
  { id: "initialInvestment", label: "초기 투자", from: "financials/assets", qid: "asset_cost", unit: "원", kind: "money" },
] as const;

export type FinancialFieldId = (typeof FINANCIAL_FIELDS)[number]["id"];

export interface FinancialField {
  id: FinancialFieldId;
  label: string;
  unit: string;
  /** 사용자가 원래 적은 문장 */
  raw: string | null;
  /** 파싱 또는 보정으로 확정된 값 */
  value: number | undefined;
  /** 사용자가 검토 화면에서 직접 고친 값인지 */
  overridden: boolean;
  /** 값이 의심스러울 때의 안내 (단위 착오 등) */
  warning: string | null;
}

/** 금액이 상식적인 범위를 벗어나면 단위 착오일 가능성이 높다. */
function warnFor(kind: string, value: number | undefined, raw: string | null): string | null {
  if (value == null) return null;
  if (kind === "money") {
    if (value < 1_000) return "1,000원 미만입니다. '만원'·'천원' 단위를 빠뜨리지 않았는지 확인해주세요.";
    if (value > 100_000_000_000) return "1,000억을 넘습니다. 자릿수를 확인해주세요.";
  }
  if (kind === "count" && value > 1_000_000) return "월 100만 건을 넘습니다. 자릿수를 확인해주세요.";
  if (raw && /[억만천백]/.test(raw) && value < 1_000) {
    return "한글 단위를 인식하지 못했을 수 있습니다. 숫자로 직접 입력해주세요.";
  }
  return null;
}

/**
 * 각 재무 입력이 어떻게 인식됐는지 항목별로 정리한다.
 * 검토 화면은 이 결과를 그대로 표시하고, 사용자가 고치면 보정값으로 저장한다.
 */
export function describeFinancialFields(allAnswers: Record<string, Record<string, unknown>>): FinancialField[] {
  const overrides = allAnswers?.[FINANCIAL_OVERRIDE_KEY] ?? {};
  return FINANCIAL_FIELDS.map((f) => {
    const rawVal = allAnswers?.[f.from]?.[f.qid];
    const raw = typeof rawVal === "string" && rawVal.trim() ? rawVal.trim() : null;
    const ov = parseAmount(overrides[f.id]);
    const value = ov ?? parseAmount(rawVal);
    return {
      id: f.id,
      label: f.label,
      unit: f.unit,
      raw,
      value,
      overridden: ov != null,
      warning: ov != null ? null : warnFor(f.kind, value, raw),
    };
  });
}

/**
 * 재무 입력은 여러 섹션(매출·인건비·비용·자산)에 흩어져 있으므로
 * 플랜 전체 답변에서 모아 계산 입력으로 만든다.
 * 검토 화면에서 사용자가 고친 값(보정값)이 있으면 원문 파싱값보다 우선한다.
 */
export function collectFinancialInputs(
  allAnswers: Record<string, Record<string, unknown>>,
): { inputs: FinancialInputs; growthLabel: string | null; staffIncluded: boolean } {
  const get = (sectionKey: string, qid: string) => allAnswers?.[sectionKey]?.[qid];
  const overrides = allAnswers?.[FINANCIAL_OVERRIDE_KEY] ?? {};
  /** 보정값이 있으면 그 값을, 없으면 원문 파싱값을 쓴다. */
  const pick = (id: FinancialFieldId, parsed: number | undefined) => parseAmount(overrides[id]) ?? parsed;

  const unitPrice = pick("unitPrice", parseAmount(get("financials/revenue", "unit_price")));
  const unitVariableCost = pick("unitVariableCost", parseAmount(get("financials/expenses", "variable_per_unit")));
  const fixedBase = pick("fixedBase", parseAmount(get("financials/expenses", "fixed_total")));
  const staff = pick("staffMonthly", parseAmount(get("financials/staffing", "staff_monthly")));
  const startingVolume = pick("startingVolume", parseAmount(get("financials/revenue", "monthly_volume")));
  const initialInvestment = pick("initialInvestment", parseAmount(get("financials/assets", "asset_cost")));

  const growthRaw = get("financials/revenue", "growth");
  const growthLabel = typeof growthRaw === "string" ? growthRaw : null;
  const growthOverride = parsePercent(overrides.monthlyGrowthPct);
  const monthlyGrowthPct = growthOverride ?? (growthLabel ? GROWTH_MAP[growthLabel] ?? 0 : 0);

  // 고정비 항목에 인건비가 없으므로 인건비는 별도로 더한다.
  const monthlyFixedCost =
    fixedBase != null || staff != null ? (fixedBase ?? 0) + (staff ?? 0) : undefined;

  return {
    inputs: { unitPrice, unitVariableCost, monthlyFixedCost, startingVolume, monthlyGrowthPct, initialInvestment },
    growthLabel,
    staffIncluded: staff != null,
  };
}

/** 성장 양상 선택지에 대응하는 기본 월 성장률(%) — 검토 화면에서 기본값 표시용 */
export function defaultGrowthPct(label: string | null): number {
  return label ? GROWTH_MAP[label] ?? 0 : 0;
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 계산 결과를 마크다운 표로 — AI 생성 본문에 주입한다. */
export function financialsToMarkdown(
  r: FinancialResult,
  opts?: { growthLabel?: string | null; growthPct?: number; staffIncluded?: boolean },
): string {
  const parts: string[] = [];

  if (r.unit) {
    parts.push("### 건당 단위경제");
    parts.push(
      [
        "| 항목 | 금액 |",
        "| --- | ---: |",
        `| 판매가 | ${won(r.unit.unitPrice)} |`,
        `| 변동비 | ${won(r.unit.unitVariableCost)} |`,
        `| **건당 공헌이익** | **${won(r.unit.contributionMargin)}** |`,
        `| 공헌이익률 | ${r.unit.contributionMarginPct}% |`,
      ].join("\n"),
    );
  }

  if (r.breakEven) {
    parts.push("### 손익분기점");
    parts.push(
      `월 고정비를 공헌이익으로 나누면 **월 ${r.breakEven.units.toLocaleString("ko-KR")}건**(매출 ${won(r.breakEven.revenue)})부터 이익이 발생합니다.`,
    );
  }

  if (r.monthly.length) {
    parts.push("### 12개월 손익 추정");
    const head = ["| 월 | 판매 | 매출 | 변동비 | 공헌이익 | 고정비 | 영업손익 | 누적 |", "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"];
    const rows = r.monthly.map(
      (m) =>
        `| ${m.month}월 | ${m.volume.toLocaleString("ko-KR")} | ${won(m.revenue)} | ${won(m.variableCost)} | ${won(m.contribution)} | ${won(m.fixedCost)} | ${won(m.operatingProfit)} | ${won(m.cumulative)} |`,
    );
    if (r.yearTotal) {
      rows.push(
        `| **합계** | | **${won(r.yearTotal.revenue)}** | ${won(r.yearTotal.variableCost)} | ${won(r.yearTotal.contribution)} | ${won(r.yearTotal.fixedCost)} | **${won(r.yearTotal.operatingProfit)}** | |`,
      );
    }
    parts.push([...head, ...rows].join("\n"));

    const notes: string[] = [];
    if (r.breakEvenMonth) notes.push(`- 월 단위 흑자 전환: **${r.breakEvenMonth}개월차**`);
    if (r.paybackMonth) notes.push(`- 초기 투자 회수: **${r.paybackMonth}개월차**`);
    else if (r.monthly.length && r.yearTotal && r.yearTotal.operatingProfit < 0) {
      notes.push("- 12개월 내 누적 흑자에 도달하지 못합니다. 판매량·가격·고정비 중 하나를 조정해 검토해야 합니다.");
    }
    if (opts?.growthLabel) {
      notes.push(
        `- 성장 가정: '${opts.growthLabel}' 선택에 따라 **월 ${opts.growthPct ?? 0}% 증가**를 적용했습니다(가정값).`,
      );
    }
    if (opts?.staffIncluded) notes.push("- 고정비에는 입력하신 월 인건비가 합산되어 있습니다.");
    notes.push("- 위 수치는 입력값에 산식을 적용한 계산 결과이며, 실제 매출·비용은 시장 상황에 따라 달라집니다.");
    parts.push(notes.join("\n"));
  }

  return parts.join("\n\n");
}
