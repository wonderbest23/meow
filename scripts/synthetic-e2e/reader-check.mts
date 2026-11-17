// AI 읽기 점검(실제 AI · 아주 적은 돈) — 질문에 적은 말을 작은 AI(Haiku)가 바르게 읽는지 문장 여러 개를 동시에 넣어 본다.
// 기대값과 다르면 줄마다 '틀림'을 찍는다. AI 손님 점검(customer-sweep)에서 나온 실제 말을 모았다(2026-11-17).
//   ANTHROPIC_API_KEY=... LLM_TEXT_PROVIDER=anthropic LLM_MAX_KRW=300 LLM_USAGE_LOG=tmp/reader-usage.jsonl \
//   NODE_OPTIONS="--import ./scripts/synthetic-e2e/llm-usage-logger.mjs" node --require ./scripts/ledger-test-runtime.cjs --import tsx scripts/synthetic-e2e/reader-check.mts
const root = process.cwd();
const { readIntakeMessage } = await import(root + "/lib/plan-builder/intake-reader.ts");
const { resolveTextLLMConfig } = await import(root + "/lib/llm/config.ts");
const base = resolveTextLLMConfig("reader-check");
if (!base || base.provider !== "anthropic") throw new Error("anthropic config required");
const config = { ...base, model: process.env.INTAKE_READER_MODEL?.trim() || "claude-haiku-5-5" };
const TODAY = "2026-11-17";
type Case = { asking: string; message: string; table?: Record<string, string>; want: Record<string, number | string | null>; intent?: string; asks?: boolean };
const CASES: Case[] = [
  { asking: "hoursPerWeek", message: "하루8시간 주6일 48시간", want: { hoursPerWeek: 48 } },
  { asking: "hoursPerWeek", message: "주 5일 하루 8시간이니까 40시간 정도여", want: { hoursPerWeek: 40 } },
  { asking: "hoursPerWeek", message: "주말엔 거의 다 쓸 수 있구 평일은 저녁만요! 한 25시간? ㅎㅎ", want: { hoursPerWeek: 25 } },
  { asking: "hoursPerWeek", message: "퇴근하고 두세시간씩", want: { hoursPerWeek: null } },
  { asking: "budget", message: "1억 2천이요. 보증금 3000, 리포머 6대 약 2700, 인테리어 3500, 나머지 운영자금으로 생각중이에요", want: { budget: 120000000 } },
  { asking: "budget", message: "한 50만원 정도요. 교재 만들고 연습용 중고폰 하나 사려고요.", want: { budget: 500000 } },
  { asking: "budget", message: "300만원 정도여 근데 업종 계속 교육코칭으로 나와여", want: { budget: 3000000 } },
  { asking: "budget", message: "음 한 100만원? 큰 비눗방울 장비랑 스피커 정도", want: { budget: 1000000 } },
  { asking: "price", message: "떡볶이 5000원이요 김밥은 3500 정도. 평균 치면 4500원쯤?", want: { price: 4500 } },
  { asking: "price", message: "3개에 2천원이요 한봉지아니고", want: { price: 2000 } },
  { asking: "unitCost", message: "재료비 40%라 했으니까 1800원쯤이고 포장용기 이런거 합치면 2000원 정도요", table: { price: "4500원" }, want: { unitCost: 2000 } },
  { asking: "cost", message: "매달 10만원씩 안 나가요.. 실이랑 솜은 한번 사면 한참 써요. 플리마켓 자리비 정도? 한 2~3만원쯤일 거예요", want: { cost: 20000 } },
  { asking: "cost", message: "창고 월세 50만원에 솔루션비 같은거 10만원 정도요", want: { cost: 600000 } },
  { asking: "cost", message: "월세 350에 관리비 30이요", want: { cost: 3800000 } },
  { asking: "budget", message: "몰라 알아서 해줘", want: {}, intent: "answer" },
  { asking: "budget", message: "그건 왜 물어보는 거예요?", want: {}, intent: "question" },
  { asking: "period", message: "최근 3개월이요", want: { period: "2026-08-01 / 2026-10-31" } },
  { asking: "period", message: "지난달이요", want: { period: "2026-10-01 / 2026-10-31" } },
  { asking: "cost", message: "광고비는 매달 400 넘게 나가는데 이것도 넣어야 되나요? 창고 월세 50만원에 솔루션비 10만원이요", want: { cost: 600000 } },
  { asking: "period", message: "올해 1월부터 6월까지요", want: { period: "2026-01-01 / 2026-06-30" } },
  { asking: "period", message: "작년 9월부터 이번달까지요", want: { period: "2025-09-01 / 2026-11-30" } },
  { asking: "period", message: "최근 3개월이요 2024.10.01 ~ 2024.12.31. 월매출 1200, 광고비 400은 이 기간 평균임", want: { period: "2024-10-01 / 2024-12-31" } },
  { asking: "sales", message: "한달 1800정도니까 3달이면 5400만원쯤이요", table: { period: "2026-08-01 / 2026-10-31" }, want: { sales: 54000000 } },
  { asking: "sales", message: "정확힌 모르겠고 한달에 400 정도 팔았으니까 1년에 4800만원쯤이요", want: { sales: 48000000 } },
  { asking: "sales", message: "45000000원이요 아까 쓴거요 월 1500씩 3개월", want: { sales: 45000000 } },
  { asking: "sales", message: "월 1200 정도요", table: { period: "2026-08-01 / 2026-10-31" }, want: { sales: 36000000 } },
  { asking: "budget", message: "한 200만원정도요? 근데 직구한거 소분해서 파는거 다들 하던데 진짜 안돼요??", want: { budget: 2000000 }, asks: true },
  { asking: "hoursPerWeek", message: "주 50시간이요. 수업 주 25타임 정도 직접 하고 근데 업종 제조로 나오는거 진짜 안 고쳐져요?", want: { hoursPerWeek: 50 }, asks: true },
  { asking: "sales", message: "45000000원이요 월 1500씩 3개월이라 대충 그정도에요", want: { sales: 45000000, budget: null } },
  { asking: "price", message: "평균 45000원 정도요 근데 요즘은 할인을 많이 해서 실제론 3만원대에 나가요", want: { price: 30000 } },
  { asking: "sales", message: "한달에 1800정도니까 10달이면 1억8천쯤이요. 초반엔 좀 더 나왔으니 1억8500 잡으면 될거같아요", want: { sales: 185000000 } },
  { asking: "budget", message: "500만원이요. 저는 처음엔 혼자 소소하게 시작하려고 하는 거라 직원 두고 하루 50건은 좀 많은 것 같아요^^;", table: { capacity: "직원·아르바이트 1~2명 / 하루 50건" }, want: { budget: 5000000, capacityPerDay: null } },
];
const near = (got: unknown, want: number | string | null) => want === null ? got === undefined : typeof want === "number" ? typeof got === "number" && Math.abs(got - want) <= Math.max(1, want * 0.001) : got === want;
const started = Date.now();
const rows = await Promise.all(CASES.map(async c => {
  const out = await readIntakeMessage(config, { asking: c.asking, table: c.table ?? {}, message: c.message, today: TODAY });
  const got = Object.fromEntries(out.result.updates.map((u: any) => [u.field, u.value]));
  const misses = Object.entries(c.want).filter(([field, want]) => !near(got[field], want)).map(([field, want]) => `${field}: 기대 ${want} · 읽음 ${got[field] ?? "없음"}`);
  if (c.intent && out.result.intent !== c.intent) misses.push(`뜻: 기대 ${c.intent} · 읽음 ${out.result.intent}`);
  if (c.asks !== undefined && !!out.result.asks !== c.asks) misses.push(`함께 물음: 기대 ${c.asks} · 읽음 ${!!out.result.asks}`);
  return { ok: !misses.length && !out.failure, message: c.message, got, ask: out.result.ask, unknown: out.result.unknown, misses, ms: out.totalMs, failure: out.failure ?? null };
}));
for (const row of rows) console.log(`${row.ok ? "맞음" : "틀림"} ${row.ms}ms ${row.message.slice(0, 40)} → ${JSON.stringify(row.got)}${row.ask.length ? ` 되묻기:${row.ask}` : ""}${row.misses.length ? `  ${row.misses.join(" / ")}` : ""}${row.failure ? ` 실패:${row.failure}` : ""}`);
console.log(JSON.stringify({ model: config.model, cases: rows.length, correct: rows.filter(r => r.ok).length, wallMs: Date.now() - started, maxMs: Math.max(...rows.map(r => r.ms)) }));
