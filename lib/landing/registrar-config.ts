/*
 * 도메인 자동 등록(Cloudflare Registrar)이 켜져 있는지·이 주소가 자동 대상인지 — 결제 알림(ops-alerts)과
 * 자동 등록(domain-registrar)이 같은 판단을 쓰게 따로 둔다(서로 부르면 순환 참조가 된다).
 */
export const REGISTRAR_API_TLDS = ["com"] as const;
export type RegistrarConfig = { token: string; accountId: string };

export function registrarConfig(env: Record<string, string | undefined> = process.env): RegistrarConfig | null {
  const token = env.CLOUDFLARE_REGISTRAR_TOKEN?.trim() ?? "", accountId = env.CLOUDFLARE_REGISTRAR_ACCOUNT_ID?.trim() ?? "";
  return token && /^[a-f0-9]{32}$/.test(accountId) ? { token, accountId } : null;
}

export function registrarSupports(domain: string): boolean {
  return REGISTRAR_API_TLDS.some((tld) => domain.endsWith(`.${tld}`) && domain.split(".").length === 2);
}

