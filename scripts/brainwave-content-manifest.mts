import { readFileSync, writeFileSync } from "node:fs";
import { BRAINWAVE_PAGES } from "../lib/landing/brainwave/catalog";

type Node = { id?: string; name?: string; tag: string; src?: string; ch?: Node[] };
const manifest = Object.fromEntries(BRAINWAVE_PAGES.filter(page => page.group === "landing").map(({ id }) => {
  const page = JSON.parse(readFileSync(new URL(`../lib/landing/brainwave/pages/${id}.json`, import.meta.url), "utf8"));
  const sections = page.root.ch.filter((node: Node) => node.id).map((section: Node) => {
    const images: string[] = [];
    const buttons: Array<{ id: string; texts: string[] }> = [];
    const nodes: string[] = [];
    const textIds = (node: Node): string[] => [
      ...(node.id && node.ch?.some(child => child.tag === "#") ? [node.id] : []),
      ...(node.ch ?? []).flatMap(textIds),
    ];
    const visit = (node: Node, inButton = false) => {
      if (node.id) nodes.push(node.id);
      if (node.tag === "img" && node.id && node.src && !node.src.endsWith(".svg")) images.push(node.id);
      const button = !inButton && !!node.id && /button/i.test(node.name ?? "");
      if (button) buttons.push({ id: node.id!, texts: textIds(node) });
      node.ch?.forEach(child => visit(child, inButton || button));
    };
    visit(section);
    return { id: section.id, name: section.name, nodes, images, buttons };
  });
  return [id, { texts: page.slots.text.map((slot: { id: string }) => slot.id), sections }];
}));
const output = `${JSON.stringify(manifest)}\n`;
const path = new URL("../lib/landing/brainwave/content-manifest.json", import.meta.url);
if (process.argv.includes("--check")) {
  if (readFileSync(path, "utf8") !== output) throw new Error("Regenerate the Brainwave content manifest");
} else {
  writeFileSync(path, output);
}
