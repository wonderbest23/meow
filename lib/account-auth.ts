import { createClient, type Session, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  AUTH_ACCESS_COOKIE,
  AUTH_REFRESH_COOKIE,
  GUEST_COOKIE,
  hashIdentityToken,
  userProjectToken,
} from "./identity-tokens";
import { getServerSupabase } from "./persistence";

function authConfiguration() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return url && key ? { url, key } : null;
}

export function authConfigured() {
  return Boolean(authConfiguration());
}

export function createServerAuthClient() {
  const config = authConfiguration();
  if (!config) throw new Error("로그인 서버가 아직 설정되지 않았습니다.");
  return createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/** 리프레시 토큰 보관 기간 — '로그인 상태 유지'를 켰을 때 이 기간 동안 유지된다. */
const SESSION_DAYS = 30;

/**
 * '로그인 상태 유지' 선택을 기억하는 표식.
 * 쿠키에서 만료 시각을 되읽을 수 없으므로, 토큰을 갱신할 때 원래 선택을
 * 그대로 이어가려면 선택 자체를 따로 남겨야 한다.
 */
const REMEMBER_COOKIE = "venture_remember";

export async function setAccountSession(session: Session, remember = true) {
  const cookieStore = await cookies();
  // 유지를 끄면 만료를 주지 않는다 — 브라우저를 닫으면 사라지는 세션 쿠키가 된다
  const life = remember ? { maxAge: 60 * 60 * 24 * SESSION_DAYS } : {};
  /*
   * 액세스 쿠키에도 긴 만료를 준다.
   * 짧게 주면(예: 1시간) 쿠키가 사라진 뒤 리프레시 토큰이 살아 있어도
   * 갱신을 시도할 실마리가 없어 로그아웃된 것처럼 보인다.
   * 토큰 자체의 유효기간은 JWT의 exp가 정하고, 서버가 매번 검증한다.
   */
  cookieStore.set(AUTH_ACCESS_COOKIE, session.access_token, { ...cookieOptions, ...life });
  cookieStore.set(AUTH_REFRESH_COOKIE, session.refresh_token, { ...cookieOptions, ...life });
  if (remember) {
    cookieStore.set(REMEMBER_COOKIE, "1", { ...cookieOptions, httpOnly: false, ...life });
  } else {
    cookieStore.delete(REMEMBER_COOKIE);
  }
}

/** 이 브라우저가 '로그인 상태 유지'로 로그인했는지 */
export async function sessionRemembered(): Promise<boolean> {
  return (await cookies()).get(REMEMBER_COOKIE)?.value === "1";
}

export async function clearAccountSession() {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_ACCESS_COOKIE);
  cookieStore.delete(AUTH_REFRESH_COOKIE);
  cookieStore.delete(REMEMBER_COOKIE);
  cookieStore.delete(GUEST_COOKIE);
}

export async function getAuthenticatedUser(): Promise<User | null> {
  if (!authConfigured()) return null;
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(AUTH_ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(AUTH_REFRESH_COOKIE)?.value;
  // 둘 다 없으면 로그인한 적이 없다
  if (!accessToken && !refreshToken) return null;

  const auth = createServerAuthClient();

  if (accessToken) {
    const { data } = await auth.auth.getUser(accessToken);
    if (data.user) return data.user;
  }

  /*
   * 액세스 토큰이 없거나 만료됐어도 리프레시 토큰이 살아 있으면 갱신한다.
   * (예전에는 액세스 쿠키가 없으면 여기까지 오지 못해, 한 시간 뒤 로그아웃된 것처럼 보였다)
   */
  if (!refreshToken) return null;
  const refreshed = await auth.auth.refreshSession({ refresh_token: refreshToken });
  if (!refreshed.data.session || !refreshed.data.user) return null;
  // 갱신할 때도 처음 선택한 유지 여부를 그대로 따른다
  await setAccountSession(refreshed.data.session, await sessionRemembered());
  return refreshed.data.user;
}

export async function currentGuestHash() {
  const token = (await cookies()).get(GUEST_COOKIE)?.value;
  return token ? hashIdentityToken(token) : null;
}

export async function claimGuestProjects(userId: string, previousGuestHash: string | null) {
  const supabase = getServerSupabase();
  if (!supabase) return;
  const userHash = hashIdentityToken(userProjectToken(userId));
  if (previousGuestHash && previousGuestHash !== userHash) {
    const { error } = await supabase.from("projects").update({ owner_id: userId, guest_token_hash: userHash }).eq("guest_token_hash", previousGuestHash);
    if (error) throw error;
    await supabase.from("payment_orders").update({ guest_token_hash: userHash }).eq("guest_token_hash", previousGuestHash);
  }
  const { error } = await supabase.from("projects").update({ guest_token_hash: userHash }).eq("owner_id", userId);
  if (error) throw error;

  const preferenceFilters = [`owner_id.eq.${userId}`];
  if (previousGuestHash && previousGuestHash !== userHash) {
    preferenceFilters.push(`guest_token_hash.eq.${previousGuestHash}`);
  }
  const preferenceRows = await supabase
    .from("opportunity_preferences")
    .select("opportunity_key,preference,opportunity,created_at,updated_at")
    .or(preferenceFilters.join(","))
    .order("updated_at", { ascending: false });
  if (preferenceRows.error) throw preferenceRows.error;

  const latestByOpportunity = new Map<string, Record<string, unknown>>();
  for (const row of preferenceRows.data ?? []) {
    const key = row.opportunity_key as string;
    if (!latestByOpportunity.has(key)) latestByOpportunity.set(key, row);
  }
  if (latestByOpportunity.size) {
    const { error: upsertError } = await supabase.from("opportunity_preferences").upsert(
      [...latestByOpportunity.values()].map((row) => ({
        owner_id: userId,
        guest_token_hash: userHash,
        opportunity_key: row.opportunity_key,
        preference: row.preference,
        opportunity: row.opportunity,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })),
      { onConflict: "guest_token_hash,opportunity_key" },
    );
    if (upsertError) throw upsertError;
  }
  if (previousGuestHash && previousGuestHash !== userHash) {
    const { error: guestDeleteError } = await supabase
      .from("opportunity_preferences")
      .delete()
      .eq("guest_token_hash", previousGuestHash);
    if (guestDeleteError) throw guestDeleteError;
  }
  const { error: ownerCleanupError } = await supabase
    .from("opportunity_preferences")
    .delete()
    .eq("owner_id", userId)
    .neq("guest_token_hash", userHash);
  if (ownerCleanupError) throw ownerCleanupError;
}

export async function attachProjectToUser(projectId: string, userId: string) {
  const supabase = getServerSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("projects").update({ owner_id: userId, guest_token_hash: hashIdentityToken(userProjectToken(userId)) }).eq("id", projectId);
  if (error) throw error;
}

export async function listAccountProjects(userId: string) {
  const supabase = getServerSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase.from("projects").select("id,title,status,payment_status,active_stage,created_at,updated_at").eq("owner_id", userId).order("updated_at", { ascending: false }).limit(30);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    status: row.status as string,
    paymentStatus: row.payment_status as string,
    activeStage: row.active_stage as number,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}
