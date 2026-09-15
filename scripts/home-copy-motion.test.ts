import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { homeCopyFrame } from "../lib/home-copy-motion";

for (const viewportHeight of [520, 692, 844, 900]) {
  for (const height of [43, 86, 130]) {
    const frame = (top: number) => homeCopyFrame({ top, height, viewportHeight });
    assert.deepEqual(frame(viewportHeight), { opacity: 0, y: 24 });
    assert.deepEqual(frame(viewportHeight * .55), { opacity: 1, y: 0 });
    assert.deepEqual(frame(-height), { opacity: 0, y: -18 });

    const entering = frame(viewportHeight * .84);
    assert.ok(Math.abs(entering.opacity - .5) < .000001);
    assert.ok(entering.y > 0 && entering.y < 24);
    const leaving = frame(64 + Math.min(height, 64) + 64 - height);
    assert.equal(leaving.opacity, .5);
    assert.equal(leaving.y, -9);

    const positions = Array.from({ length: 120 }, (_, index) => viewportHeight - index * (viewportHeight + height) / 119);
    const forward = positions.map(frame);
    const reverse = [...positions].reverse().map(frame).reverse();
    assert.deepEqual(forward, reverse, "Reversing scroll must restore the identical frame");
    assert.deepEqual(frame(viewportHeight * .84), entering, "Idle rendering must not advance the text");
    for (const sample of forward) {
      assert.ok(sample.opacity >= 0 && sample.opacity <= 1);
      assert.ok(sample.y >= -18 && sample.y <= 24);
    }
  }
}

for (const top of [-1000, 0, 500, 2000]) {
  assert.deepEqual(homeCopyFrame({ top, height: 86, viewportHeight: 692, reduced: true }), { opacity: 1, y: 0 });
  assert.deepEqual(homeCopyFrame({ top, height: 86, viewportHeight: 320 }), { opacity: 1, y: 0 });
}
const body = homeCopyFrame({ top: 692, height: 52, viewportHeight: 692, body: true });
assert.equal(body.y, 16, "Description motion must stay inside the spacing before the button");

const hook = readFileSync("components/use-home-copy-motion.ts", "utf8");
assert.match(hook, /part\.offsetTop/);
assert.match(hook, /part\.matches\("h2, h3, p"\)/);
assert.match(hook, /passive: true/);
assert.match(hook, /removeEventListener\("scroll", schedule\)/);
assert.doesNotMatch(hook, /setInterval|setTimeout|performance\.now/);
const css = readFileSync("components/home-service-overview.module.css", "utf8");
assert.match(css, /\[data-home-copy\] \{ position: relative; \}/);
assert.match(css, /opacity: var\(--home-copy-opacity, 1\)/);
assert.match(css, /prefers-reduced-motion:reduce[\s\S]*opacity: 1; transform: none/);
const result = readFileSync("components/home-result-showcase.tsx", "utf8");
assert.equal((result.match(/className=\{styles\.panelCopy\} data-home-copy/g) ?? []).length, 3);
assert.doesNotMatch(result, /<article[^>]*data-reveal/);
assert.doesNotMatch(result, /<header[^>]*data-reveal/);
console.log("Home copy motion: entry, reading hold, exit, reverse, idle, reduced motion and result heading coverage passed");
