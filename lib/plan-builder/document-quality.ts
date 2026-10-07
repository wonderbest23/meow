import { lexer } from "marked";
import { parseAmount } from "./financials";

export type DocumentQualityIssue = { code: "empty_body" | "empty_heading" | "empty_table_cell" | "duplicate_paragraph" | "unsupported_number" | "unsupported_url" | "missing_structure"; severity: "error" | "warning"; detail: string };
export type DocumentQualityResult = { ok: boolean; issues: DocumentQualityIssue[] };

function quantities(text: string): string[] {
  return quantityMatches(text).map(item => item.value);
}

/** Every KRW/percent amount in the text, as written and as a comparable value ("7500:원"). */
function quantityMatches(text: string): Array<{ raw: string; value: string }> {
  const values: Array<{ raw: string; value: string }> = [];
  const pattern = /[+-]?\d[\d,]*(?:\.\d+)?(?:\s*(?:억|천|백|만)(?:\s*\d[\d,]*(?:\.\d+)?)?)*\s*(?:원|%|퍼센트)/g;
  for (const match of text.matchAll(pattern)) {
    const token = match[0].replace(/\s/g, "");
    const unit = token.match(/(?:원|%|퍼센트)$/)?.[0] ?? "";
    const numeric = token.replace(/(?:원|%|퍼센트)$/, "");
    const unsigned = numeric.replace(/^[-+]/, "");
    const magnitude = unit === "%" || unit === "퍼센트"
      ? Number(unsigned.replace(/,/g, ""))
      : /^[\d,.]+$/.test(unsigned) ? Number(unsigned.replace(/,/g, "")) : parseAmount(unsigned);
    if (magnitude != null && Number.isFinite(magnitude)) values.push({ raw: match[0].trim(), value: `${numeric.startsWith("-") ? -magnitude : magnitude}:${unit === "퍼센트" ? "%" : unit}` });
  }
  return values;
}

/** KRW/percentage equality and structural checks only; counts, dates and semantic claims still require review. */
export function checkDocumentQuality(markdown: string, source: string, priorSections: string[] = []): DocumentQualityResult {
  const issues: DocumentQualityIssue[] = [];
  const issue = (code: DocumentQualityIssue["code"], detail: string, severity: "error" | "warning" = "error") => issues.push({ code, severity, detail });
  const text = markdown.trim();
  const plain = text.replace(/^#{1,6}\s.*$/gm, "").replace(/[\s|:*_`#-]/g, "");
  if (plain.length < 30) issue("empty_body", "실질적인 본문이 부족합니다.");
  const blocks = lexer(text);
  for (const [index, block] of blocks.entries()) {
    if (block.type !== "heading") continue;
    let hasBody = false;
    // A parent heading may introduce child sections without a direct paragraph.
    for (const following of blocks.slice(index + 1)) {
      if (following.type === "heading" && following.depth <= block.depth) break;
      if (!["heading", "space", "hr"].includes(following.type) && following.raw.trim()) {
        hasBody = true;
        break;
      }
    }
    if (!hasBody) issue("empty_heading", "내용이 없는 소제목이 있습니다.");
  }
  for (const line of text.split("\n")) {
    if (!line.trim().startsWith("|") || /^\s*\|?\s*:?-/.test(line)) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/);
    if (cells.some(cell => !cell.trim())) issue("empty_table_cell", "표의 빈 항목은 미입력 여부를 명시해야 합니다.");
  }
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const paragraphs = (value: string) => value.split(/\n\s*\n/).map(normalize).filter(p => p.length >= 60 && !/^[#|]/.test(p));
  const seen = new Set(priorSections.flatMap(paragraphs));
  for (const paragraph of paragraphs(text)) {
    if (seen.has(paragraph)) issue("duplicate_paragraph", "같은 문단이 반복되거나 다른 항목에서 복사되었습니다.");
    seen.add(paragraph);
  }
  const allowed = new Set(quantities(source));
  const missing = [...new Set(quantities(text).filter(value => !allowed.has(value)))];
  if (missing.length) issue("unsupported_number", `입력 또는 시스템 계산에 없는 금액이나 비율이 있습니다: ${missing.slice(0, 8).join(", ")}`);
  for (const url of text.match(/https?:\/\/[^\s<>"\])]+/g) ?? []) if (!source.includes(url)) issue("unsupported_url", "제공된 자료에 없는 출처 주소가 있습니다.");
  if (!/근거|입력|기록|제공|가정/.test(text) || !/행동|확인|실행|검토|다음/.test(text)) issue("missing_structure", "근거와 다음 행동을 함께 확인해야 합니다.", "warning");
  return { ok: !issues.some(item => item.severity === "error"), issues };
}

/**
 * 품질 검사에 걸린 곳을 보완 단계가 고칠 수 있는 지적(본문 인용 + 이유)으로 바꾼다(소유자 결정 2026-10-07).
 * 예전엔 걸리면 섹션을 통째로 버려 이미 쓴 AI 비용이 사라졌고, 새 가격을 제안하는 '가격 전략'이 특히 자주 버려졌다.
 * 인용은 본문에 정확히 한 번 나오는 줄로 잡는다(보완 결과를 그 자리에만 끼우려고). 못 잡는 문제는 넘기지 않는다.
 */
export function qualityRepairIssues(markdown: string, source: string, priorSections: string[] = []): Array<{ quote: string; reason: string }> {
  const text = markdown.trim();
  const lines = text.split("\n");
  const unique = (quote: string) => quote.length > 0 && quote.length <= 1000 && text.indexOf(quote) >= 0 && text.indexOf(quote) === text.lastIndexOf(quote);
  const lineOf = (needle: string) => lines.map(line => line.trim()).find(line => line.includes(needle) && unique(line));
  const out: Array<{ quote: string; reason: string }> = [];
  const add = (quote: string | undefined, reason: string) => { if (quote && unique(quote) && !out.some(item => item.quote === quote)) out.push({ quote, reason }); };
  const allowed = new Set(quantities(source));
  for (const { raw, value } of quantityMatches(text)) {
    if (allowed.has(value)) continue;
    add(lineOf(raw), `"${raw}"은(는) 입력값이나 시스템 계산에 없는 금액·비율입니다. 이 숫자를 지우고, 필요하면 제공 자료에 있는 숫자로만 설명하거나 "금액은 추가 정의 필요"처럼 바꾸세요. 새 숫자를 만들지 마세요.`);
  }
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|") || /^\|?\s*:?-/.test(trimmed)) continue;
    const cells = trimmed.replace(/^\||\|$/g, "").split(/(?<!\\)\|/);
    if (cells.some(cell => !cell.trim())) add(trimmed, "표에 빈 칸이 있습니다. 빈 칸에 \"미입력\" 또는 \"확인 필요\"를 적으세요.");
  }
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const seen = new Set(priorSections.flatMap(section => section.split(/\n\s*\n/).map(normalize)));
  for (const paragraph of text.split(/\n\s*\n/)) {
    const trimmed = paragraph.trim();
    if (normalize(trimmed).length >= 60 && !/^[#|]/.test(trimmed) && seen.has(normalize(trimmed))) add(trimmed, "다른 항목에 똑같이 있는 문단입니다. 이 항목에 필요한 내용만 짧게 다르게 쓰세요.");
  }
  for (const url of text.match(/https?:\/\/[^\s<>"\])]+/g) ?? []) if (!source.includes(url)) add(lineOf(url), "제공된 자료에 없는 출처 주소입니다. 주소를 지우세요.");
  return out.slice(0, 10);
}
