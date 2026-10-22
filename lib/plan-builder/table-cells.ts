/**
 * 표 칸 성격 — 화면(편집기)·PDF·Word 가 같은 기준으로 표를 그리게 한다.
 * 브라우저에서도 쓰므로 marked 같은 무거운 모듈을 들이지 않는다.
 */

const UNIT = "(?:만\\s?원|억\\s?원|천\\s?원|원|만|억|천|%|퍼센트|개|건|명|회|곳|번|잔|병|판|팩|벌|권|세트|시간|분|초|개월|달|주|일|년|배|가구|세대|평|㎡|kg|g)";
const NUMBER = `[-+−]?(?:약\\s?)?\\d[\\d,.]*\\s?${UNIT}?(?:\\s?(?:차|째))?`;
const NUMERIC_CELL = new RegExp(`^(?:${NUMBER})(?:\\s?(?:→|~|-|–|/)\\s?(?:${NUMBER}))?$`);

/** 숫자·금액 칸("4,500원", "12%", "1,350원 → 2,700원", "약 3시간") — 오른쪽 맞춤 대상 */
export function isNumericCell(text: string): boolean {
  const value = text.replace(/\s+/g, " ").trim();
  return !!value && value.length <= 32 && NUMERIC_CELL.test(value);
}

/**
 * 한 줄로 둬도 되는 짧은 칸(숫자·짧은 낱말). 폰에서 이 칸만 줄바꿈을 막고,
 * 줄글 칸은 적당한 폭에서 줄을 바꾼다(예전엔 모든 칸이 한 줄이라 '12주 할 일' 표가 3,500px 이 됐다).
 */
export function isShortCell(text: string): boolean {
  const value = text.replace(/\s+/g, " ").trim();
  return value.length <= 8 || isNumericCell(value);
}

const AMOUNT = "[-+−]?\\d[\\d,.]*\\s?(?:만\\s?원|억\\s?원|천\\s?원|원|만|억|%|개|건|명|회|곳|잔|병)?";
const AMOUNT_CELL = new RegExp(`^(?:${AMOUNT})(?:\\s?(?:→|~|-|–)\\s?(?:${AMOUNT}))?$`);

/** 금액·수량 칸("4,500원", "12%", "1,350원 → 2,700원") — 기간·차례("1주", "3개월차", "약 4시간")는 이름 칸이라 뺀다 */
export function isAmountCell(text: string): boolean {
  const value = text.replace(/\s+/g, " ").trim();
  return !!value && value.length <= 32 && AMOUNT_CELL.test(value);
}

/**
 * 오른쪽에 맞출 숫자 열인지 — 머리줄 정렬(---:)이 있으면 그대로 따르고, 없으면 첫 열이 아니면서
 * 빈칸을 뺀 본문 칸이 모두 금액·수량일 때. 화면·PDF·Word 가 같은 판단을 쓴다.
 */
export function isNumericColumn(cells: string[], align: string | null | undefined, column: number): boolean {
  if (align) return align === "right";
  if (column === 0) return false;
  const filled = cells.map(cell => cell.trim()).filter(cell => cell && cell !== "-" && cell !== "—");
  return filled.length > 0 && filled.every(isAmountCell);
}

/*
 * 폰에서 네 칸 이상 표는 줄마다 카드로 쌓는다 — 옆으로 밀지 않고 '열 이름: 값'으로 읽게(DocumentWorkspace.module.css).
 * 칸마다 머리줄 글자를 data-label 로 붙여 두면 CSS 가 그 이름표를 칸 앞에 그린다. 보여 주기 전용이라 저장하는 HTML·PDF·Word 는 그대로다.
 */

/** 머리줄 칸들 → 열 이름표. 첫 줄이 모두 머리 칸(th)일 때만 이름표로 쓰고, 아니면 null(카드로 바꾸지 않는다). */
export function tableHeaderLabels(cells: Array<{ header: boolean; text: string }>): string[] | null {
  if (!cells.length || !cells.every(cell => cell.header)) return null;
  return cells.map(cell => cell.text.replace(/\s+/g, " ").trim());
}

const TABLE_HTML = /<table\b[\s\S]*?<\/table>/gi;
const ROW_HTML = /<tr\b[\s\S]*?<\/tr>/gi;
const CELL_HTML = /<(t[hd])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
const escapeLabel = (text: string) => text.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * 서버 렌더 본문(편집기 준비 전·사실 고치기 화면)의 표 칸에 열 이름표(data-label)를 붙인다.
 * 편집기 안에서는 같은 규칙을 ProseMirror 꾸밈으로 붙인다(InlineDocEditor). 글자 사이 엔티티(&amp; 등)는 속성에서도 그대로 풀린다.
 */
export function withTableCellLabels(html: string): string {
  return html.replace(TABLE_HTML, table => {
    let labels: string[] | null | undefined;
    return table.replace(ROW_HTML, row => {
      if (labels === undefined) {
        labels = tableHeaderLabels([...row.matchAll(CELL_HTML)].map(([, tag, , inner]) => ({ header: tag.toLowerCase() === "th", text: inner.replace(/<[^>]*>/g, "") })));
        return row;
      }
      const names = labels;
      if (!names) return row;
      let column = 0;
      return row.replace(CELL_HTML, (cell, tag: string, attributes: string, inner: string) => {
        const label = names[column++];
        if (!label || /\sdata-label=/.test(attributes)) return cell;
        return `<${tag}${attributes} data-label="${escapeLabel(label)}">${inner}</${tag}>`;
      });
    });
  });
}
