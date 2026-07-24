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

const researchOutputSchema = z.object({
  evidence: z.array(z.object({
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
  })).min(1).max(6),
});

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
};

function outputText(payload: ResponsesPayload) {
  return payload.output_text ?? payload.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("");
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.searchParams.delete("utm_source");
    url.searchParams.delete("utm_medium");
    url.searchParams.delete("utm_campaign");
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function citations(payload: ResponsesPayload) {
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

function validDate(value: string, fallback: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function projectPrompt(project: ProjectRecord) {
  const setup = project.businessSetup;
  return {
    business: {
      title: String(project.opportunity.title ?? project.title),
      sector: String(project.opportunity.sector ?? ""),
      customer: String(project.opportunity.customer ?? ""),
      problem: String(project.opportunity.oneLiner ?? ""),
      model: String(project.opportunity.model ?? ""),
      revenue: String(project.opportunity.revenue ?? ""),
      region: setup?.region ?? "대한민국",
      archetype: setup?.archetype ?? "undecided",
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
      "JSON 객체 {evidence:[...]}만 출력하세요.",
    ],
  };
}

export async function researchOfficialMarketEvidence(
  project: ProjectRecord,
  config: OpenAIRuntimeConfig,
): Promise<{ evidence: MarketEvidence[]; citedSourceCount: number; model: string }> {
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
        max_output_tokens: 4_000,
        text: { format: { type: "json_object" } },
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
          { role: "user", content: JSON.stringify(projectPrompt(project)) },
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
    throw new Error(response.status === 429
      ? "OPENAI_429"
      : `MARKET_RESEARCH_FAILED:${payload.error?.message ?? response.status}`);
  }
  const text = outputText(payload);
  if (!text) throw new Error("MARKET_RESEARCH_EMPTY");
  const parsed = researchOutputSchema.parse(JSON.parse(text));
  const cited = citations(payload);
  const retrievedAt = new Date().toISOString();
  const retrievedDate = retrievedAt.slice(0, 10);
  const evidence = parsed.evidence.flatMap((item): MarketEvidence[] => {
    const normalized = normalizeUrl(item.sourceUrl);
    const citation = cited.get(normalized);
    if (!citation || !isOfficialEvidenceUrl(citation.url)) return [];
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
      region: item.region || project.businessSetup?.region || "대한민국",
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
  if (!evidence.length) throw new Error("MARKET_RESEARCH_NO_CITED_EVIDENCE");
  return { evidence, citedSourceCount: cited.size, model: config.model };
}
