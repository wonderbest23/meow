// 누적 손익 곡선 — 손익분기까지 걸리는 기간을 한눈에 보여준다.
// 마크다운 안에 ```plan-chart 펜스로 심어두고 HTML·PDF·DOCX가 각자 그린다.

import type { FinancialResult } from "./financials";

export const CHART_FENCE_LANG = "plan-chart";

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ChartSpec {
  /** cumulative: 누적 손익 곡선 / monthly: 월별 영업손익(월 단위 흑자 시점용) */
  kind: "cumulative" | "monthly";
  title: string;
  points: ChartPoint[];
  /** 월 단위 흑자 전환 시점 (없으면 null) */
  breakEvenMonth: number | null;
  /** 초기 투자 회수 시점 (없으면 null) */
  paybackMonth: number | null;
}

/** 계산 결과에서 누적 손익 곡선 데이터를 만든다. 12개월 표가 없으면 그리지 않는다. */
export function buildCumulativeChart(result: FinancialResult): ChartSpec | null {
  if (result.monthly.length < 2) return null;
  return {
    kind: "cumulative",
    title: "월별 누적 영업손익",
    points: result.monthly.map((m) => ({ label: `${m.month}월`, value: m.cumulative })),
    breakEvenMonth: result.breakEvenMonth,
    paybackMonth: result.paybackMonth,
  };
}

/**
 * 월별 영업손익 차트 — 누적 곡선과 상보적이다.
 * 누적은 '언제 본전인지'를, 이건 '어느 달부터 매달 남는지'를 보여준다.
 * 렌더 경로(SVG·PDF·DOCX)는 누적 차트와 동일한 기계를 그대로 쓴다.
 */
export function buildMonthlyProfitChart(result: FinancialResult): ChartSpec | null {
  if (result.monthly.length < 2) return null;
  return {
    kind: "monthly",
    title: "월별 영업손익",
    points: result.monthly.map((m) => ({ label: `${m.month}월`, value: m.operatingProfit })),
    breakEvenMonth: result.breakEvenMonth,
    paybackMonth: null,
  };
}

/** 마크다운에 심을 펜스 블록 */
export function chartFence(spec: ChartSpec): string {
  return ["```" + CHART_FENCE_LANG, JSON.stringify(spec), "```"].join("\n");
}

/** 펜스 본문(JSON)을 스펙으로 되돌린다. 형식이 어긋나면 null. */
export function parseChartSpec(raw: string): ChartSpec | null {
  try {
    const parsed = JSON.parse(raw) as ChartSpec;
    if ((parsed?.kind !== "cumulative" && parsed?.kind !== "monthly") || !Array.isArray(parsed.points) || parsed.points.length < 2) return null;
    if (!parsed.points.every((p) => typeof p.value === "number" && Number.isFinite(p.value))) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 축 눈금용 — 원 단위를 억/만원으로 짧게 */
export function shortWon(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 100_000_000) return `${sign}${(abs / 100_000_000).toFixed(abs % 100_000_000 === 0 ? 0 : 1)}억`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 10_000).toLocaleString("ko-KR")}만`;
  return `${sign}${abs.toLocaleString("ko-KR")}`;
}

/**
 * 값 범위를 보기 좋은 눈금으로 — 0을 반드시 포함한다.
 *
 * 예전에는 실제 최대·최소에 12% 를 덧대고 그 사이를 4등분했다. 그래서 눈금이
 * 0 / 131만 / 262만 / 393만 처럼 읽을 수 없는 숫자로 찍혔다. 사람이 축을 읽는
 * 이유는 '대충 얼마인지' 가늠하기 위해서인데, 131만 같은 눈금은 그 일을 못 한다.
 *
 * 눈금 간격을 1·2·2.5·5 × 10ⁿ 중에서 고르고, 범위를 그 배수로 넓힌다.
 * 결과는 0 / 100만 / 200만 / 300만 / 400만 처럼 떨어지는 값이 된다.
 */
export function chartScale(points: ChartPoint[]): { min: number; max: number; step: number } {
  const values = points.map((p) => p.value);
  const rawMax = Math.max(0, ...values);
  const rawMin = Math.min(0, ...values);

  /* 값이 전부 0이면 눈금도 0 하나뿐이라 '0 / 0' 이 찍힌다 */
  if (rawMax === 0 && rawMin === 0) return { min: 0, max: 1, step: 1 };

  const span = rawMax - rawMin;

  /*
   * 눈금 5칸을 기준으로 잡는다. 4칸으로 하면 자리올림이 한 번에 크게 뛰어
   * (예: 최대 413만인데 눈금이 600만까지) 그림 위쪽 3분의 1이 비어 버린다.
   */
  const rough = span / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10) * magnitude;

  const min = Math.floor(rawMin / step) * step;
  const max = Math.ceil(rawMax / step) * step;
  /* 값이 전부 0이면 위아래가 붙어 0으로 나누게 된다 */
  return max === min ? { min, max: min + step, step } : { min, max, step };
}

/** 눈금 값 목록 — 축을 그리는 쪽이 개수를 세지 않아도 되게 여기서 만든다 */
export function chartTicks(points: ChartPoint[]): number[] {
  const { min, max, step } = chartScale(points);
  const out: number[] = [];
  /* 부동소수 누적 오차로 마지막 눈금이 빠지는 일이 없게 개수로 센다 */
  const count = Math.round((max - min) / step);
  for (let i = 0; i <= count; i += 1) out.push(min + step * i);
  return out;
}

/**
 * 웹 문서용 인라인 SVG. 외부 리소스 없이 자체 완결된다.
 *
 * 두 차트는 성격이 다르므로 모양도 다르게 그린다.
 *   누적(cumulative) — 이어지는 값이라 선. '언제 본전인가'를 본다.
 *   월별(monthly)    — 달마다 끊긴 값이라 막대. '어느 달부터 남는가'를 본다.
 * 예전에는 둘 다 같은 면적선이라 나란히 놓으면 구분이 되지 않았다.
 *
 * 적자 구간은 빨강, 흑자 구간은 파랑으로 나눈다. 예전에는 점만 색이 달랐고
 * 선과 면은 전부 파랑이라, 물에 잠긴 구간이 눈에 들어오지 않았다.
 */
export function chartToSvg(spec: ChartSpec): string {
  const W = 720;
  const H = 300;
  const padL = 74;
  const padR = 18;
  const padT = 40;
  const padB = 40;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const { min, max } = chartScale(spec.points);
  const range = max - min || 1;
  const n = spec.points.length;
  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - ((v - min) / range) * plotH;
  const zeroY = y(0);

  const POS = "#3272db";
  const NEG = "#d6455d";
  const AXIS = "#626981";
  const GRID = "#dde1e6"; /* 키트의 CoolGray/20 */

  /* 가로 눈금선 + y축 라벨 — 반올림된 값이라 읽을 수 있다 */
  const gridLines = chartTicks(spec.points)
    .map((t) => {
      const ty = y(t);
      return `<line x1="${padL}" y1="${ty.toFixed(1)}" x2="${(W - padR).toFixed(1)}" y2="${ty.toFixed(1)}" stroke="${GRID}" stroke-width="1"/>` +
        `<text x="${padL - 10}" y="${(ty + 4).toFixed(1)}" text-anchor="end" font-size="12" fill="${AXIS}">${shortWon(Math.round(t))}</text>`;
    })
    .join("");

  /* x축 라벨 — 12개월이면 격월로 솎아야 글자가 겹치지 않는다 */
  const everyOther = n > 8;
  const xLabels = spec.points
    .map((p, i) =>
      !everyOther || i % 2 === 0 || i === n - 1
        ? `<text x="${x(i).toFixed(1)}" y="${(H - padB + 20).toFixed(1)}" text-anchor="middle" font-size="12" fill="${AXIS}">${p.label}</text>`
        : "",
    )
    .join("");

  let series: string;
  if (spec.kind === "monthly") {
    /*
     * 막대 폭은 칸의 19% — 키트에서 잰 비율이다(칸 43px 에 막대 8px).
     * 처음에는 62% 로 두껍게 넣었는데 그건 내가 정한 값이었고, 12개월치를
     * 늘어놓으면 막대가 서로 붙어 덩어리로 보인다. 얇게 세워야 달마다
     * 끊긴 값이라는 게 읽힌다.
     */
    const slot = n > 1 ? plotW / (n - 1) : plotW;
    const barW = Math.max(5, Math.min(16, slot * 0.19));
    series = spec.points
      .map((p, i) => {
        const top = Math.min(y(p.value), zeroY);
        const h = Math.abs(y(p.value) - zeroY);
        return `<rect x="${(x(i) - barW / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" rx="2" fill="${p.value < 0 ? NEG : POS}"/>`;
      })
      .join("");
  } else {
    const line = spec.points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
    const area = `${line} L${x(n - 1).toFixed(1)},${zeroY.toFixed(1)} L${x(0).toFixed(1)},${zeroY.toFixed(1)} Z`;
    const dots = spec.points
      .map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="3" fill="${p.value < 0 ? NEG : POS}"/>`)
      .join("");
    series =
      `<path d="${area}" fill="${POS}" fill-opacity="0.10"/>` +
      `<path d="${line}" fill="none" stroke="${POS}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>` +
      dots;
  }

  /* 0선은 눈금선보다 진하게 — 흑자·적자를 가르는 선이다 */
  const zeroLine = `<line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${(W - padR).toFixed(1)}" y2="${zeroY.toFixed(1)}" stroke="${AXIS}" stroke-width="1.4"/>`;

  let marker = "";
  if (spec.breakEvenMonth && spec.breakEvenMonth <= n) {
    const mx = x(spec.breakEvenMonth - 1);
    marker =
      `<line x1="${mx.toFixed(1)}" y1="${padT}" x2="${mx.toFixed(1)}" y2="${(H - padB).toFixed(1)}" stroke="#0f9d66" stroke-width="1.2" stroke-dasharray="4 3"/>` +
      `<text x="${mx.toFixed(1)}" y="${(padT - 14).toFixed(1)}" text-anchor="middle" font-size="12.5" font-weight="700" fill="#0f9d66">${spec.breakEvenMonth}개월차 월 흑자 전환</text>`;
  }

  return [
    `<svg class="plan-chart" role="img" aria-label="${escapeXml(spec.title)}" viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`,
    gridLines,
    series,
    zeroLine,
    marker,
    xLabels,
    `</svg>`,
  ].join("");
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] as string);
}
