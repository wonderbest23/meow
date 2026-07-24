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
import {
  ideaDomainReference,
  ideaMechanismReference,
  opportunityColors,
  type ManualPreferences,
} from "../idea-generator";

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

function buildPrompt(profile: FounderProfile, preferences: ManualPreferences | undefined, count: number) {
  const strengths = {
    관심성향: profile.topRiasec.map((axis) => riasecLabels[axis]),
    창업강점: profile.topFounder.map((axis) => founderLabels[axis]),
  };
  return {
    task: [
      `이 창업가에게 어울리는, 서로 완전히 다른 사업 아이디어 ${count}개를 제안하세요.`,
      "매번 새롭게 만들어야 합니다. 아래 참고 목록을 그대로 복사하지 말고, 영감과 현실성·규제 감각만 얻어 새로운 도메인과 조합을 자유롭게 만드세요.",
      "각 아이디어는 서로 다른 분야(sector)여야 하고, 2026년 한국에서 실제로 시험 가능한 소규모 사업이어야 합니다.",
      "시장 규모, 성장률, 고객 수, 매출, 제휴, 실적 같은 확인되지 않은 수치나 성과를 절대 만들어내지 마세요. 업계 1위·100% 보장 같은 과장 표현도 금지합니다.",
      "인허가·자격이 필요한 분야(의료·약국·금융·식품 등)는 regulation 값을 높게(60 이상) 정직하게 매기고 risk에 확인 필요를 적으세요.",
      "riasec는 R,I,A,S,E,C 중에서, founder는 opportunity,customer,creation,execution,uncertainty,scale 중에서 이 창업가의 강점과 맞는 것으로 고르세요.",
      "제목과 문장은 초보자가 바로 이해할 쉬운 한국어로 쓰고, firstTest에는 첫 고객을 만나 확인할 구체적 행동을 적으세요.",
    ],
    founderStrengths: strengths,
    preferences: preferences ?? "제한 없음",
    referenceDomains: ideaDomainReference,
    referenceMechanisms: ideaMechanismReference,
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
          { role: "user", content: JSON.stringify(buildPrompt(profile, preferences, count)) },
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
