import PptxGenJS from "pptxgenjs";
import type { DeckPlan } from "./deck-plan";
import { proposalScenes } from "./proposal-scene";

export function appendEditorialDeck(pptx: PptxGenJS, plan: DeckPlan) {
  for (const scene of proposalScenes(plan)) {
    const slide = pptx.addSlide();
    slide.background = { color: "FFFFFF" };
    for (const node of scene.nodes) {
      if (node.type === "text") slide.addText(node.text, node.options);
      else if (node.type === "shape") slide.addShape(pptx.ShapeType[node.shape], node.options);
      else if (node.type === "image") slide.addImage(node.options);
      else slide.addTable(node.rows, node.options);
    }
    slide.addNotes(scene.notes);
  }
}
