import { z } from "zod";
import type { Opportunity } from "../../data/opportunities";
import type { OpenAIRuntimeConfig } from "../openai/session-config";
import {
  founderLabels,
  riasecLabels,
  type FounderAxis,
  type FounderProfile,
  type RiasecAxis,
} from "../assessment";
import { opportunityColors, type ManualPreferences } from "../idea-generator";

const RIASEC_AXES: RiasecAxis[] = ["R", "I", "A", "S", "E", "C"];
const FOUNDER_AXES: FounderAxis[] = [
  "opportunity",
  "customer",
  "creation",
  "execution",
  "uncertainty",
  "scale",
];

// 지어낸 시장 수치·과장 표현이 제안 문구에 들어가면 그 후보를 버린다.
const FABRICATED_METRIC = /(시장\s*규모|성장률|점유율|매출)\s*\d|\d+\s*(억|조)\s*원|\d+\s*%\s*(성장|점유|증가)/;
const PROHIBITED_CLAIM = /(업계\s*1위|국내\s*최초|100\s*%|완벽\s*보장|무조건\s*성공)/;

// 세상의 사업을 넓게 포괄하는 산업 좌표계. 좁은 예시로 LLM을 앵커링하지 않기 위해,
// 매번 여기서 서로 다른 분야를 무작위로 배정해 제안이 특정 계열로 쏠리지 않게 한다.
const SECTOR_UNIVERSE = [
  "식음료·카페", "베이커리·디저트", "밀키트·간편식", "건강식·영양식", "패션·의류", "뷰티·화장품",
  "홈·리빙 소품", "반려동물 용품·서비스", "유아·키즈", "시니어 케어·용품", "친환경·제로웨이스트",
  "수공예·핸드메이드", "굿즈·팬시", "피트니스·홈트레이닝", "요가·명상·마음챙김", "정신건강·심리상담",
  "수면·회복", "여성 건강", "영양·식단 관리", "성인 취미 교육", "어학·회화", "코딩·디지털 교육",
  "자녀 학습·교육 관리", "진로·커리어 코칭", "자격증·시험 대비", "시니어 디지털 교육", "크리에이터 지원",
  "영상·숏폼 제작", "뉴스레터·독립 미디어", "웹툰·일러스트", "음악·오디오", "사진·영상 기록", "출판·독립잡지",
  "인디 게임", "로컬 여행·동네 투어", "체험·원데이 클래스", "축제·이벤트 운영", "공간 대여·팝업",
  "소상공인 마케팅", "리뷰·평판 관리", "예약·고객 관리 도구", "회계·세무 보조", "채용·HR 보조",
  "재고·물류 보조", "문서·업무 자동화 도구", "데이터·리서치", "디자인·브랜딩 서비스", "청소·정리수납",
  "수리·유지보수", "이사·정착 지원", "세탁·의류 관리", "심부름·생활 대행", "웨딩·경조사",
  "재활용·업사이클", "중고·리커머스", "로컬푸드·농업 연계", "에너지 절약", "사회적경제·비영리 연계",
  "AI 자동화 도구", "노코드 솔루션", "커뮤니티·멤버십 플랫폼", "구독박스·정기배송", "매칭·중개 플랫폼",
  "자산·가계 관리 도구", "부동산·공간 활용", "모빌리티·이동", "스포츠·아웃도어", "취미·DIY 메이커",
] as const;

// 창업가에게 넓게 제시할 수익모델 원형.
const MODEL_ARCHETYPES = [
  "월 구독", "온디맨드 서비스", "중개·매칭 플랫폼", "마켓플레이스", "SaaS 도구", "주문 제작",
  "대여·렌탈", "큐레이션·셀렉트", "성과 기반 수수료", "라이선스·프랜차이즈", "콘텐츠·미디어(광고·후원)",
  "커뮤니티 멤버십", "전문 컨설팅", "체험·클래스", "구독박스·정기배송", "수리·애프터마켓",
] as const;

// 규제·자격 확인이 필요해 regulation을 높게 잡아야 하는 영역 힌트.
const REGULATED_HINTS = [
  "의료·건강 진단", "약국·의약품", "금융·투자·대출", "식품 제조·가공", "주류·담배",
  "교육시설·학원 인가", "돌봄·요양", "개인정보·민감정보 취급", "운송·중개 면허",
] as const;

function pickDistinct<T>(items: readonly T[], size: number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy.slice(0, Math.min(size, copy.length));
}

const ideaSchema = z.object({
  title: z.string().min(2).max(40),
  oneLiner: z.string().min(10).max(200),
  sector: z.string().min(2).max(30),
  model: z.string().min(2).max(30),
  customer: z.string().min(2).max(40),
  capital: z.enum(["소액", "중간", "높음"]),
  launchTime: z.string().min(2).max(20),
  revenue: z.string().min(2).max(40),
  stage: z.string().min(2).max(30),
  riasec: z.array(z.enum(["R", "I", "A", "S", "E", "C"])).min(1).max(3),
  founder: z
    .array(z.enum(["opportunity", "customer", "creation", "execution", "uncertainty", "scale"]))
    .min(1)
    .max(3),
  regulation: z.number().min(0).max(100),
  skills: z.array(z.string().min(1)).min(2).max(6),
  risk: z.string().min(10).max(200),
  firstTest: z.string().min(10).max(240),
});

type ProposedIdea = z.infer<typeof ideaSchema>;

function feasibilityFor(capital: Opportunity["capital"], regulation: number) {
  const base = capital === "소액" ? 80 : capital === "중간" ? 68 : 50;
  return Math.max(30, Math.min(90, base - Math.round(regulation * 0.25)));
}

function isFabricated(idea: ProposedIdea) {
  const text = `${idea.title} ${idea.oneLiner} ${idea.risk}`;
  return FABRICATED_METRIC.test(text) || PROHIBITED_CLAIM.test(text);
}

function toOpportunity(idea: ProposedIdea, index: number): Opportunity {
  return {
    id: `llm-${index}`,
    title: idea.title,
    oneLiner: idea.oneLiner,
    sector: idea.sector,
    model: idea.model,
    customer: idea.customer,
    capital: idea.capital,
    launchTime: idea.launchTime,
    revenue: idea.revenue,
    stage: idea.stage,
    riasec: [...new Set(idea.riasec)],
    founder: [...new Set(idea.founder)],
    market: 0,
    novelty: 0,
    feasibility: feasibilityFor(idea.capital, idea.regulation),
    evidenceStatus: "hypothesis",
    evidenceSources: [],
    regulation: Math.round(idea.regulation),
    skills: idea.skills,
    risk: idea.risk,
    firstTest: idea.firstTest,
    color: opportunityColors[index % opportunityColors.length],
  };
}

function buildPrompt(
  profile: FounderProfile,
  preferences: ManualPreferences | undefined,
  assignedSectors: string[],
) {
  const strengths = {
    관심성향: profile.topRiasec.map((axis) => riasecLabels[axis]),
    창업강점: profile.topFounder.map((axis) => founderLabels[axis]),
  };
  return {
    task: [
      `이 창업가에게 어울리는, 서로 완전히 다른 사업 아이디어 ${assignedSectors.length}개를 제안하세요.`,
      "assignedSectors에 배정된 각 분야에서 아이디어를 하나씩 만드세요. 분야 이름(sector)은 더 구체적으로 다듬어도 됩니다. 세상의 모든 산업이 대상이며 매번 새로운 사업을 만드세요.",
      "modelArchetypes를 넓게 활용해 수익 방식도 서로 다르게 하세요. 특정 계열(예: 동네 생활서비스)로 쏠리지 마세요.",
      "혼자 또는 소수 인원이 감당 가능한 자본으로 시작할 수 있는 형태로 구체화하세요. 큰 자본·대규모 팀·긴 인허가가 필수인 사업은 제외합니다. 다만 '몇 주 안에 고객을 만나 시험하라'고 강요하지 말고, 아이디어를 제대로 된 사업으로 구성하는 데 집중하세요.",
      "regulatedHints에 해당하는 영역이면 regulation을 60 이상으로 정직하게 매기고 risk에 확인 필요를 적으세요.",
      "시장 규모, 성장률, 고객 수, 매출, 제휴, 실적 같은 확인되지 않은 수치나 성과를 절대 만들어내지 마세요. 업계 1위·100% 보장 같은 과장 표현도 금지합니다.",
      "riasec는 R,I,A,S,E,C 중에서, founder는 opportunity,customer,creation,execution,uncertainty,scale 중에서 이 창업가의 강점과 맞는 것으로 고르세요.",
      "제목과 문장은 초보자가 바로 이해할 쉬운 한국어로 쓰세요. firstTest에는 고객을 꼭 만나야 하는 행동이 아니라, 이 아이디어를 사업으로 구체화하기 위해 가장 먼저 정하거나 만들어 볼 첫 걸음(범위·구성·설계·소규모 준비 등)을 적으세요.",
    ],
    founderStrengths: strengths,
    preferences: preferences ?? "제한 없음",
    assignedSectors,
    modelArchetypes: MODEL_ARCHETYPES,
    regulatedHints: REGULATED_HINTS,
    outputShape: "{\"ideas\": [{title, oneLiner, sector, model, customer, capital(소액|중간|높음), launchTime, revenue, stage, riasec[], founder[], regulation(0-100), skills[], risk, firstTest}]}",
  };
}

/**
 * 창업가 프로필에 맞춘 새 사업 아이디어를 LLM으로 즉석 생성한다.
 * 216 라이브러리 지식으로 현실성·규제를 앵커링하고, 지어낸 시장 수치·과장 표현이 든 후보는 버린다.
 * 키가 없거나, 응답이 형식을 어기거나, 통과한 후보가 2개 미만이면 빈 배열을 반환한다(호출부가 라이브러리로 폴백).
 */
export async function proposeIdeas(
  profile: FounderProfile,
  preferences: OpportunityProposalOptions["preferences"],
  runtimeConfig: OpenAIRuntimeConfig | null,
  count = 8,
): Promise<Opportunity[]> {
  if (!runtimeConfig?.apiKey) return [];
  const model = runtimeConfig.model || process.env.OPENAI_MODEL || "gpt-5.6-sol";
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${runtimeConfig.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "medium" },
        max_output_tokens: 6_000,
        text: { format: { type: "json_object" } },
        input: [
          {
            role: "system",
            content:
              "당신은 한국의 초보 창업가를 위한 사업 발굴 전략가입니다. 사용자 프로필에 맞춰 매번 새롭고 현실적인 사업 아이디어를 제안합니다. 확인되지 않은 사실·수치·성과를 절대 지어내지 말고, 반드시 설명 없이 유효한 JSON 객체 하나만 출력하세요.",
          },
          {
            role: "user",
            content: JSON.stringify(buildPrompt(profile, preferences, pickDistinct(SECTOR_UNIVERSE, count))),
          },
        ],
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return [];
  }
  if (!response.ok) return [];
  const payload = (await response.json().catch(() => null)) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  } | null;
  if (!payload) return [];
  const outputText =
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("");
  if (!outputText) return [];

  let ideas: unknown;
  try {
    ideas = (JSON.parse(outputText) as { ideas?: unknown }).ideas;
  } catch {
    return [];
  }
  if (!Array.isArray(ideas)) return [];

  const seenSectors = new Set<string>();
  const seenTitles = new Set<string>();
  const opportunities: Opportunity[] = [];
  for (const raw of ideas) {
    const parsed = ideaSchema.safeParse(raw);
    if (!parsed.success) continue;
    const idea = parsed.data;
    if (isFabricated(idea)) continue;
    const sectorKey = idea.sector.trim();
    const titleKey = idea.title.trim();
    if (seenSectors.has(sectorKey) || seenTitles.has(titleKey)) continue;
    seenSectors.add(sectorKey);
    seenTitles.add(titleKey);
    opportunities.push(toOpportunity(idea, opportunities.length));
  }

  // 통과한 후보가 너무 적으면 라이브러리 폴백이 낫다.
  return opportunities.length >= 2 ? opportunities : [];
}

export type OpportunityProposalOptions = {
  preferences?: ManualPreferences;
};
