/*
 * 사업계획서 코드 채점 — AI 없이 규칙으로 잰다(Anthropic 'Develop tests': 코드 채점이 가장 빠르고 확실하다).
 * 기준: docs/사업계획서-품질기준-최종본-2026-10-09.md 의 12개 항목 중 규칙으로 잴 수 있는 것.
 * 기준 숫자(⚪ 표시)는 1차 결과를 보고 조정한다 — 여기 상수만 바꾸면 된다.
 */
import { checkDocumentQuality } from "../../lib/plan-builder/document-quality";

export type EvalFacts = { price?: number; unitCost?: number; fixedCost?: number; budget?: number; hoursPerWeek?: number };
export type EvalOutput = { caseId: string; sections: Record<string, string>; source: string; facts: EvalFacts };
export type ItemResult = { item: number; name: string; pass: boolean | null; detail: string; value?: number };

/** ⚪ 기준 숫자 — 1차 결과 뒤 조정 */
export const THRESHOLDS = {
  confirmNeededMax: 3,
  sectionCharsMax: 3000,
  totalCharsMax: 20000,
  repeatedNumberMax: 5,
  longHeadingChars: 40,
  weeklyRowsMin: 8,
  startFundItemsMin: 3,
};

/** 상담 기본 칩 중 막연한 고객 표현(lib/plan-builder/intake-options.ts general) */
export const VAGUE_CUSTOMER = ["특정 연령대", "특정 지역 주민", "특정 관심사 커뮤니티", "기관·단체", "개인 소비자"];

const plain = (markdown: string) => markdown.replace(/```[\s\S]*?```/g, "");
const count = (text: string, pattern: RegExp) => (text.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)) ?? []).length;

/** 마크다운 표들 — 각 표는 [머리글, ...줄], 칸은 공백을 지운 글 */
export function markdownTables(markdown: string): string[][][] {
  const tables: string[][][] = [];
  let current: string[][] = [];
  for (const line of markdown.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed.slice(1, -1).split("|").map(cell => cell.trim());
      if (cells.every(cell => /^:?-{2,}:?$/.test(cell))) continue;
      current.push(cells);
    } else if (current.length) { tables.push(current); current = []; }
  }
  if (current.length) tables.push(current);
  return tables;
}

const amount = (text: string): number | null => {
  const match = text.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
};

// 1. 고객이 구체적인가 — 막연한 칩 표현이 남았는지, 나이·지역·상황 단서가 있는지
export function gradeCustomer(all: string): ItemResult {
  const vague = VAGUE_CUSTOMER.reduce((sum, phrase) => sum + count(all, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))), 0);
  const age = /\d{2}\s*[~∼-]\s*\d{2}\s*(?:대|세)|\d{2}대|시니어|어르신|학부모|초등|중학생|고등학생|대학생|직장인/.test(all);
  const place = /[가-힣]+(?:시|구|동|군|읍)\b|역세권|단지|상권|배달권|동네|근처/.test(all);
  const pass = vague === 0 && (age || place);
  return { item: 1, name: "고객이 구체적인가", pass, value: vague, detail: `막연한 표현 ${vague}회 · 나이/대상 단서 ${age ? "있음" : "없음"} · 지역 단서 ${place ? "있음" : "없음"}` };
}

// 4. 남는 돈 구조 — 손익분기와 건당 남는 돈이 있고, 입력값으로 계산한 손익분기 수량이 본문과 맞는지
export function gradeUnitEconomics(all: string, facts: EvalFacts): ItemResult {
  const hasBreakEven = /손익분기|본전/.test(all);
  const hasUnit = /공헌이익|건당|한 건당|1건당/.test(all);
  const { price, unitCost, fixedCost } = facts;
  if (price == null || unitCost == null || fixedCost == null || price <= unitCost) {
    return { item: 4, name: "남는 돈 구조", pass: null, detail: `입력값 부족(가격·변동비·고정비) · 손익분기 언급 ${hasBreakEven ? "있음" : "없음"}` };
  }
  const units = Math.ceil(fixedCost / (price - unitCost));
  const matches = new RegExp(`${units.toLocaleString("ko-KR")}\\s*(?:건|개|명|잔|회|벌|시간|박|줄|곳)|${units}\\s*(?:건|개|명|잔|회|벌|시간|박|줄|곳)`).test(all);
  return { item: 4, name: "남는 돈 구조", pass: hasBreakEven && hasUnit && matches, value: units, detail: `계산한 손익분기 월 ${units.toLocaleString("ko-KR")} · 본문 일치 ${matches ? "예" : "아니오"} · 건당 이익 ${hasUnit ? "있음" : "없음"}` };
}

// 5. 시작 자금 — 항목별 금액(보증금·권리금·인테리어·설비·재고·인허가·홍보·예비비) 중 몇 개가 나오는지
const START_ITEMS = [/보증금/, /권리금/, /인테리어|공사/, /설비|장비|집기/, /초기\s*재고|재료\s*구입|첫\s*재고/, /인허가|사업자\s*등록|등록비/, /홍보비|광고비|마케팅\s*비/, /예비비|운영\s*자금|운영\s*예비/];
export function gradeStartFunds(all: string): ItemResult {
  const found = START_ITEMS.filter(pattern => pattern.test(all)).length;
  return { item: 5, name: "시작 자금", pass: found >= THRESHOLDS.startFundItemsMin, value: found, detail: `시작 자금 항목 ${found}/${START_ITEMS.length}개 언급` };
}

// 6. 12개월 돈 흐름 — 통장(현금) 흐름을 다룬 12개월 표가 있는지(손익표와 별개)
export function gradeCashflow(all: string): ItemResult {
  const mentions = /현금\s*흐름|돈\s*흐름|통장|잔고|잔액/.test(all);
  const monthTable = markdownTables(all).some(table => table.filter(row => /^(?:\d{1,2}\s*(?:월|개월차|월차))$/.test(row[0] ?? "")).length >= 12 && /잔고|잔액|현금|통장/.test(table[0].join(" ")));
  return { item: 6, name: "12개월 돈 흐름", pass: monthTable, detail: `돈 흐름 언급 ${mentions ? "있음" : "없음"} · 12개월 잔고 표 ${monthTable ? "있음" : "없음"}` };
}

// 7. 내 생활비와 내 월급
export function gradePersonalLiving(all: string): ItemResult {
  const living = /생활비/.test(all);
  const salary = /내\s*월급|대표(?:자)?\s*(?:인건비|월급|급여)|가져갈\s*돈|사장님?\s*월급/.test(all);
  return { item: 7, name: "내 생활비와 내 월급", pass: living && salary, detail: `생활비 ${living ? "있음" : "없음"} · 대표 월급 ${salary ? "있음" : "없음"}` };
}

// 9. 주차별 할 일 — '1주' 같은 주차 줄이 있는 표, 매주 시간 합이 주당 가능 시간 안인지
export function gradeWeeklyPlan(all: string, hoursPerWeek?: number): ItemResult {
  for (const table of markdownTables(all)) {
    const head = table[0].join(" ");
    const weekCol = table[0].findIndex(cell => /주차|주$|기간/.test(cell));
    const hourCol = table[0].findIndex(cell => /시간/.test(cell));
    if (weekCol < 0) continue;
    const rows = table.slice(1).filter(row => /\d+\s*주/.test(row[weekCol] ?? ""));
    if (rows.length < THRESHOLDS.weeklyRowsMin) continue;
    if (hourCol < 0) return { item: 9, name: "주차별 할 일", pass: false, value: rows.length, detail: `주차 ${rows.length}줄 표 있음 · 시간 칸 없음(${head})` };
    const byWeek = new Map<string, number>();
    for (const row of rows) byWeek.set(row[weekCol], (byWeek.get(row[weekCol]) ?? 0) + (amount(row[hourCol] ?? "") ?? 0));
    const over = hoursPerWeek ? [...byWeek.values()].filter(hours => hours > hoursPerWeek).length : 0;
    return { item: 9, name: "주차별 할 일", pass: over === 0, value: rows.length, detail: `주차 ${rows.length}줄 · 주당 ${hoursPerWeek ?? "?"}시간 넘는 주 ${over}개` };
  }
  return { item: 9, name: "주차별 할 일", pass: false, value: 0, detail: `주차별 표 없음(${THRESHOLDS.weeklyRowsMin}주 이상)` };
}

// 10. 매달 볼 숫자와 다시 보기
export function gradeMonthlyMetrics(all: string): ItemResult {
  const monthly = /매달|매월|한 달에 한 번|월 1회/.test(all);
  const metric = /볼\s*숫자|지표|확인할\s*숫자|살펴볼\s*숫자/.test(all);
  // '다시 봅니다'·'다시 봐요'도 잡는다(2026-10-10 빵집 실행 장: '매달 마지막 주에 … 다시 봅니다'를 놓쳤다)
  const review = /다시\s*(?:보|봅|봐|볼)|점검일|검토일|돌아보/.test(all);
  return { item: 10, name: "매달 볼 숫자와 다시 보기", pass: monthly && metric && review, detail: `매달 ${monthly ? "○" : "×"} · 지표 ${metric ? "○" : "×"} · 다시 보기 ${review ? "○" : "×"}` };
}

// 11. 지어내지 않기 — 입력·계산에 없는 숫자(기존 문서 품질 검사)와 '확인 필요' 개수
export function gradeNoInvention(sections: Record<string, string>, source: string): ItemResult {
  let unsupported = 0;
  const prior: string[] = [];
  for (const markdown of Object.values(sections)) {
    unsupported += checkDocumentQuality(markdown, source, prior).issues.filter(issue => issue.code === "unsupported_number").length;
    prior.push(markdown);
  }
  const confirm = count(Object.values(sections).join("\n"), /확인\s*필요/);
  return { item: 11, name: "지어내지 않기", pass: unsupported === 0 && confirm <= THRESHOLDS.confirmNeededMax, value: confirm, detail: `근거 없는 숫자 ${unsupported}개 · '확인 필요' ${confirm}회(⚪ ${THRESHOLDS.confirmNeededMax}회 이하)` };
}

// 12. 짧고 읽기 쉬움 — 분량, 같은 숫자 반복, 긴 제목
export function gradeReadability(sections: Record<string, string>): ItemResult {
  const lengths = Object.values(sections).map(markdown => plain(markdown).replace(/\s+/g, " ").length);
  const total = lengths.reduce((sum, length) => sum + length, 0), longest = Math.max(0, ...lengths);
  const numbers = new Map<string, number>();
  // 같은 숫자 반복은 표 바깥 글에서만 센다 — 12개월 표처럼 숫자가 줄마다 되풀이되는 표는 반복이 아니다
  const prose = Object.values(sections).join("\n").split("\n").filter(line => !line.trim().startsWith("|")).join("\n");
  for (const token of prose.match(/\d[\d,]{1,}(?:\.\d+)?\s*(?:원|명|건|개|%|개월|시간)/g) ?? []) numbers.set(token.replace(/\s+/g, ""), (numbers.get(token.replace(/\s+/g, "")) ?? 0) + 1);
  const repeated = Math.max(0, ...numbers.values());
  const longHeadings = Object.values(sections).flatMap(markdown => markdown.split("\n").filter(line => /^#{2,4}\s/.test(line) && line.replace(/^#+\s*/, "").length > THRESHOLDS.longHeadingChars)).length;
  const pass = longest <= THRESHOLDS.sectionCharsMax && total <= THRESHOLDS.totalCharsMax && repeated <= THRESHOLDS.repeatedNumberMax && longHeadings === 0;
  return { item: 12, name: "짧고 읽기 쉬움", pass, value: total, detail: `전체 ${total.toLocaleString("ko-KR")}자 · 가장 긴 장 ${longest.toLocaleString("ko-KR")}자 · 같은 숫자 최대 ${repeated}회 · 긴 제목 ${longHeadings}개` };
}

/** 코드로 잴 수 있는 항목 전부(1·4·5·6·7·9·10·11·12) */
export function gradeByCode(output: EvalOutput): ItemResult[] {
  const all = Object.values(output.sections).join("\n\n");
  return [
    gradeCustomer(all),
    gradeUnitEconomics(all, output.facts),
    gradeStartFunds(all),
    gradeCashflow(all),
    gradePersonalLiving(all),
    gradeWeeklyPlan(all, output.facts.hoursPerWeek),
    gradeMonthlyMetrics(all),
    gradeNoInvention(output.sections, output.source),
    gradeReadability(output.sections),
  ];
}

/** 반드시 통과 항목(최종본 1장): 1·4·5·7·9·11 */
export const MUST_PASS = [1, 4, 5, 7, 9, 11];
