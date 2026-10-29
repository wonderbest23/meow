/*
 * 업종별 필수 항목 — 계획서가 그 업종에서 빠뜨리면 안 되는 지출·원가·운영 위험·신고 항목(계획서 품질 Q2, 2026-10-27).
 * 망원동 1인 도시락 검토(3.4/5): 초기 지출에 보증금·권리금·간판·인테리어·카드 단말기가 없고, 원산지 표시·조리 후 보관 기준·
 * 폐기율·업종 후보(즉석판매제조·가공업과 휴게·일반음식점) 비교·예약 노쇼 대책이 빠졌다. 음식만의 문제가 아니라
 * 업종마다 '꼭 들어가야 하는 것'이 있어서, 업종 묶음별로 같은 네 가지(초기 지출·한 건당 비용·운영 위험·신고)를 정해 둔다.
 *
 * 업종 묶음은 계획서 작성 자료(intake-context)에 이미 있는 값으로 고른다: 표준산업분류(ksic)·업종 가이드 이름 → 사업 설명의 음식 낱말 → 업종(sector) → 문서 업종(document-editorial).
 * 사업 설명을 업종 칸보다 먼저 보는 것은 음식뿐이다 — 2026-10-27 도시락 계획서는 업종 질문에 첫 보기('기업 서비스')가 골라져 있었고,
 * '수제 도시락'은 업종 가이드 낱말('도시락 가게·전문점·배달')에도 걸리지 않아 음식 항목이 하나도 들어가지 않았다.
 * 여기에는 할 일의 '항목'만 둔다. 기한·수수료·면적·온도 같은 숫자는 넣지 않는다(업종 가이드와 같은 원칙 — 바뀌거나 지역마다 다르다).
 * 예외는 '하루 점검'(daily, 계획서 품질 Q4 2026-10-28)의 법정 기준이 확실한 숫자뿐이다 — 식품공전 보존 기준의 냉장 0~10℃·냉동 -18℃ 이하.
 * 그 밖의 온도·시간(따뜻하게 두는 온도, 진열 시간 한도 등)은 숫자 없이 '관할 기관 확인'으로 둔다.
 * 항목마다 맡을 장을 정해, 그 장의 작성 자료에만 넣는다 — 같은 항목이 장마다 반복되지 않게.
 */
import type { ProposalSector } from "./proposal-blueprint";
import type { DocumentSector } from "./document-editorial";

export type EssentialGroup = "food" | "retail" | "manufacturing" | "education" | "local" | "space" | "project" | "logistics" | "general";
type EssentialKind = "setup" | "unitCost" | "operation" | "daily" | "filing" | "lease" | "precontract";

export const ESSENTIAL_GROUP_NAMES: Record<EssentialGroup, string> = {
  food: "음식·식품", retail: "상품 판매", manufacturing: "제조", education: "교육", local: "동네 서비스", space: "공간 대여·숙박", project: "용역·소프트웨어·콘텐츠", logistics: "운송·물류", general: "일반",
};

/** 항목 종류마다 맡을 장 — 계획서에 있는 첫 장이 맡는다(없으면 실행 요약) */
const KIND_OWNERS: Record<EssentialKind, string[]> = {
  setup: ["financials/expenses", "funding/requirements", "financials/assets", "financials/financing"],
  unitCost: ["strategy/price", "market/products", "financials/expenses"],
  operation: ["strategy/distribution", "strategy/product", "market/products"],
  /* 하루 점검표 — 운영 항목과 같은 장에 한 장으로(장마다 나뉘지 않게) */
  daily: ["strategy/distribution", "strategy/product", "market/products"],
  filing: ["summary/roadmap"],
  /* 임대차 계약 전 확인 — 계약 전 주차를 정하는 12주 장에(신고 항목과 같은 장) */
  lease: ["summary/roadmap"],
  /* 운영안에 따라 붙는 계약 전 확인(음식: 조리 후 판매 가능 시간) — 계약 전 주차를 정하는 12주 장에 */
  precontract: ["summary/roadmap"],
};

const SHOP_SETUP = "매장·작업장을 빌리면 보증금·권리금·인테리어·간판";
/*
 * 돌려받는 돈과 써서 없어지는 돈(계획서 품질 Q6) — 계산 자료의 초기 지출 한도 줄과 같은 원칙.
 * 보증금은 계약이 끝나면 돌려받지만 계약 기간 동안은 통장에 없는 돈이라 한도 안에 함께 센다.
 */
const DEPOSIT_SPLIT = "보증금처럼 계약이 끝나면 돌려받는 돈과 권리금·인테리어·장비·간판처럼 써서 없어지는 돈은 표에서 나눠 적고, 보증금도 계약 기간 동안은 통장에 없는 돈이라 초기 지출 한도 안에 함께 센다고 밝힙니다.";
/*
 * 음식 업종 보험(계획서 품질 Q6) — 법에 정해진 사실만: 다중이용업소의 안전관리에 관한 특별법은 일정 면적 이상의 휴게음식점·일반음식점·제과점 등에
 * 화재배상책임보험 가입 의무를 둔다(면적 기준은 숫자를 넣지 않고 관할 소방서 확인). 손님 식중독·사고를 배상하는 영업배상책임보험은 음식점 일반에 법정 가입 의무가 없는 선택 보험이다.
 */
const FOOD_INSURANCE = "보험(보험료 확인 필요): 영업배상책임보험(손님 식중독·다침 같은 사고 배상 — 음식점 일반에 법으로 정한 가입 의무는 없는 선택 보험)과, 휴게음식점·일반음식점·제과점이 일정 면적 이상이면 다중이용업소법에 따라 가입 의무가 있는 화재배상책임보험(대상인지와 면적 기준은 관할 소방서 확인). 매달 내는 보험료면 월 고정비에 들어 있는지 확인합니다.";
/*
 * 임대차 계약 전 확인(계획서 품질 Q5, 2026-10-28 재측정: 보증금·권리금은 비용으로만 나오고 계약 전에 볼 서류가 없었다).
 * 법에 정해진 사실만 쓴다 — 상가건물 임대차보호법 제2조(환산보증금 = 보증금 + 월세 × 100, 기준을 넘어도 대항력·계약갱신 요구·권리금 회수 기회 등은 적용),
 * 제3조(건물 인도 + 사업자등록 신청 다음 날부터 대항력), 제5조(관할 세무서장의 확정일자로 보증금 우선변제), 제10조의6(표준권리금계약서).
 * 환산보증금 기준 금액은 지역·시기마다 시행령으로 바뀌므로 숫자를 넣지 않고 '관할 기관 확인'으로 둔다. 매장·작업장을 빌리는 업종 묶음에만 넣는다.
 */
const LEASE_CHECK = "매장·작업장을 빌려 계약하면, 계약 전에 확인할 서류를 할 일 목록의 계약 전 순서(12주 표가 있으면 계약 전 주차)에 넣습니다: ① 등기부등본(대법원 인터넷등기소 — 계약하는 사람이 건물 소유자와 같은지, 근저당처럼 먼저 잡힌 빚이 있는지) ② 건축물대장(정부24 — 빌릴 층·호의 용도가 하려는 업종을 할 수 있는 용도인지, 위반건축물 표시가 없는지) ③ 확정일자(계약 뒤 관할 세무서에서 받으면 보증금을 우선해 돌려받을 수 있음. 건물을 넘겨받고 사업자등록을 신청한 다음 날부터 새 주인에게도 임차를 주장할 수 있으므로 사업자등록과 같은 주에 둠) ④ 상가건물 임대차보호법의 보호 범위(환산보증금 = 보증금 + 월세 × 100이 지역별 기준 금액 안인지 — 기준 금액은 관할 기관 확인. 기준을 넘어도 계약갱신 요구·권리금 회수 기회 같은 일부 보호는 적용) ⑤ 권리금을 주면 권리금 계약서(국토교통부 표준권리금계약서 — 무엇에 대한 돈인지, 넘겨받는 시설·물건 목록). 매장·작업장을 빌리지 않는 사업이면 쓰지 않습니다.";
const ESSENTIALS: Record<EssentialGroup, Record<EssentialKind, string[]>> = {
  food: {
    setup: [
      `초기 지출을 항목별로 나눠 적습니다: ${SHOP_SETUP}, 주방 환기·배수 공사, 조리·냉장 설비, 만들어 두고 파는 안이면 냉장 진열대·보관 설비, 카드 단말기(포스). 견적이 없는 항목은 '(확인 필요)'를 붙이고, 빌린 공간에 이미 있는 설비는 '이미 있음'으로 적습니다. ${DEPOSIT_SPLIT}`,
      FOOD_INSURANCE,
    ],
    unitCost: ["한 건당 비용에 재료비·포장 용기·라벨과 함께 폐기율(만들었다가 팔지 못해 버리는 비율)을 넣습니다. 폐기율을 모르면 '(확인 필요)'로 두고, 첫 달에 날마다 만든 양과 버린 양을 적어 확인한다고 씁니다. 계산 자료의 한 건당 비용에 폐기가 빠져 있으면 그 사실을 한 번 밝힙니다."],
    operation: [
      "조리한 뒤 보관 온도와 보관 시간, 그날 판매를 마감하는 시각(그 시간이 지나면 팔지 않는 기준)과 남은 음식 처리를 정합니다. 온도·시간 숫자가 자료에 없으면 만들지 않고 식약처 기준을 확인한다고 씁니다.",
      "조리와 판매 사이가 긴 운영안(아침에 만들어 두고 점심 뒤까지 파는 등)을 쓰면, 조리 후 판매 가능 시간(만든 뒤 언제까지 파는지)을 정하고 지킨다는 것과 그동안 둘 곳(냉장 진열대·보관 설비)을 함께 씁니다. 법정 한도 숫자는 만들지 않고 관할 기관 확인으로 둡니다.",
      "예약·사전 주문을 받으면 노쇼(예약하고 찾아가지 않음) 대책을 씁니다: 선결제나 예약금, 취소 마감 시각, 찾아가지 않은 음식 처리.",
    ],
    daily: [
      "하루 위생 점검표를 표 한 장(점검 항목 | 기준 | 언제 확인·기록)으로 넣습니다. 항목은 여섯 가지입니다: ① 냉장고·냉동고 온도 기록(식품공전 보존 기준 냉장 0~10℃, 냉동 -18℃ 이하 — 문 열 때와 마감 때 온도계를 보고 적음) ② 조리한 음식의 보관 온도(따뜻하게 두는 음식의 온도 기준은 관할 기관 확인) ③ 진열·판매 시간 한도(만든 시각을 라벨에 적고, 운영안에서 정한 조리 후 판매 가능 시간이 지나면 팔지 않음 — 법정 한도는 관할 기관 확인. 냉장 진열하면 진열대 온도도 ①의 냉장 기준으로 기록) ④ 도마·칼 구분(날고기·생선용과 익힌 음식·채소용을 색이나 표시로 나눠 씀) ⑤ 손 씻기(조리 시작 전·화장실 다녀온 뒤·날것을 만진 뒤 비누로) ⑥ 음식물 쓰레기(뚜껑 있는 용기에 모으고 마감 때 비움, 배출 방법은 구청 기준). 기준 칸에는 위 냉장·냉동 숫자 말고 다른 온도·시간 숫자를 만들지 않고 '관할 기관 확인'으로 둡니다. 기준 칸을 빈칸으로 두지 않습니다.",
    ],
    filing: [
      "신고 업종 후보를 표로 비교합니다: 즉석판매제조·가공업(만들어 포장한 음식을 손님에게 직접 판매, 손님에게 하는 직접 배달·택배 포함), 휴게음식점(매장에서 먹고 가게 하되 술은 팔지 않음), 일반음식점(술 판매 가능), 다른 가게·쇼핑몰에 넘겨 파는 식품제조·가공업. 판매 방식(포장·매장 식사·배달·택배·납품)에 따라 신고와 시설 기준이 달라지므로, 최종 업종은 관할 시·군·구청 위생 부서에서 정한다고 씁니다.",
      "원산지 표시 의무를 씁니다: 음식점(휴게·일반)은 메뉴판·게시판에 정해진 품목(쌀·김치·고기 등)의 원산지를 적고, 포장해 파는 음식은 표시 라벨에 원산지를 적는 기준이 있는지 확인합니다. 대상 품목과 표시 방법은 관할 기관에 확인한다고 씁니다.",
    ],
    lease: [LEASE_CHECK],
    precontract: ["앞 장의 운영안에서 조리와 판매 사이가 길면(만들어 두고 몇 시간 뒤까지 파는 안), 계약 전 확인(12주 표가 있으면 계약 전 주차)에 '조리 후 판매 가능 시간을 정하고 지킨다'를 넣습니다: 관할 기관에 판매 가능 시간·보관 온도 기준을 묻고, 그 시간 동안 둘 냉장 진열대·보관 설비가 빌릴 공간에 들어가는지와 견적을 확인합니다. 조리한 뒤 바로 파는 안이면 쓰지 않습니다."],
  },
  retail: {
    setup: [`초기 지출을 항목별로 나눠 적습니다: 첫 재고(최소 발주 수량), 상세 페이지 사진, 포장재, ${SHOP_SETUP}·카드 단말기(포스). 견적이 없는 항목은 '(확인 필요)'를 붙입니다. ${DEPOSIT_SPLIT}`],
    unitCost: ["한 건당 비용에 판매·결제 수수료, 택배비, 반품으로 돌아오는 몫을 넣습니다. 모르는 값은 '(확인 필요)'로 둡니다."],
    operation: ["팔리지 않는 재고(유행이 지나거나 파손된 상품)를 언제 어떻게 처리할지(할인 시점·묶음 판매)와 반품·교환 처리 방법을 씁니다."],
    daily: ["하루 점검표를 표 한 장(점검 항목 | 기준 | 언제 확인)으로 넣습니다: 새 주문·출고 마감 시각 확인, 재고 수량(품절 임박 상품), 손님 문의·리뷰 답변, 반품·교환 접수. 숫자 기준은 대표가 정한 값만 씁니다."],
    filing: ["온라인으로 팔면 통신판매업 신고, 상품마다 표시·인증(KC 등)이 필요한지 확인하는 일을 씁니다."],
    lease: [LEASE_CHECK],
    precontract: [],
  },
  manufacturing: {
    setup: [`초기 지출을 항목별로 나눠 적습니다: 설비·금형, 시제품, 첫 원자재, 작업장을 빌리면 보증금·인테리어(전기·환기 공사). 견적이 없는 항목은 '(확인 필요)'를 붙입니다. ${DEPOSIT_SPLIT}`],
    unitCost: ["한 건당 비용에 원자재·포장과 함께 불량률(만들었다가 팔 수 없는 비율)을 넣습니다. 모르면 '(확인 필요)'로 두고 시제품 생산에서 잰다고 씁니다."],
    operation: ["최소 생산량, 납기가 늦어질 때와 원자재 가격이 오를 때의 대응을 씁니다."],
    daily: ["하루 점검표를 표 한 장(점검 항목 | 기준 | 언제 확인)으로 넣습니다: 작업 전 설비 점검, 보호구 착용, 불량 수량 기록, 원자재 재고, 작업장 정리·환기. 안전 기준 숫자는 관할 기관 확인으로 둡니다."],
    filing: ["제품 인증·표시 의무와 공장·제조업 등록이 필요한지 확인하는 일을 씁니다."],
    lease: [LEASE_CHECK],
    precontract: [],
  },
  education: {
    setup: [`초기 지출을 항목별로 나눠 적습니다: 교재·교구·장비, ${SHOP_SETUP}·카드 단말기. 견적이 없는 항목은 '(확인 필요)'를 붙입니다. ${DEPOSIT_SPLIT}`],
    unitCost: ["한 명(한 회)당 비용에 교재·재료비, 장소 대여비, 플랫폼·결제 수수료를 넣습니다."],
    operation: ["결석·보강, 중도 해지와 환불 처리 기준을 씁니다."],
    daily: ["하루 점검표를 표 한 장(점검 항목 | 기준 | 언제 확인)으로 넣습니다: 출결 기록, 결석생 보강 일정, 교실 환기·안전(비상구·소화기 위치), 학부모·수강생 연락 기록."],
    filing: ["학원·교습소·개인과외 신고 가운데 무엇에 해당하는지와 환불 기준을 관할 교육지원청에 확인하는 일을 씁니다."],
    lease: [LEASE_CHECK],
    precontract: [],
  },
  local: {
    setup: [`초기 지출을 항목별로 나눠 적습니다: 장비·공구·첫 소모품, 출장이면 차량, ${SHOP_SETUP}·카드 단말기. 견적이 없는 항목은 '(확인 필요)'를 붙입니다. ${DEPOSIT_SPLIT}`],
    unitCost: ["한 건당 비용에 소모품과 이동 시간·이동 비용을 넣습니다."],
    operation: ["예약 노쇼 대책(예약금·취소 마감 시각)과 작업 중 손님 물건이 파손됐을 때의 보상(배상책임보험 등)을 씁니다."],
    daily: ["하루 점검표를 표 한 장(점검 항목 | 기준 | 언제 확인)으로 넣습니다: 다음 날 예약 확인 연락, 도구·기구 세척·소독(미용처럼 공중위생 업종의 소독 기준은 관할 기관 확인), 소모품 재고, 작업 기록(손님·작업 내용)."],
    filing: ["이 서비스에 영업 신고가 필요한지(미용처럼 공중위생 업종은 신고 대상) 관할 시·군·구청에 확인하는 일을 씁니다."],
    lease: [LEASE_CHECK],
    precontract: [],
  },
  space: {
    setup: [`초기 지출을 항목별로 나눠 적습니다: 보증금·권리금·인테리어·소방 설비·간판, 예약 시스템, 카드 단말기. 견적이 없는 항목은 '(확인 필요)'를 붙입니다. ${DEPOSIT_SPLIT}`],
    unitCost: ["1회 이용당 비용에 청소·소모품·전기와 예약 플랫폼 수수료를 넣습니다."],
    operation: ["예약 노쇼·취소 수수료 기준과 이용 규칙(소음·인원·파손)을 씁니다."],
    daily: ["하루 점검표를 표 한 장(점검 항목 | 기준 | 언제 확인)으로 넣습니다: 이용 전후 청소·파손 확인(사진 기록), 소화기·비상구·유도등 확인, 소모품 채우기, 다음 예약 확인."],
    filing: ["건축물 용도와 업종 신고·등록 필요 여부, 소방 기준을 계약 전에 확인하는 일을 씁니다."],
    lease: [LEASE_CHECK],
    precontract: [],
  },
  project: {
    setup: ["초기 지출을 항목별로 나눠 적습니다: 장비, 소프트웨어 구독, 포트폴리오·견본 제작. 견적이 없는 항목은 '(확인 필요)'를 붙입니다."],
    unitCost: ["한 건당 비용에 외주·서버·결제 수수료와 수정에 드는 시간을 넣습니다."],
    operation: ["계약서의 범위·검수 기준·수정 횟수와, 대금을 나중에 받으면 그동안 버틸 돈을 씁니다."],
    daily: [],
    filing: ["계약서, 결과물의 사용 권리(저작권), 손님 개인정보 처리 방법을 확인하는 일을 씁니다."],
    lease: [],
    precontract: [],
  },
  logistics: {
    setup: ["초기 지출을 항목별로 나눠 적습니다: 차량(구입·임차), 보험, 장비. 견적이 없는 항목은 '(확인 필요)'를 붙입니다."],
    unitCost: ["한 건당 비용에 유류비·통행료·보험료와 차량 유지비를 넣습니다."],
    operation: ["물건 파손·분실 때의 보상과 배송이 늦어질 때의 대응을 씁니다."],
    daily: ["하루 점검표를 표 한 장(점검 항목 | 기준 | 언제 확인)으로 넣습니다: 운행 전 차량 점검(타이어·브레이크·등화), 짐 고정, 배송 완료 기록(사진·서명), 운전 중 휴식(법정 휴게 기준은 관할 기관 확인)."],
    filing: ["화물 운송 허가 등 이 운송에 필요한 허가가 있는지 확인하는 일을 씁니다."],
    lease: [],
    precontract: [],
  },
  general: {
    setup: [`초기 지출을 항목별로 나눠 적습니다(공간을 빌리면 보증금·권리금·인테리어·간판, 장비, 카드 단말기 등). 견적이 없는 항목은 '(확인 필요)'를 붙입니다. ${DEPOSIT_SPLIT}`],
    unitCost: ["버리거나 돌려주는 몫(폐기·반품·불량)이 있으면 한 건당 비용에 넣습니다."],
    operation: ["가장 큰 운영 위험 하나(예약 취소·불량·사고 등)와 대책을 씁니다."],
    daily: [],
    filing: ["이 업종에 신고·허가가 필요한지 관할 기관에 확인하는 일을 씁니다."],
    lease: [LEASE_CHECK],
    precontract: [],
  },
};

const SECTOR_GROUPS: Record<ProposalSector, EssentialGroup> = {
  food_beverage: "food", retail_commerce: "retail", manufacturing: "manufacturing", education: "education", local_service: "local",
  space_hospitality: "space", logistics: "logistics", b2b_service: "project", software: "project", content_media: "project", general: "general",
};
const DOCUMENT_GROUPS: Record<DocumentSector, EssentialGroup> = {
  cafe_food: "food", commerce: "retail", manufacturing: "manufacturing", education: "education", local_service: "local",
  space: "space", logistics: "logistics", b2b_service: "project", software: "project", content: "project", general: "general",
};
/* 표준산업분류 앞자리 — 음식점(56)·식품 제조(10)·식품 소매(472)는 업종 칸이 비어 있어도 음식 묶음 */
const FOOD_KSIC = /^(56|10|472)/;
const FOOD_GUIDE = /음식|도시락|반찬|카페|빵|제과|식품|분식|푸드|급식|케이터링/;
/* 사업 설명의 음식 낱말 — 음식을 직접 만들어 파는 사업만. 음식점을 돕는 사업(컨설팅·앱·교육 등)은 업종 칸을 따른다 */
const FOOD_WORDS = /도시락|반찬|김밥|분식|떡볶이|베이커리|빵집|제과|디저트|케이크|카페|커피|식당|음식점|밀키트|푸드트럭|케이터링|수제\s*(?:잼|청|간식|버거)/;
const NOT_FOOD_MAKER = /컨설팅|대행|교육|강의|강좌|클래스|학원|플랫폼|앱|소프트웨어|중개|마케팅|디자인|촬영|인테리어/;

/** 계획서 작성 자료(intake-context JSON)와 문서 업종으로 업종 묶음을 고른다 */
export function essentialGroup(input: { intakeContext?: string; documentSector: DocumentSector; description?: string }): EssentialGroup {
  let sector: string | null = null, ksic = "", guide = "";
  try {
    const data = JSON.parse(input.intakeContext ?? "") as { sector?: string | null; ksic?: { code?: string } | null; industryGuide?: { name?: string } };
    sector = data.sector ?? null; ksic = data.ksic?.code ?? ""; guide = data.industryGuide?.name ?? "";
  } catch { /* 작성 자료가 없으면 문서 업종으로 */ }
  if (FOOD_KSIC.test(ksic) || FOOD_GUIDE.test(guide)) return "food";
  const description = input.description ?? "";
  if (!ksic && FOOD_WORDS.test(description) && !NOT_FOOD_MAKER.test(description)) return "food";
  if (sector && sector in SECTOR_GROUPS && sector !== "general") return SECTOR_GROUPS[sector as ProposalSector];
  return DOCUMENT_GROUPS[input.documentSector];
}

/** 이 장이 맡는 필수 항목 — 항목 종류마다 계획서에 있는 첫 장이 맡고, 맡을 장이 없으면 실행 요약이 맡는다 */
export function essentialsForChapter(key: string, group: EssentialGroup, presentKeys: ReadonlySet<string>): string[] {
  return (Object.keys(KIND_OWNERS) as EssentialKind[]).flatMap(kind => {
    const owner = KIND_OWNERS[kind].find(candidate => presentKeys.has(candidate)) ?? "summary/executive";
    return owner === key ? ESSENTIALS[group][kind] : [];
  });
}
