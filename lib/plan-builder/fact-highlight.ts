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

/*
 * 금액은 글자만 같다고 그 사실이 아니다(운영 점검 2026-10-21: 가격 4,500원을 4,000원으로 고치자 우연히 4,500원이던
 * 12개월 통장 누적 칸까지 바뀌어 숫자가 엉켰다). 금액 바로 앞(같은 문장, 몇 글자 안)에 그 사실을 가리키는 말이 있을 때만
 * 그 사실의 금액으로 본다. 매출·누적·이익처럼 계산된 값을 가리키는 말이 더 가까우면 어느 사실도 아니다.
 */
const AMOUNT_OWNER_WORDS: ReadonlyArray<readonly [string, string]> = [
  ...["판매가", "판매 가격", "가격", "객단가", "판매 단가", "단가", "요금", "이용료", "수강료", "회비", "1회", "회당", "1인당", "개당", "한 잔", "한 개", "1개", "한 그릇", "세트", "한 벌", "한 상자", "한 박스", "1인", "1명", "한 명", "시간당", "1시간", "한 시간", "한 번에"].map(word => [word, "price"] as const),
  ...["원가", "변동비", "재료비", "매입가", "건당 비용", "한 건당 비용", "들어가는 비용", "들어가는 돈"].map(word => [word, "structure.unitCost"] as const),
  ...["고정비", "고정 비용", "매달 나가는", "매달 드는", "한 달 고정"].map(word => [word, "structure.cost"] as const),
  ...["예산", "준비 자금", "초기 자금", "창업 자금", "자기자금", "가진 돈", "준비한 돈", "모아 둔"].map(word => [word, "budget"] as const),
  // 계산된 값 — 이 말이 더 가까우면 어느 사실의 금액도 아니다
  ...["매출", "누적", "잔고", "이익", "손익", "남는", "남습", "남아", "남기", "모자라", "부족", "합계", "공헌", "차이", "적자", "흑자", "본전", "빼면", "더하면", "곱하면", "나누면", "합치면", "×", "÷", "="].map(word => [word, ""] as const),
];
/** Facts whose amounts are matched only with an owner word in front. */
export const OWNED_AMOUNT_IDS = ["price", "structure.unitCost", "structure.cost", "budget"] as const;
const OWNER_WINDOW = 30;

/**
 * Which fact the amount right after `before` belongs to: a fact id, "" for a computed value, or null when nothing says.
 * Only the same sentence and the last few characters count; the word ending closest to the amount wins.
 */
export function amountOwner(before: string): string | null {
  const sentence = before.split(/[.!?](?=\s|$)|\n/).pop() ?? "";
  const near = sentence.slice(-OWNER_WINDOW);
  let best: { end: number; length: number; id: string } | null = null;
  for (const [word, id] of AMOUNT_OWNER_WORDS) {
    const at = near.lastIndexOf(word);
    if (at < 0) continue;
    const end = at + word.length;
    if (!best || end > best.end || (end === best.end && word.length > best.length)) best = { end, length: word.length, id };
  }
  return best ? best.id : null;
}

const plainAmount = (needle: string) => /^[\d,.]+(?:만\s?)?원$/.test(needle);

/**
 * Non-overlapping [start, end, questionId] ranges of fact needles inside one text run.
 * `before` is the text in front of this run in the same paragraph; null means the run is in a table or chart,
 * where amounts are computed values and never marked.
 */
export function findFactRanges(text: string, facts: Pick<EditableFact, "questionId" | "needles">[], before: string | null = ""): Array<[number, number, string]> {
  const ranges: Array<[number, number, string]> = [];
  const owned = new Set<string>(OWNED_AMOUNT_IDS);
  const all = facts.flatMap(fact => fact.needles.map(needle => ({ needle, id: fact.questionId }))).sort((a, b) => b.needle.length - a.needle.length);
  for (const { needle, id } of all) {
    const checkOwner = owned.has(id) && plainAmount(needle);
    if (checkOwner && before === null) continue;
    let from = 0;
    for (;;) {
      const at = text.indexOf(needle, from);
      if (at < 0) break;
      const end = at + needle.length;
      // An amount must stand alone: "50,000원" inside "-2,950,000원" is a different number.
      const glued = /^\d/.test(needle) && /[\d,.]/.test(text[at - 1] ?? "");
      const ownedHere = !checkOwner || amountOwner(`${before ?? ""}${text.slice(0, at)}`) === id;
      if (!glued && ownedHere && !ranges.some(([start, stop]) => at < stop && end > start)) ranges.push([at, end, id]);
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
