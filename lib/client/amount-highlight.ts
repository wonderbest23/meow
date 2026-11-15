/*
 * 계획서 본문의 금액 · 비율을 노란 형광펜으로 칠한다(2026-11-15 사장님 — 쪽집게 강의처럼 숫자가 먼저 보이게).
 * 규칙으로만 찾는다(AI 호출 없음). 글자를 감싸지 않고 CSS Custom Highlight 로 칠해서 편집기 · 저장되는 글은 그대로다.
 * shortcut: 이 기능이 없는 옛 브라우저에서는 칠하지 않는다, 그런 손님이 보이면 <mark> 로 감싸는 방식으로 바꾼다
 */
export const AMOUNT_HIGHLIGHT = "plan-amount";
const AMOUNT = /-?(?:\d[\d,.]*\s?[조억만천]{1,2}\s?)*\d[\d,.]*\s?[조억만천]{0,2}\s?원|-?\d[\d,.]*\s?(?:%|퍼센트)/g;

/** 글 안의 금액 · 비율 자리 [시작, 끝) */
export function amountRanges(text: string): [number, number][] {
  return [...text.matchAll(AMOUNT)].map(match => [match.index, match.index + match[0].length]);
}

/** root 안의 금액 · 비율을 칠하고, 글이 바뀌면 다시 칠한다. 돌려준 함수를 부르면 지운다 */
export function highlightAmounts(root: HTMLElement | null, on: boolean): () => void {
  const registry = typeof CSS !== "undefined" ? CSS.highlights : undefined;
  if (!root || !on || !registry || typeof Highlight === "undefined") { registry?.delete(AMOUNT_HIGHLIGHT); return () => {}; }
  const paint = () => {
    const ranges: Range[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      // 표 · 그래프 안은 숫자뿐이라 칠하지 않는다
      if (!node.data.trim() || node.parentElement?.closest("table, figure, svg, pre, code, button, nav")) continue;
      for (const [start, end] of amountRanges(node.data)) { const range = new Range(); range.setStart(node, start); range.setEnd(node, end); ranges.push(range); }
    }
    registry.set(AMOUNT_HIGHLIGHT, new Highlight(...ranges));
  };
  let frame = 0;
  const observer = new MutationObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(paint); });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  paint();
  return () => { observer.disconnect(); cancelAnimationFrame(frame); registry.delete(AMOUNT_HIGHLIGHT); };
}
