/*
 * 결제가 '진짜 돈'이어야 하는 운영 환경인지.
 *
 * 운영(oneulstart.com)은 APP_ENV 를 두지 않고(.env.production·wrangler.jsonc), 빌드가 NODE_ENV=production 이다.
 * 스테이징·프리런치·로컬 미리보기는 APP_ENV 를 staging·prelaunch·local 로 둔다(lib/launch-scope.ts 와 같은 판정).
 * APP_ENV(또는 NEXT_PUBLIC_APP_ENV)가 production 이면 NODE_ENV 와 상관없이 운영으로 본다.
 *
 * 기본값은 process.env.NODE_ENV 를 그대로 쓴 식으로 읽는다 — 빌드 때 값이 박혀, Cloudflare 새 isolate 의
 * 첫 요청에서 process.env 가 비어 있어도 운영 판정이 흔들리지 않는다(lib/launch-scope.ts 2026-10-08 사고와 같은 이유).
 */
type RuntimeEnv = { NODE_ENV?: string; APP_ENV?: string; NEXT_PUBLIC_APP_ENV?: string };

export function isProductionPaymentRuntime(env: RuntimeEnv = { NODE_ENV: process.env.NODE_ENV, APP_ENV: process.env.APP_ENV, NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV }): boolean {
  const appEnv = (env.APP_ENV?.trim() || env.NEXT_PUBLIC_APP_ENV?.trim() || "").toLowerCase();
  if (appEnv === "production") return true;
  if (appEnv) return false; // staging · prelaunch · local 등 격리된 환경
  return env.NODE_ENV === "production";
}
