type OpportunityLike = Record<string, unknown>;

export type AutoDraftContext = {
  title: string;
  shortTitle: string;
  idea: string;
  customer: string;
  problem: string;
  coreOutcome: string;
  promise: string;
  offerTiers: Array<{ name: string; outcome: string }>;
  nameCandidates: string[];
  slogans: string[];
  headline: string;
  subheadline: string;
  callToAction: string;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim().replace(/\s+/g, " ") : fallback;
}

function conciseTitle(value: string) {
  const sentence = value.split(/[.!?\n]/)[0]?.trim() || value;
  const words = sentence.split(" ").filter(Boolean);
  const shortened = words.slice(0, 3).join(" ");
  return (shortened || "새 사업").slice(0, 24);
}

function usableCustomer(value: string) {
  return value.length >= 4
    && !/(첫 기획|초기 목표|확인할.*고객|고객 검증 후|개인.?공공|개인·공공|누구나|모든 사람|전체 고객)/.test(value);
}

function inferCustomerFromIdea(idea: string, shortTitle: string) {
  const normalized = idea.replace(/[.!?].*$/, "").trim();
  const audiencePatterns = [
    /^(.{2,40}?)을\s*위한\s+/,
    /^(.{2,40}?)를\s*위한\s+/,
    /^(.{2,40}?)에게\s+/,
    /^(.{2,40}?)의\s+[^.]{2,40}?(?:을|를)\s+/,
  ];
  for (const pattern of audiencePatterns) {
    const candidate = normalized.match(pattern)?.[1]?.trim();
    if (candidate && !/(서비스|사업|아이디어|플랫폼|기능)$/.test(candidate)) return candidate;
  }
  return `'${shortTitle}' 문제를 최근 경험한 초기 고객`;
}

export function deriveAutoDraftContext(opportunity: OpportunityLike): AutoDraftContext {
  const title = text(opportunity.title, "새 사업");
  const idea = text(opportunity.oneLiner, title);
  const shortTitle = conciseTitle(title);
  const suppliedCustomer = text(opportunity.customer);
  const startupPlanning = /(창업|사업.?기획|예비.?창업|사업.?계획|사업.?실행)/.test(`${title} ${idea}`);

  if (startupPlanning) {
    const customer = usableCustomer(suppliedCustomer)
      ? suppliedCustomer
      : "사업 아이디어는 있지만 기획과 실행 순서가 막막한 예비 창업자";
    return {
      title,
      shortTitle,
      idea,
      customer,
      problem: "사업 아이디어가 있어도 고객, 가격, 비용과 실행 순서를 혼자 정리하기 어렵고 필요한 문서를 각각 따로 만들어야 합니다.",
      coreOutcome: "입력한 아이디어·예산·시간을 바탕으로 맞춤 사업 실행안, 손익 기준과 바로 사용하는 문서 초안을 한 번에 받습니다.",
      promise: "처음 창업하는 사람도 복잡한 용어를 공부하거나 빈 양식을 채우지 않고, 지금 할 일과 다음 결과물을 순서대로 확인할 수 있게 합니다.",
      offerTiers: [
        { name: "사업 방향 빠른 진단", outcome: "아이디어 적합성, 첫 고객과 시작 범위를 한 장으로 정리" },
        { name: "맞춤 사업 실행 설계", outcome: "상품·가격·손익·실행 일정과 필수 문서 초안 제공" },
        { name: "출시 준비 완성", outcome: "판매 페이지와 소개 자료, 첫 고객 실행안까지 맞춤 완성" },
      ],
      nameCandidates: ["오늘창업", "시작설계", "창업한걸음", "사업첫날", "시작도움"],
      slogans: [
        "아이디어만 적으면, 사업의 다음 단계가 보입니다",
        "처음 창업하는 사람을 위한 가장 쉬운 실행 순서",
        "사업 기획부터 첫 고객 준비까지 한 번에",
        "모르는 값은 추천받고 중요한 결정만 하세요",
        "생각을 오늘 실행할 사업으로 바꿉니다",
      ],
      headline: "아이디어만 알려주세요. 실행 가능한 사업 초안을 먼저 만들어드립니다.",
      subheadline: "예산과 가능한 시간을 반영해 상품, 가격, 손익, 사업 문서와 첫 고객 실행 순서를 한 단계씩 제안합니다.",
      callToAction: "내 사업 초안 만들기",
    };
  }

  const customer = usableCustomer(suppliedCustomer)
    ? suppliedCustomer
    : inferCustomerFromIdea(idea, shortTitle);
  const videoSubscription = /(숏폼|영상).*(구독|정기|제작|촬영|편집)|(?:구독|정기|제작|촬영|편집).*(숏폼|영상)/.test(`${title} ${idea}`);
  if (videoSubscription) {
    return {
      title,
      shortTitle,
      idea,
      customer,
      problem: `${customer}는 홍보 영상을 꾸준히 올려야 하지만 직접 기획·촬영·편집할 시간이 부족하고, 매번 외주업체를 찾으면 비용과 결과를 예측하기 어렵습니다.`,
      coreOutcome: "매달 약속한 편수의 숏폼 영상을 기획·촬영·편집해 바로 게시할 수 있는 파일로 받습니다.",
      promise: "먼저 샘플 1편으로 영상 스타일과 작업 방식을 확인한 뒤, 월 단위로 필요한 편수만 선택할 수 있게 합니다.",
      offerTiers: [
        { name: "샘플 영상 1편", outcome: "한 번의 기획·촬영·편집으로 영상 스타일과 작업 방식 확인" },
        { name: "월 4편 기본 구독", outcome: "주 1회 게시할 수 있는 숏폼 영상 4편 정기 제작" },
        { name: "월 8편 성장 구독", outcome: "월간 기획표와 숏폼 영상 8편, 반응 확인표 제공" },
      ],
      nameCandidates: ["가게한컷", "마포숏폼", "사장님영상", "매장한편", "동네숏폼"],
      slogans: [
        "매주 올릴 홍보 영상, 촬영부터 편집까지 한 번에",
        "바쁜 사장님을 위한 정기 숏폼 제작",
        "한 편 먼저 확인하고 필요한 만큼 구독하세요",
        "우리 가게 이야기를 짧고 분명한 영상으로",
        "홍보 영상을 미루지 않게 만드는 월간 제작팀",
      ],
      headline: "매주 올릴 홍보 영상, 촬영부터 편집까지 맡기세요.",
      subheadline: `${customer}를 위해 샘플 1편부터 월 4편·8편 구독까지 필요한 만큼 제작합니다.`,
      callToAction: "샘플 영상 상담하기",
    };
  }
  return {
    title,
    shortTitle,
    idea,
    customer,
    problem: `주요 고객은 ${customer}입니다. 이 고객은 '${shortTitle}' 관련 해결책을 찾을 때 선택 기준, 예상 비용과 첫 실행 순서가 흩어져 있어 결정을 미루기 쉽습니다.`,
    coreOutcome: `'${shortTitle}' 사업을 작은 범위에서 시험할 수 있도록 필요한 범위, 가격과 실행 순서를 하나의 초안으로 받습니다.`,
    promise: `주요 고객이 복잡한 준비 과정을 줄이고 가장 필요한 결과부터 확인하도록 돕습니다. 입력에 없는 사실은 가정으로 표시하고 실제 반응으로 수정합니다.`,
    offerTiers: [
      { name: `${shortTitle} 빠른 진단`, outcome: "현재 문제와 적합성, 가장 작은 시작 범위 확인" },
      { name: `${shortTitle} 핵심 실행`, outcome: "고객이 기대하는 대표 결과와 다음 행동 제공" },
      { name: `${shortTitle} 맞춤 완성`, outcome: "개별 조건을 반영한 실행과 후속 관리 제공" },
    ],
    nameCandidates: [`${shortTitle} 시작`, `${shortTitle} 한걸음`, `${shortTitle} 플랜`, `오늘의 ${shortTitle}`, `${shortTitle} 도움`],
    slogans: [
      `${shortTitle}, 가장 쉬운 첫 실행으로`,
      `주요 고객을 위한 명확한 시작`,
      "복잡한 준비를 줄이고 필요한 결과부터",
      "오늘 확인하고 바로 시작하는 방법",
      "작게 시험하고 근거로 키우는 사업",
    ],
    headline: idea,
    subheadline: `주요 고객에게 필요한 범위와 가격을 먼저 정리하고, 가장 작은 실행부터 시작합니다.`,
    callToAction: "첫 초안 받아보기",
  };
}
