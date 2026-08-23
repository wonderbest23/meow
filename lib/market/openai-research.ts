import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { OpenAIRuntimeConfig } from "../openai/session-config";
import type { ProjectRecord } from "../service-domain";
import { isOfficialEvidenceUrl, type MarketEvidence } from "./domain";

const allowedDomains = [
  "kosis.kr",
  "kostat.go.kr",
  "sgis.kostat.go.kr",
  "data.go.kr",
  "sbiz.or.kr",
  "semas.or.kr",
  "golmok.seoul.go.kr",
  "data.seoul.go.kr",
  "data.gg.go.kr",
  "k-startup.go.kr",
  "bizinfo.go.kr",
  "work24.go.kr",
  "mss.go.kr",
] as const;

const evidenceItemSchema = z.object({
  title: z.string().trim().min(2).max(200),
  metric: z.string().trim().min(2).max(100),
  value: z.string().trim().min(1).max(300),
  numericValue: z.number().finite().min(0).max(1_000_000_000_000).nullable().default(null),
  unit: z.string().trim().max(30).default(""),
  region: z.string().trim().max(100).default(""),
  sourceName: z.string().trim().min(2).max(150),
  sourceUrl: z.string().url(),
  observedAt: z.string().trim().max(40).default(""),
  note: z.string().trim().max(1_000).default(""),
  sourceExcerpt: z.string().trim().max(2_000).default(""),
});

/*
 * 항목을 하나씩 검증한다.
 *
 * 예전에는 배열 전체를 한 번에 parse 해서, 다섯 건 중 한 건에 빈 unit 이나
 * 잘린 주소가 섞이면 멀쩡한 네 건까지 같이 버려졌다(운영에서 실제로
 * WEB_SEARCH_PARSE_FAILED 로 나왔다). 근거의 안전성은 아래 인용 대조가
 * 지키므로, 여기서는 형태가 어긋난 항목만 떨어뜨린다.
 */
export function parseEvidenceItems(parsed: unknown): { items: z.infer<typeof evidenceItemSchema>[]; dropped: string[] } {
  const raw = (parsed as { evidence?: unknown })?.evidence;
  if (!Array.isArray(raw)) return { items: [], dropped: ["evidence 배열이 없음"] };
  const items: z.infer<typeof evidenceItemSchema>[] = [];
  const dropped: string[] = [];
  for (const candidate of raw.slice(0, 12)) {
    const result = evidenceItemSchema.safeParse(candidate);
    if (result.success) items.push(result.data);
    else dropped.push(result.error.issues.map((i) => `${i.path.join(".")}:${i.code}`).join(","));
  }
  return { items, dropped };
}

type UrlCitation = { url: string; title: string };

type ResponsesPayload = {
  output_text?: string;
  output?: Array<{
    type?: string;
    action?: { sources?: Array<{ url?: string; title?: string }> };
    content?: Array<{
      type?: string;
      text?: string;
      annotations?: Array<{ type?: string; url?: string; title?: string }>;
    }>;
  }>;
  error?: { message?: string };
  status?: string;
  incomplete_details?: { reason?: string };
};

function outputText(payload: ResponsesPayload) {
  return payload.output_text ?? payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("");
}

/*
 * 같은 원문을 가리키는 주소를 같은 열쇠로 만든다.
 *
 * 모델이 적어 온 주소와 검색이 실제로 돌려준 주소는 프로토콜·www·끝 슬래시·
 * 추적 파라미터에서 갈리기 쉽다. 문자열을 그대로 비교하면 멀쩡한 공식 자료를
 * 버린다. 반대로 너무 뭉개면 서로 다른 통계표가 하나로 합쳐지므로,
 * 경로와 의미 있는 질의는 그대로 둔다(kosis 는 질의로 표를 구분한다).
 */
const TRACKING_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "spm", "ref"];

export function normalizeUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";
    url.port = "";
    for (const key of TRACKING_PARAMS) url.searchParams.delete(key);
    url.searchParams.sort();
    const query = url.searchParams.toString();
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.hostname}${path}${query ? `?${query}` : ""}`;
  } catch {
    return "";
  }
}

/** 응답에 실제로 담긴 검색 출처만 모은다 — 모델이 본문에 쓴 주소는 여기 들어오지 않는다 */
export function extractActualSearchSources(payload: ResponsesPayload) {
  const found = new Map<string, UrlCitation>();
  for (const item of payload.output ?? []) {
    for (const source of item.action?.sources ?? []) {
      if (!source.url) continue;
      found.set(normalizeUrl(source.url), { url: source.url, title: source.title ?? "공식 원문" });
    }
    for (const content of item.content ?? []) {
      for (const annotation of content.annotations ?? []) {
        if (annotation.type !== "url_citation" || !annotation.url) continue;
        found.set(normalizeUrl(annotation.url), {
          url: annotation.url,
          title: annotation.title ?? "공식 원문",
        });
      }
    }
  }
  return found;
}

/*
 * 본문에서 JSON 객체를 꺼낸다.
 *
 * web_search 를 쓰면 OpenAI 가 JSON 모드를 거부하므로(아래 요청 본문 주석 참고)
 * 응답은 평문으로 온다. 모델이 코드펜스를 두르거나 앞뒤에 한 문장을 덧붙이는
 * 경우까지만 받아주고, 그 이상은 복원하지 않는다 — 깨진 근거를 억지로 살리는
 * 것보다 근거 0건으로 실패하는 편이 낫다.
 */
export function extractJsonObject(raw: string): unknown {
  const text = raw.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
  const start = text.indexOf("{");
  if (start < 0) return null;
  // 문자열 안의 중괄호를 세지 않도록 따옴표·이스케이프를 추적한다
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === "\\") { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function validDate(value: string, fallback: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

/*
 * 조사에 실제로 쓰이는 사업 정보.
 *
 * 이 함수는 ProjectRecord 전체가 아니라 아래 여덟 값만 읽는다. 프로젝트가
 * 없는 사업계획서(plan-builder)도 같은 조사를 쓰려고 입력을 이 모양으로
 * 넓혔다 — ProjectRecord 를 넘기던 기존 호출부는 그대로 동작한다.
 */
export interface MarketResearchBusinessContext {
  title?: string;
  sector?: string;
  customer?: string;
  problem?: string;
  model?: string;
  revenue?: string;
  region?: string;
  archetype?: string;
}

export type MarketResearchInput = ProjectRecord | MarketResearchBusinessContext;

function isProjectRecord(input: MarketResearchInput): input is ProjectRecord {
  return typeof (input as ProjectRecord).opportunity === "object" && (input as ProjectRecord).opportunity !== null;
}

/** ProjectRecord 에서 조사용 사업 정보만 뽑는다 */
export function projectResearchContext(project: ProjectRecord): MarketResearchBusinessContext {
  const setup = project.businessSetup;
  return {
    title: String(project.opportunity.title ?? project.title),
    sector: String(project.opportunity.sector ?? ""),
    customer: String(project.opportunity.customer ?? ""),
    problem: String(project.opportunity.oneLiner ?? ""),
    model: String(project.opportunity.model ?? ""),
    revenue: String(project.opportunity.revenue ?? ""),
    region: setup?.region ?? "대한민국",
    archetype: setup?.archetype ?? "undecided",
  };
}

function projectPrompt(context: MarketResearchBusinessContext) {
  return {
    business: {
      title: context.title ?? "",
      sector: context.sector ?? "",
      customer: context.customer ?? "",
      problem: context.problem ?? "",
      model: context.model ?? "",
      revenue: context.revenue ?? "",
      region: context.region || "대한민국",
      archetype: context.archetype || "undecided",
    },
    task: [
      "위 사업의 수요·고객 규모·사업체 또는 경쟁 현황·소비나 산업 변화를 설명할 수 있는 한국 공식 자료를 3~5개 찾으세요.",
      "검색 결과 요약이나 블로그가 아니라 통계표, 공공데이터, 정부·공공기관 원문만 사용하세요.",
      "원문에서 직접 확인한 측정값만 evidence에 넣으세요. 숫자나 기준을 확인하지 못한 자료는 넣지 마세요.",
      "numericValue는 단위를 제거한 숫자 하나로 표현할 수 있을 때만 입력하고, 비율·범위·복합값이면 null로 두세요.",
      "observedAt은 통계의 실제 기준일을 YYYY-MM-DD로 확인한 경우만 쓰고, 모르면 빈 문자열로 두세요.",
      "sourceUrl은 검색에서 확인한 공식 원문 주소를 정확히 복사하세요. 존재하지 않는 주소를 만들지 마세요.",
      "note에는 이 수치를 이 사업에 적용할 때의 범위와 주의점을 한 문장으로 적으세요.",
      "sourceExcerpt에는 원문이 무엇을 집계한 자료인지 짧게 요약하세요. 긴 문장을 그대로 복사하지 마세요.",
      /*
       * 열쇠 이름을 전부 적어 준다.
       *
       * 예전에는 JSON 모드가 형태를 강제한다고 보고 이름을 적지 않았는데, 그 JSON 모드가
       * 웹 검색과 함께 쓸 수 없어서 이 조사는 한 번도 성공한 적이 없었다. 평문으로 받는
       * 지금은 이름을 말해 주지 않으면 모델이 제 나름의 이름을 쓴다 — 운영 실측에서
       * title·metric·sourceName 이 통째로 빠져 다섯 건이 전부 버려졌다.
       */
      "응답은 JSON 객체 하나만 쓰세요. 설명 문장, 인사말, 코드펜스를 앞뒤에 붙이지 마세요.",
      "형식은 정확히 다음과 같습니다. 열쇠 이름을 바꾸거나 빠뜨리지 마세요.",
      "{\"evidence\":[{\"title\":\"자료 이름\",\"metric\":\"무엇을 센 수치인지\",\"value\":\"원문 표기 그대로\",\"numericValue\":123 또는 null,\"unit\":\"단위\",\"region\":\"지역\",\"sourceName\":\"기관·통계 이름\",\"sourceUrl\":\"원문 주소\",\"observedAt\":\"YYYY-MM-DD 또는 빈 문자열\",\"note\":\"적용 시 주의\",\"sourceExcerpt\":\"원문이 무엇을 집계했는지 요약\"}]}",
    ],
  };
}

export async function researchOfficialMarketEvidence(
  input: MarketResearchInput,
  config: OpenAIRuntimeConfig,
): Promise<{ evidence: MarketEvidence[]; citedSourceCount: number; model: string }> {
  const context = isProjectRecord(input) ? projectResearchContext(input) : input;
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        store: false,
        reasoning: { effort: "medium" },
        /*
         * 출력 상한.
         *
         * 4,000 이었을 때 세 사업 중 둘이 MARKET_RESEARCH_EMPTY 로 끝났다.
         * 검색을 열 번 넘게 돌면 추론 토큰만 2,700 을 쓰고(실측), 남은 몫으로는
         * 근거 다섯 건의 한국어 본문과 긴 통계표 주소를 다 적지 못해 최종 메시지가
         * 통째로 잘린다. 성공한 사업도 3,715 로 상한에 붙어 있었다.
         * 실사용은 4~5천이고 나머지는 여유분이다 — 상한이지 목표가 아니다.
         */
        max_output_tokens: 12_000,
        /*
         * 출력 형식을 지정하지 않는다 — 평문으로 받는다.
         *
         * 예전에는 text.format = json_object 였고, 그래서 이 조사는 운영에서
         * 한 번도 성공한 적이 없다. OpenAI 가 웹 검색과 JSON 모드를 같이 쓰는
         * 요청을 400 으로 거부한다("Web Search cannot be used with JSON mode").
         * 구조는 API 형식이 아니라 아래 extractJsonObject + Zod 로 잡는다.
         */
        tools: [{
          type: "web_search",
          search_context_size: "high",
          filters: { allowed_domains: allowedDomains },
        }],
        tool_choice: "required",
        include: ["web_search_call.action.sources"],
        input: [
          {
            role: "system",
            content: "당신은 한국 초기 사업의 시장 근거를 조사하는 분석가입니다. 검색한 공식 원문에 실제로 적힌 사실만 구조화하고, 추정·모델 기억·홍보성 문구·존재하지 않는 수치와 주소를 만들지 마세요.",
          },
          { role: "user", content: JSON.stringify(projectPrompt(context)) },
        ],
      }),
      signal: AbortSignal.timeout(150_000),
    });
  } catch (error) {
    throw new Error(error instanceof Error && error.name === "TimeoutError"
      ? "MARKET_RESEARCH_TIMEOUT"
      : "MARKET_RESEARCH_UNAVAILABLE");
  }
  const payload = await response.json() as ResponsesPayload;
  if (!response.ok) {
    /* 운영 로그에서 원인을 구분한다 — 사용자에게 보이는 문구는 route 가 정한다 */
    throw new Error(response.status === 429
      ? "OPENAI_429"
      : `WEB_SEARCH_API_REJECTED:${payload.error?.message ?? response.status}`);
  }
  const text = outputText(payload);
  if (!text) {
    /* 왜 비었는지 구분한다 — 출력 상한에 잘린 것과 모델이 아무것도 못 찾은 것은 대응이 다르다 */
    const reason = payload.incomplete_details?.reason ?? payload.status ?? "unknown";
    throw new Error(reason === "max_output_tokens" ? "WEB_SEARCH_OUTPUT_TRUNCATED" : `MARKET_RESEARCH_EMPTY:${reason}`);
  }

  const cited = extractActualSearchSources(payload);
  /* 검색이 아예 돌지 않았으면 뒤 단계를 볼 필요가 없다 */
  if (!cited.size) throw new Error("WEB_SEARCH_NO_SOURCES");

  const { items, dropped } = parseEvidenceItems(extractJsonObject(text));
  if (dropped.length) console.warn("[market-research] 형태가 어긋난 근거 후보를 버렸습니다:", dropped.join(" | "));
  if (!items.length) throw new Error(`WEB_SEARCH_PARSE_FAILED:${dropped.join(" | ").slice(0, 300) || "본문에서 JSON 을 찾지 못함"}`);
  const retrievedAt = new Date().toISOString();
  const retrievedDate = retrievedAt.slice(0, 10);
  /* 인용 대조에서 몇 건이 떨어졌는지 — 모델이 실제로 없는 주소를 쓰는 빈도를 운영에서 보기 위해 */
  let uncited = 0;
  const evidence = items.flatMap((item): MarketEvidence[] => {
    const normalized = normalizeUrl(item.sourceUrl);
    const citation = cited.get(normalized);
    if (!citation || !isOfficialEvidenceUrl(citation.url)) {
      uncited += 1;
      return [];
    }
    const observedAt = validDate(item.observedAt, retrievedDate);
    const dateNotice = item.observedAt
      ? ""
      : " 통계 기준일은 원문에서 한 번 더 확인해야 하며, 현재 날짜는 검색일입니다.";
    return [{
      id: randomUUID(),
      sourceType: "official_report",
      title: item.title,
      metric: item.metric,
      value: item.value,
      numericValue: item.numericValue,
      unit: item.unit,
      region: item.region || context.region || "대한민국",
      sourceName: item.sourceName || citation.title,
      sourceUrl: citation.url,
      observedAt,
      note: `${item.note}${dateNotice}`.trim(),
      verification: "needs_review",
      verificationMethod: "none",
      sourceExcerpt: item.sourceExcerpt,
      retrievedAt,
      contentHash: createHash("sha256").update(JSON.stringify({ ...item, sourceUrl: citation.url, retrievedAt })).digest("hex"),
      attestation: "",
      isDemo: false,
    }];
  });
  if (uncited) console.warn(`[market-research] 실제 검색 출처에 없거나 공식 도메인이 아니어서 버린 근거 ${uncited}건 (후보 ${items.length}건, 검색 출처 ${cited.size}개)`);
  /* 검색은 돌았지만 실제 인용에 존재하는 공식 근거가 하나도 없으면 성공이 아니다 */
  if (!evidence.length) throw new Error("WEB_SEARCH_NO_CITED_EVIDENCE");
  return { evidence, citedSourceCount: cited.size, model: config.model };
}
