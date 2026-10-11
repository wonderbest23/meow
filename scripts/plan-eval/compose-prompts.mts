/*
 * 세션 안에서 장을 쓰기 위한 지시문 조립 — run.mts --capture-prompts 가 모은 지시문에,
 * 앞 묶음에서 실제로 쓴 장 본문을 운영과 같은 규칙(section-service.ts: 저장 순서대로 잇고 글자 수 한도에서 자름)으로 <prior_sections>에 넣는다.
 *
 *   npx tsx scripts/plan-eval/compose-prompts.mts <capture.json> <outputs 폴더> <내보낼 폴더> <장 키,장 키> [--summary-limit 16000]
 * outputs 폴더: 이미 쓴 장을 '<chapter>__<section>.md' 로 둔다. 재무 장(financials.key)에는 운영처럼 계산 표를 붙여 앞 장 내용으로 쓴다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [capturePath, outputsDir, exportDir, keyList] = process.argv.slice(2);
const summaryLimit = Number(process.argv[process.argv.indexOf("--summary-limit") + 1]) || 4000;
const capture = JSON.parse(readFileSync(capturePath, "utf8")) as { waves: string[][]; prompts: Record<string, { system: string; user: string }>; financials: { key: string; markdown: string } | null };
const fileOf = (key: string) => join(outputsDir, `${key.replace("/", "__")}.md`);
const saved = (key: string) => {
  if (!existsSync(fileOf(key))) return null;
  const body = readFileSync(fileOf(key), "utf8").trim();
  return capture.financials?.key === key && capture.financials.markdown ? `${body}\n\n${capture.financials.markdown}` : body;
};
const order = capture.waves.flat();
mkdirSync(exportDir, { recursive: true });
const systems = new Set(Object.values(capture.prompts).map(prompt => prompt.system));
if (systems.size !== 1) throw new Error(`system prompt differs across chapters (${systems.size})`);
writeFileSync(join(exportDir, "system.md"), [...systems][0]);
for (const key of keyList.split(",")) {
  const prompt = capture.prompts[key];
  if (!prompt) throw new Error(`no captured prompt for ${key}`);
  // 운영: 이 장보다 먼저 저장된 장들(저장 순서), 이 장 제외
  const before = order.slice(0, order.indexOf(key)).map(saved).filter((body): body is string => !!body);
  const limit = key === "summary/roadmap" || key === "summary/executive" ? summaryLimit : 4000;
  const prior = before.join("\n\n").slice(0, limit);
  let user = prompt.user.replace(/<prior_sections>\n[\s\S]*?\n<\/prior_sections>\n?/, "");
  if (prior) user = user.replace("\n</business_data>", `\n<prior_sections>\n${prior}\n</prior_sections>\n</business_data>`);
  if (/\[\[CHAPTER:/.test(user)) throw new Error(`placeholder left in ${key} — write the earlier chapters first`);
  writeFileSync(join(exportDir, `${key.replace("/", "__")}.md`), user);
}
console.log(`[compose] ${keyList} → ${exportDir} (앞 장 ${order.length}개 중 저장된 것 사용, 요약 장 한도 ${summaryLimit}자)`);
