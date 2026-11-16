/*
 * 영업일 — 계산표가 쓰는 '한 달 며칠 여는지'를 한 곳에서 정한다(2026-11-16 사장님: 가정을 코드에 박지 말고 사업 정보 표의 칸으로).
 * 예전엔 '하루 ○건 × 월 26일'의 26 이 계산 코드 열 군데에 박혀 있어, "주말에만 할 거야"라고 해도 계산은 26일 그대로였다.
 * 표의 '주당 영업일' 칸(operatingDays, 값 예: "주 2일")이 있으면 그 날수로, 없으면 예전처럼 월 26일(주 6일)로 계산한다.
 */
export const DEFAULT_DAYS_PER_MONTH = 26;
export const OPERATING_DAYS_KEY = "operatingDays";

/** 주 며칠 → 한 달 며칠(52주 ÷ 12개월). 주 6일이 예전 가정 26일과 같다. 범위를 벗어나면 기본값 */
export function daysPerMonth(daysPerWeek: number | null | undefined): number {
  if (daysPerWeek == null || !Number.isFinite(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7) return DEFAULT_DAYS_PER_MONTH;
  return Math.round(daysPerWeek * 52 / 12);
}

/** 칸 값("주 2일" · "2")에서 주당 영업일을 읽는다. 1~7 이 아니면 null */
export function parseOperatingDays(value: string | number | null | undefined): number | null {
  const match = String(value ?? "").match(/[1-7](?!\d)/);
  const days = match && !/\d[\d.]/.test(String(value)) ? Number(match[0]) : null;
  return days && days >= 1 && days <= 7 ? days : null;
}
export const operatingDaysValue = (daysPerWeek: number) => `주 ${daysPerWeek}일`;

/** 사업 정보 표(칸 목록)에서 한 달 영업일 — 칸이 없으면 기본값(월 26일) */
export function monthDaysFromFields(fields: Iterable<{ key: string; value: string }>): number {
  for (const field of fields) if (field.key === OPERATING_DAYS_KEY) return daysPerMonth(parseOperatingDays(field.value));
  return DEFAULT_DAYS_PER_MONTH;
}
