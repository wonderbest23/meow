"use server";

import { randomUUID } from "node:crypto";
import { requireGuestIdentity } from "../../../lib/api-auth";
import { applyCoachReply, COACH_KEY } from "../../../lib/plan-builder/coach";
import { loadPlanState, savePlanState } from "../../../lib/plan-builder/plan-server-store";

export async function prepareAccountFixture() {
  if (process.env.NODE_ENV !== "development" || process.env.SUPABASE_URL !== "http://127.0.0.1:55431" || process.env.PLAN_ACCOUNT_LINKING_ENABLED !== "true") throw new Error("Local account lab only");
  const identity = await requireGuestIdentity();
  const state = await loadPlanState(identity.hash);
  const at = new Date().toISOString();
  const id = `plan_${randomUUID()}`;
  const coach = applyCoachReply(null, {
    message: "고정 테스트 답변입니다. 메뉴 사진 제작 사업을 준비합니다.",
    title: "다중 탭 격리 검증 사업", stage: "startup", depth: "practical", ready: true,
    suggestions: [], fields: [{ key: "business", value: "메뉴 사진 제작", basis: "user", quote: "메뉴 사진 제작", messageId: "browser-fixture-user" }],
  }, { id: "browser-fixture-user", role: "user", text: "메뉴 사진 제작 사업을 시작하고 싶어요", at });
  state.plans.push({
    id, title: "다중 탭 격리 검증 사업", planType: "일반 사업계획서", createdAt: at, updatedAt: at,
    answers: { [COACH_KEY]: { state: coach } },
    sections: { "overview/summary": { markdown: "비회원이 직접 수정한 격리 검증 문서", html: "<p>비회원이 직접 수정한 격리 검증 문서</p>", edited: true, locked: true, generatedAt: at } },
  });
  state.activePlanId = id;
  await savePlanState(identity.hash, state);
  return id;
}
