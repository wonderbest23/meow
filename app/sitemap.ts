import type { MetadataRoute } from "next";

/* 공개 화면만 — 로그인 화면·작업 화면(/plan, /account)은 넣지 않는다(app/robots.ts) */
const BASE = "https://oneulstart.com";
const PUBLIC_PAGES: Array<{ path: string; priority: number; changeFrequency: "weekly" | "monthly" }> = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/terms", priority: 0.3, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "monthly" },
  { path: "/refund", priority: 0.3, changeFrequency: "monthly" },
  { path: "/business-info", priority: 0.3, changeFrequency: "monthly" },
  { path: "/ai-notice", priority: 0.3, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map(page => ({ url: page.path === "/" ? BASE : `${BASE}${page.path}`, changeFrequency: page.changeFrequency, priority: page.priority }));
}
