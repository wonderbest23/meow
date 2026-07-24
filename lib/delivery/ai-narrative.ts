import type { ProjectRecord } from "../service-domain";
import type { OpenAIRuntimeConfig } from "../openai/session-config";
import { sanitizeBusinessReality } from "../quality/business-reality";

// 서술 강화 대상에서 제외할 구조적 라인(제목·목록·표·인용·코드펜스).
const STRUCTURE_PREFIX = /^\s*(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||```)/;
// 순수 서술 문단에 있으면 강화 대상에서 제외하는 토큰.
// 숫자·URL·표 기호를 포함한 문단은 재무일치/출처 게이트를 깰 수 있어 원문 그대로 둔다.
const FORBIDDEN_IN_PROSE = /(\d|https?:\/\/|www\.|\||`)/;
// 사실성·출처 게이트가 검사하는 문구가 든 문단은 손대지 않는다.
const GATE_KEYWORDS = /(출처|확인 필요|검증할 가정|추가 확인|가정:|근거 자료|참고 링크|기준일)/;

const documentLabels: Record<string, string> = {
  plan: "근거 기반 사업계획서",
  operations: "영업 운영 준비서",
  grants: "공공지원사업 신청서 본문",
  execution: "실행 결과 검증 보고서",
};

function isEnrichableParagraph(chunk: string): boolean {
  const lines = chunk.split("\n");
  if (lines.some((line) => STRUCTURE_PREFIX.test(line))) return false;
  if (FORBIDDEN_IN_PROSE.test(chunk)) return false;
  if (GATE_KEYWORDS.test(chunk)) return false;
  return chunk.trim().length >= 40;
}

function businessContext(project: ProjectRecord) {
  const opportunity = project.opportunity;
  const setup = project.businessSetup;
  return {
    title: opportunity.title ?? project.title,
    oneLiner: opportunity.oneLiner ?? null,
    customer: opportunity.customer ?? null,
    sector: opportunity.sector ?? null,
    model: opportunity.model ?? null,
    region: setup?.region ?? null,
    archetype: setup?.archetype ?? null,
    legalForm: setup?.legalForm ?? null,
  };
}

async function requestEnrichedParagraphs(
  config: OpenAIRuntimeConfig,
  documentId: string,
  context: ReturnType<typeof businessContext>,
  paragraphs: string[],
): Promise<string[] | null> {
  const model = config.model || process.env.OPENAI_MODEL || "gpt-5.6-sol";
  const approxInputChars = paragraphs.reduce((sum, text) => sum + text.length, 0);
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        reasoning: { effort: "medium" },
        max_output_tokens: Math.min(9_000, 2_000 + approxInputChars * 3),
        text: { format: { type: "json_object" } },
        input: [
          {
            role: "system",
            content:
              "당신은 한국에서 실제로 실행할 사업 문서를 다듬는 선임 사업전략가입니다. 주어진 서술 문단들을 이 사업에만 해당하는 구체적이고 깊이 있는 문장으로 다시 씁니다. 이 작업은 소설·광고 창작이 아닙니다. 규칙: (1) 문단의 원래 의미와 순서를 유지하고 개수를 그대로 두세요. (2) 어떤 숫자, 통계, 금액, 비율, 날짜, 인원수도 새로 추가하지 마세요. 원문에 숫자가 없으므로 결과에도 숫자가 없어야 합니다. (3) 고객 인터뷰·판매·매출·시장 규모·성장률·경력·수상·특허·제휴·후기·경쟁사·인터넷 주소를 절대 만들어내지 마세요. (4) 과장, 성공 보장, 업계 1위, 100% 같은 표현을 금지합니다. (5) 업종·고객·지역 맥락을 반영해 다른 사업에 복사하면 어색한 문장으로 구체화하되, 근거가 없는 사실은 미래형·조건형(‘~할 계획입니다’, ‘~로 가정합니다’)으로 표현하세요. 반드시 {\"paragraphs\": [문자열, ...]} 형태의 유효한 JSON 하나만, 입력과 같은 개수로 출력하세요.",
          },
          {
            role: "user",
            content: JSON.stringify({
              document: documentLabels[documentId] ?? documentId,
              business: context,
              paragraphs,
            }),
          },
        ],
      }),
      signal: AbortSignal.timeout(150_000),
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const payload = (await response.json().catch(() => null)) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  } | null;
  if (!payload) return null;
  const outputText =
    payload.output_text ??
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("");
  if (!outputText) return null;
  try {
    const parsed = JSON.parse(outputText) as { paragraphs?: unknown };
    const result = parsed.paragraphs;
    if (!Array.isArray(result) || result.length !== paragraphs.length) return null;
    if (!result.every((item): item is string => typeof item === "string" && item.trim().length > 0)) {
      return null;
    }
    return result.map((item) => item.trim());
  } catch {
    return null;
  }
}

/**
 * 서버 템플릿으로 생성된 문서 마크다운의 순수 서술 문단만 LLM으로 사업별 심화한다.
 * 숫자·표·제목·출처/가정 라인은 손대지 않아 재무일치·품질·사실성 게이트를 그대로 통과한다.
 * OpenAI 키가 없거나, 응답이 규칙을 어기거나, 사실성 검수를 통과하지 못하면 원문을 그대로 반환한다(안전 무동작).
 */
export async function enrichDocumentNarrative(
  project: ProjectRecord,
  documentId: string,
  markdown: string,
  runtimeConfig: OpenAIRuntimeConfig | null,
): Promise<string> {
  if (!runtimeConfig?.apiKey || !markdown.trim()) return markdown;

  const parts = markdown.split(/(\n{2,})/);
  const targets: number[] = [];
  for (let index = 0; index < parts.length; index += 2) {
    if (isEnrichableParagraph(parts[index])) targets.push(index);
  }
  if (targets.length === 0) return markdown;

  // 한 문서당 최대 24개 문단까지만 강화해 요청 크기를 제한한다.
  const capped = targets.slice(0, 24);
  const sourceText = capped.map((index) => parts[index].trim());

  const enriched = await requestEnrichedParagraphs(
    runtimeConfig,
    documentId,
    businessContext(project),
    sourceText,
  );
  if (!enriched) return markdown;

  // 각 강화 문단 검증: 숫자·URL·표 기호가 없어야 하고, 원문보다 크게 짧아지면 버린다.
  for (let i = 0; i < enriched.length; i += 1) {
    const candidate = enriched[i];
    if (FORBIDDEN_IN_PROSE.test(candidate)) return markdown;
    if (candidate.length < sourceText[i].length * 0.8) return markdown;
  }

  const next = [...parts];
  capped.forEach((index, i) => {
    const original = parts[index];
    const leading = original.match(/^\s*/)?.[0] ?? "";
    const trailing = original.match(/\s*$/)?.[0] ?? "";
    next[index] = `${leading}${enriched[i]}${trailing}`;
  });
  const rebuilt = next.join("");

  // 전체 분량이 줄면(최소 글자수 게이트 위험) 버린다.
  if (rebuilt.length < markdown.length) return markdown;

  // 사실성 안전망: 강화 결과가 사실성 검수에서 한 문장이라도 치환되면 원문을 유지한다.
  const safety = sanitizeBusinessReality(project, rebuilt);
  if (safety.changedCount > 0) return markdown;

  return rebuilt;
}
