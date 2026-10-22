import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { lexPlanMarkdown, renderPlanMarkdown } from "../lib/plan-builder/markdown";
import { restoreRangeTildes } from "../lib/plan-builder/range-tildes";
import { isAmountCell, isShortCell } from "../lib/plan-builder/table-cells";
import { splitCircledSteps } from "../lib/plan-builder/text-steps";
import { editExamples } from "../lib/plan-builder/edit-examples";
import { renderDocx, renderPdf } from "../lib/delivery/document-renderer";
import { wrapPdfText } from "../lib/delivery/lightweight-pdf";
import type { Tokens } from "marked";

async function main() {
  // 1. Ranges never become strikethrough (real AI plan 2026-10-22: '2~3곳 … 각 2~3곳' read as '23곳').
  const cell = "출근 방향 위에 있는 상가 후보 2~3곳을 봅니다. 월세·보증금 견적과 설비 견적(새것·중고 각 2~3곳)을 받습니다";
  const markdown = [
    "## 12주 할 일",
    "",
    "| 주차 | 할 일 | 비용 |",
    "| --- | --- | --- |",
    `| 8주 | ${cell} | 10~20만원 |`,
    "",
    "예산은 10~20만원이고 9~10월에 엽니다. 후보 2~3곳, 각 2~3곳.",
  ].join("\n");
  const html = await renderPlanMarkdown(markdown);
  assert.ok(!/<(del|s)>/.test(html), "no strikethrough on screen");
  assert.ok(html.includes(cell), "the cell text keeps both ranges");
  assert.ok(html.includes("10~20만원이고 9~10월에 엽니다. 후보 2~3곳, 각 2~3곳."));
  const tokens = lexPlanMarkdown(markdown);
  const walk = (list: unknown[]): boolean => list.some(token => { const t = token as { type?: string; tokens?: unknown[]; header?: Array<{ tokens: unknown[] }>; rows?: Array<Array<{ tokens: unknown[] }>> }; return t.type === "del" || (!!t.tokens && walk(t.tokens)) || (!!t.header && walk(t.header.flatMap(c => c.tokens))) || (!!t.rows && walk(t.rows.flat().flatMap(c => c.tokens))); });
  assert.equal(walk(tokens), false, "PDF/Word lexer has no strikethrough tokens");
  const table = tokens.find(token => token.type === "table") as Tokens.Table;
  assert.equal(table.rows[0][1].text, cell);
  // Legacy stored html (made before this fix) is shown with its tildes back.
  assert.equal(restoreRangeTildes("<td>후보 2<del>3곳을 봅니다. 견적(각 2</del>3곳)</td>"), "<td>후보 2~3곳을 봅니다. 견적(각 2~3곳)</td>");
  assert.equal(restoreRangeTildes("<p>그대로</p>"), "<p>그대로</p>");

  const font = readFileSync("public/fonts/NanumGothic-Regular.ttf");
  const project = { title: "아파트 상가 아침 빵집", sector: "빵집", model: "일반 사업계획서", customer: "-", generatedAt: "2026-10-22T00:00:00.000Z", sample: false };
  const doc = { id: "plan", title: "아파트 상가 아침 빵집", type: "일반 사업계획서", versionLabel: "초안", markdown: `# 제목\n\n${markdown}\n\n| 월 | 통장 누적 |\n| --- | --- |\n| 1개월차 | 450원 |\n| 2개월차 | 900원 |\n\n\`\`\`plan-chart\n{"kind":"cumulative","title":"조심스러운 경우 통장 누적","points":[{"label":"1개월차","value":450},{"label":"2개월차","value":900}],"breakEvenMonth":null,"paybackMonth":null}\n\`\`\`` };
  const docx = await renderDocx([doc], project, font);
  const xml = await (await JSZip.loadAsync(docx)).file("word/document.xml")!.async("string");
  assert.ok(!xml.includes("<w:strike"), "no strikethrough in Word");
  assert.ok(xml.includes("2~3곳을 봅니다") && xml.includes("각 2~3곳"), "Word keeps both ranges");
  assert.ok(xml.includes("조심스러운 경우 통장 누적"), "Word chart has its title");
  assert.ok(/<w:jc w:val="right"\/><\/w:pPr><w:r>(?:(?!<\/w:p>).)*450원/.test(xml), "Word right-aligns an amount column");
  assert.ok((await renderPdf([doc], project, font)).subarray(0, 5).toString() === "%PDF-", "PDF renders");

  // 5. PDF line breaks: no line starts with closing punctuation; words are not split when a space is available.
  const sentence = "그 짧은 순간에 갓 구운 빵을 기다리지 않고 집어 갈 수 있으면 우리 가게를 고를 이유가 생깁니다. 손님이 몇 시에 지나가는지는 아직 기록이 없습니다.";
  for (const width of [120, 160, 200, 240, 300, 360, 420, 487]) {
    const lines = wrapPdfText(font, sentence, width, 10);
    assert.equal(lines.join(" "), sentence, `nothing is lost at ${width}pt`);
    for (const line of lines) assert.ok(!/^[.,)」』%]/.test(line), `line starts with punctuation at ${width}pt: ${line}`);
  }
  for (const width of [30, 34, 38, 42, 46]) {
    for (const line of wrapPdfText(font, "생깁니다.(확인필요)", width, 10)) assert.ok(!/^[.,)]/.test(line) && !/\($/.test(line), `char-level break keeps punctuation attached at ${width}pt: ${line}`);
  }

  // 2/3. Table cells: short numeric cells stay on one line on phones; long prose wraps; amounts align right.
  assert.equal(isShortCell("4,500원"), true);
  assert.equal(isShortCell("1,350원 → 2,700원"), true);
  assert.equal(isShortCell("약 4시간"), true);
  assert.equal(isShortCell(cell), false);
  assert.equal(isAmountCell("12주"), false, "a period label is not an amount column");
  const amounts = await renderPlanMarkdown("| 월 | 통장 누적 |\n| --- | --- |\n| 1개월차 | **450원** |\n| 2개월차 | 900원 |");
  assert.ok(amounts.includes('<td align="right" data-short><strong>450원</strong></td>'), "amount column is right-aligned on screen too");
  assert.ok(amounts.includes("<td data-short>1개월차</td>"), "the label column stays left");

  // 6. Workspace summary steps.
  const split = splitCircledSteps("소량 굽는 안이에요. 운영 순서는 ① 단지 직장인이 몇 시에 사는지 확인 ② 원가 시험 ③ 네이버 플레이스에 가게 등록이에요.");
  assert.deepEqual(split, { intro: "소량 굽는 안이에요. 운영 순서예요.", steps: ["① 단지 직장인이 몇 시에 사는지 확인", "② 원가 시험", "③ 네이버 플레이스에 가게 등록"], outro: "" });
  // Real AI summary 2026-10-22 2nd check: advice after the last step is its own paragraph; the intro does not end on '는:'.
  const real = splitCircledSteps("메뉴는 말씀하신 식빵·소금빵 두 가지만, 한 개 4,500원으로 시작해요. 운영 순서는 ① 전날 반죽·발효 준비 ② 출근 시간 전에 굽기 ③ 아침 출근 시간대에 매장에서 판매 ④ 네이버 플레이스에 굽는 시간과 판매 요일 안내 ⑤ 매일 판매량과 남은 빵 기록이에요. 대표님 혼자, 주 10시간 안에서 운영하려면 매일 문을 열기보다 주 며칠 아침만 여는 방식부터 따져 보는 게 좋아요");
  assert.equal(real?.intro, "메뉴는 말씀하신 식빵·소금빵 두 가지만, 한 개 4,500원으로 시작해요. 운영 순서예요.");
  assert.equal(real?.steps.at(-1), "⑤ 매일 판매량과 남은 빵 기록");
  assert.equal(real?.outro, "대표님 혼자, 주 10시간 안에서 운영하려면 매일 문을 열기보다 주 며칠 아침만 여는 방식부터 따져 보는 게 좋아요.");
  assert.ok(!real?.intro.endsWith(":"));
  assert.equal(splitCircledSteps("단계 없는 설명이에요."), null);

  // 7. Chat edit example follows the plan's own price.
  assert.equal(editExamples(4500)[0], "가격을 5,000원으로 바꿔줘");
  assert.equal(editExamples(65000)[0], "가격을 72,000원으로 바꿔줘");
  assert.ok(!editExamples(null).some(text => text.includes("가격")), "no made-up price when the plan has none");
  console.log("document render: ranges, legacy tildes, Word/PDF output, Korean line breaks, table cells, summary steps and edit examples passed");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
