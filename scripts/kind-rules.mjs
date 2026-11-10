#!/usr/bin/env node
/*
 * 세부 업종 규칙 검사·묶기 (형식은 data/ksic/kinds/README.md). 의존성 없이 node만으로 돈다 — 규칙을 쓰는 쪽에서 바로 돌릴 수 있게.
 *   node scripts/kind-rules.mjs check data/ksic/kinds/03.tsv
 *   node scripts/kind-rules.mjs build      → data/ksic/kind-rules.json
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { basename } from "node:path";

const DIR = "data/ksic/kinds", OUT = "data/ksic/kind-rules.json";
const FACTOR = { "하루": 26, "일주일": 4.3, "한 달": 1 };
// 어디에나 붙어 업종을 가리지 못하는 말
const STOP = new Set("가게 매장 점포 사업 창업 판매 서비스 온라인 오프라인 전문점 업체 회사 제품 상품 제조 도매 소매 기타 배달 공장 대행 대여 수리 교육 학원 카페 식당 음식점 쇼핑몰 프랜차이즈 무인 방문 출장 예약 동네 수제 중고".split(" "));
// 워커 묶음 한도(10MB gzip)에 여유가 1MB 남짓이라 이 파일이 그 절반을 넘지 않게 막는다
const MAX_GZIP = 600_000;

const todo = new Map();
for (const file of readdirSync(`${DIR}/todo`)) for (const line of readFileSync(`${DIR}/todo/${file}`, "utf8").split("\n").slice(1)) {
  const [code, name, , , revenue] = line.split("\t");
  if (code) todo.set(code, { name, revenue, batch: file.slice(0, 2) });
}

function read(path) {
  const batch = basename(path).slice(0, 2), errors = [], rows = [], seen = new Map(), skipped = new Set();
  readFileSync(path, "utf8").split("\n").forEach((line, index) => {
    const at = `${basename(path)}:${index + 1}`, bad = message => errors.push(`${at} ${message}`);
    const skip = line.match(/^#\s*skip\s+(\d{5})/);
    if (skip) skipped.add(skip[1]);
    if (!line.trim() || line.startsWith("#")) return;
    const cells = line.split("\t").map(cell => cell.trim());
    if (cells.length !== 10) return bad(`칸이 ${cells.length}개 (10개여야 함)`);
    const [code, offer, wordList, customer, problem, channel, p, u, c, capacity] = cells;
    const target = todo.get(code);
    if (!target || target.batch !== batch) return bad(`${code}: 이 묶음 todo에 없는 코드`);
    for (const [label, text, min, max] of [["offer", offer, 2, 30], ["customer", customer, 4, 40], ["problem", problem, 4, 50], ["channel", channel, 2, 30]])
      if ([...text].length < min || [...text].length > max || /[{}"\\]/.test(text)) bad(`${label} '${text}': ${min}~${max}자, 따옴표·중괄호 없이`);
    const words = wordList.split(",").map(word => word.trim()).filter(Boolean);
    if (words.length < 3 || words.length > 15) bad(`낱말 ${words.length}개 (3~15개)`);
    for (const word of words) {
      if (!/^[가-힣a-z0-9]{2,12}$/.test(word)) bad(`낱말 '${word}': 한글·영소문자·숫자 2~12자, 띄어쓰기 없이`);
      else if (STOP.has(word)) bad(`낱말 '${word}': 업종을 가리지 못하는 말`);
      else if (seen.has(word)) bad(`낱말 '${word}': ${seen.get(word)}줄과 겹침`);
      else seen.set(word, index + 1);
    }
    const [price, unitCost, cost] = [p, u, c].map(text => /^\d+$/.test(text) ? Number(text) : NaN);
    const amount = capacity.match(/^(하루|일주일|한 달) ([\d,]+)([가-힣·]+)$/);
    if (![price, unitCost, cost].every(Number.isFinite) || !amount) return bad("숫자 칸은 정수, capacity는 '하루 40그릇' 꼴");
    const volume = Math.round(Number(amount[2].replace(/,/g, "")) * FACTOR[amount[1]]), profit = volume * (price - unitCost) - cost;
    if (price < 100 || unitCost >= price || cost < 100_000) bad("price ≥ 100, unitCost < price, cost ≥ 10만원");
    else if (profit <= 0) bad(`적자: 한 달 ${volume} × (${price} − ${unitCost}) ≤ ${cost}`);
    else if (profit > 20_000_000 || volume * price > 100_000_000) bad(`과장: 한 달 남는 돈 ${profit.toLocaleString()}원 / 매출 ${(volume * price).toLocaleString()}원`);
    if (["subscription", "project", "commission"].includes(target.revenue) && amount[1] !== "한 달") bad(`${target.revenue} 분류는 capacity가 '한 달 N…'`);
    if (target.revenue === "subscription" && amount[3] !== "명") bad("subscription 분류는 capacity 단위가 '명'");
    if (target.revenue === "per_hour" && amount[3] !== "시간") bad("per_hour 분류는 capacity 단위가 '시간'");
    rows.push({ code, offer, words, customer, problem, channel, price, unitCost, cost, capacity });
  });
  const covered = new Set(rows.map(row => row.code));
  const missing = [...todo].filter(([code, target]) => target.batch === batch && !covered.has(code) && !skipped.has(code)).map(([code, target]) => `${code} ${target.name}`);
  return { rows, errors, missing, skipped: skipped.size };
}

const [command, file] = process.argv.slice(2);
if (command === "check" && file) {
  const { rows, errors, missing, skipped } = read(file);
  errors.slice(0, 40).forEach(error => console.log(error));
  if (missing.length) console.log(`줄도 '# skip'도 없는 분류 ${missing.length}개:\n  ${missing.join("\n  ")}`);
  console.log(`${rows.length}줄 · 낱말 ${rows.reduce((sum, row) => sum + row.words.length, 0)}개 · skip ${skipped}개 · 오류 ${errors.length}개 · 빠진 분류 ${missing.length}개`);
  process.exit(errors.length || missing.length ? 1 : 0);
} else if (command === "build") {
  const all = [], errors = [];
  for (const name of readdirSync(DIR).filter(name => /^\d\d\.tsv$/.test(name)).sort()) { const batch = read(`${DIR}/${name}`); all.push(...batch.rows); errors.push(...batch.errors); }
  if (errors.length) { errors.slice(0, 40).forEach(error => console.log(error)); console.log(`오류 ${errors.length}개 — 묶지 않음`); process.exit(1); }
  // 같은 낱말을 여러 분류가 가리키면 손님을 직접 만나는 쪽(소매·음식·서비스, 45 이상)을 앞에 둔다 — '빵집'은 빵 공장보다 빵 가게다
  const order = all.map((row, index) => index).sort((a, b) => (all[a].code < "45" ? 1 : 0) - (all[b].code < "45" ? 1 : 0) || a - b);
  const words = {};
  for (const index of order) for (const word of all[index].words) if ((words[word] ??= []).length < 3) words[word].push(index);
  const json = JSON.stringify({ rows: all.map(row => [row.code, row.offer, row.customer, row.problem, row.channel, row.price, row.unitCost, row.cost, row.capacity]), words });
  const gzip = gzipSync(json).length;
  console.log(`${all.length}줄 · 낱말 ${Object.keys(words).length}개 · ${(json.length / 1024).toFixed(0)}KB(글자 수) · gzip ${(gzip / 1024).toFixed(0)}KB`);
  if (gzip > MAX_GZIP) { console.log(`gzip ${gzip} > ${MAX_GZIP} — 묶음이 너무 큼`); process.exit(1); }
  writeFileSync(OUT, json + "\n");
} else { console.log("사용: node scripts/kind-rules.mjs check <NN.tsv> | build"); process.exit(1); }
