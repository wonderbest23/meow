import assert from "node:assert/strict";
import { alimtalkConfig, alimtalkVariables, sendAlimtalk, solapiAuthorization } from "../lib/notify/alimtalk";
import { createHmac } from "node:crypto";

void (async () => {
  // 설정 — 키 셋이 다 있어야, 템플릿 JSON 이 틀리면 템플릿 없이
  assert.equal(alimtalkConfig({}), null);
  const env = { SOLAPI_API_KEY: "KEY", SOLAPI_API_SECRET: "SECRET", SOLAPI_PFID: "KA01PFabc", SOLAPI_ALIMTALK_TEMPLATES: '{"payment-receipt":"KA01TP111","lead-received":"bad id!"}' };
  const config = alimtalkConfig(env)!;
  assert.deepEqual(config.templates, { "payment-receipt": "KA01TP111" }, "모양이 틀린 템플릿 ID 는 버림");
  assert.deepEqual(alimtalkConfig({ ...env, SOLAPI_ALIMTALK_TEMPLATES: "{" })!.templates, {});

  // 변수 — 템플릿 글(docs/alimtalk-templates.md)의 #{이름}과 같게
  assert.deepEqual(alimtalkVariables("payment-receipt", { product: "homepage", orderId: "PB-1" }), { "#{상품}": "홈페이지", "#{주문번호}": "PB-1" });
  assert.equal(alimtalkVariables("payment-receipt", { product: "nope", orderId: "PB-1" }), null, "모르는 상품은 보내지 않음");
  assert.deepEqual(alimtalkVariables("tax-deadline", { kind: "vat", days: 7, month: 1, day: 28 }), { "#{세금}": "부가세", "#{마감일}": "1월 28일", "#{남은날}": "7" });
  assert.deepEqual(alimtalkVariables("homepage-lead-contact", { name: "김민지", phone: "010-9876-5432" }), { "#{이름}": "김민지", "#{연락처}": "010-9876-5432" });

  // 인증 머리말 — HMAC-SHA256(date+salt)
  const auth = await solapiAuthorization({ apiKey: "KEY", apiSecret: "SECRET" }, "2026-10-06T00:00:00.000Z", "salt1");
  assert.equal(auth, `HMAC-SHA256 apiKey=KEY, date=2026-10-06T00:00:00.000Z, salt=salt1, signature=${createHmac("sha256", "SECRET").update("2026-10-06T00:00:00.000Zsalt1").digest("hex")}`);

  // 보내기 — 템플릿이 없으면 부르지 않음(문자로), 있으면 솔라피 v4 send
  let calls = 0;
  const reject = (async () => { calls++; return Response.json({}); }) as typeof fetch;
  assert.equal(await sendAlimtalk("lead-received", "01012345678", { store: "플로라" }, config, reject), null);
  assert.equal(calls, 0);
  let sent: { url: string; body: { message: { to: string; kakaoOptions: { pfId: string; templateId: string; variables: Record<string, string>; disableSms: boolean } } } } | null = null;
  const ok = (async (input: RequestInfo | URL, init?: RequestInit) => { sent = { url: String(input), body: JSON.parse(String(init?.body)) }; assert.match(String((init?.headers as Record<string, string>).Authorization), /^HMAC-SHA256 apiKey=KEY, date=/); return Response.json({ statusCode: "2000" }); }) as typeof fetch;
  assert.deepEqual(await sendAlimtalk("payment-receipt", "01012345678", { product: "plan", orderId: "PB-9" }, config, ok), { status: "accepted", code: "ALIMTALK_SENT" });
  assert.equal(sent!.url, "https://api.solapi.com/messages/v4/send");
  assert.deepEqual(sent!.body.message, { to: "01012345678", kakaoOptions: { pfId: "KA01PFabc", templateId: "KA01TP111", variables: { "#{상품}": "사업계획서", "#{주문번호}": "PB-9" }, disableSms: true } });
  // 거절·오류는 null → 문자로 물러섬
  assert.equal(await sendAlimtalk("payment-receipt", "01012345678", { product: "plan", orderId: "PB-9" }, config, (async () => Response.json({ statusCode: "3059", errorMessage: "변수 불일치" })) as typeof fetch), null);
  assert.equal(await sendAlimtalk("payment-receipt", "01012345678", { product: "plan", orderId: "PB-9" }, config, (async () => { throw new Error("network"); }) as typeof fetch), null);
  assert.equal(await sendAlimtalk("payment-receipt", "0212345678", { product: "plan", orderId: "PB-9" }, config, ok), null, "휴대폰만");
  console.log("alimtalk: 설정, 변수, 솔라피 인증, 보내기·실패 시 문자로");
})().catch((error) => { console.error(error); process.exit(1); });
