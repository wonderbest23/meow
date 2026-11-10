import { localFieldSuggestions, rankedSectors } from "./local-suggestions";
import { SUGGESTION_FIELDS } from "./answer-suggestion-fields";
import { businessKind } from "./business-kinds";
import { monthlyVolumeFromCapacity } from "./coach-feasibility";
import { readSentence } from "./intake-sentence";
import type { ProposalSector } from "./proposal-blueprint";

/*
 * 한 문장에서 나머지 답을 짐작하는 자체 알고리즘 — AI·네트워크 없이 표와 규칙만 쓴다(0원, 같은 문장이면 같은 답).
 *
 * 묻지 않고 채운 값은 모두 '제안'(basis: "proposal")으로 저장돼 화면·문서에 짐작으로 표시되고, 사용자가 고치면 그 값이 이긴다.
 * 아래 기준표는 출발값이다 — 실제 사업자가 고친 값이 쌓이면 업종(나중엔 동네)별 중앙값으로 이 표를 바꾼다.
 * 문장에 사용자가 직접 적은 고객·가격·하루 수량·목표·자본금은 표보다 먼저 쓴다(intake-sentence).
 */

type Baseline = { price: number; unitCost: number; cost: number; capacity: string };

/** 대표 상품 1건 값 · 1건 비용 · 월 고정비 · 혼자 감당하는 양. 모든 행은 월 판매량 × (값 − 비용) > 월 고정비 를 지킨다(테스트가 확인). */
export const SECTOR_BASELINES: Record<ProposalSector, Baseline> = {
  b2b_service: { price: 650_000, unitCost: 65_000, cost: 1_000_000, capacity: "한 달 4건" },
  software: { price: 13_000, unitCost: 1_300, cost: 1_000_000, capacity: "한 달 300명" },
  food_beverage: { price: 7_500, unitCost: 2_600, cost: 3_000_000, capacity: "하루 40건" },
  retail_commerce: { price: 20_000, unitCost: 10_000, cost: 1_000_000, capacity: "하루 15개" },
  manufacturing: { price: 5_500, unitCost: 2_800, cost: 3_000_000, capacity: "하루 60개" },
  education: { price: 200_000, unitCost: 20_000, cost: 1_000_000, capacity: "한 달 10명" },
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
  // 세부 업종(치킨집·꽃집)을 찾으면 그 줄의 답과 숫자를, 못 찾으면 업종 한 줄 기준값과 칩에서 고른 답을 쓴다
  const kind = businessKind(text, sector);
  const base = kind ?? SECTOR_BASELINES[sector];
  const read = readSentence(text);
  // 한 달 값으로 적은 가격('월 15만원')인데 건당으로 세는 업종이면 감당하는 양도 한 달 회원 수로 바꾼다 — 건당 자리에 그대로 두면 매출이 몇십 배로 부푼다
  const monthly = !!read.priceMonthly && !base.capacity.startsWith("한 달");
  const price = read.price ?? base.price;
  // 거꾸로 한 달 회원으로 세는 업종에 회당 값('회당 4만원 과외')을 적었으면 한 달 횟수로 바꾼다 — 회원 자리에 그대로 두면 적자 초안이 된다
  const each = !read.priceMonthly && base.capacity.startsWith("한 달") && price * 3 < base.price;
  const unit = base.capacity.match(/[가-힣·]+$/)?.[0] ?? "건";
  const stated = read.capacity && (!monthly || read.capacity.period === "한 달") ? `${read.capacity.period} ${read.capacity.count}${unit}` : undefined;
  const amount = stated ?? (monthly || each ? `한 달 ${Math.max(1, Math.round((monthlyVolumeFromCapacity(base.capacity)?.volume ?? 1) * base.price / price))}${monthly ? "명" : "회"}` : base.capacity);
  const answers: Record<string, string> = {
    price: `${price}원`,
    // 가격을 문장에서 읽었으면 건당 비용도 같은 비율로 맞춘다
    "structure.unitCost": `${price === base.price ? base.unitCost : Math.round(price * base.unitCost / base.price / 100) * 100}원`,
    "structure.cost": `${base.cost}원`,
    capacity: `${read.people ?? "대표자 혼자"} / ${amount}`,
    goal: read.goal ?? "6개월 안에 손익분기 도달",
  };
  if (read.budget) answers.budget = `${read.budget}원`;
  if (read.hours) answers.hoursPerWeek = `${read.hours}시간`;
  for (const field of SUGGESTION_FIELDS) {
    // 하나로 정해 넣는 답은 1순위 업종 칩에서만 고른다 — 2순위 업종 칩이 섞이면 예약 앱의 고객이 '단체 예약 손님'이 됐다
    const guess = kind?.[field] || localFieldSuggestions(text, field, [sector], "startup")[0];
    if (guess) answers[field] = guess;
  }
  // 사용자가 적은 고객이 표의 고객 문구에 이미 들어 있으면 더 자세한 표 문구를 둔다
  if (read.customer && !answers.customer?.includes(read.customer)) answers.customer = read.customer;
  // 가게·매장이라고 적었으면 온라인 장터가 아니라 매장에서 판다
  if (/가게|매장|점포|오프라인/.test(text) && !/온라인|스토어|쇼핑몰/.test(text) && answers.channel?.includes("오픈마켓")) answers.channel = "매장 방문";
  return { sector, answers };
}
