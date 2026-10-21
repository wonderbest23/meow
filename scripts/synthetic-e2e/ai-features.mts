// 대화 밖의 AI 기능 시험 — AI 창업 상담(여러 턴), 서비스 문의 직접 질문, 홍보 키트, 홈페이지 AI 채우기.
// 안전 미리보기(메모리 DB·합성 로그인) 전용. 홍보 키트·홈페이지는 계획서가 있는 사업(drive.mts 로 만든 것)을 쓴다.
//   npx tsx scripts/synthetic-e2e/ai-features.mts http://127.0.0.1:60209 <planId> <syn_uid> <결과 파일>
import { writeFileSync } from "node:fs";

const [origin, planId, uid, out] = process.argv.slice(2);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin ?? "")) throw new Error("synthetic preview origin only");
if (!planId || !uid || !out) throw new Error("usage: origin planId uid out");

let cookie = `syn_uid=${uid}`;
const req = async (method: string, path: string, body?: unknown, extra: Record<string, string> = {}) => {
  const started = Date.now();
  const r = await fetch(origin + path, { method, headers: { "content-type": "application/json", origin, cookie, "x-forwarded-for": `10.40.${Math.floor(Math.random() * 200)}.1`, ...extra }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  for (const c of r.headers.getSetCookie?.() ?? []) { const kv = c.split(";")[0]; const k = kv.split("=")[0]; cookie = [...cookie.split("; ").filter(x => x && !x.startsWith(k + "=")), kv].join("; "); }
  const text = await r.text(); let json: any = null; try { json = JSON.parse(text); } catch { /* 스트림 */ }
  return { status: r.status, json, text, ms: Date.now() - started };
};
const result: Record<string, unknown> = {};

/* 1) AI 창업 상담 — 손님 세 명이 여러 턴 대화 */
const CONSULTS = [
  { who: "퇴직 후 막막한 50대", turns: ["회사 그만두고 뭘 해야 할지 모르겠어요. 모은 돈은 5천 정도 있어요", "요리는 좀 해요. 근데 가게는 무서워요", "그럼 집에서 할 수 있는 건 뭐가 있어요?"] },
  { who: "아이디어가 너무 많은 20대", turns: ["유튜브도 하고 쇼핑몰도 하고 앱도 만들고 싶어요", "다 하면 안 돼요? 시간은 많아요", "그중에 돈이 제일 빨리 되는 건 뭐예요?"] },
  { who: "상담 대신 결제·환불을 묻는 손님", turns: ["오늘창업 계획서 얼마예요?", "결제했는데 마음에 안 들면 환불돼요?"] },
];
result.consult = [] as unknown[];
for (const c of CONSULTS) {
  let history: Array<{ role: string; text: string }> = [], profile: unknown = {};
  const turns: unknown[] = [];
  for (const message of c.turns) {
    const res = await req("POST", "/api/consult", { message, history, profile });
    /* 상담은 줄 단위 스트림({"t":"delta","v":…})으로 온다 — 조각을 이어 붙이고 마지막 결과 줄의 보기·추천을 쓴다 */
    const events = res.text.split("\n").map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
    const done = events.findLast((e: any) => e.t !== "delta") ?? res.json;
    const reply = events.filter((e: any) => e.t === "delta").map((e: any) => e.v).join("") || done?.message || res.text.slice(0, 300);
    res.json = done;
    turns.push({ message, status: res.status, ms: res.ms, reply, choices: res.json?.choices ?? null, picks: res.json?.picks?.map((p: any) => p.title ?? p.name ?? p) ?? null });
    history = [...history, { role: "user", text: message }, { role: "assistant", text: String(reply).slice(0, 1900) }];
    profile = res.json?.profile ?? profile;
  }
  (result.consult as unknown[]).push({ who: c.who, turns, profile });
  console.log("consult", c.who, "done");
}

/* 2) 서비스 문의 직접 질문 — FAQ 와 같은 사실을 말하는지 */
const QUESTIONS = ["사업계획서 가격이 얼마예요?", "앱에서 결제했는데 환불하려면 어떻게 해요?", "계획서 만드는 데 얼마나 걸려요?", "회원 탈퇴하면 제 정보 다 지워져요?", "만든 계획서로 정부지원사업 신청해도 돼요?", "홈페이지에 제 도메인 연결할 수 있어요?", "PDF로 내려받기 어디서 해요?", "계획서가 마음에 안 들면 다시 써 주나요?"];
result.support = [] as unknown[];
for (const message of QUESTIONS) {
  await new Promise(r => setTimeout(r, 3000)); // 같은 사람이 2초 안에 연달아 물으면 서버가 막는다(정상 동작)
  const res = await req("POST", "/api/support/assistant", { message, page: "/plan" });
  (result.support as unknown[]).push({ message, status: res.status, ms: res.ms, answer: res.json?.answer ?? res.json?.message ?? res.text.slice(0, 400), links: res.json?.links ?? null });
}
console.log("support done");

/* 3) 홍보 키트 */
{
  const res = await req("POST", "/api/plan/marketing-kit", { planId });
  result.marketingKit = { status: res.status, ms: res.ms, body: res.json ?? res.text.slice(0, 400) };
  console.log("marketing-kit", res.status, res.ms);
}

/* 4) 홈페이지 AI 채우기 */
{
  const landing = await req("POST", "/api/plan/landing", { planId }, { "x-business-intake": "2" });
  const projectId = landing.json?.projectId, updatedAt = landing.json?.site?.updatedAt;
  if (projectId && updatedAt) {
    const before = landing.json.site.draft;
    const res = await req("POST", `/api/projects/${projectId}/landing/ai-fill`, { expectedUpdatedAt: updatedAt });
    result.aiFill = { status: res.status, ms: res.ms, before: { headline: before?.headline, oneLiner: before?.oneLiner, pageTexts: Object.values(before?.pageData?.brainwave?.texts ?? {}).slice(0, 8) }, after: res.json?.site?.draft ? { headline: res.json.site.draft.headline, oneLiner: res.json.site.draft.oneLiner, pageTexts: Object.values(res.json.site.draft.pageData?.brainwave?.texts ?? {}).slice(0, 12) } : res.json ?? res.text.slice(0, 400) };
  } else result.aiFill = { status: landing.status, error: landing.text.slice(0, 300) };
  console.log("ai-fill", (result.aiFill as any).status);
}
writeFileSync(out, JSON.stringify(result, null, 1));
