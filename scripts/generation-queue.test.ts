import assert from "node:assert/strict";

/*
 * 본문 생성이 화면을 붙잡지 않고 뒤에서 도는지 검증한다.
 * - enqueue는 즉시 반환된다(사용자는 바로 다음 질문으로 갈 수 있다)
 * - 여러 건을 걸면 순차로 처리된다(앞 섹션 결과가 뒤에 반영되도록)
 * - 결과는 도착하는 대로 저장된다
 */
async function main() {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
  };
  (globalThis as Record<string, unknown>).localStorage = (globalThis as { window: { localStorage: unknown } }).window.localStorage;

  store.set(
    "oneul-plan-demo-v1",
    JSON.stringify({
      business: { name: "새벽커피", description: "", role: "", industry: "", region: "", stage: "" },
      activePlanId: "plan_a",
      plans: [
        {
          id: "plan_a",
          title: "새벽커피",
          planType: "창업 초기 · 사업계획서",
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-01T00:00:00.000Z",
          sections: {},
          answers: {},
        },
      ],
    }),
  );

  const calls: string[] = [];
  let queueOk = false;          // 서버 큐가 받아주는지
  const queued: unknown[] = []; // 서버로 넘어간 요청
  let release: (() => void) | null = null;
  (globalThis as Record<string, unknown>).fetch = async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as { sectionId?: string };
    // 서버 큐 — 받아주면 브라우저는 만들지 않는다
    if (String(url).includes("/api/plan/queue")) {
      queued.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ started: queueOk, supported: queueOk }) };
    }
    // 서버 동기화(/api/plan/state) 호출은 세지 않는다 — 생성 요청만 본다
    if (!String(url).includes("/api/plan/generate")) return { ok: true, json: async () => ({}) };
    calls.push(body.sectionId!);
    // 첫 요청은 신호를 줄 때까지 붙잡아 둔다 — 순차 처리를 확인하기 위해
    if (calls.length === 1) await new Promise<void>((resolve) => { release = resolve; });
    return {
      ok: true,
      json: async () => ({ markdown: `# ${body.sectionId}`, html: `<h1>${body.sectionId}</h1>` }),
    };
  };

  const { enqueueGeneration, generatingCount, isGenerating } = await import("../lib/plan-builder/generation-queue");
  const { loadState, activePlan } = await import("../lib/plan-builder/plan-store");

  const job = (sectionId: string) => ({
    key: `overview/${sectionId}`,
    chapterId: "overview",
    sectionId,
    title: sectionId,
    answers: { a: 1 },
    allAnswers: {},
  });

  const started = Date.now();
  enqueueGeneration(job("summary"));
  enqueueGeneration(job("problem"));
  assert.ok(Date.now() - started < 50, "enqueue는 기다리지 않고 즉시 돌아와야 한다");

  // 서버가 받지 못하면 브라우저 큐가 대신 돈다(로컬 개발·미로그인)
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(queued.length, 2, "먼저 서버 큐에 맡겨 봐야 한다");
  assert.equal(generatingCount(), 2, "서버가 거절하면 브라우저 큐가 이어받아야 한다");
  assert.equal(isGenerating("overview/problem"), true);
  assert.equal(calls.length, 1, "한 번에 하나씩 — 두 번째는 아직 시작되지 않아야 한다");

  release!(); // 첫 요청 완료
  await new Promise((r) => setTimeout(r, 30));

  assert.deepEqual(calls, ["summary", "problem"], "걸어 둔 순서대로 처리되어야 한다");
  assert.equal(generatingCount(), 0, "모두 끝나면 대기 수가 0이어야 한다");

  // 서버가 받아주면 브라우저는 만들지 않는다 — 창을 닫아도 서버가 이어서 만든다
  queueOk = true;
  const before = calls.length;
  enqueueGeneration(job("mission"));
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls.length, before, "서버가 맡았으면 브라우저에서 또 만들면 안 된다");
  assert.equal(generatingCount(), 0, "브라우저 큐는 비어 있어야 한다");

  const plan = activePlan(loadState())!;
  assert.ok(plan.sections["overview/summary"], "첫 섹션 본문이 저장되어야 한다");
  assert.ok(plan.sections["overview/problem"], "두 번째 섹션 본문도 저장되어야 한다");

  console.log("generation-queue: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
