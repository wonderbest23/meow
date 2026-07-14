import type { Opportunity } from "../data/opportunities";
import type { FounderAxis, RiasecAxis } from "./assessment";

export type ManualPreferences = {
  budget: "제한 없음" | "100만원 이하" | "100~1,000만원" | "1,000만원 이상";
  time: "제한 없음" | "주말·저녁" | "부업" | "전업";
  channel: "제한 없음" | "온라인" | "오프라인" | "혼합";
  customer: "제한 없음" | "개인" | "기업" | "공공·지역";
};

type Domain = {
  sector: string;
  subject: string;
  problem: string;
  outcome: string;
  customers: ManualPreferences["customer"][];
  riasec: RiasecAxis[];
  founder: FounderAxis[];
  regulation: number;
};

type Mechanism = {
  name: string;
  phrase: string;
  model: string;
  channel: ManualPreferences["channel"];
  capital: Opportunity["capital"];
  times: ManualPreferences["time"][];
  revenue: string;
  skills: string[];
  stage: string;
};

const domains: Domain[] = [
  { sector: "산업·전승", subject: "영세 제조사의 숙련 기술", problem: "퇴직과 함께 사라지는 암묵지를", outcome: "현장 교육 자산으로 전환", customers: ["기업"], riasec: ["R", "I", "C"], founder: ["execution", "scale"], regulation: 18 },
  { sector: "야간경제·건강", subject: "야간 근무자의 회복", problem: "교대 근무자의 불규칙한 수면과 식사를", outcome: "근무표 기반 회복 루틴으로 개선", customers: ["개인", "기업"], riasec: ["S", "I"], founder: ["customer", "creation"], regulation: 54 },
  { sector: "이주·생활", subject: "지역 이주민의 첫 90일", problem: "행정·주거·의료 정보의 언어 장벽을", outcome: "지역 정착 경험으로 해결", customers: ["개인", "공공·지역"], riasec: ["S", "C", "E"], founder: ["customer", "execution"], regulation: 32 },
  { sector: "건축·순환", subject: "리모델링 잔여 자재", problem: "소량이라 버려지는 고품질 건축 자재를", outcome: "검증된 지역 자원으로 재유통", customers: ["기업", "개인"], riasec: ["R", "A", "I"], founder: ["opportunity", "creation"], regulation: 46 },
  { sector: "도시·에너지", subject: "오래된 공동주택의 에너지", problem: "세대별로 보이지 않는 에너지 낭비를", outcome: "작은 개선 행동과 공동 절감으로 전환", customers: ["개인", "공공·지역"], riasec: ["I", "R", "C"], founder: ["scale", "execution"], regulation: 30 },
  { sector: "접근성·패션", subject: "감각·신체 다양성의 옷 선택", problem: "기존 쇼핑 정보가 설명하지 않는 착용 불편을", outcome: "실패 없는 구매 기준으로 표준화", customers: ["개인", "기업"], riasec: ["A", "S", "I"], founder: ["customer", "creation"], regulation: 14 },
  { sector: "소도시·이동", subject: "소도시 이동 약자의 외출", problem: "교통 공백 때문에 포기하는 일상 이동을", outcome: "이웃 자원과 생활 동선으로 연결", customers: ["개인", "공공·지역"], riasec: ["S", "E", "C"], founder: ["customer", "opportunity"], regulation: 62 },
  { sector: "프리랜서·금융", subject: "프리랜서의 불규칙한 현금흐름", problem: "입금 지연과 세금 때문에 생기는 자금 불안을", outcome: "예측 가능한 월간 운영으로 개선", customers: ["개인"], riasec: ["C", "I", "E"], founder: ["execution", "scale"], regulation: 58 },
  { sector: "농촌·공간", subject: "농촌의 유휴 작업 공간", problem: "쓰이지 않는 창고와 작업장을", outcome: "도시 창작자의 생산 거점으로 전환", customers: ["개인", "공공·지역"], riasec: ["R", "A", "E"], founder: ["opportunity", "creation"], regulation: 38 },
  { sector: "로컬·관광", subject: "전통시장의 외국인 경험", problem: "언어와 결제 장벽으로 놓치는 시장 경험을", outcome: "상인과 여행자의 실제 거래로 연결", customers: ["개인", "기업", "공공·지역"], riasec: ["E", "S", "A"], founder: ["customer", "opportunity"], regulation: 24 },
  { sector: "교육·실험", subject: "청소년의 진로 불확실성", problem: "직업 이름만 배우는 진로 교육을", outcome: "지역 문제를 직접 푸는 실험으로 전환", customers: ["개인", "공공·지역"], riasec: ["S", "A", "I"], founder: ["creation", "customer"], regulation: 27 },
  { sector: "펫·안전", subject: "1인 가구의 반려동물 응급 공백", problem: "보호자가 갑자기 자리를 비울 때의 돌봄 공백을", outcome: "검증된 비상 대응망으로 해결", customers: ["개인"], riasec: ["S", "C", "R"], founder: ["customer", "execution"], regulation: 42 },
  { sector: "소상공인·운영", subject: "작은 학원의 학부모 소통", problem: "반복되지만 기록되지 않는 상담과 성장 공유를", outcome: "신뢰를 만드는 간결한 리포트로 전환", customers: ["기업"], riasec: ["S", "C", "I"], founder: ["customer", "scale"], regulation: 36 },
  { sector: "축제·순환", subject: "지역 축제의 일회용 폐기물", problem: "행사마다 반복되는 용품 구매와 폐기를", outcome: "지역 순환 인프라로 바꿈", customers: ["기업", "공공·지역"], riasec: ["R", "E", "C"], founder: ["execution", "scale"], regulation: 34 },
  { sector: "약국·돌봄", subject: "독립 약국의 복약 이후 경험", problem: "약을 받은 뒤 이어지지 않는 생활 관리를", outcome: "지역 기반 복약 지원으로 연결", customers: ["개인", "기업"], riasec: ["S", "I", "C"], founder: ["customer", "execution"], regulation: 78 },
  { sector: "재난·기후", subject: "폭염 취약 상점의 영업 손실", problem: "기후 위험을 개인이 감당하는 구조를", outcome: "동네 단위 공동 대응으로 전환", customers: ["기업", "공공·지역"], riasec: ["I", "S", "E"], founder: ["opportunity", "scale"], regulation: 33 },
  { sector: "콘텐츠·기억", subject: "사라지는 가족의 생활 기술", problem: "세대가 바뀌며 사라지는 요리와 수선 노하우를", outcome: "사용 가능한 지식 자산으로 보존", customers: ["개인"], riasec: ["A", "S", "R"], founder: ["creation", "customer"], regulation: 12 },
  { sector: "중고·신뢰", subject: "전문 취미 장비의 중고 거래", problem: "상태를 판단하기 어려운 고가 취미 장비를", outcome: "검증 가능한 재판매 자산으로 전환", customers: ["개인", "기업"], riasec: ["R", "I", "E"], founder: ["opportunity", "execution"], regulation: 22 },
];

const mechanisms: Mechanism[] = [
  { name: "현장 진단 작업실", phrase: "전문가가 직접 찾아가 진단하고 개선안을 실행하는", model: "방문형 서비스", channel: "오프라인", capital: "소액", times: ["부업", "전업"], revenue: "진단비 + 실행 수수료", skills: ["현장 관찰", "고객 상담", "협력자 운영"], stage: "시험 운영" },
  { name: "인공지능 기록 도우미", phrase: "흩어진 기록을 읽고 다음 행동을 제안하는", model: "기업용 온라인 구독 서비스", channel: "온라인", capital: "중간", times: ["부업", "전업"], revenue: "월 구독료", skills: ["업무 분석", "자료 구조화", "서비스 기획"], stage: "기술 확인" },
  { name: "공동구매 연결망", phrase: "비슷한 수요를 묶어 가격과 접근성을 개선하는", model: "거래 연결 서비스", channel: "혼합", capital: "중간", times: ["주말·저녁", "부업", "전업"], revenue: "거래 수수료 + 회원비", skills: ["공급자 발굴", "고객 모임 운영", "운영"], stage: "수동 연결" },
  { name: "신뢰 인증 표시", phrase: "보이지 않던 품질을 공동 기준으로 측정해 보여주는", model: "평가·인증", channel: "혼합", capital: "중간", times: ["부업", "전업"], revenue: "평가비 + 기업 사용료", skills: ["평가 기준", "사용자 조사", "기업 영업"], stage: "기준 확인" },
  { name: "생활 선택 도우미", phrase: "복잡한 선택과 예약을 한 사람의 상황에 맞게 대신 조율하는", model: "생활 지원 구독", channel: "혼합", capital: "소액", times: ["주말·저녁", "부업", "전업"], revenue: "월 구독료 + 제휴 수익", skills: ["상담", "정보 탐색", "일정 운영"], stage: "고객 인터뷰" },
  { name: "이동형 체험 도구", phrase: "필요한 도구와 안내서를 빌려 작은 변화를 직접 시험하게 하는", model: "도구 대여", channel: "오프라인", capital: "중간", times: ["주말·저녁", "부업", "전업"], revenue: "대여료 + 소모품 판매", skills: ["제품 설계", "물류", "안내 자료 제작"], stage: "시제품 확인" },
  { name: "문제 해결 연결소", phrase: "경험을 가진 사람과 구체적인 과제를 짧은 일로 연결하는", model: "전문가 연결 서비스", channel: "온라인", capital: "소액", times: ["주말·저녁", "부업", "전업"], revenue: "거래 수수료", skills: ["연결", "품질 관리", "고객 모임 운영"], stage: "수동 연결" },
  { name: "주말 하루학교", phrase: "실제 문제를 하루 동안 함께 해결하며 배우는", model: "체험 교육", channel: "오프라인", capital: "소액", times: ["주말·저녁", "부업"], revenue: "참가비 + 기관 후원", skills: ["교육 설계", "모임 진행", "협력기관 관리"], stage: "첫 수업" },
  { name: "생활정보 구독", phrase: "개인이 알기 어려운 변화와 위험을 함께 수집해 알려주는", model: "정보 구독", channel: "온라인", capital: "소액", times: ["주말·저녁", "부업", "전업"], revenue: "월 구독료 + 유료 보고서", skills: ["자료 해석", "안내 자료 제작", "회원 운영"], stage: "정보 가치 확인" },
  { name: "지역 임시매장 실험실", phrase: "빈 공간에서 고객과 함께 해결책을 만들고 바로 판매해보는", model: "단기 매장 판매", channel: "오프라인", capital: "중간", times: ["주말·저녁", "부업", "전업"], revenue: "제품 판매 + 공간 제휴", skills: ["공간 기획", "제품 선정", "현장 운영"], stage: "단기 매장 시험" },
  { name: "지역 운영 가맹모델", phrase: "검증된 서비스 절차를 지역 협력자가 반복할 수 있게 만드는", model: "운영 방식 사용권", channel: "혼합", capital: "높음", times: ["전업"], revenue: "가입비 + 매출 수수료", skills: ["업무 안내서", "협력자 교육", "품질 관리"], stage: "직영점 먼저 운영" },
  { name: "성과 연동 협력사업", phrase: "초기 비용 대신 실제 개선 성과를 함께 나누는", model: "성과 기반 서비스", channel: "혼합", capital: "중간", times: ["부업", "전업"], revenue: "기본료 + 성과 수수료", skills: ["성과 측정", "영업", "일정 관리"], stage: "계약 시험" },
];

function seededRandom(seed: number) {
  let value = seed || 1;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

function matchesPreferences(mechanism: Mechanism, domain: Domain, preferences?: ManualPreferences) {
  if (!preferences) return true;
  const allowedCapital: Record<ManualPreferences["budget"], Opportunity["capital"][]> = {
    "제한 없음": ["소액", "중간", "높음"],
    "100만원 이하": ["소액"],
    "100~1,000만원": ["소액", "중간"],
    "1,000만원 이상": ["소액", "중간", "높음"],
  };
  return (
    allowedCapital[preferences.budget].includes(mechanism.capital) &&
    (preferences.time === "제한 없음" || mechanism.times.includes(preferences.time)) &&
    (preferences.channel === "제한 없음" || mechanism.channel === preferences.channel || mechanism.channel === "혼합") &&
    (preferences.customer === "제한 없음" || domain.customers.includes(preferences.customer))
  );
}

export function generateOpportunityPool(
  seed: number,
  preferences?: ManualPreferences,
  count = 24,
): Opportunity[] {
  const random = seededRandom(seed);
  const combinations = domains.flatMap((domain, domainIndex) =>
    mechanisms
      .map((mechanism, mechanismIndex) => ({ domain, mechanism, domainIndex, mechanismIndex }))
      .filter(({ domain: candidateDomain, mechanism: candidateMechanism }) =>
        matchesPreferences(candidateMechanism, candidateDomain, preferences),
      ),
  );

  for (let index = combinations.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [combinations[index], combinations[swap]] = [combinations[swap], combinations[index]];
  }

  const selected: typeof combinations = [];
  const usedDomains = new Set<number>();
  for (const combination of combinations) {
    if (!usedDomains.has(combination.domainIndex) || selected.length >= domains.length) {
      selected.push(combination);
      usedDomains.add(combination.domainIndex);
    }
    if (selected.length >= count) break;
  }

  return selected.map(({ domain, mechanism, domainIndex, mechanismIndex }, index) => {
    const feasibilityBase = mechanism.capital === "소액" ? 80 : mechanism.capital === "중간" ? 68 : 50;
    const feasibility = Math.max(30, Math.min(90, feasibilityBase - Math.round(domain.regulation * 0.25)));
    const launchTime =
      mechanism.capital === "소액" ? "2~6주" : mechanism.capital === "중간" ? "6~12주" : "12~24주";

    return {
      id: `generated-${seed}-${domainIndex}-${mechanismIndex}-${index}`,
      title: `${domain.subject} ${mechanism.name}`,
      oneLiner: `${domain.problem} ${mechanism.phrase} 사업으로 ${domain.outcome}합니다.`,
      sector: domain.sector,
      model: mechanism.model,
      customer: domain.customers.join("·"),
      capital: mechanism.capital,
      launchTime,
      revenue: mechanism.revenue,
      stage: mechanism.stage,
      riasec: domain.riasec,
      founder: [...new Set([...domain.founder, ...(mechanism.model.includes("플랫폼") || mechanism.model.includes("라이선스") ? ["scale" as FounderAxis] : ["execution" as FounderAxis])])],
      market: 0,
      novelty: 0,
      feasibility,
      evidenceStatus: "hypothesis",
      evidenceSources: [],
      regulation: domain.regulation,
      skills: mechanism.skills,
      risk:
        domain.regulation >= 65
          ? "전문가 검토와 관련 법령·자격 범위를 먼저 확인해야 합니다."
          : mechanism.capital === "높음"
            ? "고정비 투자 전에 선주문 또는 수동 운영으로 반복 수요를 검증해야 합니다."
            : "아이디어 조합은 가설이므로 실제 고객의 지불 의사를 확인해야 합니다.",
      firstTest: `${domain.subject}과 관련된 잠재 고객 10명을 만나 현재 해결 방식과 최근 지출을 확인한 뒤, ${mechanism.name}의 핵심 기능 하나만 수동으로 제공하세요.`,
      color: ["sage", "steel", "apricot", "moss", "violet", "rose", "lime", "sky", "navy", "sand", "amber", "peach"][index % 12],
    };
  });
}
