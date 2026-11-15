import { getServerSupabase } from "../persistence";
import { hashIdentityToken, userProjectToken } from "../identity-tokens";
import { loadPlanState } from "../plan-builder/plan-server-store";
import { businessHubState } from "../plan-builder/business-hub";
import { launchProgress } from "../plan-builder/journey";
import { readCoach } from "../plan-builder/coach";
import { isSamplePlan, type Plan } from "../plan-builder/plan-store";
import { publishedOwnerPlanIds } from "../landing/repository";
import { listEnabledAlertContacts, maskAlertPhone } from "./account-alert-contact";
import { customerSmsConfig, relayUnsupported, sendRelayV4, stableEventId, type CustomerSmsConfig, type CustomerSmsResult } from "./customer-sms";

/*
 * 진행 단계 안내 발송 1차(2026-11-15) — 단계가 넘어간 사업을 알아채서, 아직 안 보낸 것만, 알리고 문자 중계로 보낸다.
 * 5분마다 도는 예약 실행이 부른다(세금 마감 문자와 같은 길). 설계: docs/알림톡-단계안내-설계-2026-10-30.md
 *   - 같은 사업의 같은 단계는 한 번만(journey_notifications 기본키) · 한 계정에 하루 한 통
 *   - 밤 9시 ~ 아침 8시에는 아무것도 하지 않는다 → 아침 첫 실행이 보낸다
 *   - 처음 켠 계정은 그때까지 지난 단계를 '보내지 않음'으로 적어 둔다(지난 일로 문자가 몰려 가지 않게)
 *   - 같은 사업에서 여러 단계가 밀렸으면 가장 나중 단계 하나만 보내고 앞 단계는 건너뛴다
 * shortcut: 사업자등록 단계 도달 · 첫 손님 문의(이미 문의 문자가 간다) · 넘긴 뒤 10분 기다리기 · 3일 지난 단계 버리기는 넣지 않았다, 알림톡으로 바꿀 때 함께 넣는다
 */
export const JOURNEY_STAGES = ["design", "plan", "homepage", "launch"] as const;
export type JourneyStage = typeof JOURNEY_STAGES[number];
/** 중계(ops/owner-sms/relay.py)의 고정 문구와 같은 글 — 개발 서버의 '보낼 문구' 기록과 테스트가 쓴다. 실제 문자는 중계가 만든다 */
export const JOURNEY_SMS_TEXT: Record<JourneyStage, string> = {
  design: "[오늘창업] 사업 방향 정리 완료! 다음은 사업계획서 만들기 oneulstart.com/plan",
  plan: "[오늘창업] 사업계획서 완성! 다음은 홈페이지 만들기 oneulstart.com/plan",
  homepage: "[오늘창업] 홈페이지 공개 완료! 다음은 개업 준비 oneulstart.com/plan",
  launch: "[오늘창업] 개업 준비 완료! 이제 유지보수 단계예요 oneulstart.com/plan",
};
export const JOURNEY_SEND_HOUR_KST = 8, JOURNEY_STOP_HOUR_KST = 21;

/** 이 사업이 지금까지 지난 단계 — 예시 사업은 없다 */
export function reachedJourneyStages(plan: Plan, homepagePublished: boolean): JourneyStage[] {
  if (isSamplePlan(plan.id)) return [];
  const reached: JourneyStage[] = [];
  if (readCoach(plan.answers)?.design) reached.push("design");
  if (businessHubState(plan).complete) reached.push("plan");
  if (homepagePublished) reached.push("homepage");
  if (launchProgress(plan) === "done") reached.push("launch");
  return reached;
}
const kstHour = (now: number) => new Date(now + 9 * 60 * 60_000).getUTCHours();
const kstDay = (time: number) => new Date(time + 9 * 60 * 60_000).toISOString().slice(0, 10);
export const inJourneySendWindow = (now: number) => { const hour = kstHour(now); return hour >= JOURNEY_SEND_HOUR_KST && hour < JOURNEY_STOP_HOUR_KST; };

/* ── 발송 기록 저장 — journey_notifications, 없으면 프로세스 메모리(데모 · 테스트) ── */
export type JourneyRow = { planId: string; stage: string; status: "processing" | "sent" | "failed" | "skipped"; sentAt: string | null };
declare global {
  var __oneulJourneyRows: Map<string, JourneyRow & { ownerId: string }> | undefined;
}
const memory = globalThis.__oneulJourneyRows ?? (globalThis.__oneulJourneyRows = new Map());
const keyOf = (ownerId: string, planId: string, stage: string) => `${ownerId}\u0000${planId}\u0000${stage}`;
const BASELINE = { planId: "", stage: "baseline" };

export async function loadJourneyRows(ownerId: string): Promise<JourneyRow[]> {
  const db = getServerSupabase();
  if (!db) return [...memory.values()].filter(row => row.ownerId === ownerId).map(({ ownerId: _owner, ...row }) => row);
  const { data, error } = await db.from("journey_notifications").select("plan_id,stage,status,sent_at").eq("owner_id", ownerId).limit(2000);
  if (error) throw error;
  return (data ?? []).map(row => ({ planId: String(row.plan_id), stage: String(row.stage), status: row.status as JourneyRow["status"], sentAt: row.sent_at ? new Date(String(row.sent_at)).toISOString() : null }));
}
/** 한 줄을 맡는다 — 이미 있으면 false(동시에 돈 두 실행 중 하나만 통과) */
async function claim(ownerId: string, planId: string, stage: string, status: JourneyRow["status"]): Promise<boolean> {
  const db = getServerSupabase();
  if (!db) { const key = keyOf(ownerId, planId, stage); if (memory.has(key)) return false; memory.set(key, { ownerId, planId, stage, status, sentAt: null }); return true; }
  const { data, error } = await db.from("journey_notifications").insert({ owner_id: ownerId, plan_id: planId, stage, status }).select("stage");
  return !error && !!data?.length;
}
async function finish(ownerId: string, planId: string, stage: string, status: "sent" | "failed", code: string | null, now: number) {
  const db = getServerSupabase(), sentAt = status === "sent" ? new Date(now).toISOString() : null;
  if (!db) { const row = memory.get(keyOf(ownerId, planId, stage)); if (row) { row.status = status; row.sentAt = sentAt; } return; }
  await db.from("journey_notifications").update({ status, error_code: code, sent_at: sentAt }).eq("owner_id", ownerId).eq("plan_id", planId).eq("stage", stage);
}
async function release(ownerId: string, planId: string, stage: string) {
  const db = getServerSupabase();
  if (!db) { memory.delete(keyOf(ownerId, planId, stage)); return; }
  await db.from("journey_notifications").delete().eq("owner_id", ownerId).eq("plan_id", planId).eq("stage", stage).eq("status", "processing");
}

/* 대화 끝 권유 카드 — '괜찮아요'를 누른 계정에는 다시 묻지 않는다(같은 표에 한 줄). 표가 아직 없으면 기억하지 못하고 다음에 또 묻는다 */
const OFFER = { planId: "", stage: "offer" };
export async function declineJourneyOffer(ownerId: string): Promise<void> { await claim(ownerId, OFFER.planId, OFFER.stage, "skipped"); }
export async function journeyOfferDeclined(ownerId: string): Promise<boolean> {
  try { return (await loadJourneyRows(ownerId)).some(row => row.planId === OFFER.planId && row.stage === OFFER.stage); } catch { return false; }
}

export type JourneyPreview = { phone: string; planId: string; stage: JourneyStage; text: string };
export type JourneyAlertRun = { contacts: number; baselined: number; sent: number; failed: number; skipped: number; deferred: number; reason?: string; preview: JourneyPreview[] };
export type JourneyAlertDeps = {
  now?: number;
  sms: CustomerSmsConfig | null;
  /** 실제로 보내지 않고 보낼 문구와 가린 번호만 남긴다(개발 서버). 기록에는 '보냄'으로 적혀 같은 단계가 다시 나오지 않는다 */
  dryRun?: boolean;
  transport?: typeof fetch;
  send?: (input: { eventId: string; recipient: string; stage: JourneyStage }) => Promise<CustomerSmsResult>;
  /** 그 계정의 사업마다 지금까지 지난 단계 — 기본은 저장된 사업과 공개한 홈페이지를 읽는다(테스트가 바꿔 끼운다) */
  stagesFor?: (ownerId: string) => Promise<OwnerStages>;
};
export type OwnerStages = Array<{ planId: string; updatedAt: string; stages: JourneyStage[] }>;
export async function ownerJourneyStages(ownerId: string): Promise<OwnerStages> {
  const ownerHash = hashIdentityToken(userProjectToken(ownerId));
  const [state, published] = await Promise.all([loadPlanState(ownerHash), publishedOwnerPlanIds(ownerHash)]);
  return state.plans.map(plan => ({ planId: plan.id, updatedAt: String(plan.updatedAt ?? ""), stages: reachedJourneyStages(plan as Plan, published.has(plan.id)) }));
}

export async function runJourneyAlerts(deps: JourneyAlertDeps, limit = 30): Promise<JourneyAlertRun> {
  const now = deps.now ?? Date.now();
  const result: JourneyAlertRun = { contacts: 0, baselined: 0, sent: 0, failed: 0, skipped: 0, deferred: 0, preview: [] };
  if (!inJourneySendWindow(now)) return { ...result, reason: "quiet_hours" };
  if (!deps.sms && !deps.dryRun && !deps.send) return { ...result, reason: "sms_disabled" };
  const contacts = await listEnabledAlertContacts();
  result.contacts = contacts.length;
  let budget = limit;
  for (const { ownerId, phone } of contacts) {
    if (budget <= 0) break;
    const [plans, rows] = await Promise.all([(deps.stagesFor ?? ownerJourneyStages)(ownerId), loadJourneyRows(ownerId)]);
    const recorded = new Set(rows.map(row => `${row.planId}\u0000${row.stage}`));
    const pending = plans.map(plan => ({ plan, stages: plan.stages.filter(stage => !recorded.has(`${plan.planId}\u0000${stage}`)) })).filter(item => item.stages.length);
    // 처음 보는 계정 — 지금까지 지난 단계는 보내지 않고 적어만 둔다
    if (!recorded.has(`${BASELINE.planId}\u0000${BASELINE.stage}`)) {
      for (const { plan, stages } of pending) for (const stage of stages) await claim(ownerId, plan.planId, stage, "skipped");
      await claim(ownerId, BASELINE.planId, BASELINE.stage, "skipped");
      result.baselined += 1;
      continue;
    }
    if (!pending.length) continue;
    // 한 계정에 하루 한 통 — 오늘 이미 보냈으면 내일 아침으로
    if (rows.some(row => row.status === "sent" && row.sentAt && kstDay(Date.parse(row.sentAt)) === kstDay(now))) { result.deferred += 1; continue; }
    // 가장 최근에 고친 사업의 가장 나중 단계 하나만. 그 사업의 앞 단계는 건너뛴다
    const { plan, stages } = [...pending].sort((a, b) => b.plan.updatedAt.localeCompare(a.plan.updatedAt))[0];
    const stage = stages[stages.length - 1];
    for (const earlier of stages.slice(0, -1)) if (await claim(ownerId, plan.planId, earlier, "skipped")) result.skipped += 1;
    if (!await claim(ownerId, plan.planId, stage, "processing")) continue;
    budget -= 1;
    if (deps.dryRun) {
      const preview = { phone: maskAlertPhone(phone), planId: plan.planId, stage, text: JOURNEY_SMS_TEXT[stage] };
      console.info("[journey-alerts] dry run", JSON.stringify(preview));
      result.preview.push(preview);
      await finish(ownerId, plan.planId, stage, "sent", "DRY_RUN", now);
      result.sent += 1;
      continue;
    }
    const eventId = await stableEventId(`journey:${ownerId}:${plan.planId}:${stage}`);
    const sent = deps.send ? await deps.send({ eventId, recipient: phone, stage }) : await sendRelayV4(deps.sms!, { eventId, eventType: "journey-stage", recipient: phone, params: { stage } }, deps.transport);
    if (relayUnsupported(sent)) { await release(ownerId, plan.planId, stage); return { ...result, reason: "relay_upgrade_required" }; }
    // 갔는지 모르면 맡은 줄을 풀어 다음 실행에 다시 — 같은 eventId 라 중계가 두 번 보내지 않는다
    if (sent.status === "uncertain") { await release(ownerId, plan.planId, stage); result.failed += 1; continue; }
    const ok = sent.status === "accepted" || sent.status === "test_accepted";
    await finish(ownerId, plan.planId, stage, ok ? "sent" : "failed", ok ? null : sent.code.slice(0, 80), now);
    if (ok) result.sent += 1; else result.failed += 1;
  }
  return result;
}

/** 예약 실행에서 부른다 */
export async function runJourneyAlertsNow(limit = 30) {
  return runJourneyAlerts({ sms: customerSmsConfig() }, limit);
}
