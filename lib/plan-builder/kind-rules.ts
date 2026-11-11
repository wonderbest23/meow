import data from "../../data/ksic/kind-rules.json";
import { CUSTOMER_PHRASE, sectorForKsic } from "./ksic";
import type { BusinessKind } from "./business-kinds";
import type { ProposalSector } from "./proposal-blueprint";

/*
 * 세부 업종 규칙 — 낱말 수만 개 → 표준산업분류 세세분류의 세부 업종 줄(고객·불편·상품·채널·값). 원본과 형식은 data/ksic/kinds/README.md.
 *
 * 서버에서만 읽는다: 표가 커서 화면 묶음에 들어가면 안 된다(intake-estimate 는 이 파일을 import 하지 않고 intake-service 가 넘겨준다).
 * 손으로 쓴 사전(business-kinds)에 없는 종류와, 사전 낱말보다 짧지 않은 낱말로 맞은 종류(청소 → 입주청소)가 여기 줄을 쓴다. 숫자는 통계가 아니라 출발용 짐작값이다.
 * shortcut: 이 낱말들은 초안 짐작에만 쓴다(업종 검색·칩에는 안 쓴다), 실제 문장에서 잘 맞는 것이 확인되면 searchKsic 동의어로도 넘긴다.
 */
type Row = [ksic: string, offer: string, customer: string, problem: string, channel: string, price: number, unitCost: number, cost: number, capacity: string, people?: 1 | 3];
const table = data as unknown as { rows: Row[]; words: [string, ...number[]][] };
let index: Map<string, number[]> | undefined;
const rowsFor = (word: string) => (index ??= new Map(table.words.map(([key, ...rows]) => [key, rows]))).get(word);

export const KIND_RULE_ROWS: readonly Row[] = table.rows;
const JOSA = /(?:에서|으로|[을를이가은는의에로도과와만])$/;

/** 문장에서 가장 긴 낱말이 가리키는 세부 업종. allow 가 거르는 줄은 건너뛰고 다음으로 긴 낱말을 본다. */
export function ruleKind(text: string, allow: (sector: ProposalSector, ksic: string) => boolean = () => true): (BusinessKind & { ksic: string; word: string }) | null {
  const whole = text.normalize("NFKC").toLowerCase(), phrase = whole.match(CUSTOMER_PHRASE);
  // '직장인을 위한 도시락 배달'은 뒤쪽이 사업이다 — 뒤에서 못 찾을 때만 문장 전체를 본다
  for (const part of phrase ? [phrase[2], whole] : [whole]) {
    const tokens = part.split(/[^가-힣a-z0-9]+/).filter(Boolean), joined = tokens.join("");
    const hits: [word: string, at: number][] = [];
    // 앞 어절의 끝 한 글자에서 시작해 다음 어절로 넘어가는 낱말은 버린다('찜닭 가게'의 '닭가게'). 두 글자부터는 둔다('손두부 제조'의 '두부제조')
    const starts = new Set<number>(), ends: number[] = [];
    for (let at = 0, i = 0; i < tokens.length; at += tokens[i++].length) { starts.add(at); for (const _ of tokens[i]) ends.push(at + tokens[i].length); }
    for (let at = 0; at < joined.length; at++) for (let size = Math.min(12, joined.length - at); size >= 3; size--) if ((starts.has(at) || at + size <= ends[at] || ends[at] - at >= 2) && rowsFor(joined.slice(at, at + size))) hits.push([joined.slice(at, at + size), at]);
    // 두 글자 낱말은 짧은 어절의 머리·꼬리일 때만 맞는다(조사는 떼고) — 띄어쓰기를 지운 문장에서 찾으면 '한우 리본'이 '우리'가 된다
    let at = 0;
    for (const token of tokens) {
      for (const piece of new Set([token, token.replace(JOSA, "")])) if (piece.length >= 2 && piece.length <= 4) for (const word of new Set([piece.slice(0, 2), piece.slice(-2)])) if (rowsFor(word)) hits.push([word, at]);
      at += token.length;
    }
    // 떨어져 있는 두 어절도 붙여 본다('매트리스 소파 방문 청소' → 매트리스청소, '공인중개사 시험 학원' → 공인중개사학원). 길이가 같으면 붙어 있던 낱말에 진다(자리 −1000)
    const bare = tokens.map(token => token.replace(JOSA, ""));
    for (let i = 0, from = 0; i < tokens.length; from += tokens[i++].length) for (let j = i + 2, to = from + tokens[i].length + tokens[i + 1]?.length; j < tokens.length; to += tokens[j++].length)
      for (const word of new Set([tokens[i] + tokens[j], bare[i] + bare[j]])) if (rowsFor(word)) hits.push([word, to - 1000]);
    // 긴 낱말이 먼저, 길이가 같으면 뒤에 나온 낱말이 먼저(우리말은 중심 낱말이 뒤에 온다)
    hits.sort((a, b) => b[0].length - a[0].length || b[1] - a[1]);
    for (const [word] of hits) for (const row of rowsFor(word)!) {
      const [ksic, offer, customer, problem, channel, price, unitCost, cost, capacity, staff] = table.rows[row], sector = sectorForKsic(ksic);
      if (sector && allow(sector, ksic)) return { ksic, word, sector, offer, customer, problem, channel, price, unitCost, cost, capacity, people: staff && (staff === 3 ? "직원 3명 이상" : "직원·아르바이트 1~2명") };
    }
  }
  return null;
}
