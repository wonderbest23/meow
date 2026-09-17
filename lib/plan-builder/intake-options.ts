import { PROPOSAL_SECTORS, type ProposalSector } from "./proposal-blueprint";
import type { IntakeMode, IntakeQuestion } from "./intake-questions";

/**
 * Chip catalogue for the select-first intake (docs/intake-select-first-spec-2026-09-16.md).
 * Rules only, no AI. Labels are public-facing noun phrases: no "/" or "," inside a label,
 * channel labels ≤ 20 chars, amount labels carry "원" on every boundary.
 * Everything here is catalogue data — nothing is persisted; answers stay strings/numbers/arrays.
 */
export type ChipOption = { value: string; label: string; group?: string; hint?: string };
/** Won ranges for range_chips_with_exact. `null` bounds are open ends. */
export type AmountRange = { label: string; min: number | null; max: number | null };

/** Assembly grammar (spec §1.3): steps joined by " / ", multiple picks inside a step by ", ". */
export const STEP_SEPARATOR = " / ";
export const LIST_SEPARATOR = ", ";
/** Maximum picks per multi-pick hybrid question; unlisted questions allow one. */
export const CHIP_LIMITS: Record<string, number> = { customer: 2, problem: 2, channel: 3, conditions: 4, "software.workflow": 2, "education.learningOutcome": 2, "general.reviewCriteria": 3 };

/**
 * Step (group) names used by multi-step chip questions. Single-step sets carry no group.
 * - channel: "common" (6 shared) + "sector" (2 sector slots)
 * - capacity: "people" (5) → "period" (하루·일주일·한 달) → "unit" (건·개·명·좌석·룸·회); the count comes from numberPresets({ id: "capacity" })
 * - goal: "period" → "metric" → "amount" (only when the metric label contains "N원"; "N건" uses numberPresets({ id: "goal" }))
 * - business: "prefill" (startup: 업태 nouns per sector, operating: 8 sentence starters with ○○ placeholders)
 * - problem (operating): "common" (6) + "sector" (2)
 * - price (space_hospitality only): "basis" (시간당 · 1박 · 월 멤버십) — pass the chosen value as `basis` to amountRanges()
 */
export const CHIP_GROUPS = {
  channelCommon: "common", channelSector: "sector", people: "people", period: "period", unit: "unit", metric: "metric", amount: "amount", prefill: "prefill", problemCommon: "common", problemSector: "sector", priceBasis: "basis",
} as const;

const chip = (label: string, group?: string, hint?: string): ChipOption => ({ value: label, label, ...(group ? { group } : {}), ...(hint ? { hint } : {}) });
const chips = (labels: readonly string[], group?: string): ChipOption[] => labels.map(label => chip(label, group));
type SectorTable = Record<ProposalSector, readonly string[]>;

/** Example business types shown under each industry chip (spec §3.2). Injected by the server as options[].hint on `industry`. */
export const INDUSTRY_HINTS: Record<ProposalSector, string> = {
  b2b_service: "컨설팅·대행·기업 교육", software: "앱·웹 서비스·SaaS", food_beverage: "카페·식당·반찬·베이커리", retail_commerce: "스마트스토어·쇼핑몰·편집숍",
  manufacturing: "부품·굿즈·식품 제조", education: "과외·학원·온라인 강의", local_service: "청소·미용·네일·이사·수리", space_hospitality: "공유오피스·스튜디오·파티룸",
  logistics: "퀵·용달·이사·정기 납품", content_media: "사진·영상·디자인·SNS 대행", general: "위에 없으면 여기",
};

// ---- Appendix A: sector chip sets -------------------------------------------------------------
const CUSTOMER: SectorTable = {
  b2b_service: ["1인·소규모 사업자", "10인 미만 스타트업·팀", "중소기업 실무 부서", "전문직 사무소(세무·법률·의료)", "프랜차이즈 본사·가맹점", "공공기관·비영리"],
  software: ["개인 사용자", "자영업자·소규모 매장", "스타트업·개발팀", "중소기업 특정 부서", "프리랜서·크리에이터", "교육·공공기관"],
  food_beverage: ["점심·테이크아웃을 찾는 인근 직장인", "주거 상권 가족·주부", "대학가·학원가 학생", "관광객·나들이 방문객", "배달로 식사하는 1인 가구", "단체·모임 예약 손님"],
  retail_commerce: ["취향 소비를 즐기는 20~30대", "육아 가정", "1인 가구", "반려동물 가구", "취미·수집가", "도매 구매 사업자"],
  manufacturing: ["일반 소비자", "유통사·바이어", "다른 제조사(부품·OEM)", "기업 판촉·굿즈 담당자", "공공 조달", "해외 바이어"],
  education: ["초·중·고 학생(비용은 학부모)", "대학생·취업 준비생", "직장인 자기계발", "시니어", "기업 임직원 교육 담당", "창업 준비자·소상공인"],
  local_service: ["외모·건강 관리를 원하는 직장인·학생", "1인 가구·직장인", "맞벌이·육아 가정", "고령자·돌봄·이사 예정 가구", "반려동물 가구", "소규모 매장·사무실"],
  space_hospitality: ["모임·파티 그룹", "스터디·소규모 회의", "촬영·행사 준비 고객", "여행객·가족 숙박", "1인 창업자·소규모 팀(사무 공간)", "기업 워크숍·행사"],
  logistics: ["지역 음식점·소상공인", "온라인 셀러", "기업 서류·샘플 발송", "개인(퀵·용달)", "이사·입주 가구", "대형 물류사 하도급"],
  content_media: ["소상공인 매장", "온라인 셀러", "스타트업·기업 마케팅팀", "개인(웨딩·가족·프로필)", "크리에이터", "기관·학교 행사"],
  general: ["개인 소비자", "사업자", "특정 관심사 커뮤니티", "특정 지역 주민", "특정 연령대", "기관·단체"],
};
const PROBLEM: SectorTable = {
  b2b_service: ["반복 업무에 시간이 새어 나감", "문서·절차가 정리돼 있지 않음", "담당자가 없어 대응이 늦음", "외주 비용이 부담", "검수 기준이 없어 결과가 흔들림", "전문 인력을 채용할 여유가 없음"],
  software: ["기존 도구가 복잡하고 비쌈", "엑셀·수기 관리로 실수가 남", "여러 도구를 오가며 시간이 듦", "우리 상황에 맞는 기능이 없음", "데이터가 흩어져 있음", "유료 전환·해지가 많음"],
  food_beverage: ["원하는 메뉴를 근처에서 못 찾음", "기다리는 시간이 김", "배달 메뉴의 가격·품질 불만", "건강·알레르기 선택지 부족", "단체·사전 주문이 어려움", "매일 식사·반찬 준비가 부담됨"],
  retail_commerce: ["원하는 상품을 찾기 어려움", "품질이 들쭉날쭉함", "가격이 부담됨", "배송·교환이 불편함", "취향에 맞는 큐레이션이 없음", "재고·품절이 잦음"],
  manufacturing: ["소량·맞춤 주문을 받아주는 곳이 없음", "납기가 길고 불확실함", "품질 편차·불량", "최소 수량이 너무 큼", "단가·견적이 불투명함", "기존 제품이 용도에 맞지 않음"],
  education: ["혼자 배우면 꾸준히 못 함", "실습 없이 이론만 배움", "내 수준에 맞는 수업이 없음", "시간·장소 맞추기가 어려움", "배워도 실제로 못 씀", "수강생 이탈·정원 미달"],
  local_service: ["맞는 업체를 찾기 어려움", "예약·방문 시간이 안 맞음", "가격이 불투명함", "작업 범위·책임이 불명확함", "원하는 스타일·결과를 맞춰 주는 곳이 없음", "노쇼·취소 대응이 없음"],
  space_hospitality: ["목적에 맞는 공간을 찾기 어려움", "예약·결제가 번거로움", "인원·시간 조건이 안 맞음", "시설·청결이 기대에 못 미침", "사무실·공간을 장기 계약하기엔 부담이 큼", "공실·비수기 가동률"],
  logistics: ["당일·시간 지정 배송이 없음", "소량 정기 배송을 안 받아줌", "파손·분실 책임이 불명확함", "요금이 불투명함", "이사·큰 짐 옮길 때 믿을 곳이 없음", "특정 거래처 의존"],
  content_media: ["직접 만들 시간·기술이 없음", "기존 대행은 비싸고 느림", "결과물이 브랜드와 안 맞음", "수정·소통이 어려움", "꾸준히 올릴 콘텐츠가 부족함", "수정 요청 과다·단가 하락"],
  general: ["필요한데 해주는 곳이 없음", "기존 방식이 불편함", "비용이 부담됨", "시간이 부족함", "믿을 만한 정보가 없음", "특정 거래처·채널 의존"],
};
/** Operating mode problem chips: 6 shared operating issues + 2 sector-specific issues (spec §3.3). */
const OPERATING_PROBLEM_COMMON = ["매출이 정체·감소하고 있다", "신규 고객이 부족하다", "재방문·재구매가 낮다", "비용·원가 부담이 크다", "인력·내 시간이 부족하다", "운영·홍보 방식이 비효율적이다"] as const;
const OPERATING_PROBLEM_SECTOR: SectorTable = {
  b2b_service: ["특정 거래처 의존이 크다", "미수금·납기 문제가 잦다"],
  software: ["유료 전환이 낮다", "해지가 많다"],
  food_beverage: ["피크 시간 대응이 어렵다", "폐기·수수료 부담이 크다"],
  retail_commerce: ["피크 시간 대응이 어렵다", "폐기·수수료 부담이 크다"],
  manufacturing: ["특정 거래처 의존이 크다", "미수금·납기 문제가 잦다"],
  education: ["수강생 이탈이 있다", "정원 미달이 잦다"],
  local_service: ["노쇼·취소가 잦다", "이동 시간이 길다"],
  space_hospitality: ["공실이 있다", "비수기 가동률이 낮다"],
  logistics: ["특정 거래처 의존이 크다", "미수금·납기 문제가 잦다"],
  content_media: ["수정 요청이 과다하다", "단가가 낮아진다"],
  general: ["특정 거래처·채널 의존이 크다", "운영 기준이 정리돼 있지 않다"],
};
const OFFER: SectorTable = {
  b2b_service: ["문서·보고서 작성 대행", "업무 절차·템플릿 정리", "마케팅·홍보 실행 대행", "웹사이트·시스템 구축 대행", "교육·워크숍", "정기 자문(월 리테이너)"],
  software: ["웹 서비스(구독)", "모바일 앱", "업무 자동화 도구", "예약·주문 관리 시스템", "데이터·리포트 대시보드", "맞춤 개발"],
  food_beverage: ["커피·음료", "베이커리·디저트", "식사 메뉴", "반찬·도시락·밀키트", "사전 주문·케이터링", "주류·안주"],
  retail_commerce: ["패션·잡화", "문구·굿즈", "식품·건강식품", "생활·인테리어", "뷰티", "취미·수집품"],
  manufacturing: ["부품·소재 납품(산업용)", "완제품", "OEM·ODM 생산", "시제품·소량 제작", "생활 소품·굿즈", "설비·장비"],
  education: ["1:1 과외·코칭", "그룹 수업", "온라인 라이브", "녹화 강의", "워크숍·특강", "기업 출강"],
  local_service: ["매장에서 받는 관리·시술(네일·헤어·피부)", "방문 청소·정리", "이사·짐 운반", "수리·설치", "반려동물 돌봄·미용", "운동·건강 코칭"],
  space_hospitality: ["상주 좌석·사무실", "비상주 주소", "회의실·강의실 대관", "파티룸·스튜디오 대관", "숙박(1박)", "장기 임대"],
  logistics: ["당일 퀵", "정기 납품 배송", "택배·풀필먼트 대행", "용달·이사 운송", "화물 운송", "보관"],
  content_media: ["사진 촬영", "영상 제작", "디자인·썸네일", "글·블로그", "SNS 운영 대행", "자기 채널 운영"],
  general: ["1회 서비스", "상품 판매", "구독·회원", "공간·장비 대여", "디지털 콘텐츠", "제작·대행 서비스"],
};
export const CHANNEL_COMMON = ["매장 방문", "인스타그램·SNS", "네이버 검색·플레이스", "유튜브·숏폼", "지역 커뮤니티·당근·맘카페", "지인·입소문"] as const;
const CHANNEL_SECTOR: SectorTable = {
  b2b_service: ["직접 영업·제안(이메일·링크드인)", "크몽·숨고"],
  software: ["검색·블로그 콘텐츠", "앱스토어·런칭 커뮤니티"],
  food_beverage: ["배달앱(배민·쿠팡이츠)", "네이버 예약·단체 주문"],
  retail_commerce: ["스마트스토어·쿠팡·오픈마켓", "자사몰·라이브커머스"],
  manufacturing: ["전시회·직접 영업", "도매·바이어 납품"],
  education: ["숨고·클래스 플랫폼", "지역 커뮤니티·맘카페·기관 계약"],
  local_service: ["숨고·당근 등 지역 앱", "네이버 예약"],
  space_hospitality: ["스페이스클라우드·숙박 플랫폼", "자체 홈페이지·재방문"],
  logistics: ["화물·배달 플랫폼", "화주 직접 영업"],
  content_media: ["크몽·숨고", "포트폴리오 사이트·대행사 제휴"],
  general: ["오픈마켓·플랫폼", "자체 홈페이지"],
};
export const CAPACITY_PEOPLE = ["대표자 혼자", "동업자·가족과 함께", "직원·아르바이트 1~2명", "프리랜서·외주와 함께", "필요할 때 일용·외주"] as const;
export const CAPACITY_PERIODS = ["하루", "일주일", "한 달"] as const;
const CAPACITY_UNITS: SectorTable = {
  b2b_service: ["건", "회", "명", "개", "좌석·룸"], software: ["명", "건", "개", "회", "좌석·룸"], food_beverage: ["건", "좌석·룸", "개", "명", "회"], retail_commerce: ["개", "건", "명", "회", "좌석·룸"],
  manufacturing: ["개", "건", "명", "회", "좌석·룸"], education: ["명", "회", "건", "개", "좌석·룸"], local_service: ["건", "명", "회", "개", "좌석·룸"], space_hospitality: ["좌석·룸", "건", "명", "회", "개"],
  logistics: ["건", "개", "명", "회", "좌석·룸"], content_media: ["개", "건", "회", "명", "좌석·룸"], general: ["건", "개", "명", "회", "좌석·룸"],
};
export const GOAL_PERIODS = ["3개월 안에", "6개월 안에", "1년 안에", "기간 미정"] as const;
/** Metric labels with "N원" expect an "amount" chip; "N건" expects numberPresets({ id: "goal" }). */
const GOAL_METRICS: Record<IntakeMode, readonly string[]> = {
  exploring: ["첫 유료 고객·첫 판매", "매장·공간 오픈", "시제품·서비스 첫 출시", "월 매출 N원", "월 주문·계약 N건", "손익분기 도달", "본업 병행 부수입", "전업 전환"],
  startup: ["첫 유료 고객·첫 판매", "매장·공간 오픈", "시제품·서비스 첫 출시", "월 매출 N원", "월 주문·계약 N건", "재구매·재계약 고객 확보", "손익분기 도달", "전업 전환"],
  operating: ["월 매출 N원 올리기", "신규 고객·거래처 N건 늘리기", "재방문·재구매 늘리기", "월 비용 N원 줄이기", "손익분기 넘기기", "가동률·공실 개선", "내 노동시간 줄이기·인력 보강", "새 상품·채널 시작"],
};
const HIGH_VOLUME_SECTORS: ReadonlySet<ProposalSector> = new Set(["food_beverage", "space_hospitality", "manufacturing", "logistics"]);
const GOAL_AMOUNTS_DEFAULT = ["100만원", "300만원", "500만원", "1,000만원", "3,000만원"] as const;
const GOAL_AMOUNTS_HIGH = ["500만원", "1,000만원", "3,000만원", "1억원"] as const;
export const EXPERIENCE_CHIPS = ["문서·사무·기획", "개발·코딩·자동화", "요리·카페·베이킹", "판매·유통·상품 소싱", "제조·공예·설계", "교육·강의·코칭", "청소·수납·방문 서비스", "공간 운영·모임 진행", "운전·배송·물류", "사진·영상·글쓰기·디자인", "영업·마케팅·고객 응대", "미용·뷰티·건강·운동"] as const;
/** Business-type nouns that prefill the composer for startup.business (never saved as-is). */
const BUSINESS_PREFILL: SectorTable = {
  b2b_service: ["컨설팅", "문서·보고서 작성 대행", "마케팅 실행 대행", "홈페이지·시스템 구축 대행", "기업 교육·워크숍", "정기 자문·운영 대행"],
  software: ["웹 서비스(구독)", "모바일 앱", "업무 자동화 도구", "예약·주문 관리 시스템", "데이터 대시보드", "맞춤 개발"],
  food_beverage: ["카페", "식당", "반찬·도시락", "베이커리·디저트", "배달 전문 음식점", "주점·펍", "밀키트"],
  retail_commerce: ["스마트스토어", "자사몰", "편집숍·오프라인 매장", "해외 직구·구매대행", "굿즈·문구 판매", "식품·건강식품 판매"],
  manufacturing: ["부품·소재 제조", "생활 소품·굿즈 제작", "식품·화장품 제조", "가구·인테리어 제작", "OEM·ODM 생산", "시제품·소량 제작"],
  education: ["1:1 과외", "학원·교습소", "온라인 라이브 강의", "녹화 강의", "워크숍·특강", "기업 출강"],
  local_service: ["네일·미용", "청소·정리", "이사", "수리·설치", "세탁", "반려동물 돌봄·미용", "꽃집", "운동·건강 코칭"],
  space_hospitality: ["공유오피스", "스터디룸", "촬영 스튜디오", "파티룸", "숙박(펜션·게스트하우스)", "회의실 대관"],
  logistics: ["퀵 서비스", "용달·이사", "정기 납품 배송", "출고·풀필먼트 대행", "화물 운송", "보관·창고"],
  content_media: ["사진 촬영", "영상 제작", "디자인·썸네일", "글·블로그", "SNS 운영 대행", "유튜브·채널 운영"],
  general: ["1회 서비스", "상품 판매", "구독·회원 서비스", "공간·장비 대여", "디지털 콘텐츠", "제작·대행 서비스"],
};
/** Sentence starters for operating.business; the client blocks sending while "○○" remains. */
export const BUSINESS_SENTENCE_CHIPS = ["○○ 카페를 운영합니다", "○○ 지역에서 ○○ 방문 서비스를 합니다", "○○를 온라인 판매(스마트스토어)합니다", "기업 서비스로 ○○ 대행을 합니다", "○○ 교육·수업을 합니다", "○○ 부품·제품을 제조해 납품합니다", "○○ 공간 대여·숙박을 운영합니다", "○○ 앱·소프트웨어를 운영합니다"] as const;
export const PRICE_BASIS_CHIPS = ["시간당", "1박", "월 멤버십"] as const;

const sectorOf = (sector: ProposalSector | null | undefined): ProposalSector => sector && PROPOSAL_SECTORS.includes(sector) ? sector : "general";

/** Sector-aware chips for hybrid_text_chips / prefill_chips questions (customer, problem, offer, channel, capacity, goal, experience, business…). Empty when no catalogue applies. */
export function sectorChipOptions(sector: ProposalSector | null | undefined, questionId: string, mode?: IntakeMode): ChipOption[] {
  const key = sectorOf(sector);
  switch (questionId) {
    case "customer": return chips(CUSTOMER[key]);
    case "problem": return mode === "operating"
      ? [...chips(OPERATING_PROBLEM_COMMON, CHIP_GROUPS.problemCommon), ...chips(OPERATING_PROBLEM_SECTOR[key], CHIP_GROUPS.problemSector)]
      : chips(PROBLEM[key]);
    case "offer": return chips(OFFER[key]);
    case "channel": return [...chips(CHANNEL_COMMON, CHIP_GROUPS.channelCommon), ...chips(CHANNEL_SECTOR[key], CHIP_GROUPS.channelSector)];
    case "capacity": return [...chips(CAPACITY_PEOPLE, CHIP_GROUPS.people), ...chips(CAPACITY_PERIODS, CHIP_GROUPS.period), ...chips(CAPACITY_UNITS[key], CHIP_GROUPS.unit)];
    case "goal": {
      const periods = mode === "operating" ? GOAL_PERIODS.slice(0, 3) : GOAL_PERIODS;
      const amounts = HIGH_VOLUME_SECTORS.has(key) ? GOAL_AMOUNTS_HIGH : GOAL_AMOUNTS_DEFAULT;
      return [...chips(periods, CHIP_GROUPS.period), ...chips(GOAL_METRICS[mode ?? "startup"], CHIP_GROUPS.metric), ...chips(amounts, CHIP_GROUPS.amount)];
    }
    case "experience": return chips(EXPERIENCE_CHIPS);
    case "business": return chips(mode === "operating" ? BUSINESS_SENTENCE_CHIPS : BUSINESS_PREFILL[key], CHIP_GROUPS.prefill);
    case "price": return key === "space_hospitality" ? chips(PRICE_BASIS_CHIPS, CHIP_GROUPS.priceBasis) : [];
    default: return [];
  }
}

// ---- Appendix B: amount ladders -----------------------------------------------------------------
const MAN = 10_000, EOK = 100_000_000;
const digits = (value: number) => new Intl.NumberFormat("ko-KR").format(value);
/** "1억 5,000만원" · "1,000만원" · "1만 5,000원" · "5,000원" — Korean unit label for range chips. */
export function wonLabel(value: number, style: "korean" | "digits" = "korean"): string {
  const rounded = Math.round(value);
  if (style === "digits" || rounded < MAN || rounded % MAN !== 0 && rounded < 100 * MAN) return `${digits(rounded)}원`;
  const parts: string[] = [];
  const eok = Math.floor(rounded / EOK), man = Math.floor((rounded % EOK) / MAN), rest = rounded % MAN;
  if (eok) parts.push(`${digits(eok)}억`);
  if (man) parts.push(`${digits(man)}만`);
  if (rest) parts.push(digits(rest));
  return `${parts.join(" ")}원`;
}
function ladder(bounds: Array<number | null>, style: "korean" | "digits", openLow = true): AmountRange[] {
  const ranges: AmountRange[] = [];
  for (let index = 0; index < bounds.length - 1; index++) {
    const min = bounds[index], max = bounds[index + 1];
    if (min === null && max !== null) ranges.push({ label: `${wonLabel(max, style)} 미만`, min: openLow ? null : 0, max });
    else if (min !== null && max === null) ranges.push({ label: `${wonLabel(min, style)} 이상`, min, max: null });
    else if (min !== null && max !== null) ranges.push({ label: `${wonLabel(min, style)}~${wonLabel(max, style)}`, min, max });
  }
  return ranges;
}
const ZERO_RANGE: AmountRange = { label: "0원", min: 0, max: 0 };
/** Sector price ladders; `period` is the pricing basis label injected into price.period by the server (spec §4-1). */
export const PRICE_BASIS: Record<ProposalSector, string> = {
  b2b_service: "프로젝트 1건", software: "월 구독 1건", food_beverage: "대표 메뉴 1개", retail_commerce: "대표 상품 1개", manufacturing: "개당", education: "1인 수업 1회",
  local_service: "예약 1건", space_hospitality: "이용 1건", logistics: "배송 1건", content_media: "납품물 1개", general: "판매 1건",
};
const PRICE_LADDERS: Record<ProposalSector, AmountRange[]> = {
  b2b_service: ladder([null, 30 * MAN, 100 * MAN, 300 * MAN, 1000 * MAN, null], "korean"),
  software: ladder([null, 5_000, 20_000, 50_000, 200_000, null], "digits"),
  food_beverage: ladder([null, 5_000, 10_000, 20_000, 40_000, null], "digits"),
  retail_commerce: ladder([1_000, 5_000, 10_000, 30_000, 100_000, 300_000, null], "digits"),
  manufacturing: ladder([null, 1_000, 10_000, 50_000, 200_000, 1_000_000, null], "digits"),
  education: ladder([null, 20_000, 50_000, 100_000, 300_000, null], "digits"),
  local_service: ladder([null, 30_000, 50_000, 100_000, 300_000, null], "digits"),
  space_hospitality: ladder([null, 10_000, 20_000, 50_000, null], "digits"),
  logistics: ladder([null, 5_000, 10_000, 30_000, 100_000, 300_000, null], "digits"),
  content_media: ladder([null, 50_000, 200_000, 500_000, 1_500_000, null], "digits"),
  general: ladder([null, 10_000, 50_000, 200_000, null], "digits"),
};
const SPACE_PRICE_LADDERS: Record<string, AmountRange[]> = {
  "시간당": ladder([null, 10_000, 20_000, 50_000, null], "digits"),
  "1박": ladder([null, 50_000, 100_000, 200_000, null], "digits"),
  "월 멤버십": ladder([null, 100_000, 200_000, 500_000, null], "digits"),
};
const BUDGET_COMMON = [ZERO_RANGE, ...ladder([null, 100 * MAN, 300 * MAN, 1000 * MAN, 3000 * MAN, EOK, null], "korean")];
const BUDGET_HIGH = [ZERO_RANGE, ...ladder([100 * MAN, 300 * MAN, 1000 * MAN, 3000 * MAN, EOK, null], "korean")];
const BUDGET_HIGH_SECTORS: ReadonlySet<ProposalSector> = new Set(["food_beverage", "space_hospitality", "manufacturing", "logistics", "local_service"]);
/** Monthly sales ladder; multiply by the reporting period's months with scaledAmountRanges(). */
const SALES_MONTHLY = ladder([null, 100 * MAN, 300 * MAN, 1000 * MAN, 3000 * MAN, EOK, null], "korean");
const COST_MONTHLY = ladder([null, 50 * MAN, 150 * MAN, 400 * MAN, 1000 * MAN, 3000 * MAN, null], "korean");
const AVERAGE_TICKET = ladder([null, 5_000, 10_000, 15_000, 25_000, 35_000, 60_000, null], "digits");
/** 건당 변동비: 디지털 상품처럼 거의 없으면 0원, 그 외 천~수십만 원. */
const UNIT_COST = [ZERO_RANGE, ...ladder([null, 1_000, 3_000, 10_000, 30_000, 100_000, 300_000, null], "digits")];

/**
 * Ascending won ranges for price / budget / sales / cost (spec appendix B). Empty when the question has no range ladder.
 * `basis` applies to space_hospitality price only (one of PRICE_BASIS_CHIPS; defaults to the first).
 * Range semantics: min null = "미만" (offer 상한·정확 only), max null = open top (keypad from min or openEndPresets), min===max===0 = "0원" sent immediately.
 */
export function amountRanges(sector: ProposalSector | null | undefined, questionId: string, mode?: IntakeMode, basis?: string): AmountRange[] {
  const key = sectorOf(sector);
  const copy = (ranges: AmountRange[]) => ranges.map(range => ({ ...range }));
  switch (questionId) {
    case "price": return copy(key === "space_hospitality" ? SPACE_PRICE_LADDERS[basis ?? PRICE_BASIS_CHIPS[0]] ?? SPACE_PRICE_LADDERS[PRICE_BASIS_CHIPS[0]] : PRICE_LADDERS[key]);
    case "budget": return copy(BUDGET_HIGH_SECTORS.has(key) ? BUDGET_HIGH : BUDGET_COMMON);
    case "sales": return copy(SALES_MONTHLY);
    case "cost": return copy(COST_MONTHLY);
    case "structure.cost": return copy(COST_MONTHLY);
    case "structure.unitCost": return copy(UNIT_COST);
    case "food_beverage.averageTicket": return copy(AVERAGE_TICKET);
    default: void mode; return [];
  }
}

/** Months covered by a normalized "YYYY-MM-DD / YYYY-MM-DD" period (≥ 1), or null when unparsable. */
export function periodMonths(period: string | null | undefined): number | null {
  const dates = period?.match(/\d{4}-\d{2}-\d{2}/g) ?? [];
  if (dates.length !== 2) return null;
  const start = new Date(`${dates[0]}T00:00:00Z`), end = new Date(`${dates[1]}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  const days = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return Math.max(1, Math.round(days / 30.4375));
}

/** Multiply a monthly ladder by `months` and relabel ("최근 12개월: 1,200만원~3,600만원" is the client's prefix). */
export function scaledAmountRanges(ranges: AmountRange[], months: number): AmountRange[] {
  const factor = Math.max(1, Math.round(months));
  return ranges.map(range => {
    const min = range.min === null ? null : range.min * factor, max = range.max === null ? null : range.max * factor;
    if (min === 0 && max === 0) return { ...range };
    const label = min === null && max !== null ? `${wonLabel(max)} 미만` : max === null && min !== null ? `${wonLabel(min)} 이상` : `${wonLabel(min ?? 0)}~${wonLabel(max ?? 0)}`;
    return { label, min, max };
  });
}

/** Log-scale chips for an open-top range (1억 → 1억 / 1.5억 / 2억 / 3억 / 5억 / 10억). */
export function openEndPresets(range: AmountRange): number[] {
  if (range.min === null || range.max !== null) return [];
  return [1, 1.5, 2, 3, 5, 10].map(factor => Math.round(range.min! * factor));
}

// ---- Number presets (spec §3) ------------------------------------------------------------------
const NUMBER_PRESETS: Record<string, number[]> = {
  hoursPerWeek: [5, 10, 20, 30, 40, 60],
  capacity: [1, 3, 5, 10, 20, 50, 100, 300, 1000],
  goal: [10, 30, 50, 100, 300],
  "b2b_service.deliveryDays": [3, 7, 14, 30, 60, 90],
  "software.supportMinutes": [0, 15, 30, 60, 120],
  "food_beverage.peakOrders": [5, 10, 20, 30, 50, 80],
  "retail_commerce.minimumOrder": [1, 10, 30, 50, 100, 300],
  "manufacturing.minimumBatch": [1, 50, 100, 500, 1000, 3000, 10000],
  "manufacturing.leadDays": [3, 7, 14, 30, 60, 90, 180],
  "education.sessionMinutes": [25, 40, 50, 60, 90, 120, 180],
  "local_service.travelMinutes": [0, 15, 30, 45, 60, 120],
  "space_hospitality.guestLimit": [1, 2, 4, 10, 20, 50],
  "space_hospitality.turnoverMinutes": [0, 10, 20, 30, 60, 90, 120],
  "logistics.dailyShipments": [2, 5, 10, 20, 50, 100],
  "content_media.productionDays": [1, 3, 7, 14, 30],
  "general.trialDays": [1, 3, 7, 14, 30, 60],
  // 구조(수익 방식) 질문: 모두 선택형 프리셋
  "structure.retentionMonths": [1, 3, 6, 12, 24, 36],
  "structure.occupancy": [30, 50, 70, 90],
  "structure.takeRate": [3, 5, 10, 15, 20, 30],
  "structure.salesCycleDays": [7, 14, 30, 60, 90],
  "structure.billableHours": [10, 20, 30, 40],
};
/** Preset values for number_quick questions (hours, counts, minutes…). Empty when the question uses a range ladder or free number. */
export function numberPresets(question: Pick<IntakeQuestion, "id" | "unit" | "period">): number[] {
  return [...(NUMBER_PRESETS[question.id] ?? [])];
}

/** Chip text for a preset ("약 20건" for approximate shipment counts, "이동 없음(0분)" for meaningful zeros); the sent value is always numberAnswer(). */
export function numberPresetLabel(question: Pick<IntakeQuestion, "id" | "unit" | "period">, value: number): string {
  const unit = question.unit ?? "";
  if (question.id === "logistics.dailyShipments") return value <= 2 ? "약 1~3건" : `약 ${value}${unit}`;
  if (value === 0) {
    if (question.id === "local_service.travelMinutes") return "이동 없음(0분)";
    if (question.id === "space_hospitality.turnoverMinutes") return "정비 없음(0분)";
    if (question.id === "software.supportMinutes") return "셀프 설정(0분)";
  }
  if (question.id === "hoursPerWeek" && value === 60) return "60시간 이상";
  return `${value}${unit}`;
}

/** Storage string for a number_quick pick: always "${n}${unit}" without thousands separators ("10시간", "1000개"). */
export function numberAnswer(value: number, unit?: string): string {
  return `${Math.round(value)}${unit ?? ""}`;
}

/** Variable stepper increment (spec §2 number_quick): <10 ±1, <100 ±10, <1,000 ±100, otherwise ±500; time-like units ±5. */
export function stepFor(value: number, unit?: string): number {
  if (unit && /시간|분/.test(unit)) return 5;
  if (value < 10) return 1;
  if (value < 100) return 10;
  if (value < 1000) return 100;
  return 500;
}

export function assembleAnswer(steps: string[][]): string {
  return steps.map(step => step.filter(Boolean).join(LIST_SEPARATOR)).filter(Boolean).join(STEP_SEPARATOR);
}

export function splitAssembledAnswer(text: string): string[][] {
  return text.split(STEP_SEPARATOR).map(step => step.split(LIST_SEPARATOR).map(part => part.trim()).filter(Boolean)).filter(step => step.length > 0);
}

/** "1,200,000원" for display; storage keeps coachAmount-parsable strings such as "1200000원" or "120만원". */
export function formatWon(value: number): string {
  return `${new Intl.NumberFormat("ko-KR").format(Math.round(value))}원`;
}

/** Storage string for an exact won amount chosen in the UI: "120만원" when it is a whole 만원, otherwise "1234567원". */
export function wonAnswer(value: number): string {
  const rounded = Math.round(value);
  return rounded > 0 && rounded % 10000 === 0 ? `${new Intl.NumberFormat("ko-KR").format(rounded / 10000)}만원` : `${rounded}원`;
}

/** Label-rule check used by tests and the catalogue: a chip label never contains the step separator "/" or the list separator ", " (thousands separators such as "1,000만원" are fine). */
export function validChipLabel(label: string, maxLength = 40): boolean {
  return label.trim().length > 0 && label.length <= maxLength && !label.includes("/") && !label.includes(LIST_SEPARATOR) && !/,\s*$/.test(label);
}
