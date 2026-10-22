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
