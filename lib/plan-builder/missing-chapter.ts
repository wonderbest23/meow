/*
 * 만들어지지 않은 장을 가리키는 문장을 지운다(2026-11-15 사장님).
 * 장들은 동시에 쓰면서 "자세한 내용은 '○○' 장에 있습니다"처럼 서로를 이름으로 가리킨다 — 한 장이 두 번 거절돼 빠지면
 * 가리키는 문장만 남았다(실측 2026-11-14 쿠키 계획서: 없는 '12주 할 일과 매달 볼 숫자' 장을 7번 가리킴).
 * 규칙으로만 한다(AI 호출 없음). 저장된 글은 바꾸지 않고 보여 줄 때 · 내려받을 때만 뺀다 — 장을 다시 만들면 문장도 돌아온다.
 */
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 문단 하나에서 빠진 장 이름을 따옴표로 가리키는 문장만 뺀다 */
function dropFromBlock(block: string, pattern: RegExp): string {
  if (!pattern.test(block)) return block;
  return block.split(/(?<=[.!?])\s+/).filter(sentence => !pattern.test(sentence)).join(" ").trim();
}

export function dropMissingReferences(text: string, missingTitles: string[], format: "markdown" | "html"): string {
  const titles = missingTitles.filter(Boolean);
  if (!titles.length || !text) return text;
  // '○○' 장 · ‘○○’ 장 · "○○" 장 — 따옴표로 묶어 장이라고 부른 것만(같은 낱말이 본문에 그냥 나온 것은 두다)
  // 저장된 HTML 은 따옴표가 &#39; · &quot; 로 바뀌어 있다(화면에서 문장이 안 빠져서 알았다)
  const quote = `(?:['‘’"“”]|&#39;|&apos;|&quot;)`;
  const pattern = new RegExp(`${quote}(?:${titles.map(escape).join("|")})${quote}\\s*(?:<\\/[a-z]+>\\s*)?장`);
  if (!pattern.test(text)) return text;
  if (format === "html") return text.replace(/<(p|li)>([\s\S]*?)<\/\1>/g, (whole, tag: string, inner: string) => {
    const kept = dropFromBlock(inner, pattern);
    return kept === inner ? whole : kept ? `<${tag}>${kept}</${tag}>` : "";
  });
  return text.split("\n").map(line => {
    // 표 · 제목 줄은 건드리지 않는다(칸이 비면 표가 깨진다)
    if (/^\s*(\||#)/.test(line) || !pattern.test(line)) return line;
    const bullet = /^(\s*(?:[-*]|\d+\.)\s+)/.exec(line)?.[1] ?? "";
    const kept = dropFromBlock(line.slice(bullet.length), pattern);
    return kept ? bullet + kept : null;
  }).filter((line): line is string => line !== null).join("\n").replace(/\n{3,}/g, "\n\n");
}
