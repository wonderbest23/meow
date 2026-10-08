// Rate limiter with two backends:
//
//  - in-memory (default): blunts bursts and scripted abuse with zero infrastructure, but is
//    per-runtime-instance — on horizontally scaled platforms (multiple Cloudflare Worker isolates)
//    the counter is not shared, so it is a first line of defence rather than a hard quota.
//  - supabase (opt-in via RATE_LIMIT_BACKEND=supabase): a strongly-consistent, global counter
//    backed by the public.bump_rate_limit() SQL function (migration 0018). One round-trip per
//    check; if the call fails it degrades to the in-memory limiter rather than failing open.

import { getServerSupabase } from "./persistence";

type Hit = { count: number; resetAt: number };

const buckets = new Map<string, Map<string, Hit>>();

function bucketFor(name: string) {
  let bucket = buckets.get(name);
  if (!bucket) {
    bucket = new Map();
    buckets.set(name, bucket);
  }
  return bucket;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function rateLimit(
  name: string,
  key: string,
  options: { limit: number; windowMs: number },
): RateLimitResult {
  const bucket = bucketFor(name);
  const now = Date.now();
  const existing = bucket.get(key);

  if (!existing || existing.resetAt <= now) {
    bucket.set(key, { count: 1, resetAt: now + options.windowMs });
    // Opportunistically evict expired keys so the map does not grow unbounded.
    if (bucket.size > 5_000) {
      for (const [entryKey, hit] of bucket) {
        if (hit.resetAt <= now) bucket.delete(entryKey);
      }
    }
    return { ok: true, remaining: options.limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= options.limit) {
    return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)) };
  }

  existing.count += 1;
  return { ok: true, remaining: options.limit - existing.count, retryAfterSeconds: 0 };
}

// Identify the caller for limiting purposes. Prefers Cloudflare's trusted client IP header,
// then the left-most X-Forwarded-For hop, and finally a shared fallback so a missing header
// degrades to a single shared bucket rather than an unlimited one.
export function clientKey(request: Request): string {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

function distributedEnabled() {
  return process.env.RATE_LIMIT_BACKEND?.trim() === "supabase";
}

// 공유 카운터가 실패하면 서버(isolate)마다 따로 세는 메모리 한도로 내려간다 — 예전엔 아무 기록 없이 내려가
// 운영 DB에 bump_rate_limit(0018)이 없어도 몰랐다. isolate 하나에서 같은 오류는 한 번만 남긴다.
const reportedFallbacks = new Set<string>();
function reportFallback(code: string, message: string) {
  if (reportedFallbacks.has(code)) return;
  reportedFallbacks.add(code);
  console.warn("[rate-limit]", JSON.stringify({ event: "distributed_fallback", code, message: message.slice(0, 160) }));
}

// Strongly-consistent counter via Supabase. Returns null (so the caller falls back to the
// in-memory limiter) when the backend is disabled, unavailable, or errors.
async function rateLimitDistributed(
  name: string,
  key: string,
  options: { limit: number; windowMs: number },
): Promise<RateLimitResult | null> {
  if (!distributedEnabled()) return null;
  const supabase = getServerSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("bump_rate_limit", {
      p_bucket: name,
      p_key: key,
      p_window_ms: options.windowMs,
    });
    if (error || typeof data !== "number") {
      reportFallback(error?.code ?? "not_a_number", error?.message ?? `unexpected ${typeof data}`);
      return null;
    }
    const count = data;
    if (count > options.limit) {
      return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil(options.windowMs / 1000)) };
    }
    return { ok: true, remaining: Math.max(0, options.limit - count), retryAfterSeconds: 0 };
  } catch (error) {
    reportFallback("exception", error instanceof Error ? error.message : String(error));
    return null;
  }
}

/** 한도를 한 번 센다 — 공유 카운터, 안 되면 메모리. 응답 모양을 직접 정해야 할 때 쓴다 */
export async function checkRateLimit(name: string, key: string, options: { limit: number; windowMs: number }): Promise<RateLimitResult> {
  return (await rateLimitDistributed(name, key, options)) ?? rateLimit(name, key, options);
}

export function tooManyRequests(retryAfterSeconds: number, message = "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.") {
  return Response.json(
    { error: { code: "RATE_LIMITED", message } },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSeconds),
        "Cache-Control": "private, no-store, max-age=0",
      },
    },
  );
}

// Convenience wrapper: enforce a limit and return a 429 Response when exceeded, else null.
// Uses the Supabase backend when enabled, falling back to the in-memory limiter otherwise.
export async function enforceRateLimit(
  name: string,
  request: Request,
  options: { limit: number; windowMs: number; message?: string; key?: string },
): Promise<Response | null> {
  const key = options.key ?? clientKey(request);
  const result = (await rateLimitDistributed(name, key, options)) ?? rateLimit(name, key, options);
  if (result.ok) return null;
  return tooManyRequests(result.retryAfterSeconds, options.message);
}
