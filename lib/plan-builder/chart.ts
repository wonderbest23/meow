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

/** 값 범위를 보기 좋은 눈금으로 — 0을 반드시 포함한다. */
export function chartScale(points: ChartPoint[]): { min: number; max: number } {
  const values = points.map((p) => p.value);
  const rawMax = Math.max(0, ...values);
  const rawMin = Math.min(0, ...values);
  const span = rawMax - rawMin || 1;
  const pad = span * 0.12;
  return { min: rawMin - (rawMin < 0 ? pad : 0), max: rawMax + (rawMax > 0 ? pad : 0) };
}

/**
 * 웹 문서용 인라인 SVG.
 * 외부 리소스 없이 자체 완결되며, 0선을 기준으로 적자 구간과 흑자 구간을 나눠 칠한다.
 */
export function chartToSvg(spec: ChartSpec): string {
  const W = 720;
  const H = 280;
  const padL = 62;
  const padR = 16;
  const padT = 34;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const { min, max } = chartScale(spec.points);
  const range = max - min || 1;
  const x = (i: number) => padL + (spec.points.length === 1 ? plotW / 2 : (i / (spec.points.length - 1)) * plotW);
  const y = (v: number) => padT + plotH - ((v - min) / range) * plotH;
  const zeroY = y(0);

  const line = spec.points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(spec.points.length - 1).toFixed(1)},${zeroY.toFixed(1)} L${x(0).toFixed(1)},${zeroY.toFixed(1)} Z`;

  // y축 눈금 4개
  const ticks = [0, 1, 2, 3, 4].map((i) => min + (range * i) / 4);
  const gridLines = ticks
    .map((t) => {
      const ty = y(t);
      return `<line x1="${padL}" y1="${ty.toFixed(1)}" x2="${(W - padR).toFixed(1)}" y2="${ty.toFixed(1)}" stroke="#e9edf2" stroke-width="1"/>` +
        `<text x="${padL - 8}" y="${(ty + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="#8b95a1">${shortWon(Math.round(t))}</text>`;
    })
    .join("");

  // x축 라벨은 겹치지 않게 격월로
  const xLabels = spec.points
    .map((p, i) =>
      i % 2 === 0 || i === spec.points.length - 1
        ? `<text x="${x(i).toFixed(1)}" y="${(H - padB + 16).toFixed(1)}" text-anchor="middle" font-size="10" fill="#8b95a1">${p.label}</text>`
        : "",
    )
    .join("");

  const dots = spec.points
    .map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="2.6" fill="${p.value < 0 ? "#d6455d" : "#0f9d66"}"/>`)
    .join("");

  // 흑자 전환 지점 강조
  let marker = "";
  if (spec.breakEvenMonth && spec.breakEvenMonth <= spec.points.length) {
    const i = spec.breakEvenMonth - 1;
    const mx = x(i);
    marker =
      `<line x1="${mx.toFixed(1)}" y1="${padT}" x2="${mx.toFixed(1)}" y2="${(H - padB).toFixed(1)}" stroke="#0f9d66" stroke-width="1" stroke-dasharray="4 3"/>` +
      `<text x="${mx.toFixed(1)}" y="${(padT - 10).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#0f9d66">${spec.breakEvenMonth}개월차 월 흑자 전환</text>`;
  }

  return [
    `<svg class="plan-chart" role="img" aria-label="${escapeXml(spec.title)}" viewBox="0 0 ${W} ${H}" width="100%" xmlns="http://www.w3.org/2000/svg">`,
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`,
    gridLines,
    `<path d="${area}" fill="#3182f6" fill-opacity="0.10"/>`,
    `<line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${(W - padR).toFixed(1)}" y2="${zeroY.toFixed(1)}" stroke="#8b95a1" stroke-width="1.2"/>`,
    `<path d="${line}" fill="none" stroke="#3182f6" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>`,
    dots,
    marker,
    xLabels,
    `</svg>`,
  ].join("");
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] as string);
}
