import { SECTOR_PATTERNS, type ProposalSector } from "./proposal-blueprint";
import { descriptionSector } from "./intake-sector";
import { businessKind } from "./business-kinds";
import { sectorChipOptions, CHIP_GROUPS } from "./intake-options";
import { SUGGESTION_FIELDS, type SuggestionField } from "./answer-suggestion-fields";
import type { IntakeMode } from "./intake-questions";

/*
 * AI 없이 만드는 답변 추천 — AI 추천(answer-suggestions)과 같은 모양(질문당 3개 칩).
 *
 * AI가 꺼져 있거나 느릴 때 빈자리를 채우고, AI가 오면 그 자리에 바뀌어 들어간다. 새 문구는 쓰지 않고
 * 업종별 칩 표(intake-options)에서만 고른다. 업종은 하나로 찍지 않고 설명과 맞는 순서로 두 개까지 쓴다 —
 * 기존 descriptionSector 는 업종이 섞이면 '범용'으로 떨어져 어느 사업에도 안 맞는 칩이 나왔다.
 */

export const LOCAL_PER_FIELD = 3;

/** 설명과 맞는 업종을 점수 순으로(1순위는 기존 규칙과 같다). 규칙이 못 찍으면 세부 업종 사전(치킨집·필라테스)으로 찍고, 그것도 없으면 ["general"] */
export function rankedSectors(text: string): ProposalSector[] {
  const subject = text.toLowerCase();
  const ruled = descriptionSector(text), first = ruled === "general" ? businessKind(text)?.sector ?? ruled : ruled;
  const scored = SECTOR_PATTERNS
    .map(([sector, pattern]) => [sector, (subject.match(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`)) ?? []).length] as const)
    .filter(([, hits]) => hits > 0)
    .sort((a, b) => b[1] - a[1]);
  const ordered = [first, ...scored.map(([sector]) => sector)].filter((sector, index, all) => sector !== "general" && all.indexOf(sector) === index);
  return ordered.length ? ordered : ["general"];
}

/* 칩 문구를 2글자 이상 조각으로 쪼개 설명에 들어 있으면 점수 — "배달"이 있으면 "배달로 식사하는 1인 가구"가 위로 */
const tokens = (label: string) => label.split(/[\s·,()/]+/).map(piece => piece.replace(/[^가-힣a-z0-9]/gi, "")).filter(piece => piece.length >= 2);
const overlap = (label: string, text: string) => tokens(label).filter(piece => text.includes(piece) || text.includes(piece.slice(0, 2))).length;

/** 질문 하나의 자체 추천 — 1순위 업종 칩을 먼저, 2순위 업종 칩을 뒤에 두고 설명과 겹치는 문구를 앞으로 */
export function localFieldSuggestions(text: string, field: SuggestionField, sectors: ProposalSector[], mode: IntakeMode): string[] {
  const seen = new Set<string>();
  const candidates: { label: string; rank: number }[] = [];
  sectors.slice(0, 2).forEach((sector, rank) => {
    for (const option of sectorChipOptions(sector, field, mode)) {
      // 판매 경로는 공통 칩(매장 방문·SNS)보다 업종 칩(배달앱·스마트스토어)이 사업을 더 잘 말한다
      const common = option.group === CHIP_GROUPS.channelCommon || option.group === CHIP_GROUPS.problemCommon;
      if (seen.has(option.label)) continue;
      seen.add(option.label);
      candidates.push({ label: option.label, rank: rank * 2 + (common ? 1 : 0) });
    }
  });
  return candidates
    .map((item, index) => ({ ...item, index, hits: overlap(item.label, text) }))
    .sort((a, b) => b.hits - a.hits || a.rank - b.rank || a.index - b.index)
    .slice(0, LOCAL_PER_FIELD)
    .map(item => item.label);
}

export function localSuggestions(text: string, mode: IntakeMode): Partial<Record<SuggestionField, string[]>> {
  const sectors = rankedSectors(text);
  return Object.fromEntries(SUGGESTION_FIELDS.map(field => [field, localFieldSuggestions(text, field, sectors, mode)]));
}
