import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Module from "node:module";
import { closedForLaunch } from "../lib/launch-scope";
import { syntheticPreviewEnabled, syntheticPreviewUser } from "../lib/synthetic-preview";

/*
 * 합성 미리보기(가짜 로그인·가짜 AI·메모리 DB)는 운영에서 절대 켜지지 않는다.
 * 세 조건(SYNTHETIC_AUTH=1, PERSISTENCE_MODE=demo-memory, APP_ENV prelaunch·local)이 모두 맞을 때만 켜지고,
 * 운영처럼 보이는 환경에서는 개발용 주소가 404, 로그인은 syn_uid 쿠키를 보지 않는다.
 */
const PREVIEW = { SYNTHETIC_AUTH: "1", PERSISTENCE_MODE: "demo-memory", APP_ENV: "prelaunch", NEXT_PUBLIC_APP_ENV: "prelaunch" };
const PRODUCTION_LIKE: Array<[string, Record<string, string | undefined>]> = [
  ["운영(APP_ENV 없음·Supabase)", { NODE_ENV: "production", PERSISTENCE_MODE: "supabase" }],
  ["운영에 SYNTHETIC_AUTH 만 실수로 켬", { NODE_ENV: "production", SYNTHETIC_AUTH: "1", PERSISTENCE_MODE: "supabase" }],
  ["메모리 DB + 합성 로그인이지만 APP_ENV 없음", { NODE_ENV: "production", SYNTHETIC_AUTH: "1", PERSISTENCE_MODE: "demo-memory" }],
  ["APP_ENV=production", { ...PREVIEW, APP_ENV: "production" }],
  ["NEXT_PUBLIC_APP_ENV=production", { ...PREVIEW, NEXT_PUBLIC_APP_ENV: "production" }],
  ["스테이징(Supabase)", { SYNTHETIC_AUTH: "1", PERSISTENCE_MODE: "supabase", APP_ENV: "staging" }],
  ["스테이징인데 메모리 DB", { SYNTHETIC_AUTH: "1", PERSISTENCE_MODE: "demo-memory", APP_ENV: "staging" }],
  ["SYNTHETIC_AUTH 가 1 이 아님", { ...PREVIEW, SYNTHETIC_AUTH: "true" }],
  ["SYNTHETIC_AUTH 없음", { ...PREVIEW, SYNTHETIC_AUTH: undefined }],
];

// 1) 조건 판정
assert.equal(syntheticPreviewEnabled(PREVIEW), true);
assert.equal(syntheticPreviewEnabled({ ...PREVIEW, APP_ENV: "local", NEXT_PUBLIC_APP_ENV: undefined }), true);
for (const [name, env] of PRODUCTION_LIKE) {
  assert.equal(syntheticPreviewEnabled(env), false, name);
  assert.equal(syntheticPreviewUser("syn-1", env), undefined, `${name}: syn_uid 를 보지 않는다`);
}
assert.equal(syntheticPreviewUser("syn-901", PREVIEW)?.email, "syn-901@synthetic.invalid");
assert.equal(syntheticPreviewUser(undefined, PREVIEW), null, "켜져 있어도 쿠키가 없으면 로그인 안 함");
assert.equal(syntheticPreviewUser("admin", PREVIEW), null, "syn- 로 시작하지 않으면 받지 않는다");
assert.equal(syntheticPreviewUser("syn-1;x=1", PREVIEW), null);

// 2) 미들웨어: 운영에서는 /api/dev/* 가 통째로 닫힌다(합성 주소 포함), 프리런치 미리보기에서는 열린다
for (const path of ["/api/dev/synthetic-login", "/api/dev/synthetic-generate", "/api/dev/synthetic-weekly"]) {
  assert.equal(closedForLaunch(path, { NODE_ENV: "production" }), "api", path);
  assert.equal(closedForLaunch(path, { NODE_ENV: "production", APP_ENV: "prelaunch" }), null, path);
}

// 3) 실제 경로 처리기 — 환경을 바꿔 가며 부른다
const KEYS = ["NODE_ENV", "SYNTHETIC_AUTH", "PERSISTENCE_MODE", "APP_ENV", "NEXT_PUBLIC_APP_ENV", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const saved = Object.fromEntries(KEYS.map(key => [key, process.env[key]]));
function setEnv(env: Record<string, string | undefined>) {
  for (const key of KEYS) {
    const value = key in env ? env[key] : key === "SUPABASE_URL" || key === "SUPABASE_SERVICE_ROLE_KEY" ? "" : undefined;
    if (value === undefined) delete (process.env as Record<string, string | undefined>)[key];
    else (process.env as Record<string, string | undefined>)[key] = value;
  }
}

// next/headers 의 cookies() 는 요청 밖에서 못 부르므로, 시험 동안만 쿠키 저장소를 흉내 낸다
let jar: Record<string, string> = {};
let cookieReads = 0;
const loader = Module as unknown as { _load: (name: string, parent: unknown, isMain: boolean) => unknown };
const originalLoad = loader._load;
loader._load = function (name, parent, isMain) {
  if (name === "next/headers") return { cookies: async () => { cookieReads++; return { get: (key: string) => (key in jar ? { name: key, value: jar[key] } : undefined), set() {}, delete() {} }; }, headers: async () => new Headers() };
  return originalLoad.call(this, name, parent, isMain);
};

async function main() {
  const login = await import("../app/api/dev/synthetic-login/route");
  const generate = await import("../app/api/dev/synthetic-generate/route");
  const weekly = await import("../app/api/dev/synthetic-weekly/route");
  const auth = await import("../lib/account-auth");

  try {
    for (const [name, env] of PRODUCTION_LIKE) {
      setEnv(env);
      assert.equal((await login.GET(new Request("http://127.0.0.1/api/dev/synthetic-login?uid=syn-901&next=/plan"))).status, 404, `${name}: synthetic-login`);
      assert.equal((await generate.POST(new Request("http://127.0.0.1/api/dev/synthetic-generate", { method: "POST", body: "{}" }))).status, 404, `${name}: synthetic-generate`);
      assert.equal((await weekly.POST()).status, 404, `${name}: synthetic-weekly`);
      jar = { syn_uid: "syn-901" }; cookieReads = 0;
      assert.equal(await auth.getAuthenticatedUser(), null, `${name}: syn_uid 쿠키로 로그인되지 않는다`);
      if (!process.env.SUPABASE_URL) assert.equal(cookieReads, 0, `${name}: 로그인 설정이 없으면 쿠키를 읽지도 않는다`);
    }

    setEnv({ NODE_ENV: "production", ...PREVIEW });
    const ok = await login.GET(new Request("http://127.0.0.1/api/dev/synthetic-login?uid=syn-901&next=/plan/studio?new=1"));
    assert.equal(ok.status, 307);
    assert.equal(ok.headers.get("location"), "/plan/studio?new=1");
    assert.match(ok.headers.get("set-cookie") ?? "", /^syn_uid=syn-901; Path=\/; HttpOnly; SameSite=Lax$/);
    const outside = await login.GET(new Request("http://127.0.0.1/api/dev/synthetic-login?uid=../../x&next=//evil.example"));
    assert.equal(outside.headers.get("location"), "/plan", "바깥 주소로는 보내지 않는다");
    assert.match(outside.headers.get("set-cookie") ?? "", /^syn_uid=syn-1;/, "이상한 이름은 syn-1 로");
    jar = { syn_uid: "syn-901" };
    assert.equal((await auth.getAuthenticatedUser())?.email, "syn-901@synthetic.invalid", "미리보기에서는 합성 로그인이 된다");
    jar = {};
    assert.equal(await auth.getAuthenticatedUser(), null);

    // 운영 빌드(NODE_ENV=production)에서 메모리 DB 는 미리보기일 때만 허용된다
    const { serverPersistenceMode } = await import("../lib/persistence");
    assert.equal(serverPersistenceMode(), "demo-memory");
    setEnv({ NODE_ENV: "production", PERSISTENCE_MODE: "demo-memory", SYNTHETIC_AUTH: "1" });
    assert.throws(() => serverPersistenceMode(), /Production requires Supabase/);
  } finally {
    loader._load = originalLoad;
    setEnv(saved);
  }

  // 4) 저장소에 비밀 값·이 맥의 경로가 없다
  for (const file of ["scripts/preview/env.sh", "scripts/preview/build.sh", "scripts/preview/start.sh", "scripts/preview/dev.sh", "scripts/preview/start-real.sh"]) {
    const text = readFileSync(join(process.cwd(), file), "utf8");
    assert.doesNotMatch(text, /\/Users\/|\/private\/tmp\/|\.env\.eval|sk-ant-/, `${file}: 개인 경로·비밀 값 없음`);
  }

  console.log("synthetic-preview: 세 조건이 모두 맞을 때만 켜짐 · 운영처럼 보이면 개발용 주소 404 · syn_uid 무시 · 비밀 값 없음");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
