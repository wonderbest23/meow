// 대화 방식(일반 · 전문가)을 실제 사용자처럼 화면에서 끝까지 눌러 보기 — 2026-11-13.
//   BASE_URL=http://localhost:8098 node scripts/ui-audit/walk-modes.mjs <uid> <easy|expert> <exploring|startup|operating> [너비=390] [변형: unknown|switch|type-first]
// 질문마다 보이는 것을 읽고(제목 · 고를 것 · 입력창) 사람처럼 고르거나 적는다. 걸음마다 한 줄 기록(<OUT>/walk-<이름>.jsonl)과 화면(<OUT>/walk-<이름>-NN.png)을 남긴다.
// 계획서 쓰기는 로컬에서 작업 흐름(Workflow)이 없어 /api/dev/synthetic-generate 로 대신한다(seed.mjs 와 같다).
import fs from "node:fs";
import { S, args, browser, open, sleep, shot } from "./lib.mjs";

const [uid, depth = "easy", stage = "startup", widthArg = "390", variant = ""] = args;
const width = +widthArg, name = `${depth}-${stage}-${width}${variant ? `-${variant}` : ""}`;
const STAGE = { exploring: "아이디어를 찾고 있어요", startup: "생각한 사업이 있어요", operating: "사업을 운영 중이에요" }[stage];
const TEXT = { business: "퇴근길 직장인 대상 동네 반찬가게", customer: "퇴근길 30~40대 직장인", problem: "퇴근 후 반찬 만들 시간이 없음", offer: "반찬 3~4가지 묶음", channel: "매장 앞을 지나는 손님", goal: "6개월 안에 본전", experience: "식당 주방 3년", sales: "이번 달 매출 300만원", name: "퇴근반찬" };
const NUMBER = { price: "15000", cost: "2800000", unitCost: "7500", "structure.cost": "2800000", "structure.unitCost": "7500", budget: "20000000", hoursPerWeek: "40" };
// 변형 badnumber: 한 개 비용을 가격보다 크게 적어 본다(전문가 방식에서 막아 주는지)
if (variant === "badnumber") NUMBER["structure.unitCost"] = "30000";
const log = [], write = entry => { log.push(entry); fs.writeFileSync(`${S}/walk-${name}.jsonl`, log.map(item => JSON.stringify(item)).join("\n")); };

const READ = `(() => {
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const txt = el => (el?.innerText || "").trim().replace(/\\s+/g, " ");
  const cards = document.querySelector('[aria-label="대화 방식"] strong') ? [...document.querySelectorAll('[aria-label="대화 방식"] button')].map(txt) : null;
  const entry = [...document.querySelectorAll('[aria-label="대화 시작 선택지"] button')].map(txt);
  const q = document.querySelector("[data-chat-question]");
  const input = q?.querySelector("input[type=radio], input[type=checkbox]");
  const area = document.querySelector('footer[aria-label="대화 입력창"] textarea');
  const turn = document.querySelector('[class*="currentTurn"]');
  return {
    url: location.pathname + location.search, cards, entry,
    question: txt(q?.querySelector("h2")), qid: (input?.name || area?.id || "").replace(/^intake-(answer-)?/, ""),
    options: q ? [...q.querySelectorAll("label")].filter(vis).map(txt).filter(Boolean).slice(0, 14) : [],
    qButtons: q ? [...q.querySelectorAll("button")].filter(vis).filter(b => !b.disabled).map(txt).filter(Boolean).slice(0, 12) : [],
    turnButtons: turn ? [...turn.querySelectorAll("button, a")].filter(vis).filter(b => !b.disabled && !b.closest("[data-chat-question]")).map(txt).filter(Boolean).slice(0, 12) : [],
    area: area ? { disabled: area.disabled, placeholder: area.placeholder, value: area.value } : null,
    depthToggle: [...document.querySelectorAll('footer [aria-label="대화 방식"] button')].map(b => txt(b) + (b.getAttribute("aria-pressed") === "true" ? "*" : "")),
    alerts: [...document.querySelectorAll('[role=alert]')].filter(vis).map(txt).filter(Boolean),
    busy: turn?.getAttribute("aria-busy") === "true" || !!document.querySelector('[class*="typing"]'),
    lastAssistant: txt([...document.querySelectorAll('[class*="assistantMessage"]')].at(-1)).slice(0, 140),
    done: /축하합니다|사업계획서가 완성/.test(document.body.innerText),
  };
})()`;
const clickText = (page, text, scope = "body") => page.evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(scope)} + " button, " + ${JSON.stringify(scope)} + " a, " + ${JSON.stringify(scope)} + " label")].filter(e => e.getBoundingClientRect().width > 0 && !e.disabled).find(e => (e.innerText || "").trim().replace(/\\s+/g, " ") === ${JSON.stringify(text)} || (e.innerText || "").trim().replace(/\\s+/g, " ").startsWith(${JSON.stringify(text)})); el?.click(); return !!el; })()`);

const b = await browser();
const page = await open(b, uid, "/plan/studio?new=1", { width, mobile: false });
let n = 0, actions = 0, same = 0, lastKey = "", switched = false, planId = null, generated = false;
const snap = async label => { n++; await shot(page, `walk-${name}-${String(n).padStart(2, "0")}`).catch(() => {}); return label; };
const started = Date.now();
for (let step = 0; step < 60; step++) {
  await sleep(step ? 1600 : 7000);
  let s = await page.evaluate(READ);
  for (let wait = 0; wait < 20 && s.busy; wait++) { await sleep(1000); s = await page.evaluate(READ); }
  planId = new URLSearchParams(s.url.split("?")[1] ?? "").get("planId") ?? planId;
  const key = [s.question, s.qid, s.cards?.length, s.entry.length, s.turnButtons.join("|")].join("#");
  same = key === lastKey ? same + 1 : 0; lastKey = key;
  let did = "";
  if (s.done) { write({ step, state: "완성 화면", lastAssistant: s.lastAssistant, turnButtons: s.turnButtons, area: s.area, depthToggle: s.depthToggle }); await snap(); break; }
  // 로컬에는 계획서 쓰는 작업 흐름이 없다 — 시작 실패 안내가 뜨면 시험용 경로로 써 넣고 다시 연다(운영에서는 이 자리에 작성 진행 카드가 뜬다)
  if (s.alerts.some(t => /작성을 시작하지 못했어요/.test(t)) && planId && !generated) {
    generated = true;
    const made = await page.evaluate(`fetch("/api/dev/synthetic-generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ planId: ${JSON.stringify(planId)} }) }).then(r => r.status)`);
    write({ step, did: `계획서 쓰기(시험용 경로) → ${made}`, question: "", qButtons: [], turnButtons: [], alerts: [] });
    await page.goto(page.url(), { waitUntil: "load" }); await sleep(6000); continue;
  }
  if (variant === "type-first" && step === 0) { write({ step, check: "카드 전에 입력창", area: s.area, cards: s.cards }); }
  if (s.cards) { did = `방식 카드 → ${depth === "expert" ? "전문가" : "일반"}`; await clickText(page, depth === "expert" ? "전문가" : "일반", '[aria-label="대화 방식"]'); }
  else if (s.entry.length) { did = `단계 → ${STAGE}`; await clickText(page, STAGE, '[aria-label="대화 시작 선택지"]'); }
  else if (variant === "switch" && !switched && s.depthToggle.length && step > 3) { switched = true; const to = depth === "expert" ? "일반" : "전문가"; did = `중간에 방식 바꾸기 → ${to}`; await clickText(page, to, 'footer [aria-label="대화 방식"]'); }
  else if (same >= 2 && s.qButtons.some(t => /잘 모르겠어요|모르겠/.test(t))) { did = "같은 질문 반복 → 잘 모르겠어요"; await clickText(page, s.qButtons.find(t => /모르겠/.test(t)), "[data-chat-question]"); }
  else if (variant === "unknown" && s.question && s.qid !== "business" && s.qButtons.some(t => /모르겠/.test(t))) { did = "잘 모르겠어요"; await clickText(page, s.qButtons.find(t => /모르겠/.test(t)), "[data-chat-question]"); }
  else if (s.options.length && !(s.qid in NUMBER) && !(s.qid in TEXT)) { const pick = s.options.find(o => /카페 · 음식점|매장|직접|개|묶음/.test(o)) ?? s.options[0]; did = `고르기 → ${pick.slice(0, 30)}`; await clickText(page, pick.slice(0, 12), "[data-chat-question]"); await sleep(500); const next = (await page.evaluate(READ)).qButtons.find(t => /^(다음|확인|저장|이걸로|선택)/.test(t)); if (next) { await clickText(page, next, "[data-chat-question]"); did += ` → [${next}]`; } else if (same >= 1) { const sent = await page.evaluate(`(() => { const b = document.querySelector('footer[aria-label="대화 입력창"] button[type=submit]'); if (b && !b.disabled) { b.click(); return true; } return false; })()`); if (sent) did += " → [보내기]"; } }
  else if (s.question && s.area && !s.area.disabled) { const value = NUMBER[s.qid] ?? TEXT[s.qid] ?? (/얼마|원|가격|비용|돈/.test(s.question) ? "3000000" : /몇|시간|수/.test(s.question) ? "30" : "직접 확인 예정"); did = `적기(${s.qid || "?"}) → ${value}`; await page.click('footer[aria-label="대화 입력창"] textarea'); await page.keyboard.type(value); await sleep(200); await page.keyboard.press("Enter"); }
  else if (s.qButtons.length) { const pick = s.qButtons.find(t => /맞아요|이대로|다음|확인|계속/.test(t)) ?? s.qButtons[0]; did = `질문 단추 → ${pick}`; await clickText(page, pick, "[data-chat-question]"); }
  else if (s.turnButtons.length) { const pick = s.turnButtons.find(t => /^사업계획서 만들기|계획서 (만들기|작성)|정리하기|이대로|^다음/.test(t)) ?? s.turnButtons[0]; did = `단추 → ${pick}`; await clickText(page, pick, '[class*="currentTurn"]'); }
  else did = "할 것이 없음";
  if (did !== "할 것이 없음") actions++;
  write({ step, did, question: s.question, qid: s.qid, options: s.options.length, qButtons: s.qButtons, turnButtons: s.turnButtons, area: s.area, depthToggle: s.depthToggle, alerts: s.alerts, lastAssistant: s.lastAssistant, same });
  if (step % 3 === 0 || s.alerts.length || same >= 2) await snap();
  if (did === "할 것이 없음" && same >= 3) break;
  if (same >= 5) break;
}
if (planId && generated) {
  await page.goto(`${page.url().split("?")[0]}?planId=${planId}&tab=plan`, { waitUntil: "load" }); await sleep(8000);
  write({ after: "계획서 칸", ...(await page.evaluate(`(() => { const easy = document.querySelector('[aria-label="쉽게 보기"]'); return { easyView: !!easy, easyText: (easy?.innerText || "").replace(/\\s+/g, " ").slice(0, 260), steps: easy ? easy.querySelectorAll("ol li").length : 0, viewButtons: [...document.querySelectorAll('[aria-label="문서 보기 방식"] button')].map(b => b.innerText.trim()), alerts: [...document.querySelectorAll("[role=alert]")].map(e => e.innerText.trim()).filter(Boolean) }; })()`)) });
  await snap();
}
write({ end: true, name, planId, actions, seconds: Math.round((Date.now() - started) / 1000), pageErrors: page.errors, consoleErrors: page.consoleErrors.slice(0, 8), bad: [...new Set(page.bad)].slice(0, 12) });
await snap();
console.log(log.map(item => JSON.stringify(item)).join("\n"));
await b.close();
