import assert from "node:assert/strict";
import { checkDomain, registerDomain, registrarConfig, registrarSupports, registrationStatus } from "../lib/landing/domain-registrar";
import { registrantContact, validateRegistrant } from "../lib/landing/domain-purchase";

void (async () => {
  // 설정 — 토큰 + 32자리 계정 ID
  assert.equal(registrarConfig({}), null);
  assert.equal(registrarConfig({ CLOUDFLARE_REGISTRAR_TOKEN: "t", CLOUDFLARE_REGISTRAR_ACCOUNT_ID: "abc" }), null);
  const config = registrarConfig({ CLOUDFLARE_REGISTRAR_TOKEN: "tok", CLOUDFLARE_REGISTRAR_ACCOUNT_ID: "0123456789abcdef0123456789abcdef" })!;

  // API 로 되는 확장자 — .com 만(.kr·.co.kr 은 운영자 손으로)
  assert.equal(registrarSupports("flora.com"), true);
  assert.equal(registrarSupports("flora.co.kr"), false);
  assert.equal(registrarSupports("flora.kr"), false);
  assert.equal(registrarSupports("a.b.com"), false);

  const calls: Array<{ url: string; method: string; body: unknown; prefer?: string }> = [];
  const fake = (responses: Record<string, [number, unknown]>) => (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input), headers = (init?.headers ?? {}) as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer tok");
    calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null, prefer: headers.Prefer });
    const key = Object.keys(responses).find((part) => url.endsWith(part))!;
    const [status, body] = responses[key];
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;

  // 확인(문서 예시 모양)
  const check = await checkDomain(config, "flora.com", fake({ "/domain-check": [200, { success: true, result: { domains: [{ name: "flora.com", registrable: true, tier: "standard", pricing: { currency: "USD", registration_cost: "10.11" } }] } }] }));
  assert.deepEqual(check, { registrable: true, premium: false, reason: "", cost: "10.11 USD" });
  assert.equal(calls[0].url, "https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/registrar/domain-check");
  assert.deepEqual(calls[0].body, { domains: ["flora.com"] });
  assert.equal((await checkDomain(config, "x.com", fake({ "/domain-check": [200, { success: true, result: { domains: [{ name: "x.com", registrable: false, tier: "premium", reason: "domain_unavailable" }] } }] })))?.reason, "domain_unavailable");
  assert.equal(await checkDomain(config, "x.com", fake({ "/domain-check": [403, { success: false }] })), null, "권한 오류는 확인 불가");

  // 명의자 — 결제 화면 값 검사, 등록기관 형식(+82.10…, 시·도/시·군·구/나머지)
  assert.equal(validateRegistrant({ name: "김", phone: "01012345678", postalCode: "03900", address: "서울특별시 마포구 월드컵로 12" }).ok, false, "이름 2자 이상");
  assert.equal(validateRegistrant({ name: "김민지", phone: "01012345678", postalCode: "3900", address: "서울특별시 마포구 월드컵로 12" }).ok, false, "우편번호 5자리");
  const owner = validateRegistrant({ name: "김민지", phone: "010-1234-5678", postalCode: "03900", address: "서울특별시  마포구 월드컵로 12", addressDetail: "2층" });
  assert.ok(owner.ok);
  const contact = registrantContact(owner.value, "minji@example.com");
  assert.deepEqual(contact, { email: "minji@example.com", phone: "+82.1012345678", postal_info: { name: "김민지", address: { street: "월드컵로 12, 2층", city: "마포구", state: "서울특별시", postal_code: "03900", country_code: "KR" } } });

  // 등록 — 비동기 요청, 202 는 진행 중, 201 succeeded 는 끝
  calls.length = 0;
  const who = { registrant: owner.value, email: "minji@example.com" };
  assert.equal(await registerDomain(config, "flora.com", who, fake({ "/registrations": [202, { success: true, result: { domain_name: "flora.com", state: "in_progress" } }] })), "in_progress");
  assert.equal(calls[0].prefer, "respond-async");
  assert.deepEqual(calls[0].body, { domain_name: "flora.com", auto_renew: true, privacy_mode: "redaction", contacts: { registrant: contact } }, "이용자 명의로");
  assert.equal(await registerDomain(config, "flora.com", who, fake({ "/registrations": [201, { success: true, result: { state: "succeeded", completed: true } }] })), "succeeded");
  assert.equal(await registerDomain(config, "flora.com", who, fake({ "/registrations": [400, { success: false, errors: [{ message: "extension_not_supported_via_api" }] }] })), "failed");

  // 진행 상태
  assert.equal(await registrationStatus(config, "flora.com", fake({ "/registration-status": [200, { success: true, result: { state: "action_required" } }] })), "action_required");
  assert.equal(await registrationStatus(config, "flora.com", fake({ "/registration-status": [500, {}] })), "unknown");
  console.log("domain-registrar: .com 만 자동, Cloudflare Registrar 확인·등록(비동기)·상태 해석");
})().catch((error) => { console.error(error); process.exit(1); });
