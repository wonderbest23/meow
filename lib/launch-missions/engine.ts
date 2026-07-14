import type {
  LaunchMission,
  LaunchMissionContext,
  LaunchMissionProgress,
  LaunchMissionWorkspace,
  SpaceQuote,
} from "./domain";

const sources = {
  ntsRegistration: {
    label: "개인사업자 사업자등록 안내",
    authority: "국세청",
    url: "https://sc.nts.go.kr/nts/ad/cntnts/cntntsView.do?mi=2445",
  },
  ntsCalendar: {
    label: "세무일정",
    authority: "국세청",
    url: "https://www.nts.go.kr/nts/ad/taxSchdul/selectList.do",
  },
  hometax: {
    label: "전자신고·민원",
    authority: "국세청 홈택스",
    url: "https://www.hometax.go.kr/",
  },
  buildingLedger: {
    label: "건축물대장 발급·열람",
    authority: "정부24",
    url: "https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=15000000098&Mcode=10205&tp_seq=01",
  },
  registry: {
    label: "부동산 등기 열람",
    authority: "대한민국 법원 인터넷등기소",
    url: "https://www.iros.go.kr/",
  },
  kipris: {
    label: "상표 검색",
    authority: "특허정보검색서비스 KIPRIS",
    url: "https://www.kipris.or.kr/",
  },
  privacy: {
    label: "개인정보보호 종합포털",
    authority: "개인정보보호위원회",
    url: "https://www.privacy.go.kr/",
  },
  fourInsurance: {
    label: "4대사회보험 신고",
    authority: "4대사회보험 정보연계센터",
    url: "https://www.4insure.or.kr/",
  },
  moel: {
    label: "근로계약·노동관계 안내",
    authority: "고용노동부",
    url: "https://www.moel.go.kr/",
  },
  kstartup: {
    label: "창업지원사업 공고",
    authority: "K-Startup",
    url: "https://www.k-startup.go.kr/web/main/index.do",
  },
  bizinfo: {
    label: "기업지원사업 공고",
    authority: "기업마당",
    url: "https://www.bizinfo.go.kr/",
  },
  consumer: {
    label: "소비자상담·분쟁 기준",
    authority: "1372 소비자상담센터",
    url: "https://www.ccn.go.kr/",
  },
} as const;

function mission(value: LaunchMission): LaunchMission {
  return value;
}

export function buildLaunchMissions(context: LaunchMissionContext): LaunchMission[] {
  const workplaceNeedsContract = context.workplaceType !== "home";
  const needsBuildingCheck = ["commercial_lease", "factory"].includes(context.workplaceType);
  const needsPermitReview = context.hasPermitBlocker || ["manufacturing", "regulated", "local_retail"].includes(context.archetype);
  const missions: LaunchMission[] = [
    mission({
      id: "customer-evidence",
      phase: "validate",
      period: "원할 때",
      dueOffsetDays: 3,
      title: "아는 사람이 없어도 가능한 고객 확인",
      summary: "이 단계는 시험이 아닙니다. 실제 해결 방법을 조금만 알면 필요 없는 기능과 비용을 줄일 수 있습니다.",
      requirement: "required",
      estimatedMinutes: 20,
      costGuide: "0원",
      stopGate: false,
      dependencies: [],
      actions: [
        "연락할 사람이 있으면 1명에게 최근 비슷한 문제를 어떻게 해결했는지만 짧게 물어보세요.",
        "연락할 사람이 없으면 공개 후기·카페·지식인에서 같은 문제 사례 3개를 찾아도 됩니다.",
        "둘 다 어렵다면 지금은 확인할 사람이 없다고 남기고 넘어가세요. 첫 문의가 생기면 그때 보완하면 됩니다.",
      ],
      completionEvidence: "대화 메모 1건, 공개 사례 주소, 또는 '현재 확인 자료 없음' 메모 중 하나",
      output: "초기 고객 확인 메모",
      sources: [],
    }),
    mission({
      id: "offer-boundary",
      phase: "validate",
      period: "D+4",
      dueOffsetDays: 4,
      title: "첫 상품의 가격·범위·환불 기준 확정",
      summary: "한 번에 팔 수 있는 가장 작은 상품으로 범위를 고정합니다.",
      requirement: "required",
      estimatedMinutes: 60,
      costGuide: "0원",
      stopGate: true,
      dependencies: ["customer-evidence"],
      actions: [
        "고객이 받는 결과, 제공 횟수, 완료 시점을 한 문장씩 씁니다.",
        "판매가와 포함·불포함 항목을 나눕니다.",
        "취소 시점별 환불 기준과 지연·실패 시 대응을 씁니다.",
        "인터뷰 대상 2명에게 이 조건으로 결제 의향을 다시 확인합니다.",
      ],
      completionEvidence: "가격표 또는 견적서와 환불 기준 문서",
      output: "첫 상품 명세서",
      expertRole: "소비자거래 전문가",
      expertTrigger: "선결제·정기결제·장기계약이 있거나 환불 산정이 복잡할 때",
      sources: [sources.consumer],
    }),
    mission({
      id: "legal-form",
      phase: "validate",
      period: "D+4-D+5",
      dueOffsetDays: 5,
      title: "개인사업자·법인 선택 근거 기록",
      summary: context.legalForm === "undecided" ? "공동창업, 투자, 책임과 세금을 비교해 형태를 결정합니다." : `현재 선택한 ${context.legalForm === "corporation" ? "법인" : "개인사업자"}가 맞는지 한 번 더 확인합니다.`,
      requirement: "required",
      estimatedMinutes: 60,
      costGuide: "개인 직접신청은 등록 자체 비용 없음 · 법인은 설립비용 별도 견적",
      stopGate: true,
      dependencies: [],
      actions: [
        "공동창업자·지분·외부투자 계획 유무를 적습니다.",
        "예상 연매출과 이익, 대표 개인 책임을 비교합니다.",
        "지원사업 신청 주체와 필요한 업력 조건을 확인합니다.",
        "결론과 결정 이유를 3줄로 남깁니다.",
      ],
      completionEvidence: "선택 형태, 결정 이유, 확인자 또는 상담 기록",
      output: "사업형태 결정표",
      expertRole: "세무사·법무사",
      expertTrigger: "공동창업, 투자유치, 지분, 큰 초기투자 또는 업종상 책임위험이 있을 때",
      sources: [sources.ntsRegistration],
    }),
    mission({
      id: "location-need",
      phase: "place",
      period: "D+5",
      dueOffsetDays: 5,
      title: "사업장이 정말 필요한지 먼저 판정",
      summary: "주소만 필요한지, 고객 방문·재고·시설·인허가가 필요한지 구분합니다.",
      requirement: "required",
      estimatedMinutes: 30,
      costGuide: "0원",
      stopGate: true,
      dependencies: ["offer-boundary", "legal-form"],
      actions: [
        "고객 방문, 직원 근무, 재고 보관, 제조·조리, 간판 필요 여부를 각각 표시합니다.",
        "주소 공개와 우편 수령, 현장확인 가능 여부를 적습니다.",
        "주소만 필요하다면 자택·비상주 후보를, 시설이 필요하면 실제 공간 후보를 비교합니다.",
        "가격보다 업종 등록·인허가 가능 여부를 먼저 확인합니다.",
      ],
      completionEvidence: "필요 기능 체크표와 선택한 사업장 유형",
      output: "사업장 요구조건표",
      sources: [sources.ntsRegistration],
    }),
  ];

  if (workplaceNeedsContract) {
    missions.push(mission({
      id: "space-quotes",
      phase: "place",
      period: "D+6-D+8",
      dueOffsetDays: 8,
      title: "비상주·공유·임대 후보 3곳 총비용 비교",
      summary: "월 광고가격이 아니라 부가세, 관리비, 우편, 설치비와 계약기간까지 월 환산합니다.",
      requirement: "required",
      estimatedMinutes: 120,
      costGuide: "후보별 직접 입력 · 최저가 자동 비교",
      stopGate: true,
      dependencies: ["location-need"],
      actions: [
        "같은 조건으로 후보 3곳에 서면 견적을 요청합니다.",
        "보증금, 월 이용료, 부가세, 관리비, 우편비, 가입비, 최소 계약기간을 모두 입력합니다.",
        "해당 업종 등록 가능, 전대차·사용승낙, 우편·실사 대응을 확인합니다.",
        "중도해지·환불·자동연장 조항을 읽고 견적 또는 계약서 증빙을 붙입니다.",
      ],
      completionEvidence: "조건이 모두 적힌 후보 3곳 견적 또는 계약서 링크",
      output: "사업장 3안 총비용 비교표",
      expertRole: "관할 세무서·지자체 인허가 부서",
      expertTrigger: "오피스가 업종 등록 가능 여부를 구두로만 답하거나 전대차 구조가 불명확할 때",
      sources: [sources.ntsRegistration],
    }));
  }

  if (needsBuildingCheck) {
    missions.push(mission({
      id: "building-rights",
      phase: "place",
      period: "D+7-D+9",
      dueOffsetDays: 9,
      title: "계약 전 건축물 용도·소유자·권리 확인",
      summary: "계약금 전에 주소, 소유자, 건축물 용도, 근저당과 업종 적합성을 대조합니다.",
      requirement: "conditional",
      estimatedMinutes: 90,
      costGuide: "정부24 인터넷 발급·열람 무료 항목 있음 · 등기열람 수수료 별도",
      stopGate: true,
      dependencies: ["space-quotes"],
      actions: [
        "건축물대장에서 주소·층·호수·주용도와 위반건축물 표시를 확인합니다.",
        "등기부에서 소유자와 계약 상대방이 같은지, 보증금 위험이 있는지 확인합니다.",
        "관할 지자체에 정확한 영업행위와 주소를 말하고 인허가 가능 여부를 확인합니다.",
        "확인 전 계약금 지급 금지 또는 인허가 불가 시 해제 특약을 검토합니다.",
      ],
      completionEvidence: "발급일이 보이는 건축물대장·등기 확인 기록·관할기관 답변",
      output: "계약 전 권리·용도 확인표",
      expertRole: "공인중개사·법무사·관할 지자체",
      expertTrigger: "소유자 불일치, 위반건축물, 높은 선순위 권리, 용도 불일치가 있을 때",
      sources: [sources.buildingLedger, sources.registry],
    }));
  }

  missions.push(mission({
    id: "address-eligibility",
    phase: "place",
    period: "D+8-D+10",
    dueOffsetDays: 10,
    title: context.workplaceType === "home" ? "자택 주소 사용 가능 여부 확인" : "사업자등록·실사 가능한 주소 확정",
    summary: "계약서 문구와 관할기관 확인을 함께 남깁니다.",
    requirement: "required",
    estimatedMinutes: 60,
    costGuide: "확인 자체 0원",
    stopGate: true,
    dependencies: [workplaceNeedsContract ? "space-quotes" : "location-need"],
    actions: context.workplaceType === "home" ? [
      "임대차계약, 임대인 동의, 공동주택 관리규약을 확인합니다.",
      "고객 방문·재고·소음·간판이 생기는지 확인합니다.",
      "관할 세무서에 업종과 자택 주소의 제출서류를 확인합니다.",
    ] : [
      "계약 주체, 주소, 호수, 계약기간과 실제 사용권을 대조합니다.",
      "해당 업종 사업자등록 가능 여부를 관할 세무서에 확인합니다.",
      "우편 수령, 현장확인, 주소 변경·계약 종료 때 처리 조건을 확인합니다.",
    ],
    completionEvidence: "관할기관 확인일·담당부서와 계약서 또는 사용승낙 증빙",
    output: "사업장 적합 확인서",
    expertRole: "관할 세무서",
    expertTrigger: "임대인 동의, 전대차, 업종 가능 여부 중 하나라도 불명확할 때",
    sources: [sources.ntsRegistration],
  }));

  if (needsPermitReview) {
    missions.push(mission({
      id: "permit-precheck",
      phase: "place",
      period: "계약 전",
      dueOffsetDays: 10,
      title: "인허가·자격·시설기준 사전답변 확보",
      summary: "사업 설명만으로 자동 확정하지 않고 담당 기관의 답변을 받습니다.",
      requirement: "conditional",
      estimatedMinutes: 120,
      costGuide: "사전문의 0원 · 대행·설계·검사 비용은 업종별 견적",
      stopGate: true,
      dependencies: ["location-need"],
      actions: [
        "판매할 상품·행위, 고객, 제공 장소와 장비를 구체적으로 씁니다.",
        "허가·등록·신고·자격·교육·시설기준을 관할부서에 질의합니다.",
        "필요 서류, 처리기간, 수수료와 선행 순서를 기록합니다.",
        "공식 답변 전에는 계약금, 내부 공사, 광고 집행을 멈춥니다.",
      ],
      completionEvidence: "담당기관·담당부서·확인일·답변 내용과 필요서류 목록",
      output: "인허가 사전확인 기록",
      expertRole: "업종별 관할기관·행정사",
      expertTrigger: "담당부서 답변이 엇갈리거나 시설기준 해석이 필요한 경우",
      sources: [sources.buildingLedger],
    }));
  }

  missions.push(
    mission({
      id: "location-contract",
      phase: "place",
      period: "D+10-D+12",
      dueOffsetDays: 12,
      title: workplaceNeedsContract ? "검증된 조건으로 사업장 계약" : "사업장 주소와 사용 근거 확정",
      summary: "가격만 보고 계약하지 않고 앞 단계 증빙이 모두 끝난 후보를 선택합니다.",
      requirement: "required",
      estimatedMinutes: 90,
      costGuide: workplaceNeedsContract ? "선택 견적 기준" : "0원 또는 임대인 협의",
      stopGate: true,
      dependencies: [
        "address-eligibility",
        ...(needsBuildingCheck ? ["building-rights"] : []),
        ...(needsPermitReview ? ["permit-precheck"] : []),
      ],
      actions: [
        "주소, 계약 당사자, 기간, 총비용, 갱신·해지 조건을 최종 대조합니다.",
        "사업자등록·인허가 불가 시 해제 또는 환불 조건을 확인합니다.",
        "계약서와 이체증, 세금계산서·현금영수증 발행 조건을 보관합니다.",
      ],
      completionEvidence: "서명 계약서 또는 자택 사용 근거와 비용 증빙",
      output: "사업장 확정 기록",
      sources: [sources.ntsRegistration, sources.buildingLedger],
    }),
    mission({
      id: "business-registration",
      phase: "register",
      period: "D+12-D+14",
      dueOffsetDays: 14,
      title: "사업자등록 신청과 업종코드 확인",
      summary: "임대차·인허가 서류를 갖춘 뒤 홈택스 또는 세무서에서 신청합니다.",
      requirement: "required",
      estimatedMinutes: 90,
      costGuide: "신청 자체 0원 · 증명·대행 비용 별도",
      stopGate: true,
      dependencies: ["location-contract", "legal-form"],
      actions: [
        "사업자등록신청서와 대표자 신분 확인 수단을 준비합니다.",
        "임차 시 임대차계약서 사본, 공동사업이면 동업계약서를 준비합니다.",
        "허가·등록·신고 업종은 허가증 사본 또는 신청서·사업계획서를 준비합니다.",
        "업태·종목과 업종코드가 실제 매출 활동을 설명하는지 확인합니다.",
      ],
      completionEvidence: "접수증 또는 사업자등록증과 등록 업종 확인",
      output: "사업자등록 증빙",
      expertRole: "세무사·관할 세무서",
      expertTrigger: "복수 업종, 면세·과세 혼합, 해외 거래 또는 법인인 경우",
      sources: [sources.ntsRegistration, sources.hometax],
    }),
    mission({
      id: "tax-profile",
      phase: "register",
      period: "등록 직후",
      dueOffsetDays: 15,
      title: "과세유형·증빙·셀프신고 기준 설정",
      summary: "일반/간이, 과세/면세, 개인/법인, 고용 여부에 맞춰 신고표를 만듭니다.",
      requirement: "required",
      estimatedMinutes: 90,
      costGuide: "셀프 확인 0원 · 기장·신고 대행은 업무범위별 견적",
      stopGate: true,
      dependencies: ["business-registration"],
      actions: [
        "사업자등록증의 과세유형과 업종을 확인합니다.",
        "매출·매입 증빙 수집 위치와 월 마감일을 정합니다.",
        "부가세, 원천세, 종합소득세 또는 법인세 적용 여부를 표에 표시합니다.",
        "해외거래·복수사업장·면세 혼합·고용이 있으면 세무사 확인을 예약합니다.",
      ],
      completionEvidence: "사업자 유형별 신고 캘린더와 증빙 보관 위치",
      output: "맞춤 세무 캘린더",
      expertRole: "세무사",
      expertTrigger: "법인, 직원, 면세·과세 혼합, 해외거래, 중개 서비스 정산, 큰 설비투자 중 하나가 있을 때",
      sources: [sources.ntsCalendar, sources.hometax],
    }),
    mission({
      id: "finance-separation",
      phase: "register",
      period: "등록 직후",
      dueOffsetDays: 16,
      title: "사업용 계좌·카드·매출증빙 흐름 분리",
      summary: "개인 돈과 사업 돈이 섞이지 않도록 첫 거래 전에 통로를 나눕니다.",
      requirement: "required",
      estimatedMinutes: 60,
      costGuide: "금융기관·결제수단별 확인",
      stopGate: false,
      dependencies: ["business-registration"],
      actions: [
        "사업 전용 입출금 계좌와 카드를 정합니다.",
        "현금영수증·세금계산서·카드매출 발행 방법을 테스트합니다.",
        "매입 영수증을 월별 폴더 또는 회계도구에 모으는 규칙을 정합니다.",
        "대표자 가수금·개인사용 지출을 별도 기록합니다.",
      ],
      completionEvidence: "사업용 금융수단 목록과 1건의 테스트 증빙",
      output: "사업 자금 흐름표",
      sources: [sources.hometax],
    }),
  );

  if (context.onlineSales || context.archetype === "ecommerce") {
    missions.push(mission({
      id: "online-commerce",
      phase: "register",
      period: "온라인 판매 전",
      dueOffsetDays: 17,
      title: "통신판매 신고 대상·표시·환불 절차 확인",
      summary: "신고만이 아니라 판매 페이지 표시사항과 청약철회 흐름까지 점검합니다.",
      requirement: "conditional",
      estimatedMinutes: 120,
      costGuide: "지자체 신고 수수료·면허세 등 최신 금액 확인",
      stopGate: true,
      dependencies: ["business-registration", "offer-boundary"],
      actions: [
        "판매 방식과 거래 규모에 따라 신고 대상·예외 여부를 정부24 또는 지자체에 확인합니다.",
        "상호, 대표자, 주소, 연락처, 사업자번호와 거래조건 표시 위치를 확인합니다.",
        "취소·환불·배송·제공시점과 고객 동의 기록을 테스트합니다.",
        "구매안전서비스 적용 여부와 온라인 결제 정산 구조를 확인합니다.",
      ],
      completionEvidence: "신고증 또는 비대상 확인 기록과 결제 전 표시 화면",
      output: "온라인 판매 준수 체크",
      expertRole: "관할 지자체·1372",
      expertTrigger: "디지털콘텐츠, 예약서비스, 주문제작처럼 청약철회 예외를 적용하려는 경우",
      sources: [sources.consumer],
    }));
  }

  if (context.handlesPersonalData) {
    missions.push(mission({
      id: "privacy-flow",
      phase: "register",
      period: "고객정보 수집 전",
      dueOffsetDays: 17,
      title: "개인정보 수집·보유·삭제 흐름 실제 테스트",
      summary: "처리방침 문구만 두지 않고 문의 1건의 수집부터 삭제까지 실행합니다.",
      requirement: "conditional",
      estimatedMinutes: 90,
      costGuide: "직접 준비 0원 · 법률 검토 별도",
      stopGate: true,
      dependencies: ["offer-boundary"],
      actions: [
        "필수·선택 정보를 나누고 목적별 최소 항목만 남깁니다.",
        "보유기간, 파기, 제3자 제공, 처리위탁과 문의 방법을 적습니다.",
        "신청폼 동의 문구와 개인정보처리방침을 연결합니다.",
        "테스트 신청 1건을 열람·수정·삭제하고 기록을 남깁니다.",
      ],
      completionEvidence: "처리방침 인터넷 주소, 동의 화면, 시험 삭제 기록",
      output: "개인정보 처리 흐름 증빙",
      expertRole: "개인정보보호 전문가",
      expertTrigger: "민감정보, 아동정보, 위치정보, 건강정보 또는 대규모 회원정보를 처리할 때",
      sources: [sources.privacy],
    }));
  }

  missions.push(
    mission({
      id: "brand-message",
      phase: "brand",
      period: "D+15-D+17",
      dueOffsetDays: 17,
      title: "고객에게 보여줄 이름·한 줄 소개 문구 확정",
      summary: "멋있는 문구보다 고객, 결과, 차이를 한눈에 이해시키는 문장을 만듭니다.",
      requirement: "required",
      estimatedMinutes: 60,
      costGuide: "기본 제공 문서에 초안 포함",
      stopGate: false,
      dependencies: ["customer-evidence", "offer-boundary"],
      actions: [
        "고객이 부를 수 있는 짧은 이름 후보 3개를 만듭니다.",
        "누구에게 어떤 결과를 주는지 한 문장으로 씁니다.",
        "과장·보장·최고 표현을 빼고 한 줄 소개 문구 후보 3개를 비교합니다.",
        "실제 고객 3명에게 의미를 설명하지 않고 이해되는지 묻습니다.",
      ],
      completionEvidence: "선택 이름·한 줄 소개 문구와 고객 3명의 이해도 확인",
      output: "이름·소개 문구 모음",
      sources: [],
    }),
    mission({
      id: "trademark-search",
      phase: "brand",
      period: "이름 공개 전",
      dueOffsetDays: 18,
      title: "특허정보검색서비스에서 유사 상표와 인터넷 주소 확인",
      summary: "동일 이름뿐 아니라 유사 호칭과 같은 상품류를 함께 봅니다.",
      requirement: "required",
      estimatedMinutes: 60,
      costGuide: "검색 0원 · 출원·대리 비용 별도",
      stopGate: true,
      dependencies: ["brand-message"],
      actions: [
        "한글·영문·띄어쓰기·유사 발음으로 각각 검색합니다.",
        "판매 상품·서비스와 관련된 상품류의 선등록 상표를 확인합니다.",
        "내 서비스에 쓸 인터넷 주소와 주요 사회관계망 계정 이름을 사용할 수 있는지 확인합니다.",
        "유사 상표가 있으면 변리사에게 충돌 가능성을 확인하고 이름을 바꿉니다.",
      ],
      completionEvidence: "검색어·검색일·관련 상품류·검토 결과 캡처",
      output: "상표 선행검색 기록",
      expertRole: "변리사",
      expertTrigger: "같거나 비슷한 이름이 같은 상품류에서 발견됐을 때",
      sources: [sources.kipris],
    }),
    mission({
      id: "starter-logo",
      phase: "brand",
      period: "D+18",
      dueOffsetDays: 18,
      title: "임시 로고·색상·사용 규칙 제작",
      summary: "실행 화면에서 바로 쓸 수 있는 로고 초안을 만들고 상표 검토 전 임시임을 표시합니다.",
      requirement: "required",
      estimatedMinutes: 45,
      costGuide: "직접 제작 포함 · 전문 디자인 수정 선택",
      stopGate: false,
      dependencies: ["trademark-search"],
      actions: [
        "이름 글자형·첫 글자형·도장형 중 한 가지 모양을 선택합니다.",
        "대표색 1개와 흑백 버전을 확인합니다.",
        "작은 화면에서 이름이 읽히는지 확인합니다.",
        "상표 검토 전에는 대량 인쇄·간판 제작을 미룹니다.",
      ],
      completionEvidence: "선택 로고 그림 파일(SVG)과 대표색·한 줄 소개 문구 기록",
      output: "임시 로고 그림 파일(SVG)",
      expertRole: "로고·이름 전문 디자이너",
      expertTrigger: "간판, 포장재, 상표출원 또는 투자자료에 장기 사용하려는 경우",
      sources: [sources.kipris],
    }),
    mission({
      id: "landing-ready",
      phase: "brand",
      period: "D+18-D+20",
      dueOffsetDays: 20,
      title: "판매 페이지 문구·디자인·신청 흐름 확정",
      summary: "페이지 편집기에서 문구와 색을 고치고 휴대전화 신청까지 직접 시험합니다.",
      requirement: "required",
      estimatedMinutes: 120,
      costGuide: "기본 제공 기능에 편집·미리보기 포함",
      stopGate: true,
      dependencies: ["offer-boundary", "starter-logo"],
      actions: [
        "첫 화면에 고객, 문제, 결과, 신청 버튼이 모두 보이는지 확인합니다.",
        "가격·포함범위·환불·연락처·사업자 정보를 실제 값으로 바꿉니다.",
        "휴대전화에서 신청칸을 한 번 보내고 알림·저장 여부를 확인합니다.",
        "지인 3명에게 설명 없이 보여주고 무엇을 파는지 물어봅니다.",
      ],
      completionEvidence: "전체화면 미리보기 인터넷 주소 또는 화면 캡처와 시험 신청 기록",
      output: "판매 페이지",
      sources: [],
    }),
    mission({
      id: "pitch-deck",
      phase: "brand",
      period: "D+20",
      dueOffsetDays: 20,
      title: "10장 사업소개서 파워포인트 생성·사실 검토",
      summary: "고객문제, 해결, 상품, 시장근거, 수익, 실행계획을 소개자료로 만듭니다.",
      requirement: "required",
      estimatedMinutes: 60,
      costGuide: "파워포인트 파일(PPTX) 자동 생성 포함 · 전문 디자인 선택",
      stopGate: false,
      dependencies: ["landing-ready"],
      actions: [
        "자동 생성된 10장 자료를 내려받습니다.",
        "시장 숫자, 고객 인터뷰, 가격과 일정의 근거를 원문과 대조합니다.",
        "미확인 숫자는 가정 또는 확인 필요로 바꿉니다.",
        "고객용, 제휴용, 지원사업용 중 발표 목적을 표지에 적습니다.",
      ],
      completionEvidence: "검토 완료한 파워포인트 파일명과 수정 차수",
      output: "사업소개서 파워포인트 파일(PPTX)",
      sources: [],
    }),
    mission({
      id: "operations-rehearsal",
      phase: "launch",
      period: "D+20-D+23",
      dueOffsetDays: 23,
      title: "문의-결제-제공-환불 1건 전체 예행연습",
      summary: "확인표만 읽지 않고 실제 시험 주문 1건을 끝까지 처리합니다.",
      requirement: "required",
      estimatedMinutes: 180,
      costGuide: "시험 결제·재료비 실비",
      stopGate: true,
      dependencies: ["landing-ready", "finance-separation", "tax-profile"],
      actions: [
        "시험 고객이 판매 페이지에서 신청하게 합니다.",
        "접수, 견적·계약, 결제, 제공, 완료 안내와 증빙 발행을 순서대로 실행합니다.",
        "취소·환불 요청을 가정해 처리 시간과 담당자를 확인합니다.",
        "막힌 지점과 수정 담당자, 재시험 날짜를 기록합니다.",
      ],
      completionEvidence: "시험 주문번호, 단계별 시각, 발행 증빙과 개선 목록",
      output: "영업 시작 예행연습 기록",
      sources: [sources.consumer, sources.hometax],
    }),
    mission({
      id: "risk-insurance",
      phase: "launch",
      period: "영업 시작 전",
      dueOffsetDays: 23,
      title: "사고책임·보험·비상연락 기준 확정",
      summary: `핵심 위험 '${context.risk || "고객·제3자 손해"}'이 생겼을 때 대응 순서를 정합니다.`,
      requirement: "required",
      estimatedMinutes: 90,
      costGuide: "보장범위·매출·업종별 2곳 이상 견적",
      stopGate: true,
      dependencies: ["operations-rehearsal"],
      actions: [
        "사람·재산·정보·제품 사고 시 최악의 손실을 적습니다.",
        "배상책임, 생산물, 화재, 사이버 등 필요한 보장을 2곳 이상 문의합니다.",
        "면책, 자기부담, 보상한도와 실제 제공행위 포함 여부를 비교합니다.",
        "사고 시 중단, 응급조치, 기록, 신고, 고객안내 순서를 정합니다.",
      ],
      completionEvidence: "보험 필요성 판정, 견적 비교 또는 비가입 사유와 비상연락망",
      output: "사고 대응·보험 검토표",
      expertRole: "보험 전문가·업종별 법률 전문가",
      expertTrigger: "고객 신체, 아동·반려동물, 방문서비스, 고가 물품, 제조물 책임이 있는 경우",
      sources: [],
    }),
    mission({
      id: "marketing-plan",
      phase: "launch",
      period: "D+23-D+25",
      dueOffsetDays: 25,
      title: "첫 고객 경로 1개와 외주 상담 범위 결정",
      summary: "광고를 넓게 집행하지 않고 첫 고객이 있는 경로 하나를 검증합니다.",
      requirement: "required",
      estimatedMinutes: 90,
      costGuide: "첫 실험 예산 직접 설정 · 외주는 업무범위·성과물·매체비 분리 견적",
      stopGate: false,
      dependencies: ["landing-ready"],
      actions: [
        "고객 5명이 실제로 문제를 해결하려고 찾아간 경로 중 하나를 고릅니다.",
        "콘텐츠·직접제안·제휴·광고 중 7일 실험 방법과 예산 상한을 정합니다.",
        "외주 상담 시 기획비, 제작비, 매체비, 계정 소유권, 원본파일, 해지 조건을 분리합니다.",
        "문의수보다 상담, 결제, 고객획득비를 주간 지표로 정합니다.",
      ],
      completionEvidence: "고객 경로, 7일 예산, 목표, 중단기준과 외주 견적 또는 직접 실행 계획",
      output: "첫 고객 홍보 시험표",
      expertRole: "고객 홍보 실행팀",
      expertTrigger: "월 광고비가 커지거나 계정·고객 자료 소유권을 외주사가 보유하려는 경우",
      sources: [],
    }),
    mission({
      id: "first-paid-orders",
      phase: "launch",
      period: "D+25-D+30",
      dueOffsetDays: 30,
      title: "실제 유료 주문 3건과 거절 10건 기록",
      summary: "좋아요나 조회수가 아닌 결제와 거절 이유로 다음 결정을 내립니다.",
      requirement: "required",
      estimatedMinutes: 300,
      costGuide: "고객 홍보 시험 예산 내",
      stopGate: true,
      dependencies: ["operations-rehearsal", "risk-insurance", "marketing-plan"],
      actions: [
        "목표 고객에게 제안 20건을 보내고 응답을 기록합니다.",
        "결제 3건을 실제 제공하고 시간·원가·문제·만족도를 측정합니다.",
        "거절 10건을 가격, 신뢰, 필요성, 시기, 기능으로 분류합니다.",
        "공헌이익과 반복구매 신호가 없으면 공간·광고 추가지출을 중단하고 상품을 수정합니다.",
      ],
      completionEvidence: "주문·매출 증빙 3건 또는 실패 기록과 거절사유 10건",
      output: "첫 매출 검증 보고",
      sources: [],
    }),
    mission({
      id: "support-programs",
      phase: "launch",
      period: "매주 월요일",
      dueOffsetDays: 30,
      title: "K-Startup·기업마당 자격 맞는 공고만 검토",
      summary: "공고명보다 신청자격, 업력 기준일, 지역, 제외업종, 자부담을 먼저 확인합니다.",
      requirement: "optional",
      estimatedMinutes: 60,
      costGuide: "공고 확인·직접신청 0원 · 민간 대행은 선정 보장 금지",
      stopGate: false,
      dependencies: ["business-registration"],
      actions: [
        "사업자 형태, 개업일, 대표자 연령, 지역, 업종과 매출 상태를 정리합니다.",
        "K-Startup과 기업마당에서 자격조건에 맞는 공고만 저장합니다.",
        "마감일이 아니라 서류 발급·확인 시간을 고려해 내부 마감일을 7일 앞당깁니다.",
        "사업계획서 수치와 증빙이 원본과 같은지 제출 전 대조합니다.",
      ],
      completionEvidence: "공고 인터넷 주소, 자격 판정표, 내부 마감일 또는 비해당 기록",
      output: "지원사업 후보표",
      sources: [sources.kstartup, sources.bizinfo],
    }),
    mission({
      id: "monthly-close",
      phase: "operate",
      period: "매월 1-5일",
      dueOffsetDays: 35,
      title: "전월 매출·매입·계좌·카드 월 마감",
      summary: "신고 때 몰아서 찾지 않도록 매월 증빙과 실제 잔액을 맞춥니다.",
      requirement: "required",
      estimatedMinutes: 90,
      costGuide: "셀프 0원 · 기장 서비스 별도",
      stopGate: false,
      dependencies: ["finance-separation"],
      actions: [
        "전월 매출을 결제사·중개 서비스·계좌 입금과 대조합니다.",
        "세금계산서, 카드, 현금영수증, 기타 매입 증빙을 분류합니다.",
        "미수금, 환불, 대표자 입출금과 재고 차이를 기록합니다.",
        "신고 판단이 필요한 거래를 질문 목록으로 모읍니다.",
      ],
      completionEvidence: "전월 월마감표와 미해결 거래 목록",
      output: "월 결산 체크",
      sources: [sources.hometax],
    }),
    mission({
      id: "vat-calendar",
      phase: "operate",
      period: "분기 시작 시 확인",
      dueOffsetDays: 60,
      title: "부가가치세 대상기간·신고일 최신 확인",
      summary: "개인/법인·일반/간이·과세/면세에 따라 달라서 고정 날짜를 추정하지 않습니다.",
      requirement: "required",
      estimatedMinutes: 60,
      costGuide: "홈택스 셀프신고 0원 · 대행료 별도",
      stopGate: false,
      dependencies: ["tax-profile", "monthly-close"],
      actions: [
        "국세청 세무일정에서 해당 사업자 유형의 신고 대상과 날짜를 확인합니다.",
        "대상기간의 전자세금계산서, 카드, 현금영수증과 기타 증빙을 대조합니다.",
        "공제 불확실, 고정자산, 면세·과세 혼합, 대손·수출 거래를 별도 표시합니다.",
        "홈택스 신고서 미리보기와 납부계좌, 제출 접수증을 보관합니다.",
      ],
      completionEvidence: "확인한 신고기간·기한, 접수증 또는 비대상 근거",
      output: "분기 세금 신고 기록",
      expertRole: "세무사",
      expertTrigger: "공제 여부가 불확실하거나 수정신고·가산세 가능성이 있을 때",
      sources: [sources.ntsCalendar, sources.hometax],
    }),
    mission({
      id: "annual-tax",
      phase: "operate",
      period: context.legalForm === "corporation" ? "사업연도 종료 후" : "다음 해 5월 전",
      dueOffsetDays: 90,
      title: context.legalForm === "corporation" ? "법인 결산·법인세 일정 확정" : "종합소득세 결산자료 준비",
      summary: "연말까지 장부, 자산, 재고, 인건비와 대표자 거래를 정리합니다.",
      requirement: "required",
      estimatedMinutes: 120,
      costGuide: "셀프 가능 여부 판정 후 대행 범위 견적",
      stopGate: false,
      dependencies: ["monthly-close", "tax-profile"],
      actions: [
        "월마감 누락과 미수·미지급, 재고, 감가상각 자산을 정리합니다.",
        "인건비·외주비 지급명세와 원천세 자료를 대조합니다.",
        "사업자 유형과 사업연도에 맞는 정확한 신고기간을 국세청에서 확인합니다.",
        "복수소득, 법인, 성실신고, 세액감면·공제 판단은 세무사 검토를 받습니다.",
      ],
      completionEvidence: "결산 체크리스트와 신고 접수증 또는 세무대리 계약범위",
      output: "연간 세무 마감표",
      expertRole: "세무사",
      expertTrigger: "법인 또는 복수 사업·근로소득·부동산·해외소득이 함께 있는 경우",
      sources: [sources.ntsCalendar, sources.hometax],
    }),
  );

  if (context.employeeCount > 0) {
    missions.push(mission({
      id: "payroll-insurance",
      phase: "operate",
      period: "채용 전·매월",
      dueOffsetDays: 30,
      title: "근로계약·4대보험·급여·원천세 일정 운영",
      summary: "채용 전 서면계약부터 매월 급여·신고 증빙까지 한 흐름으로 관리합니다.",
      requirement: "conditional",
      estimatedMinutes: 120,
      costGuide: "급여·노무 대행은 인원과 업무범위별 견적",
      stopGate: true,
      dependencies: ["tax-profile"],
      actions: [
        "업무, 장소, 시간, 임금, 휴일과 계약기간을 서면으로 확정합니다.",
        "근로자성, 최저임금, 4대보험 적용과 취득신고 기한을 확인합니다.",
        "급여대장, 이체, 원천세, 지급명세서와 퇴직급여 자료를 월별 보관합니다.",
        "프리랜서 계약으로 임의 대체하지 말고 실제 지휘·근무형태를 기준으로 판단합니다.",
      ],
      completionEvidence: "근로계약 교부 확인, 보험 신고, 급여·원천세 운영표",
      output: "고용·급여 운영 문서",
      expertRole: "노무사·세무사",
      expertTrigger: "단시간, 일용, 프리랜서, 가족종사자, 외국인 고용이 있는 경우",
      sources: [sources.moel, sources.fourInsurance, sources.ntsCalendar],
    }));
  }

  const missionIds = new Set(missions.map((entry) => entry.id));
  return missions.map((entry) => ({
    ...entry,
    dependencies: entry.dependencies.filter((dependency) => missionIds.has(dependency)),
  }));
}

function defaultQuote(index: number, optionType: SpaceQuote["optionType"]): SpaceQuote {
  return {
    id: `quote-${index + 1}`,
    provider: "",
    optionType,
    depositWon: 0,
    monthlyRentWon: 0,
    monthlyMaintenanceWon: 0,
    monthlyMailWon: 0,
    setupFeeWon: 0,
    vatIncluded: false,
    contractMonths: 12,
    registrationEligible: false,
    industryApproved: false,
    subleaseConsentVerified: false,
    cancellationChecked: false,
    evidence: "",
  };
}

export function createLaunchMissionWorkspace(
  context: LaunchMissionContext,
  brandName: string,
  slogan: string,
): LaunchMissionWorkspace {
  const now = new Date();
  const nowIso = now.toISOString();
  return {
    schemaVersion: "kr-beginner-launch-v1",
    startDate: nowIso.slice(0, 10),
    missionProgress: {},
    spaceQuotes: [0, 1, 2].map((index) => defaultQuote(index, context.workplaceType)),
    brand: {
      brandName: brandName || context.title,
      slogan: slogan || "고객의 오늘을 더 쉽게 만드는 시작",
      markStyle: "wordmark",
      accentColor: "#0b7254",
    },
    selectedSupportOptions: [],
    updatedAt: nowIso,
  };
}

export function progressForMission(
  workspace: LaunchMissionWorkspace,
  missionId: string,
): LaunchMissionProgress {
  return workspace.missionProgress[missionId] ?? {
    status: "todo",
    evidence: "",
    note: "",
    updatedAt: workspace.updatedAt,
  };
}

export function missionDependenciesDone(
  mission: LaunchMission,
  workspace: LaunchMissionWorkspace,
) {
  return mission.dependencies.every(
    (dependency) => progressForMission(workspace, dependency).status === "done",
  );
}

export function nextReadyRequiredMission(
  missions: LaunchMission[],
  workspace: LaunchMissionWorkspace,
) {
  const pending = missions.filter(
    (mission) =>
      mission.requirement !== "optional" &&
      progressForMission(workspace, mission.id).status !== "done",
  );

  return pending.sort(
    (a, b) =>
      Number(missionDependenciesDone(b, workspace)) -
        Number(missionDependenciesDone(a, workspace)) ||
      a.dueOffsetDays - b.dueOffsetDays,
  )[0] ?? null;
}

export function quoteMonthlyTotal(quote: SpaceQuote) {
  const rentWithVat = quote.monthlyRentWon * (quote.vatIncluded ? 1 : 1.1);
  return Math.round(
    rentWithVat +
    quote.monthlyMaintenanceWon +
    quote.monthlyMailWon +
    quote.setupFeeWon / Math.max(1, quote.contractMonths),
  );
}

export function quoteIsContractReady(quote: SpaceQuote) {
  return Boolean(
    quote.provider.trim() &&
    quote.registrationEligible &&
    quote.industryApproved &&
    quote.subleaseConsentVerified &&
    quote.cancellationChecked &&
    quote.evidence.trim(),
  );
}

export function missionDueDate(startDate: string, offsetDays: number) {
  const date = new Date(`${startDate}T00:00:00`);
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}
