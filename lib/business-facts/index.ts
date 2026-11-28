import registration from "../../data/business-facts/registration.json";
import taxType from "../../data/business-facts/tax-type.json";
import taxCalendar from "../../data/business-facts/tax-calendar.json";
import permit from "../../data/business-facts/permit.json";
import { businessFactSchema, isOfficialSource, type BusinessFact, type FactGroup } from "./schema";

export * from "./schema";

/*
 * 한국 사업 정보 자료 — 불러오기 · 검사 · 찾기(순수 함수, AI·서버·DB 를 부르지 않는다).
 * 자료 파일은 묶음마다 하나(data/business-facts/*.json). 파일 이름과 항목의 group 이 맞아야 한다.
 */

export const FACT_FILES: Record<FactGroup, unknown> = {
  registration,
  "tax-type": taxType,
  "tax-calendar": taxCalendar,
  permit,
};

export type FactIssue = { file: FactGroup | "input"; id?: string; index: number; level: "error" | "stale"; message: string };

/** 오늘 날짜(서울) — YYYY-MM-DD */
export function seoulToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * 자료를 검사한다. 모양이 틀린 항목은 쓰지 않고(issues 의 error), 다시 확인 날이 지난 확인됨 항목은 쓰되 stale 로 알린다.
 * 신뢰성 시험은 error 와 stale 이 하나라도 있으면 떨어진다.
 */
export function checkFacts(files: Partial<Record<FactGroup, unknown>>, today: string): { facts: BusinessFact[]; issues: FactIssue[] } {
  const facts: BusinessFact[] = [];
  const issues: FactIssue[] = [];
  const seen = new Set<string>();
  for (const [file, raw] of Object.entries(files) as Array<[FactGroup, unknown]>) {
    if (!Array.isArray(raw)) { issues.push({ file, index: -1, level: "error", message: "파일은 항목 배열이어야 해요" }); continue; }
    raw.forEach((item, index) => {
      const parsed = businessFactSchema.safeParse(item);
      const id = typeof (item as { id?: unknown })?.id === "string" ? (item as { id: string }).id : undefined;
      if (!parsed.success) {
        issues.push({ file, id, index, level: "error", message: parsed.error.issues.map(issue => `${issue.path.join(".") || "(항목)"}: ${issue.message}`).join(" · ") });
        return;
      }
      const fact = parsed.data;
      const problems: string[] = [];
      if (fact.group !== file) problems.push(`group(${fact.group})이 파일(${file})과 달라요`);
      if (seen.has(fact.id)) problems.push("같은 id 가 이미 있어요");
      for (const source of fact.sources) if (!isOfficialSource(source.url)) problems.push(`공식 출처가 아니에요: ${source.url}`);
      if (fact.checkedAt > today) problems.push("확인한 날이 미래예요");
      if (fact.validTo && fact.validTo < fact.validFrom) problems.push("적용 기간 끝이 시작보다 빨라요");
      if (fact.recheckBy <= fact.checkedAt) problems.push("다시 확인 날은 확인한 날보다 뒤여야 해요");
      if (fact.group === "permit" && !fact.sectors.length && !fact.ksic.length) problems.push("업종별 항목에는 sectors 나 ksic 가 있어야 해요");
      seen.add(fact.id);
      if (problems.length) { issues.push({ file, id: fact.id, index, level: "error", message: problems.join(" · ") }); return; }
      if (fact.status === "verified" && fact.recheckBy < today) issues.push({ file, id: fact.id, index, level: "stale", message: `다시 확인 날(${fact.recheckBy})이 지났어요 — 출처를 다시 열어 확인해 주세요` });
      facts.push(fact);
    });
  }
  return { facts, issues };
}

/** 지금 답에 쓸 수 있는 상태 — 초안 · 아직 시작 안 함 · 기간 끝남은 쓰지 않는다. 다시 확인 날이 지났으면 recheck */
export function factState(fact: BusinessFact, today: string): "usable" | "recheck" | "unusable" {
  if (fact.status === "draft") return "unusable";
  if (fact.validFrom > today) return "unusable";
  if (fact.validTo && fact.validTo < today) return "unusable";
  if (fact.status === "recheck" || fact.recheckBy < today) return "recheck";
  return "usable";
}

/** 띄어쓰기 · 문장부호를 걷고 소문자로 — '반찬 가게' 와 '반찬가게' 를 같게 */
export function normalizeFactText(text: string): string {
  return text.toLowerCase().normalize("NFC").replace(/[\s.,!?~·'"()[\]{}:;/\\|^ㅋㅎㅠㅜ-]+/g, "");
}

function bigrams(text: string): Set<string> {
  const out = new Set<string>();
  for (let index = 0; index < text.length - 1; index += 1) out.add(text.slice(index, index + 2));
  return out;
}

/** 두 말의 글자 두 개씩 묶음이 얼마나 겹치는지(0~1) — 한국어 질문 비교에 쓴다 */
export function questionSimilarity(a: string, b: string): number {
  const left = bigrams(normalizeFactText(a)), right = bigrams(normalizeFactText(b));
  if (!left.size || !right.size) return 0;
  let common = 0;
  for (const gram of left) if (right.has(gram)) common += 1;
  return (2 * common) / (left.size + right.size);
}

export type FactQuery = { text?: string | null; sector?: string | null; ksic?: string | null; groups?: FactGroup[] };
export type FactMatch = { fact: BusinessFact; score: number; stale: boolean; why: string[] };

/**
 * 업종과 질문으로 맞는 항목을 찾는다. 답에 쓸 수 있는 항목만, 점수 높은 순으로 limit 개.
 *  - 업종: KSIC 앞자리가 맞으면 +5, 큰 분류가 맞으면 +3. 업종이 정해진 항목인데 다른 업종이면 뺀다(반찬가게 질문에 네일숍 항목이 나오지 않게)
 *  - 말: 업종을 부르는 말이 질문에 있으면 +4(한 번만), 손님 질문 예시와 닮은 만큼 최대 +6
 *  - 영업신고·허가 항목은 업종 코드나 업종을 부르는 말이 맞아야 한다(큰 분류만으로는 안 됨)
 *  - 점수 4 미만은 버린다 — 맞는 항목이 없으면 빈 목록(AI 는 '아직 확인된 자료가 없어요'로 답한다)
 */
export function findFacts(query: FactQuery, facts: BusinessFact[], today: string, limit = 3): FactMatch[] {
  const text = normalizeFactText(query.text ?? "");
  const ksic = (query.ksic ?? "").replace(/\D/g, "");
  // '일반(general)'은 아직 업종을 모른다는 뜻 — 다른 업종으로 보지 않는다(새 대화의 기본값이라 영업신고 질문이 모두 '자료 없음'이 됐다, 2026-11-28 미리보기)
  const sector = query.sector && query.sector !== "general" ? query.sector : null;
  const matches: FactMatch[] = [];
  // 질문에 걸린 낱말 중 더 긴 낱말 안에 든 짧은 낱말은 무시한다('애견미용실'의 '미용실'로 미용실 항목이 끌려오지 않게)
  const hits = text ? [...new Set(facts.flatMap(fact => fact.keywords.map(normalizeFactText)).filter(word => word && text.includes(word)))] : [];
  const shadowed = new Set(hits.filter(word => hits.some(longer => longer.length > word.length && longer.includes(word))));
  for (const fact of facts) {
    const state = factState(fact, today);
    if (state === "unusable") continue;
    if (query.groups?.length && !query.groups.includes(fact.group)) continue;
    const why: string[] = [];
    let score = 0;
    const industrySpecific = fact.sectors.length > 0 || fact.ksic.length > 0;
    const ksicHit = !!ksic && fact.ksic.some(prefix => ksic.startsWith(prefix));
    const sectorHit = !!sector && fact.sectors.includes(sector as BusinessFact["sectors"][number]);
    if (ksicHit) { score += 5; why.push("업종 코드"); }
    else if (sectorHit) { score += 3; why.push("업종 분류"); }
    const keyword = text ? fact.keywords.find(word => { const normalized = normalizeFactText(word); return text.includes(normalized) && !shadowed.has(normalized); }) : undefined;
    if (keyword) { score += 4; why.push(`말 '${keyword}'`); }
    // 업종이 정해진 항목: 업종이 다르다고 알려졌으면(코드나 분류가 있는데 안 맞음) 말이 맞지 않는 한 뺀다
    if (industrySpecific && !ksicHit && !sectorHit && !keyword && (ksic || sector)) continue;
    // 영업신고·허가는 업종마다 다르다 — 큰 분류(동네 서비스 · 교육)만 같아서는 안 된다(속눈썹 가게에 네일숍 답, 태권도장에 과외 답이 나가지 않게).
    // 손님 업종 코드가 맞거나, 질문에 그 업종을 부르는 말이 있어야 한다. 말이 맞아도 손님 큰 분류가 다르면 뺀다(미용실 사장님의 '위생교육'에 식품 위생교육 답 X)
    // 큰 분류가 다르다고 빼는 건 업종 코드(손님 말에서 코드가 찾은 것)가 있을 때만 — AI 가 고른 큰 분류만으로는 빼지 않는다(잘못 고르면 '카페 차리려면…'에도 '자료 없음', 2026-11-28 미리보기)
    const sectorConflict = !!sector && !!ksic && fact.sectors.length > 0 && !sectorHit;
    if (fact.group === "permit" && !ksicHit && (!keyword || sectorConflict)) continue;
    if (text) {
      const best = Math.max(0, ...fact.questions.map(question => questionSimilarity(text, question)));
      if (best >= 0.2) { score += Math.round(best * 6 * 10) / 10; why.push(`질문 닮음 ${best.toFixed(2)}`); }
    }
    if (score < 4) continue;
    matches.push({ fact, score, stale: state === "recheck", why });
  }
  return matches.sort((a, b) => b.score - a.score || a.fact.id.localeCompare(b.fact.id)).slice(0, limit);
}

let cached: { day: string; result: ReturnType<typeof checkFacts> } | null = null;
/** 사이트에 들어 있는 자료(검사를 통과한 것만). 날짜가 바뀌면 다시 검사한다 */
export function siteFacts(today: string = seoulToday()): BusinessFact[] {
  if (!cached || cached.day !== today) cached = { day: today, result: checkFacts(FACT_FILES, today) };
  return cached.result.facts;
}

/** AI 에게 건넬 근거 묶음 — 항목 원문 · 출처 · 확인 날짜만. 이 밖의 사실은 쓰지 말라는 규칙과 함께 쓴다(3단계) */
export function factsForPrompt(matches: FactMatch[]): string {
  return matches.map(({ fact, stale }) => [
    `[${fact.id}] ${fact.answer}`,
    `신청·문의: ${fact.agency}`,
    `근거: ${fact.basis.map(item => [item.law, item.article].filter(Boolean).join(" ")).join(", ")}`,
    `출처: ${fact.sources.map(source => `${source.title} ${source.url}`).join(" / ")}`,
    `확인한 날: ${fact.checkedAt}${stale ? " (다시 확인 필요)" : ""}`,
  ].join("\n")).join("\n\n");
}
