// 화면 하나 점검 — 주소 하나를 열어 check.mjs 의 8가지 검사로 훑는다.
//   node scripts/ui-audit/page.mjs <경로> [--width 390] [--uid syn-901] [--name 화면이름] [--wait 4000] [--out 폴더]
//   예) BASE_URL=http://127.0.0.1:60207 node scripts/ui-audit/page.mjs "/plan/studio?new=1" --uid syn-901
// uid 를 주면 합성 로그인(/api/dev/synthetic-login)으로 들어간다. 결과: <OUT>/flags/*.png, <OUT>/issues.jsonl, <OUT>/<이름>-<너비>.png
import { args, browser, open, shot, sleep, S } from "./lib.mjs";
import { sweep } from "./check.mjs";

const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); if (i >= 0) { const v = args[i + 1]; args.splice(i, 2); return v; } return fallback; };
const width = +opt("width", 390);
const uid = opt("uid", null);
const wait = +opt("wait", 4000);
const steps = +opt("steps", 8);
const nameOpt = opt("name", null);
const target = args[0];
if (!target || !target.startsWith("/")) { console.error("사용법: node scripts/ui-audit/page.mjs <경로(/로 시작)> [--width 390] [--uid syn-901] [--name 이름] [--out 폴더]"); process.exit(2); }
const name = nameOpt || target.replace(/^\//, "").replace(/[^a-zA-Z0-9가-힣]+/g, "_").slice(0, 40) || "home";

const b = await browser();
try {
  const p = await open(b, uid, target, { width });
  await sleep(wait);
  console.log("url", p.url());
  const full = await shot(p, `${name}-${width}`);
  const records = await sweep(p, { screen: name, width, maxSteps: steps });
  const errors = [...p.errors, ...p.consoleErrors, ...p.bad];
  console.log(JSON.stringify({ screen: name, width, url: p.url(), screenshot: full, issues: records.length, byType: records.reduce((m, r) => ({ ...m, [r.typeName]: (m[r.typeName] ?? 0) + r.items.length }), {}), errors: errors.slice(0, 10), out: S }, null, 1));
  await p.close();
} finally {
  await b.close();
}
