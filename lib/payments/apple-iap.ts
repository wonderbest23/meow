import { X509Certificate, createHash, verify } from "node:crypto";

/*
 * 애플 인앱결제 영수증(StoreKit 2 JWS) 확인 — 애플 서버에 묻지 않고 서명만으로 확인한다(애플 SignedDataVerifier 와 같은 방식).
 *
 * 1) 머리말의 인증서 3장(x5c: 잎 → 중간 → 루트)이 애플 루트 인증서(Apple Root CA - G3)로 이어지는지
 * 2) 잎 인증서 키로 JWS 서명이 맞는지(ES256)
 * 3) 우리 앱(번들 ID)·상품·구매자(appAccountToken)·환불 여부
 * 를 차례로 본다. 하나라도 어긋나면 결제를 반영하지 않는다.
 */

/** Apple Root CA - G3 의 SHA-256 지문(https://www.apple.com/certificateauthority/AppleRootCA-G3.cer 에서 확인, 2039-04-30 만료) */
export const APPLE_ROOT_G3_SHA256 = "63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79";
/* 애플이 인앱결제 서명 인증서에 넣는 표시(OID) — 다른 용도의 애플 인증서로 만든 서명을 거른다 */
const OID_RECEIPT_SIGNER = "1.2.840.113635.100.6.11.1";
const OID_WWDR_INTERMEDIATE = "1.2.840.113635.100.6.2.1";

export type AppleTransaction = {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  type: string;
  environment: "Production" | "Sandbox" | string;
  appAccountToken?: string;
  purchaseDate: number;
  revocationDate?: number;
  price?: number;
  currency?: string;
};

export class AppleIapError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

const b64url = (text: string) => Buffer.from(text.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** OID 를 DER 인코딩 바이트로 — 인증서 안에 그 확장이 있는지 찾는 데 쓴다 */
function oidBytes(oid: string): Buffer {
  const parts = oid.split(".").map(Number);
  const body: number[] = [parts[0] * 40 + parts[1]];
  for (const value of parts.slice(2)) {
    const chunk: number[] = [];
    let rest = value;
    do { chunk.unshift(rest & 0x7f); rest = Math.floor(rest / 128); } while (rest > 0);
    for (let i = 0; i < chunk.length - 1; i += 1) chunk[i] |= 0x80;
    body.push(...chunk);
  }
  return Buffer.from([0x06, body.length, ...body]);
}

const hasOid = (cert: X509Certificate, oid: string) => cert.raw.includes(oidBytes(oid));

function validAt(cert: X509Certificate, at: Date) {
  return new Date(cert.validFrom).getTime() <= at.getTime() && at.getTime() <= new Date(cert.validTo).getTime();
}

/**
 * JWS 를 확인하고 거래 내용을 돌려준다. 확인에 실패하면 AppleIapError 를 던진다.
 * now·rootFingerprint 는 시험용 — 인증서 유효 기간을 이 시각으로 보고(애플 권장: 거래 시각이 아니라 지금), 시험 인증서 사슬을 쓴다.
 */
export function verifyAppleTransaction(jws: string, expect: { bundleId: string; productId?: string; appAccountToken?: string }, now = new Date(), rootFingerprint = APPLE_ROOT_G3_SHA256): AppleTransaction {
  const [headerPart, payloadPart, signaturePart] = jws.split(".");
  if (!headerPart || !payloadPart || !signaturePart) throw new AppleIapError("APPLE_JWS_MALFORMED", "영수증 형식이 올바르지 않습니다.");
  let header: { alg?: string; x5c?: string[] };
  let payload: AppleTransaction;
  try {
    header = JSON.parse(b64url(headerPart).toString("utf8"));
    payload = JSON.parse(b64url(payloadPart).toString("utf8"));
  } catch {
    throw new AppleIapError("APPLE_JWS_MALFORMED", "영수증 형식이 올바르지 않습니다.");
  }
  if (header.alg !== "ES256" || !Array.isArray(header.x5c) || header.x5c.length !== 3) throw new AppleIapError("APPLE_JWS_HEADER", "영수증 서명 정보가 올바르지 않습니다.");

  const [leaf, intermediate, root] = header.x5c.map((der) => new X509Certificate(Buffer.from(der, "base64")));
  // 1) 인증서 사슬: 루트는 애플 G3, 중간은 루트가, 잎은 중간이 서명했고 모두 지금 유효해야 한다
  if (root.fingerprint256 !== rootFingerprint) throw new AppleIapError("APPLE_ROOT_MISMATCH", "애플이 발급한 영수증이 아닙니다.");
  if (!intermediate.verify(root.publicKey) || !leaf.verify(intermediate.publicKey)) throw new AppleIapError("APPLE_CHAIN_INVALID", "영수증 인증서가 올바르지 않습니다.");
  if (![leaf, intermediate, root].every((cert) => validAt(cert, now))) throw new AppleIapError("APPLE_CERT_EXPIRED", "영수증 인증서의 유효 기간이 지났습니다.");
  if (!hasOid(leaf, OID_RECEIPT_SIGNER) || !hasOid(intermediate, OID_WWDR_INTERMEDIATE)) throw new AppleIapError("APPLE_CERT_PURPOSE", "인앱결제용 인증서가 아닙니다.");

  // 2) 서명: ES256 은 r‖s(64바이트) 그대로 붙어 있다
  // 키는 PEM 글자로 넘긴다 — 운영(Cloudflare workerd)의 verify 는 KeyObject 를 받지 않아(ERR_INVALID_ARG_TYPE) 모든 영수증이 500 으로 막혔다(2026-10-16 TestFlight 결제)
  const leafKeyPem = leaf.publicKey.export({ type: "spki", format: "pem" }) as string;
  const signed = verify("sha256", Buffer.from(`${headerPart}.${payloadPart}`), { key: leafKeyPem, dsaEncoding: "ieee-p1363" }, b64url(signaturePart));
  if (!signed) throw new AppleIapError("APPLE_SIGNATURE_INVALID", "영수증 서명이 맞지 않습니다.");

  // 3) 내용: 우리 앱·주문한 상품·구매한 사람·환불되지 않음
  if (payload.bundleId !== expect.bundleId) throw new AppleIapError("APPLE_BUNDLE_MISMATCH", "다른 앱의 영수증입니다.");
  if (expect.productId && payload.productId !== expect.productId) throw new AppleIapError("APPLE_PRODUCT_MISMATCH", "결제한 상품이 다릅니다.");
  if (expect.appAccountToken && (payload.appAccountToken ?? "").toLowerCase() !== expect.appAccountToken.toLowerCase()) throw new AppleIapError("APPLE_ACCOUNT_MISMATCH", "다른 계정으로 결제한 영수증입니다.");
  if (payload.revocationDate) throw new AppleIapError("APPLE_REVOKED", "환불되었거나 취소된 결제입니다.");
  if (!payload.transactionId) throw new AppleIapError("APPLE_JWS_MALFORMED", "영수증에 거래 번호가 없습니다.");
  return payload;
}

/**
 * 구매자 표시(appAccountToken) — 애플은 UUID 모양을 요구한다. 계정마다 늘 같은 값이 나오게 만든다(UUID v5 모양).
 * 비밀값이 아니어도 된다: 다른 사람이 산 영수증을 내 계정으로 가져오는 것만 막으면 되기 때문이다.
 */
export function appAccountTokenFor(userId: string): string {
  const hex = createHash("sha256").update(`oneulstart-iap:${userId}`).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
