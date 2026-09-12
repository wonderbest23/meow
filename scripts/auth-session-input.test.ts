import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { authSessionInput } from "../lib/auth-session-input";

assert.equal(authSessionInput.safeParse({ accessToken: "access-token", refreshToken: "123456789abc" }).success, true);
for (const invalid of [
  { accessToken: "", refreshToken: "valid" },
  { accessToken: "valid", refreshToken: "   " },
  { accessToken: "valid", refreshToken: 123 },
  { accessToken: "x".repeat(16_385), refreshToken: "valid" },
  { accessToken: "valid", refreshToken: "x".repeat(4_097) },
]) assert.equal(authSessionInput.safeParse(invalid).success, false);
for (const route of ["session", "reset"]) {
  const source = readFileSync(`app/api/auth/${route}/route.ts`, "utf8");
  assert.match(source, /authSessionInput/);
  assert.match(source, /auth\.auth\.setSession/);
  assert.match(source, /result\.error|sessionResult\.error/);
}
console.log("auth session input: opaque refresh tokens, bounded input and provider validation passed");
