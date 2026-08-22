import { createProject, findProjectIdByPlan, getProject } from "../project-repository";
import type { ProjectRecord } from "../service-domain";

/*
 * 플랜 ↔ 프로젝트 다리.
 *
 * plan-builder 에는 프로젝트가 없다. 홈페이지·시장조사처럼 프로젝트 단위로
 * 저장하는 기능을 플랜에서 쓰려면 플랜당 하나의 그릇(projects 행)을 만들어
 * 두고 재사용한다 — opportunity.planId 로 다시 찾는다.
 *
 * 원래 홈페이지 라우트(app/api/plan/landing)에 있던 코드를 여기로 옮겼다.
 * 시장조사도 같은 그릇을 써야 근거가 한 곳(projects.market_workspace)에 모인다.
 */
export async function ensureProjectForPlan(
  plan: { id: string; title: string },
  identity: { hash: string; userId: string | null },
): Promise<string> {
  const existing = await findProjectIdByPlan(plan.id, identity.hash);
  if (existing) return existing;
  const project = await createProject(
    {
      opportunity: { title: plan.title, planId: plan.id, source: "plan-builder" },
      founderProfile: {},
      // 결제는 호출하는 쪽이 확인한다 — 그릇 자체는 결제 완료 상태로 만든다
      paymentStatus: "paid",
      packagePrice: 0,
    },
    identity.hash,
    identity.userId,
  );
  return project.id;
}

/** 플랜에 연결된 프로젝트 — 없으면 null (만들지 않는다) */
export async function projectForPlan(planId: string, guestHash: string): Promise<ProjectRecord | null> {
  const projectId = await findProjectIdByPlan(planId, guestHash);
  if (!projectId) return null;
  return getProject(projectId, guestHash);
}
