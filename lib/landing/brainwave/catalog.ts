/*
 * Brainwave.io Landing Page UI Kit (Figma Community, Seju_ui_ux, CC BY 4.0)
 * 파일 키 AeGTjTTByOZTjZv7Pt8Ehd — 페이지 26장을 노드 그대로 옮겼다.
 *
 * 생성: scripts/brainwave-convert.py (Figma MCP get_design_context 출력 → pages/*.json)
 * 자산: public/brainwave/<id>/
 * 세로 길이(h)는 Figma 프레임에서 잰 값이다.
 */
export type BrainwavePageMeta = { id: string; node: string; name: string; group: "landing" | "inner"; h: number; ko: string };

export const BRAINWAVE_PAGES: BrainwavePageMeta[] = [
  { id: "0-2555", node: "0:2555", name: "01-Agency",            group: "landing", h: 7713, ko: "에이전시" },
  { id: "0-2385", node: "0:2385", name: "02-SaaS Subscription", group: "landing", h: 6035, ko: "구독 서비스" },
  { id: "0-2226", node: "0:2226", name: "03-Coworking",         group: "landing", h: 5719, ko: "공유 공간" },
  { id: "0-1950", node: "0:1950", name: "04-Job Site",          group: "landing", h: 5951, ko: "채용 사이트" },
  { id: "0-1371", node: "0:1371", name: "05-Web Application",   group: "landing", h: 5107, ko: "웹 서비스" },
  { id: "0-1102", node: "0:1102", name: "06-ECommerce",         group: "landing", h: 5998, ko: "온라인 상점" },
  { id: "0-421",  node: "0:421",  name: "07-Mobile App",        group: "landing", h: 7040, ko: "모바일 앱" },
  { id: "0-290",  node: "0:290",  name: "08-Consultation",      group: "landing", h: 4541, ko: "상담 서비스" },
  { id: "0-181",  node: "0:181",  name: "09-Product",           group: "landing", h: 5396, ko: "단일 상품" },
  { id: "0-2",    node: "0:2",    name: "10-B2B",               group: "landing", h: 4742, ko: "기업 서비스" },
  { id: "0-3347", node: "0:3347", name: "01 - About Us",          group: "inner", h: 4334, ko: "소개" },
  { id: "0-3446", node: "0:3446", name: "02 - Pricing 01",        group: "inner", h: 2486, ko: "요금 1" },
  { id: "0-3558", node: "0:3558", name: "03 - Pricing 02",        group: "inner", h: 2575, ko: "요금 2" },
  { id: "0-3659", node: "0:3659", name: "04 - Pricing 03",        group: "inner", h: 2232, ko: "요금 3" },
  { id: "0-3728", node: "0:3728", name: "05 - Sign In 01",        group: "inner", h: 1554, ko: "로그인" },
  { id: "0-3745", node: "0:3745", name: "06 - Sign Up 01",        group: "inner", h: 1748, ko: "회원가입" },
  { id: "0-3763", node: "0:3763", name: "07 - Reset Password 01", group: "inner", h: 1403, ko: "비밀번호 재설정" },
  { id: "0-3777", node: "0:3777", name: "08 - Contact 01",        group: "inner", h: 1792, ko: "문의 1" },
  { id: "0-3807", node: "0:3807", name: "09 - Contact 02",        group: "inner", h: 2013, ko: "문의 2" },
  { id: "0-3853", node: "0:3853", name: "10 - Contact 03",        group: "inner", h: 1803, ko: "문의 3" },
  { id: "0-3890", node: "0:3890", name: "11 - Terms & Conditions", group: "inner", h: 2247, ko: "이용약관" },
  { id: "0-3919", node: "0:3919", name: "12 - Job Opening",       group: "inner", h: 3667, ko: "채용 공고" },
  { id: "0-4032", node: "0:4032", name: "13 - Job Details",       group: "inner", h: 2642, ko: "채용 상세" },
  { id: "0-4065", node: "0:4065", name: "14 - Product Details",   group: "inner", h: 2609, ko: "상품 상세" },
  { id: "0-4259", node: "0:4259", name: "15 - Cart",              group: "inner", h: 1811, ko: "장바구니" },
  { id: "0-4339", node: "0:4339", name: "16 - Checkout",          group: "inner", h: 2284, ko: "결제" },
];

export const BRAINWAVE_CREDIT = {
  text: "디자인 Brainwave.io Landing Page UI Kit by Seju_ui_ux (CC BY 4.0)",
  url: "https://www.figma.com/design/AeGTjTTByOZTjZv7Pt8Ehd",
};

export function brainwavePage(id: string): BrainwavePageMeta | undefined {
  return BRAINWAVE_PAGES.find((p) => p.id === id);
}

/** 업종 템플릿이 처음 쓰는 페이지 — 편집기에서 26장 중 아무거나로 바꿀 수 있다 */
export const BRAINWAVE_DEFAULT_FOR_TEMPLATE: Record<string, string> = {
  service: "0-290",   // 08 Consultation
  local: "0-2226",    // 03 Coworking
  product: "0-1102",  // 06 ECommerce
  class: "0-2",       // 10 B2B
  tech: "0-2385",     // 02 SaaS
  creator: "0-2555",  // 01 Agency
  wellness: "0-181",  // 09 Product
  editorial: "0-2555",
};
