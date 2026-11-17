// 방향 뒤 대화 점검(실제 AI · 적은 돈) — AI 손님 점검에서 틀렸던 말 6개를 chatIntake 에 그대로 넣어, 바꿀 값 · 답 · 못 바꾸는 항목 표시를 본다(2026-11-17).
//   ANTHROPIC_API_KEY=... LLM_TEXT_PROVIDER=anthropic LLM_MAX_KRW=800 LLM_USAGE_LOG=tmp/chat-usage.jsonl \
//   NODE_OPTIONS="--import ./scripts/synthetic-e2e/llm-usage-logger.mjs" node --require ./scripts/ledger-test-runtime.cjs --import tsx scripts/synthetic-e2e/chat-check.mts
const root = process.cwd();
const { chatIntake } = await import(root + "/lib/plan-builder/intake-extraction.ts");
const { resolveTextLLMConfig } = await import(root + "/lib/llm/config.ts");
const config = resolveTextLLMConfig("chat-check");
if (!config) throw new Error("no AI config");
const facts = (current: Record<string, string>) => [
  { questionId: "customer", label: "주요 고객", current: current.customer ?? "" },
  { questionId: "offer", label: "제공할 상품", current: current.offer ?? "" },
  { questionId: "channel", label: "고객을 만나는 곳", current: current.channel ?? "" },
  { questionId: "price", label: "판매 가격", current: current.price ?? "" },
  { questionId: "structure.unitCost", label: "한 건당 비용", current: current.unitCost ?? "" },
  { questionId: "structure.cost", label: "매달 나가는 비용", current: current.cost ?? "" },
  { questionId: "hoursPerWeek", label: "일주일에 쓸 수 있는 시간", current: current.hours ?? "" },
  { questionId: "capacity", label: "운영 범위", current: current.capacity ?? "" },
  { questionId: "goal", label: "목표", current: "6개월 안에 손익분기 도달" },
];
const context = (business: string, financial: string, card: string) => JSON.stringify({ business, fields: [{ key: "business", value: business, by: "founder" }], direction: card, financial });
type Case = { id: string; message: string; current: Record<string, string>; business: string; financial: string; card: string; wantChange?: string[]; wantCannot?: boolean; noChange?: boolean };
const CASES: Case[] = [
  { id: "s21 시간 정정", message: "저 주 40시간 할거라 20시간 기준 아니에요. 리포머도 6대고요", current: { hours: "20시간", price: "180000원", capacity: "대표자 혼자 / 일주일 20회" }, business: "역세권 필라테스 스튜디오", financial: "본전 회원 21명(부가세 뺀 가격 기준)", card: "{\"startingPlan\":{\"scope\":\"주 20시간 안에서 그룹 레슨\"}}", wantChange: ["hoursPerWeek"] },
  { id: "s30 바꾸기+질문", message: "3건 기준으로 하겠습니다. 마지막으로 하나만 여쭤볼게요. 동행할 때 교통비는 손님한테 따로 받나요?", current: { capacity: "대표 1인 / 일주일 10건", price: "30000원" }, business: "장애인 이동 보조·동행 서비스", financial: "본전 주 4건", card: "{\"startingPlan\":{\"scope\":\"주 10건 동행\"}}", wantChange: ["capacity"] },
  { id: "s33 업종", message: "근데 업종이 계속 제조로 나와요ㅠ 저 공연·출장 서비스예요!!", current: { price: "150000원" }, business: "비눗방울 공연·생일파티 출장", financial: "본전 월 3회", card: "{\"identity\":{\"headline\":\"아이 생일에 비눗방울 공연\"}}", wantCannot: true, noChange: true },
  { id: "s32 숫자 물음", message: "본전이 23개예요 26개예요?? 아까 답이랑 카드랑 달라요", current: { price: "2200원", unitCost: "300원", cost: "50000원" }, business: "일러스트 스티커·엽서 굿즈", financial: "본전 월 26개(부가세를 뺀 가격 2,000원 기준: 50,000 ÷ (2,000 − 300) ≈ 29 → 판매 수수료 반영 26개)", card: "{\"startingPlan\":{\"scope\":\"월 26개면 본전\"}}", noChange: true },
  { id: "s19 비용 정정", message: "매달 나가는 비용은 0원이야 재료는 처음에 5만원 한번 사는거야", current: { cost: "30000원", price: "5000원" }, business: "고등학생 비즈 키링 인스타 판매", financial: "본전 월 7개", card: "{\"startingPlan\":{\"scope\":\"인스타 DM 판매\"}}", wantChange: ["structure.cost"] },
  { id: "s31 대충 정정", message: "재료비 만사천원은 내가 말한거 아니여, 한통에 만원 조금 넘게 들어", current: { unitCost: "14000원", price: "35000원" }, business: "할머니 손맛 김치 온라인 판매", financial: "본전 월 12통", card: "{\"startingPlan\":{\"scope\":\"택배 판매\"}}", wantChange: ["structure.unitCost"] },
];
const TAP = /눌러|누르|터치|탭해|직접 고쳐|직접 수정/;
const rows = await Promise.all(CASES.flatMap(c => [0, 1].map(async run => {
  const r = await chatIntake(config, facts(c.current), context(c.business, c.financial, c.card), c.message);
  if (!r.ok) return { id: c.id, run, ok: false, why: `실패 ${r.reason}` };
  const changed = r.changes.map((x: any) => `${x.questionId}=${x.value}`);
  const problems: string[] = [];
  for (const want of c.wantChange ?? []) if (!r.changes.some((x: any) => x.questionId === want)) problems.push(`${want} 안 바꿈`);
  if (c.noChange && r.changes.length) problems.push(`바꾸지 말아야 함: ${changed}`);
  if (c.wantCannot && !r.cannotChange.length) problems.push("못 바꾸는 항목 표시 없음");
  if (TAP.test(r.answer)) problems.push("답에 '눌러서 고치라' 안내");
  return { id: c.id, run, ok: !problems.length, changed, cannot: r.cannotChange, rethink: r.rethink, problems, answer: r.answer.replace(/\s+/g, " ").slice(0, 160) };
})));
for (const row of rows) console.log(`${row.ok ? "맞음" : "틀림"} ${row.id}#${row.run} ${JSON.stringify((row as any).changed ?? [])} 못바꿈=${JSON.stringify((row as any).cannot ?? [])} ${((row as any).problems ?? [(row as any).why]).join(" / ")}\n   ${(row as any).answer ?? ""}`);
console.log(JSON.stringify({ cases: rows.length, correct: rows.filter(r => r.ok).length }));
