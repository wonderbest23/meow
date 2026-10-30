import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GUIDE_PARAM, INQUIRIES_PATH, JOURNEY_GUIDE_CODES, REGISTRATION_PROMPT, isJourneyGuideCode, journeyGuide, journeyGuideContext, journeyGuideHref, readJourneyGuide, withJourneyGuide } from "../lib/plan-builder/journey-guides";
import { STUDIO_LINK_PARAMS, studioRedirectHref, studioSwitchUrl, studioTarget } from "../lib/plan-builder/studio";
import { journeyNext } from "../lib/plan-builder/journey";
import { businessChatHref, businessHubState, businessNextStep } from "../lib/plan-builder/business-hub";
import { LAUNCH_KEY, LAUNCH_SOURCES, launchSchema, launchSteps } from "../lib/plan-builder/business-launch";
import { applyCoachReply, COACH_KEY, COACH_TYPES } from "../lib/plan-builder/coach";
import type { Plan } from "../lib/plan-builder/plan-store";

/* 단계별 대화 세트(알림 0차) — 설계: docs/알림톡-단계안내-설계-2026-10-30.md 3장 */
const id = "business / 1";
const origin = "https://oneulstart.com";

/* 6개 가이드가 모두 있다 */
assert.deepEqual([...JOURNEY_GUIDE_CODES], ["design-ready", "plan-complete", "homepage-published", "registration", "launch-done", "first-lead"]);
assert.deepEqual(JOURNEY_GUIDE_CODES.map(code => journeyGuide(code, id).stage), ["J1", "J2", "J3", "J4", "J5", "J6"]);
assert.equal(isJourneyGuideCode("design-ready"), true);
assert.equal(readJourneyGuide("nope"), null, "모르는 guide 값은 무시");
assert.equal(readJourneyGuide(null), null);

/* 주소가 올바른 탭 · 단계를 가리킨다 */
const expected: Record<string, { tab: string | null; step?: string }> = {
  "design-ready": { tab: "plan" },
  "plan-complete": { tab: "homepage" },
  "homepage-published": { tab: "launch" },
  registration: { tab: "launch", step: "registration" },
  "launch-done": { tab: "operations" },
  "first-lead": { tab: null },
};
for (const code of JOURNEY_GUIDE_CODES) {
  const guide = journeyGuide(code, id);
  const url = new URL(journeyGuideHref(code, id), origin);
  assert.equal(guide.tab, expected[code].tab, `${code} 탭`);
  assert.equal(url.searchParams.get(GUIDE_PARAM), code, `${code} 주소에 guide`);
  if (guide.tab) {
    assert.equal(url.pathname, "/plan/studio");
    assert.equal(url.searchParams.get("planId"), id);
    assert.equal(url.searchParams.get("tab"), guide.tab);
    assert.equal(url.searchParams.get("step"), expected[code].step ?? null, `${code} 단계`);
    assert.equal(guide.banner, false);
    /* 작업실이 그 주소를 같은 사업의 그 탭으로 읽는다 */
    assert.deepEqual(studioTarget(url.href, id, origin)?.tab, guide.tab);
    assert.equal(studioTarget(url.href, id, origin)?.params[GUIDE_PARAM], code);
    /* 다음 할 일 단추 2~3개 — 같은 사업 주소는 작업실 탭 바꾸기로 열린다 */
    assert.ok(guide.actions.length >= 2 && guide.actions.length <= 3, `${code} 단추 수`);
    for (const action of guide.actions) {
      if (action.external) { assert.match(action.href, /^https:\/\//); continue; }
      assert.ok(studioTarget(action.href, id, origin), `${code} '${action.label}' 은 작업실 안 주소`);
    }
  } else {
    assert.equal(url.pathname, INQUIRIES_PATH, "첫 문의는 내 문의 목록");
    assert.equal(guide.banner, true, "대화 칸이 없어 안내 띠");
    assert.equal(guide.prefill, null);
  }
}

/* 문구 — 영어 · 금지어 없음(설계 문서의 '확인 필요' 중 근거 없는 말은 뺐다) */
const banned = /[A-Za-z]|습니다|보장|무조건|반드시|하루 안에|계약으로 이어지기 쉬워요|답장 문장/;
for (const code of JOURNEY_GUIDE_CODES) {
  for (const context of [{}, { operating: true }]) {
    const guide = journeyGuide(code, id, context);
    for (const text of [guide.message, guide.prefill ?? "", ...guide.actions.map(action => action.label)]) {
      assert.doesNotMatch(text, banned, `${code}: ${text}`);
    }
    assert.ok(guide.message.length > 0);
  }
}
assert.match(journeyGuide("design-ready", id).message, /결제/, "계획서 작성은 결제 뒤 — 무료 장이 없다(free-tier.ts)");
assert.match(readFileSync(new URL("../lib/plan-builder/free-tier.ts", import.meta.url), "utf8"), /FREE_SECTION_COUNT = 0/, "결제 안내의 근거");
assert.match(journeyGuide("launch-done", id, { operating: true }).message, /^운영 개선 목록/, "운영 중이면 4단계 이름이 운영 개선");
assert.match(journeyGuide("launch-done", id).message, /^개업 준비 목록/);
assert.equal(journeyGuide("first-lead", id).message, "첫 문의를 축하드려요! 빨리 연락할수록 좋아요.");
assert.deepEqual(journeyGuide("first-lead", id).actions, [], "문의마다 전화·문자 단추가 이미 있다");

/* 미리 넣는 문장 — 사업자등록은 개업 준비 단계의 요청 문장 그대로 */
assert.equal(journeyGuide("registration", id).prefill, REGISTRATION_PROMPT);
assert.ok(readFileSync(new URL("../lib/plan-builder/business-launch.ts", import.meta.url), "utf8").includes(`prompt: "${REGISTRATION_PROMPT}"`), "business-launch.ts registration prompt 와 같다");
assert.equal(journeyGuide("registration", id).actions[0].href, businessChatHref(id, REGISTRATION_PROMPT));
assert.equal(journeyGuide("registration", id).actions[1].href, LAUNCH_SOURCES.registration.url);
assert.equal(journeyGuide("registration", id).actions[1].external, true);
for (const code of ["design-ready", "plan-complete", "homepage-published", "launch-done"] as const) assert.ok(journeyGuide(code, id).prefill, `${code} 미리 넣는 문장`);
/* J1 '계획서 만들기'는 대화 칸의 작성 시작(start=1)과 같다 — 결제 전이면 서버가 결제 화면으로 */
assert.equal(new URL(journeyGuide("design-ready", id).actions[0].href, origin).searchParams.get("start"), "1");
/* J3 '첫 준비 단계 열기'는 개업 준비의 다음 단계를 바로 연다 */
assert.equal(new URL(journeyGuide("homepage-published", id, { launchStep: "license" }).actions[0].href, origin).searchParams.get("step"), "license");
assert.equal(new URL(journeyGuide("homepage-published", id).actions[0].href, origin).searchParams.get("step"), null);

/* guide 는 탭을 바꿀 때 지워지는 한 번용 값 */
assert.ok((STUDIO_LINK_PARAMS as readonly string[]).includes(GUIDE_PARAM), "STUDIO_LINK_PARAMS 에 guide");
assert.equal(new URL(studioSwitchUrl(journeyGuideHref("plan-complete", id), "launch"), origin).searchParams.get(GUIDE_PARAM), null, "탭을 그냥 누르면 지운다");
assert.equal(new URL(studioSwitchUrl(`/plan/studio?planId=a&tab=chat`, "homepage", { params: { guide: "plan-complete" } }), origin).searchParams.get(GUIDE_PARAM), "plan-complete", "링크가 실어 오면 싣는다");

/* 예전 화면 주소에 실은 guide 는 작업실로 보낼 때 그대로 따라간다 */
assert.equal(withJourneyGuide("/plan/homepage?planId=p", "plan-complete"), "/plan/homepage?planId=p&guide=plan-complete");
assert.equal(withJourneyGuide("/plan/studio?planId=p&tab=homepage#hk-leads", "launch-done"), "/plan/studio?planId=p&tab=homepage&guide=launch-done#hk-leads", "해시는 맨 뒤에");
assert.equal(withJourneyGuide("/plan/inquiries", "first-lead"), "/plan/inquiries?guide=first-lead");

/* 기존 '다음 단계' 동선이 같은 guide 주소를 쓴다 — 알림 없이도 화면에서 같은 대화 세트가 열린다 */
const at = "2026-10-30T00:00:00Z";
const coach = applyCoachReply(null, { title: "사진 사업", message: "좋아요.", stage: "startup", depth: "quick", ready: false, fields: [], suggestions: [] }, { id: "m1", role: "user", text: "사진 사업", at });
const talking: Plan = { id: "p", title: "사진 사업", planType: COACH_TYPES.startup, createdAt: at, updatedAt: at, answers: { [COACH_KEY]: { state: coach } }, sections: {} };
const complete: Plan = { ...talking, sections: Object.fromEntries(businessHubState(talking).keys.map(key => [key, { markdown: "본문" } as Plan["sections"][string]])) };
/* 예전 주소 → 작업실 주소로 보냈을 때 대화 세트 주소와 탭 · 단계 · guide 가 같다 */
const sameSet = (href: string, code: (typeof JOURNEY_GUIDE_CODES)[number], message: string) => {
  const actual = new URL(studioRedirectHref(href, origin) ?? href, origin);
  const wanted = new URL(journeyGuideHref(code, "p"), origin);
  for (const key of ["planId", "tab", "step", GUIDE_PARAM]) assert.equal(actual.searchParams.get(key), wanted.searchParams.get(key), `${message}: ${key}`);
};
sameSet(journeyNext(complete, "none").href, "plan-complete", "계획서 완성 → 홈페이지 만들기");
assert.equal(new URL(journeyNext(complete, "draft").href, origin).searchParams.get(GUIDE_PARAM), null, "만들어 둔 홈페이지 다듬기는 단계를 넘긴 게 아니다");
assert.equal(new URL(journeyNext(complete, "none").secondary!.href, origin).searchParams.get(GUIDE_PARAM), null, "건너뛰는 길에는 싣지 않는다");
sameSet(journeyNext(complete, "published").href, "homepage-published", "홈페이지 공개 → 개업 준비");
{
  const configured = launchSchema.parse({ configured: true });
  const steps = launchSteps(complete, configured);
  const before = steps.slice(0, steps.findIndex(step => step.id === "registration"));
  assert.ok(steps.some(step => step.id === "registration"), "사업자등록 단계가 있는 사업");
  const recordsDone = (list: typeof steps) => Object.fromEntries(list.map(step => [step.id, { status: "done", signature: step.signature, note: "", material: "", at }]));
  const atRegistration: Plan = { ...complete, answers: { ...complete.answers, [LAUNCH_KEY]: { ...configured, records: recordsDone(before) } } };
  const next = businessNextStep(atRegistration);
  assert.equal(next.step, "registration");
  sameSet(next.href, "registration", "사업자등록 차례");
  assert.equal(journeyGuideContext(atRegistration).launchStep, "registration");
  const fresh: Plan = { ...complete, answers: { ...complete.answers, [LAUNCH_KEY]: { ...configured } } };
  assert.equal(new URL(businessNextStep(fresh).href, origin).searchParams.get(GUIDE_PARAM), null, "사업자등록 차례가 아니면 싣지 않는다");
  const launched: Plan = { ...complete, answers: { ...complete.answers, [LAUNCH_KEY]: { ...configured, records: recordsDone(steps) } } };
  sameSet(journeyNext(launched, "published").href, "launch-done", "개업 준비 완료 → 유지보수");
}
assert.deepEqual(journeyGuideContext(null), {}, "사업을 못 불러왔으면 기본 문구");
/* 내 사업 목록 — 사업안만 만든 사업은 '사업 시작' 대화 세트를 싣는다(business-hub.ts businessEntryHref) */
assert.match(readFileSync(new URL("../lib/plan-builder/business-hub.ts", import.meta.url), "utf8"), /hub\.coach\?\.design && !hub\.documents\.length\) return `\$\{businessChatHref\(plan\.id\)\}&guide=design-ready`/);
assert.equal(studioTarget(`${businessChatHref("p")}&guide=design-ready`, "p", origin)?.params[GUIDE_PARAM], "design-ready");

/* 화면 — 작업실 대화 칸 · 예시 사업 안내 · 문의 목록 안내 띠. 말풍선은 대화 기록에 저장하지 않고, 미리 넣는 문장은 보내지 않는다 */
const intake = readFileSync(new URL("../app/plan/chat/BusinessIntake.tsx", import.meta.url), "utf8");
assert.match(intake, /<JourneyGuideTurn guide=\{shownGuide\} \/>/);
assert.match(intake, /searchParams\.get\("prompt"\)/, "작업실 대화 칸도 prompt= 를 입력칸에 넣는다");
const guideBlock = intake.slice(intake.indexOf("const urlGuide"), intake.indexOf("const shownGuide"));
assert.doesNotMatch(guideBlock, /send\(|submitStudio|submitComposer|fetch\(/, "자동 전송 · 저장 금지");
const studio = readFileSync(new URL("../app/plan/studio/Studio.tsx", import.meta.url), "utf8");
assert.match(studio, /noteGuideTurn/, "예시 사업에서도 말풍선(저장 없이)");
const inquiries = readFileSync(new URL("../app/plan/inquiries/page.tsx", import.meta.url), "utf8");
assert.match(inquiries, /guideBanner/, "문의 목록은 화면 위 안내 띠");

console.log("journey guides: passed (6 guides, tab/step links, wording, guide link param, next-step wiring)");
