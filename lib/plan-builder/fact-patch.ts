/**
 * 고친 금액을 계획서 본문에 바로 바꿔 넣는다(소유자 결정 2026-10-07).
 * AI 없이 본문 문장에 그 사실로 적힌 금액(바로 앞에 '판매가'·'고정비'처럼 그 사실을 가리키는 말이 있는 것)만 새 금액으로 바꾼다.
 * 표·그래프·계산된 값은 글자가 같아도 건드리지 않는다(2026-10-21: 누적 표의 같은 숫자까지 바뀌어 숫자가 엉켰다). 그 금액으로 계산된 다른 값(매출 등)은
 * "계획서 다시 작성하기"로만 맞춰지므로, 바꿔 넣어도 계획서는 계속 '다시 쓸 내용 있음' 상태로 둔다.
 */
import type { ServerPlan } from "./plan-server-store";
import { amountForms, amountOwner } from "./fact-highlight";

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

type Swap = { id: string; from: string; to: string };
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Swaps amounts in one run of plain prose. An amount is swapped only when the words right before it name that fact
 * (amountOwner) — a computed value that happens to equal the old amount is left alone. "17,500원" never matches inside
 * "117,500원", nor "7,500원" inside "17,500원".
 */
function swapProse(text: string, context: string, swaps: Swap[]): string {
  const hits: Array<{ at: number; end: number; swap: Swap }> = [];
  for (const swap of swaps) {
    for (const match of text.matchAll(new RegExp(`(?<![\\d,.])${escape(swap.from)}`, "g"))) {
      const at = match.index ?? 0, end = at + swap.from.length;
      if (hits.some(hit => at < hit.end && end > hit.at)) continue;
      if (amountOwner(`${context}${text.slice(0, at)}`) === swap.id) hits.push({ at, end, swap });
    }
  }
  if (!hits.length) return text;
  hits.sort((a, b) => a.at - b.at);
  let out = "", cursor = 0;
  for (const hit of hits) { out += text.slice(cursor, hit.at) + hit.swap.to; cursor = hit.end; }
  return out + text.slice(cursor);
}

/** Markdown: prose lines only — table rows, chart fences and code are computed or quoted, never touched. */
function swapMarkdown(markdown: string, swaps: Swap[]): string {
  let fenced = false;
  return markdown.split("\n").map(line => {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; return line; }
    if (fenced || /^\s*\|/.test(line)) return line;
    return swapProse(line, "", swaps);
  }).join("\n");
}

/** HTML: text between tags, outside tables, charts and code. Block tags start a new context; inline tags keep it. */
function swapHtml(html: string, swaps: Swap[]): string {
  const token = /<(table|figure|svg|pre|code)\b[\s\S]*?<\/\1\s*>|<[^>]*>/gi;
  let out = "", context = "", last = 0;
  for (const match of html.matchAll(token)) {
    const at = match.index ?? 0;
    const text = html.slice(last, at);
    out += swapProse(text, context, swaps) + match[0];
    context += text;
    if (match[1] || /^<\/?(?:p|li|ul|ol|h[1-6]|div|br|tr|td|th|blockquote|section|article)\b/i.test(match[0])) context = "";
    last = at + match[0].length;
  }
  return out + swapProse(html.slice(last), context, swaps);
}

/**
 * Swaps changed amounts in every AI-written section (sections the owner edited by hand are left alone).
 * Only amounts in prose that clearly name the fact are swapped; tables, charts and computed values wait for
 * "계획서에 반영하기". An amount shared by two facts is ambiguous and skipped. Returns the number of sections changed.
 */
export function patchDocumentAmounts(plan: Pick<ServerPlan, "sections">, before: Record<string, { value?: unknown } | undefined>, after: Record<string, { value?: unknown } | undefined>, at: string): number {
  const swaps: Swap[] = [];
  for (const id of PATCHABLE_AMOUNT_IDS) {
    const oldValue = amount(before[id]?.value), newValue = amount(after[id]?.value);
    if (oldValue === null || newValue === null || oldValue === newValue) continue;
    const shared = PATCHABLE_AMOUNT_IDS.some(other => other !== id && (amount(before[other]?.value) === oldValue || amount(after[other]?.value) === oldValue));
    if (!shared) swaps.push(...amountReplacements(oldValue, newValue).map(([from, to]) => ({ id, from, to })));
  }
  if (!swaps.length) return 0;
  // Longest written form first, so "1,200,000원" is tried before a shorter form could claim part of it.
  swaps.sort((a, b) => b.from.length - a.from.length);
  let changed = 0;
  for (const section of Object.values(plan.sections)) {
    if (!section || section.edited || section.locked) continue;
    let { markdown, html } = section;
    if (typeof markdown === "string") markdown = swapMarkdown(markdown, swaps);
    if (typeof html === "string") html = swapHtml(html, swaps);
    if (markdown === section.markdown && html === section.html) continue;
    section.markdown = markdown; section.html = html;
    // A newer stamp keeps an older browser copy of the section from overwriting the swap on merge.
    section.generatedAt = at > section.generatedAt ? at : new Date(Date.parse(section.generatedAt) + 1).toISOString();
    changed++;
  }
  return changed;
}
