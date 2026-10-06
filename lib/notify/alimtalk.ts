/*
 * 카카오 알림톡 — 솔라피(SOLAPI, 카카오 공식 딜러) API. 켜져 있고 그 알림의 템플릿이 승인돼 있으면 문자보다 먼저 보낸다.
 *
 * 알림톡은 카카오가 미리 검수한 템플릿 글만 보낼 수 있다 — 글은 카카오 쪽 템플릿, 여기서는 #{변수} 값만 채운다.
 * 템플릿 글은 docs/alimtalk-templates.md 그대로 솔라피 콘솔에 등록하고, 승인된 템플릿 ID 를 SOLAPI_ALIMTALK_TEMPLATES 에 넣는다.
 * 실패하면(미설정·템플릿 없음·거절·시간 초과) 던지지 않고 null — 부르는 쪽이 지금처럼 알리고 중계 문자로 보낸다.
 * 알리고와 달리 고정 IP 가 필요 없어 Workers 에서 바로 부른다.
 *
 * 환경 변수
 *   SOLAPI_API_KEY, SOLAPI_API_SECRET — 솔라피 콘솔 API Key
 *   SOLAPI_PFID                       — 연동한 카카오 비즈니스 채널 ID(KA01PF…)
 *   SOLAPI_SENDER                     — (선택) 솔라피에 등록한 발신번호. 알림톡 실패 시 솔라피 문자 대체 발송에 쓴다
 *   SOLAPI_ALIMTALK_TEMPLATES         — {"payment-receipt":"KA01TP…", …} 알림 종류 → 승인된 템플릿 ID
 */

export type AlimtalkEvent =
  | "payment-receipt" | "homepage-lead" | "homepage-lead-contact" | "lead-received"
  | "domain-connect-started" | "tax-deadline" | "weekly-report";

const PRODUCTS: Record<string, string> = { plan: "사업계획서", homepage: "홈페이지", bundle: "계획서+홈페이지", regen: "다시 생성 10회", domain: "도메인 연결", "domain-purchase": "도메인 구매", tokens: "AI 수정 토큰" };
const TAX_KINDS: Record<string, string> = { income: "종합소득세", vat: "부가세" };

/** 알림 종류마다 템플릿의 #{변수}에 들어갈 값 — 템플릿 글(docs/alimtalk-templates.md)과 이름이 같아야 한다 */
export function alimtalkVariables(event: AlimtalkEvent, params: Record<string, unknown>): Record<string, string> | null {
  const text = (value: unknown, max: number) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  switch (event) {
    case "payment-receipt": return PRODUCTS[String(params.product)] && params.orderId ? { "#{상품}": PRODUCTS[String(params.product)], "#{주문번호}": text(params.orderId, 40) } : null;
    case "homepage-lead": return {};
    case "homepage-lead-contact": return params.name && params.phone ? { "#{이름}": text(params.name, 20), "#{연락처}": text(params.phone, 20) } : null;
    case "lead-received": return params.store ? { "#{가게}": text(params.store, 30) } : null;
    case "domain-connect-started": return params.domain ? { "#{도메인}": text(params.domain, 100) } : null;
    case "tax-deadline": return TAX_KINDS[String(params.kind)] && params.month && params.day ? { "#{세금}": TAX_KINDS[String(params.kind)], "#{마감일}": `${Number(params.month)}월 ${Number(params.day)}일`, "#{남은날}": String(Number(params.days)) } : null;
    case "weekly-report": return { "#{문의}": String(Number(params.leads) || 0), "#{전주문의}": String(Number(params.prevLeads) || 0), "#{방문}": String(Number(params.views) || 0) };
  }
}

export type AlimtalkConfig = { apiKey: string; apiSecret: string; pfId: string; sender: string; templates: Partial<Record<AlimtalkEvent, string>> };

export function alimtalkConfig(env: Record<string, string | undefined> = process.env): AlimtalkConfig | null {
  const apiKey = env.SOLAPI_API_KEY?.trim() ?? "", apiSecret = env.SOLAPI_API_SECRET?.trim() ?? "", pfId = env.SOLAPI_PFID?.trim() ?? "";
  if (!apiKey || !apiSecret || !pfId) return null;
  let templates: Partial<Record<AlimtalkEvent, string>> = {};
  try {
    const parsed = JSON.parse(env.SOLAPI_ALIMTALK_TEMPLATES || "{}") as Record<string, unknown>;
    templates = Object.fromEntries(Object.entries(parsed).filter(([, id]) => typeof id === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(id))) as typeof templates;
  } catch { console.error("[alimtalk] SOLAPI_ALIMTALK_TEMPLATES is not JSON"); }
  const sender = env.SOLAPI_SENDER?.replace(/\D/g, "") ?? "";
  return { apiKey, apiSecret, pfId, sender, templates };
}

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** 솔라피 인증 머리말 — HMAC-SHA256(date + salt) */
export async function solapiAuthorization(config: Pick<AlimtalkConfig, "apiKey" | "apiSecret">, date = new Date().toISOString(), salt = crypto.randomUUID().replace(/-/g, "")): Promise<string> {
  return `HMAC-SHA256 apiKey=${config.apiKey}, date=${date}, salt=${salt}, signature=${await hmacHex(config.apiSecret, date + salt)}`;
}

export type AlimtalkResult = { status: "accepted"; code: "ALIMTALK_SENT" };

/** 보냈으면 결과, 못 보냈으면 null(부르는 쪽이 문자로) */
export async function sendAlimtalk(event: AlimtalkEvent, recipient: string, params: Record<string, unknown>, config: AlimtalkConfig | null = alimtalkConfig(), transport: typeof fetch = fetch, timeoutMs = 5000): Promise<AlimtalkResult | null> {
  const templateId = config?.templates[event];
  if (!config || !templateId || !/^010\d{8}$/.test(recipient)) return null;
  const variables = alimtalkVariables(event, params);
  if (!variables) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const message: Record<string, unknown> = { to: recipient, kakaoOptions: { pfId: config.pfId, templateId, variables, disableSms: !config.sender } };
    if (config.sender) message.from = config.sender;
    const response = await transport("https://api.solapi.com/messages/v4/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: await solapiAuthorization(config) },
      body: JSON.stringify({ message }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as { statusCode?: string; errorCode?: string; errorMessage?: string };
    // 접수 성공은 statusCode 2000(정상 접수). 그 밖은 실패로 보고 문자로 물러선다
    if (response.ok && (!body.statusCode || body.statusCode === "2000")) return { status: "accepted", code: "ALIMTALK_SENT" };
    console.error("[alimtalk] rejected", event, response.status, body.statusCode ?? body.errorCode, body.errorMessage);
    return null;
  } catch (error) {
    console.error("[alimtalk] failed", event, error);
    return null;
  } finally { clearTimeout(timer); }
}
