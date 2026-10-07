/**
 * 고친 금액을 계획서 본문에 바로 바꿔 넣는다(소유자 결정 2026-10-07).
 * AI 없이 본문에 그대로 적힌 금액 글자만 새 금액으로 바꾼다. 그 금액으로 계산된 다른 값(매출 등)은
 * "계획서 다시 작성하기"로만 맞춰지므로, 바꿔 넣어도 계획서는 계속 '다시 쓸 내용 있음' 상태로 둔다.
 */
import type { ServerPlan } from "./plan-server-store";
import { amountForms } from "./fact-highlight";

/** Amount facts (원) that can be swapped in place. */
export const PATCHABLE_AMOUNT_IDS = ["price", "structure.unitCost", "structure.cost", "budget"] as const;

const won = (value: number) => `${new Intl.NumberFormat("ko-KR").format(Math.round(value))}원`;
const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.round(value) : null;

/** Old written form → new written form, keeping the old style (7,500원 / 7500원 / 120만원 / 120만 원). */
export function amountReplacements(oldValue: number, newValue: number): Array<[string, string]> {
  if (oldValue === newValue) return [];
  const manNew = newValue % 10_000 === 0 ? new Intl.NumberFormat("ko-KR").format(newValue / 10_000) : null;
  return amountForms(won(oldValue)).map(form => {
    if (/만 원$/.test(form)) return [form, manNew ? `${manNew}만 원` : won(newValue)];
    if (/만원$/.test(form)) return [form, manNew ? `${manNew}만원` : won(newValue)];
    if (form.includes(",")) return [form, won(newValue)];
    return [form, `${newValue}원`];
  });
}

// "17,500원" must not match inside "117,500원" or "7,500원" inside "17,500원".
const replaceWhole = (text: string, from: string, to: string) => {
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`(?<![\\d,.])${escaped}`, "g"), to);
};

/**
 * Swaps changed amounts in every AI-written section (sections the owner edited by hand are left alone).
 * An amount shared by two facts is ambiguous and skipped. Returns the number of sections changed.
 */
export function patchDocumentAmounts(plan: Pick<ServerPlan, "sections">, before: Record<string, { value?: unknown } | undefined>, after: Record<string, { value?: unknown } | undefined>, at: string): number {
  const pairs: Array<[string, string]> = [];
  for (const id of PATCHABLE_AMOUNT_IDS) {
    const oldValue = amount(before[id]?.value), newValue = amount(after[id]?.value);
    if (oldValue === null || newValue === null || oldValue === newValue) continue;
    const shared = PATCHABLE_AMOUNT_IDS.some(other => other !== id && (amount(before[other]?.value) === oldValue || amount(after[other]?.value) === oldValue));
    if (!shared) pairs.push(...amountReplacements(oldValue, newValue));
  }
  if (!pairs.length) return 0;
  let changed = 0;
  for (const section of Object.values(plan.sections)) {
    if (!section || section.edited || section.locked) continue;
    let { markdown, html } = section;
    for (const [from, to] of pairs) {
      if (typeof markdown === "string") markdown = replaceWhole(markdown, from, to);
      if (typeof html === "string") html = replaceWhole(html, from, to);
    }
    if (markdown === section.markdown && html === section.html) continue;
    section.markdown = markdown; section.html = html;
    // A newer stamp keeps an older browser copy of the section from overwriting the swap on merge.
    section.generatedAt = at > section.generatedAt ? at : new Date(Date.parse(section.generatedAt) + 1).toISOString();
    changed++;
  }
  return changed;
}
