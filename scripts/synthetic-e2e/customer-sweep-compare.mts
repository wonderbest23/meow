// AI 손님 전수 점검 두 번을 나란히 비교한다(AI 0원) — 고치기 전 폴더와 고친 뒤 폴더.
//   node --import tsx scripts/synthetic-e2e/customer-sweep-compare.mts <전 폴더> <후 폴더>
import { readdirSync, readFileSync } from "node:fs";

const [beforeDir, afterDir] = process.argv.slice(2);
if (!beforeDir || !afterDir) throw new Error("two result folders required");
const load = (dir: string) => Object.fromEntries(readdirSync(dir).filter(f => /^[soe]\d\d-.*\.json$/.test(f)).map(f => { const r = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")); return [r.id, r]; }));
const before = load(beforeDir), after = load(afterDir);
const ids = Object.keys(before).filter(id => after[id]).sort();

/* 대화 기록에서 세는 것 — 같은 질문 되묻기 안내 · 바꿀 수 없다는 답 · 방향 뒤 말에 답 없이 다시 정리 */
const RETRY = /메모로 남겼어요\. 이 질문은|숫자만 적어 주세요|금액으로 답해 주세요|숫자로 답해 주세요/g;
const CANNOT = /(?:직접\s*)?(?:바꾸|수정하|저장해\s*드리)[가-힣\s]*(?:수\s*없|못\s*해|어려워)/g;
function postDirection(r: any) {
  const t: string = r.transcript ?? ""; const start = t.indexOf("[화면·사업 방향 카드]"); if (start < 0) return { turns: 0, redoOnly: 0, answered: 0 };
  const tail = t.slice(start).split("[손님 행동]").slice(1);
  let redoOnly = 0, answered = 0;
  for (const turn of tail) {
    const reply = turn.split("\n").filter(line => line.startsWith("오늘창업:")).join(" ");
    if (!reply) continue;
    if (/^오늘창업: 말씀하신 (?:내용을 넣어|대로)/.test(reply.trim())) redoOnly++; else answered++;
  }
  return { turns: tail.length, redoOnly, answered };
}
const sum = (rs: any[], f: (r: any) => number) => rs.reduce((a, r) => a + f(r), 0);
const avg = (rs: any[], key: string) => { const v = rs.map(r => r.judge?.scores?.[key]).filter((x: unknown) => typeof x === "number"); return v.length ? Math.round(v.reduce((a: number, b: number) => a + b, 0) / v.length * 10) / 10 : null; };
const side = (map: Record<string, any>) => {
  const rs = ids.map(id => map[id]);
  const pd = rs.map(postDirection);
  return {
    reachedDirection: rs.filter(r => r.mech?.reachedDirection).length,
    repeatedQuestionPeople: rs.filter(r => r.mech?.repeatedQuestions?.length).length,
    repeatedQuestions: sum(rs, r => r.mech?.repeatedQuestions?.length ?? 0),
    retryHints: sum(rs, r => (r.transcript?.match(RETRY) ?? []).length),
    cannotChange: sum(rs, r => (r.transcript?.match(CANNOT) ?? []).length),
    aiReads: sum(rs, r => r.mech?.reads ?? 0), readMisses: sum(rs, r => r.mech?.readMiss?.length ?? 0),
    httpErrors: sum(rs, r => r.mech?.httpErrors?.length ?? 0), jobFailures: sum(rs, r => r.mech?.jobFailures?.length ?? 0),
    afterDirectionReplies: { redoOnly: sum(pd, x => x.redoOnly), answered: sum(pd, x => x.answered) },
    actionsAvg: Math.round(sum(rs, r => r.mech?.actions ?? 0) / rs.length * 10) / 10,
    designsAvg: Math.round(sum(rs, r => r.mech?.designs ?? 0) / rs.length * 10) / 10,
    scores: { values: avg(rs, "values"), listening: avg(rs, "listening"), hope: avg(rs, "hope"), clarity: avg(rs, "clarity"), flow: avg(rs, "flow") },
    findings: sum(rs, r => r.judge?.findings?.length ?? 0),
    findingsByCategory: rs.flatMap(r => r.judge?.findings ?? []).reduce((a: Record<string, number>, f: any) => { a[f.category] = (a[f.category] ?? 0) + 1; return a; }, {}),
  };
};
console.log(JSON.stringify({ personas: ids.length, before: side(before), after: side(after) }, null, 1));
for (const id of ids) {
  const b = before[id], a = after[id];
  const rb = b.mech?.repeatedQuestions?.length ?? 0, ra = a.mech?.repeatedQuestions?.length ?? 0;
  if (rb || ra || (a.mech?.readMiss?.length ?? 0)) console.log(`${id}: 되묻기 ${rb}→${ra}  읽기 ${a.mech?.reads ?? 0}회 · 못 읽음 ${a.mech?.readMiss?.length ?? 0}${a.mech?.readMiss?.length ? " " + JSON.stringify(a.mech.readMiss.map((m: any) => `${m.q}:${m.text}`)) : ""}`);
}
