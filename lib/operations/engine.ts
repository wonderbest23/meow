import type { ComplianceRequirement } from "../business/domain";
import type { ProjectRecord } from "../service-domain";
import type {
  OpeningChecklistItem,
  OperationAsset,
  OperationSop,
  OperationsAssessment,
  OperationsPackage,
  OperationsWorkspace,
} from "./domain";
import { buildTaxCalendar, taxCalendarMarkdown } from "./tax-calendar";

function item(
  category: OpeningChecklistItem["category"],
  title: string,
  reason: string,
  required: boolean,
  officialUrl = "",
): OpeningChecklistItem {
  return {
    id: crypto.randomUUID(),
    category,
    title,
    reason,
    required,
    dueDate: "",
    status: "not_started",
    evidenceUrl: "",
    officialUrl,
  };
}

function asset(
  category: OperationAsset["category"],
  name: string,
  requiredBeforeLaunch = true,
): OperationAsset {
  return {
    id: crypto.randomUUID(),
    category,
    name,
    quantity: 1,
    estimatedUnitCost: 0,
    requiredBeforeLaunch,
    supplierQuoteId: null,
    status: "not_started",
    evidenceUrl: "",
    note: "실제 견적을 받은 뒤 금액과 공급처를 확정하세요.",
  };
}

function sop(
  title: string,
  trigger: string,
  steps: string[],
  failureResponse: string,
  frequency = "발생 시",
): OperationSop {
  return {
    id: crypto.randomUUID(),
    title,
    trigger,
    ownerRole: "대표자",
    frequency,
    steps,
    failureResponse,
    status: "not_started",
    evidenceUrl: "",
  };
}

function categoryFromRequirement(
  requirement: ComplianceRequirement,
): OpeningChecklistItem["category"] {
  const map: Record<ComplianceRequirement["category"], OpeningChecklistItem["category"]> = {
    registration: "registration",
    tax: "finance",
    location: "location",
    permit: "permit",
    privacy: "privacy",
    labor: "labor",
    commerce: "customer",
    operations: "launch",
  };
  return map[requirement.category];
}

export function createOperationsWorkspace(project: ProjectRecord): OperationsWorkspace {
  const setup = project.businessSetup;
  const archetype = setup?.archetype ?? "digital_service";
  const complianceItems = (project.businessAssessment?.requirements ?? []).map((requirement) =>
    item(
      categoryFromRequirement(requirement),
      requirement.title,
      requirement.reason,
      requirement.severity !== "verify",
      requirement.sourceUrl,
    ),
  );

  const assets: OperationAsset[] = [
    asset("software", "고객 문의·신청 관리 도구"),
    asset("safety", "업무 자료 백업 수단"),
  ];
  if (archetype === "ecommerce") {
    assets.push(
      asset("initial_inventory", "초도 판매 재고"),
      asset("packaging", "상품 포장재·배송 라벨"),
      asset("equipment", "송장·라벨 출력 장비"),
    );
  }
  if (archetype === "local_retail") {
    assets.push(
      asset("equipment", "매장 판매 관리·결제 단말기"),
      asset("initial_inventory", "영업 시작용 첫 재고"),
      asset("safety", "소화기·안전 표지"),
      asset("equipment", "간판·영업 안내물"),
    );
  }
  if (archetype === "professional_service") {
    assets.push(asset("software", "예약·일정 관리 도구"), asset("equipment", "현장 서비스 기본 장비"));
  }
  if (archetype === "manufacturing") {
    assets.push(
      asset("equipment", "생산 핵심 장비"),
      asset("safety", "산업안전 보호구"),
      asset("initial_inventory", "원부자재 초도분"),
      asset("equipment", "검수·품질 측정 도구"),
    );
  }
  if (archetype === "regulated") {
    assets.push(asset("safety", "법정 안전·위생 장비"), asset("software", "법정 기록·보관 도구"));
  }

  const sops: OperationSop[] = [
    sop(
      "신규 신청 접수",
      "판매 페이지 또는 전화로 신규 문의가 들어왔을 때",
      ["신청 시각과 연락처를 기록한다.", "수집 동의 범위와 요청 내용을 확인한다.", "정해진 응답시간 안에 접수 안내를 보낸다.", "다음 행동과 담당자를 기록한다."],
      "연락처 오류 또는 동의 누락 시 추가 이용을 중단하고 기록만 보존기간에 따라 처리합니다.",
    ),
    sop(
      "주문·서비스 제공",
      "고객이 구매 또는 진행에 동의했을 때",
      ["제공 범위·가격·일정을 서면으로 확인한다.", "결제와 증빙 발행 여부를 확인한다.", "진행 상태를 고객에게 안내한다.", "완료 결과와 인수 확인을 기록한다."],
      "일정 또는 품질 문제가 생기면 즉시 고객에게 알리고 대안·환불 기준을 적용합니다.",
    ),
    sop(
      "불만·환불 접수",
      "고객이 취소, 교환, 환불 또는 불만을 제기했을 때",
      ["주문·계약과 요청 내용을 확인한다.", "게시된 환불정책과 관련 법정 기준을 확인한다.", "처리 방법과 기한을 고객에게 알린다.", "처리 결과와 재발 방지 조치를 기록한다."],
      "분쟁 가능성이 있으면 임의 확답을 중단하고 1372 또는 전문 자문 기준을 확인합니다.",
    ),
    sop(
      "개인정보 요청·사고 대응",
      "열람·삭제 요청 또는 유출 의심 상황이 발생했을 때",
      ["요청자와 대상 정보를 확인한다.", "불필요한 접근과 처리를 즉시 중단한다.", "처리 내역과 영향을 기록한다.", "법정 신고·통지 필요성을 공식 기준으로 확인한다."],
      "유출 의심 시 자료를 임의 삭제하지 말고 접근 차단·증거 보존 후 개인정보보호위원회 절차를 확인합니다.",
    ),
  ];
  if (["ecommerce", "local_retail", "manufacturing"].includes(archetype)) {
    sops.push(sop(
      "재고 입출고·실사",
      "상품·원재료가 입고되거나 출고될 때",
      ["수량·품질·유통기한을 검수한다.", "입출고 수량과 원가를 기록한다.", "불량·폐기·반품을 분리 기록한다.", "장부와 실제 재고 차이를 확인한다."],
      "재고 차이가 나면 출고를 잠시 멈추고 최근 거래와 불량·폐기 기록부터 대조합니다.",
      "입출고 시·주 1회",
    ));
  }
  if (archetype === "local_retail") {
    sops.push(sop(
      "매장 오픈·마감",
      "매일 영업 시작 전과 종료 후",
      ["시설·안전·위생 상태를 점검한다.", "현금·결제 단말과 예약을 확인한다.", "영업 시작 또는 마감 확인을 기록한다.", "이상 사항과 조치 담당자를 남긴다."],
      "안전·위생 필수 항목에 이상이 있으면 영업을 시작하지 않고 조치 후 재확인합니다.",
      "매 영업일",
    ));
  }
  if (["manufacturing", "regulated"].includes(archetype)) {
    sops.push(sop(
      "품질·법정 기록 검수",
      "제품 생산 또는 규제 대상 서비스를 제공할 때",
      ["적용 기준과 허용 범위를 확인한다.", "로트·담당자·검수 결과를 기록한다.", "부적합 결과를 분리하고 출고를 막는다.", "시정조치와 재검수 결과를 보존한다."],
      "부적합 또는 기록 누락 시 제공·출고를 중단하고 책임자 확인 후 재개합니다.",
      "매 생산·제공 건",
    ));
  }

  const checklist: OpeningChecklistItem[] = [
    ...complianceItems,
    item("finance", "사업용 계좌·카드와 증빙 흐름 분리", "개인 지출과 사업 지출을 분리해야 실제 손익과 세무 증빙을 관리할 수 있습니다.", true, "https://www.nts.go.kr/"),
    item("supplier", "핵심 공급처 2곳 이상 견적 비교", "단일 공급처 가격·납기 문제에 대비하고 실제 원가를 확정해야 합니다.", assets.length > 0),
    item("customer", "가격·제공범위·취소·환불정책 게시", "고객과의 분쟁을 줄이고 전자상거래 관련 표시 의무를 확인해야 합니다.", true, "https://www.law.go.kr/법령/전자상거래등에서의소비자보호에관한법률"),
    item("privacy", "개인정보 수집 동의·보유기간·삭제 절차 검증", "신청폼과 고객관리 과정의 개인정보를 목적 범위 안에서 처리해야 합니다.", setup?.handlesPersonalData ?? true, "https://www.privacy.go.kr/"),
    item("launch", "실제 주문 1건 전체 예행연습", "신청부터 제공·증빙·환불까지 끊기는 지점을 영업 시작 전에 발견해야 합니다.", true),
    item("safety", "사고·장애·고객 분쟁 비상연락망 확정", "사고 발생 시 임의 대응하지 않고 정해진 순서로 처리해야 합니다.", true),
  ];

  const workerCount = setup?.employeeCount ?? 0;
  if (workerCount > 0) {
    checklist.push(
      item("labor", "서면 근로계약서 교부", "임금·근로시간·휴일 등 근로조건을 서면으로 명시하고 교부해야 합니다.", true, "https://www.moel.go.kr/"),
      item("labor", "임금·출퇴근·4대보험 처리 예행연습", "고용 형태에 맞는 급여와 사회보험 처리를 실제 일정으로 확인해야 합니다.", true, "https://www.4insure.or.kr/"),
    );
  }

  const insurance = [
    {
      id: crypto.randomUUID(),
      name: "영업·배상책임 위험 검토",
      reason: "고객·제3자에게 발생할 수 있는 신체·재산 손해의 보장 필요성을 확인합니다.",
      required: ["local_retail", "professional_service", "manufacturing", "regulated"].includes(archetype),
      status: "not_started" as const,
      evidenceUrl: "",
      officialUrl: "https://fine.fss.or.kr/",
    },
  ];
  if (["ecommerce", "manufacturing"].includes(archetype)) {
    insurance.push({
      id: crypto.randomUUID(),
      name: "생산물배상책임 위험 검토",
      reason: "판매·제조한 제품으로 인한 손해와 리콜 위험의 보장 범위를 확인합니다.",
      required: archetype === "manufacturing",
      status: "not_started",
      evidenceUrl: "",
      officialUrl: "https://fine.fss.or.kr/",
    });
  }
  if (workerCount > 0) {
    insurance.push({
      id: crypto.randomUUID(),
      name: "근로자 사회보험 적용 확인",
      reason: "고용 형태와 근로시간에 따른 4대보험 적용 여부를 확인합니다.",
      required: true,
      status: "not_started",
      evidenceUrl: "",
      officialUrl: "https://www.4insure.or.kr/",
    });
  }

  return {
    supplierQuotes: [],
    assets,
    sops,
    openingChecklist: checklist,
    policies: {
      customerSupportChannel: "판매 페이지 신청 이메일",
      responseTimeHours: 24,
      refundPolicy: "제공 전 취소는 전액 환불하고, 제공 시작 후에는 완료 범위와 실제 발생 비용을 확인하여 관련 법령과 사전 고지 기준에 따라 처리합니다.",
      complaintEscalation: "담당자가 사실관계와 계약 내용을 확인한 뒤 해결되지 않으면 대표자가 검토하고, 분쟁이 지속되면 1372 소비자상담센터 등 공식 절차를 안내합니다.",
      privacyRequestChannel: "서비스 대표 이메일",
      incidentContact: "대표자 비상 연락처",
    },
    labor: {
      plannedWorkerCount: workerCount,
      writtenContractPrepared: workerCount === 0,
      wageAndHoursConfirmed: workerCount === 0,
      insuranceReviewed: workerCount === 0,
      payrollProcessTested: workerCount === 0,
      evidenceUrl: "",
    },
    insurance,
  };
}

export function assessOperations(workspace: OperationsWorkspace): OperationsAssessment {
  const requiredChecklist = workspace.openingChecklist.filter((entry) => entry.required);
  const requiredInsurance = workspace.insurance.filter((entry) => entry.required);
  const laborRequired = workspace.labor.plannedWorkerCount > 0;
  const laborVerified = !laborRequired || (
    workspace.labor.writtenContractPrepared &&
    workspace.labor.wageAndHoursConfirmed &&
    workspace.labor.insuranceReviewed &&
    workspace.labor.payrollProcessTested &&
    Boolean(workspace.labor.evidenceUrl)
  );
  const blockers = [
    ...requiredChecklist
      .filter((entry) => entry.status !== "verified")
      .map((entry) => ({ id: entry.id, title: entry.title, reason: entry.reason })),
    ...requiredInsurance
      .filter((entry) => entry.status !== "verified")
      .map((entry) => ({ id: entry.id, title: entry.name, reason: entry.reason })),
    ...(laborVerified ? [] : [{
      id: "labor-readiness",
      title: "채용·급여 운영 준비",
      reason: "근로계약, 임금·시간, 사회보험, 급여 지급 흐름의 증빙이 필요합니다.",
    }]),
  ];
  const verifiedRequiredCount =
    requiredChecklist.filter((entry) => entry.status === "verified").length +
    requiredInsurance.filter((entry) => entry.status === "verified").length +
    Number(laborVerified && laborRequired);
  const requiredCount = requiredChecklist.length + requiredInsurance.length + Number(laborRequired);

  const allTrackable = [
    ...workspace.openingChecklist,
    ...workspace.assets.filter((entry) => entry.requiredBeforeLaunch),
    ...workspace.sops,
    ...workspace.insurance,
  ];
  const verifiedCount = allTrackable.filter((entry) => entry.status === "verified").length;
  const readinessScore = allTrackable.length
    ? Math.round((verifiedCount / allTrackable.length) * 100)
    : 0;
  const warnings: string[] = [];
  if (!workspace.supplierQuotes.some((quote) => quote.status === "verified")) {
    warnings.push("검증된 공급처 견적이 없어 실제 조달비와 납기를 확정할 수 없습니다.");
  }
  if (workspace.sops.some((entry) => entry.status !== "verified")) {
    warnings.push("실행 증빙이 없는 업무 절차서는 실제 현장에서 작동한다고 볼 수 없습니다.");
  }
  if (workspace.policies.responseTimeHours > 72) {
    warnings.push("고객 응답 목표가 72시간을 초과합니다.");
  }
  const estimatedProcurementCost = workspace.assets.reduce(
    (sum, entry) => sum + entry.quantity * entry.estimatedUnitCost,
    0,
  );
  const verifiedQuoteCost = workspace.supplierQuotes
    .filter((quote) => quote.status === "verified")
    .reduce(
      (sum, quote) => sum + quote.unitPrice * quote.minimumOrderQuantity + quote.shippingCost,
      0,
    );

  return {
    readinessScore,
    verifiedRequiredCount,
    requiredCount,
    hardBlockers: blockers,
    warnings,
    estimatedProcurementCost,
    verifiedQuoteCost,
    generatedAt: new Date().toISOString(),
    rulesVersion: "kr-operations-v1",
  };
}

export function generateOperationsPackage(
  project: ProjectRecord,
  workspace: OperationsWorkspace,
  assessment: OperationsAssessment,
): OperationsPackage {
  const taxCalendar = buildTaxCalendar(project);
  const statusLabel = (status: "not_started" | "in_progress" | "verified" | "blocked") => ({
    not_started: "미준비",
    in_progress: "준비 중",
    verified: "증빙 확인 완료",
    blocked: "진행 막힘",
  })[status];
  const sections = [
    {
      title: "영업 오픈 판정",
      items: [
        `운영 준비도 ${assessment.readinessScore}%`,
        `필수 검증 ${assessment.verifiedRequiredCount}/${assessment.requiredCount}`,
        `영업 시작을 막는 항목 ${assessment.hardBlockers.length}개`,
      ],
    },
    {
      title: "조달·장비",
      items: [
        `예상 조달비 ${assessment.estimatedProcurementCost.toLocaleString("ko-KR")}원`,
        `검증 견적 기준 ${assessment.verifiedQuoteCost.toLocaleString("ko-KR")}원`,
        ...workspace.supplierQuotes.map((quote) => `[${statusLabel(quote.status)}] ${quote.supplierName} · ${quote.itemName} · ${quote.unitPrice.toLocaleString("ko-KR")}원 × 최소 ${quote.minimumOrderQuantity}개 · 납기 ${quote.leadTimeDays}일`),
        ...workspace.assets.map((entry) => `[${statusLabel(entry.status)}] ${entry.name} ${entry.quantity}개 · ${entry.estimatedUnitCost.toLocaleString("ko-KR")}원/개`),
      ],
    },
    {
      title: "고객응대·환불",
      items: [
        `문의 방법: ${workspace.policies.customerSupportChannel}`,
        `응답 목표: ${workspace.policies.responseTimeHours}시간`,
        `환불 기준: ${workspace.policies.refundPolicy}`,
        `분쟁 단계: ${workspace.policies.complaintEscalation}`,
      ],
    },
    {
      title: "표준 운영 절차",
      items: workspace.sops.flatMap((entry) => [
        `[${statusLabel(entry.status)}] ${entry.title} · 담당 ${entry.ownerRole} · ${entry.frequency}`,
        ...entry.steps.map((step, index) => `  ${index + 1}. ${step}`),
        `  실패 시: ${entry.failureResponse}`,
      ]),
    },
    {
      title: "영업 시작 확인표",
      items: workspace.openingChecklist.map(
        (entry) => `[${entry.required ? "필수" : "권고"} · ${statusLabel(entry.status)}] ${entry.title} — ${entry.reason}`,
      ),
    },
    {
      title: "남은 차단 항목",
      items: assessment.hardBlockers.length
        ? assessment.hardBlockers.map((entry) => `${entry.title}: ${entry.reason}`)
        : ["필수 증빙 기준을 모두 통과했습니다."],
    },
    {
      title: "세금·증빙 일정",
      items: taxCalendar.map((entry) => `[${entry.cycle}] ${entry.title} — ${entry.appliesWhen}`),
    },
  ];
  const title = `${String(project.opportunity.title ?? project.title)} 영업 운영 준비서`;
  const markdown = [
    `# ${title}`,
    "",
    `생성일: ${new Date().toLocaleDateString("ko-KR")}`,
    "",
    "> 완료 표시는 증빙 원문 주소가 저장되고 확인된 항목만 계산합니다.",
    "",
    ...sections.flatMap((section) => [
      `## ${section.title}`,
      "",
      ...section.items.map((entry) => `- ${entry}`),
      "",
    ]),
    taxCalendarMarkdown(taxCalendar),
    "",
    "## 혼자 운영할 때의 월말 확인 순서",
    "",
    "1. 사업용 계좌와 카드 내역을 내려받아 매출·매입·개인 지출을 나눕니다.",
    "2. 세금계산서·현금영수증·카드매출과 실제 입출금이 맞는지 확인합니다.",
    "3. 미수금·환불·수수료·택배비·광고비를 주문별 손익표에 반영합니다.",
    "4. 다음 신고 대상이 부가가치세, 원천세, 종합소득세, 법인세 중 무엇인지 홈택스에서 확인합니다.",
    "5. 신고 여부를 임의로 판단하기 어려우면 홈택스 상담 경로에서 사업자 유형과 거래 사실을 기준으로 문의합니다.",
  ].join("\n");
  return {
    title,
    generatedAt: new Date().toISOString(),
    readinessScore: assessment.readinessScore,
    sections,
    markdown,
  };
}
