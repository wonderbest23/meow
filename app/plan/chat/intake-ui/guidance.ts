import type { IntakeSnapshot } from "../../../../lib/plan-builder/intake-types";
import type { IntakeQuestion } from "../../../../lib/plan-builder/intake-questions";
import { parseIntakeNote } from "../../../../lib/plan-builder/intake-note-parser";
import { parseResourceLimit } from "../../../../lib/plan-builder/intake-candidate-fit";

export type MentionedAnswer = { key: string; value: string; quote: string };
const uncertainContext = /[?？]|아니|않|말고|제외|모르|미정|아마|일까|할까|라면|가정|예시|예를|친구|지인|다른\s*회사|예전|과거|폐업/;

/** A quoted suggestion only. Confirmed fields are already skipped by intake-core. */
export function mentionedAnswer(snapshot: IntakeSnapshot, question: IntakeQuestion): MentionedAnswer | null {
  if (!question.fieldKey || !["text", "number"].includes(question.kind)) return null;
  if (snapshot.coach.fields.some(field => field.key === question.fieldKey && field.basis === "user")) return null;
  const sources = [
    ...snapshot.coach.fields.filter(field => field.basis === "user" && ["business", "offer"].includes(field.key)).map(field => ({ id: field.messageId, text: field.value })),
    ...snapshot.intake.notes.filter(note => note.intent !== "question").map(note => ({ id: note.id, text: note.text })),
  ];
  const matches: MentionedAnswer[] = [];
  for (const [index, source] of sources.entries()) {
    if (source.text.length > 4000 || uncertainContext.test(source.text)) continue;
    const exact = parseIntakeNote(source.text, `reference-${index}`).candidates.filter(candidate => candidate.fieldKey === question.fieldKey);
    for (const candidate of exact) matches.push({ key: `${question.id}:${source.id}:${candidate.value}`, value: candidate.value, quote: candidate.quote });
    // Keep this narrow: a named audience followed by an explicit Korean recipient marker.
    if (question.fieldKey === "customer" && !exact.length) {
      const match = source.text.trim().match(/^(?:저는\s+)?([가-힣A-Za-z0-9·\s]{1,32}?)(?:에게|을\s*위한|를\s*위한|\s+대상으로)\s+[^\n]+$/);
      if (match && !/[은는이가]\s/.test(match[1])) matches.push({ key: `${question.id}:${source.id}:${match[1].trim()}`, value: match[1].trim(), quote: source.text.trim() });
    }
  }
  const values = new Set(matches.map(match => match.value.trim()));
  if (values.size !== 1) return null;
  const match = matches[0];
  if (sources.some(source => uncertainContext.test(source.text) && (source.text.includes(match.value) || parseIntakeNote(source.text, "conflict-check").candidates.some(candidate => candidate.fieldKey === question.fieldKey)))) return null;
  if (snapshot.intake.candidates.some(candidate => candidate.fieldKey === question.fieldKey && candidate.value === match.value && candidate.status === "rejected")) return null;
  if (question.id === "budget" || question.id === "hoursPerWeek") {
    const parsed = parseResourceLimit(match.value, question.id === "budget" ? "initialCost" : "weeklyOperatingHours");
    if (parsed.status !== "known") return null;
  }
  return match;
}

const HELP: Record<string, string> = {
  customer: "처음 서비스를 이용할 사람 한 부류만 떠올려도 괜찮아요.",
  problem: "그 사람이 지금 겪는 번거로움 하나면 충분해요.",
  offer: "처음 제공할 상품이나 서비스 하나부터 생각해 보세요.",
  channel: "첫 고객을 만날 수 있는 곳을 생각해 보세요. 제공 방식과는 달라요.",
  price: "상품이나 서비스 한 번에 받을 가격이에요. 아직 결정 전이면 미정으로 남겨도 돼요.",
  budget: "처음 준비에 쓸 수 있는 돈이에요. 쓸 돈이 없는 0원과 아직 정하지 않은 미정은 달라요.",
  hoursPerWeek: "준비 시간 전체가 아니라, 매주 실제로 쓸 수 있는 시간이에요.",
  period: "실제 매출을 살펴볼 시작일과 종료일이에요. 앞으로의 목표 기간은 아니에요.",
  sales: "선택한 기간에 실제로 들어온 매출이에요. 예상 매출은 포함하지 않아요.",
  cost: "매출이 없어도 매달 나가는 고정비예요. 건당 원가와는 나눠 봐요.",
};

export function undecidedHelp(question: IntakeQuestion) {
  const simple = ["customer", "problem", "offer", "channel", "experience"].includes(question.id);
  const examples = simple ? [...new Set((question.options ?? []).map(option => option.label).filter(label => !/[○□]|(?:^|\s)N(?:\s|건|명|개)|미정|모름/.test(label)))].slice(0, 3) : [];
  return { text: HELP[question.id] ?? "지금 확실한 내용만 정해도 괜찮아요. 결정하지 않은 답변은 나중에 바꿀 수 있어요.", examples };
}

export function resultUpdateNotice(snapshot: IntakeSnapshot): string | null {
  const staleDesign = !!snapshot.coach.design && snapshot.coach.design.sourceRevision !== (snapshot.coach.documentRevision ?? snapshot.coach.revision);
  if (snapshot.documentStatus === "stale") return "사업정보는 저장됐어요. 기존 계획서에는 아직 변경 전 내용이 남아 있어요.";
  if (staleDesign) return "답변은 저장됐어요. 이전에 정리한 사업 방향은 아직 변경 전 내용이에요.";
  if (snapshot.hasDocuments && snapshot.documentStatus === "unverified") return "저장된 계획서가 있어요. 현재 답변까지 반영됐는지는 확인이 필요해요.";
  return null;
}

export function resumeSummary(snapshot: IntakeSnapshot): string {
  if (["queued", "running"].includes(snapshot.intake.job?.status ?? "")) return "답변은 저장돼 있어요. 진행 중인 작업의 상태를 이어서 확인하고 있어요.";
  if (!snapshot.nextQuestion) return "저장한 답변을 불러왔어요. 마무리 단계부터 이어가면 돼요.";
  const latest = [...snapshot.coach.messages].reverse().find(message => message.role === "user" && snapshot.questions.some(question => snapshot.intake.answers[question.id]?.messageId === message.id));
  const answered = latest && snapshot.questions.find(question => snapshot.intake.answers[question.id]?.messageId === latest.id);
  return answered ? `${answered.label}까지 남겼어요. 이제 ${snapshot.nextQuestion.label}부터 이어갈게요.` : `이어서 ${snapshot.nextQuestion.label}부터 정해볼까요?`;
}

export function composerEnterSends(event: { key: string; shiftKey: boolean; isComposing?: boolean; keyCode?: number }, coarsePointer: boolean): boolean {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229 && !coarsePointer;
}
