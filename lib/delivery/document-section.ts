import { lexer } from "marked";

export function withoutRepeatedSectionHeading(markdown: string, sectionTitle: string): string {
  const source = markdown.trimStart(), first = lexer(source)[0];
  const normalize = (value: string) => value.replace(/[*_`]/g, "").replace(/\s+/g, "").trim();
  if (first?.type !== "heading" || normalize(first.text) !== normalize(sectionTitle)) return markdown;
  return source.slice(first.raw.length).trimStart();
}
