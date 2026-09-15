export const PROPOSAL_SECTORS = ["b2b_service", "software", "food_beverage", "retail_commerce", "manufacturing", "education", "local_service", "space_hospitality", "logistics", "content_media", "general"] as const;
export type ProposalSector = typeof PROPOSAL_SECTORS[number];
export const PROPOSAL_PURPOSES = ["introduction", "sales", "operating_plan", "investment", "grant"] as const;
export type ProposalPurpose = typeof PROPOSAL_PURPOSES[number];
export const PROPOSAL_STAGES = ["idea", "prelaunch", "operating", "expanding"] as const;
export type ProposalStage = typeof PROPOSAL_STAGES[number];
export const PROPOSAL_EVIDENCE = ["images", "pricing", "financials", "actuals", "schedule", "references"] as const;
export type ProposalEvidence = typeof PROPOSAL_EVIDENCE[number];
export type EvidenceAvailability = Record<ProposalEvidence, boolean>;
export type ProposalLayout = "cover" | "summary" | "columns" | "process" | "table" | "timeline" | "evidence" | "closing";
export type ProposalRole = "cover" | "summary" | "problem" | "solution" | "offering" | "workflow" | "commercial" | "evidence" | "economics" | "roadmap" | "risks" | "team" | "ask" | "close";

export type ProposalOptions = {
  sector?: ProposalSector;
  purpose?: ProposalPurpose;
  stage?: ProposalStage;
  evidence?: Partial<EvidenceAvailability>;
};
export interface SectorProfile {
  label: string;
  customer: string;
  offering: string;
  workflow: readonly string[];
  economics: readonly string[];
  evidence: readonly string[];
  risks: readonly string[];
  avoid: string;
}

// These are questions and composition rules, never invented facts about a business.
export const SECTOR_PROFILES: Record<ProposalSector, SectorProfile> = {
  b2b_service: {
    label: "기업 서비스", customer: "의사결정자와 실무 담당자 및 현재 업무의 병목", offering: "수행 범위와 납품물 및 제외 범위",
    workflow: ["현황 진단", "수행 범위 합의", "제작 및 실행", "검수와 인수인계"], economics: ["프로젝트 단가", "투입 인력과 시간", "외주비", "대금 지급 조건"],
    evidence: ["허가받은 수행 사례", "고객이 확인한 결과", "납품물 견본"], risks: ["추가 요청 범위", "검수 기준", "일정 지연 책임"], avoid: "확인하지 않은 고객사 로고나 절감률을 넣지 않음",
  },
  software: {
    label: "소프트웨어 · 플랫폼", customer: "실제 사용자와 구매자 및 기존 도구의 불편", offering: "핵심 사용 시나리오와 현재 제공 가능한 기능",
    workflow: ["가입과 설정", "핵심 작업", "결과 확인", "재사용과 관리"], economics: ["요금제", "고객당 변동비", "개발 및 운영비", "유료 전환 기준"],
    evidence: ["실제 제품 화면", "사용 로그의 기간과 정의", "검증된 기능 범위"], risks: ["데이터 처리", "외부 연동 의존", "개발 중인 기능 구분"], avoid: "개발 예정 화면을 출시 기능으로 표현하지 않음",
  },
  food_beverage: {
    label: "카페 · 음식점", customer: "방문 고객과 방문 시간대 및 선택 이유", offering: "대표 메뉴와 주문 방식 및 매장 경험",
    workflow: ["재료 준비", "주문과 결제", "조리와 제공", "재방문 관리"], economics: ["객단가", "원재료비", "인건비와 임차료", "좌석 또는 시간당 처리량"],
    evidence: ["실제 메뉴와 공간 사진", "기간별 판매 기록", "고객 피드백"], risks: ["피크 시간 처리량", "폐기와 재고", "인허가 확인 항목"], avoid: "가상의 상권 유동 인구나 매출을 실제 조사 결과처럼 쓰지 않음. 대표 메뉴 단가와 객단가는 구분",
  },
  retail_commerce: {
    label: "유통 · 온라인 판매", customer: "구매 상황과 고객군 및 판매 채널", offering: "상품군과 차별점 및 구성 옵션",
    workflow: ["소싱과 입고", "상품 등록", "주문과 배송", "교환과 재구매"], economics: ["판매가", "매입가", "배송과 채널 수수료", "반품 및 재고 부담"],
    evidence: ["실제 상품 이미지", "채널별 주문 기록", "반품 사유"], risks: ["최소 발주량", "품절과 재고", "배송 및 교환 조건"], avoid: "총 거래액을 매출이나 이익으로 바꾸어 표시하지 않음",
  },
  manufacturing: {
    label: "제조 · 제품", customer: "사용 환경과 구매 규격 및 구매 담당자", offering: "제품 사양과 적용 범위 및 시제품 상태",
    workflow: ["설계와 시제품", "시험과 보완", "생산과 품질 검사", "납품과 유지 관리"], economics: ["공급 단가", "재료와 가공비", "생산 수량과 수율", "금형 및 설비 투자"],
    evidence: ["제품 및 시제품 사진", "시험 성적서", "생산 또는 납품 기록"], risks: ["인증과 시험", "최소 생산량", "불량 및 납기 대응"], avoid: "인증 예정과 인증 완료 및 시제품과 양산품을 구분함",
  },
  education: {
    label: "교육 · 코칭", customer: "학습자와 비용 부담자 및 학습 전 상태", offering: "교육 목표와 커리큘럼 및 제공 형식",
    workflow: ["수준과 목표 확인", "학습 또는 수업", "과제와 피드백", "성과 확인과 후속 학습"], economics: ["수강료", "강사 및 콘텐츠 비용", "기수당 정원", "운영 횟수"],
    evidence: ["수업 자료 견본", "수료 및 평가 기록", "허가받은 학습 후기"], risks: ["성과 측정 방식", "정원과 강사 일정", "취소 및 환불 조건"], avoid: "취업·성적 향상 등 결과를 보장하지 않음",
  },
  local_service: {
    label: "생활 · 지역 서비스", customer: "서비스가 필요한 상황과 방문 가능 지역", offering: "서비스 항목과 예약 단위 및 제공 범위",
    workflow: ["상담과 예약", "방문 또는 접수", "서비스 수행", "확인과 사후 관리"], economics: ["건당 가격", "작업 및 이동 시간", "재료비", "하루 예약 가능 건수"],
    evidence: ["허가받은 작업 전후 자료", "예약 및 재방문 기록", "작업 기준"], risks: ["방문 가능 범위", "노쇼와 취소", "작업 책임 범위"], avoid: "효능·개선율 등 전문적 결과를 근거 없이 확정하지 않음",
  },
  space_hospitality: {
    label: "공간 · 숙박", customer: "이용 목적과 동행 인원 및 예약 시간대", offering: "공간 구성과 이용 조건 및 현장 경험",
    workflow: ["검색과 예약", "입실 또는 입장", "이용과 현장 지원", "퇴실과 정비"], economics: ["예약 단가", "이용률과 기간", "청소 및 운영비", "임차료와 시설비"],
    evidence: ["실제 공간 사진과 평면도", "예약 및 이용 기록", "시설 상태"], risks: ["이용 가능 용도", "취소와 파손", "관리 및 안전 확인 항목"], avoid: "계획 이용률을 실제 가동률처럼 표시하지 않음",
  },
  logistics: {
    label: "물류 · 배송", customer: "화주와 배송 대상 및 물량 특성", offering: "서비스 지역과 처리 단위 및 계약 수준",
    workflow: ["접수와 배차", "집하와 분류", "운송과 배송", "인수 확인과 정산"], economics: ["건당 또는 구간별 단가", "차량과 인력비", "처리 물량", "회송 및 예외 비용"],
    evidence: ["운행 및 배송 기록", "배송 완료 기준", "지연과 파손 기록"], risks: ["처리 용량", "피크 물량 대응", "분실 및 파손 책임"], avoid: "정시 배송률을 기간과 분모 없이 제시하지 않음",
  },
  content_media: {
    label: "콘텐츠 · 미디어", customer: "의뢰인과 최종 시청자 및 콘텐츠 사용처", offering: "콘텐츠 형식과 제작 수량 및 사용 권리",
    workflow: ["브리프와 기획", "촬영 또는 제작", "편집과 검토", "납품과 활용"], economics: ["제작 단가", "인력과 장비 비용", "수정 횟수", "라이선스와 추가 활용료"],
    evidence: ["사용 가능한 포트폴리오", "납품 견본", "기간과 채널이 있는 성과 기록"], risks: ["저작권과 초상권", "추가 수정 범위", "소스 파일 인계"], avoid: "조회수를 고객 매출이나 수익으로 치환하지 않음",
  },
  general: {
    label: "새로운 사업 · 미분류", customer: "누가 어떤 상황에서 필요로 하는지", offering: "무엇을 제공하고 무엇은 제공하지 않는지",
    workflow: ["고객과 조건 확인", "최소 제공안 준비", "작게 실행", "반응과 다음 단계 확인"], economics: ["제안 가격", "제공에 드는 비용", "가능한 작업량", "지속 운영 조건"],
    evidence: ["현재 준비된 자료", "직접 확인한 반응", "추가 검증할 가정"], risks: ["미확정 범위", "필요한 자원", "검증 중단 및 조정 기준"], avoid: "기존 업종의 점포·재고·투자 항목을 억지로 넣지 않음",
  },
};

export const PURPOSE_LABELS: Record<ProposalPurpose, string> = { introduction: "사업소개서", sales: "고객 제안서", operating_plan: "실행 · 개선 기획서", investment: "투자 검토 자료", grant: "정부지원 기획서" };
export const STAGE_LABELS: Record<ProposalStage, string> = { idea: "아이디어", prelaunch: "시작 준비", operating: "운영 중", expanding: "확장 검토" };
const STORYLINES: Record<ProposalPurpose, ProposalRole[]> = {
  introduction: ["cover", "summary", "problem", "solution", "offering", "workflow", "evidence", "commercial", "roadmap", "close"],
  sales: ["cover", "summary", "problem", "solution", "offering", "workflow", "evidence", "commercial", "roadmap", "risks", "team", "close"],
  operating_plan: ["cover", "summary", "evidence", "problem", "solution", "offering", "workflow", "economics", "roadmap", "risks", "team", "close"],
  investment: ["cover", "summary", "problem", "solution", "offering", "evidence", "commercial", "economics", "roadmap", "team", "risks", "ask", "close"],
  grant: ["cover", "summary", "problem", "solution", "offering", "evidence", "workflow", "economics", "roadmap", "team", "risks", "ask", "close"],
};
const ROLE_LABELS: Record<ProposalRole, string> = { cover: "표지", summary: "사업 정의", problem: "고객의 문제", solution: "해결 방식", offering: "제공 범위", workflow: "이용 · 수행 과정", commercial: "가격과 거래 조건", evidence: "확인한 근거", economics: "운영과 계산", roadmap: "실행 일정", risks: "조건과 대응", team: "수행 역량", ask: "요청과 사용 계획", close: "다음 단계" };
const LAYOUTS: Record<ProposalRole, ProposalLayout> = { cover: "cover", summary: "summary", problem: "columns", solution: "columns", offering: "table", workflow: "process", commercial: "table", evidence: "evidence", economics: "table", roadmap: "timeline", risks: "table", team: "columns", ask: "table", close: "closing" };

export interface ProposalSlot {
  id: string;
  role: ProposalRole;
  title: string;
  layout: ProposalLayout;
  focus: string;
  requiredEvidence: ProposalEvidence[];
  missingEvidence: ProposalEvidence[];
  treatment: "source_only" | "verification_plan";
  fallback: string;
}
export interface ProposalBlueprint {
  version: 2;
  sector: ProposalSector;
  classification: "explicit" | "inferred" | "unclassified";
  purpose: ProposalPurpose;
  stage: ProposalStage;
  evidence: EvidenceAvailability;
  slots: ProposalSlot[];
  appendix: string[];
  cautions: string[];
}

export function inferProposalSector(name: string, description = ""): ProposalSector {
  const subject = `${name} ${description}`.toLowerCase();
  // Delivery model wins over the customer's industry: software for cafes is not a cafe.
  const tests: [ProposalSector, RegExp][] = [
    ["software", /saas|소프트웨어|플랫폼|앱 개발|업무 자동화|software|관리 앱/],
    ["logistics", /물류|배송 대행|운송|화물|풀필먼트|logistics/],
    ["education", /교육|강의|학원|코칭|수업|education|coaching/],
    ["content_media", /촬영|사진 제작|영상|콘텐츠 제작|미디어|photo service|media/],
    ["b2b_service", /컨설팅|대행|기업 서비스|디자인 스튜디오|회계|세무|consulting|agency/],
    ["manufacturing", /제조|양산|시제품|공장|반도체|manufactur/],
    ["retail_commerce", /온라인 판매|쇼핑몰|커머스|도소매|유통|commerce|retail/],
    ["space_hospitality", /숙박|펜션|공간 대여|대관|공유 오피스|게스트하우스|hotel/],
    ["local_service", /청소|수리|미용|세탁|방문 서비스|꽃집|플라워/],
    ["food_beverage", /카페|커피|음식점|식당|베이커리|레스토랑|coffee|cafe|restaurant/],
  ];
  return tests.find(([, test]) => test.test(subject))?.[0] ?? "general";
}

export function inferProposalPurpose(planType = ""): ProposalPurpose {
  if (/PSST|정부지원/.test(planType)) return "grant";
  if (/투자|\bIR\b/i.test(planType)) return "investment";
  if (/제안서|수주/.test(planType)) return "sales";
  if (/운영|개선|성장|확장/.test(planType)) return "operating_plan";
  return "introduction";
}

export function createProposalBlueprint(input: { businessName: string; businessDescription?: string; planType?: string; options?: ProposalOptions }): ProposalBlueprint {
  const options = input.options ?? {};
  const sector = options.sector ?? inferProposalSector(input.businessName, input.businessDescription);
  const purpose = options.purpose ?? inferProposalPurpose(input.planType);
  const stage = options.stage ?? (/성장|확장/.test(input.planType ?? "") ? "expanding" : /운영|개선/.test(input.planType ?? "") ? "operating" : "prelaunch");
  const evidence = Object.fromEntries(PROPOSAL_EVIDENCE.map(key => [key, options.evidence?.[key] === true])) as EvidenceAvailability;
  const profile = SECTOR_PROFILES[sector];
  const operating = stage === "operating" || stage === "expanding";
  const requirements: Partial<Record<ProposalRole, ProposalEvidence[]>> = { commercial: ["pricing"], economics: ["financials"], roadmap: ["schedule"], evidence: operating ? ["actuals"] : ["references"] };
  const focus: Record<ProposalRole, string> = {
    cover: `${PURPOSE_LABELS[purpose]}의 독자와 목적 및 한 문장 사업 정의`,
    summary: `${profile.customer} / ${profile.offering}`,
    problem: `${operating ? "현재 운영의 병목과 고객 문제" : "고객이 겪는 상황과 해결하려는 문제"}. ${profile.customer}`,
    solution: "앞 장의 문제와 같은 순서로 대응 방식을 연결. 현재 제공 범위와 제안 범위를 구별",
    offering: `${profile.offering}. 포함 항목 / 납품 또는 제공 단위 / 제외 항목`,
    workflow: `${profile.workflow.join(" → ")}. 각 단계의 담당과 확인 기준`,
    commercial: `${profile.economics.join(" / ")}. 합의된 가격과 테스트용 제안 가격 및 미정 조건을 구분`,
    evidence: `${profile.evidence.join(" / ")}. ${operating ? "실적은 기간과 단위와 출처를 함께 표시" : "준비 현황과 검증 계획을 분리"}`,
    economics: `${profile.economics.join(" / ")}. 실적과 예상 시나리오를 분리하고 제공된 계산값만 사용`,
    roadmap: `${stage === "expanding" ? "기존 운영 유지와 확장 실험을 분리" : operating ? "유지할 것과 변경할 것을 분리" : "최소 시작 범위부터 순서대로 제시"}. 일정 / 담당 / 산출물 / 완료 조건`,
    risks: `${profile.risks.join(" / ")}. 위험 요인 / 확인 조건 / 대응 또는 중단 기준`,
    team: "실제로 제공된 경험과 역할 및 부족한 역량을 구분. 가상 직원·이력·자격을 만들지 않음",
    ask: purpose === "grant" ? "지원금 사용 항목과 사업비 근거 및 마일스톤. 자격·선정 가능성은 별도 확인" : "제공된 투자 요청 조건과 사용 목적 및 마일스톤. 투자 수익을 보장하지 않음",
    close: purpose === "sales" ? "협의할 범위와 고객이 결정할 항목 및 다음 접점" : "다음에 확인하거나 실행할 일과 담당 및 결정 조건",
  };
  const slots = STORYLINES[purpose].map((role): ProposalSlot => {
    const requiredEvidence = requirements[role] ?? [];
    const missingEvidence = requiredEvidence.filter(key => !evidence[key]);
    const fallback = role === "evidence" ? "없는 실적·고객사·후기 대신 준비된 것 / 검증할 가정 / 확인 방법을 제시"
      : role === "economics" ? "빈 비용을 0으로 놓지 않고 필요한 입력과 계산 조건을 표로 제시. 가짜 차트 금지"
      : role === "commercial" ? "원문의 제안 가격은 제안으로 표시하고 없으면 과금 단위와 협의 조건만 제시"
      : role === "roadmap" ? "없는 날짜를 만들지 말고 단계별 착수 조건과 완료 기준을 제시"
      : "원문에 있는 내용만 사용하고 확정되지 않은 내용은 제안으로 표시";
    return { id: `proposal-${role}`, role, title: role === "evidence" && missingEvidence.length ? (operating ? "운영 검증 계획" : "준비 현황과 검증") : ROLE_LABELS[role], layout: LAYOUTS[role], focus: focus[role], requiredEvidence, missingEvidence, treatment: missingEvidence.length ? "verification_plan" : "source_only", fallback };
  });
  return {
    version: 2, sector, classification: options.sector ? "explicit" : sector === "general" ? "unclassified" : "inferred", purpose, stage, evidence, slots,
    appendix: ["세부 산출 근거", "상세 사양과 제공 범위", "출처 및 참고 자료", "추가 질문과 미확정 항목"],
    cautions: [profile.avoid, "자료 유무는 독립 검증 여부가 아니며 원문의 제안·예상·사용자 제공 표시를 유지", "본문에 없는 시장 통계·인증·파트너·재무 수치를 생성하지 않음", "사용 권한이 확인된 이미지에만 imageId를 사용. 없으면 이미지 없는 판형", ...(sector === "general" ? ["업종 미분류: 일반 사업 구조를 사용하고 분류를 확정하지 않음"] : [])],
  };
}

export function proposalBlueprintPrompt(blueprint: ProposalBlueprint): string {
  return [
    `[업종별 편집 설계 v2] ${SECTOR_PROFILES[blueprint.sector].label} / ${PURPOSE_LABELS[blueprint.purpose]} / ${STAGE_LABELS[blueprint.stage]}`,
    `본문 ${blueprint.slots.length}장. 아래 id와 순서를 정확히 유지하고 각 장은 하나의 질문에 답하세요. 긴 설명은 note와 부록 후보로 분리하세요.`,
    ...blueprint.slots.map((slot, index) => `${index + 1}. id=${slot.id} | ${slot.title} | ${slot.layout}\n초점: ${slot.focus}\n자료 부족 시: ${slot.fallback}`),
    `자료 유무(사실 인증 아님): ${JSON.stringify(blueprint.evidence)}`,
    "table 판형은 표의 headers(2~4열, 제목 12자 이내)와 rows(권장 3행, 최대 5행, 각 셀 25자 이내), process 판형은 points(최대 4단계)를 사용하세요. timeline은 기간·담당·완료 기준의 표를 사용하되 없는 날짜는 만들지 마세요.",
    "title 50자 이내, lead 100자 이내, points.label 20자 이내, points.detail 40자 이내, note 160자 이내. 분량을 넘기면 핵심 조건을 지우지 말고 항목을 다시 편집하세요.",
    "problem과 solution의 points.label은 같은 순서를 사용하여 문제와 대응이 1:1로 읽히게 하세요. points와 table에 같은 문장을 중복하지 마세요.",
    ...blueprint.cautions,
  ].join("\n");
}
