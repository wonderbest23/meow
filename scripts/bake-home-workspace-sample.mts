import { writeFile } from "node:fs/promises";
import { SAMPLE } from "../lib/plan-builder/samples/coffee";
import { SAMPLE_ANSWERS } from "../lib/plan-builder/sample-answers";
import { chaptersForType } from "../lib/plan-builder/blueprint";

const chapter = chaptersForType(SAMPLE.planType)[0];
const section = chapter.sections[0];
const key = `${chapter.id}/${section.id}`;
const sample = {
  title: SAMPLE.title,
  planType: SAMPLE.planType,
  count: Object.keys(SAMPLE.sections).length,
  chapters: chaptersForType(SAMPLE.planType).length,
  chapter: chapter.title,
  section: section.title,
  html: SAMPLE.sections[key as keyof typeof SAMPLE.sections].html,
  description: SAMPLE_ANSWERS["overview/summary"].value_prop,
  fields: [
    { key: "customer", value: SAMPLE_ANSWERS["market/segments"].first_target },
    { key: "offer", value: SAMPLE_ANSWERS["market/products"].main_offer },
    { key: "price", value: SAMPLE_ANSWERS["market/products"].price_value },
  ],
};
await writeFile(new URL("../public/home-media/results/workspace-sample.json", import.meta.url), JSON.stringify(sample, null, 2) + "\n");
console.log(`Baked public workspace sample: ${sample.count} sections, ${sample.chapters} chapters, ${key}`);
