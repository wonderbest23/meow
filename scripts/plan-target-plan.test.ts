import assert from "node:assert/strict";

/*
 * 본문 생성은 몇십 초가 걸린다. 그동안 사용자가 다른 플랜을 열면
 * 활성 플랜이 바뀐다 — 그때 활성 플랜에 저장하면 다른 사업의 문서에
 * 남의 본문이 들어간다. 시작할 때의 플랜에 저장되는지 확인한다.
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

  let release: (() => void) | null = null;
  (globalThis as Record<string, unknown>).fetch = async (url: string) => {
    if (String(url).includes("/api/plan/generate")) {
      await new Promise<void>((resolve) => { release = resolve; });
      return { ok: true, json: async () => ({ markdown: "# 싱크대 본문", html: "<h1>싱크대 본문</h1>" }) };
    }
    // 서버 큐는 받지 않는다 → 브라우저 큐가 돈다
    return { ok: true, json: async () => ({ started: false }) };
  };

  const { createPlan, setActivePlan, loadState, activePlan } = await import("../lib/plan-builder/plan-store");
  const { enqueueGeneration } = await import("../lib/plan-builder/generation-queue");

  const sinkId = createPlan("창업 초기 · 사업계획서", "한빛싱크");
  const cafeId = createPlan("창업 초기 · 사업계획서", "옆집카페");
  setActivePlan(sinkId);

  enqueueGeneration({
    key: "market/products",
    chapterId: "market",
    sectionId: "products",
    title: "상품·서비스",
    answers: { main_offer: "맞춤 싱크대" },
    allAnswers: {},
  });
  await new Promise((r) => setTimeout(r, 30));

  // 생성이 도는 동안 사용자가 다른 플랜을 연다
  setActivePlan(cafeId);
  assert.equal(activePlan(loadState())!.id, cafeId, "활성 플랜이 바뀐 상태여야 한다");

  release!();
  await new Promise((r) => setTimeout(r, 60));

  const state = loadState();
  const sink = state.plans.find((p) => p.id === sinkId)!;
  const cafe = state.plans.find((p) => p.id === cafeId)!;
  assert.ok(sink.sections["market/products"], "시작할 때 열려 있던 플랜에 저장되어야 한다");
  assert.equal(cafe.sections["market/products"], undefined, "다른 플랜에 새어 들어가면 안 된다");

  console.log("plan-target-plan: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
