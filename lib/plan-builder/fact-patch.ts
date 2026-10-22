/**
 * 고친 금액을 계획서 본문에 바로 바꿔 넣는다(소유자 결정 2026-10-07).
 * AI 없이 본문 문장에 그 사실로 적힌 금액(바로 앞에 '판매가'·'고정비'처럼 그 사실을 가리키는 말이 있는 것)만 새 금액으로 바꾼다.
 * 표·그래프·계산된 값은 글자가 같아도 건드리지 않는다(2026-10-21: 누적 표의 같은 숫자까지 바뀌어 숫자가 엉켰다). 그 금액으로 계산하는 문장이
 * 하나라도 든 문단·목록 칸·제목('…에서 …원을 빼면 …원이 남습니다')은 통째로 두어 숫자가 서로 맞게 한다(2026-10-22). 그 금액으로 계산된 다른 값(매출 등)은
 * "계획서 다시 작성하기"로만 맞춰지므로, 바꿔 넣어도 계획서는 계속 '다시 쓸 내용 있음' 상태로 둔다.
 */
import type { ServerPlan } from "./plan-server-store";
import { amountForms, amountOwner, OWNER_BY_VALUE, parseWon } from "./fact-highlight";

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

/*
 * 계산이 든 덩어리는 바꿔 넣지 않는다(실제 채팅 수정 2026-10-22): '판매가 4,500원에서 1,350원을 빼면 한 건에 3,150원이 남습니다'의
 * 가격만 5,000원으로 바꾸자 '5,000원에서 1,350원을 빼면 3,150원'이 되어 계산이 틀렸다. 다시 확인(2026-10-22 2차): 문장 단위로만 보면
 * '한 개 5,000원으로 시작합니다. … 따라서 한 개를 팔 때마다 3,150원이 남습니다. 판매가의 70%입니다(계산).'처럼 앞 문장만 바뀌어
 * 같은 문단 안에서 새 가격과 옛 계산값이 섞였다. 그래서 문단·목록 한 칸·제목 중 한 문장이라도 그 금액으로 계산한 값을 담으면
 * 그 덩어리 전체를 그대로 두고 '계획서에 반영하기'(다시 쓰기)에 맡긴다 — 반쯤 바뀐 문단보다 옛 숫자로 맞는 문단이 낫다.
 */
const ARITHMETIC = /빼면|뺀\s|빼고|빼기 전|더하면|더한\s|곱하면|곱한\s|나누면|나눈\s|합치면|합한\s|[×÷=]|남습니다|남아요|남는다|남고|남아\s|남는\s|남깁니다|남겨/;
/** 계산된 값이라는 표시 — '(계산)', 판매가의 몇 %, 매출·이익·본전처럼 금액으로 셈한 값 */
const COMPUTED = /\(계산|계산\)|계산하면|계산한|계산된|계산상|계산으로|계산해|\d\s?%|퍼센트|매출|이익|마진|본전|손익|순수익|공헌|흑자|적자/;
const AMOUNT = /(?<![\d,.])\d[\d,]*(?:\.\d+)?\s?(?:만\s?|억\s?|천\s?)?원/g;
const SENTENCE_SPLIT = /[.!?](?=\s|$)|\n/;

/**
 * A sentence computes with an amount: arithmetic words or a computed-value mark, or several amounts where one is not
 * any known fact value (e.g. '한 개 4,500원, 열 개면 45,000원'). Two plain facts side by side ('가격 4,500원과 재료비 1,350원') do not.
 */
function isComputedSentence(sentence: string, known: ReadonlySet<number>): boolean {
  if (ARITHMETIC.test(sentence) || COMPUTED.test(sentence)) return true;
  const amounts = sentence.match(AMOUNT) ?? [];
  return amounts.length >= 2 && amounts.some(text => { const value = parseWon(text); return value === null || !known.has(value); });
}

/** A block (paragraph, list item, heading) is left whole when any of its sentences computes. */
export function blockComputes(block: string, known: ReadonlySet<number> = new Set()): boolean {
  return block.split(SENTENCE_SPLIT).some(sentence => isComputedSentence(sentence, known));
}

/**
 * Swaps amounts in one run of plain prose. An amount is swapped only when the words right before it name that fact
 * (amountOwner) — a computed value that happens to equal the old amount is left alone. "17,500원" never matches inside
 * "117,500원", nor "7,500원" inside "17,500원". Blocks that compute with the amount are skipped by the callers (blockComputes).
 * `context` is the text before this run in the same block (HTML inline tags split a sentence).
 */
function swapProse(text: string, context: string, swaps: Swap[]): string {
  const hits: Array<{ at: number; end: number; swap: Swap }> = [];
  for (const swap of swaps) {
    for (const match of text.matchAll(new RegExp(`(?<![\\d,.])${escape(swap.from)}`, "g"))) {
      const at = match.index ?? 0, end = at + swap.from.length;
      if (hits.some(hit => at < hit.end && end > hit.at)) continue;
      const owner = amountOwner(`${context}${text.slice(0, at)}`);
      if (owner !== swap.id && owner !== OWNER_BY_VALUE) continue;
      hits.push({ at, end, swap });
    }
  }
  if (!hits.length) return text;
  hits.sort((a, b) => a.at - b.at);
  let out = "", cursor = 0;
  for (const hit of hits) { out += text.slice(cursor, hit.at) + hit.swap.to; cursor = hit.end; }
  return out + text.slice(cursor);
}

/**
 * Markdown: prose lines only — table rows, chart fences and code are computed or quoted, never touched. Lines are grouped
 * into blocks (a paragraph runs until a blank line; each heading and each list item is its own block) and a block that
 * computes is left whole.
 */
function swapMarkdown(markdown: string, swaps: Swap[], known: ReadonlySet<number>): string {
  const lines = markdown.split("\n");
  const blockOf: number[] = [];
  let fenced = false, block = 0, open = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; blockOf.push(-1); open = false; continue; }
    if (fenced || /^\s*\|/.test(line) || !line.trim()) { blockOf.push(-1); open = false; continue; }
    const heading = /^\s*#{1,6}\s/.test(line);
    if (!open || heading || /^\s*(?:[-*+]|\d+[.)])\s/.test(line) || /^\s*>/.test(line)) block += 1;
    blockOf.push(block);
    open = !heading;
  }
  const computed = new Set<number>();
  for (const id of new Set(blockOf)) {
    if (id >= 0 && blockComputes(lines.filter((_, index) => blockOf[index] === id).join("\n"), known)) computed.add(id);
  }
  return lines.map((line, index) => blockOf[index] < 0 || computed.has(blockOf[index]) ? line : swapProse(line, "", swaps)).join("\n");
}

/** HTML: text between tags, outside tables, charts and code. Block tags start a new block; inline tags keep it. */
function swapHtml(html: string, swaps: Swap[], known: ReadonlySet<number>): string {
  const token = /<(table|figure|svg|pre|code)\b[\s\S]*?<\/\1\s*>|<[^>]*>/gi;
  // 먼저 덩어리(문단·제목·목록 칸)별로 글을 모은다 — 문장이 굵은 글씨 같은 태그로 나뉘어도 덩어리 전체를 보게
  const parts: Array<{ text: string; tag: string; block: number }> = [];
  let block = 0, last = 0;
  for (const match of html.matchAll(token)) {
    const at = match.index ?? 0;
    parts.push({ text: html.slice(last, at), tag: match[0], block });
    if (match[1] || /^<\/?(?:p|li|ul|ol|h[1-6]|div|br|tr|td|th|blockquote|section|article)\b/i.test(match[0])) block += 1;
    last = at + match[0].length;
  }
  parts.push({ text: html.slice(last), tag: "", block });
  const blockText = new Map<number, string>();
  for (const part of parts) blockText.set(part.block, `${blockText.get(part.block) ?? ""}${part.text}`);
  const computed = new Set([...blockText].filter(([, text]) => blockComputes(text, known)).map(([id]) => id));
  let out = "";
  parts.forEach((part, index) => {
    if (computed.has(part.block)) { out += part.text + part.tag; return; }
    const context = parts.slice(0, index).filter(other => other.block === part.block).map(other => other.text).join("");
    out += swapProse(part.text, context, swaps) + part.tag;
  });
  return out;
}

/**
 * Swaps changed amounts in every AI-written section (sections the owner edited by hand are left alone).
 * Only amounts in prose that clearly name the fact are swapped; tables, charts and computed values wait for
 * "계획서에 반영하기". An amount shared by two facts is ambiguous and skipped. Returns the number of sections changed.
 */
export function patchDocumentAmounts(plan: Pick<ServerPlan, "sections">, before: Record<string, { value?: unknown } | undefined>, after: Record<string, { value?: unknown } | undefined>, at: string): number {
  const swaps: Swap[] = [];
  // 사실로 적힌 금액(바꾸기 전·후) — 이 밖의 금액이 같은 문장에 또 있으면 계산된 값으로 본다
  const known = new Set(PATCHABLE_AMOUNT_IDS.flatMap(id => [amount(before[id]?.value), amount(after[id]?.value)]).filter((value): value is number => value !== null));
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
    if (typeof markdown === "string") markdown = swapMarkdown(markdown, swaps, known);
    if (typeof html === "string") html = swapHtml(html, swaps, known);
    if (markdown === section.markdown && html === section.html) continue;
    section.markdown = markdown; section.html = html;
    // A newer stamp keeps an older browser copy of the section from overwriting the swap on merge.
    section.generatedAt = at > section.generatedAt ? at : new Date(Date.parse(section.generatedAt) + 1).toISOString();
    changed++;
  }
  return changed;
}
