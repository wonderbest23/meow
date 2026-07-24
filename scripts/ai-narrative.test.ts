import assert from "node:assert/strict";
import { enrichDocumentNarrative } from "../lib/delivery/ai-narrative";
import type { OpenAIRuntimeConfig } from "../lib/openai/session-config";
import type { ProjectRecord } from "../lib/service-domain";

const project = {
  id: crypto.randomUUID(),
  title: "예약 문의 정리 서비스",
  status: "active",
  paymentStatus: "test_paid",
  packagePrice: 990000,
  activeStage: 0,
  opportunity: {
    title: "예약 문의 정리 서비스",
    oneLiner: "동네 미용실의 흩어진 예약 문의를 한 번에 정리합니다.",
    customer: "전화와 메신저 예약을 함께 받는 1인 미용실 운영자",
    sector: "생활 서비스",
    model: "월 구독",
    firstTest: "운영자에게 가격이 공개된 수동 정리 서비스를 제안합니다.",
  },
  founderProfile: {},
  businessSetup: { archetype: "local-service", legalForm: "sole", region: "서울" },
  businessAssessment: null,
  stages: Array.from({ length: 6 }, (_, stageIndex) => ({
    id: crypto.randomUUID(),
    projectId: "project",
    stageIndex,
    status: "collecting_input" as const,
    inputs: {},
    inputVersion: 1,
    approvedArtifactId: null,
    approvedAt: null,
    artifacts: [],
  })),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as ProjectRecord;

const runtimeConfig: OpenAIRuntimeConfig = {
  apiKey: "sk-test-only",
  model: "gpt-5.6-sol",
  source: "session",
};

// 강화 대상 문단 하나 + 반드시 보존돼야 하는 제목·표·숫자·출처 라인.
const markdown = [
  "# 사업계획서",
  "",
  "## 1. 문제 인식",
  "",
  "우리 고객은 예약 문의를 여러 채널로 받으면서 놓치는 경우가 많고, 이를 정리할 시간이 부족합니다. 현재는 수기로 관리하지만 반복적으로 누락이 발생합니다.",
  "",
  "## 2. 사업비",
  "",
  "| 항목 | 금액 |",
  "| --- | --- |",
  "| 재료비 | 1,000,000원 |",
  "",
  "월 고정비 500,000원을 기준으로 총 필요자금 3,000,000원을 계획합니다.",
  "",
  "## 출처와 확인 상태",
  "",
  "- 시장 규모·성장률 수치는 공식 원문과 기준일을 확인 필요.",
].join("\n");

function mockFetch(paragraphs: string[]) {
  let count = 0;
  globalThis.fetch = (async () => {
    count += 1;
    return new Response(JSON.stringify({ output_text: JSON.stringify({ paragraphs }) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return () => count;
}

async function main() {
  const originalFetch = globalThis.fetch;
  try {
    // 1) 정상 강화: 숫자 없는 서술 문단만 더 구체적으로 교체된다.
    const enrichedProse =
      "동네 미용실 운영자는 전화와 메신저, 인스타그램 디엠으로 흩어져 들어오는 예약 문의를 바쁜 영업 시간에 놓치기 쉽고, 이를 일일이 옮겨 적을 여력이 없어 단골 관리와 노쇼 대응에도 어려움을 겪습니다. 지금은 수기 메모로 대응하지만 반복적으로 누락이 생겨 신뢰가 흔들립니다.";
    let getCount = mockFetch([enrichedProse]);
    const result = await enrichDocumentNarrative(project, "plan", markdown, runtimeConfig);
    assert.equal(getCount(), 1, "정상 경로에서 OpenAI를 한 번 호출해야 합니다.");
    assert.ok(result.includes("단골 관리와 노쇼"), "서술 문단이 강화 내용으로 교체돼야 합니다.");
    assert.ok(result.includes("# 사업계획서"), "제목은 보존돼야 합니다.");
    assert.ok(result.includes("## 1. 문제 인식"), "소제목은 보존돼야 합니다.");
    assert.ok(result.includes("| 재료비 | 1,000,000원 |"), "표와 숫자는 바이트 그대로 보존돼야 합니다.");
    assert.ok(
      result.includes("월 고정비 500,000원을 기준으로 총 필요자금 3,000,000원을 계획합니다."),
      "숫자가 든 문단은 강화 대상에서 제외돼 그대로 남아야 합니다.",
    );
    assert.ok(result.includes("## 출처와 확인 상태"), "출처 섹션은 보존돼야 합니다.");
    assert.ok(result.length >= markdown.length, "강화 결과는 원문보다 짧아지면 안 됩니다.");

    // 2) 규칙 위반(숫자 삽입): 원문을 그대로 반환(무동작)해야 한다.
    mockFetch(["동네 미용실 운영자 3명을 대상으로 이미 검증을 마쳤고 예약 누락을 크게 줄였습니다."]);
    const withDigit = await enrichDocumentNarrative(project, "plan", markdown, runtimeConfig);
    assert.equal(withDigit, markdown, "숫자를 새로 넣은 응답은 폐기하고 원문을 유지해야 합니다.");

    // 3) 분량 축소: 원문 유지.
    mockFetch(["짧게 요약."]);
    const shrunk = await enrichDocumentNarrative(project, "plan", markdown, runtimeConfig);
    assert.equal(shrunk, markdown, "원문보다 크게 짧아진 응답은 폐기해야 합니다.");

    // 4) 사실성 안전망: 금지 표현(업계 1위)은 sanitize가 잡아 원문을 유지한다.
    mockFetch([
      "우리 서비스는 업계 1위로서 모든 예약 문의를 완벽하게 정리하며 어떤 경쟁사보다 뛰어난 결과를 반드시 보장합니다. 운영자는 이제 아무 걱정 없이 단골 관리에만 집중하면 됩니다.",
    ]);
    const unsafe = await enrichDocumentNarrative(project, "plan", markdown, runtimeConfig);
    assert.equal(unsafe, markdown, "사실성 검수에서 치환될 표현이 생기면 원문을 유지해야 합니다.");

    // 5) 키 없음: OpenAI를 호출하지 않고 원문을 그대로 반환한다.
    const getCountNoKey = mockFetch([enrichedProse]);
    const noKey = await enrichDocumentNarrative(project, "plan", markdown, null);
    assert.equal(noKey, markdown, "키가 없으면 원문을 그대로 반환해야 합니다.");
    assert.equal(getCountNoKey(), 0, "키가 없으면 OpenAI를 호출하지 않아야 합니다.");
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("ai-narrative.test.ts passed");
}

void main();
