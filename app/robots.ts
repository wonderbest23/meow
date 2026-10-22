import type { MetadataRoute } from "next";
import { headers } from "next/headers";

/*
 * 검색 로봇 안내 — 공개 화면(홈·약관·안내)만 열고, 로그인한 사람의 작업 화면·관리자·API 는 막는다.
 * 손님 홈페이지(/launch/…, 손님 도메인)는 공개 화면이라 막지 않는다. 사이트맵은 오늘창업 주소에서만 알린다
 * (손님 도메인의 robots.txt 가 오늘창업 사이트맵을 가리키지 않게).
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = ((await headers()).get("x-forwarded-host") ?? (await headers()).get("host") ?? "").toLowerCase().replace(/:\d+$/, "");
  const ours = host === "oneulstart.com" || host === "www.oneulstart.com";
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/plan", "/account", "/admin", "/payment", "/dev"] },
    ...(ours ? { sitemap: "https://oneulstart.com/sitemap.xml" } : {}),
  };
}
