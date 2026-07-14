import assert from "node:assert/strict";
import {
  buildLaunchMissions,
  createLaunchMissionWorkspace,
  missionDependenciesDone,
  nextReadyRequiredMission,
  progressForMission,
  quoteIsContractReady,
  quoteMonthlyTotal,
} from "../lib/launch-missions/engine";
import type { LaunchMissionContext } from "../lib/launch-missions/domain";

const base: LaunchMissionContext = {
  projectId: "test-project",
  title: "초보 창업 테스트",
  region: "서울특별시",
  archetype: "professional_service",
  legalForm: "undecided",
  workplaceType: "soho",
  employeeCount: 0,
  onlineSales: true,
  handlesPersonalData: true,
  hasPermitBlocker: false,
  risk: "고객 피해와 계약 책임",
};

const sohoMissions = buildLaunchMissions(base);
const sohoIds = new Set(sohoMissions.map((mission) => mission.id));
assert(sohoIds.has("space-quotes"), "비상주 사업장은 3개 견적 비교가 필요해야 합니다.");
assert(!sohoIds.has("building-rights"), "비상주 사업장에 상가 등기 확인을 강제하면 안 됩니다.");
assert(sohoIds.has("online-commerce"), "온라인 판매 미션이 누락됐습니다.");
assert(sohoIds.has("privacy-flow"), "개인정보 처리 미션이 누락됐습니다.");
assert(!sohoIds.has("payroll-insurance"), "직원이 없는데 급여 미션이 생성됐습니다.");

const regulatedMissions = buildLaunchMissions({
  ...base,
  archetype: "regulated",
  legalForm: "corporation",
  workplaceType: "commercial_lease",
  employeeCount: 2,
  hasPermitBlocker: true,
});
const regulatedIds = new Set(regulatedMissions.map((mission) => mission.id));
assert(regulatedIds.has("building-rights"), "상가 계약 전 건축물·등기 미션이 필요합니다.");
assert(regulatedIds.has("permit-precheck"), "규제 업종 인허가 사전확인이 필요합니다.");
assert(regulatedIds.has("payroll-insurance"), "직원 고용 미션이 필요합니다.");
assert(regulatedMissions.find((mission) => mission.id === "location-contract")?.dependencies.includes("permit-precheck"), "인허가 확인 전 계약이 열리면 안 됩니다.");

const homeMissions = buildLaunchMissions({
  ...base,
  archetype: "digital_service",
  workplaceType: "home",
  onlineSales: false,
  handlesPersonalData: false,
});
const homeIds = new Set(homeMissions.map((mission) => mission.id));
assert(!homeIds.has("space-quotes"), "자택 시작에 3개 임대 견적을 강제하면 안 됩니다.");
assert(!homeIds.has("online-commerce"), "온라인 판매가 아닌 사업에 통신판매 미션을 강제하면 안 됩니다.");
assert(!homeIds.has("privacy-flow"), "개인정보를 다루지 않는 사업에 처리 미션을 강제하면 안 됩니다.");

for (const list of [sohoMissions, regulatedMissions, homeMissions]) {
  const ids = new Set(list.map((entry) => entry.id));
  for (const mission of list) {
    assert(mission.dependencies.every((dependency) => ids.has(dependency)), `${mission.id}의 선행 미션이 목록에 없습니다.`);
    assert(mission.actions.length >= 3, `${mission.id}에 구체 행동이 부족합니다.`);
    assert(mission.completionEvidence.length >= 5, `${mission.id}에 완료 증빙이 없습니다.`);
  }
}

const workspace = createLaunchMissionWorkspace(base, "테스트브랜드", "시작을 쉽게");
assert.equal(workspace.spaceQuotes.length, 3);
const firstMission = nextReadyRequiredMission(sohoMissions, workspace);
assert(firstMission, "첫 번째 필수 미션이 열려야 합니다.");
assert(missionDependenciesDone(firstMission, workspace), "첫 번째 미션의 선행 조건이 열려 있어야 합니다.");
const firstEvidence = "고객인터뷰-5건-검증.pdf";
const completedWorkspace = {
  ...workspace,
  missionProgress: {
    ...workspace.missionProgress,
    [firstMission.id]: {
      ...progressForMission(workspace, firstMission.id),
      status: "done" as const,
      evidence: firstEvidence,
      note: "가격 질문을 추가하기로 수정",
      updatedAt: new Date().toISOString(),
    },
  },
};
const secondMission = nextReadyRequiredMission(sohoMissions, completedWorkspace);
assert(secondMission && secondMission.id !== firstMission.id, "완료 후 다음 필수 미션으로 이어져야 합니다.");
assert.equal(progressForMission(completedWorkspace, firstMission.id).evidence, firstEvidence, "입력한 확인 자료가 다음 단계 작업공간에 남아야 합니다.");
const quote = {
  ...workspace.spaceQuotes[0],
  provider: "후보 오피스",
  monthlyRentWon: 100_000,
  monthlyMaintenanceWon: 10_000,
  monthlyMailWon: 5_000,
  setupFeeWon: 120_000,
  contractMonths: 12,
  registrationEligible: true,
  industryApproved: true,
  subleaseConsentVerified: true,
  cancellationChecked: true,
  evidence: "견적서-001.pdf",
};
assert.equal(quoteMonthlyTotal(quote), 135_000, "부가세와 가입비 월환산 계산이 맞지 않습니다.");
assert(quoteIsContractReady(quote), "필수 확인을 마친 견적이 계약 검토 가능이어야 합니다.");
assert(!quoteIsContractReady({ ...quote, industryApproved: false }), "업종 확인이 없으면 계약 가능으로 표시하면 안 됩니다.");

console.log(JSON.stringify({
  passed: true,
  sohoMissionCount: sohoMissions.length,
  regulatedMissionCount: regulatedMissions.length,
  homeMissionCount: homeMissions.length,
  stopGateCount: sohoMissions.filter((mission) => mission.stopGate).length,
}, null, 2));
