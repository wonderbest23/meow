import { Marked } from "marked";
import { CHART_FENCE_LANG, parseChartSpec, chartToSvg } from "./chart";

/**
 * 플랜 전용 마크다운 인스턴스.
 * ```plan-chart 펜스는 코드 블록이 아니라 인라인 SVG 차트로 그리고,
 * 나머지 코드 블록은 기본 렌더러에 맡긴다(false 반환).
 */
const planMarked = new Marked({ async: true }).use({
  renderer: {
    code({ text, lang }) {
      if (lang !== CHART_FENCE_LANG) return false;
      const spec = parseChartSpec(text);
      // 형식이 어긋나면 원시 JSON을 노출하지 않고 조용히 지운다
      if (!spec) return "";
      // 인라인 편집 후 마크다운으로 되돌릴 때 쓰도록 원본 스펙을 함께 심는다
      const raw = JSON.stringify(spec).replace(/"/g, "&quot;");
      return `<figure class="plan-chart-figure" data-chart-spec="${raw}">${chartToSvg(spec)}</figure>`;
    },
  },
});

/** 플랜 본문 마크다운 → HTML */
export async function renderPlanMarkdown(markdown: string): Promise<string> {
  return planMarked.parse(markdown) as Promise<string>;
}
