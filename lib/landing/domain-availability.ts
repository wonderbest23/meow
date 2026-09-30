import { availabilityFromStatus, rdapUrl, type DomainAvailability } from "./domain-purchase";

/*
 * 주소가 이미 등록돼 있는지 등록소(RDAP)에 묻는다 — .com 은 Verisign, .kr·.co.kr 은 KISA.
 * 답이 늦거나 이상하면 'unknown' — 결제는 막지 않고 운영자가 등록 때 다시 확인한다
 * (못 사면 전액 환불하거나 다른 주소로 바꾼다).
 */
export async function checkDomainAvailability(domain: string, timeoutMs = 5000): Promise<DomainAvailability> {
  const url = rdapUrl(domain);
  if (!url) return "unknown";
  try {
    const response = await fetch(url, { headers: { accept: "application/rdap+json, application/json" }, cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
    return availabilityFromStatus(response.status);
  } catch {
    return "unknown";
  }
}
