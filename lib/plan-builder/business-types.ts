/*
 * 사업 유형(일하는 방식) — 계획서 방향을 정하는 세 층 가운데 첫째(docs/사업-유형-지도-2026-10-11.md).
 *   ① 사업 유형: 12주 순서, 처리량의 뜻, 큰돈 쓰기 전 확인할 것, 장별 초점 (이 파일)
 *   ② 돈 버는 방식: 계산식과 답할 질문 (intake-structure-brief.ts REVENUE_FORMULA·MODEL_PLAYBOOK)
 *   ③ 업종 인허가: 신고 순서와 준비물 (industry-playbooks.ts)
 * AI는 이 틀 안에서 문장만 쓴다. 같은 사업이면 몇 번을 써도 순서와 판단 단위가 같아야 한다.
 * 계획서 품질 Q10(2026-10-29): 면허가 있어야 하는 업종(네일 등)은 면허 확인을 12주 맨 앞 관문으로('~때만'), 만들어 보내는 형의 인증·신고 가정에 생활화학제품(환경부)을 넣었다 —
 *   집에서 만드는 캔들 계획서가 담당을 산업부 '제품안전정보센터'로 안내했다.
 * 계획서 품질 Q8(2026-10-29): 유형 안에서도 공간을 빌리는지에 따라 단계가 다르면 '— ~때만'으로 조건을 붙인다(방문·화상 과외에 '건축물 용도·계약' 단계가 그대로 나왔다).
 * 유형은 규칙으로만 정한다(위에서부터 처음 맞는 것): 사용자가 고른 구조 → 사업 설명의 말 → 업종 가이드 → 업종 기본 구조.
 */
import type { BusinessStructure } from "./business-structure";

export type BusinessTypeId = "store" | "visit" | "ship" | "lesson" | "space" | "b2b" | "platform" | "app";

export type BusinessType = {
  id: BusinessTypeId;
  name: string;
  /** 이 유형의 계획서가 꼭 답할 질문 */
  question: string;
  /** 처리량(상한)을 정하는 것과 판단 단위 */
  capacity: string;
  /** 큰돈을 쓰기 전에 확인할 가정 3개 */
  assumptions: string[];
  /** 12주 뼈대 — 순서만 정하고 주차는 사업에 맞게 */
  roadmap: string[];
  /**
   * 출시 전 수요 판단에서 볼 경쟁 자료 — 유형마다 다르다(계획서 품질 Q6: 도시락 계획서에 공간 대여의 '빈자리·예약 달력·가동률'이
   * 모든 사업 공통 계산 자료에서 섞여 나왔다). 숫자 없이 무엇을 볼지만 둔다.
   */
  evidence: string;
  /** 장별 초점(장 키 → 이 유형에서 더 다룰 것) */
  focus: Partial<Record<string, string>>;
};

export const BUSINESS_TYPES: Record<BusinessTypeId, BusinessType> = {
  store: {
    id: "store", name: "매장형(손님이 찾아오는 가게)",
    question: "어느 자리에서, 하루 몇 개(명)를, 몇 시에 팔면 버티는가",
    capacity: "하루에 만들거나 받을 수 있는 양과 피크 시간. 판단은 하루·일주일 단위",
    assumptions: ["대표 손님이 실제로 사는 시간대의 수요", "대표가 실제 설비로 만들 수 있는 하루 양", "그 자리에서 영업할 수 있는지(건축물 용도·인허가)와 월세가 계산한 고정비 안인지"],
    roadmap: ["면허 확인 — 면허가 있어야 하는 업종(미용 등)일 때만, 맨 앞 관문(면허가 없으면 계약·설비를 미루고 면허부터)", "수요·주변 가게와 신고 업종·인허가 확인", "원가·처리량 시험", "이미 신고된 공간을 빌려 실제로 팔아 보기(되면)", "자리 후보와 건축물 용도·견적", "계약 전 판단(실제 판매 수, 아니면 잰 비율과 경쟁 자료)", "계약(판단을 통과하고 견적이 한도 안일 때만)", "공사·설비(인허가 순서대로)", "실제 설비로 하루 양 만들기", "신고·등록", "개업과 시범 판매"],
    evidence: "비슷한 가게의 대표 시간대 손님 수(직접 세기)와 비슷한 상품의 가격·후기 수",
    focus: {
      "strategy/distribution": "영업시간과 피크 시간, 남은 상품 처리",
      "strategy/promotion": "개업 첫 주와 지도 서비스 등록",
      "strategy/people": "피크 시간에 필요한 사람",
    },
  },
  visit: {
    id: "visit", name: "방문·출장형(내가 손님에게 가는 일)",
    question: "어디까지 가고, 하루 몇 건을 하며, 이동 시간과 사고는 누가 감당하는가",
    capacity: "이동 시간을 뺀 하루 작업 건수. 판단은 일주일 단위",
    assumptions: ["갈 지역 안에 첫 고객이 있는지", "한 건의 작업 시간과 이동 시간(실제로 재 본 값)", "차량·장비·보험 비용이 계산한 고정비 안인지"],
    roadmap: ["서비스 범위와 갈 지역 정하기(면허가 있어야 하는 업종이면 면허 확인이 맨 앞 — 없으면 장비·차량 구매를 미룸)", "인허가 확인과 사업자등록(인허가가 없으면 바로)", "보험·사고 책임 정하기", "지인·할인으로 샘플 작업(사진·후기 남기기)", "작업·이동 시간 재기", "가격과 출장비 기준", "예약·결제 방법", "지역 안 첫 유료 고객", "반복 고객과 묶음 일정", "판단(가능한 건수 가운데 채운 비율)"],
    evidence: "같은 지역 비슷한 서비스의 예약 가능한 날짜·가격·후기 수",
    focus: {
      "market/products": "서비스 범위와 하지 않는 일",
      "strategy/distribution": "갈 지역, 예약·취소 규칙, 이동 동선",
      "strategy/people": "이동 동선과 하루 건수",
    },
  },
  ship: {
    id: "ship", name: "만들어 보내는 형(온라인·배송 판매)",
    question: "한 개 팔 때 수수료·배송·광고·반품을 빼고 얼마 남고, 일주일에 몇 개를 만들 수 있는가",
    capacity: "일주일에 만들고 포장할 수 있는 양. 판단은 일주일 단위",
    assumptions: ["팔 상품에 인증·신고가 필요한지(전기·어린이 제품은 KC 인증, 초·방향제 같은 생활화학제품은 환경부 안전확인 신고, 식품은 영업 신고 등)", "수수료·배송·포장·반품을 넣은 한 개당 남는 돈", "광고 없이도 첫 주문이 생기는지"],
    roadmap: ["상품 인증·신고 확인", "시제품과 한 개 원가(포장·배송 포함)", "사진·상세 설명", "사업자등록·통신판매업 신고", "소량 출시(지인·커뮤니티)로 실제 주문 받기", "첫 후기 모으기", "작은 광고 실험(예산 상한, 주문 1건당 광고비)", "재구매·정기 구성", "판단(실제 주문 수와 주문 1건당 광고비)"],
    evidence: "비슷한 상품의 가격·후기 수·판매 순위",
    focus: {
      "strategy/price": "판매 채널 수수료·배송비를 넣은 한 개당 남는 돈",
      "strategy/distribution": "판매 채널별 수수료와 배송·반품 처리",
      "strategy/promotion": "광고비 상한과 첫 후기 모으기",
    },
  },
  lesson: {
    id: "lesson", name: "교육·레슨형",
    question: "어떤 형태(학원·교습소·과외)로, 시간표에 학생 몇 명을 앉히고, 체험에서 몇 명이 등록하는가",
    capacity: "강사 1명의 시간표와 반 정원. 판단은 한 달 단위(등록 학생 수)",
    assumptions: ["운영 형태와 등록·신고 요건(인원·장소·강사)", "체험 수업에서 등록으로 넘어가는 비율", "학기·방학에 따른 등록 변화"],
    roadmap: ["운영 형태 정하기(학원·교습소·개인과외)", "커리큘럼과 체험 수업 만들기", "계약 전 체험 수업(등록된 공간을 빌리거나 온라인, 개인과외는 첫 수업)", "체험에서 등록으로 넘어간 비율로 판단", "장소(건축물 용도)와 견적 — 공간을 빌릴 때만", "계약(판단을 통과했을 때만) — 공간을 빌릴 때만", "등록·신고(학원·교습소는 배상책임보험이나 공제도)", "교습비·환불 기준 게시", "모집", "첫 수업과 한 달 등록 수 판단"],
    evidence: "주변 비슷한 학원·교습소의 반 정원·대기 여부·교습비",
    focus: {
      "market/products": "반 구성과 커리큘럼",
      "strategy/price": "교습비와 법정 환불 기준",
      "strategy/promotion": "체험 수업에서 등록으로 이어지는 길",
    },
  },
  space: {
    id: "space", name: "공간 대여형",
    question: "가동률이 몇 %면 버티고, 비수기에는 어떻게 하는가",
    capacity: "방 수 × 시간(박)으로 고정이라 가동률이 판단 기준. 판단은 한 달 단위(성수기·비수기 따로)",
    assumptions: ["운영 형태가 그 건물에서 가능한지(숙박·민박·대여 인허가와 건축물 용도)", "비슷한 공간의 예약 상황(예약 플랫폼 달력)", "청소·관리 시간과 비용"],
    roadmap: ["운영 형태·인허가 확인", "경쟁 공간 예약 달력·가동률 기록", "자리·건물 조건 확인(소음·공사 허락·원상복구)", "견적과 초기 지출 한도", "계약 전 판단(경쟁 가동률과 잰 비율)", "계약·공사", "신고·등록", "예약 플랫폼 등록과 환불 규정", "첫 예약(할인 기간)", "가동률 판단"],
    evidence: "비슷한 공간의 빈자리·예약 달력·가동률",
    focus: {
      "strategy/price": "요일·성수기별 가격",
      "strategy/distribution": "예약 플랫폼 수수료와 직접 예약",
      "strategy/people": "청소·관리 일정",
    },
  },
  b2b: {
    id: "b2b", name: "사장님 대상 서비스형",
    question: "첫 고객사를 어떻게 얻고, 대표 1명이 몇 곳까지 맡으며, 해지를 어떻게 막는가",
    capacity: "대표 1명이 한 달에 맡을 수 있는 고객사 수. 판단은 한 달 단위(계약 고객사 수)",
    assumptions: ["사장님이 돈을 낼 만큼 아픈 문제인지(직접 만나 확인)", "영업에서 계약까지 걸리는 기간", "고객사 1곳에 드는 시간"],
    roadmap: ["대상 업종과 서비스 범위 정하기", "사업자등록(인허가가 없으면 바로)", "무료·할인으로 첫 고객사 몇 곳을 맡아 포트폴리오 만들기", "고객사 1곳 작업 시간 재기", "무료로 맡은 곳이 돈을 내고 이어 가는지 묻기", "가격·계약서·범위 정하기", "영업(방문·소개·커뮤니티)과 첫 유료 계약", "월 보고와 해지 방지", "판단(찾아간 곳 가운데 계약한 비율, 유료 전환, 해지 이유)"],
    evidence: "비슷한 서비스의 가격표와 공개된 고객사 사례",
    focus: {
      "market/products": "해 주는 일과 하지 않는 일(범위)",
      "strategy/distribution": "계약 방식과 보고 주기",
      "strategy/promotion": "직접 영업과 소개",
    },
  },
  platform: {
    id: "platform", name: "연결 플랫폼형(공급자와 이용자를 잇는 사업)",
    question: "공급자를 먼저 어떻게 모으고, 첫 거래 하나를 어떻게 만들며, 직거래로 빠져나가는 것을 어떻게 막는가",
    capacity: "공급자 수와 매칭을 손으로 처리하는 시간. 판단은 한 달 단위(성사된 거래 수)",
    assumptions: ["공급자가 수수료를 내고도 들어올 이유", "앱 없이 손으로(메신저·신청서) 첫 거래를 만들 수 있는지", "중개 업종에 인허가가 필요한지"],
    roadmap: ["양쪽(공급자·이용자) 인터뷰", "중개 인허가 확인과 사업자등록", "공급자 먼저 모집", "손으로 하는 매칭(신청서·메신저)", "손 매칭으로 실제 거래와 연결비 받기", "반복 거래 확인", "간단한 웹(신청 페이지)", "직거래 방지 장치", "판단(실제 거래 수, 앱 개발은 판단 기준을 넘은 뒤)"],
    evidence: "비슷한 연결 서비스의 공급자 수와 거래 후기",
    focus: {
      "market/products": "공급자에게 주는 것과 이용자에게 주는 것, 첫 거래 하나가 생기는 흐름",
      "strategy/distribution": "웹 신청 페이지 먼저, 앱은 판단 기준을 넘은 뒤, 중개자라는 사실과 공급자 정보를 화면에 알리는 방법",
      "strategy/promotion": "공급자 모집을 먼저",
      "strategy/people": "매칭을 손으로 처리하는 시간",
    },
  },
  app: {
    id: "app", name: "앱·콘텐츠형(이용자를 먼저 모으는 사업)",
    question: "돈을 벌기 전까지 이용자를 모으는 기간과 그 비용을 버틸 수 있는가, 이용자가 다시 오는가",
    capacity: "이용자 수와 재방문율. 판단은 한 달 단위(활성 이용자·유료 전환)",
    assumptions: ["개발 없이(노코드·웹·수작업) 핵심 기능 하나를 시험할 수 있는지", "첫 이용자가 다시 오는지", "개발·운영 비용(외주·서버)이 초기 지출 한도 안인지"],
    roadmap: ["핵심 기능 하나 정하기", "노코드·웹으로 시험판", "개인정보·약관(이용자 정보를 받기 전에)", "첫 이용자 모집(커뮤니티)", "재방문 비율 확인(첫 이용자 가운데 다시 온 비율)", "고칠 것 정하기", "사업자등록과 유료 기능·광고 시험", "판단(앱 개발·외주는 판단 기준을 넘은 뒤)"],
    evidence: "비슷한 앱·콘텐츠의 이용자 후기 수·구독자 수",
    focus: {
      "market/products": "핵심 기능 하나와 지금 만들지 않는 기능",
      "strategy/distribution": "웹 먼저, 앱 출시는 판단 기준을 넘은 뒤",
      "strategy/promotion": "첫 이용자를 모을 곳",
    },
  },
};

/* 사업 설명의 말 → 유형. 위에서부터 처음 맞는 것(연결·앱처럼 사업의 모양을 정하는 말을 업종 말보다 먼저 본다) */
const DESCRIPTION_WORDS: Array<[BusinessTypeId, RegExp]> = [
  ["platform", /플랫폼|중개|매칭|소개팅|연결해\s*주|이어\s*주는|마켓플레이스/],
  ["app", /앱|어플|웹\s*서비스|유튜브|뉴스레터|구독형\s*콘텐츠/],
  ["space", /펜션|민박|게스트\s*하우스|숙소|대여|연습실|스터디\s*룸|파티\s*룸|캠핑장/],
  ["lesson", /학원|교습|과외|수업|강의|코딩\s*교육|어학/],
  ["visit", /출장|방문|픽업|배달|이사|용달|돌봄|청소/],
  ["ship", /스마트스토어|온라인|쇼핑몰|택배|정기\s*배송|배송/],
  ["store", /매장|가게|상가|샵|숍|점포|스튜디오|전문점|빵집|베이커리|카페|식당|음식점|김밥|분식|미용실|헬스장/],
];
/* 고객이 사업자면 사장님 대상 서비스형 — 매장·출장 같은 말보다 먼저 본다(메뉴 사진 출장 촬영은 사장님 대상 서비스) */
const BUSINESS_CUSTOMER = /사장님|업체|기업|회사|매장|가게|소상공인|원장|병원|학원|법인/;
const PLAYBOOK_TYPE: Record<string, BusinessTypeId> = { bakery: "store", cafe: "store", restaurant: "store", snack: "store", beauty: "store", gym: "store", academy: "lesson", "online-store": "ship", lodging: "space", "rental-room": "space", brokerage: "platform", "pet-treat": "ship", "moving-truck": "visit", laundry: "visit",
  // 확장 가이드(2026-10-12) — 설명의 말로 유형이 안 정해질 때 쓰는 기본값
  "meat-retail": "store", "food-retail": "store", "health-food": "store", tobacco: "store", nightlife: "store", "food-truck": "store", "used-car": "store", "used-goods": "store",
  "auto-repair": "store", "car-care": "store", barber: "store", bathhouse: "store", "sports-facility": "store", "entertainment-venue": "store", "pet-business": "store",
  medical: "store", pharmacy: "store", "optical-dental-lab": "store", "vet-clinic": "store", "massage-clinic": "store", "real-estate-agency": "store", "free-store": "store",
  "food-manufacture": "ship", "food-packaging": "ship", "meat-processing": "ship", "liquor-making": "ship", "manufacturing-general": "ship", "wood-production": "ship",
  "household-chemical": "ship", "product-safety-kc": "ship", cosmetics: "ship", "medical-products": "ship", agriculture: "ship", "agri-inputs": "ship", livestock: "ship", fishery: "ship",
  catering: "visit", construction: "visit", "electric-telecom-fire": "visit", "construction-equipment": "visit", "building-service": "visit", "property-management": "visit",
  "passenger-transport": "visit", delivery: "visit", parcel: "visit", ambulance: "visit", "welfare-care": "visit", "security-guard": "visit", "direct-sales": "visit",
  "public-hygiene-facility": "space", gosiwon: "space", "tourism-facility": "space", "parking-lot": "space", "property-lease": "space", "car-rental": "space", "water-leisure": "space", fishing: "space",
  "lifelong-education": "lesson", childcare: "lesson", kindergarten: "lesson",
  engineering: "b2b", "professional-license": "b2b", "it-service": "b2b", "free-b2b-service": "b2b", "free-wholesale": "b2b", "freight-forwarding": "b2b", logistics: "b2b",
  "outdoor-ad": "b2b", "liquor-wholesale": "b2b", "medical-device-sales": "b2b", chemical: "b2b", "emission-facility": "b2b", "insurance-agency": "b2b", "finance-registration": "b2b",
  "job-agency": "platform", "content-business": "app", publishing: "app",
};

export type BusinessTypeBasis = "structure" | "description" | "industry" | "sector";

export function businessTypeFor(input: {
  /** 사용자가 직접 고른 구조 축만 */
  chosen?: Partial<BusinessStructure> | null;
  /** 사업 설명과 팔 것 */
  description?: string;
  customer?: string;
  playbookId?: string | null;
  /** 업종 코드나 업종 분류의 기본 구조 */
  structure?: BusinessStructure | null;
}): { type: BusinessType; basis: BusinessTypeBasis } | null {
  const pick = (id: BusinessTypeId, basis: BusinessTypeBasis) => ({ type: BUSINESS_TYPES[id], basis });
  const chosen = input.chosen ?? {};
  if (chosen.sides === "two" || (chosen.revenue && ["commission", "lead_fee", "listing_fee"].includes(chosen.revenue))) return pick("platform", "structure");
  if (chosen.revenue === "advertising" || chosen.revenue === "freemium") return pick("app", "structure");
  if (chosen.offering === "space" || chosen.revenue === "rental") return pick("space", "structure");
  if (chosen.payer === "b2b") return pick("b2b", "structure");
  const text = input.description?.trim() ?? "";
  if (text) {
    const shaped = DESCRIPTION_WORDS.slice(0, 4).find(([, words]) => words.test(text));
    if (shaped) return pick(shaped[0], "description");
    if (input.customer && BUSINESS_CUSTOMER.test(input.customer)) return pick("b2b", "description");
    const rest = DESCRIPTION_WORDS.slice(4).find(([, words]) => words.test(text));
    if (rest) return pick(rest[0], "description");
  }
  if (input.playbookId && PLAYBOOK_TYPE[input.playbookId]) return pick(PLAYBOOK_TYPE[input.playbookId], "industry");
  const s = input.structure;
  if (!s) return null;
  if (s.sides === "two" || ["commission", "lead_fee", "listing_fee"].includes(s.revenue)) return pick("platform", "sector");
  if (s.offering === "space" || s.revenue === "rental") return pick("space", "sector");
  if (s.delivery === "store" || s.capital === "storefront") return pick("store", "sector");
  if (s.delivery === "visit" || s.capital === "vehicle") return pick("visit", "sector");
  if (s.offering === "goods" && (s.delivery === "online" || s.delivery === "delivery")) return pick("ship", "sector");
  return null;
}

/** 계획서 작성 자료(intake.businessType) — 12주 장은 roadmap 순서를 뼈대로, 다른 장은 assumptions·capacity를 기준으로 쓴다 */
export function businessTypeContext(result: { type: BusinessType; basis: BusinessTypeBasis }) {
  const { type, basis } = result;
  return {
    id: type.id,
    name: type.name,
    ...(basis === "structure" ? {} : { basis: basis === "description" ? "사업 설명으로 정한 유형입니다. 사업 내용과 다르면 쓰지 않습니다." : "업종으로 정한 유형입니다. 사업 내용과 다르면 쓰지 않습니다." }),
    question: type.question,
    capacity: type.capacity,
    assumptions: type.assumptions,
    roadmap: type.roadmap,
    evidence: type.evidence,
  };
}

/** 장 작성 지시문의 장별 역할 뒤에 붙일 이 유형의 초점 */
export function businessTypeFocus(id: string | null | undefined, chapterKey: string): string {
  const type = id && id in BUSINESS_TYPES ? BUSINESS_TYPES[id as BusinessTypeId] : null;
  return type?.focus[chapterKey] ?? "";
}
