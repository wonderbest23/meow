import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync("app/plan/chat/page.tsx", "utf8");
const ast = ts.createSourceFile("page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const constants = new Map<string, string[]>();
let entryButton = "";
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isArrayLiteralExpression(node.initializer)) {
    constants.set(node.name.getText(ast), node.initializer.elements.map(element => ts.isStringLiteral(element) ? element.text : element.getText(ast)));
  }
  if (ts.isJsxElement(node) && node.openingElement.tagName.getText(ast) === "button" && node.getText(ast).includes("void submit(option)")) {
    entryButton = node.getText(ast);
  }
  ts.forEachChild(node, visit);
}
visit(ast);
assert.deepEqual(constants.get("ENTRY_OPTIONS"), ["아이디어가 없어요", "생각한 사업이 있어요", "사업을 운영 중이에요"]);
assert.deepEqual(constants.get("ENTRY_ICONS"), ["Lightbulb", "FileText", "Store"]);
assert.match(entryButton, /type="button"/);
assert.match(entryButton, /disabled=\{!loaded \|\| blocked\}/);
assert.match(entryButton, /pendingId\.current = null; void submit\(option\)/);
assert.match(entryButton, /aria-hidden="true"><Icon size=\{28\}/);

const css = readFileSync("app/plan/chat/page.module.css", "utf8");
assert.doesNotMatch(css, /--choice-bg|--choice-border/);
assert.match(css, /\.entryOptions button \{[^}]*border-radius:18px;[^}]*background:#f7f9fc/);
assert.match(css, /\.choiceIcon \{[^}]*flex:0 0 32px;[^}]*background:transparent/);
assert.match(css, /\.entryOptions \.choiceIcon svg \{[^}]*fill:var\(--choice-fill\)/);
assert.match(css, /\.entryOptions button:focus-visible \{[^}]*border-color:#3182f6/);
assert.match(css, /\.entryOptions button:active:not\(:disabled\) \{[^}]*border-color:#3182f6/);
assert.match(css, /\.entryOptions button \{ min-height:72px; padding:17px 18px; gap:14px; font-size:16px; \}/);
assert.match(css, /\.entryOptions button > span \{[^}]*min-width:0;[^}]*overflow-wrap:anywhere/);
assert.doesNotMatch(css, /\.entryOptions button:hover[^}]*translateY/);
assert.match(css, /prefers-reduced-motion:reduce[^}]*animation:none!important; transition:none!important/);
console.log("Chat entry buttons: neutral surface, colored standalone icons, responsive sizing, blue focus and unchanged message actions passed");
