import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { openingHandoff, websiteSceneFrame } from "../lib/home-sequence-motion";

assert.deepEqual(openingHandoff(900, 900, false), { inset: 0, radius: 28, phoneY: -200 });
assert.deepEqual(openingHandoff(64, 900, false), { inset: 6, radius: 52, phoneY: -0 });
assert.equal(openingHandoff(400, 692, true).phoneY, 0, "Mobile phone cannot rise into its preceding copy");
assert.deepEqual(openingHandoff(64, 900, false, true), { inset: 0, radius: 28, phoneY: 0 });
for (let y = 120; y <= 900; y += 10) {
  const frame = openingHandoff(y, 900, false);
  assert.ok(frame.inset >= 0 && frame.inset <= 6);
  assert.ok(frame.phoneY >= -200 && frame.phoneY <= 0);
}

assert.equal(websiteSceneFrame(0).reveal, 0);
assert.equal(websiteSceneFrame(.3).reveal, 1);
assert.equal(websiteSceneFrame(.3).record > 0, true);
assert.equal(websiteSceneFrame(.35).record, 0);
assert.equal(websiteSceneFrame(.5).inspector, 1);
assert.equal(websiteSceneFrame(.5).edited, false);
assert.equal(websiteSceneFrame(.65).edited, true);
assert.equal(websiteSceneFrame(.65).highlight, 1);
assert.equal(websiteSceneFrame(.9).inspector, 0);
assert.equal(websiteSceneFrame(.9).saved, 1);
assert.equal(websiteSceneFrame(.9).step, 2);
assert.deepEqual(websiteSceneFrame(-2), websiteSceneFrame(0));
assert.deepEqual(websiteSceneFrame(Number.NaN), websiteSceneFrame(0));
assert.deepEqual(websiteSceneFrame(2), websiteSceneFrame(1));
assert.deepEqual(websiteSceneFrame(0, true), websiteSceneFrame(1));
const positions = [.1, .24, .4, .5, .62, .8, .95];
const forward = positions.map(progress => websiteSceneFrame(progress));
assert.deepEqual(positions.toReversed().map(progress => websiteSceneFrame(progress)).toReversed(), forward, "Reverse scroll must reproduce every stage");
for (let progress = 0; progress <= 1; progress += .001) {
  const frame = websiteSceneFrame(progress);
  for (const key of ["reveal", "record", "inspector", "highlight", "saved"] as const) {
    assert.ok(frame[key] >= 0 && frame[key] <= 1);
    assert.ok(Math.abs(frame[key] - websiteSceneFrame(progress + .001)[key]) < .06, `${key} must change continuously`);
  }
}

const read = (path: string) => readFileSync(path, "utf8");
const demo = read("components/home-website-demo.tsx");
assert.match(demo, /<BrainwavePage pageId="0-2226"/);
assert.match(demo, /KO_0_2226/);
assert.match(demo, /aria-hidden="true" inert/);
assert.match(demo, /manual = null/);
assert.match(demo, /prefers-reduced-motion/);
assert.doesNotMatch(demo, /setInterval|setTimeout|fetch\(|\/api\//, "Demo must not autoplay or issue generation/account requests");
const opening = read("components/home-opening.tsx");
assert.match(opening, /<HomeCinematicHero/);
assert.match(opening, /<HomePhoneStory/);
assert.doesNotMatch(read("components/home-service-overview.tsx"), /<HomeScrollStory/);
assert.match(read("app/page.tsx"), /<HomeOpening/);
assert.match(read("components/home-website-demo.module.css"), /background: transparent !important/);
assert.match(read("components/home-brand-closing.tsx"), /onClick=\{onStart\}/);
assert.match(read("components/home-brand-closing.tsx"), /AI 브랜드 이미지/);
assert.ok(statSync("public/home-media/oneulstart-first-day.webp").size < 300_000);
console.log("Homepage sequence: bounded reversible motion, readable holds, static fallback, isolated real-template preview and brand image passed");
