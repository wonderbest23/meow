import PlanLoading from "./PlanLoading";

/**
 * 라우트 전환 로딩.
 * 화면 코드가 도착하기 전 구간은 지금까지 완전한 공백이었다 —
 * 느린 회선에서 아무 반응이 없어 멈춘 것처럼 보였다.
 */
export default function Loading() {
  return <PlanLoading variant="rows" note="불러오는 중…" />;
}
