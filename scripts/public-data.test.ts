import assert from "node:assert/strict";
import { businessStateLabel, checkBusiness, formatBusinessNumber, mailOrderStateLabel, normalizeBusinessNumber, parseFtcMailOrder, parseNtsStatus } from "../lib/public-data/business-check";

// 사업자등록번호 — 10자리 + 국세청 검증 숫자
const valid = (() => { for (let n = 1234567800; ; n++) { const s = String(n); if (normalizeBusinessNumber(s)) return s; } })();
assert.equal(normalizeBusinessNumber(formatBusinessNumber(valid)), valid, "하이픈 허용");
assert.equal(normalizeBusinessNumber("123-45-6789"), null, "9자리");
assert.equal(normalizeBusinessNumber(valid.slice(0, 9) + String((Number(valid[9]) + 1) % 10)), null, "검증 숫자 틀림");
assert.equal(formatBusinessNumber(valid), `${valid.slice(0, 3)}-${valid.slice(3, 5)}-${valid.slice(5)}`);

// 국세청 상태조회 응답
assert.deepEqual(parseNtsStatus({ data: [{ b_no: valid, b_stt: "계속사업자", b_stt_cd: "01", tax_type: "부가가치세 간이과세자", end_dt: "" }] }), { state: "active", taxType: "부가가치세 간이과세자", closedAt: "" });
assert.equal(parseNtsStatus({ data: [{ b_stt_cd: "03", tax_type: "부가가치세 일반과세자", end_dt: "20250131" }] })?.closedAt, "2025-01-31");
assert.equal(parseNtsStatus({ data: [{ b_stt_cd: "", tax_type: "국세청에 등록되지 않은 사업자등록번호입니다." }] })?.state, "unregistered");
assert.equal(parseNtsStatus({ code: -4, msg: "등록되지 않은 인증키 입니다." }), null, "키 오류는 확인 불가");

// 공정위 통신판매사업자 응답(하나면 객체·여럿이면 배열·없으면 빈 칸)
const item = { prmmiYr: "2026", prmmiMnno: "서울마포-1234", dclrDate: "20260301", operSttusCdNm: "통신판매업 신고", domnCn: "oneulstart.com" };
assert.deepEqual(parseFtcMailOrder({ response: { body: { totalCount: "1", items: { item } } } }), { state: "reported", reportNo: "2026-서울마포-1234", reportedAt: "2026-03-01", operStatus: "통신판매업 신고", domain: "oneulstart.com" });
assert.equal(parseFtcMailOrder({ totalCount: "2", items: { item: [{ ...item, operSttusCdNm: "폐업", dclrDate: "20200101" }, item] } })?.state, "reported", "영업 중인 것 우선");
assert.equal(parseFtcMailOrder({ totalCount: "1", items: { item: { ...item, operSttusCdNm: "폐업" } } })?.state, "closed");
assert.equal(parseFtcMailOrder({ response: { body: { totalCount: "0", items: "" } } })?.state, "none");

void (async () => {
// 키가 없으면 부르지 않고 확인 불가
delete process.env.DATA_GO_KR_SERVICE_KEY;
let called = 0;
const none = await checkBusiness(valid, (async () => { called++; return new Response("{}"); }) as typeof fetch);
assert.equal(called, 0); assert.equal(none.business, null); assert.equal(none.mailOrder, null);

// 키가 있으면 두 곳을 부른다(국세청 POST + 공정위 GET, 키는 쿼리로)
process.env.DATA_GO_KR_SERVICE_KEY = "test+key/==";
const seen: string[] = [];
const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input); seen.push(`${init?.method ?? "GET"} ${url.split("?")[0]}`);
  assert.match(url, /serviceKey=test%2Bkey%2F%3D%3D/, "키는 인코딩해서");
  if (url.includes("nts-businessman")) { assert.deepEqual(JSON.parse(String(init?.body)), { b_no: [valid] }); return Response.json({ data: [{ b_stt_cd: "01", tax_type: "부가가치세 일반과세자" }] }); }
  return new Response(JSON.stringify({ response: { body: { totalCount: "1", items: { item } } } }));
}) as typeof fetch;
const both = await checkBusiness(valid, fake);
assert.deepEqual(seen.sort(), ["GET https://apis.data.go.kr/1130000/MllBsDtl_3Service/getMllBsInfoDetail_3", "POST https://api.odcloud.kr/api/nts-businessman/v1/status"]);
assert.equal(both.business?.state, "active"); assert.equal(both.mailOrder?.reportNo, "2026-서울마포-1234");
// 공정위가 XML 오류를 주면 그쪽만 확인 불가
const xml = await checkBusiness(valid, (async (input: RequestInfo | URL) => String(input).includes("nts") ? Response.json({ data: [{ b_stt_cd: "02", tax_type: "x" }] }) : new Response("<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg></cmmMsgHeader></OpenAPI_ServiceResponse>")) as typeof fetch);
assert.equal(xml.business?.state, "suspended"); assert.equal(xml.mailOrder, null);
delete process.env.DATA_GO_KR_SERVICE_KEY;

assert.equal(businessStateLabel(both.business), "등록됨 · 계속사업자");
assert.equal(mailOrderStateLabel({ state: "none", reportNo: "", reportedAt: "", operStatus: "", domain: "" }), "아직 신고 기록이 없어요");
console.log("public-data: 사업자번호 검증, 국세청·공정위 응답 해석, 키 없음·오류 시 확인 불가");
})().catch((error) => { console.error(error); process.exit(1); });
