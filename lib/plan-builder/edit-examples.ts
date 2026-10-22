/**
 * 채팅 수정 예시 — 가격 예시는 지금 가격의 약 10% 위(알맞게 반올림)로 만든다.
 * 예전엔 늘 '6만 5천원'이라 4,500원짜리 빵집에도 그 값이 떠서 엉뚱해 보였다(실제 생성 2026-10-22). 가격이 없으면 가격 예시를 뺀다.
 */
export function editExamples(price: unknown): string[] {
  const rest = ["주 고객을 1인 가구로 바꿔줘", "목표를 1년 안에 단골 100명으로"];
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return ["일주일에 쓸 수 있는 시간을 20시간으로 바꿔줘", ...rest];
  const step = price < 10_000 ? 100 : price < 100_000 ? 1_000 : price < 1_000_000 ? 10_000 : 100_000;
  let next = Math.round(price * 1.1 / step) * step;
  if (next <= price) next = price + step;
  return [`가격을 ${new Intl.NumberFormat("ko-KR").format(next)}원으로 바꿔줘`, ...rest];
}
