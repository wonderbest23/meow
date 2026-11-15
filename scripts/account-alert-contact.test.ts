import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AlertContactError, loadAlertContact, maskAlertPhone, registerAlertContact, removeAlertContact, setAlertContactEnabled, viewOf } from "../lib/notify/account-alert-contact";

async function main() {
  // 저장소 없이(메모리) — 번호 등록 · 동의 · 끄기 · 지우기
  const at = new Date("2026-11-15T01:00:00.000Z");
  await assert.rejects(registerAlertContact("u1", { phone: "02-123-4567", agreed: true }), (error: unknown) => error instanceof AlertContactError && error.code === "PHONE_INVALID");
  await assert.rejects(registerAlertContact("u1", { phone: "010-1234-5678", agreed: false }), (error: unknown) => error instanceof AlertContactError && error.code === "CONSENT_REQUIRED");
  assert.equal(await loadAlertContact("u1"), null, "거절된 등록은 남지 않는다");
  await assert.rejects(setAlertContactEnabled("u1", false), (error: unknown) => error instanceof AlertContactError && error.code === "NOT_REGISTERED");

  assert.deepEqual(await registerAlertContact("u1", { phone: "010-1234-5678", agreed: true }, at), { phone: "01012345678", agreedAt: at.toISOString(), disabledAt: null });
  assert.deepEqual(viewOf(await loadAlertContact("u1")), { phone: "010-••••-5678", agreedAt: at.toISOString(), enabled: true });
  assert.equal(maskAlertPhone("01012345678").includes("1234"), false, "가운데 번호는 내보내지 않는다");

  // 끄면 번호 · 동의 시각은 그대로, 끈 시각만 남는다. 다시 켜면 지워진다
  const off = await setAlertContactEnabled("u1", false, new Date("2026-11-16T00:00:00.000Z"));
  assert.deepEqual(off, { phone: "01012345678", agreedAt: at.toISOString(), disabledAt: "2026-11-16T00:00:00.000Z" });
  assert.equal((await setAlertContactEnabled("u1", true)).disabledAt, null);
  // 번호를 바꾸면 동의 시각을 새로 적는다. 다른 계정에는 닿지 않는다
  const later = new Date("2026-11-17T00:00:00.000Z");
  assert.equal((await registerAlertContact("u1", { phone: "01099998888", agreed: true }, later)).agreedAt, later.toISOString());
  assert.equal(await loadAlertContact("u2"), null);
  await removeAlertContact("u1");
  assert.equal(await loadAlertContact("u1"), null);

  // 번호를 그대로 돌려주지 않고, 로그인한 계정만, 탈퇴하면 지운다
  const route = readFileSync(new URL("../app/api/account/alerts/route.ts", import.meta.url), "utf8");
  assert.match(route, /viewOf\(/);
  assert.doesNotMatch(route, /json\(\{ contact \}\)|contact: contact\b/);
  assert.match(route, /LOGIN_REQUIRED/);
  assert.match(readFileSync(new URL("../lib/account-delete.ts", import.meta.url), "utf8"), /account_alert_contacts/);
  assert.match(readFileSync(new URL("../lib/schema-readiness.ts", import.meta.url), "utf8"), /20261115120000_account_alert_contacts\.sql/);
  console.log("account-alert-contact ok");
}
main().catch(error => { console.error(error); process.exit(1); });
