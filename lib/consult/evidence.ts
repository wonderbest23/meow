/*
 * 상담에 붙는 공식 근거.
 *
 * 조사 엔진(lib/market/openai-research)은 한 번에 최대 150초·검색 비용이 들어
 * 채팅 턴마다 부를 수 없다. 대신 손님의 계획서에 이미 저장된 근거
 * (projects.market_workspace.evidence)를 상담 프롬프트에 싣고, 상담사가 수치를
 * 말할 때 [E1] 처럼 어느 근거인지 표시하게 한다. 서버는 그 표시를 (출처 1) 로
 * 바꾸고, 출처 목록을 답과 함께 내려 화면이 링크로 보여 준다.
 * 근거가 없으면 없다고 말하고 지어내지 않는다 — 규칙은 domain.ts 에 있다.
 */
import type { MarketEvidence } from "../market/domain";
import type { ConsultProfile } from "./domain";

export const CONSULT_EVIDENCE_MAX = 8;

export type ConsultSource = {
  n: number;
  name: string;
  url: string;
  observedAt: string;
  verification: MarketEvidence["verification"];
};

/** 손님 조건(업종·지역)에 닿는 것부터, 확인된 것부터 */
export function pickConsultEvidence(list: MarketEvidence[], profile: ConsultProfile): MarketEvidence[] {
  const keys = [profile.interest, profile.region].filter(Boolean).map((k) => String(k).toLowerCase());
  const score = (e: MarketEvidence) => {
    const hay = `${e.title} ${e.metric} ${e.region} ${e.note}`.toLowerCase();
    let s = keys.reduce((acc, k) => acc + (hay.includes(k) ? 2 : 0), 0);
    if (e.verification === "verified") s += 1;
    if (e.isDemo) s -= 5;
    return s;
  };
  return [...list]
    .filter((e) => !e.isDemo)
    .sort((a, b) => score(b) - score(a))
    .slice(0, CONSULT_EVIDENCE_MAX);
}

/** 프롬프트에 싣는 모양 — 번호가 곧 인용 표시다 */
export function evidenceBlock(list: MarketEvidence[]): string {
  if (!list.length) return "";
  const lines = list.map((e, i) => {
    const when = e.observedAt && e.observedAt !== (e.retrievedAt || "").slice(0, 10) ? ` 기준일 ${e.observedAt}` : " 기준일 미확인";
    const check = e.verification === "verified" ? "공식 확인" : e.verification === "user_supplied" ? "손님 제공" : "검토 필요";
    return `[E${i + 1}] ${e.metric}: ${e.value}${e.unit ? ` ${e.unit}` : ""}${e.region ? ` (${e.region})` : ""} — 출처 ${e.sourceName},${when}, ${check}`;
  });
  return `공식 근거(수치를 말할 때 [E번호]를 붙이세요)\n${lines.join("\n")}`;
}

/**
 * 답에 쓰인 [E#] 표시를 (출처 #) 로 바꾸고, 실제로 쓰인 근거만 출처 목록으로 돌려준다.
 * 안 쓴 근거는 목록에 넣지 않는다 — 읽지도 않은 링크를 답 아래에 늘어놓으면 근거처럼 보인다.
 */
export function applyCitations(message: string, list: MarketEvidence[]): { message: string; sources: ConsultSource[] } {
  const used = new Map<number, ConsultSource>();
  const out = message.replace(/\[E(\d{1,2})\]/g, (_, n: string) => {
    const idx = Number(n) - 1;
    const e = list[idx];
    if (!e) return "";
    if (!used.has(idx)) used.set(idx, { n: used.size + 1, name: e.sourceName, url: e.sourceUrl, observedAt: e.observedAt, verification: e.verification });
    return `(출처 ${used.get(idx)!.n})`;
  });
  /* 없는 번호를 지우고 남은 " ." 같은 자국도 정리한다 */
  return { message: out.replace(/[ ]{2,}/g, " ").replace(/\s+([.,!?])/g, "$1").trim(), sources: [...used.values()] };
}
