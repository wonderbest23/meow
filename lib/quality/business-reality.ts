import type { ProjectRecord } from "../service-domain";

export type BusinessRealityIssue = {
  code: "UNVERIFIED_RESULT" | "UNSOURCED_MARKET_METRIC" | "UNSUPPORTED_CREDENTIAL" | "PROHIBITED_CLAIM" | "FAKE_SOURCE";
  message: string;
  path: string;
  excerpt: string;
};

export type BusinessRealityReview = {
  passed: boolean;
  issues: BusinessRealityIssue[];
};

type TextEntry = { path: string; text: string };

function urlsFromEntries(entries: TextEntry[]) {
  return entries.flatMap((entry) => entry.text.match(/https?:\/\/[^\s)\]}>"']+/gi) ?? []);
}

function collectText(value: unknown, path = "content"): TextEntry[] {
  if (typeof value === "string" && value.trim()) return [{ path, text: value.trim() }];
  if (Array.isArray(value)) return value.flatMap((item, index) => collectText(item, `${path}[${index}]`));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => collectText(item, `${path}.${key}`));
  }
  return [];
}

function projectEvidence(project: ProjectRecord) {
  const stageInputs = project.stages.flatMap((stage) => collectText(stage.inputs, `inputs[${stage.stageIndex}]`));
  const founderInputs = collectText(project.founderProfile, "founderProfile");
  const opportunityInputs = collectText(project.opportunity, "opportunity");
  const sourceUrls = [
    urlsFromEntries([...stageInputs, ...founderInputs, ...opportunityInputs]),
    ...project.stages.flatMap((stage) => [stage.inputs.referenceUrls, stage.inputs.evidenceUrls]),
    (project.opportunity as { evidenceSources?: Array<{ url?: unknown }> }).evidenceSources?.map((source) => source.url),
    project.marketWorkspace?.evidence.map((item) => item.sourceUrl),
    project.marketWorkspace?.locations.map((item) => item.sourceUrl),
    project.businessAssessment?.requirements.map((item) => item.sourceUrl),
    project.grantWorkspace?.registrationEvidenceUrl,
    project.grantWorkspace?.supportingEvidenceUrls,
    project.grantAnalysis?.matches.map((item) => item.officialUrl),
  ].flat(2).filter((value): value is string => typeof value === "string" && /^https?:\/\//.test(value));
  const marketStatements = project.marketWorkspace?.evidence.map((item) =>
    [item.metric, item.value, item.unit, item.region, item.sourceName].filter(Boolean).join(" "),
  ) ?? [];
  return {
    sourceUrls: new Set(sourceUrls),
    inputText: [
      ...stageInputs,
      ...founderInputs,
      ...opportunityInputs,
      ...collectText(project.marketWorkspace, "marketWorkspace"),
      ...collectText(project.marketAnalysis, "marketAnalysis"),
    ].map((entry) => entry.text).concat(marketStatements),
    founderText: founderInputs.map((entry) => entry.text).join(" "),
  };
}

function directlySupported(text: string, inputs: string[]) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return inputs.some((input) => {
    const source = input.replace(/\s+/g, " ").trim();
    return source.length >= 12 && (source.includes(normalized) || normalized.includes(source));
  });
}

function excerpt(text: string) {
  return text.replace(/\s+/g, " ").slice(0, 220);
}

export function inspectBusinessReality(
  project: ProjectRecord,
  content: Record<string, unknown>,
): BusinessRealityReview {
  const evidence = projectEvidence(project);
  const issues: BusinessRealityIssue[] = [];
  const entries = collectText(content);

  for (const entry of entries) {
    const instructionalPath = /(?:prohibitedClaims|interviewScript|pricingTests|decisionCriteria|checklist|unknowns|warnings)/i.test(entry.path);
    const supported = directlySupported(entry.text, evidence.inputText);

    const generatedUrls = entry.text.match(/https?:\/\/[^\s)\]}>"']+/gi) ?? [];
    if (/example\.com|test\.local|fake\.(?:com|kr)/i.test(entry.text)
      || generatedUrls.some((url) => !evidence.sourceUrls.has(url.replace(/[.,;:]$/, "")))) {
      issues.push({ code: "FAKE_SOURCE", message: "사용자 입력 또는 저장 근거에 없는 인터넷 주소가 포함되어 있습니다.", path: entry.path, excerpt: excerpt(entry.text) });
    }

    const completedResult = /(?:인터뷰|설문|조사|판매|결제|주문|매출|계약|고객).{0,60}(?:확보했|달성했|판매했|결제했|응답했|확인됐|검증됐|입증됐|기록했|체결했|증가했)/i.test(entry.text)
      || /(?:조사|설문|인터뷰)\s*결과.{0,50}\d[\d,.]*(?:%|명|건)/i.test(entry.text);
    if (!instructionalPath && completedResult && !supported) {
      issues.push({ code: "UNVERIFIED_RESULT", message: "사용자 입력이나 증빙에 없는 완료 실적이 사실처럼 작성되었습니다.", path: entry.path, excerpt: excerpt(entry.text) });
    }

    const externalMetric = /(?:시장\s*규모|연평균\s*성장률|시장\s*점유율|이용자\s*수|사업체\s*수).{0,60}\d[\d,.]*(?:%|명|개|곳|억\s*원|조\s*원)/i.test(entry.text);
    if (!instructionalPath && externalMetric && !supported) {
      issues.push({ code: "UNSOURCED_MARKET_METRIC", message: "공식 원문이 연결되지 않은 시장 수치가 포함되어 있습니다.", path: entry.path, excerpt: excerpt(entry.text) });
    }

    const credential = /(?:\d+\s*년\s*(?:경력|운영)|특허|수상|협약|파트너십).{0,50}(?:보유|수상|체결|확보|경험)/i.test(entry.text);
    if (!instructionalPath && credential && !evidence.founderText.includes(entry.text) && !supported) {
      issues.push({ code: "UNSUPPORTED_CREDENTIAL", message: "대표자 입력에 없는 경력·수상·특허·협약이 포함되어 있습니다.", path: entry.path, excerpt: excerpt(entry.text) });
    }

    const prohibitedClaim = /(?:무조건\s*성공|완벽\s*보장|업계\s*1위|국내\s*최초|100%\s*(?:성공|정확|보장|효과))/i.test(entry.text);
    if (!instructionalPath && prohibitedClaim) {
      issues.push({ code: "PROHIBITED_CLAIM", message: "증명할 수 없는 우월·성과 보장 표현이 포함되어 있습니다.", path: entry.path, excerpt: excerpt(entry.text) });
    }
  }

  const unique = [...new Map(issues.map((issue) => [`${issue.code}:${issue.path}:${issue.excerpt}`, issue])).values()];
  return { passed: unique.length === 0, issues: unique };
}

export function businessRealityRevisionInstruction(review: BusinessRealityReview) {
  return [
    "사실성 검수에서 아래 문제가 발견되었습니다. 소설처럼 빈 사실을 채우지 말고, 해당 문장은 삭제하거나 '검증할 가정', '목표', '추가 확인 필요'로 명확히 바꾸세요.",
    ...review.issues.map((issue, index) => `${index + 1}. ${issue.message} 위치: ${issue.path} 문장: ${issue.excerpt}`),
    "고객 인터뷰·판매·매출·시장 수치·경력·제휴는 제공된 입력이나 원문 URL에 있을 때만 완료 사실로 쓸 수 있습니다.",
  ].join("\n");
}
