/**
 * AI 수정 토큰 유효기간(충전일부터 1년) 계산. 순수 함수라 DB 없이 검증한다.
 * 사용분은 그 시점에 유효한 가장 오래된 충전분부터 차감하고(먼저 산 것부터 소진), 1년이 지난 충전분의 남은 토큰은 사라진다.
 */
import { TOKEN_VALIDITY_DAYS } from "../payments/domain";

export { TOKEN_VALIDITY_DAYS };
const DAY_MS = 86_400_000;

/** endsAt — 환불한 충전분은 그 시각부터 쓸 수 없다(그 전에 쓴 양은 이 충전분에서 빠진 것으로 둔다) */
export type TokenBatch = { at: number; tokens: number; endsAt?: number };
export type TokenUse = { at: number; tokens: number };

export function tokenBalanceWithExpiry(batches: TokenBatch[], uses: TokenUse[], now: number, validityDays = TOKEN_VALIDITY_DAYS) {
  const validity = validityDays * DAY_MS;
  const left = [...batches].sort((a, b) => a.at - b.at).map(batch => ({ ...batch, left: batch.tokens }));
  let used = 0;
  for (const use of [...uses].sort((a, b) => a.at - b.at)) {
    used += use.tokens;
    let rest = use.tokens;
    for (const batch of left) {
      if (rest <= 0) break;
      if (batch.at > use.at || use.at >= batch.at + validity || (batch.endsAt !== undefined && use.at >= batch.endsAt) || batch.left <= 0) continue;
      const take = Math.min(batch.left, rest);
      batch.left -= take; rest -= take;
    }
  }
  /*
   * 환불한 충전분도 위 차감 계산에는 넣는다 — 빼면 그 충전분에서 이미 쓴 양이 다른 충전분에서 한 번 더 빠졌다.
   * 남은 양·산 양에서는 뺀다.
   */
  const active = left.filter(batch => now < batch.at + validity && (batch.endsAt === undefined || now < batch.endsAt));
  const remaining = active.reduce((sum, batch) => sum + batch.left, 0);
  const purchased = active.reduce((sum, batch) => sum + batch.tokens, 0);
  const expired = left.filter(batch => now >= batch.at + validity && batch.endsAt === undefined).reduce((sum, batch) => sum + batch.left, 0);
  const next = active.filter(batch => batch.left > 0).sort((a, b) => a.at - b.at)[0];
  return { purchased, used, remaining, expired, expiresAt: next ? new Date(next.at + validity).toISOString() : null };
}
