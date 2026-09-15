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
assert.deepEqual(actions.map(action => action.icon), ["chat", "document", "download", "workspace", "website"]);
assert.deepEqual(actions.map(action => action.variant), ["solid", "soft", "soft", "soft", "solid"]);

const component = read("home-action.tsx");
assert.match(component, /AnchorHTMLAttributes<HTMLAnchorElement>/);
assert.match(component, /aria-hidden="true"><Icon/);
assert.doesNotMatch(component, /ArrowRight/);
assert.match(component, /<a \{\.\.\.props\}/);
const css = read("home-action.module.css");
assert.match(css, /width: fit-content/);
assert.match(css, /max-width: 100%/);
assert.match(css, /min-height: 56px/);
assert.match(css, /border-radius: 8px/);
assert.doesNotMatch(css, /border-radius: (999px|50%)/);
assert.match(css, /focus-visible/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /background: #edf4ff/);
assert.match(css, /background: #2f6fe4/);
assert.doesNotMatch(css, /#286e75|#35767d|#254e56/);
const luminance = (hex: string) => hex.match(/\w{2}/g)!.map(pair => {
  const channel = parseInt(pair, 16) / 255;
  return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
}).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
assert.ok(contrast("ffffff", "2f6fe4") >= 4.5);
assert.ok(contrast("245fc4", "edf4ff") >= 4.5);
for (const name of ["home-phone-story.module.css", "home-result-showcase.module.css", "home-service-overview.module.css"]) {
  assert.match(read(name), /margin-top: var\(--home-action-gap, 32px\)/);
}
console.log("Home actions: semantic icons, distinct variants, preserved destinations/downloads and responsive spacing passed");
