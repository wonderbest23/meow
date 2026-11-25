import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { authLinkRescueHref } from "../lib/auth/auth-link-rescue";

// 재설정 메일 링크가 홈으로 돌아와도 비밀번호 바꾸기 화면으로 간다(2026-11-25 사장님 제보)
const recovery = "#access_token=a.b.c&expires_in=3600&refresh_token=r1&token_type=bearer&type=recovery";
assert.equal(authLinkRescueHref("/", recovery), `/account${recovery}`, "홈에 붙어 온 재설정 토큰은 /account 로");
assert.equal(authLinkRescueHref("/plan", recovery), `/account${recovery}`, "로그인한 사람이 /plan 으로 넘어가도 /account 로");
assert.equal(authLinkRescueHref("/account", recovery), null, "이미 /account 면 그대로(화면이 읽는다)");
assert.equal(authLinkRescueHref("/", "#access_token=a&refresh_token=r&type=signup"), "/account#access_token=a&refresh_token=r&type=signup", "가입 확인 링크도");
assert.equal(authLinkRescueHref("/", "#error=access_denied&error_code=otp_expired"), "/account#error=access_denied&error_code=otp_expired", "만료 안내도 /account 가 보여 준다");
assert.equal(authLinkRescueHref("/", ""), null, "해시 없으면 아무것도 안 함");
assert.equal(authLinkRescueHref("/terms", "#section-3"), null, "보통 앵커는 건드리지 않음");
assert.equal(authLinkRescueHref("/", "#access_token=a&refresh_token=r"), null, "인증 표시(type) 없는 해시는 건드리지 않음");

const route = readFileSync("app/api/auth/recover/route.ts", "utf8");
assert.match(route, /redirectTo: `\$\{origin\}\/account` \}/, "재설정 메일 돌아올 주소에 쿼리를 붙이지 않는다");
const layout = readFileSync("app/layout.tsx", "utf8");
assert.match(layout, /<AuthLinkRescue \/>/, "모든 화면에 붙어 있다");
const account = readFileSync("app/account/page.tsx", "utf8");
assert.match(account, /hash\.get\("type"\) === "recovery"/, "/account 는 #type=recovery 로 재설정 화면을 연다");
console.log("auth-link-rescue: ok");
