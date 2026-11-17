import assert from "node:assert/strict";

/*
 * 로그인하지 않고 쓰던 답변이 화면을 옮겨도 남아 있는지.
 *
 * 예전에는 hydrateFromServer가 authenticated=false만 보고 로컬을 통째로
 * 지웠다. 그래서 손님이 쓰던 내용이 날아갔고, 활성 플랜까지 잃어
 * 예시(꽃집) 플랜이 활성으로 잡히는 2차 피해가 났다.
 */
async function main() {
  const store = new Map<string, string>();
  const local = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as Record<string, unknown>).window = { localStorage: local };
  (globalThis as Record<string, unknown>).localStorage = local;

  let authenticated = false;
  (globalThis as Record<string, unknown>).fetch = async (url: string) => {
    if (String(url).includes("/api/plan/state")) {
      return { ok: true, json: async () => ({ business: { name: "" }, plans: [], activePlanId: null, authenticated }) };
    }
    return { ok: true, json: async () => ({}) };
  };

  const { hydrateFromServer, loadState, activePlan, saveAnswers, createPlan, saveBusiness, isSamplePlan } =
    await import("../lib/plan-builder/plan-store");

  // 손님이 사업 정보와 답변을 넣는다
  saveBusiness({ name: "한빛싱크", description: "주방 싱크대 제작·설치", role: "대표", industry: "주방 시공", region: "경기 김포", stage: "준비 중" });
  const planId = createPlan("창업 초기 · 사업계획서", "한빛싱크");
  saveAnswers("market/products", { main_offer: "맞춤 싱크대 제작·설치" });

  // 홈으로 나갔다가 다시 들어온다(모든 플랜 화면이 지나는 길)
  await hydrateFromServer();

  const plan = activePlan(loadState());
  assert.ok(plan, "다시 들어와도 플랜이 있어야 한다");
  assert.equal(plan!.id, planId, "내 플랜이 활성이어야 한다");
  assert.equal(isSamplePlan(plan!.id), false, "예시 플랜으로 넘어가면 안 된다");
  assert.equal(plan!.answers["market/products"].main_offer, "맞춤 싱크대 제작·설치", "쓰던 답변이 남아 있어야 한다");
  assert.equal(loadState().business.name, "한빛싱크", "사업 정보도 남아 있어야 한다");

  // 로그인했다가 로그아웃되면 그때는 지운다(남의 계정 내용이 남으면 안 된다)
  authenticated = true;
  await hydrateFromServer();
  authenticated = false;
  await hydrateFromServer();
  const after = loadState();
  assert.equal(after.plans.filter((p) => !isSamplePlan(p.id)).length, 0, "로그아웃되면 계정 플랜은 비워야 한다");

  // 머리줄 '이름 바꾸기' → 열린 대화 화면이 받으면 true, 받는 화면이 없으면 false(제목만 바꾼다)
  const { requestPlanRename, handlePlanRename } = await import("../lib/plan-builder/plan-store");
  assert.equal(requestPlanRename("plan_x", "멍멍간식"), false, "받는 화면이 없으면 false");
  const heard: string[] = [];
  const stop = handlePlanRename((id, title) => { heard.push(`${id}:${title}`); return id === "plan_x"; });
  assert.equal(requestPlanRename("plan_y", "다른 사업"), false, "다른 사업이면 대화가 받지 않는다");
  assert.equal(requestPlanRename("plan_x", "멍멍간식"), true);
  assert.deepEqual(heard, ["plan_y:다른 사업", "plan_x:멍멍간식"]);
  stop();
  assert.equal(requestPlanRename("plan_x", "멍멍간식"), false, "화면이 닫히면 더 받지 않는다");

  // 첫 화면(PlanList) — 로그인 전에 하던 사업 '이어서 하기'(점검 2026-11-16: X를 누르면 다시 열 길이 뒤로 가기뿐이었다)
  const { readFileSync } = await import("node:fs");
  const list = readFileSync(new URL("../app/plan/PlanList.tsx", import.meta.url), "utf8");
  assert.match(list, /const resume = guest \? allPlans\[0\] \?\? null : null;/, "손님이 쓰던 가장 최근 사업(예시 제외)");
  assert.match(list, /\{guest && resume && <div className=\{home\.resume\} data-guest-resume>[\s\S]*?href=\{openHref\(resume\)\}[\s\S]*?이어서 하기<\/span><strong>\{planDisplayName\(resume\)\}<\/strong>[\s\S]*?로그인하면 저장돼요\./);
  // 로그인 전에 적고 보내지 않은 글 — 잠깐 맡겼다가 다시 채우고, 보내면 지운다
  assert.match(list, /readLandingDraft\(draftStorage\(\), Date\.now\(\)\)/);
  assert.match(list, /onChange=\{event => edit\(event\.target\.value\)\}/);
  assert.match(list, /stashLandingIdea\(storage, idea, Date\.now\(\)\);\n\s*clearLandingDraft\(storage\);/);
  // 결제한 사업을 지울 때는 경고를 더한다(전체 이용권은 빼고, 확인 못 하면 평소 문구)
  assert.match(list, /const PAID_DELETE_WARNING = "결제한 문서예요\. 지우면 다시 받을 수 없어요\. ";/);
  assert.match(list, /return !!access\.paid && !access\.allAccess;/);
  assert.match(list, /message: `\$\{paid \? PAID_DELETE_WARNING : ""\}대화·사업계획서와/);

  console.log("plan-guest-persist: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
