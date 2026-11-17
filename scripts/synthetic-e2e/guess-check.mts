// 첫 문장 읽기 점검(실제 AI · 돈이 든다) — 사업 문장 24개를 동시에 읽혀 낱말 기준표 값과 AI 짐작을 나란히 찍고, 걸린 시간을 잰다.
// 시험(가짜 AI)은 흐름만 본다 — '값이 그 사업에 말이 되는지'와 '저장 시한(6.5초) 안에 오는지'는 이것으로 본다(2026-11-17).
//   ANTHROPIC_API_KEY=... LLM_TEXT_PROVIDER=anthropic LLM_MAX_KRW=1500 LLM_USAGE_LOG=tmp/guess-usage.jsonl \
//   NODE_OPTIONS="--import ./scripts/synthetic-e2e/llm-usage-logger.mjs" node --require ./scripts/ledger-test-runtime.cjs --import tsx scripts/synthetic-e2e/guess-check.mts
//   PROBE_SEQ=1 이면 앞 4개를 하나씩(동시 부하 없는 시간). 24개 동시 약 600원(Opus 5.5).
const root = process.cwd();
const { understandIdea, understoodAnswers, guessedAnswers } = await import(root + "/lib/plan-builder/idea-understanding.ts");
const { estimateIntake } = await import(root + "/lib/plan-builder/intake-estimate.ts");
const { resolveTextLLMConfig } = await import(root + "/lib/llm/config.ts");
const { suggestionConfig } = await import(root + "/lib/plan-builder/answer-suggestions.ts");
const config = suggestionConfig(resolveTextLLMConfig("guess-probe"));
if (!config) throw new Error("no AI config");
const list = [
  "돈이 될지는 모르겠지만 길고양이 사진으로 엽서 만들어서 팔아 보고 싶어요", "동네에서 작은 꽃집을 하고 싶어요. 기념일 꽃다발 위주로요", "겨울에 붕어빵 노점 해 보고 싶어요",
  "퇴근 후에 온라인으로 초등학생 영어 과외", "강아지 수제 간식을 스마트스토어에서 팔래요", "결혼식 스냅 사진 찍어 주는 일", "반려동물 사진 촬영 스튜디오",
  "손뜨개 인형 만들어서 플리마켓에서 팔기", "동네 공원에서 비눗방울 공연", "중고 명품 가방 리셀", "아파트 단지 세차 출장", "유튜브 요리 채널 운영", "1인 네일샵",
  "캠핑장 장비 대여", "할머니 손맛 반찬 정기배송", "노인 대상 스마트폰 사용법 과외", "AI로 프로필 사진 만들어 주는 서비스", "수제 맥주 펍", "타로 상담", "이사 청소 대행",
  "그냥 치킨집이요", "카페요", "혼자서 소소하게 네일샵 할꺼에여, 원컬러 4만5천", "대학가 앞 테이크아웃 커피, 아메리카노 3천원",
];
const started = Date.now();
const pick = process.env.PROBE_SEQ ? list.slice(0, 4) : list; const rows = []; const one = async text => {
  const table = estimateIntake(text).answers ?? {};
  const r = await understandIdea(config, text, undefined, 7000);
  return { text, ms: r.totalMs, failure: r.failure ?? null, said: Object.fromEntries(Object.entries(r.understood).filter(([k]) => k !== "guess")), guess: r.understood.guess ?? null,
    table: { customer: table.customer, offer: table.offer, price: table.price, unitCost: table["structure.unitCost"], cost: table["structure.cost"], channel: table.channel } };
}; if (process.env.PROBE_SEQ) { for (const t of pick) rows.push(await one(t)); } else rows.push(...await Promise.all(pick.map(one)));
for (const row of rows) console.log(JSON.stringify(row));
console.log(JSON.stringify({ model: config.model, wallMs: Date.now() - started, maxMs: Math.max(...rows.map(r => r.ms)), failures: rows.filter(r => r.failure).length }));
