import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { proposalFixture } from "./proposal-fixtures";
import { renderDeckPptx } from "../lib/plan-builder/deck-render";
import { PROPOSAL_SECTORS, PROPOSAL_PURPOSES, PROPOSAL_STAGES, createProposalBlueprint, type ProposalSector, type ProposalPurpose, type ProposalStage } from "../lib/plan-builder/proposal-blueprint";

async function main() {
  const output = path.resolve(process.argv[2] ?? "artifacts/proposal-v2/candidates");
  await mkdir(output, { recursive: true });
  const samples: [string, ProposalSector, ProposalPurpose, ProposalStage][] = [
    ["01-b2b-proposal", "b2b_service", "sales", "prelaunch"],
    ["02-cafe-operating-plan", "food_beverage", "operating_plan", "operating"],
    ["03-software-investment-review", "software", "investment", "prelaunch"],
    ["04-manufacturing-grant-plan", "manufacturing", "grant", "prelaunch"],
  ];
  for (const [name, sector, purpose, stage] of samples) {
    const fixture = proposalFixture(sector, purpose, stage);
    await writeFile(path.join(output, `${name}.pptx`), await renderDeckPptx(fixture.deck));
    await writeFile(path.join(output, `${name}.json`), JSON.stringify(fixture, null, 2));
    console.log(`${name}: ${fixture.deck.slides.length} slides (synthetic, no AI calls)`);
  }
  const catalog = PROPOSAL_SECTORS.flatMap(sector => PROPOSAL_PURPOSES.flatMap(purpose => PROPOSAL_STAGES.map(stage => createProposalBlueprint({ businessName: "분류 규칙", options: { sector, purpose, stage } }))));
  await writeFile(path.join(output, "blueprint-catalog.json"), JSON.stringify(catalog, null, 2));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
