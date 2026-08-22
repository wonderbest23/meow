/*
 * BEFORE/AFTER 비교 — Context 주입 전후의 섹션 생성 품질.
 *
 * 실행:
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/plan-context-compare.ts            # 실제 생성 + 심사
 *   npx tsx scripts/plan-context-compare.ts --prompts-only                      # 프롬프트만 덤프 (키 없이)
 *
 * 결과: docs/compare/<사업>-<섹션>.md (BEFORE · AFTER · 심사 결과)
 * 테스트 전용이다 — 심사 프롬프트는 운영 기능이 아니고 사용자에게 노출하지 않는다.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PLAN_BLUEPRINT } from "../lib/plan-builder/blueprint";
import { formatContext, generateSection, sectionSystemPrompt, type SectionGenInput } from "../lib/plan-builder/section-generator";
import { buildPlanBusinessContext } from "../lib/plan-builder/context/build";
import { contextForSection } from "../lib/plan-builder/context/section";
import { ANALYSIS_KEY, normalizeAnalysis, type AnalysisRecord } from "../lib/plan-builder/analyzer/domain";
import { completeJson, type LLMConfig } from "../lib/llm/complete";

type Answers = Record<string, Record<string, unknown>>;

interface Case {
  id: string;
  business: { name: string; description: string; industry: string; region: string; stage: string; role: string };
  analysis: Parameters<typeof normalizeAnalysis>[0];
  slots: AnalysisRecord["slots"];
  answers: Answers;
  sections: string[];
}

const CASES: Case[] = [
  {
    id: "A-class",
    business: { name: "멍케이크 클래스", description: "반려견 케이크 만드는 과정을 SNS에 올려 사람들을 모집하고 원데이 클래스를 운영한다.", industry: "교육·강의", region: "서울 마포구", stage: "아이디어 단계", role: "예비창업자" },
    analysis: {
      primary: { value: "교육·강의", status: "confirmed" }, modelTags: { value: ["class"], status: "confirmed" },
      operationTags: { value: ["offline", "b2c", "reservation", "pet", "content_led", "made_to_order"], status: "inferred" },
      customer: { value: "반려견 보호자", status: "confirmed" }, problem: { value: "기념일에 직접 만들어주고 싶지만 방법을 모름", status: "confirmed" },
      solution: { value: "반려견 케이크 원데이 클래스", status: "confirmed" }, revenueModel: { value: "클래스 수강료", status: "confirmed" },
      deliveryModel: { value: "오프라인 대면 · 예약제", status: "inferred" }, acquisitionChannels: { value: ["인스타그램", "유튜브 숏폼"], status: "confirmed" },
      keyCosts: { value: ["공간 대관", "재료비"], status: "inferred" }, stage: { value: "아이디어 단계", status: "confirmed" }, region: { value: "서울 마포구", status: "confirmed" },
      gapHints: [], summaryForUser: "반려견 보호자를 대상으로 SNS 콘텐츠로 모객해 원데이 클래스를 운영하는 사업으로 이해했어요.",
    },
    slots: { classPrice: { value: "5만원", status: "confirmed" }, seatsPerClass: { value: "6명", status: "confirmed" }, classesPerMonth: { value: "8회", status: "confirmed" }, venueType: { value: "필요할 때 시간제로 빌림", status: "confirmed" }, materialCost: { value: "1만5천원", status: "confirmed" }, differentiator: { value: null, status: "unknown" } },
    answers: {
      "overview/summary": { value_prop: "과정을 먼저 보여주고 결과물을 직접 만들어 가는 경험" },
      "market/segments": { first_target: "반려견 보호자" }, "overview/problem": { problems: ["기념일에 직접 만들어주고 싶지만 방법을 모름"], solutions: ["반려견 케이크 원데이 클래스"] },
      "market/products": { main_offer: "반려견 케이크 원데이 클래스" }, "strategy/promotion": { promo_channels: ["인스타그램", "유튜브·숏폼"] },
      "financials/revenue": { unit_price: "5만원", monthly_volume: "월 40건", revenue_streams: ["시간·건당 요금"] }, "financials/expenses": { variable_per_unit: "18,000원", fixed_total: "500,000원" },
    },
    sections: ["overview/summary", "strategy/promotion"],
  },
  {
    id: "B-commerce",
    business: { name: "오피스룩 마켓", description: "30~40대 직장인 여성을 대상으로 출근용 여성 의류를 온라인으로 판매한다.", industry: "온라인 쇼핑몰", region: "전국", stage: "준비 중(개업 전)", role: "예비창업자" },
    analysis: {
      primary: { value: "온라인 쇼핑몰", status: "confirmed" }, modelTags: { value: ["commerce"], status: "confirmed" },
      operationTags: { value: ["online", "b2c", "inventory", "fashion", "ads_led"], status: "inferred" },
      customer: { value: "30~40대 직장인 여성", status: "confirmed" }, problem: { value: null, status: "unknown" },
      solution: { value: "출근용 여성 의류 온라인 판매", status: "confirmed" }, revenueModel: { value: "상품 판매", status: "confirmed" },
      deliveryModel: { value: "택배 배송", status: "inferred" }, acquisitionChannels: { value: ["인스타그램 광고"], status: "inferred" },
      keyCosts: { value: ["상품 매입", "광고비", "배송비"], status: "inferred" }, stage: { value: "준비 중", status: "confirmed" }, region: { value: "전국", status: "confirmed" },
      gapHints: [], summaryForUser: "30~40대 직장인 여성에게 출근용 의류를 온라인으로 파는 사업으로 이해했어요.",
    },
    slots: { aov: { value: "6만원", status: "confirmed" }, monthlyVisitors: { value: "3,000명", status: "confirmed" }, conversionRate: { value: "2명 (2%)", status: "confirmed" }, cogs: { value: "2만5천원", status: "confirmed" }, problem: { value: null, status: "unknown" } },
    answers: {
      "overview/summary": { value_prop: "출근복만 골라 놓아 고르는 시간을 줄인다" }, "market/segments": { first_target: "30~40대 직장인 여성" },
      "market/products": { main_offer: "출근용 여성 의류" }, "financials/revenue": { unit_price: "6만원", monthly_volume: "월 60건", revenue_streams: ["1회성 판매"] },
      "financials/expenses": { variable_per_unit: "30,000원", fixed_total: "400,000원" },
    },
    sections: ["overview/summary", "market/products"],
  },
  {
    id: "C-nail",
    business: { name: "원룸네일", description: "1인 네일샵을 열어 예약제로 운영하고 인스타그램으로 고객을 모집한다.", industry: "서비스·용역", region: "부산 해운대구", stage: "준비 중(개업 전)", role: "예비창업자" },
    analysis: {
      primary: { value: "서비스·용역", status: "confirmed" }, modelTags: { value: ["service_hour"], status: "confirmed" },
      operationTags: { value: ["offline", "b2c", "reservation", "beauty", "owner_only", "content_led"], status: "inferred" },
      customer: { value: null, status: "unknown" }, problem: { value: null, status: "unknown" },
      solution: { value: "1인 네일샵 예약제 시술", status: "confirmed" }, revenueModel: { value: "시술 건당 요금", status: "confirmed" },
      deliveryModel: { value: "매장 방문 · 예약제", status: "confirmed" }, acquisitionChannels: { value: ["인스타그램"], status: "confirmed" },
      keyCosts: { value: ["임대료", "재료비"], status: "inferred" }, stage: { value: "준비 중", status: "confirmed" }, region: { value: "부산 해운대구", status: "confirmed" },
      gapHints: [], summaryForUser: "예약제로 운영하는 1인 네일샵을 인스타그램으로 모객하는 사업으로 이해했어요.",
    },
    slots: { unitPrice: { value: "4만5천원", status: "confirmed" }, monthlyVolume: { value: "월 80건", status: "confirmed" }, unitCost: { value: "5천원", status: "confirmed" }, fixedTotal: { value: "90만원", status: "confirmed" }, customer: { value: null, status: "unknown" } },
    answers: {
      "overview/summary": { value_prop: "1인 예약제라 기다림 없이 조용히 받는 시술" }, "market/products": { main_offer: "젤네일 기본 시술" },
      "strategy/distribution": { delivery: "매장 방문 · 예약제" }, "financials/revenue": { unit_price: "4만5천원", monthly_volume: "월 80건", revenue_streams: ["시간·건당 요금"] },
      "financials/expenses": { variable_per_unit: "5천원", fixed_total: "90만원" },
    },
    sections: ["overview/summary", "strategy/distribution"],
  },
  {
    id: "D-saas",
    business: { name: "사장님장부", description: "소규모 음식점 사장이 매출과 원가를 쉽게 기록할 수 있는 월 구독형 관리 서비스를 만든다.", industry: "IT·앱·웹", region: "전국", stage: "아이디어 단계", role: "예비창업자" },
    analysis: {
      primary: { value: "IT·앱·웹", status: "confirmed" }, modelTags: { value: ["subscription"], status: "confirmed" },
      operationTags: { value: ["online", "b2b", "no_inventory", "it", "food", "search_led"], status: "inferred" },
      customer: { value: "소규모 음식점 사장", status: "confirmed" }, problem: { value: "매출·원가 기록이 번거로움", status: "confirmed" },
      solution: { value: "월 구독형 매출·원가 기록 서비스", status: "confirmed" }, revenueModel: { value: "월 구독료", status: "confirmed" },
      deliveryModel: { value: "웹·앱", status: "inferred" }, acquisitionChannels: { value: null, status: "unknown" },
      keyCosts: { value: ["개발 인건비", "서버"], status: "inferred" }, stage: { value: "아이디어 단계", status: "confirmed" }, region: { value: "전국", status: "confirmed" },
      gapHints: [], summaryForUser: "소규모 음식점 사장을 위한 월 구독형 매출·원가 기록 서비스로 이해했어요.",
    },
    slots: { unitPrice: { value: "월 1만9천원", status: "confirmed" }, monthlyVolume: { value: null, status: "unknown" }, unitCost: { value: null, status: "unknown" }, fixedTotal: { value: "150만원", status: "confirmed" } },
    answers: {
      "overview/summary": { value_prop: "사진 한 장으로 그날 매출과 재료비를 기록" }, "market/segments": { first_target: "소규모 음식점 사장" },
      "overview/problem": { problems: ["매출·원가 기록이 번거로움"] }, "financials/revenue": { unit_price: "월 1만9천원", revenue_streams: ["정기 구독·회원"] }, "financials/expenses": { fixed_total: "150만원" },
    },
    sections: ["overview/summary", "financials/revenue"],
  },
  {
    id: "E-furniture",
    business: { name: "카페가구공방", description: "소형 카페를 대상으로 공간에 맞춘 주문제작 가구를 제작·납품한다.", industry: "제조·생산", region: "경기 파주시", stage: "운영 중", role: "사업자(운영 중)" },
    analysis: {
      primary: { value: "제조·생산", status: "confirmed" }, modelTags: { value: ["unit_sale"], status: "confirmed" },
      operationTags: { value: ["b2b", "made_to_order", "craft", "visit", "referral_led"], status: "inferred" },
      customer: { value: "소형 카페 운영자", status: "confirmed" }, problem: { value: "기성 가구가 좁은 공간에 맞지 않음", status: "inferred" },
      solution: { value: "공간 맞춤 주문제작 가구 제작·납품", status: "confirmed" }, revenueModel: { value: "주문 건당 판매", status: "confirmed" },
      deliveryModel: { value: "직접 제작 후 현장 납품·설치", status: "inferred" }, acquisitionChannels: { value: null, status: "unknown" },
      keyCosts: { value: ["목재·자재", "공방 임대", "운송"], status: "inferred" }, stage: { value: "운영 중", status: "confirmed" }, region: { value: "경기 파주시", status: "confirmed" },
      gapHints: [], summaryForUser: "소형 카페에 공간 맞춤 가구를 주문 제작해 납품하는 사업으로 이해했어요.",
    },
    slots: { unitPrice: { value: "180만원", status: "confirmed" }, monthlyVolume: { value: "월 4건", status: "confirmed" }, unitCost: { value: "70만원", status: "confirmed" }, fixedTotal: { value: "120만원", status: "confirmed" } },
    answers: {
      "overview/summary": { value_prop: "카페 동선과 좌석 수에 맞춘 치수 설계", established: "yes", revenue: "yes" }, "market/segments": { first_target: "소형 카페 운영자" },
      "market/products": { main_offer: "카페 맞춤 테이블·바 세트" }, "financials/revenue": { unit_price: "180만원", monthly_volume: "월 4건", revenue_streams: ["1회성 판매"] },
      "financials/expenses": { variable_per_unit: "70만원", fixed_total: "120만원" },
    },
    sections: ["overview/summary", "market/competitors"],
  },
];

const JUDGE_SYSTEM = [
  "당신은 사업계획서 심사위원입니다. 같은 입력으로 쓴 두 글(A, B)을 비교합니다. 어느 쪽이 Context 를 받았는지 모릅니다.",
  "아래 기준으로 각 항목에 A 또는 B 또는 '같음'을 고르고, 마지막에 근거 없는 문장·숫자 환각이 있으면 인용하세요.",
  "기준: 1 사업 특화도 2 범용문장 적음 3 고객 정의 일관성 4 수익모델 일관성 5 운영방식 일관성 6 근거 없는 주장 적음 7 숫자 환각 없음 8 중복 문장 적음 9 실제 사업계획서처럼 읽힘",
  "길이가 길다는 이유로 우위를 주지 마세요.",
  'JSON 만: {"winner":"A"|"B"|"tie","criteria":{"1":"A|B|tie",...,"9":...},"hallucinations":{"A":[...],"B":[...]},"note":"한 줄"}',
].join("\n");

async function main() {
  const promptsOnly = process.argv.includes("--prompts-only");
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  const config: LLMConfig | null = key && !promptsOnly ? { provider: "anthropic", apiKey: key, model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5" } : null;
  if (!config) console.log("LLM 키 없음 — 프롬프트만 덤프합니다 (BEFORE/AFTER 생성은 ANTHROPIC_API_KEY 가 있어야 합니다)");
  mkdirSync("docs/compare", { recursive: true });

  const summary: string[] = [];
  for (const c of CASES) {
    const analysis = normalizeAnalysis(c.analysis)!;
    const record: AnalysisRecord = { analysis, slots: c.slots, rounds: 2, finished: true, analyzedAt: "2026-08-22T00:00:00Z" };
    const answers: Answers = { ...c.answers, [ANALYSIS_KEY]: record as unknown as Record<string, unknown> };
    const ctx = buildPlanBusinessContext({ business: c.business, answers });

    for (const key of c.sections) {
      const [chId, secId] = key.split("/");
      const chapter = PLAN_BLUEPRINT.find((x) => x.id === chId)!;
      const section = chapter.sections.find((x) => x.id === secId)!;
      const base: SectionGenInput = { chapter, section, answers: answers[key] ?? {}, business: c.business, planType: "창업 초기 · 사업계획서", planTitle: c.business.name };
      const before: SectionGenInput = base;
      const after: SectionGenInput = { ...base, context: contextForSection(key, ctx), conflicts: ctx.conflicts.length ? ctx.conflicts : undefined };

      const out: string[] = [`# ${c.id} · ${key}`, "", `## 입력`, "```", c.business.description, "```", "", "## AFTER 프롬프트에 추가된 블록", "```", formatContext(after.context, {}).trim(), "```", ""];

      if (config) {
        const [b, a] = await Promise.all([generateSection(config, before), generateSection(config, after)]);
        out.push("## BEFORE (Context 없음)", "", b.markdown, "", "## AFTER (Context 주입)", "", a.markdown, "");
        // 익명 심사 — 순서를 섞는다
        const flip = (c.id.charCodeAt(0) + key.length) % 2 === 0;
        const A = flip ? a.markdown : b.markdown;
        const B = flip ? b.markdown : a.markdown;
        const verdict = await completeJson(config, { kind: "compare-judge", system: JUDGE_SYSTEM, user: `[A]\n${A}\n\n[B]\n${B}`, maxOutputTokens: 800, effort: "low" });
        const mapped = verdict ? JSON.stringify(verdict).replace(/"A"/g, flip ? '"AFTER"' : '"BEFORE"').replace(/"B"/g, flip ? '"BEFORE"' : '"AFTER"') : "(심사 실패)";
        out.push("## 심사 (익명 A/B → BEFORE/AFTER 로 환산)", "```json", mapped, "```", "", `BEFORE ${b.markdown.length}자 · AFTER ${a.markdown.length}자`);
        summary.push(`| ${c.id} | ${key} | ${b.markdown.length} | ${a.markdown.length} | ${(verdict as { winner?: string } | null)?.winner ? (flip ? { A: "AFTER", B: "BEFORE", tie: "tie" } : { A: "BEFORE", B: "AFTER", tie: "tie" })[(verdict as { winner: "A" | "B" | "tie" }).winner] : "-"} |`);
      } else {
        out.push("## BEFORE/AFTER 본문", "", "_LLM 키가 없어 생성하지 않았습니다. 프롬프트 차이만 기록._");
        out.push("", "## 시스템 프롬프트(동일 — 캐시 유지)", "```", sectionSystemPrompt(after).slice(0, 400) + " …", "```");
      }
      writeFileSync(`docs/compare/${c.id}-${secId}.md`, out.join("\n"), "utf8");
      console.log(`wrote docs/compare/${c.id}-${secId}.md`);
    }
  }
  if (summary.length) {
    writeFileSync("docs/compare/SUMMARY.md", ["| 사업 | 섹션 | BEFORE 자 | AFTER 자 | 심사 승자 |", "|---|---|---:|---:|---|", ...summary].join("\n"), "utf8");
    console.log("wrote docs/compare/SUMMARY.md");
  }
}

void main();
