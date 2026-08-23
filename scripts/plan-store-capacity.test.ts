import assert from "node:assert/strict";

/*
 * 플랜이 개수 때문에 사라지지 않는지.
 *
 * 예전에는 normalizeState에 plans.slice(0, 30)이 있었다. 이 함수는 읽기와 쓰기를
 * 다 지나고, mergeStates가 createdAt 오름차순으로 정렬하므로 잘려나가는 쪽은
 * '가장 최근에 만든 플랜'이었다 — 31번째를 만드는 순간 최신 플랜이 조용히 사라졌다.
 *
 * 개수만 세면 이런 종류의 유실을 놓친다. 여기서는 전부 id 집합을 통째로 비교한다.
 */

const ids = (s: { plans: { id: string }[] }) => s.plans.map((p) => p.id).sort();
const expect = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `plan_${String(from + i).padStart(3, "0")}`).sort();

/** i번째 플랜 — createdAt은 i가 클수록 최근 */
function makePlan(i: number, extra: Record<string, unknown> = {}) {
  const n = String(i).padStart(3, "0");
  return {
    id: `plan_${n}`,
    title: `플랜 ${n}`,
    planType: "창업 초기 · 사업계획서",
    createdAt: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString(),
    sections: { "overview/summary": { markdown: `본문 ${n}`, html: "", generatedAt: "2026-01-01T00:00:00.000Z" } },
    answers: { "overview/summary": { one_liner: `한 줄 ${n}` } },
    ...extra,
  };
}

const stateOf = (plans: ReturnType<typeof makePlan>[], activePlanId: string | null = null) => ({
  business: { name: "한빛싱크", description: "주방 싱크대 제작·설치", role: "대표", industry: "주방 시공", region: "경기 김포", stage: "준비 중" },
  plans,
  activePlanId,
});

async function main() {
  // Supabase 미설정 → 인메모리 저장소(같은 코드 경로, mergeStates 포함)
  const { normalizeState, loadPlanState, savePlanState, deletePlanById } = await import(
    "../lib/plan-builder/plan-server-store"
  );

  let owner = 0;
  const nextOwner = () => `owner_${++owner}`;

  // ── A. 30개: save → load → 정확히 그 30개
  {
    const hash = nextOwner();
    await savePlanState(hash, normalizeState(stateOf(Array.from({ length: 30 }, (_, i) => makePlan(i + 1)))));
    assert.deepEqual(ids(await loadPlanState(hash)), expect(1, 30), "A: 30개가 그대로 남아야 한다");
  }

  // ── B. 31개: 31번째(가장 최근)가 살아 있어야 한다 — 회귀의 핵심
  {
    const hash = nextOwner();
    await savePlanState(hash, normalizeState(stateOf(Array.from({ length: 31 }, (_, i) => makePlan(i + 1)))));
    const got = await loadPlanState(hash);
    assert.deepEqual(ids(got), expect(1, 31), "B: 31개 전부 남아야 한다");
    assert.ok(got.plans.some((p) => p.id === "plan_031"), "B: 가장 최근 플랜이 살아 있어야 한다");
  }

  // ── C. 35개: normalize → save → reload
  {
    const hash = nextOwner();
    const st = normalizeState(stateOf(Array.from({ length: 35 }, (_, i) => makePlan(i + 1))));
    assert.deepEqual(ids(st), expect(1, 35), "C: normalize가 플랜을 버리면 안 된다");
    await savePlanState(hash, st);
    assert.deepEqual(ids(await loadPlanState(hash)), expect(1, 35), "C: 35개 전부 남아야 한다");
  }

  // ── D. 50개
  {
    const hash = nextOwner();
    await savePlanState(hash, normalizeState(stateOf(Array.from({ length: 50 }, (_, i) => makePlan(i + 1)))));
    assert.deepEqual(ids(await loadPlanState(hash)), expect(1, 50), "D: 50개 전부 남아야 한다");
  }

  // ── E. 50개 상태에서 '가장 오래된' 플랜 하나 수정 → 나머지 49개 유지
  {
    const hash = nextOwner();
    await savePlanState(hash, normalizeState(stateOf(Array.from({ length: 50 }, (_, i) => makePlan(i + 1)))));
    const edited = { ...makePlan(1), title: "가장 오래된 플랜 수정", updatedAt: "2026-12-31T00:00:00.000Z" };
    await savePlanState(hash, normalizeState(stateOf([edited])));
    const got = await loadPlanState(hash);
    assert.deepEqual(ids(got), expect(1, 50), "E: 오래된 플랜을 수정해도 50개가 유지돼야 한다");
    assert.equal(got.plans.find((p) => p.id === "plan_001")?.title, "가장 오래된 플랜 수정", "E: 수정이 반영돼야 한다");
  }

  // ── F. 50개 상태에서 '가장 최근' 플랜 수정 → 유지 + 반영
  {
    const hash = nextOwner();
    await savePlanState(hash, normalizeState(stateOf(Array.from({ length: 50 }, (_, i) => makePlan(i + 1)))));
    const edited = { ...makePlan(50), title: "가장 최근 플랜 수정", updatedAt: "2026-12-31T00:00:00.000Z" };
    await savePlanState(hash, normalizeState(stateOf([edited])));
    const got = await loadPlanState(hash);
    assert.deepEqual(ids(got), expect(1, 50), "F: 최근 플랜을 수정해도 50개가 유지돼야 한다");
    assert.equal(got.plans.find((p) => p.id === "plan_050")?.title, "가장 최근 플랜 수정", "F: 수정이 반영돼야 한다");
  }

  // ── G. 삭제: 사용자가 지운 그 플랜만 사라진다
  {
    const hash = nextOwner();
    await savePlanState(hash, normalizeState(stateOf(Array.from({ length: 35 }, (_, i) => makePlan(i + 1)))));
    await deletePlanById(hash, "plan_017");
    const got = await loadPlanState(hash);
    assert.deepEqual(ids(got), expect(1, 35).filter((id) => id !== "plan_017"), "G: 지목한 플랜 하나만 사라져야 한다");
  }

  // ── H. merge: local 1~35 + remote 20~50 → 고유 1~50 전부
  {
    const hash = nextOwner();
    await savePlanState(hash, normalizeState(stateOf(Array.from({ length: 31 }, (_, i) => makePlan(i + 20))))); // remote 20~50
    await savePlanState(hash, normalizeState(stateOf(Array.from({ length: 35 }, (_, i) => makePlan(i + 1)))));  // local 1~35
    assert.deepEqual(ids(await loadPlanState(hash)), expect(1, 50), "H: 합집합 50개가 전부 남아야 한다");
  }

  // ── I. 동일 id 충돌: updatedAt이 최신인 쪽이 이긴다(기존 정책 유지)
  {
    const hash = nextOwner();
    const older = { ...makePlan(7), title: "서버쪽 옛 내용", updatedAt: "2026-03-01T00:00:00.000Z" };
    const newer = { ...makePlan(7), title: "로컬쪽 최신 내용", updatedAt: "2026-09-01T00:00:00.000Z" };
    await savePlanState(hash, normalizeState(stateOf([older])));
    await savePlanState(hash, normalizeState(stateOf([newer])));
    assert.equal((await loadPlanState(hash)).plans.find((p) => p.id === "plan_007")?.title, "로컬쪽 최신 내용", "I: 최신이 이겨야 한다");
    // 반대 방향: 오래된 것이 나중에 와도 최신을 덮지 않는다
    await savePlanState(hash, normalizeState(stateOf([older])));
    assert.equal((await loadPlanState(hash)).plans.find((p) => p.id === "plan_007")?.title, "로컬쪽 최신 내용", "I: 옛 내용이 최신을 덮으면 안 된다");
  }

  // ── J. 답변 이어받기로 31번째 신규 플랜 생성 → 기존 30개가 그대로
  {
    const hash = nextOwner();
    await savePlanState(hash, normalizeState(stateOf(Array.from({ length: 30 }, (_, i) => makePlan(i + 1)))));
    const inherited = makePlan(31, { inheritedFrom: { title: "플랜 030", count: 12 } });
    await savePlanState(hash, normalizeState(stateOf([inherited], inherited.id)));
    const got = await loadPlanState(hash);
    assert.deepEqual(ids(got), expect(1, 31), "J: 이어받기 플랜을 만들어도 기존 플랜이 남아야 한다");
    assert.deepEqual(got.plans.find((p) => p.id === "plan_031")?.inheritedFrom, { title: "플랜 030", count: 12 }, "J: 이어받기 출처가 보존돼야 한다");
    assert.equal(got.activePlanId, "plan_031", "J: 새로 만든 플랜이 활성이어야 한다");
  }

  // ── K. 저장 순서: createdAt 오름차순(화면 정렬의 입력) 유지
  {
    const hash = nextOwner();
    await savePlanState(hash, normalizeState(stateOf([makePlan(40), makePlan(3), makePlan(21)])));
    const got = await loadPlanState(hash);
    assert.deepEqual(got.plans.map((p) => p.id), ["plan_003", "plan_021", "plan_040"], "K: 저장 정렬 순서가 그대로여야 한다");
  }

  // ── L. 섹션·답변 내용이 개수와 무관하게 보존되는지
  {
    const hash = nextOwner();
    await savePlanState(hash, normalizeState(stateOf(Array.from({ length: 45 }, (_, i) => makePlan(i + 1)))));
    const got = await loadPlanState(hash);
    for (const id of ["plan_001", "plan_031", "plan_045"]) {
      const p = got.plans.find((x) => x.id === id)!;
      assert.equal(Object.keys(p.sections).length, 1, `L: ${id} 섹션 보존`);
      assert.equal(Object.keys(p.answers).length, 1, `L: ${id} 답변 보존`);
    }
  }

  console.log("plan-store-capacity: A~L 통과 — 30/31/35/50개, merge, 삭제, 이어받기 모두 id 집합 완전 일치");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
