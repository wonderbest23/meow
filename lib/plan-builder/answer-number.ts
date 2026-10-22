/**
 * 손님이 적은 금액·숫자 답을 읽는 공용 규칙. 대화 답(coachAmount), 문서 숫자 고치기(parseWon), 손익 계산(parseAmount)이
 * 서로 다르게 읽던 문제를 한곳에 모았다(2026-10-22 감사: '2만5천원'이 거절되고 '20~30만원'이 20,300,000원으로 읽혔다).
 */

const NUM = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
// 억·만 아래 자리: '5천', '3천5백', '2000', '1.5' 처럼 천·백·나머지 숫자가 이 순서로 온다
const SUB = String.raw`(?:(${NUM})천)?(?:(${NUM})백)?(${NUM})?`;
const AMOUNT = new RegExp(String.raw`^(?:${SUB}억)?(?:${SUB}만)?${SUB}$`);
const UNIT_SUFFIX = /(억원?|천만원?|백만원?|만원?|천원?|백원?|원)$/;
const RANGE = /^(.+?)[~～〜–](.+)$/;

const num = (text: string | undefined) => text ? Number(text.replace(/,/g, "")) : 0;
const sub = (thousand?: string, hundred?: string, rest?: string) => num(thousand) * 1000 + num(hundred) * 100 + num(rest);

/**
 * '25000', '25,000원', '2만5천원', '2만 5천원', '1억5천만원', '1억 2000만', '3천만원', '2.5만' → 원 단위 정수. 0원은 0.
 * 점 뒤에 숫자가 딱 세 자리면('4.500') 천 단위 구분으로 본다 — 4.5원이 아니라 4,500원이다. 범위·음수·글은 undefined.
 */
export function parseWonAmount(text: string | undefined | null): number | undefined {
  let plain = (text ?? "").replace(/\s/g, "").replace(/원$/, "");
  if (!plain) return undefined;
  if (/^\d{1,3}(?:\.\d{3})+$/.test(plain)) plain = plain.replace(/\./g, "");
  const match = plain.match(AMOUNT);
  if (!match || !match.slice(1).some(Boolean)) return undefined;
  const [, eT, eH, eR, mT, mH, mR, t, h, r] = match;
  const hasEok = /억/.test(plain), hasMan = /만/.test(plain);
  // '억'·'만' 앞에 숫자가 없으면('만원') 금액이 아니다 — 한글 숫자('만오천')는 coachAmount가 따로 읽는다
  if (hasEok && !(eT || eH || eR) || hasMan && !(mT || mH || mR)) return undefined;
  // 단위 없는 소수('4.5')는 원 단위로 읽을 수 없다
  if (!/[억만천백]/.test(plain) && /\./.test(plain)) return undefined;
  const value = Math.round(sub(eT, eH, eR) * 100_000_000 + sub(mT, mH, mR) * 10_000 + sub(t, h, r));
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** '20~30만원' → '20만원'(뒤쪽 단위를 앞에 붙인다). 범위가 아니면 null. 예산·시간처럼 범위로 받는 답은 적은 쪽으로 계산한다(보수적). */
export function rangeLowerText(text: string | undefined | null): string | null {
  const match = (text ?? "").replace(/\s/g, "").match(RANGE);
  if (!match || !match[1] || !match[2]) return null;
  const [, low, high] = match;
  if (/[억만천백원시간]/.test(low)) return low;
  const unit = high.match(UNIT_SUFFIX)?.[1] ?? high.match(/(시간)$/)?.[1] ?? "";
  return low + unit;
}

const PERIOD_WORDS: Record<string, { prefix: RegExp; suffix: RegExp }> = {
  월: { prefix: /^(?:매월|매달|월평균|한\s*달(?:에)?|월(?![가-힣]))\s*/, suffix: /\s*(?:\/\s*(?:월|달|한\s*달)|(?:한\s*달|매달|매월)|씩)$/ },
  주: { prefix: /^(?:매주|주당|일주일(?:에)?|한\s*주(?:에)?|주(?![가-힣]))\s*/, suffix: /\s*(?:\/\s*주|씩)$/ },
};

/** 질문의 기간과 같은 말('월 30만', '30만원/월', '주 20시간', '주20')은 떼고 숫자만 남긴다. 다른 기간은 그대로 둔다. */
export function stripAnswerPeriod(text: string, period: string | undefined): string {
  const words = period ? PERIOD_WORDS[period] : undefined;
  if (!words) return text;
  const stripped = text.trim().replace(words.prefix, "").replace(words.suffix, "").trim();
  return /\d/.test(stripped) ? stripped : text;
}
