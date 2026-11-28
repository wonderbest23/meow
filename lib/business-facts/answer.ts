import { findFacts, factsForPrompt, normalizeFactText, siteFacts, type FactMatch } from "./index";
import type { BusinessFact, FactGroup } from "./schema";

/*
 * 3단계(계획 '한국 사업 정보 사이트 안에 넣어 두기') — 대화에서 손님이 사업자등록 · 과세 유형 · 세금 일정을 물으면
 * 사이트 자료에서 찾은 항목만 근거로 답한다. AI 를 부르기 전 · 받은 뒤를 이 파일이 맡는다(순수 함수).
 *
 *  1. 세금·등록 질문인지 가른다(isTaxQuestion) — 아니면 지금처럼 일반 답변
 *  2. 자료에서 찾는다(groundTaxQuestion). 없으면 AI 를 부르지 않고 '아직 확인된 자료가 없어요' + 국세청 안내(noFactReply)
 *  3. 있으면 그 항목만 AI 에게 건넨다(factsForPrompt) — 이 밖의 세금 사실은 쓰지 말라는 규칙과 함께(intake-extraction helpIntake)
 *  4. 받은 답의 숫자가 항목 · 질문 · 손님 사업 정보에 없으면 그 답을 버리고 항목 원문을 그대로 보인다(checkGroundedReply → factFallbackReply)
 *  5. 답 끝에 출처 · 확인한 날을 붙인다(factsFooter)
 *
 * 4단계(업종별 영업신고·허가)부터 '영업신고·위생교육' 질문도 같은 길로 — 주제(kind)마다 찾을 묶음 · 없을 때 안내 · 마지막 확인처가 다르다.
 */

export const TAX_GROUPS: FactGroup[] = ["registration", "tax-type", "tax-calendar"];

/*
 * 세금·등록 '절차'를 묻는 말만 — '세금 빼고 순이익이 얼마예요?' 같은 계산 질문은 지금처럼 일반 답변으로 둔다.
 * 낱말이 붙어 있어도(사업자등록) 띄어 써도(사업자 등록) 걸리게 띄어쓰기를 걷은 글에서 찾는다.
 */
const TAX_WORDS = /사업자등록|사업자신청|사업자신고|간이과세|일반과세|과세유형|부가세|부가가치세|종합소득세|종소세|원천세|원천징수|세금계산서|세금신고|신고기한|신고기간|납부기한|세무서|홈택스|예정고지|성실신고/;
export function isTaxQuestion(question: string): boolean {
  return TAX_WORDS.test(normalizeFactText(question));
}

export const PERMIT_GROUPS: FactGroup[] = ["permit"];
/*
 * 영업신고·허가 '절차'를 묻는 말 — 세금 낱말이 먼저 걸리면 세금으로 본다('부가세 신고해야 해요?').
 * '신고'만으로는 걸지 않는다(세금 신고와 헷갈림). 무슨/어떤 신고 · 신고해야 · 영업신고 · 허가 · 면허 · 위생교육 · 영업 종류 이름(교습소 · 통신판매 등).
 */
const PERMIT_WORDS = /영업신고|영업허가|영업등록|무슨신고|어떤신고|신고는어디|어디에신고|어디서신고|신고해야|신고안해도|신고하지않아도|신고는어떻게|어떻게신고|허가를받|허가받|인허가|등록해야|위생교육|식품위생|보건증|건강진단|휴게음식점|일반음식점|제과점영업|즉석판매|공중위생|면허|교습소|개인과외|과외신고|공부방|학원등록|학원설립|학원차리|학원창업|학원오픈|학원열|통신판매/;
export function isPermitQuestion(question: string): boolean {
  return !isTaxQuestion(question) && PERMIT_WORDS.test(normalizeFactText(question));
}

export type FactTopic = "tax" | "permit";
export type TaxGrounding = { topic: false } | { topic: true; kind: FactTopic; matches: FactMatch[] };

/** 세금·등록 또는 영업신고 질문이면 그 묶음에서 자료를 찾는다(업종 분류 · 업종 코드로 좁힘). 아니면 topic:false */
export function groundTaxQuestion(question: string, business: { sector?: string | null; ksic?: string | null }, today?: string, facts: BusinessFact[] = siteFacts(today)): TaxGrounding {
  const kind: FactTopic | null = isTaxQuestion(question) ? "tax" : isPermitQuestion(question) ? "permit" : null;
  if (!kind) return { topic: false };
  const groups = kind === "tax" ? TAX_GROUPS : PERMIT_GROUPS;
  const matches = findFacts({ text: question, sector: business.sector ?? null, ksic: business.ksic ?? null, groups }, facts, today ?? new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10), 3);
  return { topic: true, kind, matches };
}

export const NTS_HOME = "https://www.nts.go.kr";
export const GOV24_HOME = "https://www.gov.kr";
/** 맞는 항목이 없을 때 — AI 를 부르지 않는다(지어낸 세금·인허가 안내가 가장 위험하다) */
export function noFactReply(kind: FactTopic = "tax"): string {
  if (kind === "permit") return `아직 확인된 자료가 없어요. 영업신고·허가는 영업소가 있는 시·군·구청(학원·교습소는 교육지원청)이나 정부24(${GOV24_HOME})에서 확인해 주세요.`;
  return `아직 확인된 자료가 없어요. 이 내용은 국세상담센터(국번없이 126)나 국세청 누리집(${NTS_HOME})에서 확인해 주세요. 관할 세무서 민원봉사실에서도 물어볼 수 있어요.`;
}
/** 마지막 확인처 — 세금은 국세청, 영업신고는 가장 맞는 항목의 담당 기관(미용실은 시·군·구청, 학원은 교육지원청 …) */
function finalCheck(matches: FactMatch[]): string {
  if (topicOf(matches) === "tax") return "안내예요. 최종 확인은 국세청(126)이나 관할 세무서에서 해 주세요.";
  return `안내예요. 최종 확인은 ${matches[0]?.fact.agency || "영업소가 있는 시·군·구청"}에서 해 주세요.`;
}
const topicOf = (matches: FactMatch[]): FactTopic => matches.length && matches.every(({ fact }) => fact.group === "permit") ? "permit" : "tax";

/** 답 끝에 붙이는 출처 줄 — 항목마다 첫 출처 제목 · 주소 · 확인한 날. 다시 확인 날이 지난 항목은 표시 */
export function factsFooter(matches: FactMatch[]): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const { fact, stale } of matches) {
    const source = fact.sources[0];
    if (!source || seen.has(source.url)) continue;
    seen.add(source.url);
    lines.push(`${source.title}(${fact.checkedAt} 확인${stale ? " · 다시 확인 필요" : ""}) ${source.url}`);
  }
  return `\n\n출처: ${lines.join(" / ")}\n${finalCheck(matches)}`;
}

/** AI 답을 쓸 수 없을 때 — 가장 맞는 항목의 답 원문 그대로 + 출처 */
export function factFallbackReply(matches: FactMatch[], kind: FactTopic = "tax"): string {
  const [top] = matches;
  return top ? `${top.fact.answer}${factsFooter([top])}` : noFactReply(kind);
}

/** 숫자 토큰(쉼표 · 단위 앞 공백 무시) — '10,400만원' → '10400', '1.5%' → '1.5' */
function numbers(text: string): string[] {
  return [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map(match => match[0].replace(/,/g, "").replace(/\.$/, ""));
}

/**
 * 받은 답의 숫자가 근거(항목 원문) · 질문 · 손님 사업 정보 안에 모두 있는지. 하나라도 없으면 그 답은 쓰지 않는다.
 * 숫자를 다른 꼴로 바꿔 쓴 것('1억 400만원')도 걸린다 — 엄격한 쪽이 안전하다(그때는 항목 원문을 보인다).
 */
export function checkGroundedReply(reply: string, matches: FactMatch[], extra: string[] = []): { ok: boolean; stray: string[] } {
  const allowed = new Set([...numbers(factsForPrompt(matches)), ...extra.flatMap(numbers)]);
  const stray = [...new Set(numbers(reply).filter(value => !allowed.has(value)))];
  return { ok: stray.length === 0, stray };
}

/** AI 에게 덧붙이는 규칙 — 항목 밖의 세금·등록·인허가 사실은 쓰지 않는다 */
export const GROUNDED_RULES = "This question is about Korean business registration, tax or business-permit (영업신고) procedures. Answer ONLY from the verified facts given as `facts` (official government pages): restate them in plain 해요체 and apply them to the founder's situation. Do not add any tax rate, fee, amount, deadline, date, hours, form name, document, exception or agency that is not in `facts`. Write numbers exactly as they appear in `facts`. If `facts` do not answer the question, say that this is not in the verified material yet and suggest the agency named in `facts` (국세상담센터 126 or the 관할 세무서 for tax, the 시·군·구청 for permits). Do not add a sources line; the service appends it.";
