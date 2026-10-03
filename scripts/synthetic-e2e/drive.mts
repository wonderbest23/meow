// 합성 사업으로 새 대화(intake)를 끝까지 진행해 보는 드라이버 — 안전 미리보기(메모리 DB, AI 키 없음) 전용
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
const origin = process.argv[2]; const only = process.argv[3];
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("synthetic preview origin only");
type Biz = { id: string; desc: string; price: number; customer: string; offer: string; channel: string };
const BIZ: Biz[] = [
  { id: "bakery", desc: "동네 아파트 상가에서 아침 식빵과 소금빵을 굽는 작은 빵집", price: 4500, customer: "출근 전 직장인", offer: "식빵·소금빵", channel: "네이버 플레이스" },
  { id: "cafe", desc: "대학가 앞 테이크아웃 커피 전문점", price: 3500, customer: "대학생", offer: "아메리카노·라떼", channel: "인스타그램" },
  { id: "sidedish", desc: "맞벌이 가정에 주 2회 반찬을 정기배송하는 반찬 가게", price: 59000, customer: "맞벌이 30대 부부", offer: "반찬 4종 정기배송", channel: "당근마켓" },
  { id: "nail", desc: "1인 네일아트 예약제 샵", price: 45000, customer: "20~30대 직장인 여성", offer: "젤네일", channel: "인스타그램" },
  { id: "academy", desc: "초등학생 대상 코딩 소그룹 학원", price: 220000, customer: "초등학생 학부모", offer: "주 2회 코딩 수업", channel: "맘카페" },
  { id: "online", desc: "수제 캔들을 온라인 스마트스토어로 파는 쇼핑몰", price: 25000, customer: "선물을 찾는 20대", offer: "수제 캔들", channel: "스마트스토어" },
  { id: "pt", desc: "1:1 퍼스널 트레이닝 스튜디오", price: 70000, customer: "다이어트 하려는 직장인", offer: "1:1 PT 50분", channel: "네이버 플레이스" },
  { id: "photo", desc: "동네 가게 메뉴 사진을 찍어 주는 출장 사진 서비스", price: 150000, customer: "동네 음식점 사장님", offer: "메뉴 사진 10컷", channel: "직접 방문 영업" },
  { id: "stay", desc: "제주에서 독채 펜션을 운영하는 숙박업", price: 180000, customer: "가족 여행객", offer: "독채 1박", channel: "에어비앤비" },
  { id: "app", desc: "동네 소상공인 예약을 대신 받아 주는 앱 서비스", price: 30000, customer: "동네 미용실 사장님", offer: "월 예약 관리 구독", channel: "직접 영업" },
];
const H = { "content-type": "application/json", "x-business-intake": "2", origin };
async function run(biz: Biz, index: number) {
  let cookie = `syn_uid=syn-${index + 1}`; const log: string[] = []; const t0 = Date.now();
  const req = async (method: string, path: string, body?: unknown) => {
    const r = await fetch(origin + path, { method, headers: { ...H, cookie }, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
    const set = r.headers.getSetCookie?.() ?? []; for (const c of set) { const kv = c.split(";")[0]; const k = kv.split("=")[0]; cookie = [...cookie.split("; ").filter(x => x && !x.startsWith(k + "=")), kv].join("; "); }
    const text = await r.text(); let json: any = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  };
  await req("GET", "/api/plan/chat");
  let res = await req("POST", "/api/plan/chat", { action: "start", mode: "startup", revision: 0, requestId: randomUUID() });
  if (res.status !== 200 || !res.json?.plan) return { biz: biz.id, ok: false, step: "start", status: res.status, body: res.text.slice(0, 300), log };
  let plan = res.json.plan; const planId = plan.planId;
  for (let i = 0; i < 40; i++) {
    const q = plan.nextQuestion; if (!q) break;
    let value: unknown; const extra: Record<string, unknown> = {};
    if (q.id === "business") value = biz.desc;
    else if (q.id === "customer") value = biz.customer;
    else if (q.id === "offer") value = biz.offer;
    else if (q.id === "channel") value = q.options?.length ? (q.kind === "multi" ? [q.options[0].value] : biz.channel) : biz.channel;
    else if (q.id === "price") value = biz.price;
    else if (q.id === "industry" && plan.ksicCandidates?.length) { extra.ksic = plan.ksicCandidates[0].code; value = plan.ksicCandidates[0].sector; }
    else if (q.kind === "number") value = q.unit === "원" ? Math.round(biz.price * 0.3) : 10;
    else if (q.kind === "single") value = q.options?.[0]?.value;
    else if (q.kind === "multi") value = [q.options?.[0]?.value].filter(Boolean);
    else value = q.options?.[0]?.value ?? "직접 확인 예정";
    log.push(`${q.id}(${q.kind})=${JSON.stringify(value)}${extra.ksic ? " ksic=" + extra.ksic : ""}`);
    res = await req("POST", "/api/plan/chat", { action: "answer", planId, revision: plan.coach.revision, requestId: randomUUID(), questionId: q.id, value, ...extra });
    if (res.status !== 200 || !res.json?.plan) { log.push(`answer ${q.id} -> ${res.status} ${res.text.slice(0, 200)}`); res = await req("POST", "/api/plan/chat", { action: "answer", planId, revision: plan.coach.revision, requestId: randomUUID(), questionId: q.id, unknown: true }); if (!res.json?.plan) return { biz: biz.id, ok: false, step: "answer:" + q.id, log }; }
    plan = res.json.plan;
  }
  const core = { complete: plan.coreComplete, answered: plan.coreAnswered, total: plan.coreTotal, ksic: plan.ksic?.code ?? null };
  res = await req("POST", "/api/plan/chat", { action: "design", planId, revision: plan.coach.revision, requestId: randomUUID() });
  log.push(`design -> ${res.status} ${res.json?.plan ? "plan" : res.text.slice(0, 160)}`);
  if (res.json?.plan) plan = res.json.plan;
  for (let i = 0; i < 30 && plan.intake?.job && !["done", "complete", "failed"].includes(plan.intake.job.status); i++) { await new Promise(r => setTimeout(r, 1000)); const g = await req("GET", `/api/plan/chat?planId=${encodeURIComponent(planId)}`); if (g.json?.plan) plan = g.json.plan; }
  const design = { job: plan.intake?.job ? { kind: plan.intake.job.kind, status: plan.intake.job.status, error: plan.intake.job.error ?? plan.intake.job.code ?? null } : null, ready: !!plan.coach?.ready, hasDesign: !!plan.coach?.design, title: plan.title };
  // 계획서 만들기 — 화면의 '사업계획서 만들기'와 같은 요청
  res = await req("POST", "/api/plan/chat", { action: "prepare", planId, revision: plan.coach.revision, requestId: randomUUID() });
  log.push(`prepare -> ${res.status} started=${res.json?.started} paid=${res.json?.paid} login=${res.json?.login} msg=${res.json?.message ?? ""}`);
  // 로컬엔 Cloudflare Workflow가 없어 503 — 같은 섹션 생성 함수를 개발용 경로로 직접 부른다
  const gen = await req("POST", "/api/dev/synthetic-generate", { planId });
  log.push(`generate -> ${gen.status} ${JSON.stringify(gen.json?.results?.map((r: any) => r.ok ? "ok" : (r.skipped ?? r.error)) ?? gen.text.slice(0, 120))}`);
  let sections = 0, total = 0;
  for (let i = 0; i < 90; i++) {
    const s = await req("GET", "/api/plan/state");
    const p = s.json?.plans?.find((x: any) => x.id === planId);
    sections = p ? Object.values(p.sections ?? {}).filter((v: any) => v?.markdown?.trim()).length : 0;
    total = (gen.json?.results ?? []).length;
    if (!total || sections >= total) break;
    await new Promise(r => setTimeout(r, 2000));
  }
  const documents = { sections, total };
  return { biz: biz.id, ok: core.complete && design.hasDesign && sections > 0, planId, cookie, core, design, documents, ms: Date.now() - t0, log };
}
const results = [];
for (const [index, biz] of BIZ.entries()) { if (only && !only.split(",").includes(biz.id)) continue; const r = await run(biz, index); results.push(r); writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(results, null, 1)); console.log(JSON.stringify({ ...r, cookie: undefined, log: r.log.slice(-4) })); }
writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(results, null, 1));
