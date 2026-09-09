import { z } from "zod";
import { completeJson, type LLMConfig } from "../llm/complete";
import { COACH_SYSTEM, applyCoachReply, coachContext, coachDocumentRevision, currentBusinessDesign, coachReplySchema, type CoachMessage, type CoachState } from "./coach";
import { BUSINESS_DESIGN_RULES, businessDesignReply, businessDesignSchema } from "./coach-design";
import { coachTurnSummary } from "./coach-presentation";

const REQUIRED_DRAFT_FIELDS = ["business", "customer", "offer", "price", "channel", "capacity"] as const;
const briefSchema = z.object({
  fields: z.array(z.object({ key: z.enum(REQUIRED_DRAFT_FIELDS), value: z.string().min(1).max(1200) })).max(6),
  design: businessDesignSchema,
});
const briefJsonSchema = z.toJSONSchema(briefSchema);

/** Stabilize the business brief before independent document sections can introduce competing proposals. */
export async function completeCoachReply(config: LLMConfig, previous: CoachState | null, message: CoachMessage, onPhase?: (phase: "understanding" | "designing" | "saving") => Promise<void>): Promise<CoachState | null> {
  const startedAt = Date.now();
  const calls: NonNullable<CoachState["lastGeneration"]>["calls"] = [];
  const onUsage = (usage: (typeof calls)[number]) => { calls.push(usage); };
  const finish = (state: CoachState) => ({ ...state, lastGeneration: { elapsedMs: Date.now() - startedAt, calls } });
  await onPhase?.("understanding");
  const raw = await completeJson(config, {
    system: COACH_SYSTEM,
    user: JSON.stringify({ existing: previous ? { title: previous.business.name, stage: previous.stage, depth: previous.depth, fields: previous.fields, ideaOrigin: previous.ideaOrigin, design: currentBusinessDesign(previous) } : null, history: previous?.messages.slice(-20) ?? [], message }),
    kind: "business-coach", effort: "medium", maxOutputTokens: 6000, timeoutMs: 120000, cache: true, onUsage,
  });
  const parsed = coachReplySchema.safeParse(raw);
  if (!parsed.success) return null;
  const state = applyCoachReply(previous, parsed.data, message);
  const missing = REQUIRED_DRAFT_FIELDS.filter(key => !state.fields.some(f => f.key === key));
  if (!state.ready || (!missing.length && currentBusinessDesign(state) && !parsed.data.reviseDesign)) return finish(state);
  const source = JSON.stringify({ context: coachContext(state), title: state.business.name, missing, latestMessage: message, previousDesign: previous?.design ?? null });
  await onPhase?.("designing");
  const brief = await completeJson(config, {
    system: `${BUSINESS_DESIGN_RULES}\n추가 질문 대신 공통 사업안을 설계합니다. fields에는 missing에 있는 항목만 제안으로 채웁니다. 기존 fields와 사용자 조건은 변경하지 않습니다. 빠진 시험 판매 가격은 근거 없는 시장가격이 아니라 제안 가격이며 이유를 design.startingPlan.whyThis에 씁니다. design은 채워진 공통 fields와 일치해야 합니다. 이전 design은 수정 참고 자료이며 현재 context와 latestMessage가 우선입니다. 아래 JSON 스키마에 맞는 JSON만 반환합니다.\n${JSON.stringify(briefJsonSchema)}`,
    user: source,
    jsonSchema: { name: "business_design", schema: briefJsonSchema },
    kind: "business-brief", effort: "high", maxOutputTokens: 6500, timeoutMs: 120000, onUsage,
  });
  const completed = briefSchema.safeParse(brief);
  if (!completed.success) return null;
  const keys = completed.data.fields.map(f => f.key);
  if (new Set(keys).size !== keys.length || keys.some(key => !missing.some(k => k === key))) return null;
  const unknownUrls = (JSON.stringify(completed.data.design).match(/https?:\/\/[^\s<>"\\]+/g) ?? []).filter(url => !source.includes(url));
  if (unknownUrls.length) return null;
  const additions = completed.data.fields.map(f => ({ ...f, basis: "proposal" as const, quote: "", messageId: "" }));
  const merged = applyCoachReply(previous, { ...parsed.data, fields: [...parsed.data.fields, ...additions] }, message);
  if (REQUIRED_DRAFT_FIELDS.some(key => !merged.fields.some(f => f.key === key))) return null;
  // A design-only edit must invalidate existing exports just like a price edit.
  const priorDesign = previous?.design ? businessDesignSchema.parse(previous.design) : null;
  if (previous && coachDocumentRevision(merged) === coachDocumentRevision(previous) && JSON.stringify(priorDesign) !== JSON.stringify(completed.data.design)) {
    merged.documentRevision = coachDocumentRevision(merged) + 1;
  }
  merged.design = { ...completed.data.design, status: "proposal", sourceRevision: coachDocumentRevision(merged) };
  merged.messages = merged.messages.map(m => m.id === `${message.id}-reply` ? { ...m, text: businessDesignReply(completed.data.design), summary: coachTurnSummary(previous, merged) } : m);
  merged.suggestions = ["상품을 구체화해 주세요", "시작 방법을 쉽게 바꿔주세요"];
  return finish(merged);
}
