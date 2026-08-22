/*
 * 결제 없이 홈페이지 편집기를 열어 볼 수 있는 계정.
 *
 * 운영자가 "어떤 형태인지 보고 싶다"고 해서 둔 것. 결제를 우회하는 일반 경로가
 * 아니라, 이메일이 정확히 맞는 계정에만 열린다. 목록은 환경변수
 * HOMEPAGE_EDITOR_PREVIEW_EMAILS(쉼표 구분)로 바꾸고, 없으면 운영자 계정 하나.
 * 결제가 붙는 부가 상품(도메인·토큰)은 이 목록과 무관하다 — 그건 여전히 산 만큼.
 */
const DEFAULT = ["rena35200@gmail.com"];

export function isEditorPreviewAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.HOMEPAGE_EDITOR_PREVIEW_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  return (list.length ? list : DEFAULT).includes(email.trim().toLowerCase());
}
