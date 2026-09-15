import assert from "node:assert/strict";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { proposalFixture } from "./proposal-fixtures";
import { renderDeckPptx } from "../lib/plan-builder/deck-render";
import { PROPOSAL_SECTORS, PROPOSAL_PURPOSES } from "../lib/plan-builder/proposal-blueprint";
import { renderableProposal, setProposalSlideEdits } from "../lib/plan-builder/proposal-revision";

async function main() {
  let count = 0;
  const parser = new XMLParser({ ignoreAttributes: false });
  for (const sector of PROPOSAL_SECTORS) for (const purpose of PROPOSAL_PURPOSES) {
    const { deck } = proposalFixture(sector, purpose);
    const bytes = await renderDeckPptx(deck);
    const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
    assert.equal(zip.file(/^ppt\/slides\/slide\d+\.xml$/).length, deck.slides.length);
    assert.equal(zip.file(/^ppt\/notesSlides\/notesSlide\d+\.xml$/).length, deck.slides.length);
    const manifest = parser.parse(await zip.file("[Content_Types].xml")!.async("string"));
    for (const entry of manifest.Types.Override) assert.ok(zip.file(entry["@_PartName"].slice(1)), "Every declared PPTX part must exist");
    for (const [index, slide] of deck.slides.entries()) {
      const xml = await zip.file(`ppt/slides/slide${index + 1}.xml`)!.async("string");
      assert.ok(xml.includes("Malgun Gothic"));
      assert.ok(xml.includes("<a:t>"), "Text remains native PowerPoint text");
      if (slide.table) assert.ok(xml.includes("<a:tbl>"), "Tables must remain native editable tables");
      const transforms = [...xml.matchAll(/<a:xfrm[^>]*>\s*<a:off x="(\d+)" y="(\d+)"\/>\s*<a:ext cx="(\d+)" cy="(\d+)"\/>/g)];
      for (const match of transforms) {
        assert.ok(Number(match[1]) + Number(match[3]) <= 13.33 * 914400 + 10, `Horizontal overflow on ${sector}/${purpose}/${index + 1}`);
        assert.ok(Number(match[2]) + Number(match[4]) <= 7.5 * 914400 + 10, `Vertical overflow on ${sector}/${purpose}/${index + 1}`);
      }
    }
    count++;
  }
  const fixture = proposalFixture();
  const edited = setProposalSlideEdits({ revision: 1, ...fixture, edits: {} }, "proposal-cover", { text: { title: "직접 수정한 표지" }, layout: { title: { x: 1.2, y: 2.1, w: 9, h: 1.5 } } }, 1);
  const editedZip = await JSZip.loadAsync(await renderDeckPptx(renderableProposal(edited)));
  const editedXml = await editedZip.file("ppt/slides/slide1.xml")!.async("string");
  assert.ok(editedXml.includes("직접 수정한 표지"));
  assert.ok(editedXml.includes('x="1097280" y="1920240"'), "User placement must reach the actual PPTX renderer");
  const legacy = { brandName: "Legacy", slogan: "Saved v1", slides: Array.from({ length: 8 }, (_, i) => ({ title: `Legacy ${i}`, eyebrow: "Legacy", sourceSections: ["Saved source"] })) };
  const legacyZip = await JSZip.loadAsync(await renderDeckPptx(legacy));
  assert.equal(legacyZip.file(/^ppt\/slides\/slide\d+\.xml$/).length, 8, "Existing v1 downloads remain compatible");
  console.log(`proposal render: ${count} native PPTX combinations, content types, source notes, geometry, local edits and v1 compatibility passed; no AI calls`);
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
