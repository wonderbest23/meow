/*
 * 계획서를 아는 상담 — 끝에서 끝까지 검사.
 *
 * 1) 손님(게스트) 쿠키로 시험 계획서 하나를 저장하고
 * 2) planId 를 붙여 "내 재무 괜찮아?" 를 묻고 — 답이 계획서의 사실(꽃집·마포·3,000만원…)을 쓰는지 보고
 * 3) planId 없이 같은 질문을 해 일반론으로 돌아가는지 대조한 뒤
 * 4) 시험 계획서와 상담 대화를 지운다.
 *
 * 대상 서버가 있어야 돈다(LLM 비용 1~2회):
 *   EVAL_BASE=https://oneulstart.com npx tsx scripts/consult-plan-check.ts
 * 로그인 없이 게스트 쿠키로만 움직이므로 다른 손님 데이터는 건드리지 않는다.
 */
const base = process.env.EVAL_BASE?.replace(/\/$/, "");
if (!base) { console.log("EVAL_BASE 가 없어 건너뜁니다."); process.exit(0); }

const PLAN_ID = `plan_check_${Date.now().toString(36)}`;
const now = new Date().toISOString();
const state = {
  business: { name: "플로라 마포", description: "마포 망원동 1인 꽃집. 소규모 꽃다발과 정기구독 위주.", role: "대표", industry: "꽃집", region: "서울 마포구", stage: "준비 중" },
  activePlanId: PLAN_ID,
  plans: [{
    id: PLAN_ID, title: "1인 꽃집 사업계획서", planType: "창업 초기 · 사업계획서", createdAt: now, updatedAt: now,
    answers: {
      "finance/budget": {
        startupCapital: "3,000만원(자기자본 2,000 + 대출 1,000)",
        monthlyRent: "월세 120만원, 보증금 1,500만원",
        monthlyFixed: "고정비 월 210만원(월세·공과금·구독 포함)",
        targetMonthlySales: "월 매출 목표 600만원, 원가율 45%",
      },
      "market/customer": { target: "망원동 20~30대 여성, 소규모 카페·공방 정기 납품" },
    },
    sections: { "summary/executive": { markdown: "# 요약\n망원동 1인 꽃집 플로라 마포. 정기구독 40명 확보가 손익분기 목표.", html: "", generatedAt: now } },
  }],
};

let cookie = "";
async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${base}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) } });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(",").map((c) => c.split(";")[0].trim()).filter((c) => c.includes("=")).join("; ") || cookie;
  return res;
}
async function ask(message: string, planId?: string) {
  const res = await call("/api/consult", { method: "POST", body: JSON.stringify({ message, history: [], profile: {}, ...(planId ? { planId } : {}) }) });
  const text = await res.text();
  if (!res.ok) return { message: "", status: res.status, raw: text };
  const lines = text.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const done = lines.find((l) => l.t === "done") ?? (lines.length === 0 ? JSON.parse(text) : {});
  return { message: String(done.message ?? ""), status: res.status, sources: done.sources ?? [] };
}

let fails = 0;
function check(label: string, ok: boolean, detail = "") { console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`); if (!ok) fails += 1; }

(async () => {
  await call("/api/plan/state");                      // 게스트 쿠키 받기
  const put = await call("/api/plan/state", { method: "PUT", body: JSON.stringify(state) });
  check("시험 계획서 저장", put.ok, `HTTP ${put.status}`);
  const back = await (await call("/api/plan/state")).json();
  check("저장 확인", back.plans?.some((p: { id: string }) => p.id === PLAN_ID));

  try {
    const withPlan = await ask("내 재무 괜찮아? 손익분기 넘길 수 있을까?", PLAN_ID);
    console.log("\n[계획서 있음]\n" + withPlan.message + "\n");
    const facts = [/꽃집|플로라/, /마포|망원/, /3,?000만|210만|600만|120만|정기구독|40명/];
    check("계획서 사실을 답에 씀", facts.every((r) => r.test(withPlan.message)), facts.map((r) => `${r}:${r.test(withPlan.message)}`).join(" "));
    check("없는 수치 안 만듦(예: 시장규모 조 단위)", !/\d+\s*조\s*원/.test(withPlan.message));

    await call("/api/consult", { method: "DELETE" });   // 대조를 위해 대화 비우기
    const noPlan = await ask("내 재무 괜찮아? 손익분기 넘길 수 있을까?");
    console.log("[계획서 없음]\n" + noPlan.message + "\n");
    check("계획서 없으면 그 사실을 모름", !/플로라|망원|3,?000만/.test(noPlan.message));
  } finally {
    await call("/api/consult", { method: "DELETE" });
    const del = await call(`/api/plan/state?planId=${PLAN_ID}`, { method: "DELETE" });
    const after = await (await call("/api/plan/state")).json();
    check("시험 계획서 삭제", del.ok && !after.plans?.some((p: { id: string }) => p.id === PLAN_ID));
  }
  console.log(fails ? `\n${fails}개 실패` : "\n모두 통과");
  process.exit(fails ? 1 : 0);
})();
