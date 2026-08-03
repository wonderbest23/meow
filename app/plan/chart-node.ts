import { Node, mergeAttributes } from "@tiptap/core";
import { chartToSvg, parseChartSpec } from "../../lib/plan-builder/chart";

/*
 * 편집기 안의 차트를 통째로 다루는 노드.
 *
 * 이게 없으면 TipTap이 <figure class="plan-chart-figure"> 안의 SVG를 모르는 태그로 보고
 * 버린다. 그래서 문서 화면에서 그래프가 사라지고 축 눈금 글자만
 * "0 590만 1,181만 …"처럼 한 줄로 남았다. 마크다운으로 되돌릴 때도 함께 없어졌다.
 *
 * atom으로 두어 안쪽을 편집하지 않고, data-chart-spec(원본 스펙)만 보존한다.
 * 그 속성을 html-to-markdown이 읽어 ```plan-chart 펜스로 되돌린다.
 */
export const ChartFigure = Node.create({
  name: "planChart",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      spec: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-chart-spec"),
        renderHTML: (attributes: Record<string, unknown>) =>
          attributes.spec ? { "data-chart-spec": attributes.spec as string } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "figure.plan-chart-figure" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["figure", mergeAttributes(HTMLAttributes, { class: "plan-chart-figure" })];
  },

  /* 화면에는 스펙으로 SVG를 다시 그려 넣는다 — 원본 SVG를 문서에 이고 다니지 않는다 */
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("figure");
      dom.className = "plan-chart-figure";
      const raw = node.attrs.spec as string | null;
      if (raw) {
        dom.setAttribute("data-chart-spec", raw);
        const spec = parseChartSpec(raw);
        if (spec) dom.innerHTML = chartToSvg(spec);
      }
      dom.contentEditable = "false";
      return { dom };
    };
  },
});
