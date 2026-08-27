import { z } from "zod";

/*
 * 무료 창업 상담.
 *
 * 문의 응답 챗봇(support)과 다른 물건이다. 저쪽은 "이 서비스가 뭔가요"에 답하고,
 * 여기는 "뭘 하면 좋을까요"를 같이 찾는다. 그래서 답이 아니라 질문이 주된 출력이다.
 *
 * 상담이 끝나면 여기서 모은 조건이 그대로 사업계획서 첫 화면으로 넘어간다 —
 * 같은 것을 두 번 묻지 않는다.
 */

/** 대화에서 하나씩 채워 나가는 상담 카드 */
export const consultProfileSchema = z.object({
  ageBand: z.string().max(40).optional(),
  job: z.string().max(60).optional(),
  region: z.string().max(60).optional(),
  budget: z.string().max(60).optional(),
  loanIncluded: z.string().max(40).optional(),
  hoursPerDay: z.string().max(40).optional(),
  runsSelf: z.string().max(40).optional(),
  hiring: z.string().max(40).optional(),
  unmanned: z.string().max(40).optional(),
  channel: z.string().max(40).optional(),
  interest: z.string().max(80).optional(),
  experience: z.string().max(120).optional(),
  targetIncome: z.string().max(60).optional(),
  riskAppetite: z.string().max(40).optional(),
  storeLease: z.string().max(40).optional(),
});

export type ConsultProfile = z.infer<typeof consultProfileSchema>;

/** 사람이 읽는 이름 — 중간 분석과 넘겨주는 화면에서 같은 말을 쓴다 */
export const PROFILE_LABELS: Record<keyof ConsultProfile, string> = {
  ageBand: "나이대",
  job: "현재 하는 일",
  region: "희망 지역",
  budget: "투자 가능 금액",
  loanIncluded: "대출 포함 여부",
  hoursPerDay: "하루 투입 시간",
  runsSelf: "직접 운영",
  hiring: "직원 고용",
  unmanned: "무인 운영 선호",
  channel: "온라인·오프라인",
  interest: "관심 업종",
  experience: "사업 경험·경력",
  targetIncome: "목표 월수익",
  riskAppetite: "위험 감수",
  storeLease: "점포 임대",
};

export const consultPickSchema = z.object({
  name: z.string().min(1).max(40),
  fit: z.number().int().min(1).max(5),
  why: z.array(z.string().max(120)).max(4),
  watch: z.array(z.string().max(120)).max(4),
});

export type ConsultPick = z.infer<typeof consultPickSchema>;

/*
 * 한 번의 응답.
 *
 * message 는 늘 있고, 나머지는 그때그때다. 세 가지를 한 번에 다 내보내지 않는다 —
 * 질문하면서 추천까지 하면 사용자는 무엇에 답해야 할지 모른다.
 */
export const consultReplySchema = z.object({
  /** 사용자에게 보일 말. 짧게. */
  message: z.string().min(1).max(1200),
  /** 지금까지 알아낸 것 — 매번 통째로 다시 보낸다(덮어쓴다) */
  profile: consultProfileSchema.default({}),
  /** 눌러서 답할 수 있는 보기. 없으면 직접 쓴다 */
  choices: z.array(z.string().max(30)).max(6).default([]),
  /** 중간 정리 — 서너 번 묻고 나서 한 번 */
  summary: z.array(z.string().max(90)).max(6).default([]),
  /** 아이템 추천 — 조건이 충분히 모였을 때만 */
  picks: z.array(consultPickSchema).max(3).default([]),
  /** 사업계획서로 넘어가자고 권할 단계인지 */
  ready: z.boolean().default(false),
});

export type ConsultReply = z.infer<typeof consultReplySchema>;

/** 첫 화면 빠른 선택 — 아무것도 안 정한 사람이 누를 것부터 */
export const CONSULT_STARTERS = [
  "창업 아이템이 없어요",
  "무인창업을 찾고 있어요",
  "소자본 창업을 찾고 있어요",
  "부업으로 시작하고 싶어요",
  "은퇴 후 할 일을 찾고 있어요",
  "이미 생각한 아이템이 있어요",
] as const;

/**
 * 입력창에 띄우는 예시.
 *
 * "편하게 적어주세요" 는 친절하지만 아무것도 알려 주지 않는다. 무엇을
 * 어느 정도로 적어야 하는지 모르면 사람은 그냥 창을 닫는다. 그래서
 * 지역·업종·예산·상황이 한 문장에 들어간 실제 문장 모양을 보여 준다.
 * 이 문장들이 상담사가 가장 잘 받는 형태이기도 하다.
 */
export const CONSULT_INPUT_EXAMPLES = [
  "예) 성수동에서 카페 창업하고 싶어요",
  "예) 3천만 원으로 무인 매장 하고 싶어요",
  "예) 직장 다니면서 주말에만 할 부업을 찾고 있어요",
  "예) 은퇴 후에 동네에서 작게 시작하고 싶어요",
  "예) 배달 위주 분식집 생각 중인데 괜찮을까요?",
] as const;

/** 서비스 문의 쪽 예시 — 창업 상담이 아니라 결제·환불 같은 것 */
export const SUPPORT_INPUT_EXAMPLES = [
  "예) 결제한 문서를 다시 내려받고 싶어요",
  "예) 환불은 어떻게 받나요?",
  "예) 만든 계획서를 Word로 고칠 수 있나요?",
] as const;

export const CONSULT_OPENING =
  "어떤 창업을 생각하고 계세요?\n아직 정해진 게 없어도 괜찮아요. 몇 가지만 여쭤보고 맞는 걸 같이 찾아드릴게요.";

/**
 * 상담 규칙.
 *
 * 지금 쓰는 문의 챗봇은 물으면 답하고 끝난다. 창업 상담에서 그렇게 하면 사용자는
 * 무엇을 더 물어야 할지 모른 채 멈춘다. 여기서는 AI 가 대화를 끌고 간다.
 */
export const CONSULT_SYSTEM = [
  "당신은 '오늘창업'의 창업 상담사입니다. 한국어로 상담합니다.",
  "",
  "# 무엇을 하는가",
  "손님이 자기 조건에 맞는 창업 아이템을 찾도록 질문으로 이끕니다.",
  "묻는 말에 답만 하고 끝내지 마세요. 답한 뒤 반드시 다음 질문을 이어가세요.",
  "",
  "# 질문 방식",
  "- 한 번에 질문 1개. 꼭 필요하면 2개까지. 설문지처럼 여러 개를 나열하지 마세요.",
  "- 지금 대화에 필요한 것만 묻습니다. 정해진 순서를 따르지 마세요.",
  "- 손님 유형에 따라 물을 것이 달라집니다. 은퇴 후를 찾는 분에게는 체력 부담과 무인 운영을,",
  "  직장인에게는 평일 가능한 시간과 온라인 여부를, 이미 아이템이 있는 분에게는 그 아이템의",
  "  지역·투자금·경쟁을 먼저 묻습니다.",
  "- 이미 답한 것을 다시 묻지 마세요.",
  "",
  "# 업종별로 꼭 짚을 것",
  "손님의 관심 업종이 드러나면 아래에서 해당하는 줄을 골라 그 항목부터 확인하세요.",
  "여기 적힌 것은 '무엇을 물어야 하는가'이지 정답이 아닙니다. 수치는 여전히 지어내지 마세요.",
  "- 카페·음식점: 자리(유동인구·임대료 수준), 주방 인력, 배달 병행 여부, 영업신고와 위생교육",
  "- 무인매장(무인카페·아이스크림·밀키트·사진): 하루 관리 시간, 도난·기기 고장 대응, 본사 계약 조건",
  "- 무인 세탁·코인빨래방: 초기 설비비 비중, 전기·수도 부담, 근처 경쟁 점포",
  "- 배달 전문(공유주방 포함): 배달앱 수수료, 조리 인력, 리뷰 관리, 피크 시간 감당",
  "- 편의점·프랜차이즈: 가맹 조건(로열티·인테리어·위약금), 24시간 여부, 본사 상권 보호",
  "- 온라인 쇼핑몰·스마트스토어: 상품 소싱 경로, 재고 부담, 광고비 감당, 통신판매업 신고",
  "- 교육·공방·체험: 강사 본인 여부, 정원과 회차, 재등록률, 학원 등록 대상인지",
  "- 미용·헬스·서비스: 면허·자격, 예약 관리, 단골 확보, 인력 이탈",
  "- 부업·1인: 본업과 겹치는 시간, 겸업 제한, 혼자 감당 가능한 규모",
  "해당 업종이 목록에 없으면 손님의 말에서 '자리·사람·돈·시간' 중 아직 모르는 것을 물으세요.",
  "",
  "# 중간 정리",
  "질문을 서너 번 주고받았으면 summary 에 지금까지 파악한 것을 짧게 적어 손님이 '내 상황을",
  "이해하고 있구나' 느끼게 하세요. 정리한 뒤에도 질문은 이어집니다.",
  "",
  "# 아이템 추천",
  "조건이 충분히 모이면 picks 에 3개까지 담습니다. 업종 이름만 나열하지 말고 왜 맞는지(why)와",
  "주의할 점(watch)을 함께 적습니다. 조건이 아직 부족하면 picks 를 비우고 계속 물으세요.",
  "",
  "# 솔직할 것",
  "손님이 원하는 것이 조건에 맞지 않으면 맞다고 하지 마세요. 어렵다고 말하고, 같은 분야에서",
  "조건에 맞는 다른 형태를 제시하세요. 무조건 칭찬하는 상담은 도움이 되지 않습니다.",
  "확실하지 않은 수치(매출·수익률·권리금)를 지어내지 마세요. 모르면 모른다고 하세요.",
  "",
  "# 돈 이야기",
  "먼저 가격이나 결제를 꺼내지 마세요. 그 안내는 화면이 맡습니다.",
  "ready 는 '방향이 잡혔는가'를 뜻합니다. 관심 업종이 정해졌고 지역·예산·투입 시간 중",
  "하나라도 파악됐으면 true 로 두세요. 완벽히 다 알아야 하는 것이 아닙니다.",
  "한 번 true 로 둔 뒤에도 대화는 계속됩니다 — 이어서 더 물어도 됩니다.",
  "방향이 잡힌 뒤(ready)나 아이템을 추천한 턴에는, 답 끝에 '지금까지 이야기한 내용으로",
  "사업계획서를 정리해 볼 수 있어요' 정도의 다음 단계 안내를 한 문장 붙여도 됩니다.",
  "그 이상 조르지 마세요. 가격·결제 이야기는 여전히 하지 않습니다.",
  "",
  "# 말투",
  "짧은 문장. 쉬운 말. 카카오톡으로 상담받는 느낌. 장황하게 쓰지 마세요.",
  "친절하되 과하게 친근하지 않게. 답변은 3~5문장을 넘기지 마세요.",
  "",
  "# 알아낸 것은 반드시 profile 에 남긴다",
  "손님이 말한 것은 그 턴에 곧바로 profile 에 적으세요. 여기 적지 않으면 다음 턴에 잊고,",
  "같은 것을 또 묻게 됩니다. 손님은 같은 질문을 두 번 받으면 상담을 그만둡니다.",
  "매번 이전에 알던 것까지 통째로 다시 담으세요. 빠뜨린 항목은 지워진 것으로 봅니다.",
  "",
  "쓸 수 있는 항목(모르면 넣지 않습니다):",
  Object.entries(PROFILE_LABELS).map(([key, label]) => `- ${key}: ${label}`).join("\n"),
  "",
  "# 출력",
  "JSON 객체만 출력합니다.",
  "예시 — 손님이 '경기도에서 5천만원으로 무인창업'이라고 답한 턴 (한 줄 JSON):",
  '{"message":"경기도에 5천만원이면 선택지가 있어요. 매장에 하루 몇 번 정도 들르실 수 있으세요?","profile":{"region":"경기","budget":"5000만원","unmanned":"선호"},"choices":["하루 1~2번","주 2~3번","거의 못 감"],"summary":[],"picks":[],"ready":false}',
  "profile 이 비어 있는 응답은 잘못된 응답입니다. 손님이 무언가 말했다면 반드시 한 항목 이상 담깁니다.",
  "choices 는 눌러서 답할 수 있는 짧은 보기입니다. 자유롭게 답해야 하는 질문이면 비우세요.",
].join("\n");

/** 프로필에서 실제로 채워진 것만 사람이 읽는 줄로 */
export function profileLines(profile: ConsultProfile): string[] {
  return (Object.keys(PROFILE_LABELS) as Array<keyof ConsultProfile>)
    .map((key) => (profile[key] ? `${PROFILE_LABELS[key]}: ${profile[key]}` : ""))
    .filter(Boolean);
}

/*
 * 상담에서 사업계획서로 넘기기.
 *
 * 상담에서 지역·업종을 이미 물었는데 사업계획서 첫 화면에서 또 묻는다면, 손님은
 * 상담이 헛일이었다고 느낀다. 옮길 수 있는 것만 옮기고 나머지는 손대지 않는다.
 *
 * 상호는 넘기지 않는다 — 상담에서 묻지 않는 것이고, 지어내면 손님이 지우는
 * 수고만 는다.
 */
export function businessFromConsult(profile: ConsultProfile): {
  industry: string;
  region: string;
  stage: string;
  description: string;
} {
  const stage = profile.job?.includes("은퇴")
    ? "은퇴 후 창업 준비"
    : profile.job
      ? "준비 중"
      : "";

  /* 설명은 손님이 한 말을 이어 붙이기만 한다. 없는 사실을 만들지 않는다 */
  const parts = [
    profile.region ? `${profile.region}에서` : "",
    profile.interest ? `${profile.interest}을(를)` : "",
    profile.unmanned ? `${profile.unmanned === "선호" ? "무인으로 " : ""}` : "",
    profile.budget ? `${profile.budget} 규모로` : "",
  ].filter(Boolean);

  return {
    industry: profile.interest ?? "",
    region: profile.region ?? "",
    stage,
    description: parts.length >= 2 ? `${parts.join(" ")} 시작하려고 합니다.` : "",
  };
}

/*
 * 상담에서 받은 답을 사업계획서 질문 칸으로 옮긴다.
 *
 * businessFromConsult 는 사업 정보 네 칸(업종·지역·단계·설명)만 만든다. 나머지 —
 * 예산, 대출 포함 여부, 직접 운영, 경력, 하루 투입 시간, 목표 월수익 — 는 화면에
 * 보여 주기만 하고 버려졌다. 손님이 이미 답한 것을 뒤에서 또 묻는 셈이었다.
 *
 * 여기서는 손님이 실제로 한 말만 옮긴다. 없는 답을 추측해 채우지 않는다.
 * 값이 선택지와 정확히 맞지 않을 수 있으므로(예: "3000만원"), 자유 입력 칸에만 넣는다.
 */
export function answersFromConsult(profile: ConsultProfile | null | undefined): Record<string, Record<string, unknown>> {
  if (!profile) return {};
  const out: Record<string, Record<string, unknown>> = {};
  const put = (sectionKey: string, qid: string, value: string | undefined) => {
    if (!value || !value.trim()) return;
    out[sectionKey] = { ...(out[sectionKey] ?? {}), [qid]: value.trim() };
  };

  /*
   * 대출을 포함한 금액이면 외부 자금이 필요하다고 답한 것이다.
   * "미포함"에도 "포함"이 들어 있으므로 앞의 '미·불·안'을 먼저 걸러낸다.
   */
  const loanIncluded = Boolean(profile.loanIncluded && /포함/.test(profile.loanIncluded) && !/[미불안]포함|없|제외|아니/.test(profile.loanIncluded));
  if (loanIncluded) {
    put("funding/requirements", "needs_funding", "yes");
    put("funding/requirements", "self_fund", profile.budget);
  } else if (profile.budget) {
    /* 대출 없이 쓸 수 있는 돈 = 자기자본 */
    put("funding/requirements", "self_fund", profile.budget);
  }

  /* 투자 가능 금액은 초기 투자 규모로도 읽힌다 — 재무 계산이 쓰는 칸 */
  put("financials/assets", "asset_cost", profile.budget);

  /* 대표자가 직접 하는지 */
  if (profile.runsSelf?.includes("직접")) put("strategy/people", "who_works", "대표자 직접");

  /* 경력은 '왜 우리가 잘할 수 있나'의 재료다 */
  put("summary/executive", "why_us", profile.experience);

  /*
   * hoursPerDay(하루 투입 시간)는 옮기지 않는다.
   * 기존 질문 중 뜻이 맞는 칸이 없다 — strategy/people 의 how_manage 는
   * "인력의 품질·신뢰를 어떻게 관리하나요?" 라서 "하루 3시간"을 넣으면 엉뚱한 답이 된다.
   * 맞는 칸이 생기기 전까지는 옮기지 않는 편이 낫다.
   */

  return out;
}

/** 주소에 담긴 상담 카드를 읽는다 — 남이 만든 주소일 수 있으니 형식을 검사한다 */
/*
 * 상담 결과를 로그인 왕복 동안 들고 있는 자리.
 *
 * 상담을 마치고 '사업계획서 시작하기'를 누르면 /plan/start 로 가는데, 로그인
 * 전이면 로그인 안내가 먼저 뜬다. 그 사이에 주소창의 ?consult=... 가 사라져서
 * 로그인하고 돌아오면 상담에서 답한 것이 통째로 날아갔다 — 손님 입장에서는
 * 챗봇과 나눈 이야기가 아무 데도 이어지지 않은 것이다.
 *
 * 그래서 주소로 받은 즉시 여기에 옮겨 둔다. 이 기기, 이 탭에서만 산다.
 */
const CONSULT_STASH_KEY = "oneulstart.consult.handoff";

export function stashConsult(profile: ConsultProfile): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(CONSULT_STASH_KEY, JSON.stringify(profile));
  } catch {
    // 저장을 막아 둔 브라우저면 그냥 넘어간다 — 주소에 있는 값으로만 동작한다
  }
}

export function readStashedConsult(): ConsultProfile | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return readConsultParam(sessionStorage.getItem(CONSULT_STASH_KEY));
  } catch {
    return null;
  }
}

export function clearStashedConsult(): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(CONSULT_STASH_KEY);
  } catch {
    // 무시
  }
}

export function readConsultParam(raw: string | null): ConsultProfile | null {
  if (!raw) return null;
  try {
    const parsed = consultProfileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return Object.keys(parsed.data).length ? parsed.data : null;
  } catch {
    return null;
  }
}
