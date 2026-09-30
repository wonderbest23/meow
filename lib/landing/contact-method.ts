import { z } from "zod";
import { BUSINESS_TEMPLATE_PROFILES, businessTemplateManifest } from "./brainwave/business-content";

/*
 * 손님 연락 방법 — 홈페이지의 문의·예약 버튼을 누르면 어디로 가는지 한 번에 정한다.
 *
 * 예전에는 버튼마다 따로, 그것도 'tel:010-…' 같은 주소를 직접 써야 했다. 사장님은
 * "예약하기 누르면 전화 오게"를 원할 뿐이다 — 방법 하나를 고르고 번호나 주소만 넣으면
 * 첫 화면·중간·마무리 버튼이 모두 그쪽으로 이어진다. 휴대폰 화면 아래에는 같은 연락처로
 * 고정 버튼(전화·카톡·예약)을 띄운다.
 */

export const CONTACT_METHODS = ["form", "phone", "sms", "kakao", "booking", "store", "instagram"] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];
type LinkField = "kakaoUrl" | "bookingUrl" | "storeUrl" | "instagramUrl";

/*
 * 쓰는 중인 주소도 저장은 된다(저장이 막히면 다른 수정까지 날아간다). 대신 링크로 쓰는 곳은
 * 전부 isWebUrl 로 https 주소인지 다시 본다 — javascript: 같은 값은 절대 링크가 되지 않는다.
 */
const webUrl = z.string().trim().max(600);

export const landingContactSchema = z.object({
  method: z.enum(CONTACT_METHODS).default("form"),
  kakaoUrl: webUrl.default(""),
  bookingUrl: webUrl.default(""),
  storeUrl: webUrl.default(""),
  instagramUrl: webUrl.default(""),
  /** 휴대폰 화면 아래 고정 연락 버튼 */
  quickBar: z.boolean().default(true),
});
export type LandingContact = z.infer<typeof landingContactSchema>;
export const DEFAULT_CONTACT: LandingContact = { method: "form", kakaoUrl: "", bookingUrl: "", storeUrl: "", instagramUrl: "", quickBar: true };

export const CONTACT_METHOD_INFO: Record<ContactMethod, { label: string; cta: string; hint: string; field?: LinkField | "phone"; placeholder?: string }> = {
  form: { label: "문의 양식", cta: "문의하기", hint: "페이지 아래 문의 양식으로 내려가요. 들어온 문의는 '접수된 문의'에 쌓여요." },
  phone: { label: "전화 걸기", cta: "전화로 문의하기", hint: "휴대폰에서 누르면 바로 전화가 걸려요.", field: "phone", placeholder: "010-1234-5678" },
  sms: { label: "문자 보내기", cta: "문자로 문의하기", hint: "휴대폰에서 누르면 문자 쓰기 화면이 열려요.", field: "phone", placeholder: "010-1234-5678" },
  kakao: { label: "카카오톡 채널", cta: "카카오톡으로 문의하기", hint: "카카오톡 채널 채팅이 열려요.", field: "kakaoUrl", placeholder: "https://pf.kakao.com/_xxxxx" },
  booking: { label: "예약 페이지", cta: "예약하기", hint: "네이버 예약·캐치테이블 같은 예약 페이지가 열려요.", field: "bookingUrl", placeholder: "https://booking.naver.com/…" },
  store: { label: "온라인 스토어", cta: "구매하러 가기", hint: "스마트스토어 같은 판매 페이지가 열려요.", field: "storeUrl", placeholder: "https://smartstore.naver.com/…" },
  instagram: { label: "인스타그램", cta: "인스타그램으로 문의하기", hint: "인스타그램 계정이 열려요(DM으로 문의).", field: "instagramUrl", placeholder: "https://instagram.com/…" },
};

/** https 주소처럼 보이는지 — 쓰는 중인 주소('https://pf')는 아직 연결하지 않는다 */
export function isWebUrl(value: string): boolean {
  return /^https:\/\/[^\s/]+\.[^\s]+/i.test(value.trim());
}

/** 사장님이 'pf.kakao.com/…'처럼 넣어도 https 를 붙여 준다(칸에서 나갈 때) */
export function normalizeWebUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed.replace(/^http:\/\//i, "https://") : `https://${trimmed}`;
}

/** 전화번호에서 숫자만(국제번호 +는 남긴다). 8~15자리가 아니면 "" */
export function phoneDigits(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/** 초안의 사업자 전화번호(전화번호 칸, 없으면 연락처 칸에 적힌 번호) */
export function draftPhone(draft: { businessPhone?: string; businessContact?: string }): string {
  return phoneDigits(draft.businessPhone ?? "") || (draft.businessContact && !draft.businessContact.includes("@") ? phoneDigits(draft.businessContact) : "");
}

/** 연락 방법 → 버튼 링크 값. 번호·주소가 없으면 null(문의 양식으로 둔다) */
export function contactHref(contact: LandingContact, phone: string): string | null {
  const info = CONTACT_METHOD_INFO[contact.method];
  if (contact.method === "form") return "contact";
  if (info.field === "phone") return phone ? `${contact.method === "sms" ? "sms" : "tel"}:${phone}` : null;
  const url = info.field ? contact[info.field].trim() : "";
  return isWebUrl(url) ? url : null;
}

type DraftLike = {
  ctaLabel: string;
  businessPhone?: string;
  businessContact?: string;
  contact?: LandingContact;
  pageData?: { brainwave?: { page: string; texts: Record<string, string>; links: Record<string, string> } | null } | null;
};

/** 템플릿의 문의 버튼들(버튼 노드 id, 글 자리 id) — 사업 템플릿에서 '문의 버튼'으로 쓰는 자리 */
export function ctaButtons(page: string): Array<{ button: string; text: string }> {
  const profile = BUSINESS_TEMPLATE_PROFILES[page];
  const manifest = businessTemplateManifest[page];
  if (!profile || !manifest) return [];
  const out: Array<{ button: string; text: string }> = [];
  for (const section of manifest.sections) {
    for (const button of section.buttons) {
      const text = button.texts.find((id) => profile.fields[id] === "cta");
      if (text) out.push({ button: button.id, text });
    }
  }
  return out;
}

/**
 * 연락 방법을 바꾼 결과를 초안에 반영한다.
 * - 문의 버튼 링크: 비었거나 '문의 양식'이거나 이전 방법이 자동으로 넣은 링크인 버튼만 바꾼다
 *   (사장님이 버튼 하나를 따로 정해 둔 것은 그대로).
 * - 버튼 글: 기본 글('문의하기')이거나 이전 방법의 기본 글일 때만 새 방법의 글로 바꾼다
 *   (AI 가 쓴 '구독 문의하기'나 사장님 글은 그대로).
 */
export function applyContactMethod<T extends DraftLike>(previous: T, next: T): T {
  const bw = next.pageData?.brainwave;
  const before = previous.contact ?? DEFAULT_CONTACT;
  const after = next.contact ?? DEFAULT_CONTACT;
  const phone = draftPhone(next);
  const oldHref = contactHref(before, draftPhone(previous)) ?? "contact";
  const newHref = contactHref(after, phone) ?? "contact";
  const oldLabel = CONTACT_METHOD_INFO[before.method].cta;
  const newLabel = CONTACT_METHOD_INFO[after.method].cta;
  const autoLabel = (label: string | undefined) => !label || label === "문의하기" || label === oldLabel;
  const ctaLabel = autoLabel(next.ctaLabel) ? newLabel : next.ctaLabel;
  if (!bw) return { ...next, ctaLabel };
  const links = { ...bw.links };
  const texts = { ...bw.texts };
  for (const { button, text } of ctaButtons(bw.page)) {
    const current = links[button];
    if (current === undefined || current === "contact" || current === oldHref) {
      if (newHref === "contact") delete links[button]; else links[button] = newHref;
    }
    if (autoLabel(texts[text])) texts[text] = newLabel;
  }
  return { ...next, ctaLabel, pageData: { ...next.pageData, brainwave: { ...bw, links, texts } } } as T;
}

/**
 * 공개 화면에서 문의 버튼이 갈 곳 — 링크가 비었거나 '문의 양식'으로 남은 문의 버튼은 지금 연락 방법을 따른다.
 * 저장된 링크는 연락 방법을 저장할 때 한 번 맞춰지는데, 그 뒤 템플릿을 바꾸면 새 템플릿의 버튼이
 * 다시 '문의 양식'으로 만들어져 전화 연결이 풀렸다(운영 점검). 그리는 순간에 한 번 더 맞춘다.
 * 사장님이 버튼 하나를 따로 정해 둔 링크(다른 주소·'none')는 그대로 둔다.
 */
export function withContactLinks<T extends DraftLike>(config: T): T["pageData"] {
  const bw = config.pageData?.brainwave;
  if (!bw) return config.pageData;
  const href = contactHref(config.contact ?? DEFAULT_CONTACT, draftPhone(config));
  if (!href || href === "contact") return config.pageData;
  const links = { ...bw.links };
  for (const { button } of ctaButtons(bw.page)) if (links[button] === undefined || links[button] === "contact") links[button] = href;
  return { ...config.pageData, brainwave: { ...bw, links } };
}

export type QuickAction = { key: "phone" | "kakao" | "booking" | "store" | "form"; label: string; href: string };

/** 휴대폰 화면 아래 고정 버튼 — 넣어 둔 연락처만, 최대 3개. 하나뿐이면 문의 양식을 곁들인다 */
export function quickActions(contact: LandingContact | undefined, phone: string, leadCaptureEnabled: boolean): QuickAction[] {
  if (!contact?.quickBar) return [];
  const actions: QuickAction[] = [];
  if (phone) actions.push({ key: "phone", label: "전화", href: `tel:${phone}` });
  if (isWebUrl(contact.kakaoUrl)) actions.push({ key: "kakao", label: "카톡 문의", href: contact.kakaoUrl.trim() });
  if (isWebUrl(contact.bookingUrl)) actions.push({ key: "booking", label: "예약", href: contact.bookingUrl.trim() });
  else if (isWebUrl(contact.storeUrl)) actions.push({ key: "store", label: "구매", href: contact.storeUrl.trim() });
  if (!actions.length) return [];
  if (actions.length === 1 && leadCaptureEnabled) actions.push({ key: "form", label: "문의 남기기", href: "#landing-contact" });
  return actions.slice(0, 3);
}
