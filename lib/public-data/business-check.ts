/*
 * 공공데이터포털(data.go.kr) 무료 API로 '등록·신고가 끝났는지' 확인한다 — 신청 자체는 API 가 없다.
 *
 * - 국세청 사업자등록 상태조회: POST https://api.odcloud.kr/api/nts-businessman/v1/status
 *   본문 {"b_no":["1234567890"]} → data[0].b_stt_cd 01 계속·02 휴업·03 폐업, 미등록이면 b_stt_cd 가 비고
 *   tax_type 에 "국세청에 등록되지 않은 사업자등록번호입니다." 가 온다.
 * - 공정위 통신판매사업자 등록상세: GET https://apis.data.go.kr/1130000/MllBsDtl_3Service/getMllBsInfoDetail_3
 *   ?serviceKey&pageNo=1&numOfRows=…&resultType=json&brno= → items.item(하나면 객체, 여럿이면 배열)
 *
 * 키는 DATA_GO_KR_SERVICE_KEY(포털의 '일반 인증키(Decoding)'). 두 API 모두 포털에서 각각 '활용신청'을 눌러야 열린다.
 * 키가 없거나 응답이 이상하면 던지지 않고 unavailable 로 돌려준다 — 화면은 '지금 확인할 수 없어요'만 보인다.
 */

export type BusinessState = "active" | "suspended" | "closed" | "unregistered";
export type BusinessStatus = { state: BusinessState; taxType: string; closedAt: string };
export type MailOrderState = "reported" | "closed" | "none";
export type MailOrderStatus = { state: MailOrderState; reportNo: string; reportedAt: string; operStatus: string; domain: string };
export type BusinessCheck = { businessNumber: string; business: BusinessStatus | null; mailOrder: MailOrderStatus | null; checkedAt: string };

const NTS_STATUS = "https://api.odcloud.kr/api/nts-businessman/v1/status";
const FTC_MAIL_ORDER = "https://apis.data.go.kr/1130000/MllBsDtl_3Service/getMllBsInfoDetail_3";

/** 하이픈·공백을 빼고 10자리 + 국세청 검증 숫자가 맞을 때만 */
export function normalizeBusinessNumber(value: unknown): string | null {
  const digits = String(value ?? "").replace(/[\s-]/g, "");
  if (!/^\d{10}$/.test(digits)) return null;
  const d = [...digits].map(Number);
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = weights.reduce((total, weight, index) => total + d[index] * weight, 0);
  sum += Math.floor((d[8] * 5) / 10);
  return (10 - (sum % 10)) % 10 === d[9] ? digits : null;
}

export function formatBusinessNumber(digits: string): string {
  return /^\d{10}$/.test(digits) ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` : digits;
}

const ymd = (value: unknown) => {
  const text = String(value ?? "").replace(/\D/g, "");
  return text.length === 8 ? `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}` : "";
};

export function parseNtsStatus(json: unknown): BusinessStatus | null {
  const row = (json as { data?: Array<Record<string, unknown>> } | null)?.data?.[0];
  if (!row) return null;
  const code = String(row.b_stt_cd ?? "");
  const taxType = String(row.tax_type ?? "");
  const state: BusinessState | null = code === "01" ? "active" : code === "02" ? "suspended" : code === "03" ? "closed" : /등록되지 않은/.test(taxType) ? "unregistered" : null;
  if (!state) return null;
  return { state, taxType: state === "unregistered" ? "" : taxType, closedAt: ymd(row.end_dt) };
}

export function parseFtcMailOrder(json: unknown): MailOrderStatus | null {
  const body = (json as { response?: { body?: unknown } } | null)?.response?.body ?? json;
  const box = body as { totalCount?: unknown; items?: { item?: unknown } | unknown[] | "" } | null;
  if (!box || typeof box !== "object") return null;
  const raw = Array.isArray(box.items) ? box.items : (box.items as { item?: unknown } | "" | undefined) && typeof box.items === "object" ? (box.items as { item?: unknown }).item : undefined;
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Array<Record<string, unknown>>;
  if (!list.length) return Number(box.totalCount ?? 0) === 0 || box.items === "" || box.items === undefined ? { state: "none", reportNo: "", reportedAt: "", operStatus: "", domain: "" } : null;
  // 같은 번호로 여러 건이면 영업 중인 것을, 없으면 가장 최근 신고를
  const open = list.find((item) => !/폐업|취소|말소/.test(String(item.operSttusCdNm ?? "")));
  const pick = open ?? [...list].sort((a, b) => String(b.dclrDate ?? "").localeCompare(String(a.dclrDate ?? "")))[0];
  const reportNo = [pick.prmmiYr, pick.prmmiMnno].map((part) => String(part ?? "").trim()).filter(Boolean).join("-");
  return { state: open ? "reported" : "closed", reportNo, reportedAt: ymd(pick.dclrDate), operStatus: String(pick.operSttusCdNm ?? ""), domain: String(pick.domnCn ?? "") };
}

type Fetch = typeof fetch;

function serviceKey(): string {
  return (process.env.DATA_GO_KR_SERVICE_KEY ?? "").trim();
}

export function publicDataConfigured(): boolean {
  return Boolean(serviceKey());
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms = 5000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await work(controller.signal); } finally { clearTimeout(timer); }
}

export async function lookupBusinessStatus(businessNumber: string, fetcher: Fetch = fetch): Promise<BusinessStatus | null> {
  const key = serviceKey();
  if (!key) return null;
  try {
    return await withTimeout(async (signal) => {
      const response = await fetcher(`${NTS_STATUS}?serviceKey=${encodeURIComponent(key)}&returnType=JSON`, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ b_no: [businessNumber] }), signal,
      });
      if (!response.ok) { console.error("[public-data] nts status http", response.status); return null; }
      return parseNtsStatus(await response.json());
    });
  } catch (error) {
    console.error("[public-data] nts status failed", error);
    return null;
  }
}

export async function lookupMailOrder(businessNumber: string, fetcher: Fetch = fetch): Promise<MailOrderStatus | null> {
  const key = serviceKey();
  if (!key) return null;
  try {
    return await withTimeout(async (signal) => {
      const query = new URLSearchParams({ serviceKey: key, pageNo: "1", numOfRows: "10", resultType: "json", brno: businessNumber });
      const response = await fetcher(`${FTC_MAIL_ORDER}?${query}`, { headers: { Accept: "application/json" }, signal });
      if (!response.ok) { console.error("[public-data] ftc mail-order http", response.status); return null; }
      const text = await response.text();
      // 키 오류 등은 200 + XML 로 온다 — JSON 이 아니면 확인 불가로
      try { return parseFtcMailOrder(JSON.parse(text)); } catch { console.error("[public-data] ftc mail-order non-json", text.slice(0, 200)); return null; }
    });
  } catch (error) {
    console.error("[public-data] ftc mail-order failed", error);
    return null;
  }
}

export async function checkBusiness(businessNumber: string, fetcher: Fetch = fetch, now = new Date()): Promise<BusinessCheck> {
  const [business, mailOrder] = await Promise.all([lookupBusinessStatus(businessNumber, fetcher), lookupMailOrder(businessNumber, fetcher)]);
  return { businessNumber, business, mailOrder, checkedAt: now.toISOString() };
}

/** 화면에 보일 한 줄 — 상태 칩 */
export function businessStateLabel(status: BusinessStatus | null): string {
  if (!status) return "지금 확인할 수 없어요";
  return { active: "등록됨 · 계속사업자", suspended: "휴업 중", closed: `폐업${status.closedAt ? ` (${status.closedAt})` : ""}`, unregistered: "국세청에 없는 번호예요" }[status.state];
}

export function mailOrderStateLabel(status: MailOrderStatus | null): string {
  if (!status) return "지금 확인할 수 없어요";
  return { reported: `신고됨${status.reportNo ? ` · ${status.reportNo}` : ""}`, closed: "신고가 폐업·취소 상태예요", none: "아직 신고 기록이 없어요" }[status.state];
}
