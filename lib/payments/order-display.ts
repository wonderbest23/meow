/*
 * 손님에게 보이는 상품 이름.
 * payment_orders.order_name 은 권한 판정 열쇠라 바꾸지 않는다(plan-orders.ts PLAN_PRODUCT_NAME 등) —
 * 영수증 메일·결제 내역처럼 손님이 읽는 곳에서만 이 이름으로 바꿔 보여 준다.
 * 화면(클라이언트)에서도 쓰므로 서버 전용 모듈을 불러오지 않는다.
 */

const DISPLAY_NAMES: Record<string, string> = {
  // PLAN_PRODUCT_NAME — 내부 이름 '플랜 빌더'는 손님이 모르는 말
  "사업계획서 플랜 빌더": "사업계획서",
  // HOMEPAGE_PRODUCT_NAME — 계획서로 만든 홈페이지의 수정·공개 권한
  "사업계획서 홈페이지": "홈페이지 수정·공개",
};

/** 저장된 상품 이름 → 손님에게 보일 이름. 모르는 이름(다른 상품·옛 주문)은 그대로 */
export function displayOrderName(orderName: string | null | undefined): string {
  const name = (orderName ?? "").trim();
  // 카드 결제창 상품명은 '사업계획서 플랜 빌더 · 유형' 꼴일 수 있다
  const [head, ...rest] = name.split(" · ");
  const mapped = DISPLAY_NAMES[head];
  if (!mapped) return name;
  return rest.length ? `${mapped} · ${rest.join(" · ")}` : mapped;
}
