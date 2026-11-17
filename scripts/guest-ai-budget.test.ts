import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

/*
 * 손님 AI 하루 한도(사장님 결정 2026-11-17 "한도 걸고 열어줘") — lib/plan-builder/guest-ai-budget.ts
 * 로그인 통과 · 손님 단위 차감 · 전체/1명 한도 초과 거절 · Haiku 읽기 0단위 · 한도 초과 응답 모양 ·
 * 대화 저장(saveIntakeCommand)에서 AI 작업 직전에만 세는지 · 손님 대화가 로그인 때 계정으로 옮겨지는지.
 */
Object.assign(process.env, {
  NODE_ENV: "test", PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
  RATE_LIMIT_BACKEND: "memory", PLAN_ACCOUNT_LINKING_ENABLED: "true", NEXT_PUBLIC_BUSINESS_INTAKE_V2: "1",
  OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", GUEST_AI_DAILY_UNITS: "", GUEST_AI_PER_GUEST_UNITS: "",
});
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

async function main() {
  const budget = await import("../lib/plan-builder/guest-ai-budget");
  const { GUEST_AI_UNITS, GUEST_AI_LIMIT_CODE, GUEST_AI_LIMIT_MESSAGE, guestAiLimits, intakeJobUnits, spendGuestAiUnits, guestAiLimitBody } = budget;

  // 1) 한도 숫자 — 기본 전체 2,000 · 1명 60, 환경변수로 바꾸고, 잘못된 값이면 기본값
  assert.deepEqual(guestAiLimits({}), { daily: 2000, perGuest: 60 });
  assert.deepEqual(guestAiLimits({ GUEST_AI_DAILY_UNITS: "500", GUEST_AI_PER_GUEST_UNITS: "20" }), { daily: 500, perGuest: 20 });
  for (const bad of ["", " ", "0", "-3", "1.5", "많이"]) assert.deepEqual(guestAiLimits({ GUEST_AI_DAILY_UNITS: bad, GUEST_AI_PER_GUEST_UNITS: bad }), { daily: 2000, perGuest: 60 }, `잘못된 값(${bad})은 기본값`);
  // 단위: 사업 방향 정리 · 새 사업 제안 8, 그 밖의 Opus 보조 1, Haiku 읽기 0
  assert.deepEqual(GUEST_AI_UNITS, { big: 8, assist: 1, read: 0 });
  assert.equal(intakeJobUnits("design"), 8); assert.equal(intakeJobUnits("ideas"), 8);
  for (const kind of ["extract", "help", "edit"]) assert.equal(intakeJobUnits(kind), 1, kind);

  // 2) 로그인한 사람 · 로그인 서버가 없는 곳 · 0단위(Haiku 읽기)는 세지 않는다(카운터를 건드리지 않는다)
  const calls: Array<{ bucket: string; key: string; limit: number }> = [];
  const counts = new Map<string, number>();
  const fake = async (bucket: string, key: string, options: { limit: number; windowMs: number }) => {
    calls.push({ bucket, key, limit: options.limit });
    assert.equal(options.windowMs, 86_400_000, "하루(24시간) 창");
    const count = (counts.get(`${bucket}:${key}`) ?? 0) + 1;
    counts.set(`${bucket}:${key}`, count);
    return { ok: count <= options.limit, remaining: Math.max(0, options.limit - count), retryAfterSeconds: count <= options.limit ? 0 : 60 };
  };
  assert.deepEqual(await spendGuestAiUnits({ userId: "user-1", guestHash: "g", units: 8, loginAvailable: true }, { check: fake }), { ok: true, counted: 0 });
  assert.deepEqual(await spendGuestAiUnits({ userId: null, guestHash: "g", units: 8, loginAvailable: false }, { check: fake }), { ok: true, counted: 0 });
  assert.deepEqual(await spendGuestAiUnits({ userId: null, guestHash: "g", units: GUEST_AI_UNITS.read, loginAvailable: true }, { check: fake }), { ok: true, counted: 0 });
  assert.equal(calls.length, 0, "로그인 · 로그인 서버 없음 · Haiku 읽기는 카운터를 부르지 않는다");

  // 3) 손님 단위 차감 — 1명 한도(10)까지 쓰고 넘으면 거절. 막힌 손님은 전체 한도를 더 깎지 않는다
  const env = { GUEST_AI_DAILY_UNITS: "100", GUEST_AI_PER_GUEST_UNITS: "10" };
  const guest = (units: number, hash = "guest-a") => spendGuestAiUnits({ userId: null, guestHash: hash, units, loginAvailable: true }, { check: fake, env });
  assert.deepEqual(await guest(8), { ok: true, counted: 8 }, "사업 방향 정리 8단위");
  assert.equal(counts.get("guest-ai-units:guest-a"), 8); assert.equal(counts.get("guest-ai-units-all:all"), 8, "전체 한도에도 같은 만큼");
  assert.deepEqual(await guest(1), { ok: true, counted: 1 });
  assert.deepEqual(await guest(1), { ok: true, counted: 1 }, "딱 10단위까지는 된다");
  const globalBefore = counts.get("guest-ai-units-all:all");
  assert.deepEqual(await guest(1), { ok: false, counted: 1, limit: "guest" }, "1명 하루 한도를 넘으면 거절");
  assert.equal(counts.get("guest-ai-units-all:all"), globalBefore, "막힌 손님은 전체 한도를 깎지 않는다");
  assert.deepEqual(await guest(1, "guest-b"), { ok: true, counted: 1 }, "다른 손님은 따로 센다");

  // 4) 전체 한도 — 손님이 여럿이어도 하루 전체 단위를 넘으면 모두 거절
  counts.clear();
  const tight = { GUEST_AI_DAILY_UNITS: "10", GUEST_AI_PER_GUEST_UNITS: "60" };
  const many = (hash: string, units: number) => spendGuestAiUnits({ userId: null, guestHash: hash, units, loginAvailable: true }, { check: fake, env: tight });
  assert.equal((await many("g1", 8)).ok, true);
  assert.equal((await many("g2", 1)).ok, true);
  assert.equal((await many("g3", 1)).ok, true);
  assert.deepEqual(await many("g4", 1), { ok: false, counted: 1, limit: "daily" }, "전체 하루 한도를 넘으면 처음 오는 손님도 거절");
  assert.deepEqual(await spendGuestAiUnits({ userId: "user-2", guestHash: "x", units: 8, loginAvailable: true }, { check: fake, env: tight }), { ok: true, counted: 0 }, "전체 한도가 차도 로그인한 사람은 통과");

  // 5) 실제 카운터(checkRateLimit, 메모리로 내려간 상태)로도 같은 판정
  const real = (hash: string, units: number) => spendGuestAiUnits({ userId: null, guestHash: hash, units, loginAvailable: true }, { env: { GUEST_AI_DAILY_UNITS: "2000", GUEST_AI_PER_GUEST_UNITS: "9" } });
  assert.equal((await real("real-guest", 8)).ok, true);
  assert.equal((await real("real-guest", 1)).ok, true);
  assert.deepEqual(await real("real-guest", 1), { ok: false, counted: 1, limit: "guest" });

  // 6) 한도 초과 응답 모양 — 대화 본 경로는 로그인 필요 응답과 같은 모양(화면이 안내 + '로그인하고 이어가기'를 띄운다)
  assert.deepEqual(guestAiLimitBody("scope-1"), { code: "login_required", login: true, authenticated: false, ownerScope: "scope-1", message: GUEST_AI_LIMIT_MESSAGE });
  assert.equal("loginRequired" in guestAiLimitBody("scope-1"), false, "loginRequired 를 켜면 대화 칸 전체가 예시 화면으로 바뀐다 — 대화를 남긴 채 안내만 띄운다");
  assert.equal(GUEST_AI_LIMIT_MESSAGE, "오늘 무료 대화가 많아요. 로그인하면 지금까지 적은 내용 그대로 이어서 할 수 있어요.");
  assert.doesNotMatch(GUEST_AI_LIMIT_MESSAGE, /반드시|무조건|보장/, "보장하는 말은 쓰지 않는다");
  const http = read("lib/plan-builder/intake-http.ts");
  assert.match(http, /\.catch\(error => \{ if \(error instanceof IntakeError && error\.code === GUEST_AI_LIMIT_CODE\) return null; throw error; \}\);\n\s*if \(!result\) return json\(guestAiLimitBody\(scope\), 401\);/, "한도 초과는 401 로그인 필요 모양으로");
  assert.match(http, /beforeAiJob = \(kind: string\) => chargeGuestAi\(identity, intakeJobUnits\(kind\), `intake-\$\{kind\}`\)/);
  assert.match(http, /guestAllowed: guestIntakeOpen\(\)/, "손님 대화 열기는 계정 옮기기 스위치와 함께");
  const screen = read("app/plan/chat/BusinessIntake.tsx");
  assert.match(screen, /setLogin\(!!data\?\.login \|\| response\.status === 401\);/, "화면은 login 응답에 로그인 안내를 켠다");
  assert.match(screen, /\{login && <Link href=\{loginHref\}>\{sessionLost \? "다시 로그인하기" : "로그인하고 이어가기"\}/, "안내 상자 아래 '로그인하고 이어가기'");

  // 7) 보조 경로 — AI를 부르기 바로 앞에서 1단위, 한도에 닿으면 로그인 필요일 때처럼 조용히(204 · nothing · 빈 추천)
  const routes: Array<[string, RegExp]> = [
    ["app/api/plan/chat/comment/route.ts", /if \(!config\) return new Response\(null, \{ status: 204, headers: noStore \}\);\n.*\n  if \(!\(await chargeGuestAi\(identity, GUEST_AI_UNITS\.assist, "live-comment"\)\)\) return new Response\(null, \{ status: 204, headers: noStore \}\);\n\n  const encoder/],
    ["app/api/plan/chat/suggestions/route.ts", /if \(!config\) return new Response\(null, \{ status: 204, headers: noStore \}\);\n.*\n  if \(!\(await chargeGuestAi\(identity, GUEST_AI_UNITS\.assist, "answer-suggestions"\)\)\) return new Response\(null, \{ status: 204, headers: noStore \}\);\n  const result = await suggestAnswers\(/],
    ["app/api/plan/chat/reply-suggestion/route.ts", /if \(!plan \|\| !coach \|\| !config\) return new Response\(null, \{ status: 204, headers: noStore \}\);\n.*\n  if \(!\(await chargeGuestAi\(identity, GUEST_AI_UNITS\.assist, "reply-suggestion"\)\)\) return new Response\(null, \{ status: 204, headers: noStore \}\);\n  const result = await suggestReply\(/],
    ["app/api/plan/chat/understand/route.ts", /return nothing\(\);\n.*\n  if \(!\(await chargeGuestAi\(identity, GUEST_AI_UNITS\.assist, "understand"\)\)\) return nothing\(\);\n  const result = await understandIdea\(/],
    ["app/api/plan/suggest/route.ts", /if \(!\(await chargeGuestAi\(identity, GUEST_AI_UNITS\.assist, "suggest"\)\)\) return NextResponse\.json\(\{ suggestions: \[\], source: "empty" \}\);\n  const text = await completeText\(/],
  ];
  for (const [path, pattern] of routes) assert.match(read(path), pattern, `${path}: AI 직전에 세고 조용히 끝난다`);
  const reader = read("app/api/plan/chat/read/route.ts");
  assert.doesNotMatch(reader, /chargeGuestAi/, "Haiku AI 읽기는 손님 한도를 세지 않는다");
  assert.match(reader, /enforceRateLimit\("intake-read", request, \{ limit: 40, windowMs: 10 \* 60_000/, "대신 IP별 10분 제한은 그대로");

  // 8) 운영 설정 — 손님 대화 열기 + 한도 숫자(바꾸려면 이 줄을 고친다. 대시보드에서 바꾼 일반 변수는 배포 때 덮어써진다)
  const wrangler = read("wrangler.jsonc");
  assert.match(wrangler, /"INTAKE_GUEST_ALLOWED": "1"/);
  assert.match(wrangler, /"GUEST_AI_DAILY_UNITS": "2000"/);
  assert.match(wrangler, /"GUEST_AI_PER_GUEST_UNITS": "60"/);

  // 9) 대화 저장 — AI 작업을 만들기 바로 앞에서만 센다(거절 · 다시 보내기 · 규칙으로 다 읽은 메모는 세지 않음), 저장 충돌로 다시 돌아도 한 번
  const { saveIntakeCommand } = await import("../lib/plan-builder/intake-service");
  const { IntakeError, readIntake } = await import("../lib/plan-builder/intake-core");
  const { readCoach } = await import("../lib/plan-builder/coach");
  const { loadPlanState, claimGuestPlanState } = await import("../lib/plan-builder/plan-server-store");
  const { parseIntakeNote } = await import("../lib/plan-builder/intake-extraction");
  const guestHash = `guest-${randomUUID()}`;
  const started = await saveIntakeCommand(guestHash, { action: "start", mode: "startup", revision: 0, requestId: randomUUID() });
  const planId = started.plan.id;
  const current = async (owner = guestHash) => {
    const plan = (await loadPlanState(owner)).plans.find(item => item.id === planId)!;
    return { plan, coach: readCoach(plan.answers)!, intake: readIntake(plan.answers)! };
  };
  const asked: string[] = [];
  const hook = (answer: boolean) => async (kind: string) => { asked.push(kind); return answer; };
  const send = async (command: Record<string, unknown>, answer: boolean, requestId: string = randomUUID()) => saveIntakeCommand(guestHash, { ...command, planId, revision: (await current()).coach.revision, requestId } as never, { aiAvailable: true, aiAllowed: true, beforeAiJob: hook(answer) });
  const isLimit = (error: unknown) => error instanceof IntakeError && error.code === GUEST_AI_LIMIT_CODE && error.status === 401 && error.message === GUEST_AI_LIMIT_MESSAGE;

  await assert.rejects(send({ action: "design" }, true), (error: unknown) => error instanceof IntakeError && error.code === "business_required");
  assert.deepEqual(asked, [], "요청이 거절되면(사업이 아직 덜 정해짐) 세지 않는다");

  await send({ action: "answer", questionId: "business", value: "동네 아파트 단지 앞 반찬 가게" }, false);
  assert.deepEqual(asked, [], "질문에 답하기(AI 없음)는 세지 않는다 — 한도에 닿아도 답은 계속 저장된다");
  assert.equal((await current()).intake.answers.business?.value, "동네 아파트 단지 앞 반찬 가게");

  const rule = "가격: 12,000원";
  assert.equal(parseIntakeNote(rule, "check:0").needsAI, false, "전제: 규칙으로 다 읽는 메모");
  await send({ action: "message", message: rule }, false);
  assert.deepEqual(asked, [], "규칙으로 다 읽은 메모는 AI 작업이 없으니 세지 않는다");

  const before = await current();
  await assert.rejects(send({ action: "help", message: "하루 몇 개 팔아야 적자가 안 나요?" }, false), isLimit, "한도에 닿으면 로그인 필요 오류");
  assert.deepEqual(asked, ["help"]);
  const afterLimit = await current();
  assert.equal(afterLimit.coach.revision, before.coach.revision, "한도에 닿은 요청은 저장하지 않는다(입력은 화면에 남는다)");
  assert.deepEqual(afterLimit.intake.job ?? null, before.intake.job ?? null, "AI 작업도 만들지 않는다");
  assert.equal(afterLimit.coach.messages.length, before.coach.messages.length, "질문 글도 남기지 않는다");
  assert.equal(afterLimit.intake.answers.business?.value, "동네 아파트 단지 앞 반찬 가게", "이미 저장된 답은 그대로");

  asked.length = 0;
  const helpId = randomUUID();
  const helped = await send({ action: "help", message: "하루 몇 개 팔아야 적자가 안 나요?" }, true, helpId);
  assert.equal(helped.job?.kind, "help"); assert.deepEqual(asked, ["help"], "AI 작업을 만들 때 한 번");
  const replay = await saveIntakeCommand(guestHash, { action: "help", message: "하루 몇 개 팔아야 적자가 안 나요?", planId, revision: before.coach.revision, requestId: helpId }, { aiAvailable: true, aiAllowed: true, beforeAiJob: hook(true) });
  assert.equal(replay.duplicate, true); assert.deepEqual(asked, ["help"], "같은 요청을 다시 보내면(응답 유실 후 재시도) 다시 세지 않는다");
  await assert.rejects(send({ action: "help", message: "또 물어볼게요" }, true), (error: unknown) => error instanceof IntakeError && error.code === "ai_busy");
  assert.deepEqual(asked, ["help"], "앞선 AI 작업이 진행 중이라 거절되면 세지 않는다");

  // 10) 손님 대화 → 로그인 → 같은 사업이 계정으로(계정 옮기기 스위치가 켜진 경우)
  //     AI 작업이 도는 중이면 옮기지 않고 기다리게 한다(로그인 화면에 '작업이 끝난 뒤 다시 로그인' 안내) — 손님이 사업 방향 정리(30~60초) 중 로그인을 누르면 이 안내를 본다
  await assert.rejects(claimGuestPlanState(guestHash, `account-${randomUUID()}`), /PLAN_CLAIM_BUSY/);
  assert.equal((await current()).intake.answers.business?.value, "동네 아파트 단지 앞 반찬 가게", "옮기지 못해도 손님 대화는 그대로");
  const calm = `guest-${randomUUID()}`, account = `account-${randomUUID()}`;
  const first = await saveIntakeCommand(calm, { action: "start", mode: "startup", revision: 0, requestId: randomUUID() });
  const coach0 = readCoach(first.plan.answers)!;
  await saveIntakeCommand(calm, { action: "answer", questionId: "business", value: "1인 꽃 정기구독", planId: first.plan.id, revision: coach0.revision, requestId: randomUUID() });
  assert.equal(await claimGuestPlanState(calm, account), "claimed");
  const moved = (await loadPlanState(account)).plans.find(item => item.id === first.plan.id);
  assert.ok(moved, "손님이 쓰던 사업이 계정에 보인다");
  assert.equal(readIntake(moved!.answers)?.answers.business?.value, "1인 꽃 정기구독", "적은 답이 그대로 옮겨진다");
  assert.equal((await loadPlanState(account)).activePlanId, first.plan.id, "로그인 뒤 그 사업이 바로 열린다");
  assert.equal((await loadPlanState(calm)).plans.length, 0, "손님 쪽은 비워진다(한 사람만 갖는다)");

  // 11) 계정 옮기기 스위치가 꺼져 있으면 로그인 때 옛 길만 돈다 — 대화가 저장된 plan_states 를 옮기지 않는다.
  //     그래서 손님 대화는 두 스위치가 모두 켜져야 열린다(2026-11-17 운영 응답에 ownerKey 가 없어 꺼진 것을 확인했다)
  const auth = read("lib/account-auth.ts");
  const legacy = auth.slice(auth.indexOf("async function claimLegacyProjects"), auth.indexOf("export async function attachProjectToUser"));
  assert.ok(legacy.length > 100); assert.doesNotMatch(legacy, /plan_states|claimGuestPlanState/, "옛 길은 사업 대화를 옮기지 않는다");
  assert.match(auth, /if \(!planAccountLinkingEnabled\(\)\) return claimLegacyProjects\(userId, userHash, previousGuestHash\);/);

  console.log(JSON.stringify({ suite: "guest-ai-budget", passed: true }));
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
