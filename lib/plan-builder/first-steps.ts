/*
 * 일반 보기의 '첫걸음'(2026-11-13) — 계획서 '12주 할 일' 표(주차 | 할 일 | 걸리는 시간 | 끝났다고 볼 기준, section-generator.ts가 정한 열)의
 * 앞 줄을 그대로 가져온다. 새로 지어내지 않으므로 화면과 문서가 어긋나지 않는다. 표가 없으면 빈 배열(첫걸음 칸을 그리지 않는다).
 */
export type FirstStep = { week: string; task: string; time: string; done: string };

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&nbsp;": " " };
const text = (cell: string) => cell.replace(/<[^>]+>/g, " ").replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, entity => ENTITIES[entity]).replace(/\s+/g, " ").trim();

export function firstSteps(html: string, count = 3): FirstStep[] {
  for (const table of html.match(/<table[\s\S]*?<\/table>/g) ?? []) {
    const rows = (table.match(/<tr[\s\S]*?<\/tr>/g) ?? []).map(row => (row.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/g) ?? []).map(text));
    const head = rows[0];
    if (!head || !/주차/.test(head[0] ?? "") || !/할 일/.test(head[1] ?? "")) continue;
    const time = head.findIndex(cell => /시간/.test(cell)), done = head.findIndex(cell => /기준/.test(cell));
    return rows.slice(1).filter(row => row[0] && row[1]).slice(0, count).map(row => ({ week: row[0], task: row[1], time: time > 0 ? row[time] ?? "" : "", done: done > 0 ? row[done] ?? "" : "" }));
  }
  return [];
}
