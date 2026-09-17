import type { CoachField } from "./coach";
import { COACH_FIELD_LABELS } from "./coach-presentation";
import { PROPOSAL_SECTORS, SECTOR_PROFILES, type ProposalSector } from "./proposal-blueprint";
import { structureFieldLabels, type BusinessStructure } from "./business-structure";

export type IntakeMode = "exploring" | "startup" | "operating";
export type IntakeQuestion = {
  id: string;
  label: string;
  prompt: string;
  kind: "text" | "number" | "single" | "multi";
  /** Catalogue only (never persisted): `group` names the step a chip belongs to in multi-step chip controls; `hint` is a short helper shown under the chip. */
  options?: Array<{ value: string; label: string; group?: string; hint?: string }>;
  fieldKey?: CoachField["key"];
  unit?: string;
  period?: string;
  optional?: boolean;
  /** Catalogue only: caveat text shown as a helper line instead of inside the prompt. */
  hint?: string;
};
type ChipOption = NonNullable<IntakeQuestion["options"]>[number];

export const intakeSectorOptions: Array<{ value: ProposalSector; label: string }> = PROPOSAL_SECTORS.map(value => ({
  value, label: SECTOR_PROFILES[value].label,
}));

/** Chip helpers for hybrid (text + options), single and multi catalogue questions: value === label, optional step group. */
const chip = (label: string, group?: string): ChipOption => ({ value: label, label, ...(group ? { group } : {}) });
const chips = (labels: readonly string[], group?: string): ChipOption[] => labels.map(label => chip(label, group));

function fieldQuestion(key: CoachField["key"], prompt: string, extra: Partial<Pick<IntakeQuestion, "kind" | "unit" | "period" | "hint">> = {}): IntakeQuestion {
  return { id: key, fieldKey: key, label: COACH_FIELD_LABELS[key], prompt, kind: "text", optional: true, ...extra };
}

/** Price wording follows the pricing basis (period) the server injects per sector (spec §4-1). */
export const PRICE_DEFAULT_PERIOD = "판매 1건";
export const pricePrompt = (period: string) => `${period} 가격은 얼마쯤인가요?`;

const business = fieldQuestion("business", "어떤 사업인가요? 한 문장(60자 안)으로 알려 주세요.", { hint: "칩을 누르면 입력창에 채워져요. 그대로 저장하거나 상호·지역을 덧붙여 주세요." });
const customer = fieldQuestion("customer", "주로 누가 이용하나요? (최대 2개)");
const problem = fieldQuestion("problem", "그 고객의 어떤 불편을 해결하나요? (최대 2개)");
const offer = fieldQuestion("offer", "대표 상품이나 서비스는 무엇인가요?", { hint: "유형을 고른 뒤 상품명을 덧붙일 수 있어요." });
const channel = fieldQuestion("channel", "처음 고객을 만날 곳은 어디인가요? (최대 3개)");
const price = fieldQuestion("price", pricePrompt(PRICE_DEFAULT_PERIOD), { kind: "number", unit: "원", period: PRICE_DEFAULT_PERIOD, hint: "범위를 고른 뒤 하한·상한·정확한 금액 중 아는 값만 저장해요." });
const budget = fieldQuestion("budget", "준비에 쓸 수 있는 돈은 얼마인가요?", { kind: "number", unit: "원", hint: "필요한 비용 추정치가 아니라 실제로 쓸 수 있는 금액이에요." });
const hours = fieldQuestion("hoursPerWeek", "일주일에 몇 시간 쓸 수 있나요?", { kind: "number", unit: "시간", period: "주" });
const capacity = fieldQuestion("capacity", "처음에는 누가, 얼마나 감당하나요?", { hint: "인력을 고른 뒤 하루·주·월 처리량을 정해요." });
const goal = fieldQuestion("goal", "언제까지 무엇을 이루고 싶나요?", { hint: "목표는 현재 실적과 따로 기록돼요." });
/** 탐색 모드 시작 조건 칩. 값은 사업 구조 축(자본·소상공인·인허가·전달·고객·수익)에 그대로 대응하고, 서버가 표준산업분류 지도에서 조건에 맞는 후보를 고른다. */
export const START_CONDITIONS = ["무점포로 시작", "혼자 시작할 수 있는 일", "인허가 없이 시작", "온라인으로 제공", "방문·출장으로 제공", "매장·공간에서 제공", "개인 고객", "기업·사업자 고객", "월 구독·정기 수익"] as const;
const conditions: IntakeQuestion = {
  id: "conditions", label: "시작 조건", prompt: "어떤 조건으로 시작하고 싶나요? (최대 4개)", kind: "multi", options: [{ ...chip(START_CONDITIONS[0]), hint: "사무실·매장 없이" }, ...chips(START_CONDITIONS.slice(1))], optional: true,
  hint: "고른 조건에 맞는 업종 후보를 표준산업분류 지도에서 찾아요. 정한 게 없으면 넘어가도 돼요.",
};
const industry: IntakeQuestion = {
  id: "industry", label: "업종", prompt: "어떤 업종에 가까운가요?",
  kind: "single", options: intakeSectorOptions.map(option => ({ ...option })), optional: true,
};

// The parent owns progression, skips, persistence and candidate -> business selection.
const CORE_QUESTIONS: Record<IntakeMode, IntakeQuestion[]> = {
  exploring: [
    { id: "interest", label: "관심 분야", prompt: "어떤 분야의 일을 해보고 싶나요? 관심 있는 분야를 골라 주세요.", kind: "multi", options: intakeSectorOptions.map(option => ({ ...option })), optional: true },
    fieldQuestion("experience", "해본 일이나 익숙한 활동은 무엇인가요?", { hint: "직장 경험뿐 아니라 취미·생활 경험도 좋아요. 여러 개 골라도 돼요." }),
    hours,
    budget,
    conditions,
    { id: "candidate", label: "사업 후보", prompt: "어떤 사업 후보를 더 살펴보고 싶나요? 직접 생각한 아이디어도 이야기할 수 있어요.", kind: "single", options: [], optional: true },
    customer, problem, offer, channel, price, goal,
  ],
  startup: [industry, business, customer, problem, offer, channel, price, budget, hours, capacity, goal],
  operating: [
    industry,
    fieldQuestion("business", "현재 어떤 사업을 운영하나요? 한 문장으로 알려 주세요.", { hint: "문장 칩을 누른 뒤 ○○ 자리만 채워 주세요." }),
    fieldQuestion("customer", "지금 주로 누가 이용하나요? (최대 2개)"),
    fieldQuestion("offer", "지금 판매하거나 제공하는 대표 상품·서비스는 무엇인가요?", { hint: "유형을 고른 뒤 상품명을 덧붙일 수 있어요." }),
    fieldQuestion("problem", "지금 가장 개선하고 싶은 문제는 무엇인가요? (최대 2개)"),
    { id: "period", label: "실적 기간 (시작일 / 종료일)", prompt: "살펴볼 실적 기간은 언제인가요?", kind: "text", optional: true, hint: "기간을 고르거나 날짜를 직접 선택해요." },
    fieldQuestion("sales", "정한 시작일부터 종료일까지의 실제 매출 합계는 얼마였나요?", { kind: "number", unit: "원", period: "입력한 시작일~종료일", hint: "예상 매출·목표·총 거래액과는 구분해요." }),
    { ...fieldQuestion("cost", "한 달 고정비는 대략 얼마인가요? 월 고정비(임차료·고정 인건비 등)만 넣고 건당 변동비나 실적 기간 전체 비용과는 구분해 주세요.", { kind: "number", unit: "원", period: "월" }), label: `${COACH_FIELD_LABELS.cost} (월 고정비)` },
    fieldQuestion("capacity", "지금은 누가, 얼마나 감당하나요?", { hint: "인력을 고른 뒤 하루·주·월 처리량을 정해요." }),
    fieldQuestion("channel", "지금 고객을 만나거나 판매하는 주요 경로는 어디인가요? (최대 3개)"),
    goal,
  ],
};

type DetailSpec = Omit<IntakeQuestion, "id" | "fieldKey" | "optional"> & { id: string };
const DETAIL_QUESTIONS: Record<ProposalSector, DetailSpec[]> = {
  b2b_service: [
    { id: "decisionMaker", label: "구매 결정자", prompt: "도입을 결정하는 사람은 누구인가요?", kind: "text", hint: "결정자를 고른 뒤 실제 사용하는 담당자도 고를 수 있어요.",
      options: [...chips(["대표·오너 직접", "부서장·팀장", "실무 담당자 본인", "구매·총무 담당", "여러 사람 협의", "외부 대행사", "공공기관·기관 담당자"], "decision"),
        ...chips(["담당 실무자 1~2명", "팀 전체", "전 직원", "고객사의 고객", "외부 협력사", "아직 모름·해당 없음"], "user")] },
    { id: "deliverables", label: "납품·검수 범위", prompt: "납품할 결과물은 무엇인가요?", kind: "text", hint: "완료 확인 기준도 함께 고를 수 있어요.",
      options: [...chips(["보고서·분석", "절차서·매뉴얼", "개발·시스템 구축", "시공·설치·현장 작업", "교육·인수인계", "정기 운영·신고 대행", "디자인·제작물"], "deliverable"),
        ...chips(["고객 검수 승인", "합의한 체크리스트 충족", "시연·테스트 통과", "납품 후 일정 기간 이상 없음", "월 정산·리포트로 확인"], "acceptance")] },
    { id: "deliveryDays", label: "프로젝트 소요 기간", prompt: "프로젝트 1건을 끝내는 데 며칠이 필요한가요?", kind: "number", unit: "일", period: "프로젝트 1건", hint: "정기 계약이라 건별 기간이 없으면 미정으로 두세요." },
    { id: "paymentTerms", label: "대금 지급 조건", prompt: "대금은 어떻게 받나요?", kind: "text", hint: "추가 요청의 비용 조건도 고를 수 있어요.",
      options: [...chips(["착수금 50%+잔금 50%", "착수금 30%+잔금 70%", "전액 선결제", "완료·검수 후 일괄", "월 정산", "플랫폼 정산(크몽·숨고)", "세금계산서 발행 후 30일 내", "단계별 분할(3회 이상)"], "payment"),
        ...chips(["추가 요청은 별도 견적", "합의 범위 내 수정 무료", "시간당 추가 요금", "추가 요청 없음(범위 고정)"], "extra")] },
  ],
  software: [
    { id: "workflow", label: "핵심 사용 흐름", prompt: "사용자가 가장 먼저 끝내야 하는 작업은 무엇인가요? (최대 2개)", kind: "text",
      options: chips(["자료 올리기·연동하기", "만들기·작성하기", "자동화 규칙 설정하기", "예약·주문·결제하기", "기록·관리하기", "찾기·비교·매칭하기", "분석·리포트 보기", "알림·메시지 보내기"]) },
    { id: "releaseStatus", label: "현재 제공 단계", prompt: "지금 실제로 제공할 수 있는 제품의 단계는 어디인가요?", kind: "single", options: [{ value: "concept", label: "구상" }, { value: "prototype", label: "시제품·시험 사용" }, { value: "released", label: "출시·제공 중" }] },
    { id: "billingUnit", label: "과금 기준", prompt: "무엇을 기준으로 요금을 받나요?", kind: "text", hint: "과금 주기와 무료 플랜 여부도 고를 수 있어요.",
      options: [...chips(["사용자 1인당", "팀·워크스페이스당", "매장·지점당", "사용량 기준", "거래액 비율(중개)", "광고(사용자 무료)", "1회 구매"], "unit"),
        ...chips(["월마다", "연마다", "건마다", "1회 결제"], "cycle"), chip("무료 플랜 있음", "free")] },
    { id: "supportMinutes", label: "고객 설정 지원 시간", prompt: "고객 1곳의 최초 설정을 돕는 데 몇 분이 필요한가요?", kind: "number", unit: "분", period: "고객 1곳 최초 설정" },
  ],
  food_beverage: [
    { id: "signatureMenu", label: "대표 메뉴", prompt: "먼저 내놓을 대표 메뉴 유형은 무엇인가요?", kind: "text", hint: "주문 방식도 함께 고를 수 있어요.",
      options: [...chips(["커피·음료", "베이커리·디저트", "식사(한식·양식·아시아)", "분식·간편식·도시락", "반찬·밀키트", "주류·안주", "케이터링·단체·출장"], "menu"),
        ...chips(["카운터 주문", "테이블오더·QR·키오스크", "배달앱", "사전 주문·예약", "테이크아웃·픽업", "택배·정기배송", "출장·케이터링"], "order")] },
    { id: "averageTicket", label: "주문당 평균 결제액", prompt: "주문 1건의 평균 결제액은 얼마인가요?", kind: "text", unit: "원", period: "주문 1건", hint: "대표 메뉴 1개 가격과 구분하고 실제 기록인지 예상인지 표시해요.",
      options: chips(["실제 기록", "예상"], "basis") },
    { id: "peakOrders", label: "피크 시간 처리량", prompt: "가장 바쁜 시간에 한 시간당 몇 건을 처리할 수 있나요?", kind: "number", unit: "건", period: "시간" },
    { id: "wasteHandling", label: "식재료·폐기 관리", prompt: "식재료와 남은 재료는 어떻게 관리하나요?", kind: "multi",
      options: chips(["당일 소진", "냉장·냉동 기한 표시", "마감 할인", "선주문 후 준비", "소량 자주 발주", "본사·공급업체 정기 공급", "장기 보존 재료 위주", "폐기량 기록"]) },
  ],
  retail_commerce: [
    { id: "sourcing", label: "상품 조달 방식", prompt: "상품은 어디에서 어떻게 공급받나요?", kind: "multi",
      options: chips(["도매 사입", "위탁판매", "제조사·브랜드 직거래", "해외 직구·구매대행·병행수입", "자체 제작(디지털 포함)", "OEM·ODM", "중고·리셀 매입", "농·수산물 산지 직거래"]) },
    { id: "minimumOrder", label: "최소 발주 수량", prompt: "한 번 발주할 때 최소 몇 개를 주문하나요?", kind: "number", unit: "개", period: "발주 1회" },
    { id: "fulfillment", label: "배송·재고 방식", prompt: "포장·배송은 어떻게 하나요?", kind: "multi",
      options: chips(["직접 포장·일반 택배", "냉장·냉동 택배", "3PL 위탁", "공급사 직배송·배대지", "플랫폼 물류 입고", "화물·설치 배송", "오프라인 판매·픽업", "디지털 상품(배송 없음)"]) },
    { id: "returns", label: "교환·반품 조건", prompt: "교환·반품은 어떻게 정해져 있나요?", kind: "text", hint: "배송비 부담 기준도 고를 수 있어요.",
      options: [...chips(["수령 후 7일 이내", "수령 후 14일 이내", "수령 후 30일 이내", "단순 변심 불가·불량만 교환", "판매 플랫폼 기본 정책 따름"], "window"),
        ...chips(["배송비: 단순 변심은 고객 부담·불량은 판매자 부담", "배송비: 전액 판매자 부담", "배송비: 정액 고객 부담"], "shipping")] },
  ],
  manufacturing: [
    { id: "productStage", label: "제품 준비 상태", prompt: "제품은 지금 어느 단계인가요?", kind: "single",
      options: chips(["아이디어·사양 정리", "설계·도면 완료", "시제품 제작·시험", "소량 시험 생산", "양산 준비(금형·설비 또는 위탁 공장 확정)", "양산·공급 중", "주문 제작·수주 생산", "위탁 제조 진행 중(OEM·ODM)"]) },
    { id: "minimumBatch", label: "최소 생산 수량", prompt: "한 번 생산할 때 최소 몇 개를 만들어야 하나요?", kind: "number", unit: "개", period: "생산 1회" },
    { id: "qualityChecks", label: "품질·시험 확인", prompt: "필요한 시험·인증의 확인 상태는 어떤가요?", kind: "text", hint: "인증 종류도 고를 수 있어요. 예정과 완료는 구분해요.",
      options: [...chips(["필요 없음(확인 완료)", "확인 중", "예정", "진행 중", "일부 완료·일부 예정", "모두 완료"], "status"),
        ...chips(["KC 안전·전자파", "식품·위생(HACCP)", "화장품·건기식", "의료기기", "ISO·고객사 품질 승인", "수출·환경 인증(CE·FCC·RoHS·UL)", "자체 검사 기준", "기타 인증"], "type")] },
    { id: "leadDays", label: "생산·납품 소요 기간", prompt: "발주 후 한 물량을 납품하기까지 며칠이 걸리나요?", kind: "number", unit: "일", period: "발주 1회" },
  ],
  education: [
    { id: "learningOutcome", label: "학습 목표", prompt: "수업을 마친 학습자가 무엇을 할 수 있게 되나요? (최대 2개)", kind: "text",
      options: chips(["시험·자격 대비", "학교 성적·입시 준비", "언어 회화·의사소통", "스스로 할 수 있는 기술 습득", "작품·포트폴리오 완성", "취업·부업 준비", "아이 발달·놀이·정서", "교양·취미·습관"]) },
    { id: "classSize", label: "수업당 정원", prompt: "한 수업 정원은 몇 명인가요?", kind: "text", unit: "명", period: "수업 1회",
      options: chips(["1명(1:1)", "4명", "8명", "12명", "20명", "30명 이상", "정원 제한 없음(녹화·자율 수강)"]) },
    { id: "sessionMinutes", label: "수업 시간", prompt: "수업 1회는 몇 분인가요?", kind: "number", unit: "분", period: "수업 1회" },
    { id: "feedback", label: "평가·피드백 방식", prompt: "학습 결과는 어떻게 확인하고 피드백하나요?", kind: "multi",
      options: chips(["과제 첨삭", "실습 결과물 확인", "테스트·퀴즈", "수업 중 관찰·구두 피드백", "학습자 1:1 상담", "학부모 상담·리포트", "출석·진도 확인", "별도 피드백 없음"]) },
  ],
  local_service: [
    { id: "serviceArea", label: "방문 가능 지역", prompt: "어디까지 서비스할 수 있나요?", kind: "text", hint: "지역명을 덧붙이거나 온라인·비대면 가능을 함께 고를 수 있어요.",
      options: [...chips(["매장·작업장으로 고객이 방문(출장 없음)", "같은 동·도보권", "같은 구·시 안", "인접 시·군까지", "수도권 전체", "전국 출장"], "area"), chip("온라인·비대면도 가능", "remote")] },
    { id: "travelMinutes", label: "왕복 이동 시간", prompt: "예약 1건에 왕복 이동 시간은 몇 분인가요?", kind: "number", unit: "분", period: "예약 1건", hint: "작업 시간과 구분해요. 매장 방문형이면 0분이에요." },
    { id: "responsibility", label: "작업·책임 범위", prompt: "작업에 포함되는 것과 제외되는 것은 무엇인가요?", kind: "multi",
      options: [...chips(["사전 상담·견적", "본 작업", "재료·소모품 포함", "출장·이동 포함", "사후 점검·AS", "잔여물·폐기물 처리"], "included"),
        ...chips(["제외: 재료·부품비 별도", "제외: 고가품·귀중품", "제외: 전기·설비·구조 공사", "제외: 보증·AS 없음", "제외 항목 없음"], "excluded")] },
    { id: "cancellation", label: "예약 취소 조건", prompt: "예약 취소와 노쇼는 어떻게 처리하나요?", kind: "multi",
      options: [...chips(["전날까지 무료 취소", "24시간 전까지 무료 취소", "취소 시 예약금 미환불", "취소 시 50% 청구", "취소 수수료 없음", "예약제 아님(해당 없음)"], "cancel"),
        ...chips(["노쇼: 예약금 미환불", "노쇼: 출장비만 청구", "노쇼: 50% 청구", "노쇼: 전액 청구", "노쇼: 무료 재예약"], "noshow")] },
  ],
  space_hospitality: [
    { id: "useConditions", label: "공간 이용 조건", prompt: "공간 용도와 확보·인허가 상태는 어떤가요?", kind: "multi",
      options: [...chips(["회의·스터디", "모임·파티", "촬영·행사", "숙박", "사무·작업", "수업·워크숍"], "purpose"),
        ...chips(["공간: 내 소유", "공간: 임차(용도 확인 완료)", "공간: 임차(확인 필요)", "공간: 전대·재임대"], "tenure"),
        ...chips(["숙박업 신고 완료", "숙박업 신고 예정", "숙박 아님(신고 불필요)", "인허가 미확인"], "permit")] },
    { id: "guestLimit", label: "예약당 이용 인원", prompt: "예약 1건에 최대 몇 명까지 받을 수 있나요?", kind: "number", unit: "명", period: "예약 1건" },
    { id: "turnoverMinutes", label: "예약 사이 정비 시간", prompt: "다음 예약까지 청소·정비에 몇 분이 필요한가요?", kind: "number", unit: "분", period: "예약 사이 1회" },
    { id: "damagePolicy", label: "취소·파손 대응", prompt: "예약 취소와 시설 파손은 어떻게 처리하나요?", kind: "multi",
      options: [...chips(["7일 전 전액 환불", "3일 전 전액 환불", "전날 전액 환불", "계단식 환불", "당일 환불 없음", "플랫폼 정책 따름"], "cancel"),
        ...chips(["파손: 보증금에서 차감", "파손: 실비 청구", "파손: 시설 보험 처리", "파손: 플랫폼 보상 제도", "파손: 규정 없음"], "damage")] },
  ],
  logistics: [
    { id: "route", label: "배송 지역·구간", prompt: "어떤 지역·구간을 담당하나요?", kind: "text", hint: "정기·비정기와 출발→도착 구간을 덧붙일 수 있어요.",
      options: [...chips(["같은 구·시 안", "수도권 안", "고정 장거리 구간", "전국", "해외 포함", "건별로 달라짐(이사·용달)", "택배망 위탁"], "range"), ...chips(["정기", "비정기", "정기와 비정기 모두"], "schedule")] },
    { id: "dailyShipments", label: "하루 처리 물량", prompt: "지금 차량과 인력으로 하루에 몇 건을 배송할 수 있나요?", kind: "number", unit: "건", period: "일" },
    { id: "cargoConditions", label: "화물 취급 조건", prompt: "운송할 물품의 크기·보관·취급 조건은 무엇인가요?", kind: "multi",
      options: chips(["소형 택배", "가구·가전·이사 화물", "조리 음식·즉시 배달", "냉장·냉동", "파손 주의", "서류·귀중품", "팔레트·대량", "특수 조건 없음"]) },
    { id: "exceptions", label: "배송 예외 대응", prompt: "지연·분실·파손이나 재배송은 어떻게 처리하나요?", kind: "multi",
      options: chips(["지연 사전 안내", "재배송 1회 무료", "재배송 추가 요금", "분실·파손 실비 보상", "화물 보험 처리", "화주와 협의", "규정 없음"]) },
  ],
  content_media: [
    { id: "format", label: "제작·납품 형식", prompt: "어떤 형식의 콘텐츠를 제작하나요?", kind: "text", hint: "사용처도 함께 고를 수 있어요.",
      options: [...chips(["사진", "숏폼", "롱폼·다큐", "일러스트·웹툰·캐릭터", "디자인(썸네일·배너·3D·모션)", "글·카피·블로그", "음성·음악·팟캐스트", "라이브"], "format"),
        ...chips(["사용처: 인스타그램·SNS", "사용처: 유튜브·채널", "사용처: 온라인몰·상세페이지", "사용처: 홈페이지·광고", "사용처: 인쇄·오프라인", "사용처: 내부 자료·교육", "사용처: 내 채널에 직접 게재", "사용처: 해당 없음"], "usage")] },
    { id: "revisionRounds", label: "포함된 수정 횟수", prompt: "납품물 1개 가격에 포함하는 수정은 몇 회인가요?", kind: "text", unit: "회", period: "납품물 1개",
      options: chips(["0회", "1회", "2회", "3회", "5회", "무제한"]) },
    { id: "usageRights", label: "사용 권리·범위", prompt: "콘텐츠와 원본 파일의 사용 권리는 어떻게 정하나요?", kind: "text", hint: "사용 기간을 고른 뒤 권리 조건을 여러 개 고를 수 있어요.",
      options: [...chips(["사용 기간: 6개월", "사용 기간: 1년", "사용 기간: 3년", "사용 기간: 무기한", "사용 기간: 아직 정하지 않음"], "term"),
        ...chips(["이용 허락", "저작권 전부 양도", "원본·소스 인계", "광고 집행 포함", "광고 별도 요금", "재판매 불가", "포트폴리오 공개", "크레딧 표기"], "rights")] },
    { id: "productionDays", label: "제작 소요 기간", prompt: "납품물 1개를 완성하기까지 며칠이 필요한가요?", kind: "number", unit: "일", period: "납품물 1개" },
  ],
  general: [
    { id: "smallestTrial", label: "작은 제공 범위", prompt: "가장 작게 제공해 볼 수 있는 것은 무엇인가요?", kind: "text", hint: "상품명이나 내용을 덧붙일 수 있어요.",
      options: chips(["이미 제공 중(현재 상품 그대로)", "1회 체험", "소량 판매(1~10개)", "무료 시범 후 유료", "사전 예약·선주문", "1:1 맞춤·소규모 모임 1회"]) },
    { id: "resources", label: "필요한 자원", prompt: "그 범위를 제공하려면 무엇이 필요한가요?", kind: "multi",
      options: chips(["나 혼자·노트북", "소프트웨어·온라인 도구", "작업·판매 공간", "장비·재료·재고", "차량", "협업자 1~2명", "외주·전문가", "자격·허가·보험"]) },
    { id: "trialDays", label: "첫 시도 소요 기간", prompt: "작은 제공안을 준비해 한 번 실행하기까지 며칠이 필요한가요?", kind: "number", unit: "일", period: "시도 1회", hint: "이미 제공 중이면 미정으로 두세요." },
    { id: "reviewCriteria", label: "계속·조정 판단 기준", prompt: "어떤 반응을 보고 계속할지 정하나요? (최대 3개)", kind: "text",
      options: chips(["첫 유료 고객 1명", "문의가 꾸준히 들어옴", "유료 고객이 여러 명 생김", "재구매·재이용", "소개·추천", "월 매출 또는 손익 목표 달성"]) },
  ],
};

function copyQuestion(question: IntakeQuestion): IntakeQuestion {
  return { ...question, ...(question.options ? { options: question.options.map(option => ({ ...option })) } : {}) };
}

export function coreQuestions(mode: IntakeMode): IntakeQuestion[] {
  return CORE_QUESTIONS[mode].map(copyQuestion);
}

export function detailQuestions(sector: ProposalSector): IntakeQuestion[] {
  return DETAIL_QUESTIONS[sector].map(question => copyQuestion({ ...question, id: `${sector}.${question.id}`, optional: true }));
}

/**
 * 구조(수익 방식) 기준 상세 질문. 상세 팩을 요청하면 업종 팩 앞에 붙는다.
 * 변동비·고정비는 coach 필드(unitCost·cost)로 저장되어 손익 계산에 바로 쓰이고, 나머지는 intake/details로 문서와 계산(intakeFinancialReference)에 들어간다.
 * 모두 선택형(숫자 프리셋·금액 사다리)이며 선택 사항이다.
 */
type RevenueModel = BusinessStructure["revenue"];
const STRUCTURE_UNIT: Record<RevenueModel, string> = { per_unit: "판매 1건", per_hour: "1시간", subscription: "구독자 1명(월)", rental: "대여·이용 1건", commission: "거래 1건", project: "프로젝트 1건", mixed: "판매 1건" };
const structureUnitCost = (revenue: RevenueModel): IntakeQuestion => ({
  id: "structure.unitCost", fieldKey: "unitCost", label: structureFieldLabels({ revenue } as BusinessStructure).unitCost ?? COACH_FIELD_LABELS.unitCost, prompt: `${STRUCTURE_UNIT[revenue]}에 들어가는 변동비는 얼마쯤인가요?`, kind: "number", unit: "원", period: STRUCTURE_UNIT[revenue], optional: true,
  hint: "재료·수수료·외주비처럼 팔 때마다 드는 비용만이에요. 임차료·고정 인건비는 월 고정비에 넣어요. 거의 없으면 0원을 골라요.",
});
const structureCost: IntakeQuestion = { id: "structure.cost", fieldKey: "cost", label: COACH_FIELD_LABELS.cost, prompt: "한 달 고정비는 대략 얼마인가요?", kind: "number", unit: "원", period: "월", optional: true, hint: "임차료·고정 인건비·구독 도구처럼 매출이 없어도 나가는 돈이에요." };
const STRUCTURE_REVENUE_QUESTIONS: Partial<Record<RevenueModel, IntakeQuestion[]>> = {
  subscription: [{ id: "structure.retentionMonths", label: "평균 구독 유지 기간", prompt: "구독자 한 명이 평균 몇 달 유지하나요?", kind: "number", unit: "개월", period: "구독자 1명", optional: true, hint: "이탈률과 구독자 1명의 생애 매출을 계산해요. 모르면 비슷한 서비스의 감으로 골라도 돼요." }],
  rental: [{ id: "structure.occupancy", label: "예약·이용률", prompt: "감당할 수 있는 예약·이용 중 실제로 채워지는 비율은 얼마쯤일까요?", kind: "number", unit: "%", period: "월", optional: true, hint: "예: 좌석 10개 중 7개가 찬다면 70%. 매출 계산에 곱해요." }],
  commission: [{ id: "structure.takeRate", label: "수수료율", prompt: "거래액의 몇 %를 수수료로 받나요?", kind: "number", unit: "%", period: "거래 1건", optional: true, hint: "거래 1건 평균 거래액을 거꾸로 계산하는 데 써요." }],
  project: [{ id: "structure.salesCycleDays", label: "문의→계약 기간", prompt: "문의에서 계약까지 보통 며칠 걸리나요?", kind: "number", unit: "일", period: "계약 1건", optional: true, hint: "첫 입금 시점을 잡는 데 써요." }],
  per_hour: [{ id: "structure.billableHours", label: "주당 청구 가능 시간", prompt: "한 주에 실제로 고객에게 청구할 수 있는 시간은 몇 시간인가요?", kind: "number", unit: "시간", period: "주", optional: true, hint: "이동·준비·영업 시간은 빼요. 월 판매 시간 계산에 써요." }],
};

export function structureQuestions(mode: IntakeMode, structure: Pick<BusinessStructure, "revenue"> | null | undefined): IntakeQuestion[] {
  const revenue: RevenueModel = structure?.revenue ?? "per_unit";
  // 운영 중 사업은 기본 질문에 월 고정비가 이미 있다.
  return [...(STRUCTURE_REVENUE_QUESTIONS[revenue] ?? []), structureUnitCost(revenue), ...(mode === "operating" ? [] : [structureCost])].map(copyQuestion);
}

/** 라벨·옵션 조회용: 수익 방식과 무관한 구조 질문 전부(id 중복 없음). 문맥·문서 원천에서 저장된 답을 이름 붙일 때 쓴다. */
export function allStructureQuestions(): IntakeQuestion[] {
  const seen = new Set<string>();
  return (Object.keys(STRUCTURE_UNIT) as RevenueModel[]).flatMap(revenue => structureQuestions("startup", { revenue })).filter(question => !seen.has(question.id) && !!seen.add(question.id));
}

export function getIntakeQuestion(mode: IntakeMode, sector: ProposalSector | null | undefined, id: string, structure?: Pick<BusinessStructure, "revenue"> | null): IntakeQuestion | undefined {
  // Free-form ideas are an alternative to candidate selection, not another required step.
  if (mode === "exploring" && id === "business") return copyQuestion(business);
  return coreQuestions(mode).find(question => question.id === id)
    ?? (id.startsWith("structure.") ? (structure ? structureQuestions(mode, structure) : allStructureQuestions()).find(question => question.id === id) : undefined)
    ?? (sector == null ? undefined : detailQuestions(sector).find(question => question.id === id));
}

type Candidate = { id: string; title: string; description: string; sector: ProposalSector; reasons: string[]; cautions: string[] };
type CandidateIdea = Pick<Candidate, "id" | "title" | "description" | "sector"> & { tags: string[]; caution: string };
// Two to three ideas per sector. Tags are matched as substrings of the interest/experience text, so a tag must belong to one sector only
// (the experience chips in intake-options.ts rely on this: 청소·수납 → local_service, 영업·마케팅 → b2b_service, 미용·뷰티·운동 → local_service).
const CANDIDATE_IDEAS: CandidateIdea[] = [
  { id: "workflow-support", sector: "b2b_service", title: "소규모 팀 업무 정리 서비스", description: "반복 업무를 정리하고 바로 사용할 문서·작업 절차를 제공하는 사업 후보입니다.", tags: ["문서", "사무", "업무", "정리", "기획"], caution: "고객의 자료 접근 권한과 납품·추가 요청 범위를 먼저 확인해야 합니다." },
  { id: "marketing-support", sector: "b2b_service", title: "소상공인 마케팅·홍보 실행 대행", description: "매장이나 작은 회사의 홍보 글·광고·고객 응대를 대신 실행하는 사업 후보입니다.", tags: ["영업", "마케팅", "홍보", "고객 응대", "제안서"], caution: "성과 보장 표현을 피하고 수행 범위·보고 주기·광고비 부담 주체를 먼저 정해야 합니다." },
  { id: "focused-software", sector: "software", title: "한 가지 작업을 돕는 소프트웨어", description: "고객의 반복 작업 하나를 끝낼 수 있는 작은 도구를 만드는 사업 후보입니다.", tags: ["개발", "코딩", "자동화", "소프트웨어", "앱", "코드", "coding", "software"], caution: "실제 구현 범위와 데이터 처리·유지보수 비용을 확인해야 합니다." },
  { id: "booking-management", sector: "software", title: "소규모 매장 예약·주문 관리 앱", description: "예약·주문·고객 기록을 한곳에서 관리하는 작은 매장용 앱을 만드는 사업 후보입니다.", tags: ["예약 관리", "주문 관리", "관리 앱", "웹 서비스", "saas"], caution: "결제·개인정보 처리 방식과 기존 도구 대비 차이를 확인해야 합니다." },
  { id: "preorder-menu", sector: "food_beverage", title: "사전 주문형 소량 메뉴 판매", description: "정해진 메뉴를 예약 주문받아 준비하는 음식 판매 사업 후보입니다.", tags: ["요리", "음식", "카페", "커피", "베이킹", "식음료"], caution: "판매 전 조리 공간·식품 취급·관련 요건과 재료 폐기 비용을 확인해야 합니다." },
  { id: "side-dish-mealkit", sector: "food_beverage", title: "반찬·도시락 소량 정기 판매", description: "가정이나 직장인에게 반찬·도시락·밀키트를 정기적으로 만들어 판매하는 사업 후보입니다.", tags: ["반찬", "도시락", "밀키트", "정기 배송 음식"], caution: "식품 제조·판매 요건과 보관 기한·배송 중 온도 관리를 확인해야 합니다." },
  { id: "small-cafe-dessert", sector: "food_beverage", title: "소규모 카페·디저트 매장", description: "대표 음료와 디저트 몇 가지로 시작하는 작은 매장 사업 후보입니다.", tags: ["디저트", "베이커리", "매장 운영", "바리스타"], caution: "임차료·피크 시간 처리량·재료 폐기를 계산해야 하며 상권 수요를 임의로 가정하지 않습니다." },
  { id: "curated-commerce", sector: "retail_commerce", title: "주제별 소량 상품 판매", description: "한 고객군의 사용 목적에 맞춘 상품을 골라 판매하는 사업 후보입니다.", tags: ["판매", "유통", "쇼핑", "상품", "온라인몰", "커머스"], caution: "공급 조건과 최소 발주량·재고·배송·반품 부담을 확인해야 합니다." },
  { id: "goods-smartstore", sector: "retail_commerce", title: "굿즈·문구 스마트스토어 판매", description: "직접 기획하거나 사입한 굿즈·문구를 스마트스토어와 오픈마켓에서 판매하는 사업 후보입니다.", tags: ["굿즈", "문구", "스마트스토어", "소싱", "오픈마켓"], caution: "플랫폼 수수료·배송비·반품 규정과 저작권 문제가 없는 디자인인지 확인해야 합니다." },
  { id: "resale-collectibles", sector: "retail_commerce", title: "수집품·리셀 상품 판매", description: "중고·수집품이나 한정 상품을 매입해 되파는 사업 후보입니다.", tags: ["리셀", "중고", "수집품", "빈티지"], caution: "정품 확인·매입가 변동·재고 회전 기간을 확인해야 하며 시세 상승을 전제로 계산하지 않습니다." },
  { id: "small-batch-product", sector: "manufacturing", title: "맞춤 소량 제품 제작", description: "구체적인 사용 불편을 해결할 제품을 소량 제작하는 사업 후보입니다.", tags: ["제조", "공예", "설계", "가공", "제품", "3d"], caution: "시제품과 양산을 구분하고 설비·품질·시험·최소 생산량을 확인해야 합니다." },
  { id: "parts-supply", sector: "manufacturing", title: "산업용 부품·소재 소량 납품", description: "다른 제조사나 기업에 부품·소재를 소량 가공해 납품하는 사업 후보입니다.", tags: ["부품", "소재", "납품", "반도체", "금형"], caution: "고객사 품질 승인·납기·단가 협상 조건과 설비 투자 범위를 확인해야 합니다." },
  { id: "lifestyle-goods-maker", sector: "manufacturing", title: "생활 소품 자체 제작·판매", description: "직접 만든 생활 소품이나 인테리어 소품을 소량 생산해 판매하는 사업 후보입니다.", tags: ["소품", "핸드메이드", "인테리어 소품", "목공"], caution: "재료비·제작 시간 대비 가격과 안전 인증 필요 여부를 확인해야 합니다." },
  { id: "practical-class", sector: "education", title: "경험 기반 소규모 실습 수업", description: "직접 해본 활동을 작은 실습 수업으로 제공하는 사업 후보입니다.", tags: ["교육", "수업", "강의", "가르", "코칭", "학습"], caution: "가르칠 수 있는 범위와 준비 시간을 확인해야 하며 학습 결과를 보장하지 않습니다." },
  { id: "online-tutoring", sector: "education", title: "온라인 1:1 과외·회화 수업", description: "화상으로 학습자와 1:1로 진행하는 과외나 언어 회화 수업 사업 후보입니다.", tags: ["과외", "회화", "영어", "튜터", "온라인 수업"], caution: "학습자 수준 확인 방식과 취소·환불 조건을 정해야 하며 성적·합격을 보장하지 않습니다." },
  { id: "recorded-course", sector: "education", title: "녹화 강의·워크숍 특강", description: "한 주제를 녹화 강의나 단기 워크숍으로 제공하는 사업 후보입니다.", tags: ["워크숍", "특강", "녹화", "강좌"], caution: "제작 시간·플랫폼 수수료와 수강생 질문 대응 범위를 확인해야 합니다." },
  { id: "local-organization", sector: "local_service", title: "예약형 생활 정리 서비스", description: "방문 가능한 지역에서 생활 공간 정리를 돕는 사업 후보입니다.", tags: ["청소", "정리", "방문", "생활", "지역", "수납"], caution: "이동 시간과 작업 범위·현장 안전·물품 취급 책임을 확인해야 합니다." },
  { id: "beauty-wellness", sector: "local_service", title: "예약제 뷰티·건강 관리 서비스", description: "네일·피부·헤어 관리나 운동 코칭처럼 예약을 받아 제공하는 관리 서비스 후보입니다.", tags: ["네일", "미용", "뷰티", "헤어", "피부", "마사지", "운동", "건강"], caution: "필요한 자격·위생 요건과 노쇼·취소 조건을 확인해야 하며 효과를 확정적으로 표현하지 않습니다." },
  { id: "moving-transport", sector: "local_service", title: "소형 이사·짐 운반 서비스", description: "1인 가구나 소규모 사무실의 이사와 짐 운반을 맡는 사업 후보입니다.", tags: ["이사", "포장 이사", "입주 청소", "짐 정리"], caution: "차량·인력 확보와 파손 책임·보험, 관련 운송 요건을 확인해야 합니다." },
  { id: "reserved-space", sector: "space_hospitality", title: "목적별 예약 공간 운영", description: "특정 모임이나 작업 목적에 맞는 공간을 예약제로 제공하는 사업 후보입니다.", tags: ["공간", "숙박", "대관", "공유", "모임"], caution: "공간 확보·이용 용도·시설 관리·임차 비용을 확인해야 합니다." },
  { id: "shared-office", sector: "space_hospitality", title: "소규모 공유오피스·스터디룸 운영", description: "1인 창업자나 학습자에게 좌석·룸을 시간 또는 월 단위로 제공하는 사업 후보입니다.", tags: ["공유오피스", "스터디룸", "사무 공간", "좌석"], caution: "임차 계약의 재임대 허용 여부와 공실 시 고정비를 확인해야 합니다." },
  { id: "studio-partyroom", sector: "space_hospitality", title: "촬영 스튜디오·파티룸 대관", description: "촬영·모임 목적의 공간을 시간 단위로 대관하는 사업 후보입니다.", tags: ["스튜디오", "파티룸", "촬영 공간", "행사 공간"], caution: "소음·안전·파손 규정과 비수기 가동률을 확인해야 합니다." },
  { id: "local-delivery", sector: "logistics", title: "지역 정기 배송 서비스", description: "정해진 지역과 구간의 반복 배송을 맡는 사업 후보입니다.", tags: ["물류", "배송", "운송", "운전", "배달"], caution: "운송 자원·관련 요건·회송 비용·분실 및 파손 책임을 확인해야 합니다." },
  { id: "quick-courier", sector: "logistics", title: "당일 퀵·소상공인 배달 대행", description: "지역 매장의 당일 배송과 서류·샘플 퀵을 맡는 사업 후보입니다.", tags: ["퀵", "배달 대행", "당일 배송", "오토바이"], caution: "운송 관련 요건과 사고·보험, 건당 요금 대비 이동 시간을 확인해야 합니다." },
  { id: "freight-moving", sector: "logistics", title: "용달·화물 운송", description: "용달 차량으로 소형 화물과 이사 짐을 운송하는 사업 후보입니다.", tags: ["용달", "화물", "트럭", "운반"], caution: "화물 운송 허가·차량 비용·비수기 물량과 파손 책임을 확인해야 합니다." },
  { id: "small-content", sector: "content_media", title: "소규모 브랜드 콘텐츠 제작", description: "한 가지 형식의 사진·영상·글을 제작해 납품하는 사업 후보입니다.", tags: ["콘텐츠", "사진", "영상", "글쓰기", "디자인", "편집", "미디어"], caution: "자료의 사용 권리와 촬영·제작 범위·수정 횟수를 확인해야 합니다." },
  { id: "photo-studio", sector: "content_media", title: "제품·프로필 사진 촬영 서비스", description: "온라인 셀러의 제품 사진이나 개인 프로필 사진을 촬영해 납품하는 사업 후보입니다.", tags: ["촬영", "프로필", "제품 사진", "카메라"], caution: "촬영 장소·장비 비용과 원본 인계·초상권 조건을 확인해야 합니다." },
  { id: "sns-management", sector: "content_media", title: "소상공인 SNS 콘텐츠 운영 대행", description: "매장의 인스타그램·블로그·숏폼 콘텐츠를 대신 기획하고 올리는 사업 후보입니다.", tags: ["sns", "숏폼", "인스타그램", "블로그", "유튜브"], caution: "게시 주기·수정 범위·계정 접근 권한을 먼저 정하고 조회수를 매출로 바꿔 말하지 않습니다." },
  { id: "personal-archive", sector: "general", title: "개인 기록 정리 서비스", description: "고객의 기록을 원하는 방식으로 정리해 전달하는 새로운 서비스 후보입니다.", tags: ["기록", "아카이브", "취미", "새로운", "미분류"], caution: "기존 업종에 맞추기보다 원하는 결과와 개인정보·기록 사용 권한부터 확인해야 합니다." },
  { id: "subscription-experiment", sector: "general", title: "새로운 구독형 서비스 실험", description: "아직 업종이 정해지지 않은 구상을 소수 고객에게 구독형으로 작게 실험하는 사업 후보입니다.", tags: ["구독", "실험", "아이디어", "새로운 방식"], caution: "무엇을 제공하고 무엇은 제공하지 않는지 먼저 정하고, 반응을 확인할 기준을 정해야 합니다." },
];

function answerText(value: string | string[] | number | null | undefined): string[] {
  return (Array.isArray(value) ? value : typeof value === "string" ? [value] : [])
    .map(text => text.normalize("NFKC").trim().toLowerCase()).filter(Boolean);
}

function matchesTag(values: string[], tag: string): boolean {
  const normalized = tag.normalize("NFKC").toLowerCase();
  return values.some(value => /^[a-z0-9_]+$/.test(normalized)
    ? value.split(/[^a-z0-9_]+/).includes(normalized)
    : value.includes(normalized));
}

function hasAnswer(value: string | string[] | number | null | undefined): boolean {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0;
  return answerText(value).length > 0;
}

export function intakeCandidates(answers: Record<string, string | string[] | number | null>): Array<{ id: string; title: string; description: string; sector: ProposalSector; reasons: string[]; cautions: string[] }> {
  const constraints = [
    hasAnswer(answers.hoursPerWeek) ? "입력한 주당 시간과 실제 준비·영업·운영 시간을 따로 비교해야 합니다." : "주당 가능한 시간은 미입력 상태이며 0시간으로 보지 않습니다.",
    hasAnswer(answers.budget) ? "입력한 예산과 실제 초기 비용·운영비를 따로 비교해야 합니다." : "준비 예산은 미입력 상태이며 0원으로 보지 않습니다.",
    "후보는 검토할 제안이며 시장 수요·수익성·성공 가능성을 검증한 결과가 아닙니다.",
  ];
  const custom = typeof answers.business === "string" && answers.business.trim() ? answers.business : undefined;
  if (custom !== undefined) {
    const sector = PROPOSAL_SECTORS.find(value => value === answers.industry) ?? "general";
    return [{ id: "custom-business", title: custom, description: custom, sector,
      reasons: ["직접 입력한 사업 구상을 그대로 유지했습니다."],
      cautions: [...constraints, ...(sector === "general" ? ["업종은 임의로 추정하지 않았습니다. 새로운 사업 구상도 그대로 구체화할 수 있습니다."] : [])],
    }];
  }
  const interest = answerText(answers.interest);
  const experience = answerText(answers.experience);
  // Order: ideas whose sector the user picked as an interest first, then explicit tag matches, with catalogue order as the stable tie-breaker.
  return CANDIDATE_IDEAS.map((idea, index) => {
    const tags = [idea.sector, SECTOR_PROFILES[idea.sector].label, ...idea.tags];
    const interestTags = tags.filter(tag => matchesTag(interest, tag));
    const experienceTags = tags.filter(tag => matchesTag(experience, tag));
    const interestSector = Number(matchesTag(interest, idea.sector) || matchesTag(interest, SECTOR_PROFILES[idea.sector].label));
    const readable = (matched: string[]) => [...new Set(matched.map(tag => tag === idea.sector ? SECTOR_PROFILES[idea.sector].label : tag))].join(", ");
    const reasons = [
      ...(interestTags.length ? [`관심 분야 입력과 일치한 태그: ${readable(interestTags)}`] : []),
      ...(experienceTags.length ? [`경험 입력과 일치한 태그: ${readable(experienceTags)}`] : []),
    ];
    return { idea, index, interestSector, matches: Number(interestTags.length > 0) + Number(experienceTags.length > 0), reasons };
  }).sort((a, b) => b.interestSector - a.interestSector || b.matches - a.matches || a.index - b.index).slice(0, 3).map(({ idea, reasons }) => ({
    id: idea.id, title: idea.title, description: idea.description, sector: idea.sector,
    reasons: reasons.length ? reasons : ["일치한 관심·경험 태그가 없어 고정된 목록 순서의 예시로 제시합니다."],
    cautions: [idea.caution, ...constraints],
  }));
}
