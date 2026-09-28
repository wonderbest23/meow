import assert from "node:assert/strict";
import { TOKEN_VALIDITY_DAYS, tokenBalanceWithExpiry } from "../lib/landing/token-expiry";

const DAY = 86_400_000;
const t0 = Date.UTC(2026, 0, 1);

assert.equal(TOKEN_VALIDITY_DAYS, 365);

// 유효기간 안: 산 만큼에서 쓴 만큼 빠진다
const fresh = tokenBalanceWithExpiry([{ at: t0, tokens: 200_000 }], [{ at: t0 + DAY, tokens: 80_000 }], t0 + 10 * DAY);
assert.equal(fresh.remaining, 120_000);
assert.equal(fresh.expired, 0);
assert.equal(fresh.expiresAt, new Date(t0 + 365 * DAY).toISOString());

// 1년이 지나면 남은 토큰은 사라진다
const lapsed = tokenBalanceWithExpiry([{ at: t0, tokens: 200_000 }], [{ at: t0 + DAY, tokens: 80_000 }], t0 + 365 * DAY);
assert.equal(lapsed.remaining, 0);
assert.equal(lapsed.expired, 120_000);
assert.equal(lapsed.expiresAt, null);

// 먼저 산 충전분부터 차감 — 새 충전분은 1년 뒤에도 그대로 남는다
const twoPacks = tokenBalanceWithExpiry(
  [{ at: t0, tokens: 200_000 }, { at: t0 + 200 * DAY, tokens: 200_000 }],
  [{ at: t0 + 250 * DAY, tokens: 150_000 }],
  t0 + 400 * DAY,
);
assert.equal(twoPacks.remaining, 200_000);
assert.equal(twoPacks.expired, 50_000);
assert.equal(twoPacks.expiresAt, new Date(t0 + 565 * DAY).toISOString());

// 첫 충전분을 넘는 사용은 그 시점에 유효한 다음 충전분에서 빠진다
const overflow = tokenBalanceWithExpiry(
  [{ at: t0, tokens: 200_000 }, { at: t0 + 10 * DAY, tokens: 200_000 }],
  [{ at: t0 + 20 * DAY, tokens: 250_000 }],
  t0 + 30 * DAY,
);
assert.equal(overflow.remaining, 150_000);
assert.equal(overflow.expiresAt, new Date(t0 + 375 * DAY).toISOString());

// 만료된 충전분으로는 사용을 메우지 않는다
const afterExpiry = tokenBalanceWithExpiry(
  [{ at: t0, tokens: 200_000 }, { at: t0 + 400 * DAY, tokens: 200_000 }],
  [{ at: t0 + 401 * DAY, tokens: 30_000 }],
  t0 + 402 * DAY,
);
assert.equal(afterExpiry.remaining, 170_000);
assert.equal(afterExpiry.expired, 200_000);

console.log(JSON.stringify({ passed: 13 }));
