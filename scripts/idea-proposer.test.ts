import assert from "node:assert/strict";
import { proposeIdeas } from "../lib/discovery/idea-proposer";
import type { OpenAIRuntimeConfig } from "../lib/openai/session-config";
import type { FounderProfile } from "../lib/assessment";

const profile: FounderProfile = {
  riasec: { R: 40, I: 60, A: 30, S: 80, E: 55, C: 70 },
  founder: { opportunity: 55, customer: 80, creation: 50, execution: 75, uncertainty: 45, scale: 40 },
  topRiasec: ["S", "C"],
  topFounder: ["customer", "execution"],
  confidence: 70,
  answered: 30,
};

const runtimeConfig: OpenAIRuntimeConfig = { apiKey: "sk-test-only", model: "gpt-5.6-sol", source: "session" };

const validA = {
  title: "동네 세탁 구독",
  oneLiner: "1인 가구의 밀린 빨래를 정기적으로 수거·세탁해 돌려주는 구독 사업입니다.",
  sector: "생활서비스",
  model: "월 구독",
  customer: "개인",
  capital: "소액",
  launchTime: "2~6주",
  revenue: "월 구독료",
  stage: "고객 인터뷰",
  riasec: ["S", "C"],
  founder: ["customer", "execution"],
  regulation: 15,
  skills: ["동선 설계", "고객 상담", "품질 관리"],
  risk: "수거 동선 효율과 재이용률을 먼저 확인해야 합니다.",
  firstTest: "1인 가구 10명에게 정기 수거 제안을 보내고 결제 의사를 확인하세요.",
};
const validB = {
  title: "소상공인 리뷰 정리",
  oneLiner: "작은 가게가 흩어진 온라인 리뷰를 모아 개선점을 정리해주는 서비스입니다.",
  sector: "마케팅",
  model: "온라인 구독",
  customer: "기업",
  capital: "소액",
  launchTime: "2~6주",
  revenue: "월 구독료",
  stage: "기술 확인",
  riasec: ["I", "E"],
  founder: ["opportunity", "creation"],
  regulation: 10,
  skills: ["데이터 정리", "영업", "보고서 작성"],
  risk: "사장님이 실제로 비용을 낼지 확인이 필요합니다.",
  firstTest: "동네 가게 10곳에 리뷰 요약 샘플을 보여주고 반응을 확인하세요.",
};
// 지어낸 시장 수치가 든 후보 — 반드시 폐기돼야 한다.
const fabricated = {
  ...validB,
  title: "허위 시장 사업",
  sector: "여행",
  oneLiner: "이미 시장 규모 3조원을 확보한 검증된 사업으로 업계 1위가 보장됩니다.",
};

let lastRequestBody: unknown = null;
function mockFetch(ideas: unknown[]) {
  lastRequestBody = null;
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    lastRequestBody = init?.body ? JSON.parse(init.body) : null;
    return new Response(JSON.stringify({ output_text: JSON.stringify({ ideas }) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

async function main() {
  const originalFetch = globalThis.fetch;
  try {
    // 0) 다양성 강제: 매 요청마다 넓은 좌표계에서 서로 다른 분야가 배정된다.
    mockFetch([validA, validB]);
    await proposeIdeas(profile, undefined, runtimeConfig, 8);
    const message = (lastRequestBody as { input?: Array<{ role: string; content: string }> }).input?.find(
      (item) => item.role === "user",
    );
    const userPayload = JSON.parse(message?.content ?? "{}") as { assignedSectors?: string[] };
    assert.ok(Array.isArray(userPayload.assignedSectors), "요청에 배정 분야가 포함돼야 합니다.");
    assert.equal(userPayload.assignedSectors?.length, 8, "요청한 개수만큼 분야가 배정돼야 합니다.");
    assert.equal(
      new Set(userPayload.assignedSectors).size,
      8,
      "배정 분야는 서로 겹치지 않아야 합니다(다양성).",
    );

    // 1) 정상 후보 → Opportunity 형태로 정규화된다.
    mockFetch([validA, validB]);
    const pool = await proposeIdeas(profile, undefined, runtimeConfig);
    assert.equal(pool.length, 2, "유효한 후보 2개가 모두 반환돼야 합니다.");
    assert.equal(pool[0].id, "llm-0");
    assert.equal(pool[0].market, 0, "시장 점수는 미검증(0)이어야 합니다.");
    assert.equal(pool[0].evidenceStatus, "hypothesis");
    assert.ok(pool[0].feasibility >= 30 && pool[0].feasibility <= 90, "실현 가능성은 30~90 범위여야 합니다.");
    assert.ok(pool[0].riasec.every((axis) => ["R", "I", "A", "S", "E", "C"].includes(axis)));

    // 2) 허위 후보는 폐기하고 나머지는 유지한다.
    mockFetch([validA, fabricated, validB]);
    const filtered = await proposeIdeas(profile, undefined, runtimeConfig);
    assert.equal(filtered.length, 2, "허위 후보를 뺀 2개만 남아야 합니다.");
    assert.ok(!filtered.some((item) => item.title === "허위 시장 사업"), "지어낸 시장 수치 후보는 폐기돼야 합니다.");

    // 3) 같은 분야 중복은 제거된다.
    mockFetch([validA, { ...validB, sector: validA.sector, title: "같은 분야 다른 이름" }]);
    const deduped = await proposeIdeas(profile, undefined, runtimeConfig);
    assert.equal(deduped.length, 0, "분야가 겹쳐 유효 후보가 2개 미만이면 빈 풀로 폴백해야 합니다.");

    // 4) 통과 후보가 2개 미만이면 빈 풀(라이브러리 폴백).
    mockFetch([validA]);
    const tooFew = await proposeIdeas(profile, undefined, runtimeConfig);
    assert.equal(tooFew.length, 0, "후보가 2개 미만이면 빈 풀을 반환해야 합니다.");

    // 5) 키 없음 → 호출 없이 빈 풀.
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const noKey = await proposeIdeas(profile, undefined, null);
    assert.equal(noKey.length, 0);
    assert.equal(called, false, "키가 없으면 OpenAI를 호출하지 않아야 합니다.");
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("idea-proposer.test.ts passed");
}

void main();
