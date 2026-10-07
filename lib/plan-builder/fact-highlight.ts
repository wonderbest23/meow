/**
 * "문장에서 바로 고치기" (owner decision 2026-10-07): only the business's core facts — the intake answers the plan is
 * built from — are editable from the document. Each fact carries the strings it is likely to appear as in the text,
 * so the document can mark those spots. Matching is best-effort; the fact list itself is always shown.
 */
export const EDITABLE_FACT_IDS = ["customer", "problem", "offer", "channel", "price", "structure.unitCost", "structure.cost", "budget", "hoursPerWeek", "capacity", "goal"] as const;

export type EditableFact = { questionId: string; label: string; display: string; needles: string[] };

const won = (value: number) => `${new Intl.NumberFormat("ko-KR").format(Math.round(value))}원`;

/** Ways one amount tends to be written: 7,500원 / 7500원, 120만원 / 120만 원 / 1,200,000원. */
export function amountForms(text: string): string[] {
  const plain = text.replace(/\s+/g, "");
  const wonMatch = plain.match(/^([\d,]+)원$/);
  const manMatch = plain.match(/^([\d,.]+)만원$/);
  const value = wonMatch ? Number(wonMatch[1].replace(/,/g, "")) : manMatch ? Number(manMatch[1].replace(/,/g, "")) * 10_000 : NaN;
  if (!Number.isFinite(value) || value <= 0) return [];
  const forms = [won(value), `${Math.round(value)}원`];
  if (value % 10_000 === 0) { const man = value / 10_000; forms.push(`${new Intl.NumberFormat("ko-KR").format(man)}만원`, `${new Intl.NumberFormat("ko-KR").format(man)}만 원`); }
  return forms;
}

/** Pieces of a displayed answer worth looking for in prose ("A, B / 하루 20건" → "A", "B", "하루 20건"). */
export function factNeedles(display: string): string[] {
  // Split picks on ", " and " / " only — commas inside amounts ("10,000원") stay.
  const pieces = display.split(/\s*\/\s*|,\s+/).map(piece => piece.replace(/\s*\((?:예상|실제 기록)\)$/, "").trim()).filter(Boolean);
  const needles = new Set<string>();
  for (const piece of [display.trim(), ...pieces]) {
    if (piece.length < 2 || /^(?:기타|없음|미정)$/.test(piece)) continue;
    needles.add(piece);
    for (const form of amountForms(piece)) needles.add(form);
  }
  // Longest first, so "6개월 안에 단골 50가구" wins over "50가구".
  return [...needles].sort((a, b) => b.length - a.length);
}

/** Non-overlapping [start, end, questionId] ranges of fact needles inside one text run. */
export function findFactRanges(text: string, facts: Pick<EditableFact, "questionId" | "needles">[]): Array<[number, number, string]> {
  const ranges: Array<[number, number, string]> = [];
  const all = facts.flatMap(fact => fact.needles.map(needle => ({ needle, id: fact.questionId }))).sort((a, b) => b.needle.length - a.needle.length);
  for (const { needle, id } of all) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(needle, from);
      if (at < 0) break;
      const end = at + needle.length;
      // An amount must stand alone: "50,000원" inside "-2,950,000원" is a different number.
      const glued = /^\d/.test(needle) && /[\d,.]/.test(text[at - 1] ?? "");
      if (!glued && !ranges.some(([start, stop]) => at < stop && end > start)) ranges.push([at, end, id]);
      from = end;
    }
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}

/**
 * "6만 5천", "65,000", "65000원" → 65000. 금액 칸은 숫자를 바로 적는 게 가장 쉽다(운영 확인 2026-10-07:
 * 구간 버튼만 있어 정확한 금액을 넣을 수 없었고, 가격은 기준을 다시 골라야 해서 원래 기준을 지킬 수 없었다).
 */
export function parseWon(text: string): number | null {
  const plain = text.replace(/[\s,원]/g, "");
  if (!plain) return null;
  if (/^\d+$/.test(plain)) return Number(plain) || null;
  const match = plain.match(/^(?:(\d+(?:\.\d+)?)억)?(?:(\d+(?:\.\d+)?)만)?(?:(\d+(?:\.\d+)?)천)?(\d+)?$/);
  if (!match || !match.slice(1).some(Boolean)) return null;
  const [, eok, man, cheon, rest] = match;
  const value = Math.round(Number(eok ?? 0) * 100_000_000 + Number(man ?? 0) * 10_000 + Number(cheon ?? 0) * 1_000 + Number(rest ?? 0));
  return value > 0 ? value : null;
}
