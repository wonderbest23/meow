import type { PlanProduct } from "./plan-orders";

/*
 * 앱(아이폰·안드로이드) 인앱결제 상품.
 *
 * 앱스토어·구글 플레이 규칙: 앱 안에서 파는 디지털 상품(계획서 작성·홈페이지·다시 생성)은 스토어 결제로만 받는다.
 * 상품 ID는 App Store Connect·Play Console에 같은 이름으로 등록한다(한 번 쓰면 바꿀 수 없다).
 * 모두 '소모성' 상품이다 — 사업(계획서)마다 새로 사기 때문이다(비소모성은 계정당 한 번만 살 수 있다).
 * 도메인 연결·구매는 앱에서 팔지 않는다(웹에서만).
 */
export const IAP_PRODUCT_IDS = {
  plan: "oneulstart.plan",
  bundle: "oneulstart.bundle",
  homepage: "oneulstart.homepage",
  regen: "oneulstart.regen10",
} as const satisfies Partial<Record<PlanProduct, string>>;

export type IapProduct = keyof typeof IAP_PRODUCT_IDS;

/** 앱의 번들 ID(아이폰)·패키지 이름(안드로이드) */
export const APP_BUNDLE_ID = "com.oneulstart.app";

export function iapProduct(value: unknown): IapProduct | null {
  return (Object.keys(IAP_PRODUCT_IDS) as IapProduct[]).find((key) => key === value) ?? null;
}

export function iapProductFromStoreId(storeId: string): IapProduct | null {
  return (Object.entries(IAP_PRODUCT_IDS) as Array<[IapProduct, string]>).find(([, id]) => id === storeId)?.[0] ?? null;
}
