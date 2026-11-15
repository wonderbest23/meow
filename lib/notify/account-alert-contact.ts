import { getServerSupabase } from "../persistence";
import { normalizeAlertPhone } from "./customer-sms";

/*
 * 진행 단계 안내 알림을 받을 번호 — 계정마다 하나(account_alert_contacts, 마이그레이션 20261115120000). 없으면 프로세스 메모리(데모 · 테스트).
 * 번호 등록 · 수신 동의 · 끄기만 한다. 발송은 아직 붙이지 않았다(카카오 채널 심사 뒤).
 */
export type AlertContact = { phone: string; agreedAt: string; disabledAt: string | null };
/** 화면에 내보내는 모양 — 번호는 가운데를 가린다 */
export type AlertContactView = { phone: string; agreedAt: string; enabled: boolean };

/** 동의 문구 — 화면과 기록이 같은 글을 쓴다. 바꾸면 다시 동의를 받아야 한다 */
export const STAGE_ALERT_MOMENTS = ["사업 방향 정리 완료", "사업계획서 완성", "홈페이지 공개", "사업자등록 단계 도달", "개업 준비 완료", "첫 손님 문의 도착"] as const;
export const STAGE_ALERT_CONSENT = "진행 단계 안내 수신 동의 (선택). 아래 여섯 가지 때 다음 순서를 이 번호로 카카오 알림톡(안 되면 문자)으로 받는 데 동의합니다. 번호는 알림에만 쓰고 언제든 끌 수 있어요.";

export const maskAlertPhone = (phone: string) => `${phone.slice(0, 3)}-••••-${phone.slice(-4)}`;
export const viewOf = (contact: AlertContact | null): AlertContactView | null =>
  contact ? { phone: maskAlertPhone(contact.phone), agreedAt: contact.agreedAt, enabled: contact.disabledAt === null } : null;

export class AlertContactError extends Error {
  constructor(public code: "PHONE_INVALID" | "CONSENT_REQUIRED" | "NOT_REGISTERED" | "NOT_READY", message: string, public status = 400) { super(message); }
}

declare global {
  var __oneulAlertContacts: Map<string, AlertContact> | undefined;
}
const memory = globalThis.__oneulAlertContacts ?? (globalThis.__oneulAlertContacts = new Map());
const missingTable = (error: { code?: string } | null) => error?.code === "42P01" || error?.code === "PGRST205";
// 표가 아직 없으면(마이그레이션 전) 저장한 척하지 않는다 — 동의 기록이 사라지면 안 된다
const notReady = () => new AlertContactError("NOT_READY", "알림 설정을 아직 준비하고 있어요. 잠시 후 다시 시도해 주세요.", 503);

export async function loadAlertContact(ownerId: string): Promise<AlertContact | null> {
  const supabase = getServerSupabase();
  if (!supabase) return memory.get(ownerId) ?? null;
  const { data, error } = await supabase.from("account_alert_contacts").select("phone,agreed_at,disabled_at").eq("owner_id", ownerId).maybeSingle();
  if (error) { if (missingTable(error)) return null; throw error; }
  return data ? { phone: String(data.phone), agreedAt: new Date(String(data.agreed_at)).toISOString(), disabledAt: data.disabled_at ? new Date(String(data.disabled_at)).toISOString() : null } : null;
}

async function store(ownerId: string, contact: AlertContact): Promise<AlertContact> {
  const supabase = getServerSupabase();
  if (!supabase) { memory.set(ownerId, contact); return contact; }
  const { error } = await supabase.from("account_alert_contacts").upsert({ owner_id: ownerId, phone: contact.phone, agreed_at: contact.agreedAt, disabled_at: contact.disabledAt, updated_at: new Date().toISOString() }, { onConflict: "owner_id" });
  if (error) { if (missingTable(error)) throw notReady(); throw error; }
  return contact;
}

/** 번호 등록(바꾸기 포함) — 동의 체크가 있어야 하고, 등록하면 켜진다. 동의 시각은 이때로 새로 적는다 */
export async function registerAlertContact(ownerId: string, input: { phone: string; agreed: boolean }, now = new Date()): Promise<AlertContact> {
  const phone = normalizeAlertPhone(input.phone);
  if (!phone) throw new AlertContactError("PHONE_INVALID", "010으로 시작하는 휴대폰 번호 11자리를 적어 주세요.");
  if (!input.agreed) throw new AlertContactError("CONSENT_REQUIRED", "수신 동의에 체크해 주세요.");
  return store(ownerId, { phone, agreedAt: now.toISOString(), disabledAt: null });
}

/** 켜고 끄기 — 번호와 동의 시각은 그대로 두고 끈 시각만 적는다 */
export async function setAlertContactEnabled(ownerId: string, enabled: boolean, now = new Date()): Promise<AlertContact> {
  const current = await loadAlertContact(ownerId);
  if (!current) throw new AlertContactError("NOT_REGISTERED", "먼저 번호를 등록해 주세요.", 404);
  return store(ownerId, { ...current, disabledAt: enabled ? null : now.toISOString() });
}

/** 켜 둔 계정 모두 — 발송(journey-alerts)이 돈다 */
export async function listEnabledAlertContacts(): Promise<Array<{ ownerId: string; phone: string }>> {
  const supabase = getServerSupabase();
  if (!supabase) return [...memory.entries()].filter(([, contact]) => contact.disabledAt === null).map(([ownerId, contact]) => ({ ownerId, phone: contact.phone }));
  const { data, error } = await supabase.from("account_alert_contacts").select("owner_id,phone").is("disabled_at", null).limit(5000);
  if (error) { if (missingTable(error)) return []; throw error; }
  return (data ?? []).map(row => ({ ownerId: String(row.owner_id), phone: String(row.phone) })).filter(row => /^010\d{8}$/.test(row.phone));
}

/** 번호와 동의 기록을 지운다 */
export async function removeAlertContact(ownerId: string): Promise<void> {
  const supabase = getServerSupabase();
  if (!supabase) { memory.delete(ownerId); return; }
  const { error } = await supabase.from("account_alert_contacts").delete().eq("owner_id", ownerId);
  if (error && !missingTable(error)) throw error;
}
