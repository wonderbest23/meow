import type { Metadata } from "next";

/*
 * 공유·검색 카드 기본값. 화면마다 openGraph 를 따로 쓰면 Next 는 부모(app/layout.tsx)의 openGraph 를 통째로
 * 갈아 끼우므로(사진·사이트 이름이 빠진다) 여기 값을 함께 넣는다. 주소는 layout 의 metadataBase(https://oneulstart.com) 기준.
 * 손님 홈페이지(/launch, 내 도메인)는 lib/landing/share-card.ts 가 자기 카드를 따로 만든다.
 */
export const SITE_NAME = "오늘창업";
export const SHARE_IMAGE = { url: "/og-image-2026.png", width: 1200, height: 630, alt: "오늘창업 — 대화로 만드는 사업계획서와 홈페이지" };

export function sharedOpenGraph(title: string, description: string, url: string): NonNullable<Metadata["openGraph"]> {
  return { siteName: SITE_NAME, locale: "ko_KR", type: "website", title, description, url, images: [SHARE_IMAGE] };
}

/** 공개 화면 하나의 제목·설명·대표 주소(canonical)·공유 카드 */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const full = `${title} | ${SITE_NAME}`;
  return {
    title: full,
    description,
    alternates: { canonical: path },
    openGraph: sharedOpenGraph(full, description, path),
  };
}
