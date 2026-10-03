// 사업이 만들어진 뒤 화면 점검 — 사업 관리(시작 준비 단계·홍보 키트)·홈페이지·실적 기록. 안전 미리보기 전용
import puppeteer from "puppeteer-core";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
const origin = readFileSync(new URL("./origin.txt", import.meta.url), "utf8").trim();
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("synthetic preview only");
const results = JSON.parse(readFileSync(new URL("./results.json", import.meta.url), "utf8")) as Array<{ biz: string; planId: string; ok: boolean }>;
const only = process.argv[2];
const out = new URL("./shots/", import.meta.url).pathname; mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const report: any[] = [];
for (const [index, r] of results.entries()) {
  if (!r.ok || (only && !only.split(",").includes(r.biz))) continue;
  const page = await browser.newPage(); const errors: string[] = [];
  page.on("pageerror", e => errors.push(String(e).slice(0, 160)));
  await page.setViewport({ width: 1280, height: 900 });
  const uid = `syn-${["bakery","cafe","sidedish","nail","academy","online","pt","photo","stay","app"].indexOf(r.biz) + 1}`;
  await page.setCookie({ name: "syn_uid", value: uid, url: origin });
  const row: any = { biz: r.biz };
  const text = async () => page.evaluate(() => document.querySelector("main")?.textContent ?? "");
  const clickText = async (label: string) => page.evaluate((label) => { const b = [...document.querySelectorAll("button, a")].find(e => e.textContent?.trim().startsWith(label)) as HTMLElement | undefined; b?.click(); return !!b; }, label);
  try {
    await page.goto(`${origin}/plan/workspace?planId=${encodeURIComponent(r.planId)}&tab=launch`, { waitUntil: "networkidle0", timeout: 90000 });
    await new Promise(x => setTimeout(x, 800));
    row.tabs = await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="사업 관리 메뉴"] button')].map(b => b.textContent?.trim()));
    // 시작 방법 3문항
    for (const choice of ["새 사업을 시작할게요", "별도 사무실은 필요 없어요", "아직 안 했어요"]) {
      const picked = await clickText(choice); if (!picked) { row.setupMissing = (row.setupMissing ?? []).concat(choice); }
      await new Promise(x => setTimeout(x, 200));
      await page.evaluate(() => { const b = [...document.querySelectorAll("[class*=stepActions] button")].pop() as HTMLElement | undefined; b?.click(); });
      await new Promise(x => setTimeout(x, 700));
    }
    row.steps = await page.evaluate(() => [...document.querySelectorAll("[class*=launch] nav button, [class*=stepList] button, ol button")].map(b => b.textContent?.trim().slice(0, 30)).filter(Boolean));
    row.firstStep = await page.evaluate(() => document.querySelector("[class*=launch] h2")?.textContent);
    await page.screenshot({ path: `${out}${r.biz}-launch.png` });
    // 첫 홍보 단계 → 홍보 키트
    const toMarketing = await clickText("첫 홍보");
    await new Promise(x => setTimeout(x, 800));
    row.marketingStep = toMarketing && (await text()).includes("홍보 키트");
    if (row.marketingStep) {
      await clickText("홍보 키트 만들기");
      await page.waitForFunction(() => { const s = document.querySelector("[role=status]")?.textContent ?? ""; return document.body.textContent?.includes("1주차") || s.includes("못했어요") || s.includes("결제"); }, { timeout: 60000 }).catch(() => null);
      const t = await text(); const status = await page.evaluate(() => [...document.querySelectorAll("[role=status]")].map(e => e.textContent).join(" | "));
      row.marketingKit = t.includes("1주차") ? "생성됨" : status || "응답 없음";
      row.kitBlocks = await page.evaluate(() => [...document.querySelectorAll("section h3")].map(h => h.textContent).filter(Boolean).slice(0, 10));
      await page.screenshot({ path: `${out}${r.biz}-marketing.png`, fullPage: false });
    }
    // 홈페이지 단계 버튼
    await clickText("홈페이지를 준비해요");
    await new Promise(x => setTimeout(x, 600));
    row.websiteStep = (await text()).includes("내 사업으로 홈페이지 만들기");
    // 실적과 개선 기록 탭
    await page.goto(`${origin}/plan/workspace?planId=${encodeURIComponent(r.planId)}&tab=operations`, { waitUntil: "networkidle0", timeout: 60000 });
    row.operations = (await text()).slice(0, 80).replace(/\s+/g, " ");
    // 문서 화면
    await page.goto(`${origin}/plan/document?planId=${encodeURIComponent(r.planId)}`, { waitUntil: "networkidle0", timeout: 60000 });
    row.document = await page.evaluate(() => ({ chapters: document.querySelectorAll("aside nav button, aside button").length, title: document.querySelector("h1")?.textContent }));
  } catch (e) { row.error = String(e).slice(0, 200); }
  row.pageErrors = errors;
  report.push(row); console.log(JSON.stringify(row)); await page.close();
}
writeFileSync(new URL("./ui-report.json", import.meta.url), JSON.stringify(report, null, 1));
await browser.close();
