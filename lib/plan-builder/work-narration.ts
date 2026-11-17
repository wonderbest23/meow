import { withEul } from "../josa";

/*
 * AI가 일하는 동안 보여 주는 '지금 하는 일' 문구(대표 결정 2026-11-17: 지금 있는 신호만 · 쌓이는 목록).
 *
 * Claude·ChatGPT의 생각 과정 표시처럼 보이지만, AI의 날것 생각은 쓰지 않는다. 문구는 모두 이 파일의 규칙이 만든다(AI 호출 0회).
 * 쓰는 신호는 이미 있는 것뿐이다:
 *  - 작업 상태(접수·실행·완료)와 서버 기준 경과 시간
 *  - 대표가 답한 답 수, 업종 가이드 이름(사업 방향 정리 지시문에 실제로 들어가는 것)
 *  - 대표가 '직접 답한' 판매가·1건 비용·월 고정비로 코드가 계산한 숫자(계획서 돈 장과 같은 계산 — work-narration-facts.ts)
 *  - 계획서: 다 쓴 장 이름과 남은 장 수
 * AI가 쓴 글, AI 초안 숫자(basis "proposal"), 검토 전 본문, 지시문은 넣지 않는다.
 *
 * ✓(done)는 정말 끝난 일에만 붙인다 — 코드 계산은 요청 전에 이미 끝났고, 장은 저장된 뒤에만 done 이다.
 * AI가 하는 중인 일은 active 한 줄(돌아가는 표시)로만 보인다.
 * 희망 한마디는 아래 고정 목록에서만 고른다. 숫자를 넣지 않고 결과를 약속하지 않는다(NARRATION_BANNED 로 시험).
 * 철학자의 말(2026-11-17 대표 결정)은 출처를 검증한 목록(philosophy-quotes.ts)의 짧은 말만 글자 그대로, 무거운 말·결과 약속으로 읽힐 말은 빼고 넣는다.
 * 화면 묶음을 작게 두려고 목록을 가져오지 않고 여기 적는다 — 목록과 글자까지 같은지는 scripts/philosophy-voice.test.ts가 확인한다.
 */

export type NarrationMoney = {
  /** 세는 말(개·건·명…) — 계획서 돈 장과 같은 말 */
  unit: string;
  /** 한 단위에 실제 남는 돈(원). 부가세를 뺀 값이면 vat true */
  perUnit: number;
  vat: boolean;
  /** 본전 판매량(한 달). 월 고정비를 직접 답하지 않았으면 null */
  breakEven: number | null;
  /** 본전과 견줄 양 — 대표가 답한 판매량이나 감당할 수 있는 최대치. 없으면 null */
  reach: number | null;
  reachWord: string | null;
};

export type NarrationFacts = {
  /** 업종 가이드 이름(예: '반찬·도시락 가게') — 사업 방향 정리 지시문에 들어가는 그 가이드 */
  guide: string | null;
  money: NarrationMoney | null;
};

export type NarrationLine = { id: string; text: string; state: "done" | "active"; note?: string };
export type Narration = { lines: NarrationLine[]; hope: string | null };

/** 결과를 약속하는 말 — 문구 어디에도 쓰지 않는다 */
export const NARRATION_BANNED = /반드시|틀림없|확실히|보장|무조건|성공할|100%|대박/;

const count = (value: number, unit: string) => `${value.toLocaleString("ko-KR")}${unit}`;
const won = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;
const quoted = (title: string) => `‘${title}’`;

/** 남는 돈 줄 — 손해면 손해라고만 적는다 */
export function marginLine(money: NarrationMoney): string {
  if (money.perUnit <= 0) return `지금 값으로는 한 ${money.unit}마다 ${won(-money.perUnit)} 손해예요`;
  return `${money.vat ? "부가세까지 빼면 " : ""}한 ${money.unit}에 ${won(money.perUnit)} 남아요`;
}

/**
 * 본전 줄 + 그 숫자에 맞는 한마디. 판단은 대표가 직접 답한 양과 견줄 때만 한다.
 * 닿으면 '들어오는 숫자', 넘으면 그대로 말하고 바꿀 자리를 말한다, 견줄 양이 없으면 '첫 목표'.
 */
export function breakEvenLine(money: NarrationMoney): { text: string; note: string } | null {
  if (money.breakEven == null || money.perUnit <= 0) return null;
  const text = `본전은 한 달 ${count(money.breakEven, money.unit)}`;
  if (money.reach != null && money.reach > 0 && money.reachWord) {
    return money.breakEven <= money.reach
      ? { text, note: `${money.reachWord}(${count(money.reach, money.unit)}) 안에 들어오는 숫자예요` }
      : { text, note: `${money.reachWord}(${count(money.reach, money.unit)})보다 많아요. 가격과 비용을 함께 다시 볼 자리예요` };
  }
  return { text, note: "이 숫자가 첫 목표가 돼요" };
}

/** 희망 한마디 — 숫자 없이, 약속 없이. 철학적이되 쉬운 말로. 철학자의 말은 '— 이름'을 붙인다 */
export const DESIGN_HOPES = [
  "흩어진 답이 하나의 방향으로 모이고 있어요.",
  "천 리 길도 발밑 한 걸음에서 시작된다. — 노자",
  "막연했던 생각도 적어 보면 길이 보이기 시작해요.",
  "세상의 어떤 큰일도 열정 없이 이루어진 적은 없다. — 헤겔",
  "작게 시작하는 것도 분명한 시작이에요.",
  "시작이 반이다. — 아리스토텔레스가 인용한 옛말",
  "이미 답한 것만으로도 꽤 많은 것이 정해졌어요.",
];
/** 계획서를 쓰는 동안(앞부분) 장이 하나씩 끝날 때마다 바뀌는 철학자의 말 */
export const PLAN_QUOTE_HOPES = [
  "배우고 때맞춰 익히면, 이 또한 기쁘지 않은가. — 공자",
  "너 자신을 믿어라. — 에머슨",
  "훌륭한 것은 모두 드문 만큼 어렵다. — 스피노자",
];
export const PLAN_HOPES = {
  start: "첫 줄이 가장 멀어 보여요. 이미 시작됐어요.",
  early: "생각이 하나씩 글이 되고 있어요.",
  half: "절반을 넘었어요. 생각이 글이 되고 있어요.",
  late: "거의 다 왔어요. 마지막 정리만 남았어요.",
} as const;

/** 사업 방향 정리에서 사실 줄이 하나씩 드러나는 간격(화면 연출 — 내용은 요청 전에 이미 정해진 사실이다) */
export const DESIGN_REVEAL_MS = 3000;
const HOPE_ROTATE_MS = 9000;

/**
 * 사업 방향 정리(AI 호출 1번, 보통 30~40초) 대기 문구.
 * 서버가 주는 단계는 접수·실행뿐이라, 실행 중에는 '이 작업이 쓰는 사실'을 차례로 보이고 마지막 줄에 AI가 하는 일을 둔다.
 */
export function designNarration(input: {
  status: "queued" | "running" | "complete" | "failed" | null;
  elapsedMs: number;
  answered: number;
  facts: NarrationFacts | null | undefined;
  slow?: { seconds: number } | null;
}): Narration {
  const facts: NarrationLine[] = [];
  if (input.answered > 0) facts.push({ id: "answers", text: `답변 ${input.answered}개를 모았어요`, state: "done" });
  if (input.facts?.guide) facts.push({ id: "guide", text: `${quoted(input.facts.guide)} 업종 기준을 찾았어요`, state: "done" });
  const money = input.facts?.money;
  if (money) {
    facts.push({ id: "margin", text: marginLine(money), state: "done" });
    const even = breakEvenLine(money);
    if (even) facts.push({ id: "break-even", text: even.text, note: even.note, state: "done" });
  }
  const elapsed = Math.max(0, input.elapsedMs);
  const queued = input.status === "queued" || input.status === null;
  const shown = queued ? facts.slice(0, 1) : facts.slice(0, 1 + Math.floor(elapsed / DESIGN_REVEAL_MS));
  const active: NarrationLine = queued
    ? { id: "queued", text: "요청을 받았어요. 곧 정리를 시작해요", state: "active", note: "보통 30~40초 걸려요" }
    : { id: "writing", text: "고객·문제·돈 버는 구조를 한 장으로 묶고 있어요", state: "active", note: "보통 30~40초 걸려요" };
  const hope = input.slow
    ? `평소보다 오래 걸리고 있어요 · ${input.slow.seconds}초. 답변은 저장돼 있어요.`
    : DESIGN_HOPES[Math.floor(elapsed / HOPE_ROTATE_MS) % DESIGN_HOPES.length];
  return { lines: [...shown, active], hope };
}

export type PlanNarrationSection = { key: string; title: string; done: boolean };

/**
 * 계획서 작성 대기 문구. 실제 신호는 장마다 '저장됨' 여부뿐이다(장 안의 쓰기·검토·고치기 단계는 기록하지 않는다).
 * finishedOrder: 화면이 본 순서대로 다 쓴 장 열쇠(처음 열었을 때 이미 끝난 장은 문서 순서).
 * reviewed: 상담으로 만든 계획서 — 장마다 검토를 거쳐 저장된다(section-generator.reviewCoachSection).
 */
export function planNarration(input: {
  total: number;
  sections: PlanNarrationSection[];
  finishedOrder: string[];
  stalled: boolean;
  facts?: NarrationFacts | null;
  moneyKey?: string | null;
  reviewed?: boolean;
  maxDone?: number;
}): Narration {
  const byKey = new Map(input.sections.map(section => [section.key, section]));
  const finished = input.finishedOrder.filter(key => byKey.get(key)?.done);
  const max = Math.max(1, input.maxDone ?? 3);
  const recent = finished.slice(-max);
  const lines: NarrationLine[] = [];
  if (finished.length > recent.length) lines.push({ id: "earlier", text: `앞서 ${finished.length - recent.length}개 항목을 썼어요`, state: "done" });
  const money = input.facts?.money;
  const even = money ? breakEvenLine(money) : null;
  for (const key of recent) {
    const title = byKey.get(key)!.title;
    lines.push(key === input.moneyKey && even
      ? { id: `done-${key}`, text: `돈 계획을 썼어요 — ${even.text}`, state: "done" }
      : { id: `done-${key}`, text: `${withEul(quoted(title))} 다 썼어요`, state: "done" });
  }
  const pending = input.sections.filter(section => !section.done);
  const done = input.sections.length - pending.length;
  if (input.stalled || !pending.length) return { lines, hope: null };
  const check = input.reviewed ? "항목마다 답과 맞는지 검토한 뒤 저장해요" : null;
  if (done === 0) {
    lines.push({ id: "outline", text: `${input.total || input.sections.length}개 항목의 뼈대를 세우고 첫 항목을 쓰고 있어요`, state: "active", ...(check ? { note: check } : {}) });
  } else {
    /* 문서 순서로 첫 번째 남은 장은 지금 묶음 안에 있다(section-waves) — 그 장만 '쓰고 있어요'라 하고, 나머지는 수만 말한다(동시에 몇 개인지는 설계도 성공 여부에 달려 단정하지 않는다) */
    const first = pending[0].title;
    const rest = pending.length - 1;
    const text = rest > 0 ? `지금 ${withEul(quoted(first))} 쓰고 있어요` : `마지막으로 ${withEul(quoted(first))} 쓰고 있어요`;
    const note = [rest > 0 ? `남은 ${rest}개 항목도 이어서 써요` : null, check].filter(Boolean).join(" · ");
    lines.push({ id: "writing", text, state: "active", ...(note ? { note } : {}) });
  }
  const ratio = input.sections.length ? done / input.sections.length : 0;
  const early = [PLAN_HOPES.early, ...PLAN_QUOTE_HOPES];
  const hope = done === 0 ? PLAN_HOPES.start : pending.length === 1 || ratio >= 0.8 ? PLAN_HOPES.late : ratio >= 0.5 ? PLAN_HOPES.half : early[(done - 1) % early.length];
  return { lines, hope };
}

/** 다 쓴 장의 순서 — 이전 순서를 지키고, 새로 끝난 장은 문서 순서로 뒤에 붙인다 */
export function nextFinishedOrder(previous: string[], sections: PlanNarrationSection[]): string[] {
  const doneKeys = new Set(sections.filter(section => section.done).map(section => section.key));
  const kept = previous.filter(key => doneKeys.has(key));
  const seen = new Set(kept);
  return [...kept, ...sections.filter(section => section.done && !seen.has(section.key)).map(section => section.key)];
}
