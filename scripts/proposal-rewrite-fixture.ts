import { randomUUID } from "node:crypto";
import { proposalFixture } from "./proposal-fixtures";
import { chaptersForType } from "../lib/plan-builder/blueprint";
import { normalizeState, savePlanState, loadPlanState } from "../lib/plan-builder/plan-server-store";
import { deckFingerprint, deckSource } from "../lib/plan-builder/deck-job";
import { saveProposalEditor } from "../lib/plan-builder/proposal-editor-service";
import type { RewritePayload, RewritePreview } from "../lib/plan-builder/proposal-rewrite";
import { COACH_KEY, COACH_TYPES, COACH_VERSION, type CoachState } from "../lib/plan-builder/coach";
import type { DocumentRefreshPayload } from "../lib/plan-builder/document-refresh";

export async function seedRewriteFixture(owner: string, planId: string) {
  const fixture = proposalFixture(), at = new Date().toISOString();
  const keys = chaptersForType("").flatMap(ch => ch.sections.map(section => `${ch.id}/${section.id}`)).slice(0, 12);
  const sourceText = fixture.source.sections.map(section => {
    const role = section.sectionTitle;
    const slide = fixture.deck.slides.find(item => item.composition?.role === role);
    const text = slide ? [slide.title, slide.lead, ...slide.points?.map(point => `${point.label}: ${point.detail}`) ?? [], ...slide.table?.rows.map(row => row.join(" / ")) ?? []].filter(Boolean).join("\n") : section.markdown;
    return "가상 검증 자료이며 실제 사업이나 계약이 아닙니다\n" + (role === "commercial" ? text : text.replaceAll("150만원", "가격은 거래 조건 항목 참조"));
  });
  const state = normalizeState({ business: { name: fixture.source.businessName, description: fixture.source.businessDescription!, role: "", region: "", industry: "", stage: "" }, activePlanId: planId, plans: [{ id: planId, title: fixture.source.businessName, planType: "", createdAt: at, updatedAt: at, answers: {}, sections: Object.fromEntries(keys.map((key, index) => [key, { markdown: sourceText[index], html: "", generatedAt: at }])) }] });
  const presentation = { sector: "b2b_service" as const, purpose: "sales" as const };
  const source = { ...deckSource(state.plans[0], state.business), presentation };
  const names = new Map(fixture.source.sections.map((section, index) => [`${section.chapterTitle} · ${section.sectionTitle}`, `${source.sections[index].chapterTitle} · ${source.sections[index].sectionTitle}`]));
  fixture.deck.slides.forEach(slide => { slide.sourceSections = slide.sourceSections?.map(name => names.get(name)!); });
  const token = randomUUID();
  state.plans[0].answers.__deck_job = { token, runId: "synthetic-rewrite", fingerprint: deckFingerprint(source), presentation, status: "complete", phase: "ready", attempt: 1, updatedAt: at, result: fixture.deck };
  await savePlanState(owner, state);
  await saveProposalEditor(owner, planId, { type: "initialize", generationToken: token, requestId: randomUUID(), expectedRevision: 0 });
  return { keys, commercialKey: keys[5], fixture };
}

export async function changeFixturePrice(owner: string, planId: string, key: string, from = "150만원", to = "180만원") {
  const state = await loadPlanState(owner), plan = state.plans.find(item => item.id === planId)!;
  if (!plan.sections[key].markdown.includes(from)) throw new Error("fixture_price_not_found");
  plan.sections[key].markdown = plan.sections[key].markdown.replaceAll(from, to);
  plan.updatedAt = new Date(Math.max(Date.now(), Date.parse(plan.updatedAt) + 1)).toISOString();
  await savePlanState(owner, state);
}

export function mockRewrite(payload: RewritePayload) {
  return { slides: payload.slides.map(slide => ({ id: slide.id, eyebrow: slide.eyebrow, title: slide.title, lead: slide.lead ?? null, note: slide.note ?? null,
    points: slide.points?.map(point => ({ ...point, detail: point.detail.replaceAll("150만원", "180만원") })) ?? null,
    metrics: slide.metrics?.map(metric => ({ ...metric, note: metric.note ?? null })) ?? null,
    table: slide.table ? { headers: slide.table.headers, rows: slide.table.rows.map(row => row.map(cell => cell.replaceAll("150만원", "180만원"))) } : null,
    sourceSections: slide.sourceSections,
  })) };
}
export function rewriteRequest(preview: RewritePreview) { return { type: "generate" as const, id: randomUUID(), hash: preview.hash, consent: true as const }; }

export function documentFixtureResult(payload: DocumentRefreshPayload) {
  return { sections: payload.sections.map(section => ({ key: section.key, markdown: section.markdown.replaceAll("150만원", payload.fields.find(field => field.key === "price")!.value), summary: section.key === "strategy/price" ? "공통 판매가를 거래 조건에 반영했습니다" : "기존 본문을 유지하며 현재 조건을 확인했습니다" })) };
}

export async function seedBusinessRewriteFixture(owner: string, planId: string) {
  const fixture = proposalFixture(), at = new Date().toISOString();
  const chapters = chaptersForType(COACH_TYPES.startup);
  const targets = chapters.flatMap(chapter => chapter.sections.map(section => ({ key: `${chapter.id}/${section.id}`, chapterTitle: chapter.title, sectionTitle: section.title })));
  const roleKeys: Record<string, string> = { summary: "overview/summary", problem: "overview/problem", solution: "market/products", offering: "market/products", workflow: "strategy/distribution", commercial: "strategy/price", evidence: "market/personas", economics: "financials/expenses", roadmap: "strategy/promotion", risks: "summary/executive", team: "summary/executive", ask: "summary/executive" };
  const sectionText = (key: string) => fixture.source.sections.filter(section => roleKeys[section.sectionTitle] === key).map(section => {
    const slide = fixture.deck.slides.find(item => item.composition?.role === section.sectionTitle);
    const content = slide ? [slide.title, slide.lead, ...slide.points?.map(point => `${point.label}: ${point.detail}`) ?? [], ...slide.table?.rows.map(row => row.join(" / ")) ?? []].filter(Boolean).join("\n") : section.markdown;
    return "가상 검증 자료이며 실제 사업이나 계약이 아닙니다\n" + (key === "strategy/price" ? content : content.replaceAll("150만원", "가격은 거래 조건 항목 참조"));
  }).join("\n\n");
  const coach: CoachState = { version: COACH_VERSION, revision: 1, documentRevision: 1, stage: "operating", depth: "practical", ready: true, suggestions: [], messages: [],
    business: { name: fixture.source.businessName, description: fixture.source.businessDescription!, role: "", industry: "B2B", region: "", stage: "운영 중" },
    fields: Object.entries({ business: fixture.source.businessDescription!, offer: "제품 소개서 12쪽과 편집 원본", customer: "소규모 제조사", price: "150만원", unitCost: "30만원", cost: "50만원", volume: "2" }).map(([key, value]) => ({ key: key as CoachState["fields"][number]["key"], value, basis: "user", quote: value, messageId: "synthetic-input" })) };
  const state = normalizeState({ business: coach.business, activePlanId: planId, plans: [{ id: planId, title: coach.business.name, planType: COACH_TYPES.startup, createdAt: at, updatedAt: at,
    answers: { [COACH_KEY]: { state: coach }, ...Object.fromEntries(targets.map(target => [target.key, { planning_source: true }])) },
    sections: Object.fromEntries(targets.map(target => [target.key, { markdown: sectionText(target.key), html: `<p>${sectionText(target.key).replaceAll("\n", "<br>")}</p>`, coachRevision: 1, generatedAt: at }])) }] });
  fixture.deck.slides.forEach(slide => { slide.sourceSections = [...new Set(slide.sourceSections?.map(name => {
    const target = targets.find(item => item.key === roleKeys[name.split(" · ")[1]])!;
    return `${target.chapterTitle} · ${target.sectionTitle}`;
  }))]; });
  const presentation = { sector: "b2b_service" as const, purpose: "sales" as const }, token = randomUUID();
  await savePlanState(owner, state);
  // Match the production job boundary: fingerprint the database representation, not insertion-order objects.
  const persisted = await loadPlanState(owner);
  persisted.plans[0].answers.__deck_job = { token, runId: "synthetic-business-rewrite", fingerprint: deckFingerprint({ ...deckSource(persisted.plans[0], persisted.business), presentation }), presentation, status: "complete", phase: "ready", attempt: 1, updatedAt: at, result: fixture.deck };
  await savePlanState(owner, persisted);
  await saveProposalEditor(owner, planId, { type: "initialize", generationToken: token, requestId: randomUUID(), expectedRevision: 0 });
  return { keys: targets.map(target => target.key), commercialKey: "strategy/price", fixture };
}
