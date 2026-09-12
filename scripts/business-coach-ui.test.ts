import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import puppeteer, { type Page } from "puppeteer-core";
import { applyCoachReply, COACH_TYPES } from "../lib/plan-builder/coach";
import { emptyCoach } from "../lib/plan-builder/coach-job";
import { designFixture } from "./fixtures/coach-design";
import { applyExpertPatch, expertPatchSchema } from "../lib/plan-builder/coach-expert";
import { COACH_KEY } from "../lib/plan-builder/coach";

async function clickText(page: Page, text: string, scope = "") {
  const buttons = await page.$$(`${scope ? `${scope} ` : ""}button`);
  for (const button of buttons) if (await button.evaluate((el, value) => el.textContent?.trim() === value || el.getAttribute("aria-label") === value, text)) { await button.click(); return; }
  throw new Error(`Button not found: ${text}`);
}
async function main() {
  const base = process.env.COACH_TEST_URL || "http://localhost:8083";
  assert.equal(new URL(base).hostname, "localhost", "Fixtures must never intercept production");
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  await mkdir("artifacts/business-coach-ux", { recursive: true });
  try {
    for (const [width, height] of [[320,740], [360,800], [390,844], [430,932], [900,900], [1440,900]]) {
      if (process.env.COACH_TEST_WIDTH && width !== Number(process.env.COACH_TEST_WIDTH)) continue;
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(String(error)));
      await page.setViewport({ width, height });
      await page.setRequestInterception(true);
      let snapshot: any = null;
      let final: any = null;
      let complete = false;
      let messagePosts = 0;
      let fail = false;
      let authenticated = width !== 390;
      let editFail = true;
      page.on("request", request => {
        if (new URL(request.url()).pathname === "/api/plan/expert") {
          const reply = (body: unknown, status = 200) => void request.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
          if (editFail) { editFail = false; reply({ message: "저장 연결을 확인해 주세요. 입력은 남아 있어요." }, 503); return; }
          const patch = expertPatchSchema.parse(JSON.parse(request.postData()!));
          const result = applyExpertPatch({ [COACH_KEY]: { state: final.coach } }, patch, new Date().toISOString());
          final = { ...final, coach: result.coach, title: result.coach.business.name, hasDocuments: true };
          snapshot = final;
          reply({ plan: { id: final.planId, title: final.title, answers: result.answers, updatedAt: new Date().toISOString() } }); return;
        }
        if (new URL(request.url()).pathname !== "/api/plan/chat") { void request.continue(); return; }
        const respond = (body: unknown, status = 200) => void request.respond({ status, contentType: "application/json", body: JSON.stringify(body) });
        if (request.method() === "GET") { if (complete) snapshot = final; respond({ plan: snapshot, authenticated, paid: false }); return; }
        const body = JSON.parse(request.postData() || "{}");
        if (body.action === "prepare") { respond({ message: "문서 제작 서버에 연결하지 못했어요. 저장된 사업안은 유지됩니다." },503); return; }
        messagePosts++;
        if (fail) { respond({ message: "연결을 확인해 주세요. 입력은 그대로 남아 있어요." },503); return; }
        const at = new Date().toISOString();
        const user = { id: body.requestId, role: "user" as const, text: body.message, at };
        const previous = final?.coach ?? null;
        const coach = applyCoachReply(previous, { title: "동네 가게의 대표 메뉴 사진과 소개문구를 함께 만들어주는 사업", message: "상세 설계는 별도 사업안에 보관합니다.", stage: "startup", depth: "quick", ready: true, suggestions: ["상품을 구체화해 주세요", "시작 방법을 쉽게 바꿔주세요"], fields: [{ key: "business", value: body.message, basis: "user", messageId: body.requestId, quote: body.message }, { key: "price", value: "99,000원", basis: "proposal", quote: "", messageId: "" }, { key: "budget", value: "100만원", basis: "proposal", quote: "", messageId: "" }] }, user);
        coach.design = { ...designFixture(), sourceRevision: coach.documentRevision!, status: "proposal" };
        coach.messages[coach.messages.length - 1].summary = "첫 사업안을 만들었어요. 제안한 상품과 운영 방법을 확인해 주세요.";
        final = { planId: "plan-ui-fixture", title: coach.business.name, planType: COACH_TYPES.startup, coach, hasDocuments: true, completed: [], total: 9, generation: null, job: null };
        snapshot = { ...final, coach: previous ?? emptyCoach(), job: { token: `token-ui-${messagePosts}`, runId: "test-run", baseRevision: previous?.revision ?? 0, message: user, status: "running", phase: "designing", durable: true, attempt: 1, updatedAt: at } };
        respond({ plan: snapshot, authenticated },202);
      });
      await page.goto(`${base}/plan/chat?new=1`, { waitUntil: "networkidle0", timeout: 60000 });
      await page.waitForSelector("textarea:not([disabled])");
      assert.equal(await page.$eval('[data-chat-theme="light"]', el => getComputedStyle(el).backgroundColor), "rgb(255, 255, 255)", "흰 진입 화면의 배경을 실제 채팅에서도 유지한다");
      assert.equal(await page.$eval('[data-coach-welcome] h2', el => el.textContent), "어떤 사업을생각하고 계세요?", "진입 애니메이션과 실제 채팅이 같은 시작 문구를 사용한다");
      const idea = "사진 촬영 경험으로 동네 가게의 메뉴 사진을 만들고 싶어요.";
      await page.type("textarea",idea);
      await page.reload({ waitUntil: "networkidle0" });
      assert.equal(await page.$eval("textarea",el=>el.value),idea,"미전송 입력은 같은 탭의 새로고침에서도 유지");
      const entryLayout = await page.evaluate(() => {
        const form = document.querySelector("form")!.getBoundingClientRect();
        const options = document.querySelector('[aria-label="대화 시작 선택지"]')!.getBoundingClientRect();
        return { formTop: form.top, formBottom: form.bottom, optionsBottom: options.bottom, height: innerHeight, greeting: !!document.querySelector('[aria-label="오늘창업의 첫 메시지"]') };
      });
      assert.ok(entryLayout.greeting && entryLayout.formBottom <= entryLayout.height && entryLayout.height - entryLayout.formBottom < 40, "첫 메시지가 대화 안에 있고 입력창은 하단에 고정된다");
      await page.click('button[aria-label="대화 메뉴 열기"]');
      await page.waitForSelector('#chat-navigation');
      assert.equal(await page.$$eval('#chat-navigation a', els => els.length), 4);
      await page.keyboard.press('Escape');
      assert.equal(await page.$('#chat-navigation'), null, "앱 메뉴는 Escape로 닫힌다");
      await page.screenshot({ path: `artifacts/business-coach-ux/entry-${width}.png` });
      if (width === 320) {
        await page.$eval("textarea", el => { const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!; setter.call(el, ""); el.dispatchEvent(new Event("input", { bubbles: true })); });
        await clickText(page, "아이디어가 없어요", '[aria-label="대화 시작 선택지"]');
      } else await page.click('button[aria-label="보내기"]');
      await page.waitForFunction(()=>document.body.innerText.includes("화면을 닫아도 서버"));
      assert.equal(messagePosts,1);
      await page.reload({ waitUntil:"networkidle0" });
      await page.waitForFunction(()=>document.body.innerText.includes("상품과 운영 방법을 정리하고 있어요"));
      assert.equal(messagePosts,1,"재접속 시 POST를 반복하지 않는다");
      await page.screenshot({ path:`artifacts/business-coach-ux/loading-${width}.png` });
      complete = true;
      await page.waitForFunction(()=>document.body.innerText.includes("첫 사업안을 만들었어요"));
      await page.waitForSelector("textarea:not([disabled])");
      await new Promise(resolve => setTimeout(resolve, 250));
      const layout = await page.evaluate(()=>{
        const send=document.querySelector('button[aria-label="보내기"]')!.getBoundingClientRect();
        const input=document.querySelector("textarea")!.getBoundingClientRect();
        const logo=document.querySelector('[aria-label="오늘창업의 첫 메시지"] img') as HTMLImageElement;
        return { width:innerWidth,scroll:document.documentElement.scrollWidth,height:innerHeight,send:{left:send.left,right:send.right,bottom:send.bottom,width:send.width,height:send.height,top:send.top},inputRight:input.right,logo:logo.complete&&logo.naturalWidth>0,icon:!!document.querySelector('button[aria-label="보내기"] svg')?.getBoundingClientRect().width };
      });
      assert.ok(layout.scroll<=width,JSON.stringify(layout));
      assert.ok(layout.send.bottom<=height&&layout.send.right<=width&&layout.send.width>=44&&layout.send.height>=44,JSON.stringify(layout));
      assert.ok(layout.inputRight<=layout.send.left, "전송 버튼은 입력창 오른쪽에서 글을 가리지 않는다");
      assert.equal(await page.$$eval('[aria-label="오늘창업의 첫 메시지"]', els => els.length), 1, "답변 후에도 첫 메시지를 대화 내역에 보존한다");
      assert.ok(await page.$eval('[aria-label="이어서 대화하기"]', el => !!el.closest('[class*="conversation"]') && !el.closest('footer')), "후속 선택지는 입력창이 아닌 대화 안에 표시한다");
      assert.ok(await page.$$eval('[aria-label="오늘창업의 답변"]', els => els.every(el => !!el.querySelector('img'))), "후속 답변에도 같은 AI 프로필을 사용한다");
      assert.ok(layout.logo&&layout.icon);
      assert.equal(await page.$$eval('[data-coach-message="user"]', elements => elements.length > 0), true, "실제 메시지는 홈페이지 시연과 같은 채팅 컴포넌트를 사용한다");
      assert.equal(await page.$eval('[data-coach-message="user"]', el => getComputedStyle(el).backgroundColor), "rgb(242, 244, 247)", "대화가 시작된 뒤에도 파란 배경 대신 옅은 회색 말풍선을 유지한다");
      assert.equal(await page.$eval('[data-coach-result] h2', el => el.textContent), final.title, "공통 결과 카드에는 실제 사업 제목이 표시된다");
      assert.equal(await page.$eval('[data-coach-result] button', el => el.textContent?.trim()), "내 사업안 확인하기", "실제 결과 카드는 사업안으로 이동할 수 있다");
      await page.screenshot({path:`artifacts/business-coach-ux/chat-${width}.png`});
      if(width<=900)await clickText(page,"내 사업안",'[aria-label="화면 선택"]');
      await new Promise(resolve => setTimeout(resolve, 250));
      const pane='[aria-label="내 사업안 결과"]';
      if (width > 900) {
        const handle = await page.$('[role="separator"][aria-label="채팅 영역 너비 조절"]');
        assert.ok(handle);
        const before = await page.$eval('#business-chat-pane', el => el.getBoundingClientRect().width);
        const box = await handle.boundingBox(); assert.ok(box);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down(); await page.mouse.move(box.x - 110, box.y + box.height / 2, { steps: 12 }); await page.mouse.up();
        const after = await page.$eval('#business-chat-pane', el => el.getBoundingClientRect().width);
        assert.ok(after < before - 70 && after >= 279, "마우스로 채팅을 줄이되 최소 읽기 너비 유지");
        assert.ok(Number(await page.evaluate(() => localStorage.getItem('oneulstart:chat-width'))) < 42, "조절한 너비를 보관");
        await page.screenshot({ path: `artifacts/business-coach-ux/resized-${width}.png` });
        await handle.focus(); await page.keyboard.press('End');
        assert.ok(await page.$eval(pane, el => el.getBoundingClientRect().width >= 319), "키보드 최대 조절에서도 사업안 영역 보호");
        await handle.click({ count: 2 });
      } else assert.equal(await page.$eval('[role="separator"]', el => el.getBoundingClientRect().width), 0, "모바일은 기존 탭 흐름 유지");
      assert.equal(await page.$eval(`${pane} details`,el=>el.open),false);
      await page.screenshot({path:`artifacts/business-coach-ux/brief-${width}.png`});
      const cta=await page.$eval(`${pane} [class*="primary"]`,el=>{const r=el.getBoundingClientRect();return {bottom:r.bottom,left:r.left,right:r.right,height:r.height};});
      assert.ok(cta.bottom<=height&&cta.left>=0&&cta.right<=width&&cta.height>=48,JSON.stringify(cta));
      if(!authenticated){assert.ok(await page.$eval(`${pane} a`,el=>el.getAttribute("href")?.includes("plan-ui-fixture")));authenticated=true;await page.reload({waitUntil:"networkidle0"});await page.waitForFunction(()=>document.body.innerText.includes("첫 사업안을"));if(width<=900)await clickText(page,"내 사업안",'[aria-label="화면 선택"]');}
      await clickText(page,"상품과 고객",pane);
      assert.ok(await page.$eval(pane,el=>el.textContent?.includes("99,000원")));
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('[aria-label="사업안 항목"] [aria-pressed=true]')!).backgroundColor !== getComputedStyle(document.querySelector('[aria-label="사업안 항목"] [aria-pressed=false]')!).backgroundColor);
      assert.ok(await page.$eval(`${pane} dd strong`, el=>el.textContent === "99,000원" && getComputedStyle(el).borderTopStyle === "solid"), "저장된 가격을 테두리로 강조");
      const editPosition = await page.$eval(`${pane} [class*="editLink"]`, el=>{const rect=el.getBoundingClientRect();const footer=el.closest('[class*="documentActions"]')!;const primary=footer.querySelector('[class*="primary"]')!.getBoundingClientRect();return {bottom:rect.bottom,right:rect.right,primaryTop:primary.top,primaryRight:primary.right};});
      assert.ok(editPosition.bottom <= editPosition.primaryTop && Math.abs(editPosition.right-editPosition.primaryRight) < 2, "수정 버튼은 고정 하단 영역의 오른쪽에 표시");
      await clickText(page,"시작 방법",pane);
      assert.ok(await page.$eval(pane,el=>el.textContent?.includes("하지 않아도 계획서를")));
      const overflow=await page.$eval(pane,el=>Array.from(el.querySelectorAll("p,dd,h1,h2,button")).some(el=>el.scrollWidth>el.clientWidth+1));
      assert.equal(overflow,false,"긴 제목과 본문이 잘리지 않는다");
      await clickText(page,"직접 수정",pane);
      await page.waitForSelector('form[aria-label="사업 정보 직접 수정"]');
      const actionInput = 'form[aria-label="사업 정보 직접 수정"] textarea';
      await page.$eval(actionInput, el => { el.value = ""; });
      await page.type(actionInput, "샘플 사진 한 장을 촬영해요.");
      const beforePosts = messagePosts;
      await clickText(page, "저장", pane);
      await page.waitForFunction(() => document.body.innerText.includes("저장 연결을 확인"));
      assert.ok(await page.$eval(actionInput, el => el.value.includes("샘플 사진")), "저장 실패 후에도 수정 내용 유지");
      await page.screenshot({ path: `artifacts/business-coach-ux/direct-edit-${width}.png` });
      await clickText(page, "저장", pane);
      await page.waitForFunction(() => !document.querySelector('form[aria-label="사업 정보 직접 수정"]'));
      assert.ok(await page.$eval(pane, el => el.textContent?.includes("샘플 사진 한 장을 촬영해요.")));
      assert.equal(messagePosts, beforePosts, "직접 저장은 AI 대화 요청을 하지 않음");
      assert.ok(await page.$eval(pane, el => el.textContent?.includes("업데이트 필요")), "기존 자료가 있으면 업데이트 상태 표시");
      await clickText(page, "상품과 고객", pane);
      await clickText(page, "직접 수정", pane);
      await clickText(page, "취소", pane);
      assert.equal(await page.$('form[aria-label="사업 정보 직접 수정"]'), null, "수정 전 취소는 바로 원래 항목으로 복귀");
      await clickText(page, "직접 수정", pane);
      const inputs = await page.$$('form[aria-label="사업 정보 직접 수정"] textarea');
      await inputs[2].click({ count: 3 });
      await page.keyboard.press("Backspace");
      await inputs[2].type("125,000원");
      await clickText(page, "저장", pane);
      await page.waitForFunction(() => !document.querySelector('form[aria-label="사업 정보 직접 수정"]'));
      assert.ok(await page.$eval(pane, el => el.textContent?.includes("125,000원")), "수정한 가격이 같은 항목에 즉시 반영");
      assert.equal(final.coach.fields.find((f: any) => f.key === "price").basis, "user");
      await clickText(page, "시작 방법", pane);
      await clickText(page,"AI와 다듬기",pane);
      await page.waitForFunction(()=>document.activeElement?.tagName==="TEXTAREA");
      assert.ok(await page.$eval("textarea",el=>el.value.includes("시작 방법")));
      fail=true;
      await page.click('button[aria-label="보내기"]');
      await page.waitForSelector('[role="alert"]');
      assert.ok(await page.$eval("textarea",el=>el.value.includes("시작 방법")),"오류 후 입력 유지");
      if(width<=900)await clickText(page,"내 사업안",'[aria-label="화면 선택"]');
      await clickText(page,"수정 내용을 계획서에 반영하기",pane);
      await page.waitForFunction(()=>document.body.innerText.includes("문서 제작 서버에 연결하지 못했어요"));
      assert.equal(await page.$("progress"),null,"접수 실패를 가짜 진행률로 표시하지 않는다");
      if(width<=900)await clickText(page,"대화",'[aria-label="화면 선택"]');
      // A compact keyboard viewport keeps the editor and submit button on screen.
      await page.setViewport({width,height:450});
      await new Promise(resolve=>setTimeout(resolve,100));
      const keyboard=await page.$eval('button[aria-label="보내기"]',el=>el.getBoundingClientRect().bottom);
      assert.ok(keyboard<=450,"키보드가 열린 높이에서도 전송 버튼이 가려지지 않는다");
      if(width===390){
        await page.setViewport({width,height});
        const history=Array.from({length:30},(_,i)=>({id:`history-${i}`,role:i%2?"assistant":"user",text:`이전 대화 ${i}. 사업에 대해 정리한 내용을 보관합니다. `.repeat(3),at:new Date().toISOString()}));
        const pending={id:"new-pending",role:"user",text:"상품을 수정해 주세요",at:new Date().toISOString()};
        snapshot={...final,coach:{...final.coach,messages:history},job:{token:"long-thread",message:pending,status:"running",phase:"designing",durable:true,updatedAt:new Date().toISOString()}};
        complete=false;
        await page.reload({waitUntil:"networkidle0"});
        await page.waitForFunction(()=>document.body.innerText.includes("이전 대화 29"));
        await new Promise(resolve=>setTimeout(resolve,500));
        await page.$eval('[class*="conversation"]',el=>{el.scrollTop=0;el.dispatchEvent(new Event("scroll",{bubbles:true}));});
        final={...final,coach:{...final.coach,revision:final.coach.revision+1,messages:[...history,pending,{id:"new-response",role:"assistant",text:"새로운 답변입니다.",summary:"수정 내용을 반영했어요.",at:new Date().toISOString()}]}};
        complete=true;
        await page.waitForFunction(()=>document.body.innerText.includes("새 답변 보기"));
        assert.ok(await page.$eval('[class*="conversation"]',el=>el.scrollTop<5),"과거 대화를 읽는 중 새 답변이 화면을 끌어내리지 않는다");
        await clickText(page,"내 사업안",'[aria-label="화면 선택"]');
        await clickText(page,"대화",'[aria-label="화면 선택"]');
        assert.ok(await page.$eval('[class*="conversation"]',el=>el.scrollTop<5),"화면 전환 후 읽던 위치 유지");
        await clickText(page,"새 답변 보기");
        await new Promise(resolve=>setTimeout(resolve,500));
        assert.ok(await page.$eval('[class*="conversation"]',el=>el.scrollTop>100));
      }
      if(width===430){
        await page.setViewport({width,height});
        fail=false;
        complete=false;
        await clickText(page,"상품을 구체화해 주세요",'[aria-label="이어서 대화하기"]');
        await page.waitForFunction(()=>document.body.innerText.includes("상품과 운영 방법을 정리하고 있어요"));
        complete=true;
        await page.waitForSelector('[aria-label="이어서 대화하기"]');
        assert.ok(await page.$$eval('[aria-label="내 메시지"]', els => els.some(el => el.textContent?.includes("상품을 구체화해 주세요"))), "후속 선택이 실제 사용자 메시지로 전송된다");
        const last=final.coach.messages.at(-1);
        last.summary=undefined;
        last.text="고객에게 판매할 상품을 구체적으로 정리했어요. ".repeat(30);
        await page.reload({waitUntil:"networkidle0"});
        await page.waitForSelector('[aria-label="오늘창업의 답변"]');
        assert.ok(await page.$$eval('[aria-label="오늘창업의 답변"]', els => { const last=els.at(-1)!;return !last.querySelector('details') && (last.querySelector('p')?.textContent?.length ?? 0)>500; }), "최신 긴 답변은 접지 않고 바로 보여준다");
      }
      const completeKeys = Array.from({ length: 9 }, (_, i) => `section-${i}`);
      final = { ...final, completed: completeKeys, total: 9, job: null, generation: { revision: final.coach.documentRevision, keys: completeKeys } }; complete = true;
      await page.setViewport({ width, height });
      await page.reload({ waitUntil: "networkidle0" });
      await page.waitForSelector('[aria-label="사업 기획 대화"]');
      if (width <= 900) await clickText(page, "내 사업안", '[aria-label="화면 선택"]');
      await page.waitForSelector('[class*="finishButton"]');
      assert.ok(await page.$eval('[class*="finishButton"]', el => el.textContent?.includes("계획서 보기") && el.querySelectorAll('svg').length === 2));
      assert.ok(await page.$eval(pane, el => el.textContent?.includes("계획서 작성 완료")));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `artifacts/business-coach-ux/finished-${width}.png` });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      assert.equal(await page.$eval('[class*="finishButton"]', el => getComputedStyle(el).animationName), "none");
      assert.deepEqual(errors,[]);
      await page.close();
      console.log(`business-coach UX ${width}x${height}: passed (mock API)`);
    }
  } finally { await browser.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
