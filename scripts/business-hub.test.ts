import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import puppeteer, { type Page } from "puppeteer-core";
import { applyCoachReply, COACH_KEY, COACH_TYPES } from "../lib/plan-builder/coach";
import { ACTION_KEY, actionStatus, businessHubState } from "../lib/plan-builder/business-hub";
import { EMPTY_BUSINESS, type Plan, type PlanState } from "../lib/plan-builder/plan-store";
import { designFixture } from "./fixtures/coach-design";

function fixture(): Plan {
  const coach=applyCoachReply(null,{title:"동네 가게의 메뉴 사진과 소개문구를 함께 만드는 사업",message:"첫 사업안을 만들었어요.",stage:"startup",depth:"quick",ready:true,fields:[{key:"business",value:"사진 사업을 하고 싶어요",basis:"user",quote:"사진 사업을 하고 싶어요",messageId:"test-message"},{key:"price",value:"99,000원",basis:"proposal",quote:"",messageId:""}],suggestions:["상품을 구체화해 주세요"]},{id:"test-message",role:"user",text:"사진 사업을 하고 싶어요",at:new Date().toISOString()});
  coach.design={...designFixture(),sourceRevision:coach.documentRevision!,status:"proposal"};
  return {id:"hub-test-ready",title:coach.business.name,planType:COACH_TYPES.startup,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sections:{},answers:{[COACH_KEY]:{state:coach}}};
}
const ready=fixture();
assert.equal(businessHubState(ready).status,"사업안 준비됨");
const keys=businessHubState(ready).keys;
const complete={...ready,sections:Object.fromEntries(keys.map(key=>[key,{markdown:"실제 내용",html:"<p>실제 내용</p>",generatedAt:new Date().toISOString(),coachRevision:businessHubState(ready).revision!}]))};
assert.equal(businessHubState(complete).status,"문서 완성");
complete.sections["financials/__review"]={markdown:"검토 메모",html:"",generatedAt:"",coachRevision:0};
assert.equal(businessHubState(complete).documents.length,keys.length,"검토 메모는 문서 개수에서 제외");
const stale=structuredClone(complete);stale.sections[keys[0]].coachRevision=0;
assert.equal(businessHubState(stale).status,"수정 내용 반영 필요");
const partial={...ready,sections:{[keys[0]]:complete.sections[keys[0]]}};
assert.equal(businessHubState(partial).status,"자료 일부 준비됨");
const recorded={...ready,answers:{...ready.answers,[ACTION_KEY]:{revision:businessHubState(ready).revision,action:"할 일",status:"done"}}};
assert.equal(actionStatus(recorded,"할 일"),"done");
assert.equal(actionStatus(recorded,"달라진 할 일"),"pending");
assert.equal(actionStatus({...recorded,answers:{...recorded.answers,[ACTION_KEY]:{...recorded.answers[ACTION_KEY],revision:0}}},"할 일"),"pending","사업안이 바뀌면 완료 상태를 무조건 재사용하지 않음");
assert.equal(businessHubState({...ready,answers:{...ready.answers,__coach_generation:{runId:"test"}}},"unknown").running,false,"알 수 없는 실행 상태는 제작 중으로 표시하지 않음");
console.log("business-hub state tests: passed");

async function click(page:Page,text:string,scope="") {
  await page.waitForFunction((label, selector) => Array.from(document.querySelectorAll(`${selector ? `${selector} ` : ""}button`)).some(el => el.textContent?.trim() === label), {}, text, scope);
  await new Promise(resolve => setTimeout(resolve, 300));
  for(const el of await page.$$(`${scope ? `${scope} ` : ""}button`))if(await el.evaluate((e,t)=>e.textContent?.trim()===t,text)){await el.click();return;}
  throw new Error(`button missing: ${text}`);
}
async function main(){
  const base="http://localhost:8083";
  const browser=await puppeteer.launch({executablePath:"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",headless:true});
  await mkdir("artifacts/business-hub",{recursive:true});
  try{for(const width of [320,390,1440]){
    const context=await browser.createBrowserContext();const page=await context.newPage();await page.setViewport({width,height:900});
    let server:PlanState={business:EMPTY_BUSINESS,plans:[],activePlanId:null};let chatPosts=0;
    const errors:string[]=[];page.on("pageerror",e=>errors.push(String(e)));
    await page.setRequestInterception(true);
    page.on("request",request=>{
      const path=new URL(request.url()).pathname;
      const respond=(body:unknown)=>void request.respond({status:200,contentType:"application/json",body:JSON.stringify(body)});
      if(path==="/api/plan/state"){
        if(request.method()==="DELETE"){server.plans=server.plans.filter(p=>p.id!==new URL(request.url()).searchParams.get("planId"));respond({ok:true});return;}
        if(request.method()==="PUT"){const data=JSON.parse(request.postData()||"{}");server={...server,...data};respond({ok:true});}
        else respond({...server,authenticated:false});return;
      }
      if(path==="/api/plan/access"){respond({authenticated:false,paid:false});return;}
      if(path==="/api/plan/chat"){
        if(request.method()==="POST")chatPosts++;
        const p=server.plans.find(p=>p.id===new URL(request.url()).searchParams.get("planId"));
        const hub=p?businessHubState(p):null;
        respond({plan:p&&hub?{planId:p.id,title:p.title,planType:p.planType,coach:hub.coach,completed:hub.documents,total:hub.keys.length,job:null,generation:null}:null,authenticated:false,runStatus:null});return;
      }
      void request.continue();
    });
    await page.goto(`${base}/plan`,{waitUntil:"networkidle0",timeout:60000});
    await page.waitForSelector('a[href="/plan/chat?new=1"]');
    assert.ok(await page.$eval("main",e=>e.textContent?.includes("사업 이야기 시작하기")));
    assert.equal(await page.$('[aria-label="사업 필터"]'),null);
    await page.screenshot({path:`artifacts/business-hub/empty-${width}.png`});
    server={...server,plans:[structuredClone(ready),{...structuredClone(stale),id:"hub-test-stale",title:"수정된 사업안"}],activePlanId:"hub-test-stale"};
    await page.reload({waitUntil:"networkidle0"});
    await page.waitForSelector(`a[href="/plan/workspace?planId=${ready.id}"]`);
    assert.ok(await page.$eval("main",e=>e.textContent?.includes("수정 내용 반영 필요")));
    assert.equal(await page.$eval("main", e => e.textContent?.includes("사업 열기")), false, "목록 열기 동작은 화살표 하나로 표시");
    assert.ok(await page.$eval(`a[href="/plan/workspace?planId=${ready.id}"]`, e => !!e.getAttribute("aria-label")?.includes("사업 관리로 이동") && !!e.querySelector('[aria-hidden="true"] strong')?.textContent?.includes("동네 가게")), "미리보기는 저장된 사업 제목을 사용하고 링크에는 접근 가능한 이름을 제공");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({path:`artifacts/business-hub/list-${width}.png`});
    await page.click(`a[href="/plan/workspace?planId=${ready.id}"]`);
    await page.waitForSelector('[aria-label="사업 관리 메뉴"]');
    assert.equal(await page.$eval("h1",e=>e.textContent),ready.title,"활성 사업이 달라도 URL로 지정한 사업을 표시");
    await new Promise(resolve=>setTimeout(resolve,250));
    await page.screenshot({path:`artifacts/business-hub/summary-${width}.png`});
    await click(page,"내 자료",'[aria-label="사업 관리 메뉴"]');
    await page.waitForFunction(()=>{const el=document.querySelector('[aria-label="사업 관리 메뉴"] [aria-pressed="true"]');return el?.textContent==="내 자료" && getComputedStyle(el).backgroundColor==="rgb(36, 107, 209)";});
    assert.equal(await page.$eval('[aria-label="사업 관리 메뉴"] [aria-pressed="true"]', el=>getComputedStyle(el).backgroundColor), "rgb(36, 107, 209)", "선택 메뉴를 파란 배경으로 명확히 구분");
    assert.equal(await page.$eval('[aria-label="사업 관리 메뉴"] [aria-pressed="true"]', el=>getComputedStyle(el).color), "rgb(255, 255, 255)", "선택 메뉴는 흰 글씨");
    assert.ok(await page.$eval('[aria-label="내 자료"]',e=>e.textContent?.includes("사업안 확인하고 자료 만들기")));
    await click(page,"사업 시작하기",'[aria-label="사업 관리 메뉴"]');
    await click(page,"대화에서 정한 할 일 보기");
    await click(page,"완료했어요");
    await page.waitForFunction(()=>document.body.innerText.includes("기록을 저장했어요"));
    await page.reload({waitUntil:"networkidle0"});
    await page.waitForFunction(()=>document.body.innerText.includes("하나를 마쳤어요"));
    assert.equal(businessHubState(server.plans.find(p=>p.id===ready.id)!).documents.length,0,"할 일 완료가 문서 제작을 가장하지 않는다");
    await click(page,"이전 할 일 다시 보기");await page.waitForSelector('button:not([disabled])');
    await page.waitForFunction(()=>document.body.innerText.includes("지금은 건너뛰기"));
    await click(page,"지금은 건너뛰기");
    await page.waitForFunction(()=>document.body.innerText.includes("이 일은 나중에 해요"));
    await page.screenshot({path:`artifacts/business-hub/action-${width}.png`});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth || Array.from(document.querySelectorAll("h1,h2,button")).some(el=>el.scrollWidth>el.clientWidth+1));
    assert.equal(overflow,false,"모바일 긴 제목과 버튼이 가로로 넘치지 않는다");
    const next=await page.$('a[href*="prompt="]');assert.ok(next);await next.click();
    await page.waitForSelector("textarea:not([disabled])");
    assert.ok(await page.$eval("textarea",e=>e.value.includes("건너뛰고 싶어요")));
    assert.equal(chatPosts,0,"후속 질문은 확인 전 자동으로 전송하지 않는다");
    if(width===390){
      await page.goto(`${base}/plan`,{waitUntil:"networkidle0"});
      await page.waitForSelector(`summary[aria-label="${ready.title} 관리"]`);
      await page.click(`summary[aria-label="${ready.title} 관리"]`);await click(page,"이름 변경");
      await page.$eval('input[aria-label="사업 이름"]',el=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(el,"수정한 사진 사업");el.dispatchEvent(new Event("input",{bubbles:true}));});
      await click(page,"저장");
      await page.waitForFunction(()=>document.body.innerText.includes("수정한 사진 사업"));
      await page.reload({waitUntil:"networkidle0"});
      await page.waitForSelector('summary[aria-label="수정한 사진 사업 관리"]');
      await page.click('summary[aria-label="수정한 사진 사업 관리"]');
      page.once("dialog",dialog=>void dialog.accept());await click(page,"삭제");
      await page.waitForFunction(()=>!document.body.innerText.includes("수정한 사진 사업"));
      assert.ok(await page.$('a[href="/plan/workspace?planId=hub-test-stale"]'),"다른 사업은 삭제하지 않음");
      await page.click('a[href="/plan/workspace?planId=hub-test-stale"]');
      await page.waitForSelector('[aria-label="사업 관리 메뉴"]');await click(page,"내 자료",'[aria-label="사업 관리 메뉴"]');
      assert.ok(await page.$eval('[aria-label="내 자료"]',el=>el.textContent?.includes("수정 내용 반영 필요")));
      assert.ok(await page.$('[aria-label="내보내기 형식"]'));
      await page.screenshot({path:`artifacts/business-hub/documents-${width}.png`});
      await click(page,"사업계획서 열기");
      await page.waitForFunction(()=>location.pathname==="/plan/document");
      assert.equal(new URL(page.url()).searchParams.get("planId"),"hub-test-stale");
    }
    assert.deepEqual(errors,[]);
    await context.close();console.log(`business-hub UI ${width}: passed (mock API)`);
  }}finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
