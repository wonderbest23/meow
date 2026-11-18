import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * 각본 점검(AI · 네트워크 0, 2026-11-18): AI가 낼 답을 미리 정해 두고 한 대화를 처음부터 끝까지 돌린다.
 * 2026-11-18에 따로따로 고친 것들이 한 대화 안에서 서로 부딪히지 않는지 본다 —
 * 업종 짐작(#431) · 운영 범위 짐작(#432) · 아니라고 한 값 다시 묻기(#434) · 운영 중인 가게(#435).
 * AI 답(날것 JSON)만 각본이고, 그 뒤는 운영과 같은 코드가 한다: cleanGuess → guessedAnswers → understand 저장, checkReaderResult → readerItems → read 저장.
 * AI가 실제로 이런 답을 내는지는 여기서 보지 않는다(scripts/synthetic-e2e 의 실제 AI 점검이 본다).
 */
async function main() {
  Object.assign(process.env, {
    NODE_ENV: "test", PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", RATE_LIMIT_BACKEND: "memory",
    PLAN_ACCOUNT_LINKING_ENABLED: "false", NEXT_PUBLIC_BUSINESS_INTAKE_V2: "1", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", INTAKE_ESTIMATE: "1",
  });
  const network: string[] = [];
  globalThis.fetch = async url => { network.push(String(url)); throw new Error(`network blocked: ${String(url)}`); };
  const { saveIntakeCommand } = await import("../lib/plan-builder/intake-service");
  const { readCoach } = await import("../lib/plan-builder/coach");
  const { loadPlanState } = await import("../lib/plan-builder/plan-server-store");
  const { readIntake, intakeQuestions } = await import("../lib/plan-builder/intake-core");
  const { cleanGuess, guessedAnswers, understoodAnswers, cleanUnderstood } = await import("../lib/plan-builder/idea-understanding");
  const { checkReaderResult, readerItems } = await import("../lib/plan-builder/intake-reader");
  const off = { aiAvailable: false, aiAllowed: false };

  /** 손님 한 명의 대화 — 화면이 하는 순서 그대로 명령을 보낸다 */
  async function journey(business: string) {
    const owner = `scripted-${randomUUID()}`;
    const made = await saveIntakeCommand(owner, { action: "start", mode: "startup", questionId: "business", value: business, revision: 0, requestId: randomUUID() }, off);
    const planId = made.plan.id;
    const state = async () => { const plan = (await loadPlanState(owner)).plans.find(item => item.id === planId)!; return { plan, coach: readCoach(plan.answers)!, intake: readIntake(plan.answers)! }; };
    const send = async (command: Record<string, unknown>) => saveIntakeCommand(owner, { ...command, planId, revision: (await state()).coach.revision, requestId: randomUUID() } as never, off);
    const field = async (key: string) => (await state()).coach.fields.find(item => item.key === key);
    return {
      first: made, state, send, field,
      /** 첫 문장 읽기 — AI 두 호출의 날것 답을 넣는다(말한 것 · 짐작). 운영 경로(understand route)와 같은 순서로 답 목록을 만든다 */
      async understand(rawSaid: Record<string, unknown>, rawGuess: Record<string, unknown>) {
        const now = await state(), questions = intakeQuestions(now.intake, now.coach), capacityNow = now.coach.fields.find(item => item.key === "capacity")?.value;
        const understood = cleanUnderstood(rawSaid, business), items = understoodAnswers(understood, questions, capacityNow);
        const guessed = guessedAnswers(cleanGuess(rawGuess), questions, new Set(items.map(item => item.questionId)), capacityNow);
        return send({ action: "understand", understood: items, guessed });
      },
      /** 질문에 글로 답함 — 읽기 AI의 날것 답을 넣는다. 운영 경로(read route, show: true)와 같다 */
      async typed(message: string, rawRead: Record<string, unknown>) {
        const now = await state(), questions = intakeQuestions(now.intake, now.coach);
        const items = readerItems(checkReaderResult(rawRead, message), questions, now.coach.fields.find(item => item.key === "capacity")?.value);
        return send({ action: "read", read: items, message });
      },
    };
  }
  const said = { price: "", unitCost: "", monthlyCost: "", budget: "", hoursPerWeek: "", channel: "", channel2: "", channel3: "", customer: "", problem: "", offer: "", prices: "", goal: "", staff: "none", staffQuote: "", days: "none", daysQuote: "", countPeriod: "none", countNumber: 0, countUnit: "", countQuote: "" };
  const guess = (over: Record<string, unknown>) => ({ guessRunning: false, guessSector: "general", guessCountPeriod: "하루", guessCountNumber: 0, guessCountUnit: "", guessCustomer: "", guessProblem: "", guessOffer: "", guessChannel: "", guessPrice: 0, guessUnitCost: 0, guessMonthlyCost: 0, ...over });

  // 1. 필라테스 — 낱말 기준표는 '리포머 6대'를 보고 제조로 채운다. 짐작이 업종 · 운영 범위를 바로잡고, 손님이 그 운영 범위마저 많다고 하면 지우고 다시 묻는다
  {
    const j = await journey("역세권 1층에 필라테스 스튜디오를 하려고요. 리포머 6대 놓고요");
    const wrong = j.first.snapshot.intake.sector;
    const after = await j.understand(said, guess({ guessSector: "local_service", guessCountPeriod: "일주일", guessCountNumber: 20, guessCountUnit: "회", guessOffer: "기구 필라테스 주 2회 정기권", guessPrice: 220000, guessUnitCost: 15000, guessMonthlyCost: 4500000, guessCustomer: "역세권 직장인 여성", guessChannel: "네이버 예약" }));
    assert.equal(after.snapshot.intake.sector, "local_service", `업종이 짐작으로 바뀐다(기준표: ${wrong})`);
    assert.equal((await j.field("capacity"))?.value, "대표자 혼자 / 일주일 20회", "운영 범위는 새 업종 기준표 값이 아니라 이 사업에 맞춘 짐작이다");
    assert.ok(!/대$/.test((await j.field("capacity"))?.value ?? ""), "앞 업종(제조)의 단위 '대'가 남지 않는다");
    assert.equal((await j.field("price"))?.value, "220000원", "가격 짐작이 업종을 바꾼 뒤에도 들어간다");
    assert.equal(after.snapshot.sectorSuggestion ?? null, null, "짐작한 업종을 다시 바꾸자고 묻지 않는다");
    assert.equal(after.snapshot.nextQuestion?.id, "budget", "말하지 않은 준비 예산부터 묻는다");
    // 예산을 답하면서 운영 범위가 많다고 한다 — 읽기 AI: 예산은 넣고, 처리량은 되물을 칸(ask)
    const typed = await j.typed("3천만원이요. 근데 혼자 하는데 일주일 20회는 좀 많은 것 같아요", { intent: "answer", updates: [{ field: "budget", value: 30000000, quote: "3천만원" }], unknown: [], ask: ["capacityPerDay"], asks: false });
    assert.match(String(typed.snapshot.intake.answers.budget?.value), /^30000000/);
    assert.equal(await j.field("capacity"), undefined, "많다고 한 운영 범위는 지워진다");
    const texts = (await j.state()).coach.messages.map(message => message.text);
    assert.ok(texts.some(text => /이렇게 넣었어요: .*준비 예산/.test(text)), "넣은 값을 알린다");
    assert.ok(texts.some(text => /운영 범위.*다시 여쭤볼게요/.test(text)), "지운 값을 다시 묻겠다고 알린다");
    assert.equal(typed.snapshot.nextQuestion?.id, "hoursPerWeek", "다음 질문은 순서대로 일할 시간");
    const hours = await j.send({ action: "answer", questionId: "hoursPerWeek", value: 30 });
    assert.equal(hours.snapshot.nextQuestion?.fieldKey, "capacity", "지운 운영 범위를 차례가 오면 다시 묻는다");
    const capacityId = hours.snapshot.nextQuestion!.id;
    const answered = await j.send({ action: "answer", questionId: capacityId, value: "대표자 혼자 / 일주일 12회" });
    assert.equal((await j.field("capacity"))?.value, "대표자 혼자 / 일주일 12회");
    assert.equal((await j.field("capacity"))?.basis, "user", "손님이 답한 값이다");
    // 뒤늦게 온 같은 짐작 · 같은 '많다'가 손님 답을 건드리지 않는다
    await j.send({ action: "read", read: { answers: [], unknown: [], doubted: [capacityId] } });
    assert.equal((await j.field("capacity"))?.value, "대표자 혼자 / 일주일 12회", "손님이 답한 운영 범위는 '많다'는 말로 지워지지 않는다");
    assert.equal(answered.snapshot.intake.sector, "local_service");
  }

  // 2. 3년 차 미용실 — '운영 중이에요'를 누르지 않고 적었다. 목표를 6개월 손익분기로 채우지 않고, 예산은 새로 해 볼 일에 쓸 돈으로 묻는다. 업종 · 운영 범위 짐작과 함께 와도 같다
  {
    const j = await journey("미용실이요 요즘 손님이 너무 줄어서 계획 다시 세워보고 싶어요");
    const goalId = j.first.snapshot.questions.find(question => question.fieldKey === "goal")!.id;
    assert.match(String(j.first.snapshot.intake.answers[goalId]?.value), /손익분기/, "기준표는 창업 목표를 채운다");
    const after = await j.understand(said, guess({ guessRunning: true, guessSector: "local_service", guessCountPeriod: "하루", guessCountNumber: 6, guessCountUnit: "명", guessOffer: "펌 · 염색 1회", guessPrice: 80000, guessUnitCost: 12000 }));
    assert.equal(after.snapshot.intake.running, true);
    assert.equal(await j.field("goal"), undefined, "운영 중인 가게에 6개월 손익분기 목표를 채워 두지 않는다");
    assert.equal((await j.field("capacity"))?.value, "대표자 혼자 / 하루 6명");
    assert.equal(after.snapshot.nextQuestion?.id, "budget");
    assert.match(after.snapshot.nextQuestion!.prompt, /이번에 새로 해 볼 일/, "예산 질문이 운영 중 말로 나온다");
    await j.send({ action: "answer", questionId: "budget", value: 0 });
    const hours = await j.send({ action: "answer", questionId: "hoursPerWeek", value: 60 });
    assert.equal(hours.snapshot.nextQuestion?.fieldKey, "goal", "목표를 손님에게 묻는다");
    const goal = await j.send({ action: "answer", questionId: goalId, value: "떠난 단골 다시 오게 해서 손님 수 늘리기" });
    assert.match((await j.field("goal"))?.value ?? "", /단골/);
    assert.equal(goal.snapshot.nextQuestion ?? null, null, "질문이 모두 끝난다");
  }

  // 3. 업종을 손님이 직접 고른 뒤 늦게 도착한 짐작 — 업종은 그대로, 운영 범위 짐작은 들어간다. 업종이 바뀌는 짐작과 '운영 중'이 함께 와도 목표가 다시 채워지지 않는다
  {
    const j = await journey("동네에 작은 꽃집 차리고 싶어요");
    await j.send({ action: "answer", questionId: "industry", value: "retail_commerce" });
    const late = await j.understand(said, guess({ guessSector: "manufacturing", guessCountPeriod: "하루", guessCountNumber: 10, guessCountUnit: "개" }));
    assert.equal(late.snapshot.intake.sector, "retail_commerce", "손님이 고른 업종은 짐작이 바꾸지 않는다");
    assert.equal((await j.field("capacity"))?.value?.split(" / ")[1], "하루 10개", "운영 범위 짐작은 들어간다");
  }
  {
    const j = await journey("동네에서 분식집 5년째 하고 있어요 요즘 매출이 줄었네요");
    const before = j.first.snapshot.intake.sector;
    const after = await j.understand(said, guess({ guessRunning: true, guessSector: before === "food_beverage" ? "local_service" : "food_beverage", guessCountPeriod: "하루", guessCountNumber: 40, guessCountUnit: "그릇" }));
    assert.notEqual(after.snapshot.intake.sector, before, "업종이 바뀐다");
    assert.equal(await j.field("goal"), undefined, "업종이 바뀌며 기준표가 다시 채워져도 목표는 넣지 않는다");
    assert.equal((await j.field("capacity"))?.value?.split(" / ")[1], "하루 40그릇");
  }

  assert.deepEqual(network, [], "네트워크 호출 0");
  console.log("intake-scripted-journey: 4 scripted conversations passed (AI 0회)");
}

main().catch(error => { console.error(error); process.exit(1); });
