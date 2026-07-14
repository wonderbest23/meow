export type RiasecAxis = "R" | "I" | "A" | "S" | "E" | "C";
export type FounderAxis =
  | "opportunity"
  | "customer"
  | "creation"
  | "execution"
  | "uncertainty"
  | "scale";

export type ScoreDelta = {
  riasec?: Partial<Record<RiasecAxis, number>>;
  founder?: Partial<Record<FounderAxis, number>>;
};

export type AssessmentOption = {
  id: string;
  title: string;
  description: string;
  delta: ScoreDelta;
};

export type AssessmentQuestion = {
  id: string;
  number: string;
  context: string;
  title: string;
  hint: string;
  options: [AssessmentOption, AssessmentOption];
};

export type AssessmentAnswers = Record<string, string>;

export type FounderProfile = {
  riasec: Record<RiasecAxis, number>;
  founder: Record<FounderAxis, number>;
  topRiasec: RiasecAxis[];
  topFounder: FounderAxis[];
  confidence: number;
  answered: number;
};

export const riasecLabels: Record<RiasecAxis, string> = {
  R: "현장 실행",
  I: "탐구 분석",
  A: "창작 표현",
  S: "사람 변화",
  E: "기회 설득",
  C: "구조 운영",
};

export const founderLabels: Record<FounderAxis, string> = {
  opportunity: "기회 감지",
  customer: "고객 공감",
  creation: "창조·기획",
  execution: "실행 지속",
  uncertainty: "불확실성 대응",
  scale: "확장 설계",
};

export const founderInterpretations: Record<
  FounderAxis,
  { title: string; strength: string; watchout: string }
> = {
  opportunity: {
    title: "기회 탐색가",
    strength: "서로 떨어진 변화에서 아직 이름 붙지 않은 고객 문제를 발견합니다.",
    watchout: "가능성을 넓히는 데 머물지 않도록 한 번에 하나의 가설만 검증하는 편이 좋습니다.",
  },
  customer: {
    title: "공감 설계자",
    strength: "고객이 말로 다 설명하지 못한 불편과 감정을 구체적인 경험으로 바꿉니다.",
    watchout: "모든 요청을 받아들이기보다 반복해서 나타나는 문제인지 확인해야 합니다.",
  },
  creation: {
    title: "창조 제작자",
    strength: "평범한 문제에 새로운 표현과 제품 경험을 더해 대체하기 어려운 가치를 만듭니다.",
    watchout: "완성도를 높이기 전에 고객이 실제로 비용을 지불할 문제인지 먼저 확인해야 합니다.",
  },
  execution: {
    title: "실행 운영가",
    strength: "복잡한 일을 순서와 루틴으로 정리해 약속한 결과를 안정적으로 만들어냅니다.",
    watchout: "익숙한 실행을 반복하기 전에 방향 자체가 맞는지 주기적으로 점검해야 합니다.",
  },
  uncertainty: {
    title: "실험 개척자",
    strength: "정보가 부족한 상황에서도 손실이 작은 실험을 설계하고 행동하며 배웁니다.",
    watchout: "속도를 유지하되 실험의 중단 기준과 최대 손실을 시작 전에 정해야 합니다.",
  },
  scale: {
    title: "시스템 설계자",
    strength: "한 번 해결한 문제를 제품, 기술, 파트너 구조로 반복 가능하게 만듭니다.",
    watchout: "반복 수요가 확인되기 전에 자동화와 플랫폼 구축에 과투자하지 않아야 합니다.",
  },
};

export const coreQuestions: AssessmentQuestion[] = [
  {
    id: "blank-day",
    number: "01",
    context: "예상치 못한 하루의 여유가 생겼습니다.",
    title: "어느 쪽에 더 마음이 가나요?",
    hint: "잘하는 쪽보다 자연스럽게 끌리는 쪽을 골라주세요.",
    options: [
      {
        id: "make",
        title: "손에 잡히는 것을 만든다",
        description: "도구를 만지거나 공간을 바꾸며 결과를 눈으로 확인해요.",
        delta: { riasec: { R: 5, A: 2 }, founder: { creation: 2, execution: 2 } },
      },
      {
        id: "discover",
        title: "새로운 주제를 깊게 파본다",
        description: "자료를 모으고 원리를 이해하며 나만의 관점을 만들어요.",
        delta: { riasec: { I: 5, C: 1 }, founder: { opportunity: 3, scale: 1 } },
      },
    ],
  },
  {
    id: "group-role",
    number: "02",
    context: "새로운 프로젝트 팀에 합류했습니다.",
    title: "나도 모르게 맡게 되는 역할은?",
    hint: "과거의 팀 활동을 떠올려보세요.",
    options: [
      {
        id: "energy",
        title: "사람을 모으고 방향을 제안한다",
        description: "가능성을 이야기하고 모두가 움직이게 만드는 편이에요.",
        delta: { riasec: { E: 5, S: 2 }, founder: { customer: 2, opportunity: 3 } },
      },
      {
        id: "system",
        title: "일정을 정리하고 빈틈을 메운다",
        description: "해야 할 일을 구조화하고 약속대로 끝내는 편이에요.",
        delta: { riasec: { C: 5, I: 1 }, founder: { execution: 4, scale: 2 } },
      },
    ],
  },
  {
    id: "reward",
    number: "03",
    context: "일을 마치고 가장 뿌듯했던 순간을 떠올려보세요.",
    title: "어떤 보상이 더 크게 느껴지나요?",
    hint: "돈 이외에 계속하게 만드는 힘을 찾는 질문이에요.",
    options: [
      {
        id: "change",
        title: "누군가 실제로 달라졌을 때",
        description: "고맙다는 말이나 성장하는 모습을 볼 때 힘이 나요.",
        delta: { riasec: { S: 5, E: 1 }, founder: { customer: 5, execution: 1 } },
      },
      {
        id: "original",
        title: "세상에 없던 결과를 만들었을 때",
        description: "내 아이디어가 새로운 형태로 구현될 때 힘이 나요.",
        delta: { riasec: { A: 5, I: 2 }, founder: { creation: 5, opportunity: 1 } },
      },
    ],
  },
  {
    id: "messy-problem",
    number: "04",
    context: "아무도 정답을 모르는 복잡한 문제가 생겼습니다.",
    title: "가장 먼저 취할 행동은?",
    hint: "둘 다 필요하지만, 먼저 손이 가는 쪽을 선택해주세요.",
    options: [
      {
        id: "talk",
        title: "관련된 사람부터 만나본다",
        description: "현장의 목소리에서 진짜 문제가 무엇인지 찾아요.",
        delta: { riasec: { S: 3, E: 3 }, founder: { customer: 4, uncertainty: 3 } },
      },
      {
        id: "map",
        title: "자료와 구조부터 정리한다",
        description: "정보를 분해하고 패턴을 찾아 가설을 세워요.",
        delta: { riasec: { I: 4, C: 3 }, founder: { opportunity: 3, scale: 2 } },
      },
    ],
  },
  {
    id: "first-sale",
    number: "05",
    context: "아직 완벽하지 않은 아이디어가 떠올랐습니다.",
    title: "첫 고객을 만나는 방식은?",
    hint: "지금의 나에게 더 현실적인 장면을 골라주세요.",
    options: [
      {
        id: "prototype",
        title: "작은 시제품부터 보여준다",
        description: "빠르게 만들고 반응을 보며 고치는 것이 편해요.",
        delta: { riasec: { R: 3, A: 2 }, founder: { execution: 3, uncertainty: 4 } },
      },
      {
        id: "pitch",
        title: "가치와 가능성을 먼저 설명한다",
        description: "상대가 얻을 변화를 말로 설득하는 것이 편해요.",
        delta: { riasec: { E: 5, S: 1 }, founder: { opportunity: 3, customer: 2 } },
      },
    ],
  },
  {
    id: "growth",
    number: "06",
    context: "작게 시작한 일이 예상보다 잘 되고 있습니다.",
    title: "다음 단계로 더 끌리는 쪽은?",
    hint: "정답이 아닌 선호하는 성장 방식을 묻는 질문이에요.",
    options: [
      {
        id: "craft",
        title: "더 깊고 특별하게 만든다",
        description: "나만의 품질과 경험을 높여 대체하기 어렵게 만들어요.",
        delta: { riasec: { A: 3, R: 2, I: 1 }, founder: { creation: 4, customer: 1 } },
      },
      {
        id: "repeat",
        title: "누구나 반복 가능하게 만든다",
        description: "프로세스와 기술을 활용해 더 많은 사람에게 전달해요.",
        delta: { riasec: { C: 3, E: 2 }, founder: { scale: 5, execution: 2 } },
      },
    ],
  },
  {
    id: "risk",
    number: "07",
    context: "좋아 보이는 기회지만 결과를 확신할 수 없습니다.",
    title: "어떤 조건이면 움직일 수 있나요?",
    hint: "용감함이 아니라 나에게 맞는 위험 관리 방식을 찾습니다.",
    options: [
      {
        id: "experiment",
        title: "작은 실험이 가능하면 바로 시작",
        description: "손실을 제한할 수 있다면 행동하며 배우는 편이에요.",
        delta: { riasec: { E: 2, R: 2 }, founder: { uncertainty: 5, execution: 2 } },
      },
      {
        id: "evidence",
        title: "충분한 근거가 모이면 시작",
        description: "시장과 숫자를 확인해야 집중해서 움직일 수 있어요.",
        delta: { riasec: { I: 3, C: 3 }, founder: { opportunity: 2, scale: 3 } },
      },
    ],
  },
  {
    id: "future",
    number: "08",
    context: "3년 뒤 내 사업을 상상해봅니다.",
    title: "더 마음에 드는 장면은?",
    hint: "규모보다 내가 보내고 싶은 하루를 생각해주세요.",
    options: [
      {
        id: "close",
        title: "고객과 가까이 일하는 전문 브랜드",
        description: "적은 고객에게 깊은 변화를 주고 높은 신뢰를 얻어요.",
        delta: { riasec: { S: 3, A: 2 }, founder: { customer: 4, creation: 2 } },
      },
      {
        id: "platform",
        title: "나 없이도 움직이는 확장 시스템",
        description: "제품, 팀, 파트너가 연결되어 더 큰 시장을 만들어요.",
        delta: { riasec: { E: 3, C: 2 }, founder: { scale: 5, opportunity: 2 } },
      },
    ],
  },
];

const riasecAxes: RiasecAxis[] = ["R", "I", "A", "S", "E", "C"];
const founderAxes: FounderAxis[] = [
  "opportunity",
  "customer",
  "creation",
  "execution",
  "uncertainty",
  "scale",
];

function normalize(raw: number, max: number) {
  return Math.round(34 + (raw / Math.max(max, 1)) * 62);
}

export function calculateProfile(answers: AssessmentAnswers): FounderProfile {
  const riasecRaw = Object.fromEntries(riasecAxes.map((axis) => [axis, 0])) as Record<RiasecAxis, number>;
  const founderRaw = Object.fromEntries(founderAxes.map((axis) => [axis, 0])) as Record<FounderAxis, number>;
  const riasecMax = Object.fromEntries(riasecAxes.map((axis) => [axis, 0])) as Record<RiasecAxis, number>;
  const founderMax = Object.fromEntries(founderAxes.map((axis) => [axis, 0])) as Record<FounderAxis, number>;

  for (const question of coreQuestions) {
    for (const axis of riasecAxes) {
      riasecMax[axis] += Math.max(
        ...question.options.map((option) => option.delta.riasec?.[axis] ?? 0),
      );
    }
    for (const axis of founderAxes) {
      founderMax[axis] += Math.max(
        ...question.options.map((option) => option.delta.founder?.[axis] ?? 0),
      );
    }

    const selected = question.options.find((option) => option.id === answers[question.id]);
    if (!selected) continue;
    for (const [axis, value] of Object.entries(selected.delta.riasec ?? {})) {
      riasecRaw[axis as RiasecAxis] += value;
    }
    for (const [axis, value] of Object.entries(selected.delta.founder ?? {})) {
      founderRaw[axis as FounderAxis] += value;
    }
  }

  const answered = Object.keys(answers).filter((id) => coreQuestions.some((question) => question.id === id)).length;
  const riasec = Object.fromEntries(
    riasecAxes.map((axis) => [axis, normalize(riasecRaw[axis], riasecMax[axis])]),
  ) as Record<RiasecAxis, number>;
  const founder = Object.fromEntries(
    founderAxes.map((axis) => [axis, normalize(founderRaw[axis], founderMax[axis])]),
  ) as Record<FounderAxis, number>;

  return {
    riasec,
    founder,
    topRiasec: [...riasecAxes].sort((a, b) => riasec[b] - riasec[a]).slice(0, 3),
    topFounder: [...founderAxes].sort((a, b) => founder[b] - founder[a]).slice(0, 3),
    confidence: Math.min(78, 32 + answered * 4),
    answered,
  };
}

export function applyPreference(
  profile: FounderProfile,
  tags: { riasec: RiasecAxis[]; founder: FounderAxis[] },
  direction: 1 | -1,
): FounderProfile {
  const riasec = { ...profile.riasec };
  const founder = { ...profile.founder };
  tags.riasec.forEach((axis) => (riasec[axis] = Math.max(20, Math.min(100, riasec[axis] + direction * 4))));
  tags.founder.forEach((axis) => (founder[axis] = Math.max(20, Math.min(100, founder[axis] + direction * 4))));
  return {
    ...profile,
    riasec,
    founder,
    topRiasec: [...riasecAxes].sort((a, b) => riasec[b] - riasec[a]).slice(0, 3),
    topFounder: [...founderAxes].sort((a, b) => founder[b] - founder[a]).slice(0, 3),
    confidence: Math.min(97, profile.confidence + 2),
  };
}

const narrativeRules: {
  keywords: string[];
  riasec: RiasecAxis[];
  founder: FounderAxis[];
}[] = [
  { keywords: ["만들", "수리", "요리", "공간", "제품", "현장", "손으로"], riasec: ["R"], founder: ["execution", "creation"] },
  { keywords: ["분석", "자료", "연구", "원리", "데이터", "왜", "문제"], riasec: ["I"], founder: ["opportunity"] },
  { keywords: ["그림", "글", "디자인", "콘텐츠", "표현", "창작", "브랜드"], riasec: ["A"], founder: ["creation"] },
  { keywords: ["도움", "교육", "상담", "돌봄", "사람", "성장", "공감"], riasec: ["S"], founder: ["customer"] },
  { keywords: ["설득", "판매", "리더", "기회", "협상", "영업", "시장"], riasec: ["E"], founder: ["opportunity", "uncertainty"] },
  { keywords: ["정리", "계획", "운영", "관리", "체계", "일정", "반복"], riasec: ["C"], founder: ["execution", "scale"] },
  { keywords: ["빠르게", "일단", "실험", "도전", "모험", "새로운"], riasec: ["E", "R"], founder: ["uncertainty"] },
  { keywords: ["자동화", "플랫폼", "확장", "시스템", "구독", "기술"], riasec: ["I", "C"], founder: ["scale"] },
  { keywords: ["고객", "사용자", "불편", "경험", "인터뷰"], riasec: ["S", "E"], founder: ["customer", "opportunity"] },
];

export type NarrativeInference = {
  profile: FounderProfile;
  signals: string[];
  budget: string;
  availableTime: string;
  preferredMode: string;
  caveat: string;
};

const negativeNarrativePatterns = [
  /싫(?:어|고|다|습니다)?/,
  /원하(?:지\s*않|지\s*않아|지\s*않습니다)/,
  /하고\s*싶지\s*않/,
  /관심(?:이\s*)?없/,
  /피하고\s*싶/,
  /절대/,
  /제외/,
];

function hasAffirmativeKeyword(text: string, keyword: string) {
  let offset = 0;
  while (offset < text.length) {
    const index = text.indexOf(keyword, offset);
    if (index < 0) return false;
    const nearby = text.slice(Math.max(0, index - 12), Math.min(text.length, index + keyword.length + 18));
    if (!negativeNarrativePatterns.some((pattern) => pattern.test(nearby))) return true;
    offset = index + keyword.length;
  }
  return false;
}

function parseKoreanNumber(raw: string) {
  const normalized = raw.replace(/[\s,]/g, "");
  if (/^\d+$/.test(normalized)) return Number(normalized);

  const simpleNumbers: Record<string, number> = {
    영: 0, 공: 0, 일: 1, 한: 1, 하나: 1, 이: 2, 두: 2, 둘: 2,
    삼: 3, 세: 3, 셋: 3, 사: 4, 네: 4, 넷: 4, 오: 5,
    다섯: 5, 육: 6, 여섯: 6, 칠: 7, 일곱: 7, 팔: 8,
    여덟: 8, 구: 9, 아홉: 9, 열: 10,
  };
  if (normalized in simpleNumbers) return simpleNumbers[normalized];

  const digits: Record<string, number> = { 영: 0, 공: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
  const units: Record<string, number> = { 십: 10, 백: 100, 천: 1000 };
  let total = 0;
  let digit: number | null = null;
  for (const character of normalized) {
    if (character in digits) {
      digit = digits[character];
      continue;
    }
    if (!(character in units)) return null;
    total += (digit ?? 1) * units[character];
    digit = null;
  }
  return total + (digit ?? 0);
}

export function inferProfileFromNarrative(responses: string[]): NarrativeInference {
  const text = responses.join(" ").toLowerCase();
  const riasec = Object.fromEntries(riasecAxes.map((axis) => [axis, 42])) as Record<RiasecAxis, number>;
  const founder = Object.fromEntries(founderAxes.map((axis) => [axis, 42])) as Record<FounderAxis, number>;
  let matchedSignals = 0;

  for (const rule of narrativeRules) {
    const hits = rule.keywords.filter((keyword) => hasAffirmativeKeyword(text, keyword)).length;
    if (!hits) continue;
    matchedSignals += Math.min(hits, 3);
    rule.riasec.forEach((axis) => {
      riasec[axis] = Math.min(96, riasec[axis] + 7 + Math.min(hits, 3) * 3);
    });
    rule.founder.forEach((axis) => {
      founder[axis] = Math.min(96, founder[axis] + 7 + Math.min(hits, 3) * 3);
    });
  }

  const topRiasec = [...riasecAxes].sort((a, b) => riasec[b] - riasec[a]).slice(0, 3);
  const topFounder = [...founderAxes].sort((a, b) => founder[b] - founder[a]).slice(0, 3);
  const numberToken = "[0-9,]+|[영공일이삼사오육칠팔구한두세네다섯여섯일곱여덟아홉십백천]+";
  const budgetPrefix = "(?:(?:으로는|으로|은|는|이|가)\\s*|[\\s,:]+|(?=[0-9]))(?:약|대략|최대|최소)?\\s*";
  const budgetMatch = text.match(new RegExp(`(?:예산|자금|투자)${budgetPrefix}(${numberToken})\\s*(만\\s*원?|원)?`));
  const timeMatch = text.match(new RegExp(`(?:하루|주당|일주일).{0,10}?(${numberToken})\\s*시간`));
  const budgetNumber = budgetMatch ? parseKoreanNumber(budgetMatch[1]) : null;
  const budgetUnit = budgetMatch?.[2]?.replace(/\s/g, "") ?? "만";
  const budgetInManwon = budgetNumber === null
    ? null
    : budgetUnit.startsWith("만")
      ? budgetNumber
      : budgetNumber >= 10_000
        ? Math.round(budgetNumber / 10_000)
        : budgetNumber;
  const availableHours = timeMatch ? parseKoreanNumber(timeMatch[1]) : null;
  const preferredMode = /오프라인|매장|현장/.test(text)
    ? /온라인|인터넷|디지털/.test(text)
      ? "온라인과 오프라인 혼합"
      : "현장·오프라인 중심"
    : /온라인|인터넷|디지털|재택/.test(text)
      ? "온라인 중심"
      : "아직 특정하지 않음";

  return {
    profile: {
      riasec,
      founder,
      topRiasec,
      topFounder,
      confidence: Math.min(76, 38 + responses.filter((response) => response.trim().length >= 20).length * 6 + matchedSignals),
      answered: responses.filter(Boolean).length,
    },
    signals: [
      ...topFounder.map((axis) => founderLabels[axis]),
      ...topRiasec.slice(0, 2).map((axis) => riasecLabels[axis]),
    ],
    budget: budgetInManwon === null ? "예산 정보가 명확하지 않음" : `약 ${budgetInManwon.toLocaleString("ko-KR")}만원`,
    availableTime: availableHours === null ? "투입 시간 정보가 명확하지 않음" : `하루 또는 주당 ${availableHours}시간`,
    preferredMode,
    caveat:
      matchedSignals < 3
        ? "구체적인 경험과 행동 표현이 적어 초기 해석의 확신이 낮습니다."
        : "반복해서 나타난 표현을 중심으로 초기 프로필을 구성했습니다.",
  };
}
