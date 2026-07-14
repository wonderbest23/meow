import assert from "node:assert/strict";
import {
  clearOpenAISessionConfig,
  getOpenAIConnectionStatus,
  getOpenAIRuntimeConfig,
  setOpenAISessionConfig,
} from "../lib/openai/session-config";

const guestHash = `openai-session-test-${crypto.randomUUID()}`;
const apiKey = `sk-test-${"a".repeat(48)}`;
const model = "gpt-5.6-sol";

const disconnected = getOpenAIConnectionStatus(guestHash);
assert.equal(disconnected.source === "none" || disconnected.source === "environment", true);

const connected = setOpenAISessionConfig(guestHash, apiKey, model);
assert.equal(connected.connected, true);
assert.equal(connected.source, "session");
assert.equal(connected.model, model);
assert.equal(connected.keyHint, "••••aaaa");
assert.equal(JSON.stringify(connected).includes(apiKey), false);

const runtime = getOpenAIRuntimeConfig(guestHash);
assert.equal(runtime?.apiKey, apiKey);
assert.equal(runtime?.model, model);
assert.equal(runtime?.source, "session");

const cleared = clearOpenAISessionConfig(guestHash);
assert.notEqual(cleared.source, "session");

console.log(JSON.stringify({
  passed: 10,
  sample: {
    connectedSource: connected.source,
    exposedHint: connected.keyHint,
    rawKeyExposedInStatus: JSON.stringify(connected).includes(apiKey),
  },
}, null, 2));
