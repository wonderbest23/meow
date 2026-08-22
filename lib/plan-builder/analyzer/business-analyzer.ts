/*
 * Business Analyzer — 사업 설명 → 구조화된 분석. LLM 1회.
 *
 * 처리 순서(고정): LLM → 텍스트 → JSON.parse → Zod → 태그 화이트리스트 → normalize.
 * 어느 단계든 실패하면 null 을 돌려주고, 호출부는 기존 위저드로 폴백한다.
 * 서버 전용 — 클라이언트에서 import 하지 않는다.
 */
import { completeText, parseJsonObject, type LLMConfig } from "../../llm/complete";
import { MODEL_TAGS, OPERATION_TAGS, PRIMARY_INDUSTRIES, normalizeAnalysis, type BusinessAnalysis } from "./domain";
import { CORE_SLOTS, PACKS } from "./packs";

export interface AnalyzerInput {
  name?: string;
  description: string;
  industry?: string;
  region?: string;
  stage?: string;
}

function tagList(dict: Record<string, string>): string {
  return Object.entries(dict)
    .map(([k, v]) => `${k}(${v})`)
    .join(", ");
}

/*
 * 시스템 프롬프트는 호출마다 똑같다 — 태그 사전·슬롯 목록이 전부 여기 있다.
 * 되풀이되는 호출이므로 cache: true 대상이다.
 */
export const ANALYZER_SYSTEM = [
  "당신은 한국 소상공인·초기 창업의 사업 구조를 분석하는 분석가입니다.",
  "사용자가 적은 사업 설명을 읽고 JSON 객체 하나로 구조화합니다. 사용자가 말하지 않은 것을 사실로 확정하지 마세요.",
  "",
  "[status 규칙 — 절대 어기지 마세요]",
  "- 사용자가 문장에서 직접 말한 것만 status=\"confirmed\"",
  "- 업종 상식으로 짐작한 것은 status=\"inferred\" 로 표시하고 confidence(0~1)를 붙이세요",
  "- 모르는 것은 value=null, status=\"unknown\"",
  "- 가격·인원·횟수·비용·매출·시장 규모·대표자 경험·성과 같은 숫자와 실적은 사용자가 적지 않았다면 절대 만들지 마세요. 전부 unknown 입니다",
  "",
  "[primary — 아래 9개 중 하나만]",
  PRIMARY_INDUSTRIES.join(" | "),
  "",
  "[modelTags — 돈 버는 방식. 아래 목록의 영문 키만 사용. 보통 1~2개]",
  tagList(MODEL_TAGS),
  "",
  "[operationTags — 운영·전달·고객·유입·도메인. 아래 목록의 영문 키만 사용. 3~8개]",
  tagList(OPERATION_TAGS),
  "",
  "[gapHints — 사업계획서를 쓰려면 꼭 필요한데 아직 없는 정보. 아래 슬롯 id 중에서만 고르고 why 는 쉬운 한국어 한 줄]",
  [...CORE_SLOTS, ...Object.values(PACKS).flatMap((p) => p.slots)].map((s) => `${s.id}(${s.label})`).join(", "),
  "",
  "[출력 형식]",
  "{",
  '  "primary": {"value": "교육·강의", "status": "inferred", "confidence": 0.9},',
  '  "modelTags": {"value": ["class"], "status": "confirmed"},',
  '  "operationTags": {"value": ["offline","b2c","reservation","pet","content_led"], "status": "inferred"},',
  '  "customer": {"value": "반려견 보호자", "status": "inferred"},',
  '  "problem": {"value": null, "status": "unknown"},',
  '  "solution": {"value": "반려견 케이크 원데이 클래스", "status": "confirmed"},',
  '  "revenueModel": {"value": "수강료", "status": "inferred"},',
  '  "deliveryModel": {"value": "오프라인 대면 · 예약제", "status": "inferred"},',
  '  "acquisitionChannels": {"value": ["인스타그램","유튜브 숏폼"], "status": "confirmed"},',
  '  "keyCosts": {"value": ["공간 대관","재료비","광고비"], "status": "inferred"},',
  '  "stage": {"value": "아이디어 단계", "status": "inferred"},',
  '  "region": {"value": null, "status": "unknown"},',
  '  "gapHints": [{"slot": "classPrice", "why": "수강료가 없으면 매출을 계산할 수 없어요"}],',
  '  "summaryForUser": "반려견 보호자를 대상으로, SNS 영상으로 모객해 오프라인 원데이 클래스를 운영하는 사업으로 이해했어요."',
  "}",
  "",
  "- customer / problem / solution / revenueModel / deliveryModel 의 value 는 사용자가 읽을 짧은 한국어 구(句)로 쓰세요 (영문 키 아님).",
  "- summaryForUser 는 사용자가 읽고 맞다/아니다를 판단할 수 있게 한 문장으로, 반드시 '~로 이해했어요' 로 끝내세요.",
  "- 설명이나 코드펜스 없이 JSON 객체 하나만 출력하세요.",
].join("\n");

export function analyzerUserPrompt(input: AnalyzerInput): string {
  return [
    "[사업 설명]",
    input.description.trim().slice(0, 1500),
    "",
    "[이미 입력된 사업 정보 — 있으면 참고. 비어 있으면 무시]",
    input.name ? `- 사업명: ${input.name}` : "",
    input.industry ? `- 업종(사용자 선택): ${input.industry}` : "",
    input.region ? `- 지역: ${input.region}` : "",
    input.stage ? `- 단계: ${input.stage}` : "",
    "",
    "위 설명을 분석해 JSON 객체 하나만 출력하세요.",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

/**
 * 분석 실행. 실패하면 null.
 * 사용자가 업종을 이미 골랐다면 그 값은 confirmed 로 덮는다 — 사람이 고른 것이 추론보다 우선이다.
 */
export async function analyzeBusiness(config: LLMConfig, input: AnalyzerInput): Promise<BusinessAnalysis | null> {
  const text = await completeText(config, {
    kind: "plan-analyze",
    system: ANALYZER_SYSTEM,
    user: analyzerUserPrompt(input),
    maxOutputTokens: 1400,
    effort: "low",
    jsonObject: true,
    cache: true,
    timeoutMs: 45_000,
  });
  if (!text) return null;
  const obj = parseJsonObject(text);
  if (!obj) return null;
  const analysis = normalizeAnalysis(obj);
  if (!analysis) return null;
  if (input.industry && (PRIMARY_INDUSTRIES as readonly string[]).includes(input.industry)) {
    analysis.primary = { value: input.industry, status: "confirmed" };
  }
  if (input.region?.trim()) analysis.region = { value: input.region.trim(), status: "confirmed" };
  if (input.stage?.trim()) analysis.stage = { value: input.stage.trim(), status: "confirmed" };
  return analysis;
}
