// 채점: 꼭 있어야 하는 칸(must) · 있으면 안 되는 칸(mustNot) · 모름 처리(unknown) · 뜻 분류(intent) · 근거 말이 실제 글에 있는지(quote)
const fs = require("fs"), d = __dirname;
const cases = JSON.parse(fs.readFileSync(d + "/cases.json", "utf8")), exp = JSON.parse(fs.readFileSync(d + "/expected.json", "utf8"));
const file = process.argv[2]; const out = JSON.parse(fs.readFileSync(d + "/" + file, "utf8"));
let pass = 0; const rows = [];
for (const e of exp) {
  const c = cases.find(x => x.id === e.id), o = out.find(x => x.id === e.id) || { updates: [], unknown: [] };
  const ups = o.updates || [], unk = o.unknown || [], why = [];
  for (const [key, want] of Object.entries(e.must)) {
    const fields = key.split("|"); const got = ups.find(u => fields.includes(u.field));
    if (!got) { why.push(`${key} 없음`); continue; }
    const ok = Array.isArray(want) ? typeof got.value === "number" && got.value >= want[0] && got.value <= want[1] : typeof want === "number" ? Number(got.value) === want : String(got.value).includes(want);
    if (!ok) why.push(`${key}=${JSON.stringify(got.value)} (기대 ${JSON.stringify(want)})`);
  }
  for (const f of e.mustNot || []) if (ups.some(u => u.field === f)) why.push(`${f} 를 잘못 채움(${JSON.stringify(ups.find(u => u.field === f).value)})`);
  for (const f of e.unknown || []) if (!unk.includes(f)) why.push(`${f} 모름 처리 안 함`);
  for (const f of e.ask || []) if (!(o.ask || []).includes(f)) why.push(`${f} 를 되묻지 않음`);
  for (const f of e.notUnknown || []) if (unk.includes(f)) why.push(`${f} 를 모름으로 처리`);
  if (e.intent && o.intent !== e.intent) why.push(`뜻 분류 ${o.intent} (기대 ${e.intent})`);
  for (const u of ups) if (!u.quote || !c.message.includes(String(u.quote).trim())) why.push(`${u.field} 근거 말이 글에 없음("${u.quote}")`);
  if (!why.length) pass++;
  rows.push({ id: e.id, message: c.message, ok: !why.length, why: why.join("; "), got: ups.map(u => `${u.field}=${u.value}`).join(", ") + (unk.length ? ` | 모름:${unk.join(",")}` : "") + ((o.ask || []).length ? ` | 되물음:${o.ask.join(",")}` : "") + ` | ${o.intent}` });
}
console.log(file, `${pass}/${exp.length}`);
for (const r of rows.filter(r => !r.ok)) console.log(`  ✗ ${r.id} "${r.message}" → ${r.got}\n      ${r.why}`);
fs.writeFileSync(d + "/graded-" + file, JSON.stringify(rows, null, 1));
