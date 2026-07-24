import assert from "node:assert/strict";
import {
  buildDirectIdeaFallbackPlan,
  generateDirectIdeaPlan,
} from "../lib/direct-idea-planner";
import type { OpenAIRuntimeConfig } from "../lib/openai/session-config";

const input = {
  idea: "메이플스토리 같은 게임을 만드는 플랫폼",
  budgetWon: 3_000_000,
  availableHoursPerWeek: 15,
};

const fallback = buildDirectIdeaFallbackPlan(input);
assert.equal(fallback.opportunity.title, "2D 온라인 RPG 제작 플랫폼");
assert.match(fallback.opportunity.customer, /1인 창작자/);
assert.match(fallback.draft.problem, /개발자|개발 인력/);
assert.match(fallback.draft.firstScope, /완성형 온라인 게임 전체가 아니라/);
assert.match(fallback.opportunity.risk, /저작권|상표/);
assert.equal(fallback.opportunity.oneLiner.includes("메이플스토리"), false);

const config: OpenAIRuntimeConfig = {
  apiKey: "sk-test-only",
  model: "gpt-5.6-sol",
  source: "environment",
};

const modelOutput = {
  title: "메이플스토리형 게임 제작 플랫폼",
  oneLiner: "메이플스토리를 만들고 싶은 비개발자가 맵과 퀘스트를 조립해 작은 온라인 게임 시제품을 공개하도록 돕습니다.",
  sector: "게임·제작도구",
  customer: "개발팀 없이 게임 아이디어를 시험하려는 1인 창작자",
  model: "기본 무료 + 월 구독",
  revenue: "월 구독료 + 추가 공개 기능 이용료",
  launchTime: "8~12주",
  skills: ["게임 기획", "웹 제품 개발", "사용자 시험"],
  risk: "온라인 서버 개발 범위가 예산보다 커질 수 있어 첫 제품의 기능을 제한해야 합니다.",
  firstTest: "게임 아이디어가 있는 창작자 5명에게 화면 시안을 보여주고 가장 필요한 제작 기능 한 가지를 선택하게 합니다.",
  regulationRisk: "중간",
  problem: "비개발 창작자는 게임 아이디어가 있어도 프로그래밍 학습과 서버 설정 부담 때문에 짧은 시제품조차 공개하기 어렵습니다.",
  offerName: "메이플스토리형 빠른 제작 도구",
  offerDescription: "준비된 맵 조각과 퀘스트 양식을 선택해 짧은 플레이 시제품을 만들고 공유 링크로 공개합니다.",
  coreOutcome: "창작자는 큰 개발비를 쓰기 전에 핵심 재미를 보여주는 시제품으로 잠재 이용자의 반응을 확인합니다.",
  firstScope: "300만원과 주 15시간 안에서 맵 한 개, 캐릭터 이동과 간단한 퀘스트가 작동하는 1인용 웹 시제품을 만듭니다.",
  assumptions: [
    "초기 고객이 범용 게임 엔진보다 쉬운 제작 방식을 원한다는 가정입니다.",
    "첫 버전에서 동시접속과 아이템 거래 기능은 필요하지 않다는 가정입니다.",
  ],
  priceHypothesisWon: 50_000,
};

async function main() {
  const originalFetch = globalThis.fetch;
  let requestBody = "";
  try {
    globalThis.fetch = async (_input, init) => {
      requestBody = String(init?.body ?? "");
      return new Response(JSON.stringify({ output_text: JSON.stringify(modelOutput) }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const generated = await generateDirectIdeaPlan(input, config);
    assert.equal(generated.generation.source, "openai");
    assert.equal(generated.opportunity.title, "2D 온라인 RPG 제작 플랫폼");
    assert.equal(generated.opportunity.oneLiner.includes("메이플스토리"), false);
    assert.equal(generated.draft.offerName.includes("메이플스토리"), false);
    assert.match(generated.opportunity.risk, /저작권|상표/);
    assert.match(generated.draft.firstScope, /300만원|3,000,000원/);
    assert.equal(generated.draft.priceHypothesisWon, 50_000);
    assert.match(requestBody, /시장 규모, 성장률, 고객 수, 매출/);
    assert.match(requestBody, /3000000/);
    assert.match(requestBody, /15/);

    globalThis.fetch = async () => new Response(JSON.stringify({
      output_text: JSON.stringify({
        ...modelOutput,
        title: "너무 긴 제목이라도 이 항목 하나 때문에 전체 모델 응답을 모두 버리면 안 되는 사업 플랫폼 제목",
        customer: "게임 시제품을 만들려는 대학생 창작자",
        skills: [],
      }),
    }), { status: 200, headers: { "Content-Type": "application/json" } });
    const partiallyGenerated = await generateDirectIdeaPlan(input, config);
    assert.equal(partiallyGenerated.opportunity.title, "2D 온라인 RPG 제작 플랫폼");
    assert.equal(partiallyGenerated.opportunity.customer, "게임 시제품을 만들려는 대학생 창작자");
    assert.deepEqual(partiallyGenerated.opportunity.skills, fallback.opportunity.skills);
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("direct-idea-planner.test.ts passed");
}

void main();
