import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STUDIO_TABS, isStudioTab, stepForStudioTab, studioEntryHref, studioHref, studioSwitchUrl, studioTabForStep, studioTarget } from "../lib/plan-builder/studio";
import { businessChatHref, documentHref, workspaceHref } from "../lib/plan-builder/business-hub";
import { careHref, homepageHref, launchHref } from "../lib/plan-builder/journey";
import { JOURNEY_ORDER } from "../lib/plan-builder/journey-steps";

const id = "business / 1";
const origin = "http://localhost:8083";

/* 작업실 주소 — 사업 · 탭 · 실어 나르는 값 · 해시 */
{
  const url = new URL(studioHref(id, "chat", { start: "1" }), origin);
  assert.equal(url.pathname, "/plan/studio");
  assert.equal(url.searchParams.get("planId"), id);
  assert.equal(url.searchParams.get("tab"), "chat");
  assert.equal(url.searchParams.get("start"), "1");
  assert.equal(new URL(studioHref(id), origin).searchParams.get("tab"), "chat", "탭을 안 주면 대화");
  // extra 가 planId·tab 을 덮어쓰지 못한다
  const guarded = new URL(studioHref(id, "plan", { planId: "other", tab: "homepage", edit: "facts" }, "sec-2"), origin);
  assert.equal(guarded.searchParams.get("planId"), id);
  assert.equal(guarded.searchParams.get("tab"), "plan");
  assert.equal(guarded.searchParams.get("edit"), "facts");
  assert.equal(guarded.hash, "#sec-2");
  assert.equal(new URL(studioHref(id, "plan", {}, "#sec-3"), origin).hash, "#sec-3");
}

/* 예전 화면 주소 → 탭 (주소 만드는 함수 그대로) */
assert.deepEqual(studioTarget(businessChatHref(id), id, origin), { tab: "chat", params: {}, hash: "" });
assert.deepEqual(studioTarget(documentHref(id), id, origin), { tab: "plan", params: {}, hash: "" });
assert.deepEqual(studioTarget(homepageHref(id), id, origin), { tab: "homepage", params: {}, hash: "" });
assert.deepEqual(studioTarget(launchHref(id), id, origin), { tab: "launch", params: {}, hash: "" });
assert.deepEqual(studioTarget(careHref(id), id, origin), { tab: "operations", params: {}, hash: "" });
assert.equal(studioTarget(workspaceHref(id), id, origin)?.tab, "launch", "탭 없는 사업 관리 주소는 사업 시작하기");
assert.equal(studioTarget(`${workspaceHref(id)}&tab=action`, id, origin)?.tab, "launch");
assert.equal(studioTarget(`${workspaceHref(id)}&tab=summary`, id, origin), null, "작업실에 없는 사업 요약 탭은 예전 화면으로");
assert.equal(studioTarget(`${workspaceHref(id)}&tab=documents`, id, origin), null);
assert.equal(studioTarget(`/plan/document/?planId=${encodeURIComponent(id)}`, id, origin)?.tab, "plan", "끝의 / 는 같은 화면");

/* 각 칸이 읽는 값(edit · start · step · prompt)과 해시를 그대로 실어 나른다 */
assert.deepEqual(studioTarget(`/plan/document?planId=${encodeURIComponent(id)}&edit=facts#sec-4`, id, origin), { tab: "plan", params: { edit: "facts" }, hash: "#sec-4" });
assert.deepEqual(studioTarget(`/plan/chat?planId=${encodeURIComponent(id)}&start=1`, id, origin), { tab: "chat", params: { start: "1" }, hash: "" });
assert.deepEqual(studioTarget(`/plan/chat?planId=${encodeURIComponent(id)}&edit=chat`, id, origin), { tab: "chat", params: { edit: "chat" }, hash: "" });
assert.deepEqual(studioTarget(`${careHref(id)}&step=marketing`, id, origin), { tab: "operations", params: { step: "marketing" }, hash: "" });
assert.deepEqual(studioTarget(`${launchHref(id)}&step=marketing`, id, origin), { tab: "launch", params: { step: "marketing" }, hash: "" });
assert.deepEqual(studioTarget(businessChatHref(id, "상품을 다듬어 주세요"), id, origin), { tab: "chat", params: { prompt: "상품을 다듬어 주세요" }, hash: "" });
assert.equal(studioTarget(`${origin}/plan/homepage?planId=${encodeURIComponent(id)}`, id, origin)?.tab, "homepage", "같은 사이트의 전체 주소도");

/* 작업실 주소끼리는 탭만 */
assert.deepEqual(studioTarget(studioHref(id, "homepage"), id, origin), { tab: "homepage", params: {}, hash: "" });
assert.equal(studioTarget(`/plan/studio?planId=${encodeURIComponent(id)}&tab=unknown`, id, origin)?.tab, "chat");

/* 다른 사업 · 새 사업 · 결제 · 계정 · 바깥 주소는 실제로 이동(null) */
assert.equal(studioTarget(documentHref("other"), id, origin), null, "다른 사업");
assert.equal(studioTarget(studioHref("other", "plan"), id, origin), null, "다른 사업의 작업실");
assert.equal(studioTarget("/plan/chat?new=1", id, origin), null, "새 사업");
assert.equal(studioTarget("/plan/document", id, origin), null, "사업 없는 주소");
assert.equal(studioTarget(documentHref(id), "", origin), null, "작업실 사업이 비었으면");
assert.equal(studioTarget(`/plan/pay?planId=${encodeURIComponent(id)}&product=plan`, id, origin), null, "결제");
assert.equal(studioTarget(`/plan/pay/result?planId=${encodeURIComponent(id)}`, id, origin), null, "결제 결과");
assert.equal(studioTarget(`/account?next=${encodeURIComponent(documentHref(id))}`, id, origin), null, "계정");
assert.equal(studioTarget("/plan", id, origin), null, "내 사업 목록");
assert.equal(studioTarget(`/plan/inquiries?planId=${encodeURIComponent(id)}`, id, origin), null, "손님 문의");
assert.equal(studioTarget(`https://example.com/plan/document?planId=${encodeURIComponent(id)}`, id, origin), null, "바깥 사이트");
assert.equal(studioTarget("http://[::1", id, origin), null, "고장 난 주소");

/* 예전 화면 → 작업실 입구 */
assert.equal(studioEntryHref(`/plan/document?planId=a&edit=facts#sec-2`, origin), "/plan/studio?planId=a&tab=plan&edit=facts#sec-2");
assert.equal(studioEntryHref(careHref("a"), origin), "/plan/studio?planId=a&tab=operations");
assert.equal(studioEntryHref(workspaceHref("a"), origin), "/plan/studio?planId=a&tab=launch");
assert.equal(studioEntryHref("/plan/chat?new=1", origin), null);
assert.equal(studioEntryHref("/plan/pay?planId=a", origin), null);

/* 탭을 바꾼 뒤의 주소 — 앞 링크의 값(edit · step · start · prompt)과 해시는 남기지 않는다 */
{
  const base = `/plan/studio?planId=${encodeURIComponent(id)}`;
  const read = (href: string) => new URL(href, origin);
  // 링크로 계획서 고치기 → 그 링크의 값과 해시만
  const facts = read(studioSwitchUrl(`${base}&tab=launch&step=marketing&start=1#old`, "plan", { params: { edit: "facts" }, hash: "#sec-2" }));
  assert.equal(facts.searchParams.get("tab"), "plan");
  assert.equal(facts.searchParams.get("edit"), "facts");
  assert.equal(facts.searchParams.get("step"), null, "앞 링크의 step 은 지운다");
  assert.equal(facts.searchParams.get("start"), null, "앞 링크의 start 는 지운다");
  assert.equal(facts.hash, "#sec-2");
  assert.equal(facts.searchParams.get("planId"), id, "사업은 그대로");
  // 탭을 그냥 누르면 링크 값과 해시를 모두 지운다
  const plain = read(studioSwitchUrl(`${base}&tab=plan&edit=facts#sec-2`, "homepage"));
  assert.equal(plain.searchParams.get("tab"), "homepage");
  assert.equal(plain.searchParams.get("edit"), null);
  assert.equal(plain.hash, "");
  // 다른 링크로 바꾸면 앞 링크의 해시·값은 남지 않는다
  const step = read(studioSwitchUrl(`${base}&tab=plan&edit=facts#sec-2`, "operations", { params: { step: "marketing" }, hash: "" }));
  assert.deepEqual([...step.searchParams.keys()].sort(), ["planId", "step", "tab"]);
  assert.equal(step.hash, "");
  // 대화 수정 모드(edit=chat)는 대화 칸이 살아 있는 상태라 탭을 바꿔도 남는다 — 링크가 edit 를 새로 주면 그 값
  assert.equal(read(studioSwitchUrl(`${base}&tab=chat&edit=chat`, "plan")).searchParams.get("edit"), "chat");
  assert.equal(read(studioSwitchUrl(`${base}&tab=chat&edit=chat`, "plan", { params: { edit: "facts" }, hash: "" })).searchParams.get("edit"), "facts");
  // 링크가 planId·tab 을 덮어쓰지 못한다 · 작업실과 상관없는 값(new 등)은 건드리지 않는다
  const guarded = read(studioSwitchUrl(`${base}&tab=chat&new=1`, "plan", { params: { planId: "other", tab: "homepage" }, hash: "" }));
  assert.equal(guarded.searchParams.get("planId"), id);
  assert.equal(guarded.searchParams.get("tab"), "plan");
  assert.equal(guarded.searchParams.get("new"), "1");
  // 경로 + 쿼리 + 해시만 돌려준다(replaceState 용)
  assert.ok(studioSwitchUrl(`${origin}${base}&tab=chat`, "plan").startsWith("/plan/studio?"));
}

/* 탭 목록 · 단계 ↔ 탭 */
assert.deepEqual([...STUDIO_TABS], ["chat", "plan", "homepage", "launch", "operations"]);
assert.ok(isStudioTab("plan") && !isStudioTab("care") && !isStudioTab(null));
for (const step of JOURNEY_ORDER) assert.equal(stepForStudioTab(studioTabForStep(step)), step, step);
assert.deepEqual(JOURNEY_ORDER.map(studioTabForStep), ["chat", "plan", "homepage", "launch", "operations"]);

/* 작업실 화면 — 소스 점검(브라우저 없이 확인할 수 있는 약속만) */
{
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const studio = read("../app/plan/studio/Studio.tsx");
  const studioCss = read("../app/plan/studio/Studio.module.css");
  const documentSource = read("../app/plan/document/DocumentWorkspace.tsx");
  // 링크로 칸을 열 때마다 그 칸의 이동 번호가 오른다 — 이미 보이는 계획서 칸도 edit=facts · #sec- 를 다시 읽는다
  assert.match(studio, /if \(options\.link\) setNavSeq\(/);
  assert.match(studio, /nav=\{navSeq\[id\] \?\? 0\}/);
  assert.match(documentSource, /\}, \[factEditable, paneActive, paneNav\]\);/);
  assert.match(documentSource, /\}, \[grouped\.length, paneActive, paneNav\]\);/);
  // 탭 주소는 studioSwitchUrl 하나로 만든다(앞 링크의 값이 쌓이지 않게)
  assert.match(studio, /const nextUrl = studioSwitchUrl\(window\.location\.href, next, options\.link\);/);
  // 찾지 못한 사업은 작업실에서 한 번만 알린다 — 칸마다 따로 그리지 않는다
  assert.equal((studio.match(/<MissingBusinessBody \/>/g) ?? []).length, 1);
  assert.match(studio, /\{missing \? <div className=\{hub\.scroll\}>/);
  // 칸 안의 아무 요소나 늘리지 않는다 — 칸 본문 자리와 각 화면의 작업실 루트만
  assert.ok(!/\.pane > :not\(\.paneHeading\)/.test(studioCss), "칸 안의 아무 요소나 늘리면 단추가 칸 높이만큼 커진다");
  assert.match(studioCss, /\.paneBody > \[data-embedded\] \{ flex:1 1 auto; min-height:0; \}/);
  // 예전 화면 머리줄 — 단추가 함께 있으면 좁은 화면에서 입구 링크를 접는다
  assert.match(studioCss, /@media \(max-width:560px\) \{ \.entryLink\[data-with-actions\] \{ display:none; \}/);
  // 작업실 안 계획서 사업명은 h2(작업실 머리줄의 사업명이 h1)
  assert.match(documentSource, /<DocumentReadHeading level=\{pane \? 2 : 1\}/);
}

console.log("studio navigation ok");
