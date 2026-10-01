/*
 * 운영 기록 ← 홈페이지 문의 수.
 *
 * 사장님이 기간 기록을 적을 때 문의 건수를 일일이 세지 않아도 되게, 그 기간(한국 시간 기준 시작일
 * 0시 ~ 종료일 다음 날 0시)에 홈페이지로 들어온 문의를 세어 알려 준다. 방문 수는 방문자 동의가
 * 있을 때만 남아 실제보다 적으므로 싣지 않는다.
 */

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 한국 시간 날짜 두 개 → [시작, 끝) ISO 시각. 형식이 틀리거나 순서가 뒤집히면 null */
export function kstPeriodRange(start: string, end: string): { from: string; to: string } | null {
  if (!DATE.test(start) || !DATE.test(end) || start > end) return null;
  const from = Date.parse(`${start}T00:00:00+09:00`);
  const to = Date.parse(`${end}T00:00:00+09:00`) + 24 * 60 * 60_000;
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}

export type HomepageInquiries =
  | { linked: false }
  | { linked: true; published: boolean; inquiries: number };

/*
 * 문의 칸을 자동으로 채울지 — 비어 있거나, 앞서 자동으로 넣은 값 그대로일 때만(사장님이 고친 값은 두기).
 * 넣을 값이 없으면(홈페이지 없음·조회 실패) 바꾸지 않는다.
 */
export function autoInquiriesValue(current: string, lastAuto: string | null, found: HomepageInquiries | null): string | null {
  if (!found?.linked) return null;
  const next = String(found.inquiries);
  if (current === next) return null;
  return current === "" || (lastAuto !== null && current === lastAuto) ? next : null;
}
