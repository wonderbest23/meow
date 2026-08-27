import { getServerSupabase } from "../persistence";
import { consultProfileSchema, type ConsultProfile } from "./domain";

/*
 * 상담 보관.
 *
 * 예전에는 상담을 어디에도 저장하지 않았다 — "남의 창업 고민을 우리가 들고 있을
 * 이유가 없다"는 판단이었다. 그런데 그 대가로 새로고침 한 번에 대화가 사라지고,
 * 로그인하러 다녀오는 사이 상담 내용이 통째로 날아갔다. 손님이 20분 답한 것을
 * 잃는 쪽이 더 나쁘다.
 *
 * Supabase 가 없으면(데모) 프로세스 메모리에 둔다 — 없다고 상담이 끊기지는 않는다.
 */

export type ConsultTurn = { role: "user" | "assistant"; text: string; at: string };

export interface ConsultSession {
  profile: ConsultProfile;
  messages: ConsultTurn[];
  /** 오늘 주고받은 횟수 — 사용량 제한 판정에 쓴다 */
  turnsToday: number;
}

const EMPTY: ConsultSession = { profile: {}, messages: [], turnsToday: 0 };

/** 대화가 길어져도 표가 무거워지지 않게 — 최근 것부터 남긴다 */
const MAX_MESSAGES = 80;

const memory = new Map<string, ConsultSession & { day: string }>();
const today = () => new Date().toISOString().slice(0, 10);

function normalizeTurns(value: unknown): ConsultTurn[] {
  if (!Array.isArray(value)) return [];
  const out: ConsultTurn[] = [];
  for (const raw of value) {
    const r = raw as Partial<ConsultTurn>;
    if (r?.role !== "user" && r?.role !== "assistant") continue;
    if (typeof r.text !== "string" || !r.text.trim()) continue;
    out.push({ role: r.role, text: r.text.slice(0, 2000), at: typeof r.at === "string" ? r.at : new Date().toISOString() });
  }
  return out.slice(-MAX_MESSAGES);
}

export async function loadConsultSession(ownerHash: string): Promise<ConsultSession> {
  const supabase = getServerSupabase();
  if (!supabase) {
    const held = memory.get(ownerHash);
    if (!held) return { ...EMPTY };
    return { profile: held.profile, messages: held.messages, turnsToday: held.day === today() ? held.turnsToday : 0 };
  }
  const { data, error } = await supabase
    .from("consult_sessions")
    .select("profile, messages, turns_today, turns_day")
    .eq("owner_hash", ownerHash)
    .maybeSingle();
  if (error || !data) return { ...EMPTY };
  const profile = consultProfileSchema.safeParse(data.profile ?? {});
  return {
    profile: profile.success ? profile.data : {},
    messages: normalizeTurns(data.messages),
    /* 날짜가 바뀌었으면 오늘 쓴 횟수는 0 이다 */
    turnsToday: data.turns_day === today() ? Number(data.turns_today) || 0 : 0,
  };
}

/** 한 번 주고받은 뒤 상태를 갱신한다. 저장에 실패해도 상담은 계속된다. */
export async function saveConsultTurn(
  ownerHash: string,
  next: { profile: ConsultProfile; appended: ConsultTurn[]; turnsToday: number },
): Promise<void> {
  const prev = await loadConsultSession(ownerHash).catch(() => ({ ...EMPTY }));
  const messages = [...prev.messages, ...next.appended].slice(-MAX_MESSAGES);
  const supabase = getServerSupabase();
  if (!supabase) {
    memory.set(ownerHash, { profile: next.profile, messages, turnsToday: next.turnsToday, day: today() });
    return;
  }
  await supabase.from("consult_sessions").upsert(
    {
      owner_hash: ownerHash,
      profile: next.profile,
      messages,
      turns_today: next.turnsToday,
      turns_day: today(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_hash" },
  );
}

/*
 * '새 상담' — 대화와 상담 카드만 지운다.
 *
 * 오늘 쓴 횟수는 남긴다. 지워 주면 새 상담 버튼이 하루 한도를 초기화하는
 * 구멍이 된다.
 */
export async function resetConsultSession(ownerHash: string): Promise<void> {
  const supabase = getServerSupabase();
  if (!supabase) {
    const held = memory.get(ownerHash);
    if (held) memory.set(ownerHash, { profile: {}, messages: [], turnsToday: held.turnsToday, day: held.day });
    return;
  }
  await supabase
    .from("consult_sessions")
    .update({ profile: {}, messages: [], updated_at: new Date().toISOString() })
    .eq("owner_hash", ownerHash);
}

/*
 * 하루 사용량.
 *
 * 로그인하지 않은 사람은 맛만 본다 — 상담은 유입 통로라 아주 막으면 가입 자체가
 * 줄지만, 열어 두면 계정 없이도 무한히 쓸 수 있어 비용이 사용자와 연결되지 않는다.
 * 로그인하면 넉넉히 열어 준다.
 */
export const CONSULT_FREE_TURNS_GUEST = 3;
export const CONSULT_FREE_TURNS_MEMBER = 20;

export function consultLimitFor(userId: string | null): number {
  return userId ? CONSULT_FREE_TURNS_MEMBER : CONSULT_FREE_TURNS_GUEST;
}
