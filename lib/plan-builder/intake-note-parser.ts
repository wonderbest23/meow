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
  livingCost: ["생활비", "월 생활비", "대표 생활비"],
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
  if (!candidates.some(candidate => candidate.fieldKey === "unitCost")) candidates.push(...summedUnitCostCandidates(text, noteId));
  // Do not silently truncate conflicting values; the caller can split the source.
  return candidates.length > MAX_CANDIDATES ? { candidates: [], needsAI: true } : { candidates, needsAI };
}

/*
 * 변동비를 항목별로만 적은 메모("1개당 재료비 4,000원, 포장비 500원") — 예전엔 변동비 칸이 비어 있었다.
 * 보수적인 규칙만 쓴다: 한 문장 안에 '1개당·건당·잔당…' 같은 단위 기준이 있고, 원 단위 금액이 붙은 비용 항목이
 * 서로 다른 이름으로 둘 이상 있을 때만 합계를 후보로 낸다. 합계·변동비·원가를 이미 적었거나, 한 달·월·고정비처럼
 * 기준이 다를 수 있는 말, 범위(4,000~5,000원), 불확실한 말(아마·모르·?)이 같은 문장에 있으면 내지 않는다.
 * 값은 합계, 인용(quote)은 그 항목들이 모두 들어 있는 원문 문장이다. 후보일 뿐이고 손님이 확인해야 반영된다.
 */
const UNIT_COST_PARTS = ["원재료비", "재료비", "재료값", "부자재비", "포장재비", "포장비", "용기비", "배송비", "택배비", "배달비", "외주비", "소모품비", "결제 수수료", "카드 수수료", "수수료"];
const PER_UNIT_BASIS = /(?:(?:1|한)\s*(?:개|건|잔|인분|그릇|회|벌|병|팩|세트|박스|봉|판|마리|장|권|명)|하나)\s*(?:당|에|마다|(?:을|를)?\s*(?:만드는\s*데|만들\s*때|팔\s*때))|(?:개|건|잔|인분|그릇|회|벌|병|팩|세트|박스|봉|판|마리|장|권)당/;
const OTHER_BASIS = /한\s*달|매달|매월|월\s*(?:고정|평균|합계|총|\d)|월간|월세|고정비|연간|1년|하루|일주일|매주|주\s*\d/;
const STATED_TOTAL = /변동비|원가|합계|합쳐|더하면|총/;
const UNCERTAIN = /[?？]|아마|모르|미정|일까|할까|라면|가정|예를\s*들|예시|않|아니|말고|제외|빼고/;
const RANGE = /\d\s*(?:천|만)?\s*원?\s*[~∼–-]\s*\d|에서\s*\d[\d,]*\s*(?:천|만)?\s*원|부터/;
const PART_AMOUNT = new RegExp(`(${UNIT_COST_PARTS.map(part => part.replace(/\s+/g, "\\s*")).join("|")})\\s*(?:은|는|이|가|[:：])?\\s*(?:약\\s*)?(\\d[\\d,]*(?:\\.\\d+)?)\\s*(천|만)?\\s*원`, "g");

function wonAmount(digits: string, scale: string | undefined): number | null {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(digits)) return null;
  const value = Number(digits.replace(/,/g, "")) * (scale === "만" ? 10_000 : scale === "천" ? 1_000 : 1);
  return Number.isFinite(value) && value > 0 && Number.isSafeInteger(Math.round(value)) && Math.round(value) === value ? value : null;
}

/** 단위당 비용 항목을 따로 적은 문장마다 합계 변동비 후보 하나. 확인 전에는 어디에도 반영하지 않는다. */
export function summedUnitCostCandidates(text: string, noteId: string): IntakeExtractCandidate[] {
  if (typeof text !== "string" || text.length > MAX_NOTE_CHARS || !noteIdSchema.safeParse(noteId).success) return [];
  const results: IntakeExtractCandidate[] = [];
  for (const raw of text.split(/(?<=[.!。])\s+|\r\n|[\n\r]/)) {
    const quote = raw.trim();
    if (!quote || quote.length > 1600 || !PER_UNIT_BASIS.test(quote)) continue;
    if (OTHER_BASIS.test(quote) || STATED_TOTAL.test(quote) || UNCERTAIN.test(quote) || RANGE.test(quote)) continue;
    const parts = [...quote.matchAll(PART_AMOUNT)].map(match => ({ label: match[1].replace(/\s+/g, ""), amount: wonAmount(match[2], match[3]) }));
    if (parts.length < 2 || parts.some(part => part.amount === null)) continue;
    const labels = new Set(parts.map(part => part.label));
    // 같은 항목이 두 번(재료비 4,000원 … 재료비 5,000원)이면 어느 쪽인지 알 수 없다
    if (labels.size !== parts.length) continue;
    const total = parts.reduce((sum, part) => sum + part.amount!, 0);
    const value = `${new Intl.NumberFormat("ko-KR").format(total)}원`;
    const candidate = candidateSchema.safeParse({ fieldKey: "unitCost", value, quote, noteId });
    if (candidate.success && !results.some(item => item.value === value)) results.push(candidate.data);
  }
  return results;
}
