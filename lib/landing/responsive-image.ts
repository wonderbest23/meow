/*
 * 업종 사진(Unsplash)을 화면 크기에 맞는 폭으로 받게 한다.
 *
 * 홈페이지 사진은 모두 w=1800 주소로 저장된다. 폰(폭 320~430px)에서도 1800px(약 340KB)을
 * 받아 첫 화면이 느렸다. Unsplash 는 주소의 w= 만 바꾸면 그 폭으로 잘라 보내 주므로
 * 800·1200·1800 세 가지를 srcset 으로 알려 주고, 브라우저가 화면 폭·배율에 맞는 것을 고르게 한다.
 *
 * src(저장된 주소)는 그대로 둔다 — 편집기의 사진 바꾸기·저장·비교는 늘 src 를 본다.
 * 직접 올린 사진처럼 Unsplash 주소가 아니거나 w= 가 없으면 아무것도 붙이지 않는다.
 */

const UNSPLASH = "https://images.unsplash.com/";
export const RESPONSIVE_PHOTO_WIDTHS = [800, 1200, 1800] as const;

/** 사진 자리마다 고를 폭 — 화면 폭 기준. 첫 화면 큰 사진은 세로가 긴 칸을 가로 사진으로 채워(cover) 더 넓게 본다 */
export const PHOTO_SIZES = {
  /* 폰 세로 화면의 첫 화면 사진은 가로 사진의 가운데만 보여 화면 폭보다 1.5배쯤 넓은 원본이 있어야 흐려지지 않는다 */
  hero: "(max-width: 700px) 150vw, 100vw",
  full: "100vw",
} as const;

export function unsplashSrcSet(url: string | null | undefined): string | undefined {
  if (!url || !url.startsWith(UNSPLASH)) return undefined;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return undefined; }
  const original = Number(parsed.searchParams.get("w"));
  if (!Number.isFinite(original) || original <= 0) return undefined;
  /* 높이(h=)까지 정해 잘라 받는 주소는 폭만 바꾸면 비율이 달라진다 — 그대로 둔다 */
  if (parsed.searchParams.has("h")) return undefined;
  const widths = RESPONSIVE_PHOTO_WIDTHS.filter(width => width < original);
  if (!widths.length) return undefined;
  const entries = widths.map(width => {
    const next = new URL(parsed);
    next.searchParams.set("w", String(width));
    if (!next.searchParams.has("auto")) next.searchParams.set("auto", "format");
    return `${next.toString()} ${width}w`;
  });
  /* 원본 폭도 후보에 넣는다 — 주소는 URL 이 정리한 모양으로(빈칸 등이 srcset 을 끊지 않게) */
  entries.push(`${parsed.toString()} ${original}w`);
  return entries.join(", ");
}

/** <img> 에 펼쳐 넣는 값 — Unsplash 사진이면 srcSet·sizes, 아니면 빈 값 */
export function responsivePhotoProps(url: string | null | undefined, sizes: string = PHOTO_SIZES.full): { srcSet?: string; sizes?: string } {
  const srcSet = unsplashSrcSet(url);
  return srcSet ? { srcSet, sizes } : {};
}
