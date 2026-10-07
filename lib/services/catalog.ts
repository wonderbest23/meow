/*
 * '다음 단계' 서비스 목록 — 홈페이지를 연 뒤 사장님이 맡길 수 있는 일.
 *
 * 화면(유지보수·홈페이지), 신청 API, 어드민 처리함이 모두 이 목록 하나를 본다.
 * 운영자가 나중에 가격·상품을 붙일 때 여기만 고치면 된다(price 를 채우면 화면이 그 값을 보인다).
 * id 는 DB(service_requests.service_id)에 그대로 남으니 한 번 정하면 바꾸지 않는다 — 이름만 바꾼다.
 */

export type ServiceGroupId = "admin" | "marketing";

export interface ServiceGroup {
  id: ServiceGroupId;
  title: string;
  note: string;
}

export interface ServiceItem {
  /** 바꾸지 않는 키 — 신청 기록에 남는다 */
  id: string;
  group: ServiceGroupId;
  title: string;
  /** 한 줄 설명 */
  summary: string;
  /** 누가 필요한지 */
  who: string;
  /** 정해지면 '월 99,000원'처럼 적는다. 없으면 상담 후 안내 */
  price?: string;
  /** 카드에 크게 쓰는 짧은 이름 */
  short: string;
  /** 아이콘 이름(components/next-services.tsx 의 ICONS) */
  icon: ServiceIcon;
  /** 아이콘 바탕색 */
  tone: "blue" | "green" | "violet" | "orange" | "pink" | "teal" | "amber" | "indigo";
  /** 보통 걸리는 기간 — 카드의 작은 표 */
  duration: string;
  /** 해 드리는 것(체크 표시, 3개 안팎) */
  includes: string[];
  /** 진행 순서(1·2·3) */
  steps: string[];
  /** 미리 준비하면 빨라지는 것 */
  prepare: string[];
}

export type ServiceIcon = "badge" | "cart" | "shield" | "building" | "pen" | "news" | "camera" | "megaphone";

const ALL_SERVICE_GROUPS: readonly ServiceGroup[] = [
  { id: "admin", title: "창업 행정", note: "등록·신고처럼 한 번은 꼭 해야 하는 일" },
  { id: "marketing", title: "마케팅", note: "손님이 가게를 찾아오게 하는 일" },
];

/*
 * 지금 신청받는 것은 마케팅뿐이다(소유자 결정 2026-10-07). 창업 행정 4종은 처리할 제휴 전문가·가격·흐름이 없어
 * '상담 신청'만 받고 끝나는 어설픈 상태라 신청 화면에서 뺐다. 예전 신청 기록은 관리자 화면에서 그대로 보이게
 * findServiceRecord 로 찾는다. 다시 열려면 OFFERED_GROUPS 에 "admin" 을 넣으면 된다.
 */
const OFFERED_GROUPS: readonly ServiceGroupId[] = ["marketing"];

const ALL_SERVICES: readonly ServiceItem[] = [
  /*
   * 창업 행정 4종은 '대행'이 아니다 — 세무사법(세무대리·알선 금지)·행정사법(보수 받는 서류 작성·제출 금지) 때문에
   * 오늘창업은 신청 방법 안내·서류 준비 도움·자격 있는 전문가(세무사·행정사) 연결까지만 한다. 제출은 사장님 본인이 한다.
   * 변호사 확인 전까지 '대신 신청/제출/대행' 표현을 쓰지 않는다(scripts/service-requests.test.ts 가 막는다).
   */
  { id: "business-registration", group: "admin", title: "사업자등록 도움", short: "사업자등록", icon: "badge", tone: "blue", duration: "보통 3~5일",
    summary: "업종 코드·과세 유형 고르기와 홈택스 신청을 차근차근 도와드려요.", who: "아직 사업자등록증이 없는 분",
    includes: ["내 사업에 맞는 업종 코드 찾기", "간이·일반 과세 중 무엇이 맞는지 설명", "홈택스 신청 화면 따라 하기 안내", "필요하면 세무사 연결"],
    steps: ["전화로 사업 내용 확인", "준비물·신청 방법 안내", "등록증이 나오면 번호로 바로 확인"], prepare: ["신분증", "사업장 주소(임대차계약서 또는 비상주 계약서)"] },
  { id: "mail-order-report", group: "admin", title: "통신판매업 신고 도움", short: "통신판매업 신고", icon: "cart", tone: "green", duration: "보통 3~7일",
    summary: "온라인으로 팔기 전에 필요한 구청 신고를 빠르게 끝내게 도와드려요.", who: "홈페이지·스마트스토어·SNS로 주문을 받는 분",
    includes: ["구매안전서비스 확인증 받는 법", "정부24 신고 화면 따라 하기 안내", "면허세 납부까지 체크리스트", "필요하면 행정사 연결"],
    steps: ["판매 방식 확인", "준비물·신고 방법 안내", "신고되면 번호로 바로 확인"], prepare: ["사업자등록증", "통장 사본(구매안전서비스용)"] },
  { id: "industry-license", group: "admin", title: "업종별 인허가·영업신고 도움", short: "인허가·영업신고", icon: "shield", tone: "violet", duration: "업종마다 달라요",
    summary: "음식점·미용실처럼 따로 신고가 필요한 업종인지 확인하고 준비를 도와드려요.", who: "식품·위생·교육 등 신고 업종을 하는 분",
    includes: ["내 업종에 필요한 신고·허가 확인", "위생교육·보건증 등 준비물 정리", "구청 신고 순서 안내", "필요하면 행정사 연결"],
    steps: ["업종·장소 확인", "준비물·순서 안내", "필요하면 전문가 연결"], prepare: ["사업장 주소", "업종 설명(무엇을 파는지)"] },
  { id: "soho-office", group: "admin", title: "소호·비상주 사무실 계약", short: "비상주 사무실", icon: "building", tone: "teal", duration: "보통 1~2일",
    summary: "사업자등록에 쓸 수 있는 저렴한 주소지를 찾아 계약을 도와드려요.", who: "집 주소로 등록하기 어렵거나 사무실이 따로 없는 분",
    includes: ["원하는 지역의 저렴한 주소지 추천", "사업자등록에 쓸 수 있는지 확인", "계약과 우편물 받기 안내"],
    steps: ["지역·예산 확인", "주소지 추천·계약", "계약서 전달"], prepare: ["원하는 지역", "신분증"] },
  { id: "blog-distribution", group: "marketing", title: "블로그 배포", short: "블로그 배포", icon: "pen", tone: "orange", duration: "보통 1~2주",
    summary: "가게를 소개하는 블로그 글을 써서 여러 곳에 올려 드려요.", who: "네이버에서 가게 이름을 검색해도 잘 안 나오는 분",
    includes: ["가게 소개 글 작성", "여러 블로그에 나눠 올리기", "올라간 글 주소 정리해 드림"],
    steps: ["가게 정보·사진 받기", "글 작성·확인", "배포 후 결과 전달"], prepare: ["가게 사진 5장 이상", "자랑하고 싶은 점"] },
  { id: "press-release", group: "marketing", title: "언론보도", short: "언론보도", icon: "news", tone: "indigo", duration: "보통 1주",
    summary: "가게 소식을 기사로 만들어 인터넷 언론에 내 드려요.", who: "오픈·신메뉴·수상 소식을 널리 알리고 싶은 분",
    includes: ["보도자료(기사) 작성", "인터넷 언론사에 배포", "실린 기사 주소 전달"],
    steps: ["알릴 소식 확인", "기사 작성·확인", "배포 후 결과 전달"], prepare: ["알리고 싶은 소식", "대표 사진"] },
  { id: "sns-management", group: "marketing", title: "SNS 운영 관리", short: "SNS 운영", icon: "camera", tone: "pink", duration: "월 단위",
    summary: "인스타그램 같은 SNS 게시물을 대신 만들고 올려 드려요.", who: "SNS를 할 시간이 없는 분",
    includes: ["한 달 게시물 계획", "사진·글 만들어 올리기", "월말 반응 정리"],
    steps: ["계정·분위기 확인", "게시물 만들고 올리기", "월말 보고"], prepare: ["SNS 계정", "가게 사진"] },
  { id: "full-marketing", group: "marketing", title: "종합 마케팅", short: "종합 마케팅", icon: "megaphone", tone: "amber", duration: "월 단위",
    summary: "블로그·SNS·광고를 묶어 한 달 계획을 세우고 운영해 드려요.", who: "무엇부터 할지 모르겠고 한 번에 맡기고 싶은 분",
    includes: ["예산에 맞춘 한 달 계획", "블로그·SNS·광고 함께 운영", "매달 결과와 다음 할 일"],
    steps: ["목표·예산 확인", "계획 세우고 운영", "월말 보고"], prepare: ["한 달 예산", "가장 팔고 싶은 상품"] },
];

export const SERVICE_GROUPS: readonly ServiceGroup[] = ALL_SERVICE_GROUPS.filter((group) => OFFERED_GROUPS.includes(group.id));
export const SERVICE_CATALOG: readonly ServiceItem[] = ALL_SERVICES.filter((item) => OFFERED_GROUPS.includes(item.group));

/** 가격이 없을 때 보이는 문구 */
export const SERVICE_PRICE_PENDING = "가격은 상담 후 안내";

/** 지금 신청받는 서비스 — 새 신청은 이것으로만 받는다 */
export function findService(id: string): ServiceItem | undefined {
  return SERVICE_CATALOG.find((item) => item.id === id);
}

/** 예전에 받던 서비스까지 — 지난 신청 기록을 보여 줄 때만 쓴다 */
export function findServiceRecord(id: string): ServiceItem | undefined {
  return ALL_SERVICES.find((item) => item.id === id);
}

/** 지난 신청 기록의 분류 이름 */
export function serviceGroupRecord(id: ServiceGroupId | undefined): ServiceGroup | undefined {
  return ALL_SERVICE_GROUPS.find((group) => group.id === id);
}

export function servicePriceLabel(item: ServiceItem): string {
  return item.price?.trim() ? item.price : SERVICE_PRICE_PENDING;
}

export function servicesInGroup(group: ServiceGroupId): ServiceItem[] {
  return SERVICE_CATALOG.filter((item) => item.group === group);
}
