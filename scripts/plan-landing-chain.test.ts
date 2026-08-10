import assert from "node:assert/strict";

/*
 * 사업계획서 → 홈페이지 공개까지의 서버 체인을 끝까지 돌린다.
 * Supabase 없이 인메모리 폴백으로 실행하므로 로그인·결제 없이 검증할 수 있다.
 */
async function main() {
  const { landingDraftFromPlan } = await import("../lib/landing/from-plan");
  const { createProject, findProjectIdByPlan } = await import("../lib/project-repository");
  const {
    saveLandingDraft,
    publishLanding,
    getLandingForProject,
    getPublishedLandingBySlug,
  } = await import("../lib/landing/repository");

  const ownerHash = "owner-hash-test";
  const planId = "plan_test_1";
  const source = {
    planTitle: "새벽커피",
    business: { name: "새벽커피", industry: "식음료", region: "서울 마포구" },
    contactEmail: "owner@saebyeok.example",
    answers: {
      "market/products": { main_offer: "테이크아웃 드립커피", offer_detail: "원두 2종 선택", price_value: "4,000원" },
      "market/segments": { first_target: "마포 직장인" },
      "overview/problem": { problems: ["출근길 커피 살 곳이 없다"], solutions: ["역 앞 6시 오픈"], why_better: "3분 안에 수령" },
    },
  };

  // 1) 플랜을 담을 그릇이 아직 없다
  assert.equal(await findProjectIdByPlan(planId, ownerHash), null);

  // 2) 그릇을 만들고 다시 찾을 수 있어야 한다 — 두 번 만들면 안 되기 때문
  const project = await createProject(
    { opportunity: { title: source.planTitle, planId, source: "plan-builder" }, founderProfile: {}, paymentStatus: "paid", packagePrice: 0 },
    ownerHash,
  );
  assert.equal(await findProjectIdByPlan(planId, ownerHash), project.id, "플랜으로 그릇을 다시 찾아야 한다");

  // 3) 남의 계정에서는 보이지 않아야 한다
  assert.equal(await findProjectIdByPlan(planId, "someone-else"), null, "소유자가 다르면 찾히면 안 된다");

  // 4) 계획서 답변으로 초안 저장
  const draft = landingDraftFromPlan(source);
  const site = await saveLandingDraft(project.id, ownerHash, draft);
  assert.equal(site.status, "draft");
  assert.equal(site.draft.headline, "마포 직장인을 위한 테이크아웃 드립커피");

  // 5) 공개 전에는 공개 주소로 열리지 않아야 한다
  assert.equal(await getPublishedLandingBySlug(site.slug), null, "공개 전에는 열리면 안 된다");

  // 6) 공개하면 그 주소로 실제 내용이 나온다
  const published = await publishLanding(project.id, ownerHash);
  assert.equal(published.status, "published");
  const live = await getPublishedLandingBySlug(site.slug);
  assert.ok(live, "공개 후에는 /launch/{slug}에서 열려야 한다");
  assert.equal(live!.config.headline, "마포 직장인을 위한 테이크아웃 드립커피");
  assert.equal(live!.config.businessName, "새벽커피");

  // 7) 다시 만들어도 이미 있는 홈페이지를 덮지 않는다(라우트가 이 값을 보고 판단한다)
  const existing = await getLandingForProject(project.id, ownerHash);
  assert.ok(existing, "이미 만든 홈페이지는 그대로 남아 있어야 한다");

  console.log("plan-landing-chain: all assertions passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
