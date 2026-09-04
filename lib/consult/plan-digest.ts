/*
 * 상담사에게 넘기는 '손님의 사업계획서' 요약.
 *
 * 챗봇은 그동안 손님이 이미 쓴 계획서를 전혀 몰랐다 — 답변·재무·검토 결과가
 * 다 있는데 "내 재무 괜찮아?"에 일반론으로 답했다. 여기서 계획서를 짧은 글로
 * 눌러 프롬프트에 싣는다. 길면 토큰만 먹으니 3,000자 안에서 끊는다.
 * 계획서에 없는 수치를 만들지 않도록, 있는 그대로만 옮긴다.
 */
import type { ServerBusinessProfile, ServerPlan } from "../plan-builder/plan-server-store";
import { sectionCountForType } from "../plan-builder/blueprint";
import { readReview, SEVERITY_LABEL } from "../plan-builder/review/domain";

const MAX_CHARS = 3_000;

function clip(value: unknown, max: number): string {
  const text = Array.isArray(value) ? value.map(String).join(", ") : typeof value === "object" && value ? JSON.stringify(value) : String(value ?? "");
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

export function planDigest(plan: ServerPlan, business: ServerBusinessProfile): string {
  const lines: string[] = [];
  lines.push(`제목: ${plan.title} · 유형: ${plan.planType}`);
  const bizBits = [
    business.name && `상호 ${business.name}`,
    business.industry && `업종 ${business.industry}`,
    business.region && `지역 ${business.region}`,
    business.stage && `단계 ${business.stage}`,
  ].filter(Boolean);
  if (bizBits.length) lines.push(bizBits.join(" · "));
  if (business.description) lines.push(`사업 설명: ${clip(business.description, 240)}`);

  const done = Object.values(plan.sections ?? {}).filter((s) => s?.markdown).length;
  lines.push(`진행: ${done}/${Math.max(1, sectionCountForType(plan.planType))} 섹션 본문 완성`);

  /* 답변 — 사용자가 직접 적은 사실이 가장 믿을 만한 근거다 */
  const answerLines: string[] = [];
  for (const [sectionKey, record] of Object.entries(plan.answers ?? {})) {
    if (sectionKey.startsWith("__") || !record || typeof record !== "object") continue;
    for (const [qid, value] of Object.entries(record)) {
      if (value === "" || value === null || value === undefined) continue;
      if (typeof value === "boolean") continue;
      const v = clip(value, 90);
      if (!v) continue;
      answerLines.push(`- ${sectionKey}/${qid}: ${v}`);
      if (answerLines.length >= 28) break;
    }
    if (answerLines.length >= 28) break;
  }
  if (answerLines.length) lines.push("손님이 답한 것", ...answerLines);

  /* 검토 결과 — 있으면 상담사가 같은 지적을 근거로 말할 수 있다 */
  const review = readReview(plan.answers, { id: plan.id, sections: plan.sections ?? {} });
  if (review.record) {
    const r = review.record.result;
    lines.push(`AI 검토: 완성도 ${r.overallQualityScore}/100${review.status === "stale" ? " (본문 수정 전 기준)" : ""}`);
    for (const issue of r.issues.slice(0, 3)) {
      lines.push(`- [${SEVERITY_LABEL[issue.severity]}] ${issue.title}: ${clip(issue.recommendation, 140)}`);
    }
  }

  /* 요약 본문 한 조각 — 계획서의 '말투'와 방향을 알려 준다 */
  const summaryKey = ["summary/executive", "overview/summary"].find((k) => plan.sections?.[k]?.markdown);
  if (summaryKey) lines.push(`요약 본문(${summaryKey}): ${clip(plan.sections[summaryKey].markdown, 400)}`);

  let out = lines.join("\n");
  if (out.length > MAX_CHARS) out = `${out.slice(0, MAX_CHARS)}…`;
  return out;
}
