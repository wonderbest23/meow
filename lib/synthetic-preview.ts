import type { User } from "@supabase/supabase-js";

/*
 * 합성 미리보기 — 가짜 로그인(쿠키 syn_uid)·가짜 AI·메모리 DB로 운영과 같은 빌드를 띄워 화면을 점검할 때만 켠다.
 * (scripts/preview/*.sh, scripts/synthetic-e2e/preview-fake.mts, docs/cloud-preview.md)
 *
 * 세 조건이 모두 맞아야 켜진다. 하나라도 어긋나면 꺼지고, 개발용 주소(/api/dev/synthetic-*)는 404 로 답하며
 * 로그인은 syn_uid 쿠키를 보지 않는다.
 *   1) SYNTHETIC_AUTH=1
 *   2) PERSISTENCE_MODE=demo-memory   — 운영·스테이징은 Supabase 라 여기서 걸린다
 *   3) APP_ENV 가 prelaunch 또는 local — 운영(oneulstart.com)은 APP_ENV 를 두지 않는다(.env.production·wrangler.jsonc)
 *      NEXT_PUBLIC_APP_ENV 가 production 이어도 꺼진다.
 * 값은 실행 중 process.env 에서 읽는다. 값을 못 읽으면(빈 값) 꺼진 쪽으로 간다.
 */
type SyntheticEnv = { SYNTHETIC_AUTH?: string; PERSISTENCE_MODE?: string; APP_ENV?: string; NEXT_PUBLIC_APP_ENV?: string };

const PREVIEW_APP_ENVS = new Set(["prelaunch", "local"]);

export const SYNTHETIC_UID_COOKIE = "syn_uid";
/** 합성 계정 이름 — syn-1, syn-901, syn-chat-3-12345 처럼 syn- 로 시작하는 짧은 이름만 받는다 */
export const SYNTHETIC_UID_PATTERN = /^syn-[a-z0-9-]{1,40}$/;

export function syntheticPreviewEnabled(env: SyntheticEnv = process.env): boolean {
  if (env.SYNTHETIC_AUTH?.trim() !== "1") return false;
  if (env.PERSISTENCE_MODE?.trim() !== "demo-memory") return false;
  if (env.NEXT_PUBLIC_APP_ENV?.trim() === "production") return false;
  return PREVIEW_APP_ENVS.has(env.APP_ENV?.trim() ?? "");
}

/**
 * 합성 미리보기에서 syn_uid 쿠키로 만든 가짜 사용자.
 * 미리보기가 꺼져 있으면 undefined(진짜 로그인으로 넘어간다), 켜져 있는데 쿠키가 없거나 이상하면 null(로그인 안 함).
 */
export function syntheticPreviewUser(uid: string | undefined, env: SyntheticEnv = process.env): User | null | undefined {
  if (!syntheticPreviewEnabled(env)) return undefined;
  if (!uid || !SYNTHETIC_UID_PATTERN.test(uid)) return null;
  return { id: uid, email: `${uid}@synthetic.invalid`, app_metadata: {}, user_metadata: {}, aud: "authenticated", created_at: new Date(0).toISOString() } as unknown as User;
}

/** 개발용 주소가 미리보기 밖에서 불렸을 때의 답 — 있는 줄도 모르게 빈 404 */
export function syntheticPreviewNotFound() {
  return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}
