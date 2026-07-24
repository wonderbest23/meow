import assert from "node:assert/strict";
import { emptyBusinessSetup } from "../lib/business/domain";
import {
  markSetupFieldUnknown,
  normalizeLegacyDigitalSetup,
  setupQuestionIds,
  withSetupValue,
} from "../lib/business/setup-wizard";
import { assessBusinessSetup } from "../lib/business/korea-rules";

const digital = emptyBusinessSetup("digital_service");
assert.equal(digital.region, "지역 미정");
const digitalQuestions = setupQuestionIds(digital);
assert.equal(digitalQuestions.includes("deposit"), false);
assert.equal(digitalQuestions.includes("interior"), false);
assert.equal(digitalQuestions.includes("equipment"), false);
assert.equal(digitalQuestions.includes("shipping"), false);
assert.equal(digital.financial.initial.equipment, 0);

const soho = withSetupValue(digital, "workplaceType", "soho");
assert.equal(setupQuestionIds(soho).includes("rent"), true);
assert.equal(setupQuestionIds(soho).includes("interior"), false);

const known = markSetupFieldUnknown(digital, "software", false);
assert.equal(known.unknownFields.includes("software"), false);
const unknown = markSetupFieldUnknown(known, "software", true);
assert.equal(unknown.unknownFields.includes("software"), true);

const legacy = emptyBusinessSetup("digital_service");
legacy.financial.initial.equipment = 1_000_000;
legacy.financial.initial.licensesAndRegistration = 200_000;
legacy.financial.initial.launchMarketing = 1_000_000;
legacy.financial.initial.contingency = 1_000_000;
legacy.financial.monthlyFixed.utilitiesAndTelecom = 100_000;
legacy.financial.monthlyFixed.fixedMarketing = 500_000;
const normalized = normalizeLegacyDigitalSetup(legacy);
assert.equal(normalized.adjusted, true);
assert.equal(normalized.setup.financial.initial.equipment, 0);
assert.equal(normalized.setup.financial.initial.contingency, 0);
assert.equal(normalized.setup.financial.initial.launchMarketing, 200_000);
assert.equal(
  assessBusinessSetup(normalized.setup).financial.warnings.some((warning) => warning.includes("예비비")),
  false,
  "디지털 사업의 홍보비만으로 공사·장비용 예비비 경고가 생기면 안 됩니다.",
);

console.log("setup-wizard.test.ts passed");
