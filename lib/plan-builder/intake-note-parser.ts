import { z } from "zod";
import { coachFieldSchema, type CoachField } from "./coach";

export type IntakeExtractCandidate = { fieldKey: CoachField["key"]; value: string; quote: string; noteId: string };
const MAX_NOTE_CHARS = 4000;
const MAX_CANDIDATES = 12;
export const noteIdSchema = z.string().min(1).max(80).refine(value => value.trim().length > 0);
export const candidateSchema = z.object({
  fieldKey: coachFieldSchema.shape.key,
  value: z.string().min(1).max(1200),
  quote: z.string().min(1).max(1600),
  noteId: z.string().min(1).max(80),
}).strict();

export const fieldLabels: Record<CoachField["key"], readonly string[]> = {
  business: ["사업", "사업명", "사업 아이디어"],
  customer: ["고객", "대상 고객", "타깃 고객"],
  offer: ["상품", "제품", "서비스", "제공 상품"],
  price: ["가격", "판매가", "단가", "건당 판매가"],
  budget: ["예산", "가용 예산"],
  cost: ["월 고정비", "고정비"],
  unitCost: ["건당 변동비", "단위 원가", "건당 원가"],
  volume: ["월 예상 판매량", "예상 판매량", "월 예상 판매 건수"],
  sales: ["매출", "실제 매출", "현재 매출", "매출 실적"],
  channel: ["판매 채널", "채널"],
  capacity: ["공급 역량", "처리 역량", "생산 능력"],
  problem: ["고객 문제", "문제"],
  experience: ["경험", "경력"],
  goal: ["목표", "목표 매출", "매출 목표"],
  setupCost: ["초기 비용", "초기 지출", "초기 지출 합계"],
  hoursPerWeek: ["주당 작업시간", "주당 작업 시간", "주당 가능 시간"],
  minutesPerSale: ["건당 소요 시간", "건당 소요시간", "건당 소요 분"],
};
const labels = new Map<string, CoachField["key"]>();
for (const key of coachFieldSchema.shape.key.options) {
  for (const label of [key, ...fieldLabels[key]]) labels.set(label.toLowerCase(), key);
}
const embeddedLabel = new RegExp(`(?:^|[\\s,;])(?:${[...labels.keys()].map(label => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\s*[:：]`, "i");
const acknowledgement = /^(?:안녕(?:하세요)?|안녕하세요|반갑습니다|네|넵|예|아니요|좋아요|알겠어요|알겠습니다|감사합니다|고마워요|확인|확인했어요|확인했습니다|ㅇㅇ|ㅇㅋ|ok(?:ay)?|hi|hello|thanks|thank you|yes|no)[.!?~\s]*$/i;

export function isEmptyOrAcknowledgement(text: string): boolean {
  return text.split(/\r\n|[\n\r]/).every(line => !line.trim() || acknowledgement.test(line.trim()));
}

/** Exact, line-oriented labels only. Candidates still require parent confirmation. */
export function parseIntakeNote(text: string, noteId: string): { candidates: IntakeExtractCandidate[]; needsAI: boolean } {
  if (typeof text !== "string" || !noteIdSchema.safeParse(noteId).success) return { candidates: [], needsAI: false };
  if (text.length > MAX_NOTE_CHARS) return { candidates: [], needsAI: true };
  const candidates: IntakeExtractCandidate[] = [];
  let needsAI = false;
  for (const rawLine of text.split(/\r\n|[\n\r]/)) {
    const quote = rawLine.trim();
    if (!quote || acknowledgement.test(quote)) continue;
    const match = quote.match(/^([^:：]+?)\s*[:：]\s*(.*)$/);
    const fieldKey = match ? labels.get(match[1].trim().toLowerCase()) : undefined;
    if (!match || !fieldKey) { needsAI = true; continue; }
    let value = match[2].trim();
    if (embeddedLabel.test(value)) { needsAI = true; continue; }
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")) || (value.startsWith("“") && value.endsWith("”")) || (value.startsWith("‘") && value.endsWith("’"))) value = value.slice(1, -1).trim();
    if (!value) continue;
    const candidate = candidateSchema.safeParse({ fieldKey, value, quote, noteId });
    if (!candidate.success) { needsAI = true; continue; }
    candidates.push(candidate.data);
  }
  // Do not silently truncate conflicting values; the caller can split the source.
  return candidates.length > MAX_CANDIDATES ? { candidates: [], needsAI: true } : { candidates, needsAI };
}
