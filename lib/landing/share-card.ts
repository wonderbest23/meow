import type { Metadata } from "next";
import { BUSINESS_TEMPLATE_PROFILES } from "./brainwave/business-content";
import { isPlaceholderPhoto, type LandingDraft } from "./domain";
import { PHOTO_SLOTS } from "./photo-library";

/*
 * 공개 홈페이지를 카카오톡·문자·인스타그램에 붙였을 때 뜨는 미리보기 카드.
 *
 * 사장님이 첫 손님에게 보내는 건 대개 카톡 링크다. 카드가 없으면 주소만 덩그러니 보여
 * 누르기 전부터 수상해 보인다 — 가게 이름, 한 줄 소개, 첫 화면 사진이 뜨게 한다.
 * 사진 주소는 절대 주소여야 카톡이 가져간다(metadataBase = 지금 들어온 주소).
 */

export const SHARE_FALLBACK_ORIGIN = "https://oneulstart.com";

const clip = (value: string, max: number) => {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/** 들어온 요청의 주소(연결한 도메인 포함). 알 수 없으면 오늘창업 주소 */
export function shareOrigin(host: string | null | undefined, proto: string | null | undefined): string {
  const name = (host ?? "").split(",")[0].trim().toLowerCase();
  if (!/^[a-z0-9.-]+(:\d+)?$/.test(name) || !name.includes(".") && !name.startsWith("localhost")) return SHARE_FALLBACK_ORIGIN;
  const scheme = (proto ?? "").split(",")[0].trim() === "http" && name.startsWith("localhost") ? "http" : "https";
  return `${scheme}://${name}`;
}

/** 첫 화면 한 줄 소개 — 디자인 페이지는 이름 아래 글, 없으면 부제 */
function shareTagline(config: LandingDraft): string {
  const bw = config.pageData?.brainwave;
  const id = bw ? BUSINESS_TEMPLATE_PROFILES[bw.page]?.description : undefined;
  const tagline = id ? bw?.texts[id]?.trim() : "";
  return tagline || config.subheadline;
}

/** 카드 사진 — 첫 화면 사진, 없으면 페이지의 다른 사진. 템플릿 견본 사진은 쓰지 않는다 */
export function shareImage(config: LandingDraft): string | null {
  const bw = config.pageData?.brainwave;
  const hidden = new Set(bw?.hidden ?? []);
  const usable = (url: string | undefined): url is string => Boolean(url && url.trim() && !isPlaceholderPhoto(url.trim()));
  const hero = bw ? PHOTO_SLOTS[bw.page]?.hero : undefined;
  const candidates = [
    hero && !hidden.has(hero) ? bw?.images[hero] : undefined,
    config.heroImageUrl,
    ...Object.entries(bw?.images ?? {}).filter(([id]) => !hidden.has(id)).map(([, url]) => url),
  ];
  const url = candidates.find(usable)?.trim();
  if (!url) return null;
  // 업종 사진(Unsplash)은 카톡 카드 비율(1.91:1)로 잘라 받는다
  if (url.startsWith("https://images.unsplash.com/")) {
    const next = new URL(url);
    next.searchParams.set("w", "1200");
    next.searchParams.set("h", "630");
    next.searchParams.set("fit", "crop");
    return next.toString();
  }
  return url;
}

export function landingShareMetadata(config: LandingDraft, origin: string): Metadata {
  const name = config.businessName.trim();
  const tagline = shareTagline(config);
  const lead = config.headline.trim() && config.headline.trim() !== name ? config.headline.trim() : tagline;
  const title = clip(lead ? `${name} | ${lead}` : name, 70);
  const description = clip(tagline || config.subheadline, 150);
  const image = shareImage(config);
  const sized = image?.startsWith("https://images.unsplash.com/") ? { width: 1200, height: 630 } : {};
  const images = image ? [{ url: image, ...sized, alt: name }] : undefined;
  return {
    metadataBase: new URL(origin),
    title,
    description,
    robots: { index: true, follow: true },
    openGraph: { type: "website", siteName: name, locale: "ko_KR", title, description, ...(images ? { images } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, ...(image ? { images: [image] } : {}) },
  };
}
