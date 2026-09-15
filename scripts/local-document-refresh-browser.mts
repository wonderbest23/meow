import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { LAB_URL } from "./local-account-lab.mts";
import { documentFixtureResult } from "./proposal-rewrite-fixture";
import { previewDocumentRefresh, runDocumentRefresh, type DocumentRefreshRuntime } from "../lib/plan-builder/document-refresh-service";
import { loadProposalEditor } from "../lib/plan-builder/proposal-editor-service";
import { loadPlanState } from "../lib/plan-builder/plan-server-store";

export async function verifyDocumentRefreshBrowser({ page, context, owner, planId, root }: { page: any; context: any; owner: string; planId: string; root: string }) {
  let calls = 0, lost = true;
  const runtime: DocumentRefreshRuntime = { target: { provider: "mock", model: "local-document-only" }, generate: async payload => { calls++; return documentFixtureResult(payload); } };
  const endpoint = `${LAB_URL}/api/plan/proposal?planId=${planId}`;
  const stored = (await loadPlanState(owner)).plans[0], original = structuredClone(stored.sections);
  const initialKeys = Object.keys(stored.sections).slice(0, 3);
  const closed = await (await context.request.get(`${endpoint}&preview=document&${initialKeys.map(key => `section=${encodeURIComponent(key)}`).join("&")}`)).json();
  assert.equal(closed.target, null);
  assert.equal((await context.request.post(`${LAB_URL}/api/plan/proposal`, { data: { planId, command: { type: "document_generate", id: randomUUID(), sections: initialKeys, hash: closed.hash, consent: true } } })).status(), 503);
  await context.route(`${LAB_URL}/api/plan/proposal**`, async (route: any) => {
    const request = route.request(), url = new URL(request.url());
    if (request.method() === "GET" && url.searchParams.get("preview") === "document") return route.fulfill({ json: await previewDocumentRefresh(owner, planId, url.searchParams.getAll("section"), runtime) });
    if (request.method() === "POST" && request.postDataJSON().command.type === "document_generate") {
      assert.equal(request.postDataJSON().command.consent, true);
      await runDocumentRefresh(owner, planId, request.postDataJSON().command, runtime);
      if (lost) { lost = false; return route.abort(); }
      return route.fulfill({ json: await loadProposalEditor(owner, planId) });
    }
    return route.continue();
  });
  const panel = page.getByRole("region", { name: "계획서 갱신 검토", exact: true });
  for (let batch = 0; batch < 3; batch++) {
    await panel.getByRole("button", { name: "계획서 갱신", exact: true }).click();
    const options = panel.locator("fieldset").first().getByRole("checkbox");
    for (let index = 0; index < 3; index++) await options.nth(index).check();
    if (await options.count() > 3) assert(await options.nth(3).isDisabled(), "Batch size is bounded in UI");
    await panel.getByRole("button", { name: "선택한 전송 자료 확인", exact: true }).click();
    const transmission = panel.getByRole("region", { name: "계획서 전송 자료 확인", exact: true });
    const generate = transmission.getByRole("button", { name: "동의한 자료로 본문 갱신", exact: true });
    await generate.waitFor(); assert(await generate.isDisabled());
    await transmission.getByText("문서 전송 자료 전체 보기", { exact: true }).click();
    const payload = JSON.parse(await transmission.locator("pre").innerText());
    assert.equal(payload.sections.length, 3); assert(!Object.hasOwn(payload, "messages"));
    assert(payload.fields.some((field: any) => field.key === "price" && field.value === "180만원"));
    await transmission.getByRole("checkbox").check();
    await generate.click();
    await panel.getByRole("button", { name: "선택한 본문 반영", exact: true }).waitFor();
    assert.equal(calls, batch + 1);
    assert(await panel.getByRole("button", { name: "선택한 본문 반영", exact: true }).isDisabled());
    let data = await (await context.request.get(endpoint)).json();
    assert.equal(data.business.documents.current, batch * 3);
    if (batch === 0) assert.deepEqual((await loadPlanState(owner)).plans[0].sections, original, "Even a completed draft cannot overwrite canonical documents");
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No document comparison overflow at ${width}`);
      if (batch === 1 && (width === 390 || width === 1440)) {
        const commercial = panel.locator("article").filter({ has: page.getByRole("heading", { name: "사업 전략 · 가격 전략", exact: true }) });
        await commercial.evaluate((node: HTMLElement) => window.scrollTo(0, node.getBoundingClientRect().top + window.scrollY - 100));
        await page.screenshot({ path: `${root}/document-drafts-${width}.png` });
      }
    }
    const articles = panel.locator("article"); assert.equal(await articles.count(), 3);
    for (let index = 0; index < 3; index++) await articles.nth(index).getByRole("radio", { name: "새 본문으로 교체", exact: true }).check();
    await panel.getByRole("button", { name: "선택한 본문 반영", exact: true }).click();
    if (batch < 2) await panel.getByRole("button", { name: "계획서 갱신", exact: true }).waitFor();
    else await panel.waitFor({ state: "hidden" });
    data = await (await context.request.get(endpoint)).json(); assert.equal(data.business.documents.current, (batch + 1) * 3);
    assert.equal(data.saved.document.deck.slides.find((slide: any) => slide.id === "proposal-commercial").table.rows[0][1], "150만원", "PPT is unchanged until separate approval");
  }
  await context.unroute(`${LAB_URL}/api/plan/proposal**`);
  return { calls, checks: ["Nine source sections refreshed in three mocked batches using explicit payload consent and per-section comparison/approval", "Generation-response loss recovers the stored draft without another call; neither source nor PPT changes before its own approval", "Document comparison stays within 320/390/768/1440px; public document AI endpoint still returns 503"] };
}
