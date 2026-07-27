import { completeJson, type LLMConfig } from "../llm/complete";
import { sanitizeBusinessClaimText } from "../quality/business-reality";
import type { PresentationDeckInput, PresentationSlide } from "./presentation-deck";

// 숫자·URL·표 기호가 들어간 문장은 손대지 않는다(재무일치·출처 게이트 보호).
const FORBIDDEN_IN_PROSE = /(\d|https?:\/\/|www\.|\||`)/;
// 의미 있는 서술만 다듬는다(짧은 라벨·단어는 원문 유지).
const MIN_PROSE_LENGTH = 24;
// 한 번에 다듬을 최대 문장 수(요청 크기 제한).
const MAX_FIELDS = 28;

type SlideField = { slideIndex: number; path: string; text: string };

// 슬라이드에서 "순수 서술" 필드만 주소와 함께 모은다.
// 대상: lead, statement, supporting, points[].detail, steps[].detail.
// 제외: title·eyebrow·note, 그리고 metrics/sources/chart/market/matrix/financial 등 수치·출처 필드.
function collectSlideProse(slides: PresentationSlide[]): SlideField[] {
  const fields: SlideField[] = [];
  const consider = (slideIndex: number, path: string, value: string | undefined) => {
    if (typeof value !== "string") return;
    const trimmed = value.trim();
    if (trimmed.length < MIN_PROSE_LENGTH) return;
    if (FORBIDDEN_IN_PROSE.test(trimmed)) return;
    fields.push({ slideIndex, path, text: trimmed });
  };
  slides.forEach((slide, index) => {
    consider(index, "lead", slide.lead);
    consider(index, "statement", slide.statement);
    consider(index, "supporting", slide.supporting);
    slide.points?.forEach((point, pointIndex) => consider(index, `points.${pointIndex}.detail`, point.detail));
    slide.steps?.forEach((step, stepIndex) => consider(index, `steps.${stepIndex}.detail`, step.detail));
  });
  return fields;
}

function applyField(slide: PresentationSlide, path: string, value: string) {
  if (path === "lead") slide.lead = value;
  else if (path === "statement") slide.statement = value;
  else if (path === "supporting") slide.supporting = value;
  else {
    const [group, indexText] = path.split(".");
    const index = Number(indexText);
    if (group === "points" && slide.points?.[index]) slide.points[index].detail = value;
    else if (group === "steps" && slide.steps?.[index]) slide.steps[index].detail = value;
  }
}

async function requestEnrichedSlideProse(
  config: LLMConfig,
  input: PresentationDeckInput,
  texts: string[],
): Promise<string[] | null> {
  const approxInputChars = texts.reduce((sum, text) => sum + text.length, 0);
  const parsed = await completeJson(config, {
    system:
      "당신은 한국의 초기 창업 발표자료(사업소개서·투자제안서 IR)를 다듬는 선임 사업전략가입니다. 주어진 슬라이드 서술 문장들을 이 사업에만 해당하는 구체적이고 설득력 있는 발표용 한국어 문장으로 다시 씁니다. 규칙: (1) 문장의 원래 의미와 순서를 유지하고 개수를 그대로 두세요. (2) 어떤 숫자, 통계, 금액, 비율, 날짜, 인원수도 새로 추가하지 마세요. 입력에 숫자가 없으므로 결과에도 숫자가 없어야 합니다. (3) 고객 인터뷰·판매·매출·시장 규모·성장률·경력·수상·특허·제휴·후기·경쟁사·인터넷 주소를 절대 만들어내지 마세요. (4) 업계 1위, 최고, 100%, 성공 보장 같은 과장·단정 표현을 금지합니다. (5) 발표 슬라이드에 맞게 간결하되 업종·고객·모델 맥락을 반영해 다른 사업에 복사하면 어색한 문장으로 구체화하고, 근거가 없는 내용은 계획·가정으로 표현하세요. 반드시 {\"lines\": [문자열, ...]} 형태의 유효한 JSON 하나만, 입력과 같은 개수로 출력하세요.",
    user: JSON.stringify({
      business: {
        brandName: input.brandName,
        title: input.title,
        oneLiner: input.oneLiner,
        customer: input.customer,
        model: input.model,
        sector: input.sector,
        deckType: input.deckType === "ir" ? "투자제안서(IR)" : "사업소개서",
      },
      lines: texts,
    }),
    maxOutputTokens: Math.min(9_000, 2_000 + approxInputChars * 3),
    effort: "medium",
    timeoutMs: 120_000,
  });
  if (!parsed) return null;
  const result = parsed.lines;
  if (!Array.isArray(result) || result.length !== texts.length) return null;
  if (!result.every((item): item is string => typeof item === "string" && item.trim().length > 0)) return null;
  return result.map((item) => item.trim());
}

/**
 * 발표자료 슬라이드의 순수 서술 문장만 LLM으로 사업별 심화한다.
 * 제목·수치·출처·차트·재무 필드는 손대지 않아 재무일치·사실성 게이트를 그대로 통과한다.
 * LLM 키가 없거나, 응답이 규칙(숫자 미추가·길이·개수·과장 금지)을 어기면 원본 슬라이드를 그대로 반환한다(안전 무동작).
 */
export async function enrichDeckNarrative(
  input: PresentationDeckInput,
  slides: PresentationSlide[],
  config: LLMConfig | null,
): Promise<PresentationSlide[]> {
  if (!config?.apiKey) return slides;
  const collected = collectSlideProse(slides).slice(0, MAX_FIELDS);
  if (collected.length === 0) return slides;

  const enriched = await requestEnrichedSlideProse(config, input, collected.map((field) => field.text));
  if (!enriched) return slides;

  // 문장 단위 검증: 숫자·URL·표 기호 신규 유입 금지, 크게 짧아지면 폐기, 과장·허위 실적이면 폐기.
  // 하나라도 규칙을 어기면 전체를 버리고 원본을 유지한다(전부 아니면 전무).
  for (let i = 0; i < enriched.length; i += 1) {
    const candidate = enriched[i];
    if (FORBIDDEN_IN_PROSE.test(candidate)) return slides;
    if (candidate.length < collected[i].text.length * 0.8) return slides;
    if (sanitizeBusinessClaimText(candidate).changedCount > 0) return slides;
  }

  const next = structuredClone(slides);
  collected.forEach((field, i) => applyField(next[field.slideIndex], field.path, enriched[i]));
  return next;
}
