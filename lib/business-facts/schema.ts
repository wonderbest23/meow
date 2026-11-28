import { z } from "zod";
import { PROPOSAL_SECTORS } from "../plan-builder/proposal-blueprint";

/*
 * 한국 사업 정보(사업자등록 · 과세 유형 · 세금 신고 일정 · 업종별 영업신고·허가) 한 항목의 모양.
 * 계획: '한국 사업 정보 사이트 안에 넣어 두기'(2026-11-28). AI 는 이 자료에서 찾은 항목만 근거로 답한다.
 *
 * 원칙
 *  - 한 항목 = 한 가지 사실. 정부 공식 출처 주소(내용이 적힌 페이지) · 확인한 날 · 근거 법을 반드시 단다.
 *  - 세율 · 기준 금액 · 일정처럼 바뀌는 값은 적용 기간(validFrom~validTo)을 적는다.
 *  - 다시 확인 날(recheckBy)이 지나면 답에 '다시 확인 필요'를 붙이고, 신뢰성 시험이 떨어진다.
 *  - 'draft'(초안)는 답에 쓰지 않는다. 사람이 출처를 열어 확인한 뒤 'verified' 로 바꾼다.
 */

export const FACT_GROUPS = ["registration", "tax-type", "tax-calendar", "permit"] as const;
export type FactGroup = typeof FACT_GROUPS[number];
export const FACT_GROUP_LABELS: Record<FactGroup, string> = {
  registration: "사업자등록",
  "tax-type": "간이·일반과세",
  "tax-calendar": "세금 신고 일정",
  permit: "업종별 영업신고·허가",
};

/*
 * 출처로 받는 곳 — 정부 공식 도메인만(블로그·커뮤니티·AI 답변은 출처가 아니다).
 * .go.kr 전체와, 정부24(gov.kr) · 정부 기관이지만 .or.kr 을 쓰는 곳 몇 개.
 */
const OFFICIAL_EXTRA_HOSTS = new Set(["www.gov.kr", "gov.kr", "plus.gov.kr", "www.semas.or.kr", "semas.or.kr"]); // 정부24 는 gov.kr(.go.kr 아님)
export function isOfficialSource(url: string): boolean {
  let host: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    host = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === "go.kr" || host.endsWith(".go.kr") || OFFICIAL_EXTRA_HOSTS.has(host);
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD").refine(value => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value), "없는 날짜");

export const factSourceSchema = z.object({
  /** 내용이 적힌 페이지 주소(기관 대표 주소가 아니라) */
  url: z.string().url(),
  /** 페이지 제목 그대로 */
  title: z.string().trim().min(1).max(200),
});

export const factBasisSchema = z.object({
  /** 법령 이름(예: 식품위생법 시행령) */
  law: z.string().trim().min(1).max(100),
  /** 조문(예: 제21조 제8호). 법이 아닌 고시·안내면 비워 둘 수 있다 */
  article: z.string().trim().max(100).optional(),
});

export const businessFactSchema = z.object({
  /** 바뀌지 않는 이름 — 소문자 · 숫자 · 점 · 하이픈(예: permit.food.banchan) */
  id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "id 는 소문자·숫자·점·하이픈").max(80),
  group: z.enum(FACT_GROUPS),
  /** 이 항목이 맞는 업종 — 사이트의 큰 분류. 비우면 업종과 상관없는 항목(예: 사업자등록) */
  sectors: z.array(z.enum(PROPOSAL_SECTORS)).default([]),
  /** 표준산업분류(KSIC 11차) 코드 앞자리. '5612' 면 5612로 시작하는 모든 세세분류 */
  ksic: z.array(z.string().regex(/^\d{2,5}$/)).default([]),
  /** 업종을 부르는 말(예: 반찬가게, 도시락) — 찾기에 쓴다 */
  keywords: z.array(z.string().trim().min(1).max(40)).min(1),
  /** 손님이 묻는 말 몇 가지 — 찾기에 쓴다 */
  questions: z.array(z.string().trim().min(2).max(200)).min(1),
  /** 손님에게 보일 답 — 쉬운 말 2~4문장 */
  answer: z.string().trim().min(10).max(800),
  /** 신청·문의하는 곳(예: 사업장 주소지 구청 위생 담당 부서) */
  agency: z.string().trim().min(1).max(120),
  basis: z.array(factBasisSchema).min(1),
  sources: z.array(factSourceSchema).min(1),
  /** 마지막으로 출처를 열어 확인한 날 · 사람 */
  checkedAt: isoDate,
  checkedBy: z.string().trim().min(1).max(40),
  /** 이 내용이 맞는 기간. 끝을 모르면 validTo 를 비운다 */
  validFrom: isoDate,
  validTo: isoDate.optional(),
  /** 이 날이 지나면 '다시 확인 필요' */
  recheckBy: isoDate,
  status: z.enum(["draft", "verified", "recheck"]),
});

export type BusinessFact = z.infer<typeof businessFactSchema>;
export type BusinessFactInput = z.input<typeof businessFactSchema>;
