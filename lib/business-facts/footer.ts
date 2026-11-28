/*
 * 세금·영업신고 답 끝의 '출처 줄' — 서버(answer.ts factsFooter)가 쓰고 화면(대화 말풍선)이 다시 나눠 읽는다.
 * 화면 묶음에 자료 파일이 딸려 들어가지 않게 이 파일은 아무것도 가져오지 않는다(2026-11-28).
 *
 *   \n\n출처: 제목(2026-11-28 확인) https://… / 제목(2026-11-28 확인 · 다시 확인 필요) https://…\n안내예요. 최종 확인은 …에서 해 주세요.
 */
export type FactSource = { title: string; checkedAt: string; stale: boolean; url: string };
export type FactsFooter = { sources: FactSource[]; note: string };

export const FOOTER_MARK = "\n\n출처: ";
const SEPARATOR = " / ";
const STALE = " · 다시 확인 필요";

export function formatFactSource(source: FactSource): string {
  return `${source.title}(${source.checkedAt} 확인${source.stale ? STALE : ""}) ${source.url}`;
}

export function formatFactsFooter(footer: FactsFooter): string {
  return `${FOOTER_MARK}${footer.sources.map(formatFactSource).join(SEPARATOR)}\n${footer.note}`;
}

const LINE = /^(.+)\((\d{4}-\d{2}-\d{2}) 확인( · 다시 확인 필요)?\) (https:\/\/\S+)$/;

/** 답 글에서 출처 줄을 떼어 낸다. 모양이 하나라도 어긋나면 나누지 않는다(그대로 글로 보인다) */
export function splitFactsFooter(text: string): { body: string; footer: FactsFooter | null } {
  const at = text.lastIndexOf(FOOTER_MARK);
  if (at < 0) return { body: text, footer: null };
  const rest = text.slice(at + FOOTER_MARK.length);
  const newline = rest.indexOf("\n");
  if (newline < 0) return { body: text, footer: null };
  const note = rest.slice(newline + 1).trim();
  const sources: FactSource[] = [];
  for (const part of rest.slice(0, newline).split(SEPARATOR)) {
    const match = LINE.exec(part.trim());
    if (!match) return { body: text, footer: null };
    sources.push({ title: match[1].trim(), checkedAt: match[2], stale: !!match[3], url: match[4] });
  }
  if (!sources.length || !note || note.includes("\n")) return { body: text, footer: null };
  return { body: text.slice(0, at).trimEnd(), footer: { sources, note } };
}
