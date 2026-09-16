import PptxGenJS from "pptxgenjs";
import JSZip from "jszip";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import type { DeckPlan } from "./deck-plan";
import { proposalScenes, proposalLayoutIssues, proposalImageViewport, proposalChartScale } from "./proposal-scene";

export async function repairEditorialChartData(zip: JSZip): Promise<boolean> {
  const options = { ignoreAttributes: false, parseTagValue: false };
  let repaired = false;
  for (const file of zip.file(/^ppt\/embeddings\/.*\.xlsx$/)) {
    const workbook = await JSZip.loadAsync(await file.async("uint8array"));
    let changed = false;
    for (const sheet of workbook.file(/^xl\/worksheets\/sheet\d+\.xml$/)) {
      const xml = new XMLParser(options).parse(await sheet.async("string"));
      const rows = xml.worksheet?.sheetData?.row;
      if (!rows) continue;
      let sheetChanged = false;
      for (const row of Array.isArray(rows) ? rows : [rows]) {
        if (!row.c) continue;
        for (const cell of Array.isArray(row.c) ? row.c : [row.c]) {
          // PptxGenJS serializes numeric zero as an empty workbook value. Chart inputs cannot be missing.
          if ((!cell["@_t"] || cell["@_t"] === "n") && cell.v === "") { cell.v = "0"; sheetChanged = true; }
        }
      }
      if (sheetChanged) { workbook.file(sheet.name, new XMLBuilder(options).build(xml)); changed = true; }
    }
    if (changed) { zip.file(file.name, await workbook.generateAsync({ type: "uint8array", compression: "DEFLATE" })); repaired = true; }
  }
  return repaired;
}

export function appendEditorialDeck(pptx: PptxGenJS, plan: DeckPlan) {
  const scenes = proposalScenes(plan);
  if (plan.schemaVersion === 3) {
    const issues = proposalLayoutIssues(plan, scenes);
    if (issues.length) throw new Error(`proposal_layout_review_required: ${issues.map(issue => `${issue.slideId} ${issue.message}`).slice(0, 8).join(" / ")}`);
  }
  for (const scene of scenes) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    for (const node of scene.nodes) {
      if (node.type === "text") slide.addText(node.text, { ...node.options, objectName: node.id, breakLine: false });
      else if (node.type === "shape") slide.addShape(pptx.ShapeType[node.shape], node.options);
      else if (node.type === "image") {
        const viewport = proposalImageViewport(node.options), crop = viewport.crop;
        slide.addImage({ data: viewport.data, x: viewport.x, y: viewport.y, w: crop ? viewport.w / crop.w : viewport.w, h: crop ? viewport.h / crop.h : viewport.h,
          sizing: crop ? { type: "crop", x: crop.x * viewport.w / crop.w, y: crop.y * viewport.h / crop.h, w: viewport.w, h: viewport.h } : { ...viewport.sizing, w: viewport.w, h: viewport.h }, altText: viewport.altText, objectName: node.id });
      }
      else if (node.type === "chart") {
        const scale = proposalChartScale(node.chart);
        slide.addChart(node.chart.type === "line" ? pptx.ChartType.line : pptx.ChartType.bar, node.chart.series.map(series => ({ name: series.name, labels: node.chart.categories, values: series.values })), {
          ...node.options, objectName: node.id, barDir: "col", barGrouping: "clustered", chartColors: ["2266CF", "328071", "BF694B"], showLegend: true, legendPos: "b", legendFontFace: "Malgun Gothic", legendFontSize: 11,
          showTitle: false, showValue: false,
          catAxisLabelFontFace: "Malgun Gothic", catAxisLabelFontSize: 11, catAxisLabelColor: "637083", catAxisLabelRotate: 0,
          valAxisLabelFontFace: "Malgun Gothic", valAxisLabelFontSize: 10, valAxisLabelColor: "637083", valAxisMinVal: scale.min, valAxisMaxVal: scale.max, valAxisMajorUnit: scale.step,
          valGridLine: { color: "DCE2E9", size: .5 }, layout: { x: .1, y: .05, w: .87, h: .73 },
        });
      }
      else slide.addTable(node.rows, { ...node.options, objectName: node.id });
    }
    slide.addNotes(scene.notes);
  }
}
