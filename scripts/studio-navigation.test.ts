import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STUDIO_TABS, isStudioTab, newChatHref, stepForStudioTab, studioChatComplete, studioChips, studioEntryHref, studioHref, studioLockedStep, studioNewHref, studioRedirectHref, studioStatusText, studioSteps, studioSwitchUrl, studioTabForStep, studioTarget } from "../lib/plan-builder/studio";
import { businessChatHref, documentHref, workspaceHref } from "../lib/plan-builder/business-hub";
import { careHref, homepageHref, launchHref } from "../lib/plan-builder/journey";
import { JOURNEY_ORDER } from "../lib/plan-builder/journey-steps";
import { readLandingIdea } from "../lib/plan-builder/landing-idea";

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

/* 2단계: 예전 화면 → 작업실(예전 화면 감싸기의 router.replace) */
{
  const enc = encodeURIComponent(id);
  // 같은 사업의 예전 화면 — 결제 · 메일 링크의 값(start · step · edit · #sec-)이 그대로 탭으로 이어진다
  assert.equal(studioRedirectHref(`/plan/chat?planId=${enc}&start=1`, origin), studioHref(id, "chat", { start: "1" }), "결제 결과의 작성 시작");
  assert.equal(studioRedirectHref(`/plan/document?planId=a&edit=facts#sec-2`, origin), "/plan/studio?planId=a&tab=plan&edit=facts#sec-2");
  assert.equal(studioRedirectHref(homepageHref("a"), origin), "/plan/studio?planId=a&tab=homepage", "손님 문의 알림 메일");
  assert.equal(studioRedirectHref(careHref("a"), origin), "/plan/studio?planId=a&tab=operations", "주간 리포트 메일");
  assert.equal(studioRedirectHref(`${launchHref("a")}&step=marketing`, origin), "/plan/studio?planId=a&tab=launch&step=marketing");
  assert.equal(studioRedirectHref(`${workspaceHref("a")}&tab=action`, origin), "/plan/studio?planId=a&tab=launch");
  // 사업 관리의 요약 · 문서 탭과 탭 없는 주소(기본이 사업 요약)는 작업실에 없어 그대로
  assert.equal(studioRedirectHref(workspaceHref("a"), origin), null, "탭 없는 사업 관리 = 사업 요약");
  assert.equal(studioRedirectHref(`${workspaceHref("a")}&tab=summary`, origin), null);
  assert.equal(studioRedirectHref(`${workspaceHref("a")}&tab=documents`, origin), null);
  // ?classic=1 이면 예전 화면 그대로
  assert.equal(studioRedirectHref(`/plan/document?planId=a&classic=1`, origin), null);
  assert.equal(studioRedirectHref(`/plan/chat?new=1&classic=1`, origin), null);
  // 새 대화 — idea · prompt · start 를 그대로 싣고 작업실 새 대화로(탭 · classic 은 싣지 않는다)
  assert.equal(studioRedirectHref("/plan/chat?new=1", origin), "/plan/studio?new=1");
  {
    const carried = new URL(studioRedirectHref(`/plan/chat?new=1&idea=${encodeURIComponent("무인 김밥 판매점")}`, origin)!, origin);
    assert.equal(carried.pathname, "/plan/studio");
    assert.equal(carried.searchParams.get("new"), "1");
    assert.equal(readLandingIdea(carried.search, null, Date.now())?.text, "무인 김밥 판매점", "작업실 대화 칸도 같은 방식으로 idea 를 읽는다");
  }
  assert.equal(studioRedirectHref("/plan/chat?prompt=x&start=1&tab=plan", origin), "/plan/studio?prompt=x&start=1");
  assert.equal(studioRedirectHref("/plan/chat", origin), "/plan/studio", "사업 없는 대화(최근 사업 이어 하기)도 작업실 대화 칸에서");
  assert.equal(studioRedirectHref("/plan/chat/?new=1", origin), "/plan/studio?new=1", "끝의 / 는 같은 화면");
  // 작업실과 상관없는 주소는 보내지 않는다
  for (const href of ["/plan", "/plan/document", "/plan/homepage", `/plan/pay?planId=a`, `/plan/pay/result?planId=a&product=plan`, "/plan/studio?planId=a", "/account", "/plan/inquiries?planId=a"]) assert.equal(studioRedirectHref(href, origin), null, href);
  // classic 은 작업실 주소에 싣지 않는다(입구 링크 · 탭 바꾸기)
  assert.equal(studioEntryHref("/plan/document?planId=a&classic=1", origin), "/plan/studio?planId=a&tab=plan");
  assert.deepEqual(studioTarget(`/plan/homepage?planId=${enc}&classic=1`, id, origin), { tab: "homepage", params: {}, hash: "" });
}

/* 2단계: 새 대화 주소 — 작업실이 켜져 있으면 작업실 새 대화, 아니면 예전 대화 화면 */
assert.equal(studioNewHref(), "/plan/studio?new=1");
assert.equal(studioNewHref({ idea: "반찬", planId: "x", tab: "plan", new: "0", prompt: "" }), `/plan/studio?new=1&idea=${encodeURIComponent("반찬")}`, "planId · tab · new 는 덮어쓰지 못하고 빈 값은 싣지 않는다");
assert.equal(newChatHref("", true), "/plan/studio?new=1");
assert.equal(new URL(newChatHref("무인 김밥 판매점", true), origin).searchParams.get("idea"), "무인 김밥 판매점");
assert.equal(new URL(newChatHref("무인 김밥 판매점", true), origin).pathname, "/plan/studio");
assert.equal(newChatHref("", false), "/plan/chat?new=1");
assert.equal(newChatHref("무인 김밥", false), `/plan/chat?new=1&idea=${encodeURIComponent("무인 김밥")}`);

/* 2단계: 머리줄 진행 단계 칩 · 부제 */
{
  type S = "done" | "active" | "todo";
  const steps = (chat: S, document: S, homepage: S, launch: S, care: S = "todo") => [
    { id: "chat" as const, state: chat }, { id: "document" as const, state: document }, { id: "homepage" as const, state: homepage },
    { id: "launch" as const, state: launch }, { id: "care" as const, state: care },
  ];
  const states = (list: ReturnType<typeof studioChips>) => list.map(chip => chip.state);
  assert.deepEqual(studioChips(null).map(chip => [chip.step, chip.tab, chip.label]), [["chat", "chat", "대화"], ["document", "plan", "계획서"], ["homepage", "homepage", "홈페이지"], ["launch", "launch", "개업 준비"]]);
  assert.deepEqual(states(studioChips(null)), ["current", "upcoming", "upcoming", "upcoming"], "새 대화는 대화가 지금 단계");
  assert.deepEqual(states(studioChips(steps("done", "active", "todo", "todo"))), ["done", "current", "upcoming", "upcoming"]);
  assert.deepEqual(states(studioChips(steps("done", "done", "active", "todo"))), ["done", "done", "current", "upcoming"]);
  assert.deepEqual(states(studioChips(steps("done", "done", "done", "todo", "active"))), ["done", "done", "done", "current"], "유지보수는 칩에 없다");
  assert.deepEqual(states(studioChips(steps("done", "done", "done", "done", "active"))), ["done", "done", "done", "done"]);
  assert.deepEqual(states(studioChips(steps("done", "done", "todo", "active"))), ["done", "done", "upcoming", "current"], "홈페이지를 건너뛰고 개업 준비 중");
  assert.equal(studioChips(null, true)[3].label, "운영 개선");

  const base = { homepage: null as "none" | "draft" | "published" | null };
  assert.equal(studioStatusText({ ...base, fresh: true, steps: null }), "대화 중");
  assert.equal(studioStatusText({ ...base, steps: steps("active", "todo", "todo", "todo"), intake: { answered: 6, total: 14, complete: false } }), "대화 중 · 질문 6/14");
  assert.equal(studioStatusText({ ...base, steps: steps("active", "todo", "todo", "todo"), intake: { answered: 14, total: 14, complete: true } }), "대화 중 · 마무리");
  assert.equal(studioStatusText({ ...base, steps: steps("active", "todo", "todo", "todo") }), "대화 중", "질문 진행을 모르면 숫자 없이");
  assert.equal(studioStatusText({ ...base, steps: steps("done", "active", "todo", "todo"), generation: { done: 6, total: 10, active: true, stalled: false } }), "사업계획서 만드는 중 · 6/10장");
  assert.equal(studioStatusText({ ...base, steps: steps("done", "active", "todo", "todo"), generation: { done: 6, total: 10, active: true, stalled: true } }), "사업계획서 · 6/10장에서 멈춤");
  assert.equal(studioStatusText({ ...base, steps: steps("done", "todo", "todo", "todo") }), "사업 방향 정리됨 · 계획서 만들 차례");
  assert.equal(studioStatusText({ ...base, steps: steps("done", "active", "todo", "todo"), documents: { done: 3, total: 10 } }), "사업계획서 · 3/10장");
  assert.equal(studioStatusText({ homepage: "draft", steps: steps("done", "done", "active", "todo") }), "홈페이지 · 공개 전");
  assert.equal(studioStatusText({ homepage: "published", steps: steps("done", "done", "done", "todo", "active") }), "홈페이지 · 공개 중");
  assert.equal(studioStatusText({ homepage: "published", steps: steps("done", "done", "done", "active", "active"), launch: { done: 3, total: 9, configured: true } }), "개업 준비 3/9");
  assert.equal(studioStatusText({ homepage: "published", steps: steps("done", "done", "done", "active", "active"), launch: { done: 3, total: 9, configured: true }, operating: true }), "운영 개선 3/9");
  assert.equal(studioStatusText({ homepage: "none", steps: steps("done", "done", "todo", "todo") }), "사업계획서 완성");

  /* 작업실의 대화 완료 — 첫 답(coach.ready)만으로는 끝나지 않는다: 사업안 · 계획서 장 · 쓰는 중 · 핵심 질문 모두 답함 중 하나 */
  assert.equal(studioChatComplete({ design: false, documents: 0 }), false, "첫 답만 한 사업");
  assert.equal(studioChatComplete({ design: false, documents: 0, coreComplete: false }), false);
  assert.equal(studioChatComplete({ design: true, documents: 0 }), true, "사업안이 만들어졌다");
  assert.equal(studioChatComplete({ design: false, documents: 2 }), true, "계획서 장이 있다");
  assert.equal(studioChatComplete({ design: false, documents: 0, running: true }), true, "쓰는 중");
  assert.equal(studioChatComplete({ design: false, documents: 0, coreComplete: true }), true, "핵심 질문을 다 답했다");
  // journeySteps 가 coach.ready 로 대화를 done 으로 봐도 작업실은 대화 active — 부제는 질문 수, 칩·휴대폰 탭 ✓ 없음
  const readyOnly = studioSteps(steps("done", "todo", "todo", "todo"), false);
  assert.deepEqual(readyOnly.map(step => step.state), ["active", "todo", "todo", "todo", "todo"]);
  assert.equal(studioStatusText({ ...base, steps: readyOnly, intake: { answered: 1, total: 14, complete: false } }), "대화 중 · 질문 1/14", "첫 답 뒤에도 '사업 방향 정리됨'이 아니다");
  assert.deepEqual(states(studioChips(readyOnly)), ["current", "upcoming", "upcoming", "upcoming"], "대화 칩에 ✓ 가 없다");
  assert.deepEqual(studioSteps(steps("active", "todo", "todo", "todo"), true).map(step => step.state), ["done", "todo", "todo", "todo", "todo"]);
  assert.equal(studioStatusText({ ...base, steps: studioSteps(steps("done", "todo", "todo", "todo"), true) }), "사업 방향 정리됨 · 계획서 만들 차례");
  assert.deepEqual(studioSteps(steps("active", "todo", "todo", "todo"), true, true).map(step => step.state).slice(0, 2), ["done", "active"], "쓰는 중이면 계획서 진행 중");
  // 막힌 탭 — 대화가 안 끝났으면 계획서는 막히고(왼쪽 메뉴 문구), 사업 시작하기 · 유지보수는 사업 관리가 열려야
  assert.equal(studioLockedStep("plan", readyOnly, false), "document");
  assert.equal(studioLockedStep("homepage", readyOnly, false), "homepage");
  assert.equal(studioLockedStep("launch", readyOnly, false), "launch");
  assert.equal(studioLockedStep("operations", readyOnly, false), "care");
  assert.equal(studioLockedStep("chat", readyOnly, false), null);
  const designed = studioSteps(steps("done", "todo", "todo", "todo"), true);
  assert.equal(studioLockedStep("plan", designed, true), null, "대화를 마치면 계획서가 열린다");
  assert.equal(studioLockedStep("homepage", designed, true), "homepage", "홈페이지는 계획서를 마쳐야");
  assert.equal(studioLockedStep("launch", designed, true), null);
  assert.equal(studioLockedStep("operations", designed, true), null);
  assert.equal(studioLockedStep("plan", studioSteps(steps("done", "active", "todo", "todo"), true), true), null, "문서가 이미 있으면 막히지 않는다");
  assert.equal(studioLockedStep("homepage", studioSteps(steps("done", "done", "todo", "todo"), true), true), null);
}

/* 2단계 화면 — 소스 점검 */
{
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const studio = read("../app/plan/studio/Studio.tsx");
  const redirect = read("../app/plan/studio/StudioRedirect.tsx");
  // 예전 4개 화면 감싸기는 모두 StudioRedirect 로 — 보낼 때는 본문을 그리지 않는다(홈페이지 자동 생성 · AI 비용 방지)
  for (const page of ["chat", "document", "homepage", "workspace"]) assert.match(read(`../app/plan/${page}/page.tsx`), /<StudioRedirect fallback=/, page);
  assert.match(redirect, /const target = STUDIO_REDIRECT \? studioRedirectHref\(/);
  assert.match(redirect, /return <>\{target \? fallback : children\}<\/>;/);
  // 새 대화도 작업실에서 — 주소에 사업이 없어도 예전 대화로 보내지 않는다(새 대화 화면이 꺼졌을 때만)
  assert.ok(!studio.includes(`router.replace("/plan/chat?new=1")`), "작업실 새 대화를 예전 대화로 되돌리지 않는다");
  assert.match(studio, /if \(!intakeV2\) router\.replace\(/);
  // 대화가 막 만든 사업을 못 찾았다고 대화까지 덮지 않는다
  assert.match(studio, /!isSamplePlan\(planId\) && !startedFresh\);/);
  // 칸 단추: 같은 것을 다시 주면 상태를 바꾸지 않는다(되풀이 등록 막기) · 보이는 칸의 것만 머리줄에
  assert.match(studio, /if \(\(current\[target\] \?\? null\) === next\) return current;/);
  assert.match(studio, /if \(!node \|\| !isVisible\(id\)\) return null;/);
  // 칸이 요청한 탭 바꾸기는 주소의 다른 값을 지우지 않는다
  assert.match(studio, /url\.searchParams\.set\("tab", next\);/);
  // 깔때기 이벤트는 허용 목록에 있는 이름만
  const funnel = read("../lib/funnel/domain.ts");
  for (const event of ["studio_open", "studio_tab_view"]) { assert.ok(funnel.includes(`"${event}"`), event); assert.ok(studio.includes(`trackFunnel("${event}"`), event); }
  // 랜딩 입력칸 · '대화로 시작하기'는 newChatHref 로(작업실이 켜져 있으면 작업실 새 대화)
  assert.match(read("../components/home-prompt-hero.tsx"), /return newChatHref\(normalizeLandingIdea\(text\)\);/);
  assert.match(read("../components/home-prompt-sections.tsx"), /const NEW_CHAT = newChatHref\(\);/);
  // 예전 화면의 '작업실에서 보기'는 ?classic=1 로 연 예전 화면에만
  assert.match(read("../app/plan/BusinessAppChrome.tsx"), /params\.get\(STUDIO_CLASSIC_PARAM\) !== "1"\) return null;/);
  // 대화 완료는 작업실 기준(studioChatComplete)으로 — 칩 · 휴대폰 ✓ · 부제 · 질문 수 묻기 · 오른쪽 탭 잠김이 같은 값을 쓴다
  assert.match(studio, /const chatComplete = !!plan && studioChatComplete\(\{ design: !!hubState\?\.coach\?\.design,/);
  assert.match(studio, /return studioSteps\(journeySteps\(plan, homepage,/);
  assert.match(studio, /result\[id\] = lockFor\(id, plan, steps, chatComplete, pending\);/);
  assert.match(studio, /const workspaceOpen = !shouldResumeBusinessChat\(plan\) && \(chatComplete \|\| !readCoach\(plan\.answers\)\);/);
  assert.match(studio, /if \(!planId \|\| !ready \|\| chatDone \|\| !intakeV2\) return;/, "대화가 끝나기 전까지 질문 수를 묻는다");
  // 대화 칸이 알리면(보이는 채로도) 질문 수를 바로 다시 묻고, 보이는 칸에는 점을 찍지 않는다
  assert.ok(studio.indexOf(`if (target === "chat") setIntakeTick(`) < studio.indexOf("if (visibleRef.current.includes(target)) return;"));
  // 계획서 칸 새로 읽기 — 탭 보여 주기 · 새 소식마다 그 칸의 번호를 올리고, 계획서 칸은 진행을 다시 묻고 문서를 다시 받는다
  assert.match(studio, /if \(next !== "chat"\) bumpRefresh\(next\);/);
  assert.match(studio, /else bumpRefresh\(target\);/);
  assert.match(studio, /refresh: refreshSeq\[id\] \?\? 0/);
  const planBody = read("../app/plan/document/PlanDocumentBody.tsx");
  assert.match(planBody, /const paneRefresh = pane\?\.refresh \?\? 0;/);
  assert.match(planBody, /generation\.restart\(\);\n\s*if \(syncing\.current\) return;\n\s*hydrateFromServer\(false\)/);
  assert.match(planBody, /if \(arrived\.length \|\| finished\) \{/, "작성이 끝나면 새 장이 없어도 한 번 맞춘다");
  assert.match(read("../app/plan/document/DocumentWorkspace.tsx"), /else if \(\(grouped\.length \|\| props\.writing\) && autoSummary\.current\)/, "저절로 띄운 요약은 작성이 시작되면 '쓰는 중'으로 돌아온다");
  // 사업을 못 찾았으면 진행 단계 칩을 그리지 않는다
  assert.match(studio, /const progress = wide && !missing \?/);
  // 작업실에서는 상담 버튼을 띄우지 않는다(대화 입력칸 · 마무리 단추와 겹쳤다)
  assert.match(read("../components/support-chat-widget.tsx"), /pathname === "\/plan\/studio"/);
  // 결제 결과의 작성 시작 — 작업실로 보낼 수 있을 때만 작업실, 아니면 예전 대화의 start=1(작업실이 예전 대화로 되돌릴 때도 start=1 을 싣는다)
  assert.match(read("../app/plan/pay/result/PlanPayResult.tsx"), /startsDocument \? \(STUDIO_REDIRECT \? studioHref\(planId!, "chat", \{ start: "1" \}\) : `\/plan\/chat\?/);
  assert.match(studio, /`\$\{businessChatHref\(planId\)\}\$\{start \? `&start=\$\{encodeURIComponent\(start\)\}` : ""\}`/);
}

/* 3단계 — 대화로 고치기 처리기 보관함 · 대화 입력창 열기(소스 점검) */
{
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
  const studio = read("../app/plan/studio/Studio.tsx");
  const context = read("../app/plan/studio/StudioContext.tsx");
  // 등록하면 내리는 함수를 돌려주고, 늦게 내린 앞 처리기가 새 처리기를 지우지 않는다(같은 것일 때만 지운다)
  assert.match(studio, /editHandlers\.current\.set\(target, handler\);\n\s*return \(\) => \{ if \(editHandlers\.current\.get\(target\) === handler\) editHandlers\.current\.delete\(target\); \};/);
  assert.match(studio, /const editHandler = useCallback\(\(target: StudioEditTarget\) => editHandlers\.current\.get\(target\) \?\? null, \[\]\);/);
  // 대화 입력창 열기 — 휴대폰은 대화 탭으로, 받는 곳이 아직 없으면 하나만 보관했다가 등록할 때 넘긴다
  assert.match(studio, /if \(!readWide\(\)\) showTab\("chat"\);\n\s*if \(composeListener\.current\) composeListener\.current\(request\);\n\s*else pendingCompose\.current = request;/);
  assert.match(studio, /pendingCompose\.current = null;\n\s*if \(waiting\) listener\(waiting\);/);
  for (const name of ["registerEditHandler", "editHandler", "composeInChat", "onComposeRequest"]) assert.match(studio, new RegExp(`\\n\\s*${name},\\n`), `nav 에 ${name}`);
  assert.match(context, /onComposeRequest\?: \(listener: \(request: StudioComposeRequest\) => void\) => \(\) => void;/);
  // PC 에서 오른쪽에 보이는 열린 칸을 대화 칸에 알린다(막힌 칸이면 null) — '홈페이지를 대화로 고치기' 제안
  assert.match(studio, /studioSide=\{wide && !locks\[rightTab\] \? rightTab : null\}/);
}

console.log("studio navigation ok");
