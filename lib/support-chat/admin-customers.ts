import { hashIdentityToken, userProjectToken } from "../identity-tokens";
import { getServerSupabase } from "../persistence";

/*
 * 1:1 상담의 손님이 누구인지 — 관리자 상담함 전용(서버에서만).
 *
 * 상담 대화는 손님 식별 해시(guest_token_hash)만 남긴다. 로그인한 손님의 해시는 계정 id 로 만든 값이라
 * (lib/api-auth.ts → userProjectToken) 계정 목록을 같은 방법으로 해시해 맞춰 보면 계정 이메일을 찾을 수 있다.
 * 맞는 계정이 없으면 로그인하지 않고 남긴 문의다. 예전 화면은 '고객 7C30'만 보여 누구에게 답하는지 몰랐다(2026-10-22 점검).
 */
export type SupportCustomer =
  | { kind: "account"; email: string | null }
  | { kind: "guest" }
  | { kind: "unknown" };

type AccountIndex = { at: number; byHash: Map<string, { email: string | null }> };

const PAGE = 1000;
const MAX_PAGES = 20;
/* 계정 목록은 5분 동안 다시 쓰고, 모르는 손님이 생기면 30초 뒤부터 다시 읽는다(상담함이 4초마다 새로고침한다) */
const FRESH_MS = 5 * 60_000;
const RESCAN_MS = 30_000;

let index: AccountIndex | null = null;

async function buildIndex(): Promise<AccountIndex> {
  const db = getServerSupabase();
  if (!db) throw new Error("SUPPORT_CUSTOMER_DB_UNAVAILABLE");
  const byHash = new Map<string, { email: string | null }>();
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw error;
    const users = data?.users ?? [];
    for (const user of users) byHash.set(hashIdentityToken(userProjectToken(user.id)), { email: user.email ?? null });
    if (users.length < PAGE) break;
  }
  return { at: Date.now(), byHash };
}

export async function resolveSupportCustomers(hashes: string[]): Promise<Map<string, SupportCustomer>> {
  const result = new Map<string, SupportCustomer>();
  const unique = [...new Set(hashes.filter(Boolean))];
  // DB 없는 로컬 데모 — 계정이 없으니 모두 로그인 안 한 손님
  if (!getServerSupabase()) {
    for (const hash of unique) result.set(hash, { kind: "guest" });
    return result;
  }
  try {
    const now = Date.now();
    const unknown = unique.some((hash) => !index?.byHash.has(hash));
    if (!index || now - index.at > FRESH_MS || (unknown && now - index.at > RESCAN_MS)) index = await buildIndex();
    for (const hash of unique) {
      const account = index.byHash.get(hash);
      result.set(hash, account ? { kind: "account", email: account.email } : { kind: "guest" });
    }
  } catch (error) {
    // 계정 목록을 못 읽었으면 '로그인 안 한 손님'이라고 단정하지 않는다
    console.error("[support-chat] customer lookup failed", error);
    for (const hash of unique) result.set(hash, index?.byHash.has(hash) ? { kind: "account", email: index.byHash.get(hash)!.email } : { kind: "unknown" });
  }
  return result;
}
