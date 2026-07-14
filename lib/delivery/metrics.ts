import { marked, type Token, type Tokens } from "marked";

function tokenText(token: Token): string {
  if (token.type === "list") return (token as Tokens.List).items.map((item) => item.tokens.map(tokenText).join(" ")).join(" ");
  if (token.type === "table") {
    const table = token as Tokens.Table;
    return [...table.header, ...table.rows.flat()].map((cell) => cell.tokens.map(tokenText).join(" ")).join(" ");
  }
  if ("tokens" in token && Array.isArray(token.tokens)) return token.tokens.map(tokenText).join(" ");
  if ("text" in token) return String(token.text);
  return "";
}

export function deliveryDocumentMetrics(document: { markdown: string }) {
  const tokens = marked.lexer(document.markdown, { gfm: true });
  const characters = tokens.map(tokenText).join(" ").replace(/\s/g, "").length;
  const sections = tokens.filter((token) => token.type === "heading" && token.depth >= 2).length;
  const tables = tokens.filter((token) => token.type === "table").length;
  return {
    characters,
    sections,
    tables,
    estimatedPages: Math.max(2, Math.ceil(characters / 1050) + 1),
  };
}
