import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { GUEST_COOKIE, hashIdentityToken } from "../lib/identity-tokens";
import { inspectBusinessReality } from "../lib/quality/business-reality";
import { createProject, deleteProject } from "../lib/project-repository";

const baseUrl = (process.env.SMOKE_BASE_URL?.trim() || "https://today-startup.rena35200.workers.dev").replace(/\/$/, "");
const guestToken = randomBytes(32).toString("base64url");
const guestTokenHash = hashIdentityToken(guestToken);
const cookie = `${GUEST_COOKIE}=${guestToken}`;

const opportunity = {
  id: `openai-production-smoke-${Date.now()}`,
  title: "동네 미용실 예약 문의 정리 서비스",
  oneLiner: "전화와 메신저로 흩어진 예약 문의를 운영자가 확인하기 쉬운 목록으로 정리하는 소규모 서비스",
  sector: "소상공인 업무 지원 서비스",
  model: "초기 수동 대행 후 월 구독 전환 검증",
  customer: "전화와 메신저 예약을 함께 받는 1인 미용실 운영자",
  capital: "소액",
  launchTime: "3~5주",
  revenue: "초기 설정비와 월 이용료",
  stage: "아이디어 검증",
  riasec: ["E", "C"],
  founder: ["체계형", "실행형"],
  market: 0,
  novelty: 0,
  feasibility: 80,
  evidenceStatus: "hypothesis",
  evidenceSources: [],
  regulation: 35,
  skills: ["문서 정리", "고객 응대"],
  risk: "예약자 연락처를 다루므로 수집 항목과 보관 기간을 최소화해야 합니다.",
  firstTest: "가까운 미용실 5곳에 수동 정리 예시를 보여주고 현재 예약 처리 방식과 유료 이용 의향을 기록합니다.",
  color: "#08775a",
  match: 82,
  reasons: ["작은 비용으로 수동 검증 가능", "보유한 문서 정리 역량 활용"],
  caution: "시장 규모와 고객 반응은 아직 확인되지 않은 가정으로 표시해야 합니다.",
};

const stageInputs = {
  goal: "확인되지 않은 수치를 만들지 않고 21일 안에 첫 유료 검증 여부를 판단할 사업 실행 초안을 만든다.",
  availableHoursPerWeek: 10,
  budgetWon: 1_500_000,
  existingAssets: ["문서 정리 경험", "지역 소상공인 지인 3명"],
  mustAvoid: ["고객 인터뷰 완료로 단정", "출처 없는 시장 규모", "검증 전 개발 외주"],
  referenceUrls: [],
  notes: "모든 고객 수치와 매출은 목표 또는 가정으로 구분하고, 실제 확인 전에는 완료 실적으로 쓰지 않습니다.",
};

type JsonRecord = Record<string, unknown>;

async function main() {
  let projectId: string | null = null;
  try {
    const project = await createProject({
      opportunity,
      founderProfile: { source: "openai-production-smoke", name: "격리 시험 사용자" },
      paymentStatus: "test_paid",
      packagePrice: 0,
      initialStageInputs: stageInputs,
    }, guestTokenHash);
    projectId = project.id;

    const response = await fetch(`${baseUrl}/api/projects/${project.id}/stages/0/generate`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
    });
    const body = await response.json() as JsonRecord;
    assert.equal(response.ok, true, `운영 AI 생성 실패 (${response.status}): ${JSON.stringify(body)}`);
    assert.equal(body.status, "succeeded");

    const artifact = body.artifact as JsonRecord;
    const generation = body.generation as JsonRecord;
    const content = artifact.content as JsonRecord;
    const contentText = JSON.stringify(content);
    const reality = inspectBusinessReality(project, content);

    assert.equal(generation.model, "gpt-5.6-sol");
    assert.equal(artifact.reviewStatus, "automated_review");
    assert(contentText.length >= 1_500, "운영 AI 초안이 지나치게 짧습니다.");
    assert.equal(reality.passed, true, `현실성 검사 실패: ${reality.issues.map((issue) => issue.message).join(" / ")}`);

    console.log(JSON.stringify({
      passed: true,
      baseUrl,
      projectId,
      model: generation.model,
      reviewStatus: artifact.reviewStatus,
      contentCharacters: contentText.length,
      realityIssues: reality.issues.length,
      projectDeleted: true,
    }, null, 2));
  } finally {
    if (projectId) {
      const deleted = await deleteProject(projectId, guestTokenHash);
      assert.equal(deleted, true, `시험 프로젝트 자동 삭제 실패: ${projectId}`);
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
