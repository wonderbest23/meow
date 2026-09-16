import { lexer } from "marked";
import { parseAmount } from "./financials";

export type DocumentQualityIssue = { code: "empty_body" | "empty_heading" | "empty_table_cell" | "duplicate_paragraph" | "unsupported_number" | "unsupported_url" | "missing_structure"; severity: "error" | "warning"; detail: string };
export type DocumentQualityResult = { ok: boolean; issues: DocumentQualityIssue[] };

function quantities(text: string): string[] {
  const values: string[] = [];
  const pattern = /[+-]?\d[\d,]*(?:\.\d+)?(?:\s*(?:억|천|백|만)(?:\s*\d[\d,]*(?:\.\d+)?)?)*\s*(?:원|%|퍼센트)/g;
  for (const match of text.matchAll(pattern)) {
    const token = match[0].replace(/\s/g, "");
    const unit = token.match(/(?:원|%|퍼센트)$/)?.[0] ?? "";
    const numeric = token.replace(/(?:원|%|퍼센트)$/, "");
    const unsigned = numeric.replace(/^[-+]/, "");
    const magnitude = unit === "%" || unit === "퍼센트"
      ? Number(unsigned.replace(/,/g, ""))
      : /^[\d,.]+$/.test(unsigned) ? Number(unsigned.replace(/,/g, "")) : parseAmount(unsigned);
    if (magnitude != null && Number.isFinite(magnitude)) values.push(`${numeric.startsWith("-") ? -magnitude : magnitude}:${unit === "퍼센트" ? "%" : unit}`);
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
  if (missing.length) issue("unsupported_number", "입력 또는 시스템 계산에 없는 금액이나 비율이 있습니다.");
  for (const url of text.match(/https?:\/\/[^\s<>"\])]+/g) ?? []) if (!source.includes(url)) issue("unsupported_url", "제공된 자료에 없는 출처 주소가 있습니다.");
  if (!/근거|입력|기록|제공|가정/.test(text) || !/행동|확인|실행|검토|다음/.test(text)) issue("missing_structure", "근거와 다음 행동을 함께 확인해야 합니다.", "warning");
  return { ok: !issues.some(item => item.severity === "error"), issues };
}
