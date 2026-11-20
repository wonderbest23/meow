/*
 * 문서에 적는 날짜 — 정부 공문서 표기(「행정업무의 운영 및 혁신에 관한 규정」 제7조제5항: 숫자로 적고 연 · 월 · 일 글자 대신 온점).
 * 예: 2026. 11. 20.
 * toLocaleDateString("ko-KR")은 실행 환경에 따라 '2026/11/20'으로도 나와(로컬 PDF 확인 2026-11-20) 직접 만든다. 한국 시각 기준.
 */
export function officialDate(value: Date | string | number): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${kst.getUTCFullYear()}. ${kst.getUTCMonth() + 1}. ${kst.getUTCDate()}.`;
}
