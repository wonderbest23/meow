/*
 * 주소의 사업을 찾지 못했을 때 화면마다 같은 말 — 예전엔 계획서는 말없이 목록으로, 대화는 '저장한 사업이 없습니다',
 * 결제는 '이미 열려 있어요'로 달랐다(점검 2026-10-22). 갈 곳은 늘 '내 사업'(/plan).
 * 화면 조각(app/plan/MissingBusiness.tsx)과 나눠 둔다 — 결제 화면 등이 이 말만 쓸 때 다른 화면의 스타일을 끌어오지 않게.
 */
export const MISSING_BUSINESS_TITLE = "사업을 찾지 못했어요";
export const MISSING_BUSINESS_DETAIL = "지웠거나 다른 계정에서 만든 사업일 수 있어요. 내 사업 목록에서 다시 골라 주세요.";
