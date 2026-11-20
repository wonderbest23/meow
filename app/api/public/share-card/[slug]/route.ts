import { getPublishedLandingBySlug } from "../../../../../lib/landing/repository";
import { shareCardView } from "../../../../../lib/landing/share-card";
import { renderShareCardPng } from "../../../../../lib/landing/share-card-png";

/*
 * 사진이 없는 공개 홈페이지의 카톡·문자 카드 그림(lib/landing/share-card.ts shareCardPath).
 * 가게 이름과 한 줄 소개만 그린다 — 공개된 홈페이지에 이미 보이는 글이라 로그인 없이 연다. AI 는 쓰지 않는다.
 * 글꼴은 계획서 PDF 와 같은 파일(public/fonts)을 받아 쓴다.
 */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const published = await getPublishedLandingBySlug(slug);
  if (!published) return new Response("not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const fontResponse = await fetch(new URL("/fonts/NanumGothic-Regular.ttf", request.url));
  if (!fontResponse.ok) return new Response("font unavailable", { status: 500, headers: { "Cache-Control": "no-store" } });
  const png = renderShareCardPng(shareCardView(published.config), new Uint8Array(await fontResponse.arrayBuffer()));
  // 주소 끝의 v 가 내용이 바뀌면 달라지므로 오래 붙들어도 된다
  return new Response(png as BodyInit, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600, s-maxage=86400" } });
}
