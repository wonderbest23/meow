/**
 * 계획서가 있는 사업의 "채팅으로 수정하기" — AI를 부르기 전에 규칙으로 먼저 거른다(소유자 결정 2026-10-07).
 * 다른 사업으로 바꾸기, 말투·문체 다듬기, 사업과 관계없는 말은 AI 비용 없이 정해진 답으로 끝낸다.
 * 그 밖의 말은 AI에 넘긴다 — 단어 목록으로 '사업 관련'을 가리면 "배달도 같이 할래", "커피 말고 디저트도 팔래" 같은
 * 정상 요청까지 막혔다(검토 2026-10-07). AI 쪽은 짧은 고정 프롬프트에 계획서당 하루 EDIT_DAILY_LIMIT회로 묶여 있다.
 */
export type EditRoute = "empty" | "new_business" | "style" | "off_topic" | "in_scope";

const NEW_BUSINESS = /(?:다른|딴|새로운?|새)\s*(?:사업|아이템|창업)|사업\s*(?:을|를)?\s*(?:바꾸|바꿀|변경|갈아)|업종\s*(?:을|를)?\s*(?:바꾸|바꿀|변경)|처음부터\s*다시|(?:사업|가게|창업|업종|카페|식당|음식점|쇼핑몰|학원|네일|펜션|앱|편의점|미용실)\s*(?:으로|로)\s*(?:할래|하고\s*싶|바꿀|바꿔|갈래|가자|정할래)/;
const STYLE = /말투|어투|문체|톤|공손|친근하게|딱딱|부드럽게|자연스럽게|매끄럽게|길게\s*(?:써|바꿔|늘려)|짧게\s*(?:써|바꿔|줄여)|맞춤법|띄어쓰기|오타|멋있게|있어\s*보이게|문장\s*(?:을|를)?\s*(?:다듬|고쳐)|표현\s*(?:을|를)?\s*(?:바꿔|다듬)/;
// 사업 내용이 전혀 없는 잡담만 AI 없이 끝낸다.
const CHITCHAT = /^(?:[ㅋㅎㅠㅜ.!?~\s]+|(?:안녕|하이|헬로|ㅎㅇ)\S*|(?:고마워|감사|땡큐|수고)\S*(?:\s*\S+)?|(?:너|넌|당신)\s*(?:는|은)?\s*(?:누구|뭐|정체)\S*|.*날씨.*|(?:심심|배고파|졸려)\S*)$/;

export function classifyEditRequest(text: string): EditRoute {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return "empty";
  if (NEW_BUSINESS.test(value)) return "new_business";
  if (STYLE.test(value) && !/\d/.test(value)) return "style";
  return CHITCHAT.test(value) || value.replace(/[^가-힣a-zA-Z0-9]/g, "").length < 2 ? "off_topic" : "in_scope";
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
