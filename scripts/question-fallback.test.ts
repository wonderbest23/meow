import assert from "node:assert/strict";
import { normalizeAnalysis } from "../lib/plan-builder/analyzer/domain";
import { PACKS, packForAnalysis, slotsForPack } from "../lib/plan-builder/analyzer/packs";
import { analyzeGaps, pickRoundSlots, applySlotAnswer, numericSlots } from "../lib/plan-builder/analyzer/gap";
import { generateQuestions, defaultQuestions } from "../lib/plan-builder/analyzer/question-generator";
import { analyzeBusiness } from "../lib/plan-builder/analyzer/business-analyzer";
import { RESOLUTION_TARGETS, answerResolution, followUpQuestions } from "../lib/plan-builder/review/resolution";
import type { LLMConfig } from "../lib/llm/complete";

/*
 * AI 가 죽어도 질문은 나온다 — HOTFIX 3 검증.
 *
 * 무엇을 물을지는 Gap Analyzer(규칙)가 정하고 AI 는 문장만 만든다. 그래서 폴백은
 * "팩의 기본 문장(ask)" 하나면 된다 — 팩 슬롯 타입이 ask 를 필수로 요구하므로
 * 폴백 없는 슬롯은 컴파일조차 안 된다. 여기서는 그 약속이 실행에서도 지켜지는지,
 * 프로바이더 전 장애·깨진 JSON·부분 응답·가짜 슬롯에서 질문이 유실되지 않는지 본다.
 */

const CONFIG: LLMConfig = { provider: "openai", apiKey: "test-key", model: "test-model" };

/** 실제 분석 fixture — class 팩으로 떨어진다 */
const analysis = normalizeAnalysis({
  primary: { value: "교육·강의", status: "inferred", confidence: 0.9 },
  modelTags: { value: ["class"], status: "confirmed" },
  operationTags: { value: ["offline"], status: "inferred" },
  customer: { value: "반려견 보호자", status: "inferred" },
  problem: { value: null, status: "unknown" },
  solution: { value: "반려견 케이크 원데이 클래스", status: "confirmed" },
  revenueModel: { value: "수강료", status: "inferred" },
  deliveryModel: { value: "오프라인 대면", status: "inferred" },
  acquisitionChannels: { value: ["인스타그램"], status: "confirmed" },
  keyCosts: { value: ["재료비"], status: "inferred" },
  stage: { value: "아이디어 단계", status: "inferred" },
  region: { value: null, status: "unknown" },
  gapHints: [],
  summaryForUser: "반려견 보호자 대상 원데이 클래스 사업으로 이해했어요.",
})!;

const realFetch = globalThis.fetch;
const savedOpenai = process.env.OPENAI_API_KEY;
const savedAnthropic = process.env.ANTHROPIC_API_KEY;
/* 교차 프로바이더 폴백이 케이스마다 끼어들지 않게 — J 에서만 명시적으로 켠다 */
delete process.env.OPENAI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

let fetchCalls = 0;
function stubFetch(handler: () => Promise<Response> | Response) {
  fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return handler();
  }) as typeof fetch;
}
const okJson = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

async function main() {
  const report = analyzeGaps({ analysis, slots: {} }, {});
  const picked = pickRoundSlots(report);
  assert.ok(picked.length >= 3, `라운드 슬롯이 있어야 한다 (실제 ${picked.length})`);
  const ids = picked.map((s) => s.id);

  /* ── A. AI 정상 — 전부 AI 문장, 구조 동일 ── */
  {
    stubFetch(() => okJson({
      output_text: JSON.stringify({
        intro: "몇 가지만 여쭤볼게요",
        questions: picked.map((s) => ({ id: s.id, q: `${s.label}을(를) 어떻게 생각하세요? 반려견 클래스 기준으로요.`, why: "손익 계산" })),
      }),
    }));
    const r = await generateQuestions(CONFIG, analysis, picked, 1);
    assert.equal(r.source, "ai", "A: 정상 AI");
    assert.equal(r.questions.length, picked.length, "A: 개수 보존");
    assert.deepEqual(r.questions.map((q) => q.id), ids, "A: 순서·id 보존");
    assert.ok(r.questions.every((q) => q.q.includes("반려견 클래스")), "A: AI 문장 사용");
    assert.ok(r.questions.every((q) => q.allowUnknown === true), "A: 모르겠어요 항상 허용");
  }

  /* ── B. AI 완전 장애(네트워크 던짐) — 전부 팩 기본 문장 ── */
  {
    stubFetch(() => { throw new Error("ECONNREFUSED"); });
    const r = await generateQuestions(CONFIG, analysis, picked, 1);
    assert.equal(r.source, "fallback", "B: 폴백");
    assert.equal(r.questions.length, picked.length, "B: 질문 유실 0");
    const base = defaultQuestions(picked);
    assert.deepEqual(r.questions.map((q) => q.q), base.map((q) => q.q), "B: 팩 기본 문장 그대로");
  }

  /* ── C. malformed JSON — 폴백, 흐름 중단 없음 ── */
  {
    stubFetch(() => okJson({ output_text: "죄송합니다, JSON 대신 사과문을 드립니다." }));
    const r = await generateQuestions(CONFIG, analysis, picked, 1);
    assert.equal(r.source, "fallback", "C: 폴백");
    assert.equal(r.questions.length, picked.length, "C: 개수 보존");
  }

  /* ── D. 부분 응답 — 빠진 슬롯만 폴백, 나머지는 AI 유지 ── */
  {
    const partial = picked.slice(0, picked.length - 1);
    stubFetch(() => okJson({
      output_text: JSON.stringify({
        questions: partial.map((s) => ({ id: s.id, q: `AI가 만든 ${s.label} 질문입니다.` })),
      }),
    }));
    const r = await generateQuestions(CONFIG, analysis, picked, 1);
    assert.equal(r.questions.length, picked.length, "D: 요청 슬롯 수 = 질문 수");
    assert.equal(r.source, "ai", "D: 일부라도 AI 면 ai");
    const last = r.questions[r.questions.length - 1];
    const lastSlot = picked[picked.length - 1];
    assert.equal(last.q, lastSlot.ask, "D: 빠진 슬롯은 팩 기본 문장");
    assert.ok(r.questions[0].q.startsWith("AI가 만든"), "D: 나머지는 AI 문장");
  }

  /* ── E. AI 가 모르는 슬롯 반환 — 무시, canonical 만 ── */
  {
    stubFetch(() => okJson({
      output_text: JSON.stringify({
        questions: [
          { id: "fake_market_slot", q: "시장 규모는 얼마인가요?" },
          { id: ids[0], q: "AI가 만든 진짜 슬롯 질문" },
        ],
      }),
    }));
    const r = await generateQuestions(CONFIG, analysis, picked, 1);
    assert.deepEqual(r.questions.map((q) => q.id), ids, "E: 요청한 canonical id 만");
    assert.ok(!r.questions.some((q) => q.id === "fake_market_slot"), "E: 가짜 슬롯 없음");
    assert.equal(r.questions[0].q, "AI가 만든 진짜 슬롯 질문", "E: 진짜 슬롯 AI 문장은 유지");
  }

  /* ── F. 폴백 완전성 — 모든 팩·모든 슬롯 + Reviewer 보완 질문 ── */
  {
    for (const pack of Object.values(PACKS)) {
      for (const slot of slotsForPack(pack)) {
        assert.ok(slot.ask.trim().length >= 5, `F: ${pack.id}.${slot.id} 기본 질문 누락`);
        assert.ok(slot.label.trim(), `F: ${pack.id}.${slot.id} label 누락`);
        assert.ok(slot.why.trim(), `F: ${pack.id}.${slot.id} why 누락`);
      }
    }
    /* Reviewer 보완 질문도 LLM 없이 문장이 나온다 */
    for (const id of Object.keys(RESOLUTION_TARGETS)) {
      const res = answerResolution([id]);
      if (res.type !== "answer") continue;
      const qs = followUpQuestions(res, {});
      assert.ok(qs.length > 0 && qs.every((q) => q.q.trim().length >= 5), `F: 보완질문 ${id} 문장 누락`);
    }
  }

  /* ── G. 폴백 질문의 답도 같은 canonical 경로로 저장 ── */
  {
    const pack = packForAnalysis(analysis);
    const priced = picked.find((s) => s.mapsTo);
    assert.ok(priced, "G: mapsTo 슬롯이 라운드에 있어야 한다");
    const answers = applySlotAnswer({}, pack, priced!.id, "50,000원");
    const { sectionKey, qid } = priced!.mapsTo!;
    assert.equal(answers[sectionKey]?.[qid], "50,000원", "G: 기존 질문 칸에 저장");
    /* 질문 문장이 AI 든 폴백이든 저장 함수는 slotId 만 본다 — 별도 폴백 저장소 없음 */
  }

  /* ── H. 모르겠어요 — 값을 만들지 않는다 ── */
  {
    const pack = packForAnalysis(analysis);
    const before = { "financials/revenue": { unit_price: "이미 있는 값" } };
    const after = applySlotAnswer(before, pack, picked[0].id, null);
    assert.deepEqual(after, before, "H: null 답은 아무것도 쓰지 않는다");
    const empty = applySlotAnswer({}, pack, picked[0].id, "   ");
    assert.deepEqual(empty, {}, "H: 공백 답도 무시");
    assert.deepEqual(numericSlots({ [picked[0].id]: { value: "100", status: "unknown" } }), {}, "H: unknown 은 숫자로 세지 않는다");
  }

  /* ── I. Analyzer 장애 — null 반환, 던지지 않음 ── */
  {
    stubFetch(() => { throw new Error("timeout"); });
    const out = await analyzeBusiness(CONFIG, { description: "우장산역 근처 소형 베이커리 창업" });
    assert.equal(out, null, "I: 실패는 null — 라우트가 analysis_failed 로 응답, 위저드 폴백");
    /* 저장은 라우트가 하지 않는다(분석 라우트에 savePlanState 없음) — 입력 유실 불가 */
    stubFetch(() => okJson({ output_text: "JSON 아님" }));
    assert.equal(await analyzeBusiness(CONFIG, { description: "우장산역 근처 소형 베이커리 창업" }), null, "I: 깨진 응답도 null");
  }

  /* ── J. 프로바이더 전 장애 — 1차 openai + 2차 anthropic 모두 실패해도 질문은 나온다 ── */
  {
    process.env.ANTHROPIC_API_KEY = "test-secondary-key";
    stubFetch(() => { throw new Error("provider down"); });
    const r = await generateQuestions(CONFIG, analysis, picked, 2);
    assert.equal(r.source, "fallback", "J: 로컬 폴백");
    assert.equal(r.questions.length, picked.length, "J: 질문 유실 0");
    assert.ok(fetchCalls >= 2, `J: 1차+2차 프로바이더를 모두 시도했다 (호출 ${fetchCalls}회)`);
    delete process.env.ANTHROPIC_API_KEY;
  }

  /* ── 성능 — 로컬 폴백 자체는 즉시(<50ms) ── */
  {
    const t0 = performance.now();
    for (let i = 0; i < 100; i += 1) await generateQuestions(null, analysis, picked, 1);
    const per = (performance.now() - t0) / 100;
    assert.ok(per < 50, `폴백 생성 ${per.toFixed(2)}ms — 50ms 미만이어야 한다`);
    console.log(`  폴백 생성: 평균 ${per.toFixed(3)}ms/회`);
  }

  globalThis.fetch = realFetch;
  if (savedOpenai) process.env.OPENAI_API_KEY = savedOpenai;
  if (savedAnthropic) process.env.ANTHROPIC_API_KEY = savedAnthropic;
  console.log("question-fallback: A~J 통과 — 프로바이더 전 장애에서도 질문 유실 0, 답변은 canonical 경로만");
}

main().catch((e) => { console.error(e); process.exit(1); });
