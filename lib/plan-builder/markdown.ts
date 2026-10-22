import { Marked, type MarkedExtension, type Token, type Tokens } from "marked";
import { CHART_FENCE_LANG, parseChartSpec, chartToSvg } from "./chart";
import { isNumericColumn, isShortCell } from "./table-cells";

/*
 * 취소선(~ / ~~)은 쓰지 않는다. 사업계획서에는 '2~3곳', '10~20만원', '9~10월' 같은 범위가 많은데,
 * 한 칸에 '2~3곳 … 각 2~3곳'처럼 물결이 두 번 나오면 GFM 이 그 사이를 취소선으로 묶어 '23곳'으로 읽혔다
 * (실제 AI 생성 2026-10-22, 화면·PDF·Word 모두). 물결은 언제나 글자 그대로 둔다.
 */
export const NO_STRIKETHROUGH: MarkedExtension = { tokenizer: { del: () => undefined } };

/**
 * 숫자 열 정렬 — 머리줄에 정렬(---:)이 없어도 금액·수량만 든 열은 오른쪽에 맞춘다.
 * 화면(renderPlanMarkdown)과 PDF·Word(lexPlanMarkdown)가 같은 표를 같은 정렬로 그리게 여기 한 곳에서 정한다.
 */
function alignNumericColumns(token: Token) {
  if (token.type !== "table") return;
  const table = token as Tokens.Table;
  table.header.forEach((cell, column) => {
    if (table.align[column] || !isNumericColumn(table.rows.map(row => (row[column]?.text ?? "").replace(/[*_`]/g, "")), null, column)) return;
    table.align[column] = "right";
    cell.align = "right";
    for (const row of table.rows) if (row[column]) row[column].align = "right";
  });
}

/** PDF·Word 가 쓰는 마크다운 분해기 — 화면과 같은 규칙(GFM 표, 취소선 없음, 숫자 열 오른쪽) */
const documentMarked = new Marked({ gfm: true }).use(NO_STRIKETHROUGH);
export function lexPlanMarkdown(markdown: string): Token[] {
  const tokens = documentMarked.lexer(markdown);
  documentMarked.walkTokens(tokens, alignNumericColumns);
  return tokens;
}

/**
 * 플랜 전용 마크다운 인스턴스.
 * ```plan-chart 펜스는 코드 블록이 아니라 인라인 SVG 차트로 그리고,
 * 나머지 코드 블록은 기본 렌더러에 맡긴다(false 반환).
 */
const planMarked = new Marked({ async: true }).use(NO_STRIKETHROUGH).use({
  walkTokens: alignNumericColumns,
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
    // 짧은 칸(숫자·짧은 낱말)에 표시를 남긴다 — 폰에서 이 칸만 한 줄로 두고 줄글 칸은 줄을 바꾼다
    tablecell(token) {
      const tag = token.header ? "th" : "td";
      const align = token.align ? ` align="${token.align}"` : "";
      const short = isShortCell(token.text) ? " data-short" : "";
      return `<${tag}${align}${short}>${this.parser.parseInline(token.tokens)}</${tag}>\n`;
    },
  },
});

/** 플랜 본문 마크다운 → HTML */
export async function renderPlanMarkdown(markdown: string): Promise<string> {
  return planMarked.parse(markdown) as Promise<string>;
}
