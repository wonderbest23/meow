/**
 * 계획서가 있는 사업의 "채팅으로 수정하기" — AI를 부르기 전에 규칙으로 먼저 거른다(소유자 결정 2026-10-07).
 * 다른 사업으로 바꾸기, 말투·문체 다듬기, 사업과 관계없는 말은 AI 비용 없이 정해진 답으로 끝낸다.
 * 계획서의 숫자·사실(가격·고객·상품·목표 등)을 바꾸려는 말만 AI에 넘긴다.
 */
export type EditRoute = "empty" | "new_business" | "style" | "off_topic" | "in_scope";

const NEW_BUSINESS = /(?:다른|딴|새로운?|새)\s*(?:사업|아이템|창업)|사업\s*(?:을|를)?\s*(?:바꾸|바꿀|변경|갈아)|업종\s*(?:을|를)?\s*(?:바꾸|바꿀|변경)|처음부터\s*다시|(?:사업|가게|창업|업종|카페|식당|음식점|쇼핑몰|학원|네일|펜션|앱|편의점|미용실)\s*(?:으로|로)\s*(?:할래|하고\s*싶|바꿀|바꿔|갈래|가자|정할래)/;
const STYLE = /말투|어투|문체|톤|공손|친근하게|딱딱|부드럽게|자연스럽게|매끄럽게|길게\s*(?:써|바꿔|늘려)|짧게\s*(?:써|바꿔|줄여)|맞춤법|띄어쓰기|오타|멋있게|있어\s*보이게|문장\s*(?:을|를)?\s*(?:다듬|고쳐)|표현\s*(?:을|를)?\s*(?:바꿔|다듬)/;
const FACT = /가격|요금|금액|단가|객단가|비용|원가|재료비|포장비|고정비|임대료|월세|인건비|예산|자금|준비금|고객|대상|타깃|손님|소비자|불편|문제|상품|서비스|메뉴|제품|채널|홍보|판매처|판매\s*경로|인스타|네이버|당근|유튜브|배달앱|시간|인력|직원|혼자|동업|가족|목표|매출|단골|판매량|주문|처리량|하루|일주일|한\s*달|개월|\d/;

export function classifyEditRequest(text: string): EditRoute {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return "empty";
  if (NEW_BUSINESS.test(value)) return "new_business";
  if (STYLE.test(value) && !/\d/.test(value)) return "style";
  return FACT.test(value) ? "in_scope" : "off_topic";
}

/** Fixed replies for requests that never reach the AI. */
export const EDIT_REPLIES: Record<Exclude<EditRoute, "in_scope">, string> = {
  empty: "바꾸고 싶은 내용을 적어 주세요. 예: 가격을 6만 5천원으로, 주 고객을 1인 가구로",
  new_business: "지금 계획서는 이 사업 기준이에요. 다른 사업은 왼쪽 위 \"새 대화\"에서 따로 시작할 수 있어요.",
  style: "말투나 문체는 바꾸지 않아요. 가격·고객·상품·목표처럼 계획서 내용을 바꾸고 싶으면 말씀해 주세요.",
  off_topic: "이 대화에서는 계획서 내용 수정만 도와드려요. 예: 가격을 6만 5천원으로, 주 고객을 1인 가구로",
};

/** Requests to change the plan's facts per plan per day, on top of the account-wide AI limit. */
export const EDIT_DAILY_LIMIT = 20;
