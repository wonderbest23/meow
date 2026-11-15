import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerAlertContact, setAlertContactEnabled } from "../lib/notify/account-alert-contact";
import { JOURNEY_SMS_TEXT, JOURNEY_STAGES, inJourneySendWindow, loadJourneyRows, runJourneyAlerts, type JourneyStage, type OwnerStages } from "../lib/notify/journey-alerts";
import type { CustomerSmsResult } from "../lib/notify/customer-sms";

// 한국 시각으로 만든다(KST = UTC+9)
const kst = (day: string, hour: number) => Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00+09:00`);
const ok: CustomerSmsResult = { status: "accepted", code: "OK" };

async function main() {
  // 보내는 시간 — 아침 8시부터 밤 9시 전까지
  assert.equal(inJourneySendWindow(kst("2026-11-16", 7)), false);
  assert.equal(inJourneySendWindow(kst("2026-11-16", 8)), true);
  assert.equal(inJourneySendWindow(kst("2026-11-16", 20)), true);
  assert.equal(inJourneySendWindow(kst("2026-11-16", 21)), false);
  assert.equal(inJourneySendWindow(kst("2026-11-16", 2)), false);

  await registerAlertContact("owner", { phone: "010-1234-5678", agreed: true });
  let plans: OwnerStages = [{ planId: "a", updatedAt: "2026-11-15T00:00:00Z", stages: ["design"] }];
  const sentLog: Array<{ recipient: string; stage: JourneyStage; eventId: string }> = [];
  let reply: CustomerSmsResult = ok;
  const run = (now: number) => runJourneyAlerts({ now, sms: null, stagesFor: async () => plans, send: async input => { sentLog.push(input); return reply; } });

  // 처음 켠 계정 — 그때까지 지난 단계는 보내지 않고 적어만 둔다
  let result = await run(kst("2026-11-16", 10));
  assert.deepEqual([result.baselined, result.sent, sentLog.length], [1, 0, 0]);

  // 밤에 단계가 넘어가면 보내지 않고(아무것도 맡지 않는다) 아침 첫 실행이 보낸다
  plans = [{ planId: "a", updatedAt: "2026-11-16T12:00:00Z", stages: ["design", "plan"] }];
  result = await run(kst("2026-11-16", 23));
  assert.deepEqual([result.reason, sentLog.length], ["quiet_hours", 0]);
  result = await run(kst("2026-11-17", 8));
  assert.deepEqual([result.sent, sentLog.map(item => item.stage)], [1, ["plan"]]);
  assert.equal(sentLog[0].recipient, "01012345678");

  // 같은 단계는 다시 보내지 않는다
  result = await run(kst("2026-11-17", 9));
  assert.deepEqual([result.sent, sentLog.length], [0, 1]);

  // 같은 날 다음 단계까지 가면 오늘은 미루고(하루 한 통) 다음 날 보낸다. 여러 단계가 밀렸으면 가장 나중 것 하나만
  plans = [{ planId: "a", updatedAt: "2026-11-17T03:00:00Z", stages: ["design", "plan", "homepage", "launch"] }];
  result = await run(kst("2026-11-17", 15));
  assert.deepEqual([result.deferred, sentLog.length], [1, 1]);
  result = await run(kst("2026-11-18", 9));
  assert.deepEqual([result.sent, result.skipped, sentLog.map(item => item.stage)], [1, 1, ["plan", "launch"]]);
  const rows = await loadJourneyRows("owner");
  assert.equal(rows.find(row => row.planId === "a" && row.stage === "homepage")?.status, "skipped");
  assert.equal(rows.find(row => row.planId === "a" && row.stage === "launch")?.status, "sent");

  // 새 사업은 처음 단계부터 — 갔는지 모르면 풀어 두었다가 다음 실행에 같은 eventId 로 다시
  plans = [...plans, { planId: "b", updatedAt: "2026-11-19T00:00:00Z", stages: ["design"] }];
  reply = { status: "uncertain", code: "RELAY_TIMEOUT" };
  result = await run(kst("2026-11-19", 10));
  assert.deepEqual([result.sent, result.failed], [0, 1]);
  reply = ok;
  result = await run(kst("2026-11-19", 10));
  assert.equal(result.sent, 1);
  assert.equal(sentLog.at(-1)?.eventId, sentLog.at(-2)?.eventId, "다시 보낼 때 eventId 가 같아야 중계가 두 번 보내지 않는다");

  // 예전 중계(이 알림을 모름)면 멈추고, 맡은 줄을 풀어 중계를 올린 뒤 다시 보낼 수 있다
  plans = [...plans, { planId: "c", updatedAt: "2026-11-20T00:00:00Z", stages: ["design"] }];
  reply = { status: "rejected", code: "INVALID_REQUEST" };
  result = await run(kst("2026-11-20", 10));
  assert.equal(result.reason, "relay_upgrade_required");
  assert.equal((await loadJourneyRows("owner")).some(row => row.planId === "c"), false);

  // 꺼 둔 계정에는 보내지 않는다 · 문자 설정이 없으면 아무것도 맡지 않는다
  await setAlertContactEnabled("owner", false);
  reply = ok;
  const before = sentLog.length;
  result = await run(kst("2026-11-21", 10));
  assert.deepEqual([result.contacts, sentLog.length], [0, before]);
  await setAlertContactEnabled("owner", true);
  assert.equal((await runJourneyAlerts({ now: kst("2026-11-21", 10), sms: null, stagesFor: async () => plans })).reason, "sms_disabled");

  // 개발 서버 — 실제로 보내지 않고 보낼 문구와 가린 번호만 남긴다
  const dry = await runJourneyAlerts({ now: kst("2026-11-21", 10), sms: null, dryRun: true, stagesFor: async () => plans });
  assert.deepEqual(dry.preview, [{ phone: "010-••••-5678", planId: "c", stage: "design", text: JOURNEY_SMS_TEXT.design }]);

  // 앱의 문구와 중계의 고정 문구가 같다(실제 문자는 중계가 만든다) · 모두 90바이트(EUC-KR) 안
  const relay = readFileSync(new URL("../ops/owner-sms/relay.py", import.meta.url), "utf8");
  for (const stage of JOURNEY_STAGES) {
    assert.ok(relay.includes(`"${stage}": "${JOURNEY_SMS_TEXT[stage]}"`), stage);
    const bytes = [...JOURNEY_SMS_TEXT[stage]].reduce((sum, char) => sum + (char.charCodeAt(0) > 127 ? 2 : 1), 0);
    assert.ok(bytes <= 90, `${stage} ${bytes}바이트`);
  }
  assert.match(readFileSync(new URL("../lib/plan-builder/section-service.ts", import.meta.url), "utf8"), /step\("journey_alerts", runJourneyAlertsNow\)/);
  console.log("journey-alerts ok");
}
main().catch(error => { console.error(error); process.exit(1); });
