/*
 * Brainwave.io 랜딩 킷 — 9가지 배치.
 *
 * 출처: "Brainwave.io - Landing Page UI Kit" (Figma Community, Seju_ui_ux, CC BY 4.0)
 *       https://www.figma.com/community/file/…  파일 키 AeGTjTTByOZTjZv7Pt8Ehd
 * 공개 페이지 푸터에 출처를 적는다(landingKitCredit).
 *
 * 자체 제작 배치 대신 킷의 10개 샘플 중 9개를 그대로 옮겼다(04 Job Site 는
 * 채용 목록 구조라 소상공인 홈페이지와 맞지 않아 뺐다). 킷에서 잰 값:
 *   - 본문 폭 1110 (카드 350 ×3 + 간격 30), 1600 캔버스
 *   - 글자: Gilroy 60/48/36/32/24/21/19/17/15/13 — 한글은 Pretendard 로 대신
 *   - 색: 먹 #161c2d · 파랑 #473bf0 · 초록 #68d585 · 빨강 #f74d4d
 *         연회색 바탕 #f4f7fa / #f8f8f8 · 카드 둥글기 10
 *   - 버튼 높이 59 · 글자 17 Bold · 작은 라벨 13 Bold 자간 +1.6
 *
 * 킷은 데스크톱 프레임만 있다 — 640 이하 배치는 우리 정책대로 한 열이다.
 */
export const landingKitIds = [
  "consult",   // 08 Consultation
  "agency",    // 01 Agency
  "saas",      // 02 SaaS Subscription
  "cowork",    // 03 Coworking
  "webapp",    // 05 Web Application
  "shop",      // 06 ECommerce
  "app",       // 07 Mobile App
  "product",   // 09 Product
  "b2b",       // 10 B2B
] as const;

export type LandingKitId = (typeof landingKitIds)[number];

export const landingKitOptions: Array<{ id: LandingKitId; name: string; description: string; sample: string }> = [
  { id: "consult", name: "상담·전문 서비스", description: "사진 위 첫 화면 → 숫자 3개 → 서비스 카드 → 문의 양식", sample: "08 Consultation" },
  { id: "agency",  name: "에이전시·제작",     description: "둥근 사진 첫 화면 → 색 카드 서비스 → 소개 → 작업물",  sample: "01 Agency" },
  { id: "saas",    name: "구독 서비스",       description: "가운데 제목 → 기능 3 → 숫자 → 요금 → FAQ",            sample: "02 SaaS Subscription" },
  { id: "cowork",  name: "공간·매장",         description: "어두운 사진 첫 화면 → 숫자 → 위치 → 사진 소개",       sample: "03 Coworking" },
  { id: "webapp",  name: "웹 서비스",         description: "어두운 첫 화면 → 기능 띠 → 소개 3 → 요금",            sample: "05 Web Application" },
  { id: "shop",    name: "온라인 상점",       description: "둥근 검정 첫 화면 → 카테고리 → 상품 → 후기",          sample: "06 ECommerce" },
  { id: "app",     name: "앱",               description: "파란 그라데이션 첫 화면 → 소개 → 이용 방법 → 영상 → 요금", sample: "07 Mobile App" },
  { id: "product", name: "단일 상품",         description: "큰 제목 → 색 바탕 소개 3 → 가격",                     sample: "09 Product" },
  { id: "b2b",     name: "기업 서비스",       description: "연회색 첫 화면 → 알림 띠 → 서비스 → 영상 → 후기",     sample: "10 B2B" },
];

/** 업종 템플릿마다 처음 쓰는 킷 — 편집기에서 바꿀 수 있다 */
export const kitForTemplate: Record<string, LandingKitId> = {
  service: "consult",
  local: "cowork",
  product: "shop",
  class: "b2b",
  tech: "saas",
  creator: "agency",
  wellness: "product",
  editorial: "agency",
};

export function isLandingKit(value: unknown): value is LandingKitId {
  return typeof value === "string" && (landingKitIds as readonly string[]).includes(value);
}

/** 공개 페이지 푸터에 적는 출처 — CC BY 4.0 조건 */
export const landingKitCredit = {
  text: "디자인 Brainwave.io Landing Page UI Kit by Seju_ui_ux (CC BY 4.0)",
  url: "https://www.figma.com/design/AeGTjTTByOZTjZv7Pt8Ehd",
};
