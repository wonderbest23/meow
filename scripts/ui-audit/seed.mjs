// 합성 사업 만들기 — 메모리 DB 에 점검용 사업을 넣는다(가짜 AI 라 0원).
//   node scripts/ui-audit/seed.mjs <uid> <단계: partial:N | designed | full> [사업 설명]
//   partial:N  질문 N개를 남기고 멈춤 · designed  사업 방향 정리까지 · full  계획서 생성까지(/api/dev/synthetic-generate)
// 다른 도구에서는 import { makePlan } from "./seed.mjs" 로 쓴다. 서버를 다시 띄우면 메모리 DB 라 사라진다.
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { O, args } from "./lib.mjs";

export async function makePlan(uid, stage = "full", desc = "아파트 단지 앞 수제 도시락 가게") {
  const origin = O;
  const n = parseInt(uid.replace(/\D/g, "")) || 0;
  let cookie = `syn_uid=${uid}`;
  const H = () => ({ "content-type": "application/json", "x-business-intake": "2", origin, cookie, "x-forwarded-for": `10.77.${Math.floor(n / 250) % 250}.${n % 250 + 1}` });
  const req = async (m, p, body) => {
    const r = await fetch(origin + p, { method: m, headers: H(), body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    for (const c of r.headers.getSetCookie?.() ?? []) { const kv = c.split(";")[0]; const k = kv.split("=")[0]; cookie = [...cookie.split("; ").filter(x => x && !x.startsWith(k + "=")), kv].join("; "); }
    const t = await r.text(); try { return { status: r.status, ...JSON.parse(t) }; } catch { return { raw: t.slice(0, 200), status: r.status }; }
  };
  await req("GET", "/api/plan/chat");
  let res = await req("POST", "/api/plan/chat", { action: "start", mode: "startup", revision: 0, requestId: randomUUID() });
  let plan = res.plan; if (!plan) throw new Error(`사업을 시작하지 못했습니다: ${JSON.stringify(res).slice(0, 300)}`);
  const planId = plan.planId;
  const leave = stage.startsWith("partial:") ? +stage.split(":")[1] : 0;
  // 금액은 현실 범위로 넣는다 — 예산·생활비·월 비용 3,000원은 서버가 확인(amount_check)으로 멈춰 세운다(2026-10-27)
  const vals = { business: desc, customer: "근처 직장인", offer: "수제 도시락", channel: "네이버 플레이스", price: 9000, budget: 3_000_000, livingCost: 1_500_000, "structure.cost": 500_000 };
  for (let i = 0; i < 40; i++) {
    const q = plan.nextQuestion; if (!q) break;
    if (leave && plan.coreTotal - plan.coreAnswered <= leave) break;
    // 업종 확인(사업 설명이 고른 업종과 다를 때 다음 질문 전에 한 번 묻는다, sector_check) — 손님처럼 [바꾸기]를 고른다
    if (plan.sectorSuggestion && q.id !== "industry" && q.id !== "business") { res = await req("POST", "/api/plan/chat", { action: "answer", planId, revision: plan.coach.revision, requestId: randomUUID(), questionId: "industry", value: plan.sectorSuggestion.sector }); plan = res.plan ?? plan; continue; }
    let value = vals[q.id]; const extra = {};
    if (q.id === "industry" && plan.ksicCandidates?.length) { extra.ksic = plan.ksicCandidates[0].code; value = plan.ksicCandidates[0].sector; }
    if (value === undefined) value = q.kind === "number" ? (q.unit === "원" ? 3000 : 10) : q.kind === "single" ? q.options?.[0]?.value : q.kind === "multi" ? [q.options?.[0]?.value].filter(Boolean) : (q.options?.[0]?.value ?? "직접 확인 예정");
    if (q.id === "channel" && q.options?.length && q.kind === "multi") value = [q.options[0].value];
    res = await req("POST", "/api/plan/chat", { action: "answer", planId, revision: plan.coach.revision, requestId: randomUUID(), questionId: q.id, value, ...extra });
    if (!res.plan) res = await req("POST", "/api/plan/chat", { action: "answer", planId, revision: plan.coach.revision, requestId: randomUUID(), questionId: q.id, unknown: true });
    plan = res.plan ?? plan;
  }
  if (stage === "designed" || stage === "full") {
    res = await req("POST", "/api/plan/chat", { action: "design", planId, revision: plan.coach.revision, requestId: randomUUID() });
    if (res.plan) plan = res.plan;
    for (let i = 0; i < 30 && plan.intake?.job && !["done", "complete", "failed"].includes(plan.intake.job.status); i++) { await new Promise(r => setTimeout(r, 1000)); const g = await req("GET", `/api/plan/chat?planId=${planId}`); if (g.plan) plan = g.plan; }
  }
  let generated;
  if (stage === "full") { const g = await req("POST", "/api/dev/synthetic-generate", { planId }); generated = g.results?.length ?? 0; if (g.status !== 200) throw new Error(`계획서 생성 실패 ${g.status}`); }
  return { uid, planId, title: plan.title, answered: plan.coreAnswered, total: plan.coreTotal, next: plan.nextQuestion?.id, design: !!plan.coach?.design, generated };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [uid, stage, desc] = args;
  if (!uid || !stage) { console.error("사용법: node scripts/ui-audit/seed.mjs <uid> <partial:N|designed|full> [사업 설명]"); process.exit(2); }
  console.log(JSON.stringify(await makePlan(uid, stage, desc)));
}
