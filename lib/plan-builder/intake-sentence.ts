import { parseWonAmount } from "./answer-number";

/*
 * 사업 문장에서 사용자가 직접 적은 고객·금액·수량을 읽는다(AI 0회). 읽힌 값은 업종 기준표의 어림값보다 먼저 쓴다(intake-estimate).
 * 금액은 앞뒤 낱말로 뜻을 가린다: 자본금·예산 → 준비 자금, 월 매출·벌다 → 목표, 가격·한 잔·짜리 → 가격.
 * 월세·보증금처럼 다른 뜻이거나 뜻이 안 잡히는 금액은 버린다 — 잘못 읽느니 안 읽는다.
 * shortcut: 한글 숫자('오천만원')와 범위('3~5천만원')는 읽지 않는다, 그런 문장이 실제로 자주 보이면 coachAmount·rangeLowerText 로 넓힌다.
 */
export type SentenceFacts = {
  customer?: string;
  /** 고객이라고 짚어 말하지 않은(~대상·~에게·~을 위한) 나이대 낱말 하나(유아·노인·성인) — 쓰는 사람일 뿐 돈 내는 사람은 따로일 때가 많다 */
  customerLoose?: boolean;
  price?: number;
  /** '월 9,900원'처럼 한 달 값으로 적은 가격 — 건당 가격을 쓰는 업종에는 그대로 넣으면 안 된다 */
  priceMonthly?: boolean;
  budget?: number;
  hours?: number;
  goal?: string;
  capacity?: { period: "하루" | "일주일" | "한 달"; count: number };
  people?: string;
};

const WHO = String.raw`(?:[1-6]0(?:\s?[~-]\s?[1-6]0)?대|2030|3040|4050|5060|여성|남성|직장인|회사원|대학생|초등학생|중학생|고등학생|중고등학생|수험생|취준생|취업\s?준비생|학부모|주부|육아맘|워킹맘|임산부|신혼부부|1인\s?가구|자취생|시니어|어르신|노인|어린이(?!집)|유아|영유아|청소년|성인|소상공인|자영업자|사장님|스타트업|중소기업|프리랜서|외국인|관광객|여행객|캠핑족|초보자|입문자)`;
const WHO_RUN = new RegExp(`${WHO}(?:\\s?${WHO}){0,2}`, "g");
// '직장인인데 빵집을', '프리랜서로 일하려고'의 사람은 고객이 아니라 창업자 자신이다
const FOUNDER = /^\s?(?:인데|이고|이며|입니다|이에요|예요|이지만|이었|였|이라|출신|으?로\s?(?:일|활동)|[을를]\s?(?:그만|창업|시작|하려|준비)|생활)/;
// '~을 위한' 앞말은 사람·사업체일 때만 고객이다('건강을 위한 샐러드'의 건강은 고객이 아니다)
const PERSON = new RegExp(`${WHO}|님|고객|손님|사람|주민|가족|커플|부부|엄마|아빠|부모|환자|학생|[가-힣]인$|팀$|회사|업체|매장|가게|병원|학원|식당|카페|[가-힣]{2}자$|아기|아이$`);
const MARKED = /(?:^|[\s,])((?:[가-힣A-Za-z0-9~·]+\s?){1,3}?)\s?(대상|[을를]\s?위한|에게)/;

function readCustomer(text: string): { customer: string; loose?: boolean } | undefined {
  const marked = text.match(MARKED);
  // 장소·주어('동네에서', '저는')는 고객 앞에 붙은 말이라 뗀다
  const phrase = marked?.[1].trim().replace(/^.*(?:에서|에는|으로|저는|제가|저희는|우리는|이고|인데|이며|이지만)\s/, "").trim();
  if (phrase && phrase.length >= 2 && (marked![2] !== "대상" && marked![2] !== "에게" ? PERSON.test(phrase) : true)) return { customer: phrase };
  for (const who of text.matchAll(WHO_RUN)) {
    if (!FOUNDER.test(text.slice(who.index + who[0].length)) && !/(?:저는|제가|나는|내가)\s?$/.test(text.slice(0, who.index))) return { customer: who[0].trim(), loose: /^(?:영?유아|아기|어린이|아동|키즈|노인|어르신|시니어|성인)$/.test(who[0].trim()) };
  }
  return undefined;
}

const AMOUNT = /\d[\d,.]*(?:\s?[억만천백](?:\s?\d[\d,.]*)?)*\s?원?/g;
const NOT_MONEY = /^\s?(?:명|개|건|잔|회|부|권|장|평|보|뷰|구독자|팔로워|유튜버)/;
const OTHER_MONEY = /(?:월세|임대료|임차료|보증금|권리금|관리비|인건비|월급|연봉|대출|연\s?매출|빚)[은는이가을를]?\s*(?:월|약|한\s?달에?)?\s*$/;
const BUDGET_BEFORE = /(?:자본금?|예산|창업\s?비용?|창업\s?자금|초기\s?(?:비용|자금|투자금?)|종잣돈|모은\s?돈|투자금|가진\s?돈|자금|퇴직금)[은는이가을를]?\s*(?:총|약|한|대략)?\s*$/;
const BUDGET_AFTER = /^(?:\s?정도|쯤)?\s?(?:으로|로|\s?가지고|\s?갖고|\s?들고)\s.{0,14}(?:시작|창업|오픈|준비|차리|차려|열고|열려|여는)/;
const GOAL_BEFORE = /(?:매출|수익|순수익|순이익|수입|소득)\s?(?:목표)?[은는이가을를]?\s*(?:월|한\s?달에?|매달|약)?\s*$/;
const GOAL_AFTER = /^\s?(?:씩|정도|쯤|이상)?\s?(?:[을를은])?\s?(?:벌|버는|매출|수익|순수익|순이익|목표|남기)/;
const MONTHLY = /(?:월|한\s?달에?|매달|구독료|회비)[은는이가을를에]?\s*(?:약|평균)?\s*$/;
const PRICE_BEFORE = /(?:가격|값|요금|단가|수강료|이용료|객단가|(?:한|1)\s?(?:잔|개|판|끼|그릇|마리|벌|장|병|회|건|명|시간|박|인분|세트|타임)|[회건개인]당|시간당)[은는이가을를에]?\s*(?:약|평균)?\s*$/;
const PRICE_AFTER = /^\s?(?:짜리|에\s?(?:팔|판매|제공|받)|씩\s?받|[을를]\s?받|받고)/;

const CAPACITY = /(하루|매일|일주일|한\s?주|매주|한\s?달|매달)(?:에)?\s?(?:최대|평균|약)?\s?(\d{1,5})\s?(?:잔|건|개|명|팀|그릇|마리|판|회|대|권|병|벌|인분|끼|좌석|룸|타임|박)(?!\s*(?:목표|이상\s*목표))/;
const PERIOD: Record<string, "하루" | "일주일" | "한 달"> = { 하루: "하루", 매일: "하루", 일주일: "일주일", 한주: "일주일", 매주: "일주일", 한달: "한 달", 매달: "한 달" };
// 같이·함께 뒤 두 낱말 안에 시작하는 말이 있어야 동업이다('친구와 함께 놀러 갈 수 있는 카페'는 아니다)
const TOGETHER = /둘이서?|셋이서?|동업|(?<!신혼)부부(?!\s*(?:대상|[를을]|에게|상담|클리닉|모임))|(?:친구|가족|남편|아내|언니|오빠|형|누나|동생|엄마|어머니|아버지|아빠|부모님)(?:와|과|랑|이랑|하고)\s?(?:같이|함께|둘이)\s?(?:[가-힣]+\s){0,2}?[가-힣]*(?:창업|운영|시작|열|차리|차려|하려|해\s?보|하고\s?싶|만들|준비|꾸리)/;
/** 혼자 한다고 말한 문장 — '1인 가구'·'1인분'은 고객·양 이야기라 보지 않는다 */
export const SOLO = /(?:^|[^\d])1인(?!\s*(?:가구|분|용|당|석|실|세대|기준))|(?:혼자|나\s*홀로|홀로)\s*(?:서\s*)?(?:운영|하|할|해|일|시작|창업|꾸려)/;
const STAFF = /(?:직원|알바|아르바이트)(?:생)?\s?(?:\d명|한\s?명|두\s?명|[을를]\s?(?:두고|쓰고|고용|뽑))/;

export function readSentence(text: string): SentenceFacts {
  const facts: SentenceFacts = {};
  const who = readCustomer(text);
  if (who) { facts.customer = who.customer; if (who.loose) facts.customerLoose = true; }
  let previousEnd = 0;
  for (const match of text.matchAll(AMOUNT)) {
    const token = match[0].replace(/\s/g, ""), start = match.index, end = start + match[0].length;
    const before = text.slice(previousEnd, start).slice(-16), after = text.slice(end, end + 24);
    previousEnd = end;
    const amount = /원$/.test(token) || /[억만]/.test(token) && !NOT_MONEY.test(after) ? parseWonAmount(token) : undefined;
    if (!amount || OTHER_MONEY.test(before)) continue;
    const label = /원$/.test(token) ? token : `${token}원`;
    if (BUDGET_BEFORE.test(before) || !MONTHLY.test(before) && BUDGET_AFTER.test(after)) facts.budget ??= amount;
    else if (GOAL_BEFORE.test(before) || GOAL_AFTER.test(after)) {
      const months = text.match(/(\d{1,2})\s?개월\s?(?:안에|내에?|이내|안으로|만에|뒤|후)/), year = /(?:1|일)\s?년\s?(?:안에|내에?|이내|안으로|만에|뒤|후)/.test(text);
      const period = months && Number(months[1]) >= 1 && Number(months[1]) <= 12 ? `${Number(months[1])}개월 안에` : year ? "1년 안에" : "6개월 안에";
      facts.goal ??= `${period} ${/매출/.test(before + after) ? "월 매출" : "월 순수익"} ${label}`;
    } else if (PRICE_BEFORE.test(before) || MONTHLY.test(before) || PRICE_AFTER.test(after)) {
      if (facts.price === undefined) { facts.price = amount; if (MONTHLY.test(before)) facts.priceMonthly = true; }
    }
  }
  const capacity = text.match(CAPACITY);
  if (capacity && Number(capacity[2]) > 0) facts.capacity = { period: PERIOD[capacity[1].replace(/\s/g, "")], count: Number(capacity[2]) };
  const hours = text.match(/(?:주|일주일에?|매주|주당)\s?(\d{1,3})\s?시간/);
  if (hours && Number(hours[1]) > 0 && Number(hours[1]) <= 168) facts.hours = Number(hours[1]);
  if (TOGETHER.test(text)) facts.people = "동업자·가족과 함께";
  else if (STAFF.test(text)) facts.people = "직원·아르바이트 1~2명";
  else if (SOLO.test(text)) facts.people = "대표자 혼자";
  return facts;
}
