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
}

export const SERVICE_GROUPS: readonly ServiceGroup[] = [
  { id: "admin", title: "창업 행정", note: "등록·신고처럼 한 번은 꼭 해야 하는 일" },
  { id: "marketing", title: "마케팅", note: "손님이 가게를 찾아오게 하는 일" },
];

export const SERVICE_CATALOG: readonly ServiceItem[] = [
  { id: "business-registration", group: "admin", title: "사업자등록 대행", summary: "업종 코드 고르기부터 세무서 신청까지 대신 챙겨 드려요.", who: "아직 사업자등록증이 없는 분" },
  { id: "mail-order-report", group: "admin", title: "통신판매업 신고 대행", summary: "온라인으로 팔기 전에 필요한 구청 신고를 대신 해 드려요.", who: "홈페이지·스마트스토어·SNS로 주문을 받는 분" },
  { id: "industry-license", group: "admin", title: "업종별 인허가·영업신고 대행", summary: "음식점·미용실처럼 따로 신고가 필요한 업종의 서류를 준비해 드려요.", who: "식품·위생·교육 등 신고 업종을 하는 분" },
  { id: "soho-office", group: "admin", title: "소호·비상주 사무실 계약", summary: "사업자등록에 쓸 수 있는 저렴한 주소지를 찾아 계약을 도와드려요.", who: "집 주소로 등록하기 어렵거나 사무실이 따로 없는 분" },
  { id: "blog-distribution", group: "marketing", title: "블로그 배포", summary: "가게를 소개하는 블로그 글을 써서 여러 곳에 올려 드려요.", who: "네이버에서 가게 이름을 검색해도 잘 안 나오는 분" },
  { id: "press-release", group: "marketing", title: "언론보도", summary: "가게 소식을 기사로 만들어 인터넷 언론에 내 드려요.", who: "오픈·신메뉴·수상 소식을 널리 알리고 싶은 분" },
  { id: "sns-management", group: "marketing", title: "SNS 운영 관리", summary: "인스타그램 같은 SNS 게시물을 대신 만들고 올려 드려요.", who: "SNS를 할 시간이 없는 분" },
  { id: "full-marketing", group: "marketing", title: "종합 마케팅", summary: "블로그·SNS·광고를 묶어 한 달 계획을 세우고 운영해 드려요.", who: "무엇부터 할지 모르겠고 한 번에 맡기고 싶은 분" },
];

/** 가격이 없을 때 보이는 문구 */
export const SERVICE_PRICE_PENDING = "상담 신청 · 가격은 상담 후 안내";

export function findService(id: string): ServiceItem | undefined {
  return SERVICE_CATALOG.find((item) => item.id === id);
}

export function servicePriceLabel(item: ServiceItem): string {
  return item.price?.trim() ? item.price : SERVICE_PRICE_PENDING;
}

export function servicesInGroup(group: ServiceGroupId): ServiceItem[] {
  return SERVICE_CATALOG.filter((item) => item.group === group);
}
