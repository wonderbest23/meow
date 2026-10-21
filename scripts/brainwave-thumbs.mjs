/*
 * 홈 예시 띠 썸네일 — 킷 랜딩 10장을 한글 문구로 실제 렌더링해 첫 화면(1600×1400)을 찍는다.
 *   node scripts/brainwave-thumbs.mjs [baseUrl]
 * 개발 서버(/dev/bw?bare=1&ko=1)가 떠 있어야 한다. 출력: public/brainwave/thumbs/<id>.jpg
 */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const base = process.argv[2] ?? "http://localhost:8083";
/*
 * 손님이 고르는 사업 디자인 넷(0-2226 동네 가게·0-1102 온라인 상점·0-421 갤러리형·0-2385 병원·클리닉)은 빠진다.
 * 킷 그대로 찍으면 영어 앱 화면·사무실 사진·가구 상품이 나와(커피 스탠드 글 뒤 공유 오피스, 꽃집 글 아래 의자),
 * 그 업종 디자인을 본뜬 그림을 Unsplash 사진(lib/landing/photo-library.ts 의 카페·꽃·인테리어·병원 한 벌)으로 따로 만들어 두었다.
 * 다시 찍으면 그 그림이 지워진다.
 */
const IDS = ["0-290", "0-2555", "0-181", "0-2", "0-1371", "0-1950", "0-3347", "0-3446", "0-3558", "0-3659", "0-3728", "0-3745", "0-3763", "0-3777", "0-3807", "0-3853", "0-3890", "0-3919", "0-4032", "0-4065", "0-4259", "0-4339"];
const chrome = [
  `${homedir()}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(existsSync);
if (!chrome) throw new Error("chrome not found");

const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1400, deviceScaleFactor: 0.4 });
for (const id of IDS) {
  await page.goto(`${base}/dev/bw?p=${id}&ko=1&bare=1`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.waitForSelector(".bw-canvas img", { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(async () => { await Promise.all([...document.images].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))); });
  await page.evaluate(() => { document.querySelectorAll(".support-chat-widget, nextjs-portal, [data-nextjs-toast], #__next-build-watcher").forEach((e) => e.remove()); });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: `public/brainwave/thumbs/${id}.jpg`, type: "jpeg", quality: 82, clip: { x: 0, y: 0, width: 1600, height: 1400 } });
  console.log("shot", id);
}
await browser.close();
