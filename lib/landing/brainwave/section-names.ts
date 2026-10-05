/*
 * 구역 이름 — 디자인 파일의 영어 내부 이름(Hero, CTA Form, Footer/Light/Style 02…)을
 * 사장님이 읽는 말로. 모르는 이름은 '구역'.
 */
const SECTION_NAMES: Array<[RegExp, string]> = [
  [/^hero/i, "첫 화면"], [/^header/i, "맨 위 메뉴"], [/^footer/i, "맨 아래 정보"], [/cta ?form|subscribe/i, "문의 양식"],
  [/^cta/i, "마무리 안내"], [/testimonial/i, "손님 후기"], [/^alert/i, "알림 띠"], [/services?/i, "서비스 소개"],
  [/facts/i, "숫자로 보는 소개"], [/features/i, "특징"], [/pricing/i, "가격"], [/faq/i, "자주 묻는 질문"],
  [/video/i, "영상"], [/^how/i, "이용 방법"], [/locations?/i, "오시는 길"], [/all items|category/i, "상품 목록"],
  [/content ?0?2/i, "소개 글 2"], [/content/i, "소개 글"], [/heart|path/i, "장식"],
];
export function sectionNameKo(name?: string | null): string {
  const raw = (name ?? "").trim();
  return SECTION_NAMES.find(([test]) => test.test(raw))?.[1] ?? "구역";
}
