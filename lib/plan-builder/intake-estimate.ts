import { localFieldSuggestions, rankedSectors } from "./local-suggestions";
import { SUGGESTION_FIELDS } from "./answer-suggestion-fields";
import { businessKind, type BusinessKind } from "./business-kinds";
import { monthlyVolumeFromCapacity } from "./coach-feasibility";
import { readSentence } from "./intake-sentence";
import type { ProposalSector } from "./proposal-blueprint";

/*
 * 한 문장에서 나머지 답을 짐작하는 자체 알고리즘 — AI·네트워크 없이 표와 규칙만 쓴다(0원, 같은 문장이면 같은 답).
 *
 * 묻지 않고 채운 값은 모두 '제안'(basis: "proposal")으로 저장돼 화면·문서에 짐작으로 표시되고, 사용자가 고치면 그 값이 이긴다.
 * 아래 기준표는 출발값이다 — 실제 사업자가 고친 값이 쌓이면 업종(나중엔 동네)별 중앙값으로 이 표를 바꾼다.
 * 문장에 사용자가 직접 적은 고객·가격·하루 수량·목표·자본금은 표보다 먼저 쓴다(intake-sentence).
 */

type Baseline = { price: number; unitCost: number; cost: number; capacity: string };

/** 대표 상품 1건 값 · 1건 비용 · 월 고정비 · 혼자 감당하는 양. 모든 행은 월 판매량 × (값 − 비용) > 월 고정비 를 지킨다(테스트가 확인). */
export const SECTOR_BASELINES: Record<ProposalSector, Baseline> = {
  b2b_service: { price: 650_000, unitCost: 65_000, cost: 1_000_000, capacity: "한 달 4건" },
  software: { price: 13_000, unitCost: 1_300, cost: 1_000_000, capacity: "한 달 300명" },
  food_beverage: { price: 7_500, unitCost: 2_600, cost: 3_000_000, capacity: "하루 40건" },
  retail_commerce: { price: 20_000, unitCost: 10_000, cost: 1_000_000, capacity: "하루 15개" },
  manufacturing: { price: 5_500, unitCost: 2_800, cost: 3_000_000, capacity: "하루 60개" },
  education: { price: 200_000, unitCost: 20_000, cost: 1_000_000, capacity: "한 달 10명" },
  local_service: { price: 40_000, unitCost: 4_000, cost: 1_000_000, capacity: "일주일 10건" },
  space_hospitality: { price: 15_000, unitCost: 1_500, cost: 3_000_000, capacity: "하루 10건" },
  logistics: { price: 7_500, unitCost: 3_800, cost: 3_000_000, capacity: "하루 40건" },
  content_media: { price: 130_000, unitCost: 13_000, cost: 1_000_000, capacity: "한 달 12개" },
  general: { price: 30_000, unitCost: 3_000, cost: 1_000_000, capacity: "일주일 10건" },
};

/** 사업 종류가 아닌 낱말 — 손님 업종('식당 사장님들에게', '카페에', '미용실 전용', '농가 대상')과 파는 곳('인스타로', '스마트스토어로'). 종류를 찾을 때만 뺀다 */
const KIND_NOISE = /[가-힣a-z]+(?:\s*사장님들?)?(?:에게|한테)\s|[가-힣a-z]+\s*(?:전용|대상|납품용)\s|[가-힣a-z]+(?:(?<![미이사비고채활응])용|에)\s|(?:인스타(?:그램)?|유튜브|블로그|스마트스토어|라이브커머스|쿠팡|온라인|트럭)(?:으로|로|에서)\s/gi;

/** 파는 곳만 가리키는 낱말 — 사전이 이미 종류를 찾았으면 이 낱말로 뒤집지 않는다(굿즈 스마트스토어 → 굿즈) */
const CHANNEL_WORD = /^(?:스마트스토어|오픈마켓|온라인쇼핑몰|쇼핑몰|쿠팡|라이브커머스)/;
/** 문장에 적은 배우는 사람의 나이대 — 교육 업종에서 종류의 고객 문구 속 나이대(중·고등학생)를 이걸로 바꾼다 */
const LEARNERS: readonly (readonly [RegExp, string])[] = [[/유아|유치부|미취학/, "5~7세 아이"], [/초중등|초·중등/, "초·중학생"], [/초등|어린이|키즈/, "초등학생"], [/중등|중학/, "중학생"], [/고등|고3|수험생/, "고등학생"], [/성인|직장인/, "성인·직장인"]];
const LEARNER_IN_CUSTOMER = /(?:초·?중·?고등?|초·?중등?|중·?고등?|초등|중|고등)학생|5~7세 아이|성인·직장인|^(?:유아|어린이|초중등|초등|중등|고등|성인|직장인)$/;
/** 문장에 적은 파는 곳 — 물건·음식을 파는 업종에서 그 종류의 채널(매장 방문) 대신 이것을 둔다 */
const SOLD_AT: readonly (readonly [RegExp, string])[] = [[/스마트스토어/, "스마트스토어"], [/쿠팡/, "쿠팡"], [/라이브\s*커머스/, "라이브커머스"], [/인스타(?:그램)?\s*(?:공구|마켓|로|에서)/, "인스타그램"], [/배달\s*(?:전문|전용)|배달로?만/, "배달앱"], [/트럭으로|이동\s*판매/, "아파트 장터·길거리"]];
/** 거래처에 대 주는 일 — '도매시장에서 떼다 파는' 쪽은 아니다 */
const SUPPLY = /납품|oem|odm|하청|임가공|도매(?!\s*(?:시장|상가|업체)?에서)/i;
/** 문장에 적은 전문 분야('여드름 관리 전문', 'PT 전문') — 앞의 한두 어절 */
const FOCUS = /((?:[가-힣a-z0-9]+\s)?[가-힣a-z0-9]+)\s?(전문|특화)(?![가-힣]*(?:가|의|직))/i;
/** 전문 분야가 아니라 파는 방식·꾸밈말 */
// 조사·어미가 붙은 어절(앞에서·만드는·하려고) — 이런 어절이 있으면 명사구가 아니다
const NOT_NOUN = /(?:에서|으로|해서|하는|하고|이랑|려고|에게|한테|부터|까지|[을를은는에의]|[가-힣]{3,}로|[가-힣](?:는|던|할|한|된|될)|요|다)$/;
// 어느 업종에나 붙는 말 — 남겨도 뜻이 없다
const PLAIN_WORD = /^(?:가게|매장|전문점?|판매|쇼핑몰|스토어|창업|운영|제작|대행|업체|회사|공장|제조|도매|소매|시공|공사|설치|서비스|사업|장사|센터|스튜디오|공방|클래스|교실|학원|농장|용역|위주|작은|개인|매매|수리|관리|전문가|프리랜서|외주|업|및|방앗간|면허|자격증|허가|등록|배송|설비|사진|채용|골목|상가|돌봄|노인|시험|건조|설계|실내|전용|차량|오픈|파견|영업|시설|기업|공간|임대|유통|납품|운반|교체|농사|재배|인수|준비|개업|설립|개설|기사|사육|채취|가공|조립|대여|렌탈|교육|강의|레슨|수업|과외|상담|컨설팅|촬영|디자인|개발|배달|수거|조사|구축|유료|주문|계약|운행|작가|활용|인테리어|스마트스토어|출강|수제|전통|임가공|oem|odm|프랜차이즈|가맹|무인|24시간|근처|소형|대형|고급|프리미엄|[가-힣a-z0-9]*(?:집|점|당|숍|샵|카페|가게|몰|관|소|상|마트|주점|술집|센터|센타|방|학원|법인|업체|펌|세차장))$/i;
const MODE_WORD = /배달|포장|테이크아웃|온라인|출장|방문|예약|경력|분야|지역|동네|소규모|1인|여성|남성|유아|초등|중등|고등|성인/;
const SELLS_GOODS: ReadonlySet<ProposalSector> = new Set(["retail_commerce", "food_beverage", "manufacturing"]);
const ONLINE = /스토어|오픈마켓|쿠팡|인스타|온라인|자사몰|커머스|앱/;
/** 매장에 들르는 손님을 가리키는 말 — 온라인·배달로 판다고 적었으면 이 고객 문구는 맞지 않는다 */
const WALK_IN = /동네|퇴근길|근처|인근|산책|구경|들르/;
/** 가게·병원·학원 운영자가 쓰는 프로그램의 출발값(한 곳당 월 이용료) — 개인용 앱 값(월 5,900원)을 그대로 두지 않는다 */
const OPERATOR_TOOL: Baseline = { price: 33_000, unitCost: 5_000, cost: 1_500_000, capacity: "한 달 80곳" };
const TOOL_TAIL = /(?:앱|어플|소프트웨어|솔루션|플랫폼|saas|툴|ai\s*(?:튜터|비서)|(?:관리|계산|분석|예측)\s*(?:프로그램|시스템)|예약\s*(?:관리\s*)?(?:프로그램|시스템|서비스))(?:\s*(?:개발|제작|서비스|창업|스타트업))?$/i;

/** 낱말 규칙(kind-rules.ruleKind)의 모양. 표가 커서 서버 쪽 호출자가 넘겨준다 — 여기서 import 하면 화면 묶음에 딸려 들어간다 */
export type KindRules = ((text: string, allow: (sector: ProposalSector, ksic: string) => boolean) => (BusinessKind & { ksic: string; word: string; named?: boolean }) | null) & { knows?: (word: string) => boolean };

/**
 * 질문 id → 짐작한 답(문자열). 고를 문구가 없는 질문은 빠진다 — 그 질문은 평소처럼 묻는다.
 * chosen·chosenKsic 은 사용자가 이미 고른 업종·분류다(짐작이 그것을 뒤집지 않는다). ksic 은 낱말 규칙으로 찾았을 때만 온다.
 */
export function estimateIntake(text: string, chosen?: ProposalSector, rules?: KindRules, chosenKsic?: string | null): { sector: ProposalSector; ksic: string | null; /** 사전·규칙에서 사업 종류를 찾았는지 — 못 찾았으면 파는 것·고객은 짐작하지 않고 묻게 둔다 */ matched: boolean; answers: Record<string, string> } {
  // 흔한 표기 차이는 사전 표기로 맞춘 뒤 찾는다
  const spelled = text.replace(/까페/g, "카페").replace(/찌게/g, "찌개");
  // 문장이 앱·프로그램으로 끝나면 파는 것은 소프트웨어다 — 이때는 손님 업종 낱말('학원 전용')이 종류를 정하는 단서라 빼지 않는다
  // 뒤에 붙인 값('…프로그램, 월 1만원')은 떼고 본다
  const tool = !chosen && TOOL_TAIL.test(spelled.trim().replace(/[,.]?\s*(?:월|한\s*달에?)?\s*[0-9.,]+\s*[천만]?\s*원.*$/, "").trim());
  const heard = tool ? spelled : spelled.replace(KIND_NOISE, " ");
  // 'X도 (같이)'로 곁들인 것은 본업이 아니다('네일샵, 속눈썹도 같이'는 네일샵이다) — 그 앞쪽에서 종류를 찾을 수 있으면 앞쪽만 보고 찾는다
  const side = !tool && !chosenKsic ? heard.match(/([가-힣a-z0-9]{2,})도(?=\s*(?:같이|함께|병행|하|할|해|열|만들|제작|판매|팔|취급|운영|제공|가능|포함|,|$))/i) : null;
  // '도'로 끝나는 낱말(설계도·투시도·제주도)은 곁들임이 아니다
  const sideOk = !!side && !/^(?:설계|투시|조감|배치|평면|단면|해부|구성|조직|안내|노선|태권|합기|제주|경기|강원|충청|전라|경상|울릉|강화|거제|청포|머루)$/.test(side[1]);
  const before = sideOk ? heard.slice(0, side!.index) : "", main = (before.includes(",") ? before.slice(0, before.lastIndexOf(",")) : before).trim();
  const sided = main.length >= 2 && !!(rules?.(main, sector => sector !== "software") ?? businessKind(main, chosen ?? rankedSectors(main)[0]));
  const said = sided ? main : heard;
  const ranked = tool ? ["software" as const] : rankedSectors(said);
  // 세부 업종을 찾으면 그 줄의 답과 숫자를 쓴다: 손으로 쓴 사전(치킨집·꽃집) → 낱말 규칙(수만 개) → 못 찾으면 업종 한 줄 기준값과 칩에서 고른 답
  const hand = businessKind(said, chosen ?? ranked[0]);
  // 공장·제조라고 적었으면 같은 낱말의 가게·도매 줄보다 만드는 줄을 먼저 본다('냉동 만두 만드는 식품 공장'이 냉동식품 할인점이 됐다)
  const makes = !tool && !chosen && !chosenKsic && /공장(?!\s*(?:청소|철거|자동화|설비|부지|임대|매매))|제조/.test(said);
  // 제조업은 분류 앞 두 자리가 10~34다(식품 제조는 업종 묶음이 음식이라 묶음 이름으로는 못 고른다)
  const stripped = (makes ? rules?.(said, (_, ksic) => ksic >= "10" && ksic < "35") : null) ?? rules?.(said, (sector, ksic) => chosenKsic ? ksic === chosenKsic : tool ? sector === "software" : !chosen || sector === chosen) 
    // 고른 업종 안에 그 종류가 없으면 전체 표에서 찾는다 — 화면 업종 칸은 넓어서 사람마다 다르게 고른다(맞춤 정장을 '생활 서비스'로, 법무사를 '기타'로). 업종 자체는 고른 대로 둔다
    // 소프트웨어를 골랐으면 찾지 않는다(카페 예약 앱은 카페가 아니다)
    ?? (chosen && chosen !== "software" && !chosenKsic ? rules?.(said, sector => sector !== "software") : null) ?? null;
  // 'X 전용'은 보통 고객이라 떼고 찾지만, X 가 종류 이름의 일부면(배드민턴 전용 체육관 → 배드민턴체육관) 떼지 않은 문장에서 찾은 줄을 쓴다
  const own = !tool && !chosen && !chosenKsic && spelled.match(/([가-힣a-z]+)\s*전용\s/i)?.[1], whole = own ? rules?.(spelled, () => true) : null;
  const found = whole && whole.word.includes(own as string) && whole.word.length > (own as string).length ? whole : stripped;
  // 사전에도 있지만 낱말 규칙이 그보다 짧지 않은 낱말로 맞았으면(청소 → 입주청소, 식당 → 식자재납품) 더 구체적인 규칙 줄을 쓴다. 사업자용 앱·프로그램은 예외다(카페용 앱은 카페가 아니다)
  const handWord = hand?.word.toLowerCase().replace(/\s/g, "") ?? "";
  const rule = !hand || (found && (found.word.length >= handWord.length || found.named) && !CHANNEL_WORD.test(found.word) && (hand.sector !== "software" || found.sector === "software")) ? found : null;
  const kind = rule ?? hand, sector = rule?.sector ?? chosen ?? ranked[0];
  const read = readSentence(text);
  const picked = kind ?? SECTOR_BASELINES[sector];
  // 가게·병원 운영자나 공장·기업이 쓰는 프로그램이면 개인용 앱 값 대신 사업자용 출발값을 쓴다
  const base = sector === "software" && picked.price < 30_000 && !read.price && (/운영자$/.test(read.customer ?? "") || /공장|기업|회사|업체|b2b/i.test(text)) ? OPERATOR_TOOL : picked;
  // 한 달 값으로 적은 가격('월 15만원')인데 건당으로 세는 업종이면 감당하는 양도 한 달 회원 수로 바꾼다 — 건당 자리에 그대로 두면 매출이 몇십 배로 부푼다
  const monthly = !!read.priceMonthly && !base.capacity.startsWith("한 달");
  // 체험·원데이라고 적었는데 한 달 회비로 세는 줄이 맞았으면(승마 체험장 → 월 회원권) 1회 값으로 바꾼다 — 아래 each 가 한 달 횟수도 맞춘다
  // shortcut: 1회 값은 월 회비의 4분의 1로 본다, 체험 줄이 따로 생기면 그 줄이 맞는다
  const trial = !read.price && /체험|원데이/.test(text) && base.capacity.startsWith("한 달") && /월\s|\(월|회원권/.test(kind?.offer ?? "");
  // 납품·도매·OEM이라고 적었는데 소비자에게 파는 줄이 맞았으면 값을 납품가로 낮춘다(건당 비용도 아래에서 같은 비율로 따라간다)
  // shortcut: 납품가는 소매가의 70%로 본다, 납품가를 따로 적은 줄이 생기면 그 값을 쓴다
  const wholesale = !!kind && sector !== "software" && !read.price && SUPPLY.test(text) && !/납품(?:도|\s*겸)|겸\s*납품|병행/.test(text) && !/영업|거래처|견적|납품|위판|도매|입찰/.test(`${kind.channel}${kind.offer}`);
  const round = (value: number) => { const step = value >= 10_000 ? 1000 : value >= 1000 ? 100 : 10; return Math.round(value / step) * step; };
  const price = read.price ?? (trial ? Math.max(1000, Math.round(base.price / 4000) * 1000) : wholesale ? round(base.price * 0.7) : base.price);
  // 거꾸로 한 달 회원으로 세는 업종에 회당 값('회당 4만원 과외')을 적었으면 한 달 횟수로 바꾼다 — 회원 자리에 그대로 두면 적자 초안이 된다
  const each = !read.priceMonthly && base.capacity.startsWith("한 달") && price * 3 < base.price;
  const unit = base.capacity.match(/[가-힣·]+$/)?.[0] ?? "건";
  const stated = read.capacity && (!monthly || read.capacity.period === "한 달") ? `${read.capacity.period} ${read.capacity.count}${unit}` : undefined;
  const amount = stated ?? (monthly || each ? `한 달 ${Math.max(1, Math.round((monthlyVolumeFromCapacity(base.capacity)?.volume ?? 1) * base.price / price))}${monthly ? "명" : "회"}` : base.capacity);
  // '공장'이라고 적었는데 혼자 하는 규모의 줄이 맞았으면 직원을 둔 것으로 본다. 그 줄의 남는 돈이 급여 한 명분(220만원)을 감당할 때만 고정비에도 더한다(적자 초안을 만들지 않게)
  // 공장·OEM이라고 적었는데 혼자·두세 명 규모의 줄이 맞았으면 공장 규모로 본다: 처리량 5배, 직원 3명 이상, 고정비 3배 + 급여 3명분
  // 그렇게 키워도 부가세를 뺀 뒤 남을 때만 쓴다(적자 초안을 만들지 않게). shortcut: 5배·3배는 어림값이다, 공장 규모 줄이 따로 생기면 그 줄이 맞는다
  const PLANT_COST = (cost: number) => cost * 3 + 6_600_000 - (kind?.people ? 2_200_000 : 0);
  // 이미 공장 규모인 줄(한 달 매출 2천만원 이상)과 공장을 상대하는 서비스(스마트공장 컨설팅)는 키우지 않는다
  const baseVolume = monthlyVolumeFromCapacity(base.capacity)?.volume ?? 0;
  const plantFits = !!kind && !["software", "b2b_service", "education"].includes(sector) && baseVolume * base.price < 20_000_000 && !read.people && !read.capacity && !monthly && !each && kind.people !== "직원 3명 이상" && /공장(?!\s*(?:청소|철거|자동화|설비|부지|임대|매매))|oem|odm/i.test(said)
    && baseVolume * 5 * (price * 10 / 11 - price * base.unitCost / base.price) - PLANT_COST(base.cost) > 0;
  const plantAmount = plantFits ? amount.replace(/\d[\d,]*/, count => String(Number(count.replace(/,/g, "")) * 5)) : amount;
  const factory = !plantFits && !read.people && !kind?.people && /공장(?!\s*(?:청소|철거|자동화|설비|부지|임대|매매))/.test(said);
  const wage = factory && (monthlyVolumeFromCapacity(base.capacity)?.volume ?? 0) * (base.price - base.unitCost) - base.cost > 2_200_000 ? 2_200_000 : 0;
  const answers: Record<string, string> = {
    price: `${price}원`,
    // 가격을 문장에서 읽었으면 건당 비용도 같은 비율로 맞춘다
    "structure.unitCost": `${price === base.price ? base.unitCost : Math.round(price * base.unitCost / base.price / 100) * 100}원`,
    "structure.cost": `${plantFits ? PLANT_COST(base.cost) : base.cost + wage}원`,
    capacity: `${plantFits ? "직원 3명 이상" : read.people ?? kind?.people ?? (factory ? "직원·아르바이트 1~2명" : "대표자 혼자")} / ${plantAmount}`,
    goal: read.goal ?? "6개월 안에 손익분기 도달",
  };
  if (read.budget) answers.budget = `${read.budget}원`;
  if (read.hours) answers.hoursPerWeek = `${read.hours}시간`;
  for (const field of SUGGESTION_FIELDS) {
    // 하나로 정해 넣는 답은 1순위 업종 칩에서만 고른다 — 2순위 업종 칩이 섞이면 예약 앱의 고객이 '단체 예약 손님'이 됐다
    const guess = kind?.[field] || localFieldSuggestions(text, field, [sector], "startup")[0];
    if (guess) answers[field] = guess;
  }
  const taster = trial ? answers.offer?.split(/\s*(?:월\s|\(|정규반|교실|수업|레슨|회원권)/)[0].trim() : "";
  if (taster) answers.offer = `${taster}${taster.includes("체험") ? "" : " 체험"} 1회`;
  // 소프트웨어는 줄마다 값이 비슷해 문장이 가장 정확한 설명이다('공유 주차장 예약 플랫폼'이 '체험·모임 예약 중개'가 됐다) — 파는 것은 적은 말 그대로 두고,
  // 줄의 낱말이 파는 것에 그대로 들지 않았으면(넓은 낱말로 맞은 줄) 그 줄의 고객 대신 업종의 넓은 고객을 둔다
  if (sector === "software") {
    const own = text.trim().replace(/[,.]?\s*(?:월|한\s*달에?)?\s*[0-9.,]+\s*[천만]?\s*원.*$/, "").replace(/[.!?~\s]*$/, "").replace(/\s*(?:[을를]\s*)?(?:(?:창업|개발|제작|출시|운영)\s*)?(?:(?:만들|하려|해보|준비|시작|생각)[가-힣\s]*)?$/, "").trim();
    if (own.length >= 4 && own.length <= 30) {
      answers.offer = own;
      // 누가 쓰는지는 문장에 없으면 짐작하지 않는다 — 고객 질문을 그대로 묻는다
      if (rule && !rule.named) { if (hand?.customer) answers.customer = hand.customer; else delete answers.customer; }
    }
  }
  // 사전의 넓은 고객('개인 사용자')은 짐작이 아니라 빈칸에 가깝다 — 고객 질문을 묻는다
  if (sector === "software" && answers.customer === "개인 사용자" && !read.customer) delete answers.customer;
  // 소프트웨어는 동네 가게처럼 지도 검색으로 손님을 만나지 않는다. 가게·병원 운영자가 쓰는 프로그램은 찾아가서 판다
  if (sector === "software") {
    if (/운영자$/.test(read.customer ?? "") && /인스타|앱스토어|앱 마켓|플레이스/.test(answers.channel ?? "")) answers.channel = "직접 영업·업종 커뮤니티";
    else if (/플레이스|매장 방문/.test(answers.channel ?? "")) answers.channel = "검색·블로그 콘텐츠";
  }
  // 사용자가 적은 고객이 표의 고객 문구에 이미 들어 있으면 더 자세한 표 문구를 둔다. 종류를 찾았는데 문장 속 낱말 하나뿐이면('유아용품'의 유아) 그 종류의 고객(아이 키우는 부모)을 둔다
  if (read.customer && !(read.customerLoose && kind) && !answers.customer?.includes(read.customer.replace(/^납품받는 /, ""))) answers.customer = read.customer;
  // 교육: 문장에 적은 나이대(초등·어린이·성인)가 종류의 고객 문구와 다르면 그 자리만 바꾼다('수학에서 자꾸 막히는 중·고등학생' → 초등학생)
  const learner = sector === "education" ? LEARNERS.find(([test]) => test.test(text))?.[1] : undefined;
  if (learner && answers.customer && !answers.customer.includes(learner) && LEARNER_IN_CUSTOMER.test(answers.customer)) answers.customer = answers.customer.replace(LEARNER_IN_CUSTOMER, learner);
  // 가게·매장이라고 적었으면 온라인 장터가 아니라 매장에서 판다
  if (/가게|매장|점포|오프라인|카페|식당/.test(text) && !/온라인|스토어|쇼핑몰|택배/.test(text) && /오픈마켓|스마트스토어|쿠팡/.test(answers.channel ?? "")) answers.channel = "매장 방문";
  // 파는 곳을 문장에 적었으면(스마트스토어로·배달 전문·온라인) 그것을 둔다. 물건·음식을 파는 업종만이다('스마트스토어 운영 대행'은 파는 곳이 아니다)
  const soldAt = SELLS_GOODS.has(sector) ? SOLD_AT.find(([test]) => test.test(text))?.[1] ?? (/온라인|쇼핑몰/.test(text) && !ONLINE.test(answers.channel ?? "") ? "스마트스토어·자사몰" : undefined) : undefined;
  if (soldAt && soldAt !== answers.channel) {
    // 매장에 들르는 손님 문구와 '동네에 가게가 없음' 같은 불편은 짐작으로 고쳐 쓰지 않고 그 질문을 그대로 묻는다
    if (answers.customer !== read.customer && WALK_IN.test(answers.customer ?? "")) delete answers.customer;
    if (WALK_IN.test(answers.problem ?? "")) delete answers.problem;
    answers.channel = soldAt;
  }
  // 시장 안에서 하는 장사는 배달앱이 아니라 지나는 손님이다. 기업 출강은 개인 수강생이 아니라 회사 교육 담당자다
  if (/시장\s*(?:안|내|에서)/.test(text) && answers.channel === "배달앱") answers.channel = "매장 방문";
  if (/출강/.test(text) && kind) { answers.channel = "직접 영업·기존 거래처"; if (!read.customer || /^(?:기업|회사)$/.test(read.customer)) answers.customer = "직원 교육을 맡은 기업 인사·교육 담당자"; }
  // 수출이라고 적었으면 국내 손님이 아니라 해외 바이어다(수출 줄이 맞았으면 그 줄의 답을 둔다)
  if (/수출|해외\s*(?:판매|바이어)/.test(text) && kind && !read.customer && !/수출|무역|해외/.test(answers.offer ?? "")) { answers.customer = "한국 제품을 들여가려는 해외 바이어·현지 유통상"; answers.channel = "수출 상담회·해외 바이어 직접 영업"; }
  // 납품·도매·OEM이라고 적었으면 손님을 모으는 채널(스마트스토어·인스타그램·매장)이 아니라 거래처를 직접 찾아간다
  if (SUPPLY.test(text) && !/영업|거래처|견적/.test(answers.channel ?? "")) answers.channel = "직접 영업·기존 거래처";
  // '그림책 전문', '고양이 진료 특화'처럼 문장에 적은 전문 분야가 그 종류의 파는 것에 없으면 뒤에 붙여 둔다 — 줄을 더 잘게 나누지 않아도 적은 말이 초안에 남는다
  const focus = kind && sector !== "software" && answers.offer ? text.match(FOCUS) : null;
  if (focus && !MODE_WORD.test(focus[1])) {
    // 이미 파는 것이나 맞은 낱말에 든 말이면(두 글자만 겹쳐도) 붙이지 않는다 — '전기자전거 전문'을 '전기 자전거'에 또 붙이지 않게
    const has = `${answers.offer}${kind!.word ?? ""}`.replace(/\s/g, "").toLowerCase(), words = focus[1].toLowerCase().split(" ").filter(word => word.length >= 2);
    // 겹치는 낱말은 빼고 남는 낱말만 붙인다('여드름 관리 전문' + '얼굴 피부 관리' → 여드름 전문)
    const apart = words.filter(word => ![...word].some((_, at) => at + 2 <= word.length && has.includes(word.slice(at, at + 2))));
    const fresh = apart.length === words.length ? apart : apart.filter(word => !PLAIN_WORD.test(word) && !NOT_NOUN.test(word));
    if (fresh.length) answers.offer = `${answers.offer} · ${fresh.length === words.length ? focus[1] : fresh.join(" ")} ${focus[2]}`;
  }
  // 가운뎃점·빗금으로 붙여 쓴 품목('도배·장판 시공')도 띄어 쓴 것처럼 나눠 본다
  // 짧은 명사구('도배 장판', '한우 오마카세', '초등 수학 공부방')에서 그 종류의 파는 것에 안 담긴 낱말은 뒤에 붙여 둔다 — 나란히 적은 품목·한정어가 초안에서 사라지지 않게
  // shortcut: 값·고객은 맞은 줄 그대로다(장판을 붙여도 값은 도배 값), 그 품목 줄이 따로 생기면 그 줄이 맞는다
  else if (kind && sector !== "software" && answers.offer) {
    const head = text.split(/[,.(]/)[0].trim().split(/[\s·ㆍ・/]+/).filter(word => word && !/^(?:겸|및)$/.test(word));
    if (head.length >= 2 && head.length <= 4 && head.every(word => /^[가-힣a-z0-9]{1,8}$/i.test(word) && !NOT_NOUN.test(word))) {
      const has = `${answers.offer}${answers.customer ?? ""}${kind.word ?? ""}`.replace(/\s/g, "").toLowerCase();
      const left = head.filter(word => word.length >= 2 && !PLAIN_WORD.test(word) && !MODE_WORD.test(word) && ![...word.toLowerCase()].some((_, at) => at + 2 <= word.length && has.includes(word.toLowerCase().slice(at, at + 2)))
        // 표가 아는 다른 품목일 때만 붙인다('장판'·'청국장') — '재배'·'인수'·'준비' 같은 말은 붙이지 않는다
        // '겸'·'및'으로 이었으면 앞말을 같이 쓰는 품목도 친다('강아지 유치원 겸 호텔'의 호텔 → 강아지호텔)
        && (rules?.knows?.(word.toLowerCase()) || /\s(?:겸|및)\s/.test(text) && head.some(other => other !== word && rules?.knows?.(`${other}${word}`.toLowerCase()))));
      if (left.length && left.length <= 2) answers.offer = `${answers.offer} · ${left.join(" ")}`;
    }
  }
  // 곁들인 품목은 뒤에 남긴다(표가 아는 품목일 때만)
  if (sided && kind && answers.offer && !PLAIN_WORD.test(side![1]) && rules?.knows?.(side![1].toLowerCase()) && !answers.offer.includes(side![1])) answers.offer = `${answers.offer} · ${side![1]}`;
  // 종류를 못 찾았으면 업종 표의 넓은 답(1회 서비스·개인 소비자)을 채우지 않는다 — 그 두 질문은 평소처럼 묻는다. 문장에 적은 고객은 둔다
  if (!kind) { if (sector !== "software") delete answers.offer; if (!read.customer) delete answers.customer; }
  return { sector, ksic: rule?.ksic ?? null, matched: !!kind, answers };
}
