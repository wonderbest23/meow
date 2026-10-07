import assert from "node:assert/strict";
import { findService, findServiceRecord, SERVICE_CATALOG, SERVICE_GROUPS, SERVICE_PRICE_PENDING, servicePriceLabel, servicesInGroup } from "../lib/services/catalog";
import { canMoveServiceRequest, SERVICE_REQUEST_NEXT, SERVICE_REQUEST_STATUSES, SERVICE_REQUEST_STATUS_LABELS, validateServiceRequest } from "../lib/services/requests";
import { createServiceRequest, listAllServiceRequests, listMyServiceRequests, resetServiceRequestMemory, ServiceRequestError, updateServiceRequestStatus } from "../lib/services/request-store";
import { EMPTY_SIGNALS, orderServices, serviceBadges, serviceSignalsFromPlan } from "../lib/services/recommend";
import { formatKoreanPhone, leadReplyText, mailtoHref, normalizeMobilePhone, phoneDigits, smsHref, telHref } from "../lib/contact-links";
import { savePlanState, normalizeState } from "../lib/plan-builder/plan-server-store";
import type { Plan } from "../lib/plan-builder/plan-store";

// '다음 단계' 서비스 신청 + 접수된 문의 바로 연락 링크

const RETIRED = ["business-registration", "mail-order-report", "industry-license", "soho-office"];

// 1) 서비스 목록 — id 는 DB 에 남으니 겹치거나 모양이 바뀌면 안 된다
{
  const ids = SERVICE_CATALOG.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, "서비스 id 는 겹치지 않는다");
  for (const item of SERVICE_CATALOG) {
    assert.match(item.id, /^[a-z][a-z0-9-]{2,59}$/, `id 모양: ${item.id}`);
    assert.ok(SERVICE_GROUPS.some((group) => group.id === item.group), `없는 묶음: ${item.id}`);
    assert.ok(item.title.trim() && item.summary.trim() && item.who.trim(), `빈 글: ${item.id}`);
    assert.ok(item.summary.length <= 60, `설명은 한 줄: ${item.id}`);
    assert.equal(servicePriceLabel(item), SERVICE_PRICE_PENDING, "처음에는 모두 상담 후 안내");
  }
  for (const group of SERVICE_GROUPS) assert.ok(servicesInGroup(group.id).length > 0, `빈 묶음: ${group.id}`);
  for (const id of ["blog-distribution", "press-release", "sns-management", "full-marketing"]) assert.ok(findService(id), `빠진 서비스: ${id}`);
  // 창업 행정 4종은 신청받지 않는다(소유자 결정 2026-10-07) — 지난 신청 기록을 보이려고 기록으로만 찾는다
  for (const id of RETIRED) { assert.equal(findService(id), undefined, `신청받지 않는 서비스: ${id}`); assert.ok(findServiceRecord(id), `기록은 남는다: ${id}`); }
  assert.ok(SERVICE_CATALOG.every((item) => item.group === "marketing") && SERVICE_GROUPS.map((group) => group.id).join() === "marketing", "지금은 마케팅만");
  assert.equal(findService("nope"), undefined);
  assert.equal(servicePriceLabel({ ...SERVICE_CATALOG[0], price: "월 99,000원" }), "월 99,000원", "가격을 넣으면 그 값");
  assert.equal(SERVICE_PRICE_PENDING, "가격은 상담 후 안내");
  // 창업 행정은 대행이 아니라 안내·전문가 연결(세무사법·행정사법) — 대신 신청·제출·대행 표현 금지
  for (const item of RETIRED.map((id) => findServiceRecord(id)!)) {
    const text = [item.title, item.summary, ...item.includes, ...item.steps].join(" ");
    assert.doesNotMatch(text, /대행|대신\s*(신청|제출|해|챙겨)|작성·제출/, `${item.id}: 대행 표현`);
  }
  for (const item of SERVICE_CATALOG) assert.ok(item.short && item.includes.length >= 2 && item.steps.length === 3 && item.prepare.length, `${item.id}: 상품 카드 내용`);
}

// 2) 신청 검사 — 없는 서비스·이상한 번호는 저장 전에 돌려보낸다
{
  const ok = validateServiceRequest({ planId: "plan-1", serviceId: "blog-distribution", phone: "010-1234-5678", preferredTime: " 평일 오후 ", memo: "" });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.value, { planId: "plan-1", serviceId: "blog-distribution", phone: "01012345678", preferredTime: "평일 오후", memo: "" }, "번호는 숫자만, 글은 다듬는다");
  const minimal = validateServiceRequest({ planId: "p", serviceId: "press-release", phone: "+82 10 1234 5678" });
  assert.ok(minimal.ok && minimal.value.phone === "01012345678" && minimal.value.memo === "", "국제번호도 받고 선택 칸은 빈 글");
  const code = (body: unknown) => { const result = validateServiceRequest(body); return result.ok ? "ok" : result.code; };
  assert.equal(code({ planId: "p", serviceId: "unknown-service", phone: "01012345678" }), "SERVICE_NOT_FOUND");
  assert.equal(code({ planId: "p", serviceId: "press-release", phone: "02-123-4567" }), "PHONE_INVALID", "유선 번호는 문자를 못 받는다");
  assert.equal(code({ planId: "p", serviceId: "press-release", phone: "010-123" }), "PHONE_INVALID");
  assert.equal(code({ planId: "p", serviceId: "press-release", phone: "" }), "PHONE_INVALID");
  assert.equal(code({ planId: "p", serviceId: "press-release", phone: "01012345678", ownerId: "someone" }), "INVALID_REQUEST", "모르는 칸(주인 바꿔치기)은 거절");
  assert.equal(code({ planId: "", serviceId: "press-release", phone: "01012345678" }), "INVALID_REQUEST");
  assert.equal(code({ planId: "p", serviceId: "press-release", phone: "01012345678", memo: "가".repeat(1001) }), "INVALID_REQUEST");
  assert.equal(code(null), "INVALID_REQUEST");
}

// 3) 상태 — 어드민이 고를 수 있는 다음 상태
{
  for (const status of SERVICE_REQUEST_STATUSES) assert.ok(SERVICE_REQUEST_STATUS_LABELS[status] && SERVICE_REQUEST_NEXT[status].length > 0);
  assert.ok(canMoveServiceRequest("received", "contacted"));
  assert.ok(canMoveServiceRequest("done", "received"));
  assert.ok(!canMoveServiceRequest("done", "canceled"), "끝난 건은 접수로만 되돌린다");
  assert.ok(!canMoveServiceRequest("received", "received"));
}

// 4) 바로 연락 링크 — tel:/sms:/mailto:
{
  assert.equal(phoneDigits("010-1234-5678"), "01012345678");
  assert.equal(phoneDigits("+82 10-1234-5678"), "01012345678");
  assert.equal(phoneDigits("821012345678"), "01012345678");
  assert.equal(normalizeMobilePhone("011-123-4567"), "0111234567");
  assert.equal(normalizeMobilePhone("031-123-4567"), null);
  assert.equal(formatKoreanPhone("01012345678"), "010-1234-5678");
  assert.equal(formatKoreanPhone("010 1234 5678"), "010-1234-5678");
  assert.equal(formatKoreanPhone("+821012345678"), "010-1234-5678");
  assert.equal(formatKoreanPhone("0212345678"), "02-1234-5678");
  assert.equal(formatKoreanPhone("021234567"), "02-123-4567");
  assert.equal(formatKoreanPhone("0311234567"), "031-123-4567");
  assert.equal(formatKoreanPhone("07012345678"), "070-1234-5678");
  assert.equal(formatKoreanPhone("15881234"), "1588-1234");
  assert.equal(formatKoreanPhone(" 내선 12 "), "내선 12", "모르는 모양은 그대로");
  assert.equal(telHref("010-1234-5678"), "tel:01012345678");
  assert.equal(telHref("abc"), null);
  assert.equal(telHref("12"), null, "너무 짧으면 링크를 만들지 않는다");
  const body = leadReplyText("퇴근길 꽃집");
  assert.equal(body, "안녕하세요, 퇴근길 꽃집입니다. 문의 주셔서 연락드려요.");
  assert.equal(leadReplyText("  "), "안녕하세요. 문의 주셔서 연락드려요.");
  assert.equal(smsHref("010-1234-5678", body), `sms:01012345678?&body=${encodeURIComponent(body)}`, "iOS·안드로이드 모두 읽는 ?&body= 모양");
  assert.equal(smsHref("010-1234-5678"), "sms:01012345678");
  assert.ok(!smsHref("01012345678", "A&B=C #1")!.includes("&B="), "본문의 &·# 은 인코딩");
  assert.equal(smsHref("없음", body), null);
  assert.equal(mailtoHref("guest@example.com", "[꽃집] 문의", "안녕하세요"), `mailto:guest@example.com?subject=${encodeURIComponent("[꽃집] 문의")}&body=${encodeURIComponent("안녕하세요")}`);
  assert.equal(mailtoHref("guest@example.com"), "mailto:guest@example.com");
  assert.equal(mailtoHref("a@b.com?bcc=x@y.com"), null, "주소에 ? 가 섞이면 링크를 만들지 않는다");
  assert.equal(mailtoHref("not-an-email"), null);
}

// 5) 배지 — 이 사업에서 고른 값만 보고 정한다
{
  assert.deepEqual(Object.keys(serviceBadges({ ...EMPTY_SIGNALS, registered: "yes", workplace: "shop" })), [], "등록·점포까지 마쳤으면 배지 없음");
  const fresh = serviceBadges({ ...EMPTY_SIGNALS, registered: "no", workplace: "remote", onlineSelling: true });
  assert.equal(fresh["business-registration"]?.tone, "first");
  assert.equal(fresh["soho-office"]?.tone, "first", "사무실 없이 시작 + 미등록이면 주소지 먼저");
  assert.equal(fresh["mail-order-report"]?.label, "필요해요");
  const ordered = orderServices(RETIRED.map((id) => findServiceRecord(id)!), fresh).map((item) => item.id);
  assert.deepEqual(ordered.slice(0, 3), ["business-registration", "soho-office", "mail-order-report"], "먼저 해요 → 필요해요 순");
  assert.equal(serviceBadges({ ...EMPTY_SIGNALS })["business-registration"]?.tone, "check", "모르면 확인해요");
  assert.equal(serviceBadges({ ...EMPTY_SIGNALS, homepagePublished: true })["blog-distribution"]?.tone, "suggest");
  assert.equal(serviceBadges({ ...EMPTY_SIGNALS, licensed: true })["industry-license"]?.label, "확인해요");

  const plan = (answers: Plan["answers"]): Plan => ({ id: "p", title: "꽃집", planType: "startup", createdAt: "", updatedAt: "", sections: {}, answers } as unknown as Plan);
  const coach = (channel: string) => ({ __business_coach: { state: { version: 1, messages: [], fields: [{ key: "channel", value: channel }] } } });
  assert.equal(serviceSignalsFromPlan(plan(coach("스마트스토어와 인스타그램")), false).onlineSelling, true);
  assert.equal(serviceSignalsFromPlan(plan(coach("인스타그램으로 홍보, 매장 방문")), false).onlineSelling, false, "SNS 홍보만으로는 온라인 판매가 아니다");
  const launched = serviceSignalsFromPlan(plan({ __business_launch: { registered: "no", workplace: "shared" } }), true);
  assert.deepEqual({ registered: launched.registered, workplace: launched.workplace, homepagePublished: launched.homepagePublished }, { registered: "no", workplace: "shared", homepagePublished: true });
  assert.deepEqual(serviceSignalsFromPlan(plan({}), false), EMPTY_SIGNALS, "아무것도 없으면 빈 신호");
  const industry = (ksic: string) => serviceSignalsFromPlan(plan({ __business_intake: { state: { version: 1, answers: {}, notes: [], candidates: [], ksic } } }), false);
  assert.equal(industry("47912").onlineSelling, true, "전자상거래 소매(4791)는 통신판매업 신고");
  assert.equal(industry("56111").licensed, true, "음식점은 영업신고 업종");
  assert.equal(industry("56111").onlineSelling, false);
}

// 6) 신청 저장 — 내 사업일 때만, 진행 중인 같은 신청은 한 건, 어드민 상태 변경은 조건부
(async () => {
  resetServiceRequestMemory();
  const now = new Date().toISOString();
  await savePlanState("owner-hash-a", normalizeState({ plans: [{ id: "plan-a", title: "퇴근길 꽃집", planType: "startup", createdAt: now, updatedAt: now, sections: {}, answers: {} }], activePlanId: "plan-a" }));
  const input = { planId: "plan-a", serviceId: "blog-distribution", phone: "01012345678", preferredTime: "", memo: "스마트스토어 열 예정" };

  await assert.rejects(createServiceRequest({ ...input, ownerId: "user-b", ownerHash: "owner-hash-b", customerEmail: "b@example.com" }), (error: unknown) => error instanceof ServiceRequestError && error.code === "PLAN_NOT_FOUND" && error.status === 404, "남의 사업에는 신청할 수 없다");
  assert.equal((await listAllServiceRequests()).length, 0, "거절된 신청은 남지 않는다");
  await assert.rejects(createServiceRequest({ ...input, serviceId: "nope", ownerId: "user-a", ownerHash: "owner-hash-a", customerEmail: "" }), (error: unknown) => error instanceof ServiceRequestError && error.code === "SERVICE_NOT_FOUND");
  await assert.rejects(createServiceRequest({ ...input, serviceId: "business-registration", ownerId: "user-a", ownerHash: "owner-hash-a", customerEmail: "" }), (error: unknown) => error instanceof ServiceRequestError && error.code === "SERVICE_NOT_FOUND", "신청받지 않는 창업 행정은 거절");

  const { request, planTitle } = await createServiceRequest({ ...input, ownerId: "user-a", ownerHash: "owner-hash-a", customerEmail: "a@example.com" });
  assert.equal(planTitle, "퇴근길 꽃집");
  assert.equal(request.status, "received");
  assert.equal(request.planTitle, "퇴근길 꽃집");
  assert.ok(!("ownerId" in request) && !("customerEmail" in request), "사장님 화면에는 주인 id·계정 메일을 보내지 않는다");
  await assert.rejects(createServiceRequest({ ...input, ownerId: "user-a", ownerHash: "owner-hash-a", customerEmail: "" }), (error: unknown) => error instanceof ServiceRequestError && error.code === "ALREADY_REQUESTED", "진행 중인 같은 신청은 한 건");
  await createServiceRequest({ ...input, serviceId: "sns-management", ownerId: "user-a", ownerHash: "owner-hash-a", customerEmail: "" });

  assert.equal((await listMyServiceRequests("user-a", "plan-a")).length, 2);
  assert.equal((await listMyServiceRequests("user-b", "plan-a")).length, 0, "다른 계정에는 안 보인다");
  const all = await listAllServiceRequests();
  assert.equal(all.length, 2);
  assert.ok(all[0].createdAt >= all[1].createdAt, "어드민 목록은 최신순");
  assert.equal(all.find((item) => item.id === request.id)?.customerEmail, "a@example.com");

  const contacted = await updateServiceRequestStatus(request.id, "received", "contacted");
  assert.equal(contacted.status, "contacted");
  await assert.rejects(updateServiceRequestStatus(request.id, "received", "done"), (error: unknown) => error instanceof ServiceRequestError && error.code === "STATUS_CONFLICT", "화면이 본 상태와 다르면 바꾸지 않는다");
  await assert.rejects(updateServiceRequestStatus(request.id, "contacted", "contacted"), (error: unknown) => error instanceof ServiceRequestError && error.code === "STATUS_CONFLICT");
  await assert.rejects(updateServiceRequestStatus(crypto.randomUUID(), "received", "done"), (error: unknown) => error instanceof ServiceRequestError && error.code === "NOT_FOUND");
  await updateServiceRequestStatus(request.id, "contacted", "done");
  const again = await createServiceRequest({ ...input, ownerId: "user-a", ownerHash: "owner-hash-a", customerEmail: "" });
  assert.equal(again.request.status, "received", "끝난 뒤에는 다시 신청할 수 있다");

  // 7) 접수된 문의 '처리 완료' — 이 홈페이지 주인의 문의만
  const { createProject } = await import("../lib/project-repository");
  const { createLandingDraft } = await import("../lib/landing/domain");
  const { saveLandingDraft, createLandingLead, listLandingLeads, setLandingLeadHandled } = await import("../lib/landing/repository");
  const project = await createProject({ opportunity: { title: "lead-test" }, founderProfile: {}, paymentStatus: "paid", packagePrice: 0 }, "lead-owner");
  const site = await saveLandingDraft(project.id, "lead-owner", createLandingDraft({ title: "꽃집", oneLiner: "꽃", customer: "동네", model: "", sector: "" }), { expectedUpdatedAt: null });
  const lead = await createLandingLead(site.id, { name: "손님", email: "", phone: "010-9876-5432", message: "예약돼요?", privacyAgreed: true, marketingAgreed: false, source: "landing" });
  assert.equal((await listLandingLeads(project.id, "lead-owner"))[0].handledAt, null, "새 문의는 처리 전");
  await assert.rejects(setLandingLeadHandled(project.id, "someone-else", lead.id, true), /PROJECT_NOT_FOUND/, "남의 홈페이지 문의는 못 바꾼다");
  assert.equal(await setLandingLeadHandled(project.id, "lead-owner", crypto.randomUUID(), true), null, "다른 문의 id 는 찾지 못함");
  const handled = await setLandingLeadHandled(project.id, "lead-owner", lead.id, true);
  assert.ok(handled && handled !== "unsupported" && handled.handledAt);
  assert.ok((await listLandingLeads(project.id, "lead-owner"))[0].handledAt, "처리 완료가 목록에 남는다");
  assert.deepEqual(await setLandingLeadHandled(project.id, "lead-owner", lead.id, false), { handledAt: null }, "되돌리기");
  console.log("service-requests: ok");
})().catch((error) => { console.error(error); process.exitCode = 1; });
