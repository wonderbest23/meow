/*
 * 도메인 구매 대행 — '도메인 구매 + 연결·호스팅 1년'.
 *
 * 사장님이 원하는 주소(예: mybrand.com)를 적고 결제하면 운영자가 사장님 명의로 등록기관(가비아 등)에서
 * 사서 www 를 오늘창업 연결 주소로 향하게 해 둔다(관리자 → 도메인 구매). 등록이 끝나면 사장님 화면의
 * '연결 시작'이 www.주소 로 채워져 한 번 누르면 끝난다. 지금은 사람이 사는 단계 — 수요가 쌓이면
 * 등록기관 리셀러 API 로 바꾼다.
 */

/** 파는 끝자리 — 첫해 등록비가 상품가에 들어 있어 값이 비슷한 것만 */
export const DOMAIN_PURCHASE_TLDS = ["co.kr", "com", "kr"] as const;

/** 입력 → 'mybrand.com' (www·http·경로 제거, 소문자). 못 파는 주소면 null */
export function normalizePurchaseDomain(input: string): string | null {
  let value = input.trim().toLowerCase();
  value = value.replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "").replace(/\.$/, "").replace(/^www\./, "");
  if (value.length < 4 || value.length > 70) return null;
  const tld = DOMAIN_PURCHASE_TLDS.find((item) => value.endsWith(`.${item}`));
  if (!tld) return null;
  const name = value.slice(0, -(tld.length + 1));
  // 한 단계 이름만(sub.mybrand.com 은 안 된다), 영문·숫자·하이픈, 하이픈으로 시작·끝나지 않게
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(name) || name.includes("--")) return null;
  if (name.length < 2) return null;
  return `${name}.${tld}`;
}

export type DomainRequestStatus = "requested" | "registered";
/*
 * 도메인 명의자 — 이용자 명의로 등록하려면 등록기관에 실명·연락처·주소가 필요하다.
 * 예전엔 결제 뒤 계정 이메일로 따로 받았다. 결제 화면에서 받아 두면 .com 은 자동 등록, .kr 은 운영자가 바로 등록한다.
 */
export type DomainRegistrant = { name: string; phone: string; postalCode: string; address: string; addressDetail: string };
export type DomainRequest = { domain: string; status: DomainRequestStatus; registeredAt?: string; registrant?: DomainRegistrant };

export function validateRegistrant(input: unknown): { ok: true; value: DomainRegistrant } | { ok: false; message: string } {
  const record = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const text = (key: string, max: number) => (typeof record[key] === "string" ? (record[key] as string).replace(/\s+/g, " ").trim().slice(0, max) : "");
  const name = text("name", 40), phone = text("phone", 20).replace(/[\s-]/g, ""), postalCode = text("postalCode", 10).replace(/\D/g, ""), address = text("address", 120), addressDetail = text("addressDetail", 80);
  if (name.length < 2) return { ok: false, message: "도메인 명의자 이름(실명)을 적어 주세요." };
  if (!/^01[016789]\d{7,8}$/.test(phone)) return { ok: false, message: "명의자 휴대폰 번호를 확인해 주세요." };
  if (!/^\d{5}$/.test(postalCode)) return { ok: false, message: "우편번호 5자리를 적어 주세요." };
  if (address.split(" ").length < 3) return { ok: false, message: "주소를 시·도부터 도로명까지 적어 주세요(예: 서울특별시 마포구 월드컵로 12)." };
  return { ok: true, value: { name, phone, postalCode, address, addressDetail } };
}

/** 등록기관 형식 — 시·도 / 시·군·구 / 나머지, 전화 +82.10… */
export function registrantContact(registrant: DomainRegistrant, email: string) {
  const [state, city, ...rest] = registrant.address.split(" ");
  return {
    email,
    phone: `+82.${registrant.phone.replace(/^0/, "")}`,
    postal_info: { name: registrant.name, address: { street: [rest.join(" "), registrant.addressDetail].filter(Boolean).join(", "), city, state, postal_code: registrant.postalCode, country_code: "KR" } },
  };
}

export function readDomainRequest(value: unknown): DomainRequest | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const domain = typeof record.domain === "string" ? normalizePurchaseDomain(record.domain) : null;
  if (!domain) return null;
  const status: DomainRequestStatus = record.status === "registered" ? "registered" : "requested";
  const registrant = record.registrant ? validateRegistrant(record.registrant) : null;
  return { domain, status, ...(typeof record.registeredAt === "string" ? { registeredAt: record.registeredAt } : {}), ...(registrant?.ok ? { registrant: registrant.value } : {}) };
}

/* 등록 여부 확인(RDAP) — 등록돼 있으면 200, 없으면 404. 그 밖은 '모름' */
const RDAP_BASE: Record<(typeof DOMAIN_PURCHASE_TLDS)[number], string> = {
  "com": "https://rdap.verisign.com/com/v1/domain/",
  "kr": "https://rdap.nic.or.kr/domain/",
  "co.kr": "https://rdap.nic.or.kr/domain/",
};

export type DomainAvailability = "available" | "taken" | "unknown";

export function rdapUrl(domain: string): string | null {
  const tld = DOMAIN_PURCHASE_TLDS.find((item) => domain.endsWith(`.${item}`));
  return tld ? `${RDAP_BASE[tld]}${encodeURIComponent(domain)}` : null;
}

export function availabilityFromStatus(status: number): DomainAvailability {
  return status === 404 ? "available" : status === 200 ? "taken" : "unknown";
}
