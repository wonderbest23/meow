import assert from "node:assert/strict";
import { homeScrollChoreography } from "../lib/home-scroll-choreography";

assert.deepEqual(homeScrollChoreography(-1), homeScrollChoreography(0));
assert.deepEqual(homeScrollChoreography(2), homeScrollChoreography(1));
assert.deepEqual(homeScrollChoreography(NaN), homeScrollChoreography(0));
for (const progress of [0, .07, .15, .3, .41, .53, .7, .82, .92, 1]) {
  const state = homeScrollChoreography(progress);
  assert.ok(Object.values(state).every(value => value >= 0 && value <= 1));
  assert.deepEqual(state, homeScrollChoreography(progress), "The timeline must not depend on scroll direction");
}
assert.equal(homeScrollChoreography(.1).type, 1);
assert.equal(homeScrollChoreography(.1).send, 0);
assert.equal(homeScrollChoreography(.26).answer, 1);
assert.equal(homeScrollChoreography(.26).organize, 0);
assert.equal(homeScrollChoreography(.54).organize, 1);
assert.equal(homeScrollChoreography(.54).settle, 1);
assert.equal(homeScrollChoreography(.54).paper, 0);
assert.equal(homeScrollChoreography(.76).paper, 1);
assert.equal(homeScrollChoreography(.76).cover, 0);
assert.ok(homeScrollChoreography(.41).organize > 0 && homeScrollChoreography(.41).organize < 1);
assert.ok(Object.values(homeScrollChoreography(1)).every(value => value === 1));
console.log("Home scroll choreography: phase ordering, bounds, interpolation and reverse determinism passed");
