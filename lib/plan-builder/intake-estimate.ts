import { localFieldSuggestions, rankedSectors } from "./local-suggestions";
import { SUGGESTION_FIELDS } from "./answer-suggestion-fields";
import type { ProposalSector } from "./proposal-blueprint";

/*
 * 한 문장에서 나머지 답을 짐작하는 자체 알고리즘 — AI·네트워크 없이 표와 규칙만 쓴다(0원, 같은 문장이면 같은 답).
 *
 * 묻지 않고 채운 값은 모두 '제안'(basis: "proposal")으로 저장돼 화면·문서에 짐작으로 표시되고, 사용자가 고치면 그 값이 이긴다.
 * 아래 기준표는 출발값이다 — 실제 사업자가 고친 값이 쌓이면 업종(나중엔 동네)별 중앙값으로 이 표를 바꾼다.
 * shortcut: 문장 속 금액·수량은 읽지 않는다, 사용자가 숫자를 적어 보내는 일이 잦아지면 answer-number 로 먼저 읽는다.
 */

type Baseline = { price: number; unitCost: number; cost: number; capacity: string };

/** 대표 상품 1건 값 · 1건 비용 · 월 고정비 · 혼자 감당하는 양. 모든 행은 월 판매량 × (값 − 비용) > 월 고정비 를 지킨다(테스트가 확인). */
export const SECTOR_BASELINES: Record<ProposalSector, Baseline> = {
  b2b_service: { price: 650_000, unitCost: 65_000, cost: 1_000_000, capacity: "한 달 4건" },
  software: { price: 13_000, unitCost: 1_300, cost: 1_000_000, capacity: "한 달 300명" },
  food_beverage: { price: 7_500, unitCost: 2_600, cost: 3_000_000, capacity: "하루 40건" },
  retail_commerce: { price: 20_000, unitCost: 10_000, cost: 1_000_000, capacity: "하루 15개" },
  manufacturing: { price: 5_500, unitCost: 2_800, cost: 3_000_000, capacity: "하루 60개" },
  education: { price: 35_000, unitCost: 3_500, cost: 1_000_000, capacity: "일주일 10명" },
  local_service: { price: 40_000, unitCost: 4_000, cost: 1_000_000, capacity: "일주일 10건" },
  space_hospitality: { price: 15_000, unitCost: 1_500, cost: 3_000_000, capacity: "하루 10건" },
  logistics: { price: 7_500, unitCost: 3_800, cost: 3_000_000, capacity: "하루 40건" },
  content_media: { price: 130_000, unitCost: 13_000, cost: 1_000_000, capacity: "한 달 12개" },
  general: { price: 30_000, unitCost: 3_000, cost: 1_000_000, capacity: "일주일 10건" },
};

/** 질문 id → 짐작한 답(문자열). 고를 문구가 없는 질문은 빠진다 — 그 질문은 평소처럼 묻는다. */
export function estimateIntake(text: string, chosen?: ProposalSector): { sector: ProposalSector; answers: Record<string, string> } {
  const ranked = rankedSectors(text);
  const sector = chosen ?? ranked[0];
  const sectors = [sector, ...ranked.filter(item => item !== sector)];
  const base = SECTOR_BASELINES[sector];
  const answers: Record<string, string> = {
    price: `${base.price}원`, "structure.unitCost": `${base.unitCost}원`, "structure.cost": `${base.cost}원`,
    capacity: `대표자 혼자 / ${base.capacity}`, goal: "6개월 안에 손익분기 도달",
  };
  for (const field of SUGGESTION_FIELDS) {
    const guess = localFieldSuggestions(text, field, sectors, "startup")[0];
    if (guess) answers[field] = guess;
  }
  return { sector, answers };
}
