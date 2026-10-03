import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const read = (name: string) => readFileSync(`components/${name}`, "utf8");
const actions: { href: string; icon: string; variant: string; target?: string; rel?: string; download: boolean }[] = [];

for (const name of ["home-phone-story.tsx", "home-result-showcase.tsx", "home-service-overview.tsx"]) {
  const source = ts.createSourceFile(name, read(name), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node) => {
    if (ts.isJsxOpeningElement(node) && node.tagName.getText(source) === "HomeAction") {
      const attrs = new Map(node.attributes.properties.filter(ts.isJsxAttribute).map(attr => [attr.name.getText(source), attr.initializer && ts.isStringLiteral(attr.initializer) ? attr.initializer.text : true]));
      actions.push({ href: String(attrs.get("href")), icon: String(attrs.get("icon")), variant: String(attrs.get("variant") ?? "soft"), target: attrs.get("target") as string | undefined, rel: attrs.get("rel") as string | undefined, download: attrs.has("download") });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

assert.deepEqual(actions.map(action => action.href), ["/plan/chat?new=1", "/samples/sample_coffee.pdf", "/samples/sample_coffee.pptx", "/plan", "/plan/homepage"]);
assert.equal(actions[1].target, "_blank");
assert.equal(actions[1].rel, "noopener noreferrer");
assert.equal(actions[2].download, true);
assert.deepEqual(actions.map(action => action.variant), ["solid", "soft", "soft", "soft", "solid"]);

// 2026-10-03 디자인: 글자 + 오른쪽 꺾쇠(>) 하나, 둥근 모서리 10, 높이 52
const component = read("home-action.tsx");
assert.match(component, /AnchorHTMLAttributes<HTMLAnchorElement>/);
assert.match(component, /<ChevronRight /);
assert.doesNotMatch(component, /ArrowRight/);
assert.match(component, /<a \{\.\.\.props\}/);
const css = read("home-action.module.css");
assert.match(css, /width: fit-content/);
assert.match(css, /max-width: 100%/);
assert.match(css, /min-height: 52px/);
assert.match(css, /border-radius: 10px/);
assert.doesNotMatch(css, /border-radius: (999px|50%)/);
assert.match(css, /focus-visible/);
for (const name of ["home-phone-story.module.css", "home-result-showcase.module.css", "home-service-overview.module.css"]) {
  assert.match(read(name), /margin-top: var\(--home-action-gap, 32px\)/);
}
console.log("Home actions: destinations/downloads, two variants, chevron button shape and responsive spacing passed");
