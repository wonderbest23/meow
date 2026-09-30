import assert from "node:assert/strict";
import { autoInquiriesValue, kstPeriodRange } from "../lib/plan-builder/operating-homepage";
import { countLandingLeadsBetween } from "../lib/landing/repository";

// 한국 시간 기간 → [시작 0시, 종료 다음 날 0시)
assert.deepEqual(kstPeriodRange("2026-09-01", "2026-09-30"), { from: "2026-08-31T15:00:00.000Z", to: "2026-09-30T15:00:00.000Z" });
assert.deepEqual(kstPeriodRange("2026-09-30", "2026-09-30"), { from: "2026-09-29T15:00:00.000Z", to: "2026-09-30T15:00:00.000Z" }, "하루짜리 기간");
assert.equal(kstPeriodRange("2026-09-30", "2026-09-01"), null, "순서가 뒤집힘");
assert.equal(kstPeriodRange("2026-9-1", "2026-09-30"), null, "형식");
assert.equal(kstPeriodRange("", ""), null);

// 문의 칸 자동 채우기: 비었거나 앞서 자동으로 넣은 값일 때만
const found = { linked: true as const, published: true, inquiries: 7 };
assert.equal(autoInquiriesValue("", null, found), "7", "빈 칸은 채운다");
assert.equal(autoInquiriesValue("3", "3", found), "7", "기간을 바꾸면 자동 값도 바뀐다");
assert.equal(autoInquiriesValue("12", "3", found), null, "사장님이 고친 값은 둔다");
assert.equal(autoInquiriesValue("12", null, found), null, "예전에 저장한 값은 둔다");
assert.equal(autoInquiriesValue("7", null, found), null, "이미 같은 값");
assert.equal(autoInquiriesValue("", null, { linked: false }), null, "홈페이지 없음");
assert.equal(autoInquiriesValue("", null, null), null, "조회 실패");
assert.equal(autoInquiriesValue("", null, { linked: true, published: false, inquiries: 0 }), "0", "공개 전이면 0건");

// 기간 안의 문의만 센다(로컬 저장소)
(async () => {
  const store = globalThis.__ventureLandingStore!;
  const lead = (siteId: string, createdAt: string) => ({ id: crypto.randomUUID(), siteId, name: "손님", email: "", phone: "", message: "", privacyAgreed: true as const, marketingAgreed: false, source: "public_landing", createdAt });
  store.leads.push(lead("site-a", "2026-08-31T14:59:59.000Z"), lead("site-a", "2026-08-31T15:00:00.000Z"), lead("site-a", "2026-09-15T03:00:00.000Z"), lead("site-a", "2026-09-30T15:00:00.000Z"), lead("site-b", "2026-09-15T03:00:00.000Z"));
  const range = kstPeriodRange("2026-09-01", "2026-09-30")!;
  assert.equal(await countLandingLeadsBetween("site-a", range.from, range.to), 2, "경계: 9월 1일 0시 포함, 10월 1일 0시 제외, 다른 홈페이지 제외");
  console.log("operating-homepage: KST range, auto-fill rules, lead count by period");
})().catch((error) => { console.error(error); process.exit(1); });
