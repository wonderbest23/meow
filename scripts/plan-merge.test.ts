import assert from "node:assert/strict";

/*
 * 재현 시나리오: 방금 만든 섹션이 아직 서버에 없을 때 하이드레이트가 일어나면?
 * 예전 구현은 서버본으로 통째로 덮어써서 그 섹션이 사라졌다(개요가 "1번부터 다시").
 */
async function main() {
  // localStorage / fetch 스텁 — 스토어가 브라우저 환경을 가정한다
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  (globalThis as Record<string, unknown>).localStorage = (globalThis as { window: { localStorage: unknown } }).window.localStorage;

  const serverState = {
    authenticated: true,
    business: { name: "새벽커피", description: "", role: "", industry: "", region: "", stage: "" },
    activePlanId: "plan_a",
    plans: [
      {
        id: "plan_a",
        title: "새벽커피",
        planType: "창업 초기 · 사업계획서",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-10T09:00:00.000Z", // 서버는 1번 생성 '전' 상태
        sections: {},
        answers: { "overview/summary": { established: "예" } },
      },
    ],
  };

  (globalThis as Record<string, unknown>).fetch = async () => ({
    ok: true,
    json: async () => serverState,
  });

  const { hydrateFromServer, planStatuses } = await import("../lib/plan-builder/plan-store");

  // 로컬: 방금 1번 섹션을 생성해 저장한 상태(아직 서버 업로드 전)
  store.set(
    "oneul-plan-demo-v1",
    JSON.stringify({
      business: serverState.business,
      activePlanId: "plan_a",
      plans: [
        {
          ...serverState.plans[0],
          updatedAt: "2026-08-10T09:05:00.000Z",
          sections: {
            "overview/summary": {
              markdown: "# 한눈에 보기",
              html: "<h1>한눈에 보기</h1>",
              generatedAt: "2026-08-10T09:05:00.000Z",
            },
          },
        },
      ],
    }),
  );

  const merged = await hydrateFromServer();
  const plan = merged.plans.find((p) => p.id === "plan_a")!;

  assert.ok(plan.sections["overview/summary"], "방금 만든 섹션이 하이드레이트 후에도 남아 있어야 한다");
  assert.equal(planStatuses(merged)["overview/summary"], "done", "개요가 '완료'로 보여야 한다");
  assert.deepEqual(plan.answers["overview/summary"], { established: "예" }, "서버 답변도 유지된다");

  console.log("plan-merge: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
