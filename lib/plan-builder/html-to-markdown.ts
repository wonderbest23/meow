// 인라인 편집 결과(HTML) → 마크다운 역변환.
// 플랜의 원본 형식은 마크다운이고 PDF·DOCX가 거기서 나오므로,
// 편집기가 만든 HTML을 다시 마크다운으로 되돌려 저장한다.

import TurndownService from "turndown";
// @ts-expect-error - turndown-plugin-gfm에는 타입 선언이 없다
import { tables, strikethrough } from "turndown-plugin-gfm";
import { CHART_FENCE_LANG } from "./chart";

function createService(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx", // # 스타일 — 우리 생성기와 같은 형식
    bulletListMarker: "-",
    codeBlockStyle: "fenced",
    emDelimiter: "*",
    strongDelimiter: "**",
    hr: "---",
  });

  // 표와 취소선은 GFM 플러그인으로 (문서에 표가 많다)
  td.use([tables, strikethrough]);

  // 차트는 편집 대상이 아니다 — figure를 원래 펜스로 되돌린다.
  td.addRule("planChart", {
    filter: (node) =>
      node.nodeName === "FIGURE" && (node as HTMLElement).classList.contains("plan-chart-figure"),
    replacement: (_content, node) => {
      const spec = (node as HTMLElement).getAttribute("data-chart-spec");
      if (!spec) return "";
      return `\n\n\`\`\`${CHART_FENCE_LANG}\n${spec}\n\`\`\`\n\n`;
    },
  });

  // 빈 문단이 \n\n으로 뭉개지지 않게
  td.addRule("emptyParagraph", {
    filter: (node) => node.nodeName === "P" && !node.textContent?.trim() && !node.querySelector("img"),
    replacement: () => "",
  });

  return td;
}

/**
 * 편집기가 내놓는 HTML을 turndown이 알아들을 수 있게 다듬는다.
 * - <colgroup>: 이게 <tbody> 앞에 있으면 GFM 표 규칙이 헤더 행을 인식하지 못해
 *   표 전체가 HTML로 남는다.
 * - <li><p>…</p></li>: 목록 항목마다 빈 줄이 끼어든다.
 * - <th><p>…</p></th>: 셀 안에 문단이 있으면 표가 깨진다.
 */
function tidyEditorHtml(html: string): string {
  if (typeof window === "undefined" || typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll("colgroup").forEach((el) => el.remove());

  doc.querySelectorAll("li, th, td").forEach((el) => {
    // 자식이 문단 하나뿐이면 벗긴다
    if (el.children.length === 1 && el.firstElementChild?.tagName === "P") {
      el.innerHTML = el.firstElementChild.innerHTML;
    }
  });

  return doc.body.innerHTML;
}

let service: TurndownService | null = null;

/**
 * turndown은 목록 마커 뒤에 공백 3칸을 넣는다("-   항목").
 * 우리 생성기는 "- 항목" 형식이라, 최상위 항목만 한 칸으로 줄여 형식을 맞춘다.
 * 중첩 항목은 들여쓰기가 의미를 가지므로 건드리지 않는다.
 */
function normalizeListMarkers(md: string): string {
  return md
    .replace(/^([-*+]) {3}/gm, "$1 ")
    .replace(/^(\d+\.) {2}/gm, "$1 ");
}

/** HTML을 마크다운으로 되돌린다. */
export function htmlToMarkdown(html: string): string {
  if (!service) service = createService();
  const md = service.turndown(tidyEditorHtml(html));
  return normalizeListMarkers(md)
    .replace(/\n{3,}/g, "\n\n") // 빈 줄 3개 이상은 2개로
    .trim();
}
