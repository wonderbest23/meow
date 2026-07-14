import type {
  BusinessAssessment,
  BusinessSetup,
  ComplianceRequirement,
} from "./domain";
import { calculateFinancialAnalysis } from "./financial-engine";

const NTS_REGISTRATION =
  "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7777&mi=2444";
const EASYLAW_STARTUP =
  "https://easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=3&cciNo=1&cnpClsNo=1&csmSeq=632";
const EASYLAW_LEASE =
  "https://www.easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=2&cciNo=1&cnpClsNo=1&csmSeq=627";
const EASYLAW_ECOMMERCE =
  "https://www.easylaw.go.kr/CSP/CnpClsMainBtr.laf?ccfNo=3&cciNo=1&cnpClsNo=1&csmSeq=25";
const FOUR_INSURANCE = "https://www.4insure.or.kr";
const GOV_KR = "https://www.gov.kr";

function requirement(
  value: ComplianceRequirement,
): ComplianceRequirement {
  return value;
}

export function evaluateKoreanRequirements(setup: BusinessSetup): ComplianceRequirement[] {
  const requirements: ComplianceRequirement[] = [
    requirement({
      id: "business-registration",
      category: "registration",
      severity: "required",
      title: "사업자등록 준비",
      reason: "사업 개시 전 또는 사업을 시작한 날부터 20일 이내 사업장별 등록이 필요합니다.",
      actions: [
        "개인사업자와 법인사업자 중 형태 확정",
        "사업장 주소와 업종·업태 결정",
        "임대차계약서·인허가증 등 해당 서류 준비",
        "홈택스 또는 관할 세무서 신청",
      ],
      authority: "국세청",
      sourceUrl: NTS_REGISTRATION,
    }),
    requirement({
      id: "tax-calendar",
      category: "tax",
      severity: "verify",
      title: "세무 유형과 신고 일정 확인",
      reason: "과세유형, 법인/개인, 직원을 고용하는지에 따라 부가세·원천세·소득세 일정이 달라집니다.",
      actions: [
        "일반과세·간이과세 적용 가능성 확인",
        "매출·매입 증빙과 사업용 계좌 관리 방식 결정",
        "신고 일정 캘린더 등록",
      ],
      authority: "국세청",
      sourceUrl: "https://www.nts.go.kr",
    }),
  ];

  if (setup.legalForm === "undecided") {
    requirements.push(requirement({
      id: "legal-form-decision",
      category: "registration",
      severity: "required",
      title: "개인·법인 사업 형태 결정",
      reason: "세금, 책임 범위, 투자·지원사업 자격, 설립비용이 달라집니다.",
      actions: ["예상 매출·이익과 공동창업 여부 확인", "투자 유치 계획 확인", "개인/법인 비교 후 확정"],
      authority: "국세청·대한민국 법원 인터넷등기소",
      sourceUrl: NTS_REGISTRATION,
    }));
  }

  if (["soho", "shared_office"].includes(setup.workplaceType)) {
    requirements.push(requirement({
      id: "office-address-eligibility",
      category: "location",
      severity: "required",
      title: "사업자등록 가능한 오피스인지 확인",
      reason: "비상주·공유오피스는 계약과 업종에 따라 사업자등록 또는 인허가가 제한될 수 있습니다.",
      actions: ["해당 주소의 사업자등록 가능 업종 확인", "전대차·사용승낙 구조와 계약기간 확인", "우편물·실사 대응 조건 확인"],
      authority: "관할 세무서·오피스 운영사",
      sourceUrl: NTS_REGISTRATION,
    }));
  }

  if (setup.workplaceType === "home") {
    requirements.push(requirement({
      id: "home-business-address",
      category: "location",
      severity: "verify",
      title: "자택 사업장 사용 가능성 확인",
      reason: "임대차계약, 공동주택 관리규약, 업종과 고객 방문 여부에 따라 제한될 수 있습니다.",
      actions: ["임대차계약과 임대인 동의 필요 여부 확인", "고객 방문·재고 보관·소음 발생 여부 확인", "관할 세무서 제출서류 확인"],
      authority: "관할 세무서·임대인·관리사무소",
      sourceUrl: NTS_REGISTRATION,
    }));
  }

  if (["commercial_lease", "factory"].includes(setup.workplaceType)) {
    requirements.push(requirement({
      id: "building-use-check",
      category: "location",
      severity: "required",
      title: "계약 전 건축물 용도·권리관계 확인",
      reason: "희망 업종에 맞지 않는 건축물은 인허가나 사업자등록이 거절될 수 있습니다.",
      actions: [
        "등기부·건축물대장·토지이용계획 확인",
        "지번·소유자·근저당과 희망 업종에 맞는 건축물 용도 확인",
        "보증금·월세·관리비·권리금·원상복구·중개보수 총비용 비교",
        "인허가 가능 확인 전 계약금 지급 금지 특약 검토",
      ],
      authority: "정부24·관할 지자체·등기소",
      sourceUrl: EASYLAW_LEASE,
    }));
  }

  if (setup.onlineSales || setup.archetype === "ecommerce") {
    requirements.push(
      requirement({
        id: "mail-order-sales",
        category: "commerce",
        severity: "required",
        title: "통신판매 관련 신고·표시사항 확인",
        reason: "온라인으로 재화·서비스를 판매하면 통신판매업 신고와 사업자 표시 의무가 적용될 수 있습니다.",
        actions: ["통신판매업 신고 대상 여부 확인", "사업자정보·가격·환불·배송 조건 표시", "구매안전서비스 적용 여부 확인"],
        authority: "정부24·공정거래위원회·관할 지자체",
        sourceUrl: GOV_KR,
      }),
      requirement({
        id: "ecommerce-terms",
        category: "commerce",
        severity: "required",
        title: "이용약관·환불·취소 정책 준비",
        reason: "온라인 판매는 거래 조건과 청약철회·환불 기준을 고객이 결제 전에 확인할 수 있어야 합니다.",
        actions: ["상품·서비스별 제공 범위와 완료 기준 정의", "취소·환불·배송·분쟁 처리 정책 작성", "결제 전 동의와 정책 버전 기록"],
        authority: "공정거래위원회",
        sourceUrl: EASYLAW_ECOMMERCE,
      }),
    );
  }

  if (setup.handlesPersonalData) {
    requirements.push(requirement({
      id: "privacy-policy",
      category: "privacy",
      severity: "required",
      title: "개인정보 수집·처리 체계 준비",
      reason: "문의·회원·결제 정보를 수집하면 처리 목적, 보유기간, 파기, 위탁 등을 고지해야 합니다.",
      actions: ["최소 수집 항목과 보유기간 정의", "개인정보처리방침 공개", "수집 동의·위탁사·파기 절차 기록", "접근권한과 유출 대응 절차 설정"],
      authority: "개인정보보호위원회",
      sourceUrl: EASYLAW_ECOMMERCE,
    }));
  }

  if (setup.employeeCount > 0 || setup.financial.monthlyFixed.payrollGross > 0) {
    requirements.push(requirement({
      id: "labor-and-insurance",
      category: "labor",
      severity: "required",
      title: "고용·급여·사회보험 준비",
      reason: "직원을 고용하면 근로계약, 임금대장, 원천세와 사회보험 의무를 확인해야 합니다.",
      actions: ["서면 근로계약서와 근무·휴게시간 확정", "급여·원천세·퇴직급여 비용 반영", "4대보험 가입 대상과 신고기한 확인"],
      authority: "고용노동부·4대사회보험 정보연계센터",
      sourceUrl: FOUR_INSURANCE,
    }));
  }

  if (setup.importsOrExports) {
    requirements.push(requirement({
      id: "trade-readiness",
      category: "operations",
      severity: "verify",
      title: "수출입·통관·인증 확인",
      reason: "품목과 국가에 따라 통관, 원산지, 안전·표시 인증과 세금이 달라집니다.",
      actions: ["HS코드와 수입·수출 요건 확인", "관세·부가세·운송·통관비 재무 반영", "제품 인증·표시·원산지 의무 확인"],
      authority: "관세청·관련 인증기관",
      sourceUrl: "https://www.customs.go.kr",
    }));
  }

  if (setup.archetype === "manufacturing") {
    requirements.push(requirement({
      id: "manufacturing-site",
      category: "permit",
      severity: "verify",
      title: "제조시설·공장등록·제품인증 확인",
      reason: "제조시설 규모, 입지와 제품 종류에 따라 공장등록·환경·안전·제품 인증이 필요할 수 있습니다.",
      actions: ["생산 공정과 설비·전력·폐기물 정의", "공장등록과 입지 가능 여부 관할 지자체 확인", "KC·식품·화학 등 제품별 인증 여부 확인"],
      authority: "관할 지자체·제품별 인증기관",
      sourceUrl: EASYLAW_STARTUP,
    }));
  }

  const text = setup.sectorKeywords.join(" ");
  const regulatedRules = [
    {
      id: "food-permit",
      keywords: /식품|음식|카페|제과|주류/,
      title: "식품위생·영업신고 선행 확인",
      authority: "관할 지자체 위생부서",
      actions: ["정확한 영업 종류 판정", "건축물 용도·시설기준·위생교육 확인", "영업신고 완료 전 판매 개시 금지"],
    },
    {
      id: "medical-license",
      keywords: /의료|약국|복약|치료|진단|건강정보/,
      title: "의료·약사·건강정보 규제 선행 확인",
      authority: "보건복지부·식품의약품안전처·관할 보건소",
      actions: ["면허가 필요한 행위와 일반 정보서비스 경계 확인", "의료광고·건강정보 처리 범위 확인", "관할기관 확인 전 서비스·광고 공개 금지"],
    },
    {
      id: "finance-license",
      keywords: /금융|대출|투자|보험|자산관리/,
      title: "금융업 등록·중개·광고 규제 선행 확인",
      authority: "금융위원회·금융감독원",
      actions: ["금융상품 판매·중개·자문 해당 여부 확인", "등록·제휴·광고심의 필요 여부 확인", "확인 전 고객 자금 취급 금지"],
    },
    {
      id: "education-permit",
      keywords: /학원|교습|교육원|과외/,
      title: "학원·교습소 신고 여부 선행 확인",
      authority: "관할 교육지원청",
      actions: ["교육 형태와 대상에 따른 신고 유형 확인", "시설·강사·수강료 표시 기준 확인", "신고 완료 전 모집·수업 개시 금지"],
    },
    {
      id: "beauty-permit",
      keywords: /미용|네일|피부관리|숙박|목욕/,
      title: "공중위생업 신고·시설기준 선행 확인",
      authority: "관할 지자체 위생부서",
      actions: ["정확한 업종과 면허·자격 확인", "건축물 용도·시설기준 확인", "영업신고 완료 전 운영 금지"],
    },
  ];

  for (const rule of regulatedRules) {
    if (!rule.keywords.test(text)) continue;
    requirements.push(requirement({
      id: rule.id,
      category: "permit",
      severity: "blocked",
      title: rule.title,
      reason: "자격·시설·영업행위에 따라 위법 여부가 달라 자동 추정만으로 진행할 수 없는 고위험 업종입니다.",
      actions: rule.actions,
      authority: rule.authority,
      sourceUrl: EASYLAW_STARTUP,
    }));
  }

  if (setup.archetype === "regulated" && !requirements.some((item) => item.severity === "blocked")) {
    requirements.push(requirement({
      id: "regulated-manual-classification",
      category: "permit",
      severity: "blocked",
      title: "정확한 인허가 업종 분류가 필요합니다",
      reason: "현재 사업 설명만으로 필요한 면허·등록·신고를 확정할 수 없습니다.",
      actions: ["제공 행위·상품·고객·장소를 상세 정의", "관련 관할기관에 사전 질의", "공식 답변과 필요 서류를 프로젝트에 기록"],
      authority: "관할 지자체·업종별 주무기관",
      sourceUrl: EASYLAW_STARTUP,
    }));
  }

  return requirements;
}

export function assessBusinessSetup(setup: BusinessSetup): BusinessAssessment {
  const requirements = evaluateKoreanRequirements(setup);
  return {
    archetype: setup.archetype,
    financial: calculateFinancialAnalysis(setup.financial),
    requirements,
    hardBlockCount: requirements.filter((item) => item.severity === "blocked").length,
    requiredCount: requirements.filter((item) => item.severity === "required").length,
    generatedAt: new Date().toISOString(),
    rulesVersion: "kr-startup-rules-2026.07-v1",
  };
}
