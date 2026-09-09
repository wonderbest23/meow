import assert from "node:assert/strict";
import { applyCoachReply, coachContext, coachDocumentRevision, currentBusinessDesign, type CoachField, type CoachReply } from "../lib/plan-builder/coach";
import { checkCoachFeasibility, coachAmount } from "../lib/plan-builder/coach-feasibility";
import { completeCoachReply } from "../lib/plan-builder/coach-reply";
import { designFixture } from "./fixtures/coach-design";

const at = "2026-09-07T00:00:00Z";
const message = (id: string, text: string) => ({ id, text, role: "user" as const, at });
const field = (key: CoachField["key"], value: string): CoachField => ({ key, value, basis: "proposal", quote: "", messageId: "" });
const reply = (fields: CoachField[], extra: Partial<CoachReply> = {}): CoachReply => ({ title: "게임을 만드는 플랫폼", stage: "startup", depth: "quick", fields, message: "원래 구상과 먼저 시작할 범위를 나누어 제안합니다.", ready: true, suggestions: [], ...extra });
const idea = "메이플스토리 같은 게임을 쉽게 만드는 플랫폼";
const original = { ...field("business", idea), basis: "user" as const, quote: idea, messageId: "idea" };
const proposed = [field("customer", "게임을 만들어보고 싶은 사람"), field("offer", "장면 하나를 만드는 편집 도구"), field("price", "10,000원"), field("channel", "직접 만든 예시 공개"), field("capacity", "장면 하나의 편집 기능")];
const config = { provider: "openai" as const, apiKey: "fixture-only", model: "gpt-6-astra" };

async function main() {
  process.env.PERSISTENCE_MODE = "demo-memory";
  process.env.SUPABASE_URL = ""; process.env.SUPABASE_SERVICE_ROLE_KEY = "";
  delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENAI_API_KEY;
  const checks = checkCoachFeasibility([field("budget", "300만원"), field("setupCost", "500만원"), field("price", "10,000원"), field("unitCost", "12,000원"), field("hoursPerWeek", "주 10시간"), field("minutesPerSale", "건당 60분"), field("volume", "100")]);
  assert.deepEqual(checks.map(c => c.status), ["attention", "attention", "attention"]);
  assert.ok(checks[0].detail.includes("2,000,000"));
  assert.ok(checks[2].detail.includes("43.3"));
  assert.equal(checks[0].inputs[0].basis, "proposal", "산술 검사도 가정의 출처를 보존한다");
  assert.ok(checkCoachFeasibility([]).every(c => c.status === "unknown"));
  assert.equal(checkCoachFeasibility([field("hoursPerWeek", "200시간")])[2].status, "attention");
  assert.equal(coachAmount("모르겠음"), undefined);
  assert.equal(coachAmount("10~20만원"), undefined);
  assert.equal(coachAmount("1..2만원"), undefined);
  assert.equal(coachAmount("1,00원"), undefined);
  assert.equal(coachAmount("1.5만원"), 15000);
  assert.equal(coachAmount("3천만원"), 30000000);
  assert.equal(coachAmount("0원"), 0);
  assert.equal(checkCoachFeasibility([field("price", "10,000원"), field("unitCost", "0원")])[1].status, "within-inputs");
  let state = applyCoachReply(null, reply([original]), message("idea", idea));
  assert.equal(state.ideaOrigin?.text, idea);
  const switched = applyCoachReply(state, reply([{ ...field("business", "디자인 대행업"), basis: "user", quote: "디자인 대행업", messageId: "switch" }]), message("switch", "이제 디자인 대행업으로 바꿀게요"));
  assert.equal(switched.ideaOrigin?.text, idea);
  assert.equal(switched.business.description, "디자인 대행업", "원래 구상을 남기되 최신 선택을 따른다");
  const fetch = globalThis.fetch;
  let count = 0;
  const design = { ...designFixture("장면 하나를 편집하고 결과를 확인할 수 있는 작은 도구를 제안합니다."), approach: "new-concept" as const };
  try {
    globalThis.fetch = async (_url, init) => {
      count++;
      const body = JSON.parse(String(init?.body));
      if (count === 1) return Response.json({ status: "completed", output_text: JSON.stringify(reply([original], { message: "화면 3장을 만드세요.", suggestions: ["화면 3장에 넣을 내용을 써주세요"] })) });
      assert.equal(body.text.format.type, "json_schema");
      assert.equal(body.text.format.strict, true);
      assert.ok(body.input[1].content.includes(idea));
      return Response.json({ status: "completed", output_text: JSON.stringify({ fields: proposed, design }) });
    };
    const result = await completeCoachReply(config, null, message("idea", idea));
    assert.ok(result); state = result;
    assert.equal(count, 2, "구상과 설계를 두 호출 이내로 작성한다");
    assert.equal(state.design?.approach, "new-concept");
    assert.equal(state.design?.status, "proposal");
    assert.ok(state.messages.at(-1)?.text.includes(state.design!.nextAction.action));
    assert.ok(state.messages.at(-1)?.text.includes(state.design!.nextAction.doneWhen), "채팅 답변과 상세 설계의 완료 기준이 일치한다");
    assert.ok(!state.messages.at(-1)?.text.includes("화면 3장"), "실제 테스트에서 발견한 중간 답변의 불일치를 재현하고 차단한다");
    assert.deepEqual(state.suggestions, ["상품을 구체화해 주세요", "시작 방법을 쉽게 바꿔주세요"], "첫 호출의 미확정 실행 내용을 후속 버튼에 남기지 않는다");
    assert.ok(state.messages.at(-1)?.summary?.includes("첫 사업안"), "채팅 요약과 상세 설계를 분리한다");
    assert.ok(coachContext(state).includes("장면 하나를 편집"));
    assert.ok(coachContext(state).includes("feasibility"));
    const revision = coachDocumentRevision(state);
    count = 0;
    globalThis.fetch = async () => { count++; return Response.json({ status: "completed", output_text: JSON.stringify(reply([])) }); };
    const greeting = await completeCoachReply(config, state, message("thanks", "고마워요"));
    assert.equal(count, 1, "인사에 기획 호출을 반복하지 않는다");
    assert.equal(coachDocumentRevision(greeting!), revision);
    assert.ok(currentBusinessDesign(greeting!));
    const changed = applyCoachReply(state, reply([field("price", "20,000원")]), message("price", "가격을 바꿔줘"));
    assert.equal(currentBusinessDesign(changed), undefined);
    assert.equal(JSON.parse(coachContext(changed)).design, undefined, "옛 설계를 새 문서에 전달하지 않는다");

    count = 0;
    globalThis.fetch = async () => {
      count++;
      const payload = count === 1 ? reply([], { reviseDesign: true }) : { fields: [], design: { ...design, nextAction: { ...design.nextAction, action: "편집 화면을 종이에 그려봅니다." } } };
      return Response.json({ status: "completed", output_text: JSON.stringify(payload) });
    };
    const revised = await completeCoachReply(config, state, message("action", "다음 행동은 더 쉽게 바꿔줘"));
    assert.equal(coachDocumentRevision(revised!), revision + 1, "행동만 수정해도 관련 문서 버전 갱신");
    assert.equal(revised?.design?.sourceRevision, revision + 1);
    assert.equal(revised?.ideaOrigin?.text, idea);

    count = 0;
    globalThis.fetch = async () => {
      count++;
      return Response.json({ status: "completed", output_text: JSON.stringify(reply([], { stage: "exploring", ready: false })) });
    };
    const exploring = await completeCoachReply(config, null, message("unknown", "아직 아이디어가 없어요"));
    assert.equal(exploring?.ready, false); assert.equal(count, 1);
    assert.equal(exploring?.design, undefined, "미선택 아이디어를 사업으로 확정하지 않는다");

    for (const invalid of [
      { fields: [...proposed, field("business", "게임 대행업")], design },
      { fields: proposed, design: { ...design, assumptions: [] } },
      { fields: proposed, design: { ...design, startingPlan: { ...design.startingPlan, whyThis: "https://fabricated.example/market" } } },
    ]) {
      count = 0;
      globalThis.fetch = async () => Response.json({ status: "completed", output_text: JSON.stringify(++count === 1 ? reply([original]) : invalid) });
      assert.equal(await completeCoachReply(config, null, message("idea", idea)), null, "계획 훼손·누락·출처 창작 응답은 저장하지 않는다");
    }
  } finally { globalThis.fetch = fetch; }
  console.log("business-design: arithmetic, original vision, novel idea, exploration, structured generation, stale design, revision, invalid output passed (mock AI)");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
