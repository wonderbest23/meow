"use client";

import { useMemo } from "react";
import { loadState } from "../../../lib/plan-builder/plan-store";
import { readCoach } from "../../../lib/plan-builder/coach";
import { intakeSnapshot, readIntake } from "../../../lib/plan-builder/intake-core";
import { ConversationHistory } from "../chat/intake-ui/IntakePanels";
import intake from "../chat/intake.module.css";
import chatUi from "../../../components/coach-chat-ui.module.css";

/*
 * 완성 예시의 대화 기록(읽기 전용) — 이 계획서를 만들 때 실제로 오간 질문과 답을 대화 칸과 같은 모양으로 보인다(대표 요청 2026-11-14).
 * 일반 모드는 질문 몇 개와 '나머지는 채웠어요', 전문가 모드는 질문을 하나씩 다 답한 것이 그대로 보여 두 모드의 차이가 여기서 드러난다.
 * 대화 상태가 없는 예전 예시는 그리지 않는다.
 */
export default function SampleConversation({ planId }: { planId: string }) {
  const snapshot = useMemo(() => {
    const plan = loadState().plans.find(item => item.id === planId);
    const coach = plan ? readCoach(plan.answers) : null, state = plan ? readIntake(plan.answers) : null;
    try { return plan && coach && state ? intakeSnapshot(plan as never, coach, state) : null; } catch { return null; }
  }, [planId]);
  if (!snapshot) return null;
  const asked = snapshot.coach.messages.filter(message => message.role === "user").length;
  return <section aria-label="이 예시를 만든 대화">
    <h3>이렇게 대화했어요 <small>직접 답한 것 {asked}개</small></h3>
    <div className={`${intake.page} ${chatUi.theme}`} data-coach="" data-embedded=""><ConversationHistory snapshot={snapshot} onEdit={() => {}} readOnly /></div>
  </section>;
}
