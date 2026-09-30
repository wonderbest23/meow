import assert from "node:assert/strict";
import { applyContactMethod, contactHref, ctaButtons, DEFAULT_CONTACT, draftPhone, normalizeWebUrl, phoneDigits, quickActions, withContactLinks } from "../lib/landing/contact-method";
import { createBusinessTemplate } from "../lib/landing/brainwave/business-content";
import { landingDraftFromPlan } from "../lib/landing/from-plan";
import { landingDraftSchema } from "../lib/landing/domain";

// 번호·주소 다듬기
assert.equal(phoneDigits("010-1234-5678"), "01012345678");
assert.equal(phoneDigits("+82 10 1234 5678"), "+821012345678");
assert.equal(phoneDigits("1234"), "");
assert.equal(draftPhone({ businessPhone: "", businessContact: "02-123-4567" }), "021234567");
assert.equal(draftPhone({ businessPhone: "", businessContact: "hello@shop.kr" }), "");
assert.equal(normalizeWebUrl("pf.kakao.com/_abc"), "https://pf.kakao.com/_abc");
assert.equal(normalizeWebUrl("http://booking.naver.com/x"), "https://booking.naver.com/x");

// 방법 → 버튼 링크(번호·주소가 없거나 쓰는 중이면 null = 문의 양식)
assert.equal(contactHref(DEFAULT_CONTACT, ""), "contact");
assert.equal(contactHref({ ...DEFAULT_CONTACT, method: "phone" }, "01012345678"), "tel:01012345678");
assert.equal(contactHref({ ...DEFAULT_CONTACT, method: "sms" }, "01012345678"), "sms:01012345678");
assert.equal(contactHref({ ...DEFAULT_CONTACT, method: "phone" }, ""), null);
assert.equal(contactHref({ ...DEFAULT_CONTACT, method: "kakao", kakaoUrl: "https://pf.kakao.com/_abc" }, ""), "https://pf.kakao.com/_abc");
assert.equal(contactHref({ ...DEFAULT_CONTACT, method: "kakao", kakaoUrl: "https://pf" }, ""), null, "half-typed address is not linked");
assert.equal(contactHref({ ...DEFAULT_CONTACT, method: "booking", bookingUrl: "javascript:alert(1)" }, ""), null, "only https links");

// 온라인 상점 초안: 문의 버튼 전부가 전화로, 기본 글은 '전화로 문의하기'로
const draft = landingDraftFromPlan({ planTitle: "문앞반찬", business: {}, answers: { "market/products": { main_offer: "주 2회 반찬 정기배송" }, "market/segments": { first_target: "맞벌이 부부" } } });
const page = draft.pageData!.brainwave!.page;
const buttons = ctaButtons(page);
assert.ok(buttons.length >= 2, "hero and closing buttons");
const withPhone = { ...draft, businessPhone: "010-1234-5678" };
const phone = applyContactMethod(withPhone, { ...withPhone, contact: { ...DEFAULT_CONTACT, method: "phone" } });
landingDraftSchema.parse(phone);
for (const { button, text } of buttons) {
  assert.equal(phone.pageData!.brainwave!.links[button], "tel:01012345678");
  assert.equal(phone.pageData!.brainwave!.texts[text], "전화로 문의하기");
}
assert.equal(phone.ctaLabel, "전화로 문의하기");

// AI·사장님이 쓴 버튼 글과, 버튼 하나를 따로 정한 링크는 그대로
const custom = structuredClone(draft);
custom.pageData!.brainwave!.texts[buttons[0].text] = "구독 문의하기";
custom.pageData!.brainwave!.links[buttons[1].button] = "https://smartstore.naver.com/munap";
const kakao = applyContactMethod(custom, { ...custom, contact: { ...DEFAULT_CONTACT, method: "kakao", kakaoUrl: "https://pf.kakao.com/_munap" } });
assert.equal(kakao.pageData!.brainwave!.texts[buttons[0].text], "구독 문의하기");
assert.equal(kakao.pageData!.brainwave!.links[buttons[0].button], "https://pf.kakao.com/_munap");
assert.equal(kakao.pageData!.brainwave!.links[buttons[1].button], "https://smartstore.naver.com/munap");

// 문의 양식으로 되돌리면 자동으로 넣은 링크·글도 되돌아간다
const back = applyContactMethod(phone, { ...phone, contact: { ...DEFAULT_CONTACT, method: "form" } });
for (const { button, text } of buttons) {
  assert.equal(back.pageData!.brainwave!.links[button], undefined);
  assert.equal(back.pageData!.brainwave!.texts[text], "문의하기");
}
// 번호를 아직 안 넣었으면 문의 양식에 둔다
const noNumber = applyContactMethod(draft, { ...draft, contact: { ...DEFAULT_CONTACT, method: "phone" } });
assert.equal(noNumber.pageData!.brainwave!.links[buttons[0].button], undefined);

// 휴대폰 아래 고정 버튼
assert.deepEqual(quickActions({ ...DEFAULT_CONTACT, kakaoUrl: "https://pf.kakao.com/_a", bookingUrl: "https://booking.naver.com/b" }, "0212345678", true).map(a => a.key), ["phone", "kakao", "booking"]);
assert.deepEqual(quickActions(DEFAULT_CONTACT, "01012345678", true).map(a => a.key), ["phone", "form"], "one contact plus the form");
assert.deepEqual(quickActions({ ...DEFAULT_CONTACT, quickBar: false }, "01012345678", true), []);
assert.deepEqual(quickActions(DEFAULT_CONTACT, "", true), [], "nothing entered, no bar");
assert.deepEqual(quickActions({ ...DEFAULT_CONTACT, kakaoUrl: "javascript:alert(1)" }, "", true), []);

// 예전 초안(연락 방법 없음)도 그대로 읽힌다
assert.equal(landingDraftSchema.parse({ ...draft, contact: undefined }).contact, undefined);
// 공개 화면: 템플릿을 바꿔 문의 버튼이 '문의 양식'으로 돌아가도 지금 연락 방법(전화)으로 이어진다
{
  const switched = structuredClone(draft);
  switched.businessPhone = "010-1234-5678";
  switched.contact = { ...DEFAULT_CONTACT, method: "phone" };
  switched.pageData!.brainwave = createBusinessTemplate(switched.pageData!.businessContent!, "0-2226");
  switched.pageData!.brainwave.links["0:2233"] = "https://example.com/own";
  const links = withContactLinks(switched)!.brainwave!.links;
  assert.equal(links["0:2372"], "tel:01012345678");
  assert.equal(links["0:2233"], "https://example.com/own", "a link the owner set on one button stays");
  assert.equal(withContactLinks({ ...switched, contact: DEFAULT_CONTACT })!.brainwave!.links["0:2372"], "contact", "form method leaves the form link");
  assert.equal(withContactLinks({ ...switched, businessPhone: "", businessContact: "" })!.brainwave!.links["0:2372"], "contact", "no number yet, keep the form");
}
console.log("landing-contact-method: phone/sms/kakao/booking links, labels, owner overrides, quick bar, legacy drafts");
