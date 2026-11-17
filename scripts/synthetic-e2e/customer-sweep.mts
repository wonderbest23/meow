// AI 손님 전수 점검(실제 AI · 돈이 든다) — AI가 손님 역할을 맡아 실제 화면과 같은 순서로 끝까지 대화하고, 다른 AI가 대화 전체를 읽고 문제를 찾는다.
// 손님 글이 서버로 가는 길(숫자 읽기 · 질문/답 가르기 · 업종 찾기 · 첫 문장 읽기 · 사업 방향 자동 정리 · 방향 뒤 고치기)은 화면 코드(intake-ui/model.ts)를 그대로 불러 쓴다.
// 서버: 실제 AI 미리보기(start-real.sh, 손님 허용). 이 도구가 쓰는 AI(손님 연기 · 심사)는 llm-usage-logger 로 따로 재고 상한을 지킨다.
//   LLM_TEXT_PROVIDER=anthropic LLM_MAX_KRW=25000 LLM_USAGE_LOG=tmp/sweep-harness.jsonl NODE_OPTIONS="--import ./scripts/synthetic-e2e/llm-usage-logger.mjs" \
//   node --require ./scripts/ledger-test-runtime.cjs --import tsx scripts/synthetic-e2e/customer-sweep.mts http://127.0.0.1:60231 <결과 폴더> [id,id] [동시 수=10]
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";

const root = process.cwd();
const model = await import(root + "/app/plan/chat/intake-ui/model.ts");
const { koreanNumeralsToDigits } = await import(root + "/lib/plan-builder/answer-number.ts");
const { completeJson } = await import(root + "/lib/llm/complete.ts");
const { resolveTextLLMConfig } = await import(root + "/lib/llm/config.ts");
const llm = resolveTextLLMConfig("customer-sweep");
if (!llm) throw new Error("no AI config");

const [origin, outDir, only, concArg] = process.argv.slice(2);
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin ?? "")) throw new Error("local preview origin only");
if (!outDir) throw new Error("result folder required");
mkdirSync(outDir, { recursive: true });
const CONCURRENCY = Number(concArg) || 10;
const MAX_ACTIONS = 20, MAX_AFTER_DIRECTION = 3;
const READER_KEYS = new Set(["business", "customer", "offer", "channel", "price", "unitCost", "cost", "budget", "hoursPerWeek", "capacity", "period", "sales"]);

type Persona = { id: string; who: string; idea: string; style: string; after: string };
const P = (id: string, who: string, idea: string, style: string, after: string): Persona => ({ id, who, idea, style, after });
const PERSONAS: Persona[] = [
  P("s01-cat-postcard", "28세 프리랜서 사진 취미러", "길고양이 사진으로 엽서를 만들어 플리마켓에서 팔고 싶다. 돈이 될지 모르겠다", "소심하고 자신 없음. 짧게 씀", "'이런 걸로 진짜 먹고살 수 있을까요?'라고 묻고 끝낸다"),
  P("s02-bungeoppang", "56세 전직 공장 근무자", "겨울에 동네 지하철역 앞에서 붕어빵 노점", "말수가 적고 아주 짧게 답함. 띄어쓰기 대충", "가격을 '3개 2천원'으로 바꾸고 싶다고 말한다"),
  P("s03-wedding-snap", "29세 웨딩홀 촬영 보조 출신", "결혼식 스냅 사진을 혼자 찍어 주는 일", "또박또박 성실함", "사업자등록을 해야 하는지 묻는다"),
  P("s04-banchan", "43세 두 아이 엄마", "1인 가구에 국·반찬을 정기배송", "친절하고 길게 설명하는 편", "주 고객을 혼자 사는 어르신으로 바꾸고 싶다고 말한다"),
  P("s05-senior-phone", "64세 퇴직 초등교사", "어르신들께 스마트폰 쓰는 법을 출장으로 가르치기", "존댓말, 어려운 말과 영어를 싫어함. 모르는 말 나오면 되물음", "'이거 정말 될까요? 나이도 많은데'라고 묻는다"),
  P("s06-dog-walk", "22세 대학생", "반려견 산책 대행 알바를 사업으로", "오타 많고 반말 섞음 ㅋㅋ", "가격을 한 번 2만원으로 바꾼다"),
  P("s07-craft-pub", "36세 직장인", "수제 맥주 펍. 보증금 5천, 월세 350, 인테리어 1억 정도 생각", "숫자를 많이 적고 계산을 따짐", "몇 명이 와야 적자가 안 나는지 묻는다"),
  P("s08-tarot", "26세 타로 마스터", "온라인 타로 상담", "감성적, 이모티콘 씀", "고맙다고 하고 끝낸다"),
  P("s09-ai-profile", "31세 개발자", "AI로 프로필 사진을 만들어 주는 웹 서비스", "전문 용어(SaaS, CAC 등)를 섞어 씀", "경쟁 서비스가 많은데 어떻게 이기냐고 묻는다"),
  P("s10-resell", "33세 회사원", "중고 명품 가방 리셀", "자신감 넘침", "가품이 섞이면 어떻게 하냐고 묻는다"),
  P("s11-move-clean", "47세 남성", "이사 청소 대행", "거칠고 퉁명스러움. '그래서요?' 같은 말", "서비스 지역을 '경기 남부 전체'로 바꾸라고 말한다"),
  P("s12-knit-doll", "51세 주부", "손뜨개 인형을 만들어 플리마켓에서 팔기. 취미 수준", "자기 일을 낮춰 말함('별거 아닌데')", "'돈 안 되면 어쩌죠'라고 묻는다"),
  P("s13-camping", "34세 캠핑 동호회원", "캠핑 장비 대여", "보통", "캠핑 요리 키트도 같이 팔고 싶다고 말한다"),
  P("s14-nail", "24세 네일 자격증 보유", "혼자서 소소하게 네일샵, 원컬러 4만5천", "줄임말·맞춤법 틀림('할꺼에여')", "가격을 5만원으로 올린다고 말한다"),
  P("s15-cooking-yt", "30세 요리 좋아하는 회사원", "유튜브 요리 채널", "수익 구조를 잘 모름", "이걸로 어떻게 돈을 버냐고 묻는다"),
  P("s16-flower", "35세 꽃집 직원", "동네 꽃집, 기념일 꽃다발 위주", "보통", "주 고객을 근처 대학생으로 바꾸고 싶다고 말한다"),
  P("s17-jeju-jam", "45세 제주 감귤 농가 자녀", "못난이 귤로 잼·청을 만들어 온라인 판매", "길게 사연을 씀", "식품 제조 허가가 필요한지 묻는다"),
  P("s18-video-b2b", "32세 영상 편집 프리랜서", "중소기업 유튜브 영상 편집 외주, 월 4편 패키지 120만원", "간결, 업계 용어", "패키지 가격을 월 150만원으로 바꾼다"),
  P("s19-teen-keyring", "17세 고등학생", "비즈 키링을 만들어 인스타 DM으로 용돈 벌기", "어린 말투, 반말", "미성년자도 사업자 낼 수 있냐고 묻는다"),
  P("s20-farm", "55세 귀농 준비자", "강원도 감자 캐기·옥수수 따기 체험농장", "느긋함", "아이들이 다치면 보험은 어떻게 하냐고 묻는다"),
  P("s21-pilates", "38세 필라테스 강사", "역세권 1층 24평 필라테스 스튜디오, 리포머 6대", "숫자를 많이 적음", "회원이 몇 명 있어야 하냐고 묻는다"),
  P("s22-icecream", "41세 부업 희망 회사원", "무인 아이스크림 할인점", "유튜브에서 본 수익을 믿음", "'월 천만 원은 확실하죠?'라고 묻는다"),
  P("s23-diet-supp", "27세 인스타 공구 운영자", "해외 직구 다이어트 보조제를 소분해서 판매", "효과 과장을 원함", "'한 달 5kg 빠짐'이라고 광고해도 되냐고 묻는다"),
  P("s24-plant-app", "29세 기획자", "AI가 반려식물 사진으로 병충해를 진단하고 식물 집사를 연결하는 앱", "들뜸", "투자를 받을 수 있냐고 묻는다"),
  P("s25-carwash-lazy", "39세", "아파트 단지 출장 세차", "귀찮아함. 대부분 '몰라요', '알아서 해줘'", "아무 말 없이 끝낸다"),
  P("s26-busan-hoe", "52세 부산 횟집 주방 출신", "부산 바닷가 회 포장 전문점", "부산 사투리로만 씀('채려볼라카는데예')", "가격을 소짜 3만5천으로 바꾸라고 한다"),
  P("s27-brunch-partner", "31세", "친구랑 둘이 브런치 카페 동업", "보통", "친구가 돈 70% 내고 내가 일 다 하면 지분을 어떻게 나누냐고 묻는다"),
  P("s28-foreigner", "35세 미국인, 한국 거주 F-2 비자", "Korean-style street food truck (tteokbokki, hotteok)", "영어로만 씀. 한국어는 거의 못 읽음", "Asks whether a foreigner needs a special license"),
  P("s29-angry", "45세 성격 급한 손님", "그냥 치킨집", "화가 나 있음. '질문 그만하고 빨리 계획서 줘요'", "가격을 만팔천원으로 바꾸라고 한다"),
  P("s30-mobility", "40세 사회복지사", "장애인 이동 보조와 동행 서비스, 사회적기업 생각", "진지하고 신중함", "정부 지원금을 받을 수 있는지 묻는다"),
  P("s31-kimchi", "69세 할머니(손녀가 대신 입력)", "할머니 손맛 김치를 온라인으로 팔기", "말하는 그대로 받아 적은 글, 구어체", "택배로 보내도 안 쉬냐고 묻는다"),
  P("s32-illust", "25세 일러스트 작가", "내 그림으로 스티커·엽서 굿즈 판매", "자기 그림이 별로라고 생각함", "'제 그림이 팔릴까요?'라고 묻는다"),
  P("s33-bubble", "33세 거리 공연자", "동네 공원에서 비눗방울 공연, 아이 생일파티 출장", "엉뚱하고 밝음", "'이게 사업이 돼요?'라고 묻는다"),
  P("s34-coding-kids", "37세 전직 개발자 엄마", "초등학생 방과후 코딩 교실", "보통", "홍보 경로를 맘카페로 바꾸고 싶다고 말한다"),
  P("s35-bookcafe", "44세 출판사 퇴사자", "중고 책방과 커피를 함께 하는 작은 가게", "낭만적, 돈보다 의미", "'적자만 안 나면 돼요'라고 말한다"),
  P("o36-bunsik", "50세 분식집 사장, 5년째 운영", "떡볶이·김밥 분식집 매출이 줄어 다시 계획을 세우려 함. 월매출 1800만, 재료비 40%, 월세 200", "숫자를 섞어 씀, 운영 중이라고 밝힘", "배달앱 수수료를 줄이는 게 나은지 묻는다"),
  P("o37-salon", "42세 미용실 원장, 3년째", "손님이 줄어서 다시 계획을 세우고 싶다", "처음에 운영 중이라는 말을 빼먹고 사업만 말함", "단골을 늘리는 방법을 묻는다"),
  P("o38-clothes-close", "48세 옷가게 사장, 2년째 적자", "그만둘지 고민 중", "지쳐 있음", "폐업하면 뭐부터 해야 하냐고 묻는다"),
  P("o39-online-mall", "34세 스마트스토어 운영 2년", "광고비가 너무 많이 나가서 수익이 안 남", "숫자를 섞어 씀", "광고를 줄이면 매출이 얼마나 떨어질지 묻는다"),
  P("e40-no-idea-mom", "36세 육아 중 엄마", "아이디어가 없음. 집에서 하루 3시간 정도 할 수 있는 일, 손재주 좋음", "막연함", "마음에 드는 걸 하나 고르고 끝낸다"),
  P("e41-severance", "52세 권고사직, 퇴직금 4천", "뭘 해야 할지 모르겠다", "불안함", "제일 덜 위험한 게 뭐냐고 묻는다"),
];

const CUSTOMER_RULES = `너는 '오늘창업'(대화로 사업 방향과 사업계획서를 만들어 주는 사이트)에 처음 들어온 실제 한국 손님을 연기한다.
- 인물 그대로 행동한다: 휴대폰으로 짧게, 인물의 말투·오타·성격 그대로. 시키는 대로만 착하게 따르지 않는다. 이상하면 이상하다고 하거나, 무시하고 하고 싶은 말을 해도 된다.
- 매 차례 화면을 보고 행동 하나만 고른다. 화면에 없는 기능은 쓰지 못한다.
- thought(속마음)에는 화면을 본 솔직한 느낌을 한두 문장 적는다: 이해가 되는지, 내 사업에 맞는 값·말인지, 내가 한 말을 알아들었는지, 힘이 나는지 기가 죽는지, 이상한 점.
- 사업 방향 카드가 나오면 [방향 뒤 행동]대로 1~3번 더 대화한 뒤 quit 한다. 사업계획서 만들기는 로그인이 필요하니 누르지 않는다.
- 출력은 JSON 객체 하나만: {"thought": "...", "action": "type"|"choose"|"unknown"|"ask_ai"|"fix"|"quit", "text": "입력할 글(type·ask_ai·fix)", "options": ["고른 보기 이름"](choose), "field": "고칠 칸 이름(fix)"}
  type=입력창에 글 보내기, choose=보기 누르기, unknown=잘 모르겠어요 단추, ask_ai=AI에게 질문 단추, fix=먼저 채운 값 하나를 눌러 고치기, quit=그만.`;

const JUDGE_RULES = `너는 '오늘창업' 품질 심사관이다.
서비스 정체성: 손님이 아무리 작거나 가치 없어 보이는 사업을 말해도, 니체·헤겔 같은 철학처럼 궁극적으로 희망적인 말로 '이게 가능하다'고 보이게 이끈다. 동시에 숫자와 정보는 그 사업에 말이 되어야 하고, 손님이 한 말을 정확히 알아듣고 반영해야 한다. 손님은 대부분 초보다.
아래는 AI 손님이 실제 화면 흐름대로 대화한 기록이다(손님 속마음 포함). 서비스가 한 일(화면 글 · 채운 값 · 질문 · AI 답 · 사업 방향 · 안내 · 오류)의 문제를 빠짐없이 찾아라.
- 손님 연기 AI 자신의 이상한 행동은 서비스 문제가 아니다. 서비스가 그 행동에 어떻게 대응했는지만 본다.
- quote 는 기록에 있는 글을 그대로 옮긴다(지어내지 않는다).
- category: 값_엉뚱 | 말_무시 | 모순 | 흐름_막힘 | 같은질문_반복 | 말투_희망부족 | 말투_어려움 | 한국어_어색 | 안전_법정보 | 개인정보 | 화면_안내 | 기타
- severity: high(손님이 떠나거나 틀린 판단을 할 만함) | medium(불편·불신) | low(다듬을 점)
출력은 JSON 객체 하나만: {"scores": {"values": 1-5, "listening": 1-5, "hope": 1-5, "clarity": 1-5, "flow": 1-5}, "findings": [{"category": "...", "severity": "...", "where": "첫 문장|채운 값|질문|AI 답|사업 방향|방향 뒤 고치기|화면 안내|오류", "quote": "...", "problem": "...", "impact": "..."}], "good": ["잘한 점 1~2개"]}`;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const clip = (s: unknown, n = 600) => { const t = typeof s === "string" ? s : JSON.stringify(s ?? ""); return t.length > n ? t.slice(0, n) + "…" : t; };
const designView = (d: any) => d ? { headline: d.identity?.headline ?? d.headline, pitch: d.identity?.pitch ?? d.pitch, names: d.identity?.names ?? d.names, startingPlan: d.startingPlan ?? null, alternatives: d.alternatives ?? null, assumptions: d.assumptions ?? null, nextAction: d.nextAction ?? null, direction: d.direction ?? d.summary ?? null, risks: d.risks ?? d.checks ?? null } : null;

async function runPersona(p: Persona, index: number) {
  let cookie = "";
  const ip = `10.40.${index + 1}.${(Date.now() % 200) + 1}`;
  const events: Array<Record<string, unknown>> = [];
  const mech: Record<string, any> = { httpErrors: [], jobFailures: [], conflicts: 0, understand: null, designs: 0, repeatedQuestions: [], hints: [], stuck: false, guestLimit: false };
  const t0 = Date.now();
  const req = async (method: string, path: string, body?: unknown, extra: Record<string, string> = {}, timeoutMs = 60_000) => {
    const started = Date.now(); const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await fetch(origin + path, { method, signal: ac.signal, redirect: "manual", headers: { "content-type": "application/json", "x-business-intake": "2", origin, "x-forwarded-for": ip, ...(cookie ? { cookie } : {}), ...extra }, body: body ? JSON.stringify(body) : undefined });
      for (const c of r.headers.getSetCookie?.() ?? []) { const kv = c.split(";")[0]; const k = kv.split("=")[0]; cookie = [...cookie.split("; ").filter(x => x && !x.startsWith(k + "=")), kv].join("; "); }
      const text = await r.text(); let json: any = null; try { json = JSON.parse(text); } catch { /* stream */ }
      return { status: r.status, json, text, ms: Date.now() - started };
    } catch (error) { return { status: 0, json: null, text: String(error), ms: Date.now() - started }; } finally { clearTimeout(timer); }
  };
  let plan: any = null; let pendingCheck: any = null; let serverError = "";
  const refresh = async () => { if (!plan) return; const g = await req("GET", `/api/plan/chat?planId=${encodeURIComponent(plan.planId)}`); if (g.json?.plan) plan = g.json.plan; };
  const cmd = async (body: Record<string, unknown>, retry = true): Promise<any> => {
    const res = await req("POST", "/api/plan/chat", { ...body, ...(plan ? { planId: plan.planId, revision: plan.coach?.revision ?? 0 } : { revision: 0 }), requestId: randomUUID() });
    if (res.json?.plan) plan = res.json.plan;
    if (res.status === 409 && retry) { mech.conflicts++; await refresh(); return cmd(body, false); }
    /* 화면처럼 — 금액 확인은 [맞아요] 카드로, 업종 확인은 저장본을 다시 깔아 [바꾸기]/[그대로 둘게요] 카드로 보인다(BusinessIntake send) */
    if (res.status === 422 && res.json?.code === "amount_check" && body.action === "answer") { pendingCheck = { questionId: body.questionId, value: body.value ?? null, prompt: res.json.message }; events.push({ kind: "check", code: "amount_check", message: res.json.message }); return res; }
    if (res.status === 422 && res.json?.code === "sector_check") { if (res.json?.plan) plan = res.json.plan; else await refresh(); events.push({ kind: "check", code: "sector_check", message: res.json.message }); return res; }
    if (res.status >= 400 || res.status === 0) {
      serverError = String(res.json?.message ?? res.json?.error ?? "요청을 처리하지 못했어요. 입력은 그대로 남아 있어요.");
      mech.httpErrors.push({ action: body.action, status: res.status, body: clip(res.text, 300) });
      if (/guest|limit|한도/i.test(res.text) && res.status === 429) mech.guestLimit = true;
      events.push({ kind: "server-error", action: body.action, status: res.status, message: clip(res.json?.error ?? res.json?.message ?? res.text, 300) });
    }
    return res;
  };
  const waitJob = async () => {
    const started = Date.now();
    for (let i = 0; i < 120; i++) { const job = plan?.intake?.job; if (!job || !["queued", "running"].includes(job.status)) break; await sleep(1500); await refresh(); }
    const job = plan?.intake?.job;
    if (job && ["queued", "running"].includes(job.status)) { mech.jobFailures.push({ kind: job.kind, status: "timeout-180s" }); events.push({ kind: "server-error", action: job.kind, message: "AI 작업이 3분 넘게 끝나지 않음" }); }
    else if (job?.status === "failed") { mech.jobFailures.push({ kind: job.kind, error: job.error }); events.push({ kind: "server-error", action: job.kind, message: `AI 작업 실패: ${job.error ?? ""}` }); }
    return Date.now() - started;
  };
  let understandAsked = false; let liveComment = ""; let suggestions: any = null; let hint = ""; let entryConfirm: string | null = null;
  const sectorCard = () => plan?.sectorSuggestion && !plan.hasDocuments && plan.nextQuestion && !["industry", "business"].includes(plan.nextQuestion.id) ? plan.sectorSuggestion : null;
  const answeredIds = new Set<string>();
  const sideCalls = async (text: string, mode: string) => {
    const c = await req("POST", "/api/plan/chat/comment", { text }, {}, 30_000);
    liveComment = c.text.split("\n").map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean).filter((e: any) => e.type === "delta").map((e: any) => e.text).join("");
    if (mode === "startup" || mode === "operating") { const s = await req("POST", "/api/plan/chat/suggestions", { text, stage: mode, ...(plan ? { planId: plan.planId } : {}) }, {}, 30_000); suggestions = s.json?.suggestions ?? null; }
  };
  /* 화면이 하는 일 — 첫 문장 읽기 · 사업 방향 자동 정리 */
  const settle = async () => {
    await waitJob();
    const understandable = plan && !plan.hasDocuments && plan.intake.mode === "startup" && plan.intake.depth !== "expert" && plan.coach?.depth !== "expert" && !plan.intake.understood && plan.intake.answers.business?.status === "answered";
    if (understandable && !understandAsked) {
      understandAsked = true;
      const u = await req("POST", "/api/plan/chat/understand", { planId: plan.planId }, {}, 8_000);
      mech.understand = { status: u.status, ms: u.ms, body: clip(u.json ?? u.text, 300) };
      await refresh();
    }
    for (let i = 0; i < 2; i++) {
      if (!plan || plan.intake.job && ["queued", "running"].includes(plan.intake.job.status)) break;
      const step = model.intakeNextStep(plan);
      if (step !== "design" || plan.intake.job?.kind === "design" && plan.intake.job.status === "failed") break;
      const r = await cmd({ action: "design" }); mech.designs++;
      if (r.status === 202 || r.status === 200) await waitJob(); else break;
      events.push({ kind: "design", design: designView(plan?.coach?.design) });
    }
  };
  const questionOf = (q: any) => q?.id === "candidate" ? { ...q, options: (plan.candidateIdeas ?? []).map((i: any) => ({ value: i.id, label: i.title })) } : q;
  const chips = (suffix: string) => (plan?.questions ?? []).flatMap((q: any) => {
    const a = plan.intake.answers[q.id];
    if (!a?.messageId?.endsWith(suffix) || a.status !== "answered") return [];
    const opt = q.options?.find((o: any) => o.value === a.value)?.label;
    const shown = opt ?? (typeof a.quote === "string" && a.quote ? a.quote : Array.isArray(a.value) ? a.value.join(", ") : `${a.value ?? ""}`);
    return [`${q.label}: ${/^\d[\d,]*$/.test(shown) ? shown + (q.unit ?? "") : shown}`];
  });
  const directionShown = () => !!plan?.coach?.design && ["prepare", "open"].includes(model.intakeNextStep(plan));
  /* 화면(readTypedAnswer)처럼 — 규칙이 깔끔하게 못 읽은 질문 답은 작은 AI가 읽는다. 넣었으면 true(다음 행동으로), 아니면 false(예전 규칙 처리로) */
  const readTyped = async (q: any, text: string, route: any): Promise<boolean> => {
    const readable = READER_KEYS.has(q.fieldKey ?? q.id) && plan.intake.depth !== "expert" && plan.coach?.depth !== "expert" && !plan.hasDocuments && !(route.kind === "clarify" && !route.suggested && model.looseUnknownReply(text));
    const periodTyped = route.kind === "answer" && q.id === "period" && !/^\s*\d{4}-\d{2}-\d{2}\s*\/\s*\d{4}-\d{2}-\d{2}\s*$/.test(text);
    if (!readable || !(periodTyped || route.kind === "invalid" || route.kind === "clarify" || route.kind === "note" && route.intent === "question")) return false;
    const r = await req("POST", "/api/plan/chat/read", { planId: plan.planId, message: text, asking: q.fieldKey ?? q.id, show: true }, {}, 9_000);
    mech.reads = (mech.reads ?? 0) + 1;
    if (r.status === 200 && (r.json?.applied ?? 0) > 0) {
      await refresh();
      if (plan.nextQuestion?.id === q.id && plan.intake.answers[q.id]?.status !== "answered") { hint = model.easyNumberRetryHint(q) || `${q.label}에 맞는 답을 한 번 더 적어 주세요.`; mech.hints.push(`after read ${q.id}`); }
      if (r.json?.asks) await cmd({ action: "help", message: text });
      return true;
    }
    if (r.status === 200 && r.json?.intent === "question") {
      await cmd({ action: "note", message: text, noteIntent: "question" });
      transcript.push("[화면] 질문을 저장했어요 [AI 답변 받기] 단추 → 손님 대신 누름"); await cmd({ action: "help", message: text });
      return true;
    }
    mech.readMiss = [...(mech.readMiss ?? []), { q: q.id, status: r.status, text: clip(text, 80), body: clip(r.json ?? r.text, 160) }];
    return false;
  };
  const screen = () => {
    const parts: Record<string, string> = {};
    if (!plan) { parts["첫 화면"] = entryConfirm ? `[어떤 상황인가요?] 보기: 생각한 사업이 있어요 / 사업을 운영 중이에요 / 아이디어를 찾고 있어요 (방금 쓴 글: ${entryConfirm})` : "무엇을 해 보고 싶으세요? 생각한 사업을 편하게 적어 주세요. (보기 단추: 생각한 사업이 있어요 / 사업을 운영 중이에요 / 아이디어가 없어요)"; return parts; }
    parts["대화"] = (plan.coach?.messages ?? []).slice(-16).map((m: any) => `${m.role === "user" ? "손님" : "오늘창업"}: ${clip(m.text, 700)}`).join("\n");
    if (liveComment) parts["AI 한마디"] = clip(liveComment, 700);
    const said = chips(":said"), filled = chips(":estimate");
    if (said.length) parts["이렇게 알아들었어요"] = said.join(" · ");
    if (filled.length) parts["먼저 채웠어요(눌러서 고칠 수 있음)"] = filled.join(" · ");
    const sector = sectorCard();
    if (pendingCheck) parts["확인"] = `${pendingCheck.prompt} (보기: 맞아요 / 다시 적기)`;
    else if (sector) parts["업종 확인"] = `말씀하신 사업은 '${sector.label}'에 더 가까워 보여요. 업종을 ${sector.label}(으)로 바꿀까요?\n지금 고른 업종: ${sector.current}\n보기: 바꾸기 / 그대로 둘게요`;
    else if (plan.nextQuestion) {
      const q = questionOf(plan.nextQuestion);
      parts["지금 질문"] = `${q.label} — ${q.prompt}${q.unit ? ` (단위 ${q.unit})` : ""}${q.options?.length ? `\n보기: ${q.options.map((o: any) => o.label).join(" / ")}` : ""}\n[잘 모르겠어요] 단추 · [AI에게 질문] 단추 · 입력창`;
      const sug = suggestions && (suggestions[q.id] ?? suggestions[q.fieldKey]);
      if (Array.isArray(sug) && sug.length) parts["추천 답"] = sug.map((s: any) => typeof s === "string" ? s : s.label ?? s.value).slice(0, 4).join(" / ");
    }
    if (plan.coach?.design) parts["사업 방향 카드"] = clip(designView(plan.coach.design), 2200) + (directionShown() ? "\n[사업계획서 만들기] 단추 — 로그인하면 첫 항목을 바로 볼 수 있어요" : "\n(옛 기준 — 다시 정리 중)");
    if (!plan.nextQuestion && !plan.coach?.design) parts["다음"] = `질문 없음 · 다음 단계: ${model.intakeNextStep(plan)}`;
    if (hint) parts["입력창 위 안내"] = hint;
    if (serverError) parts["오류 안내"] = serverError;
    return parts;
  };
  let lastParts: Record<string, string> = {};
  const transcript: string[] = [];
  const logScreen = (parts: Record<string, string>) => {
    for (const [k, v] of Object.entries(parts)) {
      if (k === "대화") { const prev = lastParts[k] ?? ""; const lines = v.split("\n").filter(l => !prev.includes(l)); if (lines.length) transcript.push(`[화면·새 대화]\n${lines.join("\n")}`); }
      else if (lastParts[k] !== v) transcript.push(`[화면·${k}] ${v}`);
    }
    lastParts = parts;
  };
  const history: string[] = [];
  let actions = 0, afterDirection = 0; let ended = "";
  while (actions < MAX_ACTIONS) {
    await settle();
    const parts = screen(); logScreen(parts);
    if (directionShown() && afterDirection >= MAX_AFTER_DIRECTION) { ended = "방향 뒤 3번 대화"; break; }
    const user = `[인물] ${p.who}\n[하고 싶은 것] ${p.idea}\n[말투·성격] ${p.style}\n[방향 뒤 행동] ${p.after}\n\n[네가 지금까지 한 일]\n${history.slice(-8).join("\n") || "(처음)"}\n\n=== 지금 화면 ===\n${Object.entries(parts).map(([k, v]) => `[${k}]\n${v}`).join("\n\n")}`;
    const out = await completeJson(llm, { system: CUSTOMER_RULES, user, maxOutputTokens: 700, effort: "low", kind: "sweep-customer", timeoutMs: 90_000 }).catch(() => null) as any;
    if (!out?.action) { ended = "손님 AI 응답 없음"; break; }
    actions++; hint = ""; serverError = "";
    const a = { action: String(out.action), text: typeof out.text === "string" ? out.text : "", options: Array.isArray(out.options) ? out.options.map(String) : [], field: typeof out.field === "string" ? out.field : "" };
    transcript.push(`[손님 속마음] ${out.thought ?? ""}\n[손님 행동] ${a.action}${a.text ? ` "${a.text}"` : ""}${a.options.length ? ` 보기=${a.options.join(",")}` : ""}${a.field ? ` 칸=${a.field}` : ""}`);
    history.push(`${a.action}${a.text ? `: ${a.text}` : ""}${a.options.length ? `: ${a.options.join(",")}` : ""} (속마음: ${clip(out.thought, 120)})`);
    if (directionShown()) afterDirection++;
    if (a.action === "quit") { ended = "손님이 끝냄"; break; }
    if (a.action === "make_plan") { ended = "사업계획서 만들기(로그인 필요)"; break; }
    // 첫 화면
    if (!plan) {
      const text = a.text || a.options[0] || "";
      if (entryConfirm) {
        const mode = /운영/.test(text) ? "operating" : /아이디어/.test(text) ? "exploring" : "startup";
        await cmd(model.confirmedEntryCommand(mode, entryConfirm)); await sideCalls(entryConfirm, mode); entryConfirm = null; continue;
      }
      if (a.action === "choose") { const mode = /운영/.test(text) ? "operating" : /아이디어/.test(text) ? "exploring" : "startup"; await cmd({ action: "start", mode }); continue; }
      const entry = model.entrySubmission(text);
      if (entry.kind === "confirm") { entryConfirm = text; continue; }
      await cmd(entry.command); await sideCalls(text, entry.command.mode);
      if (!plan) { ended = "시작 실패"; break; }
      continue;
    }
    if (pendingCheck) {
      if (a.action === "choose" && /맞/.test(a.options.join() + a.text)) await cmd({ action: "answer", questionId: pendingCheck.questionId, value: pendingCheck.value, confirmed: true });
      pendingCheck = null; if (a.action === "choose") continue;
    }
    const sector = sectorCard();
    if (sector && a.action === "choose") {
      if (/바꾸/.test(a.options.join() + a.text)) await cmd({ action: "answer", questionId: "industry", value: sector.sector });
      else await cmd({ action: "sector-keep" });
      continue;
    }
    const q = plan.nextQuestion ? questionOf(plan.nextQuestion) : null;
    if (a.action === "ask_ai") { await cmd({ action: "help", message: a.text || "?" }); continue; }
    if (a.action === "fix") {
      const target = (plan.questions ?? []).find((x: any) => x.label === a.field || x.id === a.field || (a.field && (x.label.includes(a.field) || a.field.includes(x.label))));
      if (!target) { transcript.push(`[도구] 고칠 칸 '${a.field}'을 찾지 못함`); continue; }
      const text = target.kind === "number" || target.id === "budget" || target.id === "hoursPerWeek" ? koreanNumeralsToDigits(a.text) : a.text;
      const route = model.routeComposerInput(plan, target, text);
      if (await readTyped(target, a.text, route)) continue;
      if (route.kind === "answer") await cmd({ action: "answer", questionId: target.id, value: route.value, ...(route.unknown ? { unknown: true } : {}) });
      else if (route.kind === "invalid") { hint = route.hint; mech.hints.push(hint); }
      else if (route.kind === "clarify" && route.suggested) await cmd({ action: "answer", questionId: target.id, value: route.suggested.value, message: a.text });
      else { hint = "(고치기 입력이 답으로 저장되지 않음)"; mech.hints.push(`fix ${target.id}: ${route.kind}`); }
      continue;
    }
    if (q) {
      if (a.action === "unknown") { await cmd({ action: "answer", questionId: q.id, value: null, unknown: true }); answeredIds.add(q.id); continue; }
      if (a.action === "choose") {
        const picked = a.options.map(label => q.options?.find((o: any) => o.label === label || o.value === label || o.label.includes(label) || label.includes(o.label))?.value).filter(Boolean);
        if (!picked.length) { transcript.push(`[도구] 보기 '${a.options.join(",")}'를 찾지 못함`); continue; }
        if (answeredIds.has(q.id)) mech.repeatedQuestions.push(q.id);
        /* 화면처럼 — 보기 칩 질문(kind text + 보기)은 고른 칩을 단계 순서로 묶은 글 하나로 보낸다(assembleHybridText) */
        const value = model.isHybridQuestion(q) ? model.assembleHybridText(q, picked) : q.kind === "multi" ? picked : picked[0];
        await cmd({ action: "answer", questionId: q.id, value }); answeredIds.add(q.id); continue;
      }
      const text = a.text.trim(); if (!text) continue;
      if (answeredIds.has(q.id)) mech.repeatedQuestions.push(q.id);
      if (q.id === "industry" && plan.coach?.depth !== "expert") {
        const k = await req("GET", `/api/plan/chat?ksic=${encodeURIComponent(text)}`);
        const first = Array.isArray(k.json?.ksicCandidates) ? k.json.ksicCandidates[0] : null;
        const other = q.options?.find((o: any) => o.label.includes("기타"));
        if (first?.sector) await cmd({ action: "answer", questionId: "industry", value: first.sector, ksic: first.code, message: text });
        else if (other) await cmd({ action: "answer", questionId: "industry", value: other.value, message: text });
        else { hint = "업종을 찾지 못했어요. 아래 보기에서 골라 주세요."; mech.hints.push(hint); }
        answeredIds.add(q.id); continue;
      }
      let routed = text;
      if (q.kind === "number" || q.id === "budget" || q.id === "hoursPerWeek") { routed = koreanNumeralsToDigits(text); if (q.id === "budget" && routed !== text && !/[원만억천]/.test(routed)) routed = routed.replace(/(\d{1,4})(?!\d)/, "$1만원"); }
      const route = model.routeComposerInput(plan, q, routed);
      if (await readTyped(q, text, route)) { answeredIds.add(q.id); continue; }
      if (route.kind === "invalid") { hint = route.hint; mech.hints.push(hint); continue; }
      if (route.kind === "clarify") {
        if (route.suggested) await cmd({ action: "answer", questionId: q.id, value: route.suggested.value, message: text });
        else if (model.looseUnknownReply(text)) await cmd({ action: "answer", questionId: q.id, value: null, unknown: true });
        else { await cmd({ action: "note", message: text, noteIntent: "memo" }); hint = model.easyNumberRetryHint(q) || "(적은 말은 메모로만 저장되고 같은 질문이 그대로 남음)"; mech.hints.push(`memo on ${q.id}`); }
        answeredIds.add(q.id); continue;
      }
      if (route.kind === "note") {
        await cmd({ action: "note", message: text, noteIntent: route.intent });
        if (route.intent === "question") { transcript.push("[화면] 질문을 저장했어요 [AI 답변 받기] 단추 → 손님 대신 누름"); await cmd({ action: "help", message: text }); }
        else { hint = "(메모로 저장됨)"; }
        continue;
      }
      const check = !route.unknown && route.questionId === q.id ? model.answerCheckPrompt(q, route.value) : null;
      if (check) { pendingCheck = { questionId: route.questionId, value: route.value, prompt: check }; continue; }
      if (route.questionId === "business" && typeof route.value === "string") void sideCalls(route.value, plan.intake.mode);
      await cmd({ action: "answer", questionId: route.questionId, value: route.value, ...(route.unknown ? { unknown: true } : {}) }); answeredIds.add(q.id);
      continue;
    }
    // 질문이 없을 때 — 사업 방향을 본 뒤면 화면의 대화창(sendStudioChat)과 같다
    const text = a.text.trim(); if (!text) continue;
    if (plan.intake.mode === "exploring" && !plan.coach?.design) { await cmd({ action: "ideas", message: text }); continue; }
    // 화면(sendStudioChat)처럼 — 계획서 전 · 방향을 본 뒤에는 무엇이든 서버로(AI가 답할지 · 바꿀지 정한다)
    if (directionShown() && !plan.hasDocuments) { await cmd({ action: "edit", message: text }); continue; }
    if (model.isConsultationText(text)) { await cmd({ action: "help", message: text }); continue; }
    await cmd({ action: "note", message: text, noteIntent: "memo" });
  }
  if (!ended) { ended = `행동 ${MAX_ACTIONS}번 넘음`; mech.stuck = !directionShown(); }
  await settle(); logScreen(screen());
  const fields = (plan?.coach?.fields ?? []).map((f: any) => ({ key: f.key, value: f.value, basis: f.basis }));
  const price = Number(plan?.intake?.answers?.price?.value), unit = Number(plan?.intake?.answers?.["structure.unitCost"]?.value);
  if (price > 0 && unit >= price) mech.costAbovePrice = { price, unit };
  mech.reachedDirection = !!plan?.coach?.design; mech.ended = ended; mech.actions = actions; mech.ms = Date.now() - t0; mech.mode = plan?.intake?.mode ?? null;
  return { id: p.id, persona: p, mech, fields, transcript: transcript.join("\n"), finalDesign: designView(plan?.coach?.design), events };
}

async function judge(r: any) {
  const user = `[손님 인물] ${r.persona.who} / 하고 싶은 것: ${r.persona.idea} / 말투: ${r.persona.style}\n[기계 점검] ${JSON.stringify(r.mech)}\n[마지막 채운 값] ${JSON.stringify(r.fields)}\n\n[대화 기록]\n${r.transcript}`;
  return await completeJson(llm, { system: JUDGE_RULES, user, maxOutputTokens: 4000, effort: "medium", kind: "sweep-judge", timeoutMs: 180_000 }).catch(() => null);
}

const list = PERSONAS.filter(p => !only || only === "all" || only.split(",").includes(p.id));
let next = 0;
const results: any[] = [];
async function worker() {
  while (next < list.length) {
    const i = next++; const p = list[i];
    const file = `${outDir}/${p.id}.json`;
    if (existsSync(file)) { results.push(JSON.parse(readFileSync(file, "utf8"))); continue; }
    let r: any;
    try { r = await runPersona(p, PERSONAS.indexOf(p)); } catch (error) { r = { id: p.id, persona: p, mech: { crashed: String(error) }, transcript: "", fields: [] }; }
    r.judge = r.transcript ? await judge(r) : null;
    writeFileSync(file, JSON.stringify(r, null, 1));
    writeFileSync(`${outDir}/${p.id}.txt`, `${p.id} ${p.who}\n${JSON.stringify(r.mech)}\n\n${r.transcript}\n\n[심사]\n${JSON.stringify(r.judge, null, 1)}`);
    results.push(r);
    console.log(JSON.stringify({ id: p.id, ended: r.mech?.ended, direction: r.mech?.reachedDirection, actions: r.mech?.actions, sec: Math.round((r.mech?.ms ?? 0) / 1000), errors: r.mech?.httpErrors?.length, findings: r.judge?.findings?.length ?? null, scores: r.judge?.scores ?? null }));
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
writeFileSync(`${outDir}/_all.json`, JSON.stringify(results.map(r => ({ id: r.id, mech: r.mech, scores: r.judge?.scores, findings: r.judge?.findings })), null, 1));
console.log("done", results.length);
