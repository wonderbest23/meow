/*
 * 예시의 발표자료(PPTX)를 미리 구워 public/samples 에 둔다.
 *
 * 슬라이드 구성은 AI 가 만든다 — 로컬에는 열쇠가 없어서 운영에서
 * /api/plan/deck 을 planOnly 로 불러 JSON 만 받아 두고(scratchpad/deck-plans.json),
 * 파일로 굽는 일만 여기서 한다. 굽기는 AI 를 부르지 않으므로 몇 번을 돌려도
 * 돈이 들지 않는다.
 *
 *   npx tsx scripts/bake-sample-decks.mts <구성JSON경로>
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { renderDeckPptx } from "../lib/plan-builder/deck-render";
import { pickDeckTheme } from "../lib/plan-builder/deck-themes";

const src = process.argv[2];
if (!src) throw new Error("구성 JSON 경로를 넘겨라");
const plans = JSON.parse(readFileSync(src, "utf-8")) as Record<string, { planType: string; plan: any }>;

mkdirSync("public/samples", { recursive: true });
for (const [id, { planType, plan }] of Object.entries(plans)) {
  const theme = pickDeckTheme(planType, plan.brandName ?? "", "");
  const buffer = await renderDeckPptx(plan, theme);
  writeFileSync(`public/samples/${id}.pptx`, buffer);
  console.log(`${id} — ${plan.slides.length}장 · ${Math.round(buffer.length / 1024)}KB`);
}
