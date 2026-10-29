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
import { STRUCTURE_LABELS, type BusinessStructure } from "./business-structure";

export type EssentialBase = "food" | "retail" | "manufacturing" | "education" | "beauty" | "local" | "space" | "project" | "logistics" | "general";
/*
 * 운영 형태(계획서 품질 Q8, 2026-10-29) — 같은 업종 묶음 안에서도 매장이 있는지(점포 있음/없음), 손님에게 찾아가는지(방문형/매장형),
 * 직접 만들어 파는지에 따라 맞는 항목이 다르다. 연남동 1인 네일숍에 '손님 물건 파손·출장 시술·이동비'가, 방문·화상 과외에 '건축물대장·주소지 건축물 용도'가,
 * 집에서 만드는 캔들 스마트스토어에 매장 임대차 확인이 나왔다. 업종 이름이 아니라 구조 값(business-structure.ts의 delivery·capital,
 * 없으면 사업 설명의 운영 방식 말, 그다음 사업 유형)으로 정하고, 정해진 것만 묶음 이름 뒤에 붙인다('local/매장/찾아옴').
 * 정하지 못한 축은 붙이지 않고, 그 축의 항목은 예전처럼 조건 문장('빌리면', '출장이면')으로 넘긴다.
 */
type PlaceFlag = "" | "/매장" | "/무점포";
type ReachFlag = "" | "/방문" | "/찾아옴";
type MakeFlag = "" | "/제조";
export type EssentialGroup = `${EssentialBase}${PlaceFlag}${ReachFlag}${MakeFlag}`;
type EssentialKind = "setup" | "unitCost" | "operation" | "daily" | "filing" | "lease" | "precontract";
/** shop: 매장·작업장을 빌리는지, visit: 손님에게 찾아가는지, make: 파는 물건을 직접 만드는지 — null은 모름 */
type EssentialSetting = { shop: boolean | null; visit: boolean | null; make: boolean };

const BASE_NAMES: Record<EssentialBase, string> = {
  food: "음식·식품", retail: "상품 판매", manufacturing: "제조", education: "교육", beauty: "미용(헤어·네일·피부)", local: "동네 서비스", space: "공간 대여·숙박", project: "용역·소프트웨어·콘텐츠", logistics: "운송·물류", general: "일반",
};
const FLAG_NAMES: Record<string, string> = { 매장: "매장 있음", 무점포: "점포 없음", 방문: "손님에게 찾아감", 찾아옴: "손님이 찾아옴", 제조: "직접 만들어 팖" };
const FLAGS = { place: ["", "/매장", "/무점포"], reach: ["", "/방문", "/찾아옴"], make: ["", "/제조"] } as const;

/** 묶음 이름 — 작성 자료의 group 속성으로 들어간다(예: '동네 서비스(매장 있음·손님이 찾아옴)') */
export const ESSENTIAL_GROUP_NAMES = Object.fromEntries((Object.keys(BASE_NAMES) as EssentialBase[]).flatMap(base =>
  FLAGS.place.flatMap(place => FLAGS.reach.flatMap(reach => FLAGS.make.map(make => {
    const group = `${base}${place}${reach}${make}`, flags = group.split("/").slice(1).map(flag => FLAG_NAMES[flag]);
    return [group, flags.length ? `${BASE_NAMES[base]}(${flags.join("·")})` : BASE_NAMES[base]];
  }))))) as Record<EssentialGroup, string>;

function parseGroup(group: EssentialGroup): { base: EssentialBase; setting: EssentialSetting } {
  const [base, ...flags] = group.split("/") as [EssentialBase, ...string[]];
  return { base, setting: { shop: flags.includes("매장") ? true : flags.includes("무점포") ? false : null, visit: flags.includes("방문") ? true : flags.includes("찾아옴") ? false : null, make: flags.includes("제조") } };
}

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
/*
 * 제품을 파는 업종의 생산물배상책임보험(계획서 품질 Q8) — 법에 정해진 사실만: 제조물책임법 제3조는 제조물 결함으로 생긴 생명·신체·재산 손해를
 * 제조업자(제2조 3호 — 자기 상호·상표를 붙여 제조업자로 표시한 사람 포함)가 배상하게 하고, 제조업자를 알 수 없으면 영리로 공급한 자가 배상하게 한다(제3조③).
 * 이 법에는 보험 가입 의무 조항이 없어 선택 보험으로 쓰되, 제품·업종별 다른 법의 가입 의무는 확인하지 못했으므로 '관할 기관 확인'으로 둔다.
 */
const PRODUCT_LIABILITY = "생산물배상책임보험(보험료 확인 필요): 제조물책임법은 제품 결함으로 손님의 생명·신체·재산에 생긴 손해를 만든 사람(제품에 자기 상호·상표를 붙여 판 사람 포함)이 배상하게 하고, 만든 사람을 알 수 없으면 판 사람이 배상하게 합니다. 이 법에 보험 가입 의무는 없어 선택 보험이지만, 다루는 제품에 다른 법의 가입 의무가 있는지는 관할 기관 확인. 매달 내는 보험료면 월 고정비에 들어 있는지 확인합니다.";
/*
 * 직접 만들어 파는 상품 판매(계획서 품질 Q8) — 집에서 만드는 캔들을 상품 판매로 고르면 제조 항목(시제품·불량률·제품 안전 신고)이 빠졌다.
 * 생활화학제품: 화학제품안전법 제10조(안전기준 적합 확인·신고)·제34조(표시·광고 제한)와 안전확인대상생활화학제품 지정 및 안전·표시기준 고시(초·방향제·탈취제 등).
 * 확인·신고는 3년마다(고시 설명). 신고 창구는 한국환경산업기술원, 신고된 제품 조회는 초록누리(기후에너지환경부, 옛 환경부).
 */
const MAKER_FILING = "직접 만들어 팔면 만든 사람으로서 확인할 일을 씁니다: 만들 제품이 생활화학제품 안전확인대상(초·방향제·탈취제·세정제 등)이면 팔기 전에 지정 시험·검사기관에서 안전기준 적합 확인을 받고 한국환경산업기술원에 신고하며(화학제품안전법, 소량·수제도 면제 없음), 신고번호와 표시사항을 제품과 판매 페이지에 적고 '무독성·친환경' 같은 표현은 쓰지 않습니다. 신고된 제품은 초록누리(기후에너지환경부)에서 조회됩니다. 화장품·식품·전기용품 등 다른 품목이면 그 법의 등록·인증을 확인합니다. 대상인지는 관할 기관 확인.";
const MAKER_SPACE = "집이나 작업실에서 만들면 작업 공간과 원료 보관 장소를 정하고, 불이 잘 붙는 원료(향료·에탄올 등)를 많이 두면 위험물 저장 기준이 붙을 수 있어 관할 소방서에 확인한다고 씁니다.";

/*
 * 미용(공중위생) 업종(계획서 품질 Q8) — 공중위생관리법 제3조(영업 신고)·제17조(위생교육: 신고 전, 그 뒤 해마다)·제4조와 시행규칙 별표3·4
 * (기구 소독·분리 보관, 신고증·면허증 원본과 최종지급요금표 게시, 면적 기준 이상이면 바깥 게시, 세 가지 이상 서비스면 가격 내역서 사전 제공).
 * 시술 전 알레르기·피부 확인과 환기는 법정 의무로 확인하지 못해 '(제안)' 운영 기준으로 두고 법정 기준은 관할 기관 확인.
 */
const BEAUTY_FILING = "미용업 영업 신고(네일 등 해당 분야 면허)를 관할 시·군·구청에 하기 전에 위생교육을 받고(문을 연 뒤에도 해마다), 신고증·면허증 원본과 최종지급요금표를 영업소 안에 게시한다는 것을 씁니다(공중위생관리법). 영업장이 일정 면적 이상이면 바깥에도 요금표를 게시해야 하고(면적 기준은 관할 기관 확인), 세 가지 이상 시술을 함께 하면 시술별 가격과 총액 내역서를 손님에게 미리 줍니다.";

/*
 * 교육(학원법) — 학원법 제14조의2(개인과외교습자: 주소지 관할 교육장에게 신고, 대학 재학생 예외·휴학생 대상, 성인 대상은 과외교습 아님),
 * 제15조(교습비등 게시·광고 표시, ①영수증 발급), 제16조②(교습시간은 시·도 조례로 정하는 범위에서 교육감이 정함 — 지역마다 다름),
 * 제18조·시행령 제18조③·별표4(반환 사유가 생긴 날부터 5일 안에 반환, 교습 시작 전 전액, 지난 교습시간 비율에 따라 줄어듦).
 * 개인정보 보호법 제22조의2(만 14세 미만 아동의 개인정보는 법정대리인 동의). 방문 수업의 안전 원칙은 법정 기준이 아니라 '(제안)'.
 */
const LESSON_FILING = "운영 형태(학원 등록·교습소 신고·개인과외교습자 신고)를 관할 교육지원청에 확인하는 일을 씁니다. 집이나 학생 집에서 가르치는 개인과외는 주소지 관할 교육지원청에 교습자 정보·과목·장소·교습비를 신고하고(학원법, 대학 재학생은 예외·휴학생은 대상, 성인만 가르치면 대상 아님), 신고 없이 하면 처벌 대상입니다.";
const LESSON_FEES = "교습비 원칙을 씁니다: 교습비와 반환 기준을 학습자가 보기 쉬운 곳에 게시하고 광고에는 신고번호·교습비를 표시합니다. 교습비를 받으면 영수증(학습자 이름·과목·교습기간이 적힌 영수증이나 카드·현금영수증)을 줍니다. 수강을 그만두면 반환 사유가 생긴 날부터 5일 안에 학원법 시행령의 반환 기준(교습 시작 전이면 전액, 지난 교습 시간 비율에 따라 줄어듦)대로 돌려줍니다. 결석·보강 기준도 함께 정합니다.";
const LESSON_HOURS = "교습 시간은 시·도 조례로 정할 수 있어 지역마다 다르므로(학원법), 시간표가 그 범위 안인지 관할 교육지원청에 확인한다고 씁니다.";
const LESSON_PRIVACY = "학생·보호자 연락처 같은 개인정보는 쓰는 목적을 알리고 동의를 받으며, 만 14세 미만 학생의 개인정보는 법정대리인(보호자) 동의를 받아야 합니다(개인정보 보호법).";
const LESSON_VISIT = "학생 집으로 찾아가 가르치면, 미성년 학생 수업은 보호자가 집에 있는 시간에 하고 수업 일지·연락은 보호자와 함께 나누는 안전 원칙을 씁니다('(제안)' — 법으로 정한 기준은 아님).";

/** 업종 묶음과 운영 형태에 맞는 항목. 모르는 축(null)은 조건 문장으로 넘긴다 */
function essentials(base: EssentialBase, s: EssentialSetting): Record<EssentialKind, string[]> {
  const shop = s.shop !== false, visit = s.visit !== false;
  const setup = (items: Array<string | false>, deposit = true) => `초기 지출을 항목별로 나눠 적습니다: ${items.filter(Boolean).join(", ")}. 견적이 없는 항목은 '(확인 필요)'를 붙입니다.${deposit && shop ? ` ${DEPOSIT_SPLIT}` : ""}`;
  const lease = shop ? [LEASE_CHECK] : [];
  switch (base) {
    case "food": return {
      setup: [
        `초기 지출을 항목별로 나눠 적습니다: ${SHOP_SETUP}, 주방 환기·배수 공사, 조리·냉장 설비, 만들어 두고 파는 안이면 냉장 진열대·보관 설비, 카드 단말기(포스). 견적이 없는 항목은 '(확인 필요)'를 붙이고, 빌린 공간에 이미 있는 설비는 '이미 있음'으로 적습니다. ${DEPOSIT_SPLIT}`,
        FOOD_INSURANCE,
        PRODUCT_LIABILITY,
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
    };
    case "retail": return {
      setup: [setup([s.make ? "원료·도구와 시제품 재료" : "첫 재고(최소 발주 수량)", "상세 페이지 사진", "포장재", shop && SHOP_SETUP, shop ? "카드 단말기(포스)" : "판매 플랫폼 가입·결제 수단"]), PRODUCT_LIABILITY],
      unitCost: [s.make
        ? "한 건당 비용에 원료·포장과 함께 불량률(만들었다가 팔 수 없는 비율), 판매·결제 수수료, 택배비, 반품으로 돌아오는 몫을 넣습니다. 불량률을 모르면 '(확인 필요)'로 두고 시제품을 만들며 잰다고 씁니다."
        : "한 건당 비용에 판매·결제 수수료, 택배비, 반품으로 돌아오는 몫을 넣습니다. 모르는 값은 '(확인 필요)'로 둡니다."],
      operation: ["팔리지 않는 재고(유행이 지나거나 파손된 상품)를 언제 어떻게 처리할지(할인 시점·묶음 판매)와 반품·교환 처리 방법을 씁니다.", ...(s.make ? [MAKER_SPACE] : [])],
      daily: ["하루 점검표를 표 한 장(점검 항목 | 기준 | 언제 확인)으로 넣습니다: 새 주문·출고 마감 시각 확인, 재고 수량(품절 임박 상품), 손님 문의·리뷰 답변, 반품·교환 접수. 숫자 기준은 대표가 정한 값만 씁니다."],
      filing: ["온라인으로 팔면 통신판매업 신고, 상품마다 표시·인증(KC 등)이 필요한지 확인하는 일을 씁니다.", ...(s.make ? [MAKER_FILING] : [])],
      lease, precontract: [],
    };
    case "manufacturing": return {
      setup: [setup(["설비·금형", "시제품", "첫 원자재", shop && "작업장을 빌리면 보증금·인테리어(전기·환기 공사)"]), PRODUCT_LIABILITY],
      unitCost: ["한 건당 비용에 원자재·포장과 함께 불량률(만들었다가 팔 수 없는 비율)을 넣습니다. 모르면 '(확인 필요)'로 두고 시제품 생산에서 잰다고 씁니다."],
      operation: ["최소 생산량, 납기가 늦어질 때와 원자재 가격이 오를 때의 대응을 씁니다."],
      daily: ["하루 점검표를 표 한 장(점검 항목 | 기준 | 언제 확인)으로 넣습니다: 작업 전 설비 점검, 보호구 착용, 불량 수량 기록, 원자재 재고, 작업장 정리·환기. 안전 기준 숫자는 관할 기관 확인으로 둡니다."],
      filing: ["제품 인증·표시 의무와 공장·제조업 등록이 필요한지 확인하는 일을 씁니다."],
      lease, precontract: [],
    };
    case "education": return {
      setup: [setup(["교재·교구", s.shop === false ? "화상 수업이면 카메라·태블릿 같은 장비와 화상 도구 구독" : "장비", shop && SHOP_SETUP, shop ? "카드 단말기" : "교습비 받을 방법(계좌이체·카드 결제)"])],
      unitCost: [`한 명(한 회)당 비용에 교재·재료비${shop ? ", 장소 대여비" : ""}, 플랫폼·결제 수수료${visit ? ", 학생 집으로 가면 이동 시간·교통비" : ""}를 넣습니다.`],
      operation: [LESSON_FEES, LESSON_HOURS, LESSON_PRIVACY, ...(visit ? [LESSON_VISIT] : [])],
      daily: [`하루 점검표를 표 한 장(점검 항목 | 기준 | 언제 확인)으로 넣습니다: 출결 기록, 결석생 보강 일정, ${shop ? "교실 환기·안전(비상구·소화기 위치)" : "수업 일지·과제 확인"}, 학부모·수강생 연락 기록.`],
      filing: [LESSON_FILING],
      lease, precontract: [],
    };
    case "beauty": return {
      setup: [setup(["시술 의자·테이블·기구", "소독 장비(소독한 기구와 안 한 기구를 나눠 둘 용기 포함)", "첫 재료", "환기 설비", shop && SHOP_SETUP, "카드 단말기"]), "보험(보험료 확인 필요): 시술 중 손님이 다치거나 피부 이상이 생겼을 때를 대비한 배상책임보험 — 미용업에 법으로 정한 가입 의무가 있는지는 관할 기관 확인."],
      unitCost: ["한 건당 비용에 재료와 손님마다 바꾸는 일회용품, 결제 수수료를 넣습니다. 모르는 값은 '(확인 필요)'로 둡니다."],
      operation: [
        "예약 노쇼 대책(예약금·취소 마감 시각)을 씁니다.",
        "시술 전 손님에게 알레르기·피부 상태를 묻고 기록하며, 이상이 있으면 시술하지 않는 기준과 작업 중 환기(냄새·분진) 기준을 씁니다('(제안)' — 법으로 정한 의무로 확인되지 않았고, 법정 기준은 관할 기관 확인).",
      ],
      daily: ["하루 점검표를 표 한 장(점검 항목 | 기준 | 언제 확인)으로 넣습니다: 기구 소독과 소독한 기구·안 한 기구 나눠 보관(소독 기준은 관할 기관 확인), 손님마다 일회용품 바꾸기, 환기, 시술 기록(알레르기 확인 포함), 다음 날 예약 확인 연락."],
      filing: [BEAUTY_FILING],
      lease, precontract: [],
    };
    case "local": return {
      setup: [setup(["장비·공구·첫 소모품", visit && "출장이면 차량", shop && SHOP_SETUP, "카드 단말기"])],
      unitCost: [`한 건당 비용에 소모품${visit ? "과 이동 시간·이동 비용" : ""}을 넣습니다.`],
      operation: [`예약 노쇼 대책(예약금·취소 마감 시각)과 ${visit ? "작업 중 손님 물건이 파손됐을 때의 보상(배상책임보험 등)" : "작업 중 손님이 다치거나 맡긴 물건이 망가졌을 때의 보상(배상책임보험 등)"}을 씁니다.`],
      daily: ["하루 점검표를 표 한 장(점검 항목 | 기준 | 언제 확인)으로 넣습니다: 다음 날 예약 확인 연락, 도구·기구 세척·소독(공중위생 업종의 소독 기준은 관할 기관 확인), 소모품 재고, 작업 기록(손님·작업 내용)."],
      filing: ["이 서비스에 영업 신고가 필요한지(세탁처럼 공중위생 업종은 신고 대상) 관할 시·군·구청에 확인하는 일을 씁니다."],
      lease, precontract: [],
    };
    case "space": return {
      setup: [setup(["보증금·권리금·인테리어·소방 설비·간판", "예약 시스템", "카드 단말기"])],
      unitCost: ["1회 이용당 비용에 청소·소모품·전기와 예약 플랫폼 수수료를 넣습니다."],
      operation: ["예약 노쇼·취소 수수료 기준과 이용 규칙(소음·인원·파손)을 씁니다."],
      daily: ["하루 점검표를 표 한 장(점검 항목 | 기준 | 언제 확인)으로 넣습니다: 이용 전후 청소·파손 확인(사진 기록), 소화기·비상구·유도등 확인, 소모품 채우기, 다음 예약 확인."],
      filing: ["건축물 용도와 업종 신고·등록 필요 여부, 소방 기준을 계약 전에 확인하는 일을 씁니다."],
      lease: [LEASE_CHECK], precontract: [],
    };
    case "project": return {
      setup: ["초기 지출을 항목별로 나눠 적습니다: 장비, 소프트웨어 구독, 포트폴리오·견본 제작. 견적이 없는 항목은 '(확인 필요)'를 붙입니다."],
      unitCost: ["한 건당 비용에 외주·서버·결제 수수료와 수정에 드는 시간을 넣습니다."],
      operation: ["계약서의 범위·검수 기준·수정 횟수와, 대금을 나중에 받으면 그동안 버틸 돈을 씁니다."],
      daily: [],
      filing: ["계약서, 결과물의 사용 권리(저작권), 손님 개인정보 처리 방법을 확인하는 일을 씁니다."],
      lease: [], precontract: [],
    };
    case "logistics": return {
      setup: ["초기 지출을 항목별로 나눠 적습니다: 차량(구입·임차), 보험, 장비. 견적이 없는 항목은 '(확인 필요)'를 붙입니다."],
      unitCost: ["한 건당 비용에 유류비·통행료·보험료와 차량 유지비를 넣습니다."],
      operation: ["물건 파손·분실 때의 보상과 배송이 늦어질 때의 대응을 씁니다."],
      daily: ["하루 점검표를 표 한 장(점검 항목 | 기준 | 언제 확인)으로 넣습니다: 운행 전 차량 점검(타이어·브레이크·등화), 짐 고정, 배송 완료 기록(사진·서명), 운전 중 휴식(법정 휴게 기준은 관할 기관 확인)."],
      filing: ["화물 운송 허가 등 이 운송에 필요한 허가가 있는지 확인하는 일을 씁니다."],
      lease: [], precontract: [],
    };
    case "general": return {
      setup: [setup([shop && "공간을 빌리면 보증금·권리금·인테리어·간판", "장비", "카드 단말기 등"])],
      unitCost: ["버리거나 돌려주는 몫(폐기·반품·불량)이 있으면 한 건당 비용에 넣습니다."],
      operation: ["가장 큰 운영 위험 하나(예약 취소·불량·사고 등)와 대책을 씁니다."],
      daily: [],
      filing: ["이 업종에 신고·허가가 필요한지 관할 기관에 확인하는 일을 씁니다."],
      lease, precontract: [],
    };
  }
}

const SECTOR_GROUPS: Record<ProposalSector, EssentialBase> = {
  food_beverage: "food", retail_commerce: "retail", manufacturing: "manufacturing", education: "education", local_service: "local",
  space_hospitality: "space", logistics: "logistics", b2b_service: "project", software: "project", content_media: "project", general: "general",
};
const DOCUMENT_GROUPS: Record<DocumentSector, EssentialBase> = {
  cafe_food: "food", commerce: "retail", manufacturing: "manufacturing", education: "education", local_service: "local",
  space: "space", logistics: "logistics", b2b_service: "project", software: "project", content: "project", general: "general",
};
/* 표준산업분류 앞자리 — 음식점(56)·식품 제조(10)·식품 소매(472)는 업종 칸이 비어 있어도 음식 묶음 */
const FOOD_KSIC = /^(56|10|472)/;
const FOOD_GUIDE = /음식|도시락|반찬|카페|빵|제과|식품|분식|푸드|급식|케이터링/;
/* 사업 설명의 음식 낱말 — 음식을 직접 만들어 파는 사업만. 음식점을 돕는 사업(컨설팅·앱·교육 등)은 업종 칸을 따른다 */
const FOOD_WORDS = /도시락|반찬|김밥|분식|떡볶이|베이커리|빵집|제과|디저트|케이크|카페|커피|식당|음식점|밀키트|푸드트럭|케이터링|수제\s*(?:잼|청|간식|버거)/;
const NOT_FOOD_MAKER = /컨설팅|대행|교육|강의|강좌|클래스|학원|플랫폼|앱|소프트웨어|중개|마케팅|디자인|촬영|인테리어/;
/* 미용·이용업(공중위생관리법) — 표준산업분류 9611과 업종 가이드(미용실·네일·피부관리, 이용업). 청소·이사·수리와 같은 '동네 서비스'에서 떼어 낸다 */
const BEAUTY_KSIC = /^9611/;
const BEAUTY_GUIDE = /미용|네일|피부\s*관리|이용업/;

/*
 * 운영 형태를 읽는 말 — 업종 이름이 아니라 일하는 방식의 말만 본다. '집에서·매장 없이'처럼 점포가 없다고 밝힌 말이 매장 말보다 먼저다.
 * 방문·화상·온라인만 있으면 점포 없음. 찾아가는 일(방문·출장)이면 방문형.
 */
const HOME_WORDS = /집에서|자택|무점포|(?:매장|점포|가게)\s*없이/;
const SHOP_WORDS = /매장|가게|점포|상가|숍|샵|공방/;
const REMOTE_WORDS = /방문|출장|화상|온라인|스마트\s*스토어|택배/;
const VISIT_WORDS = /방문|출장|찾아\s*가/;
const MAKE_WORDS = /직접\s*만들|만들어|만드는|수제|핸드\s*메이드|공방|제작/;
const TYPE_SETTING: Partial<Record<string, Pick<EssentialSetting, "shop" | "visit">>> = {
  store: { shop: true, visit: false }, space: { shop: true, visit: false }, ship: { shop: false, visit: false }, visit: { shop: false, visit: true }, app: { shop: false, visit: false }, platform: { shop: false, visit: false },
};

type StructureValue<A extends "delivery" | "capital"> = BusinessStructure[A] | null;
function fromStructure(delivery: StructureValue<"delivery">, capital: StructureValue<"capital">): Pick<EssentialSetting, "shop" | "visit"> {
  const shop = capital === "storefront" || delivery === "store" ? true : capital === "remote" || capital === "vehicle" || (delivery != null && ["online", "visit", "delivery"].includes(delivery)) ? false : null;
  const visit = delivery === "visit" ? true : delivery != null && delivery !== "mixed" ? false : null;
  return { shop, visit };
}
const labelKey = <A extends "delivery" | "capital">(axis: A, label: unknown) =>
  (Object.entries(STRUCTURE_LABELS[axis]).find(([, text]) => text === label)?.[0] ?? null) as StructureValue<A>;

/** 운영 형태: 업종 코드나 사용자가 고른 구조 → 사업 설명의 운영 방식 말 → 업종 기본 구조 → 사업 유형 */
function essentialSetting(data: IntakeData, description: string): EssentialSetting {
  const labels = data.structure?.labels ?? data.ksic?.structure ?? [];
  const delivery = labels.map(label => labelKey("delivery", label)).find(Boolean) ?? null;
  const capital = labelKey("capital", data.structure?.capitalPlan?.form);
  const chosenDelivery = (data.structure?.userChosen ?? []).map(item => labelKey("delivery", item.split(": ")[1])).find(Boolean) ?? null;
  const strong = fromStructure(chosenDelivery ?? (data.ksic ? delivery : null), data.ksic ? capital : null);
  const weak = fromStructure(delivery, capital);
  const typed = TYPE_SETTING[data.businessType?.id ?? ""] ?? { shop: null, visit: null };
  const wordShop = HOME_WORDS.test(description) ? false : SHOP_WORDS.test(description) ? true : REMOTE_WORDS.test(description) ? false : null;
  const wordVisit = VISIT_WORDS.test(description) ? true : wordShop != null ? false : null;
  return {
    shop: strong.shop ?? wordShop ?? weak.shop ?? typed.shop ?? null,
    visit: strong.visit ?? wordVisit ?? weak.visit ?? typed.visit ?? null,
    make: delivery === "production" || MAKE_WORDS.test(description),
  };
}

const SETTING_BASES = new Set<EssentialBase>(["retail", "manufacturing", "education", "beauty", "local", "general"]);

type IntakeData = {
  sector?: string | null;
  ksic?: { code?: string; structure?: string[] } | null;
  industryGuide?: { name?: string };
  structure?: { labels?: string[]; userChosen?: string[]; capitalPlan?: { form?: string } } | null;
  businessType?: { id?: string };
};

/** 계획서 작성 자료(intake-context JSON)와 문서 업종으로 업종 묶음과 운영 형태를 고른다 */
export function essentialGroup(input: { intakeContext?: string; documentSector: DocumentSector; description?: string }): EssentialGroup {
  let data: IntakeData = {};
  try { data = JSON.parse(input.intakeContext ?? "") as IntakeData; } catch { /* 작성 자료가 없으면 문서 업종으로 */ }
  const sector = data.sector ?? null, ksic = data.ksic?.code ?? "", guide = data.industryGuide?.name ?? "";
  const description = input.description ?? "";
  const base: EssentialBase = FOOD_KSIC.test(ksic) || FOOD_GUIDE.test(guide) || (!ksic && FOOD_WORDS.test(description) && !NOT_FOOD_MAKER.test(description)) ? "food"
    : BEAUTY_KSIC.test(ksic) || BEAUTY_GUIDE.test(guide) ? "beauty"
    : sector && sector in SECTOR_GROUPS && sector !== "general" ? SECTOR_GROUPS[sector as ProposalSector]
    : DOCUMENT_GROUPS[input.documentSector];
  // 운영 형태에 따라 항목이 달라지지 않는 묶음(음식은 늘 매장, 공간 대여·용역·운송은 형태가 정해져 있음)은 이름에 붙이지 않는다
  if (!SETTING_BASES.has(base)) return base;
  const setting = essentialSetting(data, description);
  const place = setting.shop === true ? "/매장" : setting.shop === false ? "/무점포" : "";
  const reach = setting.visit === true ? "/방문" : setting.visit === false ? "/찾아옴" : "";
  // 직접 만드는지는 상품 판매 묶음만 가른다(음식·제조 묶음은 이미 만드는 사업이다)
  const make = base === "retail" && setting.make ? "/제조" : "";
  return `${base}${place}${reach}${make}` as EssentialGroup;
}

/** 이 장이 맡는 필수 항목 — 항목 종류마다 계획서에 있는 첫 장이 맡고, 맡을 장이 없으면 실행 요약이 맡는다 */
export function essentialsForChapter(key: string, group: EssentialGroup, presentKeys: ReadonlySet<string>): string[] {
  const { base, setting } = parseGroup(group);
  const items = essentials(base, setting);
  return (Object.keys(KIND_OWNERS) as EssentialKind[]).flatMap(kind => {
    const owner = KIND_OWNERS[kind].find(candidate => presentKeys.has(candidate)) ?? "summary/executive";
    return owner === key ? items[kind] : [];
  });
}
