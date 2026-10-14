import { createHash, createSign } from "node:crypto";

/*
 * 구글 플레이 인앱결제 확인 — Google Play Developer API 로 구매 토큰을 조회하고, 결제를 반영한 뒤 '소모' 처리한다.
 *
 * 서버 비밀값 GOOGLE_PLAY_SERVICE_ACCOUNT_JSON(Play Console 에 연결한 서비스 계정의 JSON 키)이 있어야 한다.
 * 비밀값은 대표가 배포 설정(Cloudflare)에 직접 넣는다 — 저장소에 두지 않는다.
 * 소모 처리를 해야 같은 상품(다른 사업의 계획서)을 다시 살 수 있고, 3일 안에 확인(소모)하지 않은 결제는 구글이 자동 환불한다.
 */

type ServiceAccount = { client_email: string; private_key: string };
export type PlayPurchase = { orderId?: string; purchaseType?: number; purchaseState?: number; consumptionState?: number; acknowledgementState?: number; obfuscatedExternalAccountId?: string; purchaseTimeMillis?: string; regionCode?: string };

export class GooglePlayIapError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) { super(message); }
}

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    return parsed.client_email && parsed.private_key ? { client_email: parsed.client_email, private_key: parsed.private_key } : null;
  } catch {
    return null;
  }
}

export function googlePlayConfigured() {
  return serviceAccount() !== null;
}

/** 서비스 계정으로 1시간짜리 접근 토큰을 받는다(JWT 로그인) */
async function accessToken(account: ServiceAccount, fetcher: typeof fetch): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: account.client_email, scope: "https://www.googleapis.com/auth/androidpublisher", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key).toString("base64url");
  const response = await fetcher("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  const data = (await response.json().catch(() => ({}))) as { access_token?: string };
  if (!response.ok || !data.access_token) throw new GooglePlayIapError("PLAY_AUTH_FAILED", "구글 결제 확인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", 502);
  return data.access_token;
}

const base = (packageName: string, productId: string, token: string) =>
  `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;

/** 구매 토큰을 조회해 결제 완료·구매자 표시를 확인한다. 소모는 결제를 반영한 뒤 consumeGooglePurchase 로 한다 */
export async function verifyGooglePurchase(input: { packageName: string; productId: string; purchaseToken: string; accountId: string }, fetcher: typeof fetch = fetch): Promise<PlayPurchase & { token: string; transactionId: string; environment: string }> {
  const account = serviceAccount();
  if (!account) throw new GooglePlayIapError("PLAY_NOT_CONFIGURED", "구글 결제 확인 준비가 아직 끝나지 않았습니다. 잠시 후 다시 시도해 주세요.", 503);
  const token = await accessToken(account, fetcher);
  const response = await fetcher(base(input.packageName, input.productId, input.purchaseToken), { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404 || response.status === 400) throw new GooglePlayIapError("PLAY_PURCHASE_NOT_FOUND", "구글 결제 기록을 찾지 못했습니다.");
  if (!response.ok) throw new GooglePlayIapError("PLAY_LOOKUP_FAILED", "구글 결제를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.", 502);
  const purchase = (await response.json()) as PlayPurchase;
  // 0 = 결제 완료, 1 = 취소, 2 = 대기(편의점 결제 등)
  if (purchase.purchaseState !== 0) throw new GooglePlayIapError(purchase.purchaseState === 2 ? "PLAY_PENDING" : "PLAY_NOT_PURCHASED", purchase.purchaseState === 2 ? "결제가 아직 끝나지 않았습니다. 결제가 끝나면 자동으로 열립니다." : "취소된 결제입니다.");
  if ((purchase.obfuscatedExternalAccountId ?? "") !== input.accountId) throw new GooglePlayIapError("PLAY_ACCOUNT_MISMATCH", "다른 계정으로 결제한 영수증입니다.");
  // 시험 결제(purchaseType 0)는 주문 번호가 없을 수 있다 — 그때는 구매 토큰으로 거래를 구분한다(같은 토큰 → 같은 번호)
  const transactionId = purchase.orderId || `T${createHash("sha256").update(input.purchaseToken).digest("hex").slice(0, 40)}`;
  return { ...purchase, token, transactionId, environment: purchase.purchaseType === 0 ? "Test" : "Production" };
}

/** 결제를 반영한 뒤 소모 처리한다(같은 상품을 다시 살 수 있게, 자동 환불되지 않게). 이미 소모됐으면 그대로 둔다 */
export async function consumeGooglePurchase(input: { packageName: string; productId: string; purchaseToken: string; accessToken: string; consumptionState?: number }, fetcher: typeof fetch = fetch): Promise<void> {
  if (input.consumptionState === 1) return;
  const response = await fetcher(`${base(input.packageName, input.productId, input.purchaseToken)}:consume`, { method: "POST", headers: { Authorization: `Bearer ${input.accessToken}` } });
  if (!response.ok) console.error("[iap-google] 소모 처리 실패:", response.status);
}
