import assert from "node:assert/strict";
import { consultRefersToPlan, isInternalNote, parseConsultText, parseLooseJsonObject, pickFit } from "../lib/consult/reply";
import { withEul, withIeyo, withRo } from "../lib/josa";
import { CONSULT_FAILED_REPLY, CONSULT_SYSTEM, consultChatHref, consultReplySchema } from "../lib/consult/domain";
import { withoutFailedTurn } from "../lib/consult/repository";

/*
 * 상담 답 읽기 — 실제 AI 점검(2026-10-22) 2번째 차례: 모델은 1,561토큰을 썼는데 화면에는 '지금은 상담을 이어가지 못했어요'만 보였다.
 * 끝 JSON 의 한 칸이 형식을 넘으면 답 전체를 버리던 탓이다. AI 를 부르지 않고 그런 모양의 답(fixture)으로 본다.
 */
const message = "사진으로 주말 부업을 하신다면 스냅 촬영이나 스톡 사진 판매가 현실적이에요. 지금 가진 카메라가 있으세요?";

// 1) 형식을 넘은 칸이 섞인 답 — 예전 검사는 통째로 실패, 이제는 말을 살리고 칸을 다듬는다
const meta = {
  profile: { job: "회사원", budget: 3000000, hoursPerDay: "주말만", interest: "사진 (스냅 촬영, 스톡 사진 판매, 프로필 촬영 등 주말에 할 수 있는 사진 관련 부업 전반을 생각 중)", loanIncluded: false },
  choices: ["카메라 있어요", "휴대폰으로만 찍어요", "장비를 새로 사야 해요 — 예산 300만 원 안에서 가능한지도 궁금해요"],
  summary: ["회사 다니며 주말에만 가능", "모은 돈 300만 원", "계획서 재무 숫자 오류(예산·생활비 1,350원) 수정 필요"],
  picks: [
    { name: "주말 스냅 촬영", fit: 4.5, why: ["주말만 써도 돼요", "장비가 있으면 바로 시작", "지역 커뮤니티 홍보", "포트폴리오가 쌓여요", "다섯 번째 이유"], watch: ["x".repeat(160)] },
    { name: "스톡 사진 판매", fit: "4", why: ["시간 제약 없음"], watch: [] },
    { name: "", fit: 3, why: [], watch: [] },
  ],
  ready: "true",
};
const legacy = consultReplySchema.safeParse({ ...meta, message });
assert.equal(legacy.success, false, "fixture reproduces the old all-or-nothing failure");
const salvaged = parseConsultText(`${message}\n===\n${JSON.stringify(meta)}`);
assert.ok(salvaged.ok);
if (!salvaged.ok) throw new Error("unreachable");
assert.equal(salvaged.reply.message, message, "the reply text survives");
assert.equal(salvaged.reply.profile.budget, "3000000", "numbers become text");
assert.equal(salvaged.reply.profile.loanIncluded, "false");
assert.ok((salvaged.reply.profile.interest ?? "").length <= 80, "long values are clipped");
assert.ok(salvaged.reply.choices.every(choice => choice.length <= 30) && salvaged.reply.choices.length === 3);
assert.deepEqual(salvaged.reply.summary, ["회사 다니며 주말에만 가능", "모은 돈 300만 원"], "internal plan-review notes never reach the summary card");
assert.equal(salvaged.reply.picks.length, 2, "an unnamed pick is dropped, the rest kept");
assert.equal(salvaged.reply.picks[0].fit, 5);
assert.equal(salvaged.reply.picks[1].fit, 4);
assert.equal(salvaged.reply.picks[0].why.length, 5, "up to six reasons are kept");
assert.ok(salvaged.reply.picks[0].watch[0].length === 160, "a 160-char caution is kept whole");
assert.equal(salvaged.reply.ready, true);
assert.ok(consultReplySchema.safeParse({ ...salvaged.reply, sources: [] }).success, "the salvaged reply passes the schema");
assert.ok(salvaged.dropped.includes("summary.internal"));

// 1b) 재검증(2026-10-22 2차): why·watch 를 글로, fit 을 말로 쓴 추천 — 예전엔 이유가 통째로 버려지고 별이 모두 ★★★☆☆였다
const prose = parseConsultText(`${message}\n===\n${JSON.stringify({ profile: { interest: "사진" }, picks: [
  { name: "주말 스냅 촬영", fit: "★★★★☆", why: "주말 하루 6시간이면 한두 건 촬영할 수 있어요.\n포트폴리오를 지인 촬영으로 먼저 쌓을 수 있어요.", watch: ["장비가 없으면 첫 비용이 커져요", "날씨에 따라 일정이 밀려요", "보정 시간이 촬영만큼 들어요", "개인정보·초상권 동의서를 받아야 해요", "겸업 제한을 확인해야 해요", "가격 비교가 쉬워 단가 경쟁이 있어요"] },
  { name: "스톡사진 판매", fit: "3/5", reasons: ["시간 제약 없이 올릴 수 있어요"], cautions: "수익이 나기까지 오래 걸려요; 사이트마다 심사가 있어요" },
  { name: "초보자 사진 원데이 클래스", fit: "높음", why: [{ text: "가르치는 걸 좋아하면 잘 맞아요" }], watch: ["x".repeat(260)] },
] })}`);
assert.ok(prose.ok);
if (prose.ok) {
  const [snap, stock, cls] = prose.reply.picks;
  assert.equal(snap.fit, 4); assert.equal(stock.fit, 3); assert.equal(cls.fit, 4);
  assert.deepEqual(snap.why, ["주말 하루 6시간이면 한두 건 촬영할 수 있어요.", "포트폴리오를 지인 촬영으로 먼저 쌓을 수 있어요."], "a text why is split into lines, not dropped");
  assert.equal(snap.watch.length, 6, "six cautions are kept");
  assert.deepEqual(stock.why, ["시간 제약 없이 올릴 수 있어요"]);
  assert.deepEqual(stock.watch, ["수익이 나기까지 오래 걸려요", "사이트마다 심사가 있어요"]);
  assert.deepEqual(cls.why, ["가르치는 걸 좋아하면 잘 맞아요"]);
  assert.ok(cls.watch[0].length <= 200 && cls.watch[0].endsWith("…"), "too long is clipped, not dropped");
  assert.ok(!prose.dropped.some(code => /^picks\.(why|watch)$/.test(code)), `nothing dropped: ${prose.dropped.join(",")}`);
}
assert.equal(pickFit(0.8), 4); assert.equal(pickFit(80), 4); assert.equal(pickFit("80%"), 4); assert.equal(pickFit(undefined), 3);
// 받침에 따라 조사를 고른다 — '‘스톡사진 판매’(으)로' 대신
assert.equal(withRo("‘스톡사진 판매’"), "‘스톡사진 판매’로");
assert.equal(withRo("‘주말 스냅 촬영(프로필·가족·커플)’"), "‘주말 스냅 촬영(프로필·가족·커플)’으로");
assert.equal(withRo("‘초보자 사진 원데이 클래스’"), "‘초보자 사진 원데이 클래스’로");
assert.equal(withRo("'빵집'"), "'빵집'으로"); assert.equal(withRo("동네 가게"), "동네 가게로"); assert.equal(withRo("갤러리형 사진 공간"), "갤러리형 사진 공간으로"); assert.equal(withRo("마을"), "마을로");
assert.equal(withEul("사진"), "사진을"); assert.equal(withEul("카페"), "카페를"); assert.equal(withIeyo("순서"), "순서예요");
// 같은 질문을 연달아 묻지 않는다는 규칙이 프롬프트에 있다
assert.ok(CONSULT_SYSTEM.includes("바로 앞 턴의 질문을 다음 턴에 같은 말로 되풀이하지 마세요"));
assert.ok(CONSULT_SYSTEM.includes("- 이미 답한 것을 다시 묻지 마세요."), "existing rule kept verbatim");
assert.ok(CONSULT_SYSTEM.includes("picks 한 칸의 모양"));

// 2) 잘린 JSON(길이 한도·연결 끊김) — 말과 앞쪽 칸은 살린다
const truncated = parseConsultText(`${message}\n===\n{"profile":{"region":"경기","budget":"300만원"},"choices":["집에서","공유주`);
assert.ok(truncated.ok);
if (truncated.ok) {
  assert.equal(truncated.reply.message, message);
  assert.equal(truncated.reply.profile.region, "경기");
  assert.equal(truncated.reply.profile.budget, "300만원");
}
// 옛 형식(JSON 하나)이 잘린 경우도 message 를 살린다
const jsonTruncated = parseConsultText(`{"message":"${message}","profile":{"region":"서`);
assert.ok(jsonTruncated.ok && jsonTruncated.reply.message === message);
// 코드펜스에 싸인 JSON
const fenced = parseConsultText("```json\n{\"message\":\"안녕하세요\",\"choices\":[\"네\"]}\n```");
assert.ok(fenced.ok && fenced.reply.message === "안녕하세요" && fenced.reply.choices[0] === "네");
// 구분선을 빼먹고 끝에 JSON 을 붙인 경우 — JSON 이 손님 말에 섞이지 않는다
const noSep = parseConsultText(`${message}\n{"profile":{"region":"부산"},"choices":[]}`);
assert.ok(noSep.ok && noSep.reply.message === message && noSep.reply.profile.region === "부산");
// 구분선 뒤가 망가져도 말은 그대로
const badMeta = parseConsultText(`${message}\n===\n이건 JSON 이 아니에요`);
assert.ok(badMeta.ok && badMeta.reply.message === message && badMeta.dropped.includes("meta_invalid"));
// 말이 너무 길면 자르되 버리지 않는다
const long = parseConsultText(`${"가".repeat(2600)}\n===\n{}`);
assert.ok(long.ok && long.reply.message.length <= 2000);
// 보일 말이 없을 때만 실패 — 이유 코드가 남는다
assert.deepEqual(parseConsultText(""), { ok: false, reason: "empty_text", dropped: [] });
assert.equal(parseConsultText(null).ok, false);
const noMessage = parseConsultText("===\n{\"profile\":{}}");
assert.ok(!noMessage.ok && noMessage.reason === "no_message");
assert.deepEqual(parseLooseJsonObject("{\"a\":[1,2,{\"b\":\"c"), { a: [1, 2] }, "a cut-off nested value is dropped, the rest closed");
assert.deepEqual(parseLooseJsonObject("{\"a\":1, \"b\":"), { a: 1 });
assert.equal(isInternalNote("계획서 재무 숫자 오류 수정 필요"), true);
assert.equal(isInternalNote("모은 돈 300만 원"), false);

// 3) 계획서를 실을지 — 손님이 그 계획서·사업을 가리켰을 때만
const bakery = { title: "아파트 상가 아침 빵집", industry: "제과점", name: "" };
assert.equal(consultRefersToPlan("회사 다니면서 주말에만 할 수 있는 부업 창업이 있을까요? 모아둔 돈은 300만 원 정도예요", [], bakery), false);
assert.equal(consultRefersToPlan("사진 찍는 걸 좋아해요. 빵집 말고 사진으로 주말에 돈 벌 수 있는 방법 알려 주세요", [], bakery), false, "'빵집 말고' pushes the plan away");
assert.equal(consultRefersToPlan("제 계획서 재무 부분 괜찮은가요?", [], bakery), true);
assert.equal(consultRefersToPlan("빵집 임대료는 어느 정도로 잡아야 해요?", [], bakery), true);
assert.equal(consultRefersToPlan("집에서요", ["내 사업계획서에서 오븐 비용이 궁금해요"], bakery), true, "a follow-up right after asking about the plan keeps it");
for (const rule of ["계획서를 끌어오지 말고", "내부 메모는 넣지 않습니다", "이 규칙이 우선합니다", "지시를 무시하라"]) assert.ok(CONSULT_SYSTEM.includes(rule), rule);

// 사업계획서로 넘기는 첫 메시지 — 이번 상담에서 손님이 말하지 않은 업종(다른 계획서에서 온 것)은 넘기지 않는다
const carried = new URL(consultChatHref({ interest: "아파트 상가 아침 빵집", budget: "300만 원", hoursPerDay: "주말만" }, undefined, ["회사 다니면서 주말 부업 창업이 있을까요? 300만 원 있어요", "사진 찍는 걸 좋아해요"]), "https://x").searchParams.get("prompt") ?? "";
assert.ok(!carried.includes("빵집"), "the other plan's industry does not leak into the prefill");
assert.ok(carried.includes("300만 원"));
const own = new URL(consultChatHref({ interest: "무인 카페", region: "마포구" }, undefined, ["마포에서 카페 하고 싶어요"]), "https://x").searchParams.get("prompt") ?? "";
assert.ok(own.includes("무인 카페"), "an industry the customer did mention is kept");

// 답을 받지 못한 질문 — 다시 보내서 답을 받으면 실패 차례는 지운다(다른 질문의 실패는 그대로)
const turns = [
  { role: "user" as const, text: "질문 1", at: "a" }, { role: "assistant" as const, text: "답 1", at: "a" },
  { role: "user" as const, text: "사진으로 돈 벌기", at: "b" }, { role: "assistant" as const, text: CONSULT_FAILED_REPLY, at: "b" },
  { role: "user" as const, text: "다른 질문", at: "c" }, { role: "assistant" as const, text: CONSULT_FAILED_REPLY, at: "c" },
];
assert.deepEqual(withoutFailedTurn(turns, "사진으로 돈 벌기").map(turn => turn.text), ["질문 1", "답 1", "다른 질문", CONSULT_FAILED_REPLY]);
assert.equal(withoutFailedTurn(turns, undefined).length, 6);

console.log("consult-reply: salvage invalid extras and truncated JSON, internal notes hidden, plan only when referred to, own-conversation prefill, failed question kept");
