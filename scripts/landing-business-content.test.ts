import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BUSINESS_TEMPLATE_IDS, BUSINESS_TEMPLATE_PROFILES, businessTemplateManifest, createBusinessTemplate, type BusinessContent } from "../lib/landing/brainwave/business-content";
import { BRAINWAVE_DEFAULT_FOR_TEMPLATE, BRAINWAVE_PAGES } from "../lib/landing/brainwave/catalog";
import { applyBusinessContent, landingPageDataSchema } from "../lib/landing/page-data";
import { ensureLandingPageData, landingDraftSchema } from "../lib/landing/domain";
import { landingDraftFromPlan } from "../lib/landing/from-plan";
import { COACH_KEY, COACH_VERSION } from "../lib/plan-builder/coach";

const source: BusinessContent = { businessName: "동네사진", offer: "메뉴 사진 5장", description: "음식점 메뉴 사진 촬영", customer: "동네 음식점", price: "제안 가격 · 5만원", cta: "촬영 문의", image: "/home-media/oneulstart-first-day.webp" };
for (const pageId of BUSINESS_TEMPLATE_IDS) {
  const generated = createBusinessTemplate(source, pageId);
  const manifest = businessTemplateManifest[pageId];
  const profile = BUSINESS_TEMPLATE_PROFILES[pageId];
  const nodes = new Set(manifest.sections.flatMap(section => section.nodes));
  assert.equal(generated.contentMode, "business");
  for (const id of Object.keys(profile.fields)) assert.ok(manifest.texts.includes(id), `${pageId}: missing text slot ${id}`);
  for (const id of generated.hidden) assert.ok(nodes.has(id), `${pageId}: missing hidden node ${id}`);
  assert.equal(Object.keys(generated.texts).length, manifest.texts.length);
  assert.equal(generated.texts[profile.headline], source.businessName);
  assert.equal(generated.texts[profile.button], source.cta);
  assert.ok(Object.values(generated.texts).some(text => text.includes(source.price)), `${pageId}: price is shown without invention`);
  for (const section of manifest.sections) {
    for (const id of section.images) assert.equal(generated.images[id], source.image);
    if (/testimonial|facts|pricing|logos|jobs|subscribe|footer/i.test(section.name)) assert.ok(generated.hidden.includes(section.id), `${pageId}: ${section.name} hidden`);
    for (const button of section.buttons) {
      const active = button.texts.some(id => profile.fields[id] === "cta");
      assert.equal(generated.links[button.id], active ? "contact" : "none");
      if (active) assert.ok(!generated.hidden.includes(button.id));
    }
  }
  type Node = { id?: string; tag: string; text?: string; ch?: Node[] };
  const page = JSON.parse(readFileSync(new URL(`../lib/landing/brainwave/pages/${pageId}.json`, import.meta.url), "utf8"));
  const visible = (node: Node): string => {
    if (node.id && generated.hidden.includes(node.id)) return "";
    if (node.id && node.ch?.some(child => child.tag === "#")) return generated.texts[node.id] ?? "UNMAPPED_TEMPLATE_TEXT";
    if (node.tag === "#") return node.text ?? "";
    return (node.ch ?? []).map(visible).join(" ");
  };
  const text = visible(page.root);
  assert.ok(text.includes(source.businessName));
  assert.ok(!/UNMAPPED_TEMPLATE_TEXT|Brainwave.io|Shade Pro|Albino|1M\+|93%|Isabella|Maria|support@/.test(text), `${pageId}: raw template claim leaked`);
  assert.doesNotThrow(() => landingPageDataSchema.parse({ brainwave: generated, businessContent: source, root: { props: { title: source.businessName } }, content: [] }));
}
assert.deepEqual(BUSINESS_TEMPLATE_IDS.toSorted(), BRAINWAVE_PAGES.filter(page => page.group === "landing").map(page => page.id).toSorted());
for (const id of Object.values(BRAINWAVE_DEFAULT_FOR_TEMPLATE)) assert.ok(BUSINESS_TEMPLATE_IDS.includes(id));
assert.throws(() => createBusinessTemplate(source, "0-4339"), /사용할 수 없는/);

const draft = landingDraftFromPlan({ planTitle: "다른 사업", business: { name: "잘못된 전역 사업" }, answers: { [COACH_KEY]: { state: { version: COACH_VERSION, revision: 1, stage: "operating", depth: "quick", ready: true, business: { name: "동네사진", industry: "사진", region: "", description: "", role: "", stage: "운영 중" }, messages: [], suggestions: [], fields: [
  { key: "offer", value: source.offer, basis: "user", quote: source.offer, messageId: "a" },
  { key: "customer", value: source.customer, basis: "user", quote: source.customer, messageId: "a" },
  { key: "price", value: "5만원", basis: "proposal", quote: "", messageId: "" },
  { key: "sales", value: "비공개 매출 80만원", basis: "user", quote: "비공개 매출 80만원", messageId: "a" },
] } } } });
landingDraftSchema.parse(draft);
const data = draft.pageData!;
assert.equal(data.businessContent?.businessName, source.businessName);
assert.equal(data.businessContent?.customer, source.customer);
assert.ok(JSON.stringify(data.brainwave?.texts).includes(source.offer));
assert.ok(!JSON.stringify(data).includes("비공개 매출"));
assert.ok(!JSON.stringify(data).includes("잘못된 전역"));

const bw = data.brainwave!;
const profile = BUSINESS_TEMPLATE_PROFILES[bw.page];
const manual = structuredClone(data);
manual.brainwave!.texts[profile.headline] = "직접 고친 제목";
manual.brainwave!.texts[profile.description] = "";
const photoId = Object.keys(bw.images)[0];
manual.brainwave!.images[photoId] = "/my-photo.webp";
manual.brainwave!.links["manual-link"] = "https://example.com/contact";
manual.brainwave!.sizes[profile.headline] = 1.15;
manual.brainwave!.hidden.push(profile.facts[0].label);
manual.brainwave!.order = [...profile.sections].reverse();
const before = structuredClone(manual);
const updatedSource = { ...data.businessContent!, businessName: "새 사업 이름", price: "8만원" };
const merged = applyBusinessContent(manual, updatedSource);
assert.deepEqual(manual, before, "Applying content must not mutate the caller");
assert.equal(merged.brainwave!.texts[profile.headline], "직접 고친 제목");
assert.equal(merged.brainwave!.texts[profile.description], "", "Manual deletion is retained");
assert.equal(merged.brainwave!.images[photoId], "/my-photo.webp");
const withoutAutomaticImage = applyBusinessContent(manual, { ...updatedSource, image: "" });
assert.equal(withoutAutomaticImage.brainwave!.images[photoId], "/my-photo.webp");
assert.ok(!withoutAutomaticImage.brainwave!.hidden.includes(photoId), "Clearing the default image must not hide a manually selected photo");
assert.equal(merged.brainwave!.links["manual-link"], "https://example.com/contact");
assert.equal(merged.brainwave!.sizes[profile.headline], 1.15);
assert.ok(merged.brainwave!.hidden.includes(profile.facts[0].label));
assert.deepEqual(merged.brainwave!.order, manual.brainwave!.order);
for (const [id, field] of Object.entries(profile.fields)) if (field === "price") assert.equal(merged.brainwave!.texts[id], "8만원");
assert.deepEqual(applyBusinessContent(merged, updatedSource), merged, "Reapplying is idempotent");
assert.deepEqual(ensureLandingPageData({ ...draft, pageData: manual }).pageData, manual, "Loading preserves manual content");

const legacy = { root: { props: {} }, content: [], brainwave: { page: "0-290", texts: { "0:414": "옛 편집 제목", "0:316": "직접 작성한 후기" }, images: {}, links: {}, sizes: {}, hidden: [], order: [] } };
const upgraded = applyBusinessContent(legacy, source);
assert.equal(upgraded.brainwave!.texts["0:414"], "옛 편집 제목");
assert.equal(upgraded.brainwave!.texts["0:316"], "직접 작성한 후기");
assert.ok(!upgraded.brainwave!.hidden.includes("0:314"), "Do not hide a manually written legacy section");
assert.equal(upgraded.brainwave!.texts["0:320"], "", "Untouched template review is removed");
const unknown = createBusinessTemplate({ ...source, customer: "", price: "", image: "" }, "0-290");
assert.equal(unknown.texts["0:342"], "");
assert.equal(unknown.texts["0:348"], "");
assert.ok(unknown.hidden.includes("0:343"), "Missing customer must not leave an empty customer label");
assert.equal(Object.keys(unknown.images).length, 0);
const withoutImage = landingPageDataSchema.parse({ root: { props: {} }, content: [], businessContent: { ...source, image: "" }, brainwave: unknown });
const withImage = applyBusinessContent(withoutImage, source);
const imageIds = businessTemplateManifest["0-290"].sections.flatMap(section => section.images);
for (const id of imageIds) assert.ok(!withImage.brainwave!.hidden.includes(id), "New image must replace the automatic missing-image hiding");
const manuallyHiddenImage = structuredClone(withImage);
manuallyHiddenImage.brainwave!.hidden.push(imageIds[0]);
assert.ok(applyBusinessContent(manuallyHiddenImage, { ...source, image: "/new-photo.webp" }).brainwave!.hidden.includes(imageIds[0]), "User-hidden images remain hidden after refresh");
console.log("landing-business-content: 10 templates, claim removal, coach mapping, unknown values, explicit refresh, manual preservation and legacy compatibility passed");
