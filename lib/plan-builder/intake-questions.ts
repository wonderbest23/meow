import type { CoachField } from "./coach";
import { COACH_FIELD_LABELS } from "./coach-presentation";
import { PROPOSAL_SECTORS, SECTOR_PROFILES, type ProposalSector } from "./proposal-blueprint";

export type IntakeMode = "exploring" | "startup" | "operating";
export type IntakeQuestion = {
  id: string;
  label: string;
  prompt: string;
  kind: "text" | "number" | "single" | "multi";
  options?: Array<{ value: string; label: string }>;
  fieldKey?: CoachField["key"];
  unit?: string;
  period?: string;
  optional?: boolean;
};

export const intakeSectorOptions: Array<{ value: ProposalSector; label: string }> = PROPOSAL_SECTORS.map(value => ({
  value, label: SECTOR_PROFILES[value].label,
}));

function fieldQuestion(key: CoachField["key"], prompt: string, extra: Partial<Pick<IntakeQuestion, "kind" | "unit" | "period">> = {}): IntakeQuestion {
  return { id: key, fieldKey: key, label: COACH_FIELD_LABELS[key], prompt, kind: "text", optional: true, ...extra };
}

const business = fieldQuestion("business", "어떤 사업을 생각하고 있나요? 직접 구상한 아이디어를 자유롭게 알려 주세요.");
const customer = fieldQuestion("customer", "누가 어떤 상황에서 이 상품이나 서비스를 필요로 하나요?");
const problem = fieldQuestion("problem", "그 고객이 지금 겪는 불편 중 어떤 문제를 해결하려 하나요?");
const offer = fieldQuestion("offer", "고객에게 제공할 대표 상품이나 서비스는 무엇인가요?");
const channel = fieldQuestion("channel", "처음 고객을 만나거나 판매하려는 곳은 어디인가요?");
const price = fieldQuestion("price", "대표 상품이나 서비스의 판매 1건 가격은 얼마인가요? 개당·회당·구독 1개월 등 판매 기준도 함께 알려 주세요.", { unit: "원", period: "판매 1건" });
const budget = fieldQuestion("budget", "사업 준비에 사용할 수 있는 예산은 얼마인가요? 필요한 비용의 추정치와는 구분해 주세요.", { kind: "number", unit: "원" });
const hours = fieldQuestion("hoursPerWeek", "일주일에 이 사업에 사용할 수 있는 시간은 몇 시간인가요?", { kind: "number", unit: "시간", period: "주" });
const capacity = fieldQuestion("capacity", "현재 인력과 자원으로 제공할 수 있는 범위는 어디까지인가요? 수량을 말할 때는 하루·주·월 등 기간도 알려 주세요.");
const goal = fieldQuestion("goal", "어느 시점까지 무엇을 이루고 싶나요? 목표는 현재 실적과 구분해 알려 주세요.");
const industry: IntakeQuestion = {
  id: "industry", label: "업종", prompt: "이 사업에 가장 가까운 업종은 무엇인가요?",
  kind: "single", options: intakeSectorOptions.map(option => ({ ...option })), optional: true,
};

// The parent owns progression, skips, persistence and candidate -> business selection.
const CORE_QUESTIONS: Record<IntakeMode, IntakeQuestion[]> = {
  exploring: [
    { id: "interest", label: "관심 분야", prompt: "어떤 분야의 일을 해보고 싶나요? 관심 있는 분야를 골라 주세요.", kind: "multi", options: intakeSectorOptions.map(option => ({ ...option })), optional: true },
    fieldQuestion("experience", "해본 일이나 익숙한 활동은 무엇인가요? 직장 경험뿐 아니라 취미와 생활 경험도 좋아요."),
    hours,
    budget,
    { id: "candidate", label: "사업 후보", prompt: "어떤 사업 후보를 더 살펴보고 싶나요? 직접 생각한 아이디어도 이야기할 수 있어요.", kind: "single", options: [], optional: true },
    customer, problem, offer, channel, price, goal,
  ],
  startup: [industry, business, customer, problem, offer, channel, price, budget, hours, capacity, goal],
  operating: [
    industry,
    fieldQuestion("business", "현재 운영 중인 사업은 무엇인가요?"),
    fieldQuestion("customer", "현재 주로 구매하거나 이용하는 고객은 누구인가요?"),
    fieldQuestion("offer", "현재 판매하거나 제공하는 대표 상품·서비스는 무엇인가요?"),
    fieldQuestion("problem", "사업을 운영하면서 지금 가장 개선하고 싶은 문제는 무엇인가요?"),
    { id: "period", label: "실적 기간 (시작일 / 종료일)", prompt: "살펴볼 실제 매출의 시작일과 종료일은 언제인가요? 시작일 YYYY-MM-DD / 종료일 YYYY-MM-DD로 알려 주세요.", kind: "text", optional: true },
    fieldQuestion("sales", "방금 정한 시작일부터 종료일까지의 실제 매출 합계는 얼마인가요? 예상 매출·목표·총 거래액과는 구분해 주세요.", { kind: "number", unit: "원", period: "입력한 시작일~종료일" }),
    { ...fieldQuestion("cost", "월 고정비 합계는 얼마인가요? 임차료·고정 인건비 등을 포함하고 건당 변동비나 실적 기간 전체 비용과는 구분해 주세요.", { kind: "number", unit: "원", period: "월" }), label: `${COACH_FIELD_LABELS.cost} (월 고정비)` },
    capacity,
    fieldQuestion("channel", "현재 고객을 만나거나 판매하는 주요 경로는 어디인가요?"),
    goal,
  ],
};

type DetailSpec = Omit<IntakeQuestion, "id" | "fieldKey" | "optional"> & { id: string };
const DETAIL_QUESTIONS: Record<ProposalSector, DetailSpec[]> = {
  b2b_service: [
    { id: "decisionMaker", label: "구매 결정자", prompt: "서비스 도입을 결정하는 사람과 실제 사용하는 담당자는 누구인가요?", kind: "text" },
    { id: "deliverables", label: "납품·검수 범위", prompt: "납품할 결과물과 고객이 완료를 확인하는 기준은 무엇인가요?", kind: "text" },
    { id: "deliveryDays", label: "프로젝트 소요 기간", prompt: "합의한 프로젝트 1건을 완료하는 데 며칠이 필요한가요?", kind: "number", unit: "일", period: "프로젝트 1건" },
    { id: "paymentTerms", label: "대금 지급 조건", prompt: "착수금·잔금의 지급 시점과 추가 요청의 비용 조건은 어떻게 되나요?", kind: "text" },
  ],
  software: [
    { id: "workflow", label: "핵심 사용 흐름", prompt: "사용자가 제품에서 가장 먼저 끝낼 수 있어야 하는 작업은 무엇인가요?", kind: "text" },
    { id: "releaseStatus", label: "현재 제공 단계", prompt: "지금 실제로 제공할 수 있는 제품의 단계는 어디인가요?", kind: "single", options: [{ value: "concept", label: "구상" }, { value: "prototype", label: "시제품·시험 사용" }, { value: "released", label: "출시·제공 중" }] },
    { id: "billingUnit", label: "과금 기준", prompt: "사용자 수·팀·사용량 등 무엇을 기준으로 어느 기간마다 요금을 받나요?", kind: "text" },
    { id: "supportMinutes", label: "고객 설정 지원 시간", prompt: "고객 1곳의 최초 설정을 지원하는 데 몇 분이 필요한가요?", kind: "number", unit: "분", period: "고객 1곳 최초 설정" },
  ],
  food_beverage: [
    { id: "signatureMenu", label: "대표 메뉴", prompt: "먼저 제공할 대표 메뉴와 주문 방식은 무엇인가요?", kind: "text" },
    { id: "averageTicket", label: "주문당 평균 결제액", prompt: "주문 1건의 평균 결제액은 얼마인가요? 대표 메뉴 1개 가격과 구분하고, 실제 기록인지 예상인지도 알려 주세요.", kind: "text", unit: "원", period: "주문 1건" },
    { id: "peakOrders", label: "피크 시간 처리량", prompt: "가장 바쁜 시간에 한 시간당 처리할 수 있는 주문은 몇 건인가요?", kind: "number", unit: "건", period: "시간" },
    { id: "wasteHandling", label: "식재료·폐기 관리", prompt: "식재료 보관과 남은 재료의 폐기는 어떻게 관리하나요?", kind: "text" },
  ],
  retail_commerce: [
    { id: "sourcing", label: "상품 조달 방식", prompt: "판매할 상품을 어디에서 어떤 방식으로 공급받나요?", kind: "text" },
    { id: "minimumOrder", label: "최소 발주 수량", prompt: "대표 상품을 한 번 발주할 때 최소 몇 개를 주문해야 하나요?", kind: "number", unit: "개", period: "발주 1회" },
    { id: "fulfillment", label: "배송·재고 방식", prompt: "재고 보관과 포장·배송은 누가 어떻게 맡나요?", kind: "text" },
    { id: "returns", label: "교환·반품 조건", prompt: "교환·반품의 조건과 배송비 부담은 어떻게 정해져 있나요?", kind: "text" },
  ],
  manufacturing: [
    { id: "productStage", label: "제품 준비 상태", prompt: "제품 사양과 현재 준비 상태는 무엇인가요? 설계·시제품·양산을 구분해 알려 주세요.", kind: "text" },
    { id: "minimumBatch", label: "최소 생산 수량", prompt: "대표 제품을 한 번 생산할 때 최소 몇 개를 만들어야 하나요?", kind: "number", unit: "개", period: "생산 1회" },
    { id: "qualityChecks", label: "품질·시험 확인", prompt: "제품의 품질 기준과 필요한 시험·인증의 확인 상태는 어떤가요? 예정과 완료를 구분해 주세요.", kind: "text" },
    { id: "leadDays", label: "생산·납품 소요 기간", prompt: "발주를 받은 뒤 한 물량을 납품하기까지 며칠이 필요한가요?", kind: "number", unit: "일", period: "발주 1회" },
  ],
  education: [
    { id: "learningOutcome", label: "학습 목표", prompt: "수업을 마친 학습자가 무엇을 할 수 있도록 돕고 싶나요?", kind: "text" },
    { id: "classSize", label: "수업당 정원", prompt: "한 수업에서 함께 가르칠 수 있는 학습자는 몇 명인가요?", kind: "number", unit: "명", period: "수업 1회" },
    { id: "sessionMinutes", label: "수업 시간", prompt: "수업 1회는 몇 분 동안 진행하나요?", kind: "number", unit: "분", period: "수업 1회" },
    { id: "feedback", label: "평가·피드백 방식", prompt: "학습 결과를 어떤 과제나 관찰로 확인하고 피드백하나요?", kind: "text" },
  ],
  local_service: [
    { id: "serviceArea", label: "방문 가능 지역", prompt: "방문하거나 서비스를 제공할 수 있는 지역은 어디까지인가요?", kind: "text" },
    { id: "travelMinutes", label: "왕복 이동 시간", prompt: "예약 1건에 필요한 왕복 이동 시간은 몇 분인가요? 작업 시간과 구분해 주세요.", kind: "number", unit: "분", period: "예약 1건" },
    { id: "responsibility", label: "작업·책임 범위", prompt: "작업에 포함되는 범위와 제외되는 범위는 무엇인가요?", kind: "text" },
    { id: "cancellation", label: "예약 취소 조건", prompt: "예약 취소나 고객 부재 때의 처리 조건은 어떻게 되나요?", kind: "text" },
  ],
  space_hospitality: [
    { id: "useConditions", label: "공간 이용 조건", prompt: "공간의 이용 목적과 허용된 용도·이용 조건의 확인 상태는 어떤가요?", kind: "text" },
    { id: "guestLimit", label: "예약당 이용 인원", prompt: "예약 1건에 받을 수 있는 최대 이용 인원은 몇 명인가요?", kind: "number", unit: "명", period: "예약 1건" },
    { id: "turnoverMinutes", label: "예약 사이 정비 시간", prompt: "이용이 끝난 뒤 다음 예약까지 청소·정비에 몇 분이 필요한가요?", kind: "number", unit: "분", period: "예약 사이 1회" },
    { id: "damagePolicy", label: "취소·파손 대응", prompt: "예약 취소와 시설 파손에 대한 처리 조건은 무엇인가요?", kind: "text" },
  ],
  logistics: [
    { id: "route", label: "배송 지역·구간", prompt: "어떤 지역이나 출발지·도착지 구간을 담당하나요?", kind: "text" },
    { id: "dailyShipments", label: "하루 처리 물량", prompt: "현재 차량과 인력으로 하루에 배송할 수 있는 물량은 몇 건인가요?", kind: "number", unit: "건", period: "일" },
    { id: "cargoConditions", label: "화물 취급 조건", prompt: "운송할 물품의 크기·보관·취급 조건은 무엇인가요?", kind: "text" },
    { id: "exceptions", label: "배송 예외 대응", prompt: "지연·분실·파손이나 재배송이 생기면 어떻게 처리하나요?", kind: "text" },
  ],
  content_media: [
    { id: "format", label: "제작·납품 형식", prompt: "어떤 형식의 콘텐츠를 제작해 어디에 사용할 수 있도록 납품하나요?", kind: "text" },
    { id: "revisionRounds", label: "포함된 수정 횟수", prompt: "납품물 1개 가격에 포함하는 수정은 몇 회인가요?", kind: "number", unit: "회", period: "납품물 1개" },
    { id: "usageRights", label: "사용 권리·범위", prompt: "콘텐츠와 원본 파일의 사용 기간·매체·권리는 어떻게 정하나요?", kind: "text" },
    { id: "productionDays", label: "제작 소요 기간", prompt: "합의된 납품물 1개를 완성하는 데 며칠이 필요한가요?", kind: "number", unit: "일", period: "납품물 1개" },
  ],
  general: [
    { id: "smallestTrial", label: "작은 제공 범위", prompt: "직접 구상한 사업에서 가장 작게 제공해 볼 수 있는 것은 무엇인가요?", kind: "text" },
    { id: "resources", label: "필요한 자원", prompt: "그 범위를 제공하려면 어떤 사람·도구·자원이 필요한가요?", kind: "text" },
    { id: "trialDays", label: "첫 시도 소요 기간", prompt: "작은 제공안을 준비하고 한 번 실행하는 데 며칠이 필요한가요?", kind: "number", unit: "일", period: "시도 1회" },
    { id: "reviewCriteria", label: "계속·조정 판단 기준", prompt: "어떤 고객 반응을 확인한 뒤 계속하거나 내용을 조정할지 정하고 싶나요?", kind: "text" },
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

export function getIntakeQuestion(mode: IntakeMode, sector: ProposalSector | null | undefined, id: string): IntakeQuestion | undefined {
  // Free-form ideas are an alternative to candidate selection, not another required step.
  if (mode === "exploring" && id === "business") return copyQuestion(business);
  return coreQuestions(mode).find(question => question.id === id)
    ?? (sector == null ? undefined : detailQuestions(sector).find(question => question.id === id));
}

type Candidate = { id: string; title: string; description: string; sector: ProposalSector; reasons: string[]; cautions: string[] };
type CandidateIdea = Pick<Candidate, "id" | "title" | "description" | "sector"> & { tags: string[]; caution: string };
const CANDIDATE_IDEAS: CandidateIdea[] = [
  { id: "workflow-support", sector: "b2b_service", title: "소규모 팀 업무 정리 서비스", description: "반복 업무를 정리하고 바로 사용할 문서·작업 절차를 제공하는 사업 후보입니다.", tags: ["문서", "사무", "업무", "정리", "기획"], caution: "고객의 자료 접근 권한과 납품·추가 요청 범위를 먼저 확인해야 합니다." },
  { id: "focused-software", sector: "software", title: "한 가지 작업을 돕는 소프트웨어", description: "고객의 반복 작업 하나를 끝낼 수 있는 작은 도구를 만드는 사업 후보입니다.", tags: ["개발", "코딩", "자동화", "소프트웨어", "앱", "코드", "coding", "software"], caution: "실제 구현 범위와 데이터 처리·유지보수 비용을 확인해야 합니다." },
  { id: "preorder-menu", sector: "food_beverage", title: "사전 주문형 소량 메뉴 판매", description: "정해진 메뉴를 예약 주문받아 준비하는 음식 판매 사업 후보입니다.", tags: ["요리", "음식", "카페", "커피", "베이킹", "식음료"], caution: "판매 전 조리 공간·식품 취급·관련 요건과 재료 폐기 비용을 확인해야 합니다." },
  { id: "curated-commerce", sector: "retail_commerce", title: "주제별 소량 상품 판매", description: "한 고객군의 사용 목적에 맞춘 상품을 골라 판매하는 사업 후보입니다.", tags: ["판매", "유통", "쇼핑", "상품", "온라인몰", "커머스"], caution: "공급 조건과 최소 발주량·재고·배송·반품 부담을 확인해야 합니다." },
  { id: "small-batch-product", sector: "manufacturing", title: "맞춤 소량 제품 제작", description: "구체적인 사용 불편을 해결할 제품을 소량 제작하는 사업 후보입니다.", tags: ["제조", "공예", "설계", "가공", "제품", "3d"], caution: "시제품과 양산을 구분하고 설비·품질·시험·최소 생산량을 확인해야 합니다." },
  { id: "practical-class", sector: "education", title: "경험 기반 소규모 실습 수업", description: "직접 해본 활동을 작은 실습 수업으로 제공하는 사업 후보입니다.", tags: ["교육", "수업", "강의", "가르", "코칭", "학습"], caution: "가르칠 수 있는 범위와 준비 시간을 확인해야 하며 학습 결과를 보장하지 않습니다." },
  { id: "local-organization", sector: "local_service", title: "예약형 생활 정리 서비스", description: "방문 가능한 지역에서 생활 공간 정리를 돕는 사업 후보입니다.", tags: ["청소", "정리", "방문", "생활", "지역", "수납"], caution: "이동 시간과 작업 범위·현장 안전·물품 취급 책임을 확인해야 합니다." },
  { id: "reserved-space", sector: "space_hospitality", title: "목적별 예약 공간 운영", description: "특정 모임이나 작업 목적에 맞는 공간을 예약제로 제공하는 사업 후보입니다.", tags: ["공간", "숙박", "대관", "공유", "모임"], caution: "공간 확보·이용 용도·시설 관리·임차 비용을 확인해야 합니다." },
  { id: "local-delivery", sector: "logistics", title: "지역 정기 배송 서비스", description: "정해진 지역과 구간의 반복 배송을 맡는 사업 후보입니다.", tags: ["물류", "배송", "운송", "운전", "배달"], caution: "운송 자원·관련 요건·회송 비용·분실 및 파손 책임을 확인해야 합니다." },
  { id: "small-content", sector: "content_media", title: "소규모 브랜드 콘텐츠 제작", description: "한 가지 형식의 사진·영상·글을 제작해 납품하는 사업 후보입니다.", tags: ["콘텐츠", "사진", "영상", "글쓰기", "디자인", "편집", "미디어"], caution: "자료의 사용 권리와 촬영·제작 범위·수정 횟수를 확인해야 합니다." },
  { id: "personal-archive", sector: "general", title: "개인 기록 정리 서비스", description: "고객의 기록을 원하는 방식으로 정리해 전달하는 새로운 서비스 후보입니다.", tags: ["기록", "아카이브", "취미", "새로운", "미분류"], caution: "기존 업종에 맞추기보다 원하는 결과와 개인정보·기록 사용 권한부터 확인해야 합니다." },
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
  // Order by explicit tag matches only, with catalogue order as the stable tie-breaker.
  return CANDIDATE_IDEAS.map((idea, index) => {
    const tags = [idea.sector, SECTOR_PROFILES[idea.sector].label, ...idea.tags];
    const interestTags = tags.filter(tag => matchesTag(interest, tag));
    const experienceTags = tags.filter(tag => matchesTag(experience, tag));
    const reasons = [
      ...(interestTags.length ? [`관심 분야 입력과 일치한 태그: ${interestTags.join(", ")}`] : []),
      ...(experienceTags.length ? [`경험 입력과 일치한 태그: ${experienceTags.join(", ")}`] : []),
    ];
    return { idea, index, matches: Number(interestTags.length > 0) + Number(experienceTags.length > 0), reasons };
  }).sort((a, b) => b.matches - a.matches || a.index - b.index).slice(0, 3).map(({ idea, reasons }) => ({
    id: idea.id, title: idea.title, description: idea.description, sector: idea.sector,
    reasons: reasons.length ? reasons : ["일치한 관심·경험 태그가 없어 고정된 목록 순서의 예시로 제시합니다."],
    cautions: [idea.caution, ...constraints],
  }));
}
