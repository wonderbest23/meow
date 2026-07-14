import assert from "node:assert/strict";
import { emptyBusinessSetup } from "../lib/business/domain";
import {
  markSetupFieldUnknown,
  normalizeLegacyDigitalSetup,
  setupQuestionIds,
  withSetupValue,
} from "../lib/business/setup-wizard";

const digital = emptyBusinessSetup("digital_service");
const digitalQuestions = setupQuestionIds(digital);
assert.equal(digitalQuestions.includes("deposit"), false);
assert.equal(digitalQuestions.includes("interior"), false);
assert.equal(digitalQuestions.includes("equipment"), false);
assert.equal(digitalQuestions.includes("shipping"), false);
assert.equal(digital.financial.initial.equipment, 0);

const soho = withSetupValue(digital, "workplaceType", "soho");
assert.equal(setupQuestionIds(soho).includes("rent"), true);
assert.equal(setupQuestionIds(soho).includes("interior"), false);

const unknown = markSetupFieldUnknown(digital, "software", true);
assert.deepEqual(unknown.unknownFields, ["software"]);

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

console.log("setup-wizard.test.ts passed");
