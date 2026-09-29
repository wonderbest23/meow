/*
 * 결제 없이 홈페이지 편집기를 열어 볼 수 있는 계정.
 *
 * 운영자가 "어떤 형태인지 보고 싶다"고 해서 둔 것. 결제를 우회하는 일반 경로가
 * 아니라, 이메일이 정확히 맞는 계정에만 열린다. 목록은 환경변수
 * HOMEPAGE_EDITOR_PREVIEW_EMAILS(쉼표 구분)로 바꾸고, 없으면 운영자 계정 하나.
 * 결제가 붙는 부가 상품(도메인·토큰)은 이 목록과 무관하다 — 그건 여전히 산 만큼.
 *
 * 같은 목록이 사업계획서 문서도 결제 없이 연다(운영자 테스트 계정). 실제 사용자 흐름과 AI 원가를
 * 운영에서 그대로 재 보려고 둔 것 — 결제 주문을 만들지 않으므로 매출 통계에는 섞이지 않는다.
 * rena35200+test@gmail.com 은 그 측정용 테스트 계정이다(Gmail 별칭이라 확인 메일은 운영자 메일함으로 간다).
 */
const DEFAULT = ["rena35200@gmail.com", "rena35200+test@gmail.com"];

export function isEditorPreviewAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.HOMEPAGE_EDITOR_PREVIEW_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return (list.length ? list : DEFAULT).includes(email.trim().toLowerCase());
}
