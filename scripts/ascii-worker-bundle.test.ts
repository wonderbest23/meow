import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
// @ts-expect-error 배포 스크립트(.mjs)라 타입 선언이 없다
import { escapeNonAscii, OUT_DIR } from "./ascii-worker-bundle.mjs";

/**
 * 배포 파일을 ASCII로 바꿔도 코드 동작이 같은지 본다(scripts/ascii-worker-bundle.mjs).
 * 한글이 하나라도 남으면 서버 소스 전체가 2배로 메모리에 올라 운영에서 "Worker exceeded memory limit"가 났다(2026-11-18).
 */
const source = [
  "const a = /[가-힣]{2,}(?:으로|로)\\s*바꿔/i;",
  "const b = /^(.+?) · (평일만|주말만)$/u;",
  "const c = `월세 ${1}만원 😀`;",
  "const 이름 = '한글 이름'; // 주석도 한글",
  "module.exports = [a.test('가격으로 바꿔'), a.test('price'), b.exec('가게 · 주말만')?.[2], c, 이름, /😀/u.test(c), '\\uac00' === '가'];",
].join("\n");
const run = (code: string) => { const module = { exports: null as unknown }; new Function("module", code)(module); return module.exports; };
const { text, count } = escapeNonAscii(source);
assert.ok(count > 20, "바꾼 글자 수를 센다");
assert.ok(!/[^\x00-\x7f]/.test(text), "ASCII 밖 글자가 남지 않는다");
assert.deepEqual(run(text), run(source), "정규식 · 템플릿 · 이름 · 이모지가 바꾸기 전과 똑같이 동작한다");
assert.deepEqual(run(text), [true, false, "주말만", "월세 1만원 😀", "한글 이름", true, true]);
assert.deepEqual(escapeNonAscii("plain ascii"), { text: "plain ascii", count: 0 });

// 배포 · 올리기 명령이 ASCII로 바꾼 파일을 다시 묶지 않고 그대로 올리는지
const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts as Record<string, string>;
for (const name of ["deploy", "upload"]) {
  assert.match(scripts[name], /opennextjs-cloudflare build && node scripts\/ascii-worker-bundle\.mjs && opennextjs-cloudflare /, `${name}: 빌드 뒤 ASCII로 바꾼다`);
  assert.ok(scripts[name].endsWith(`${OUT_DIR}/cloudflare-worker.js --no-bundle`), `${name}: 바꾼 파일을 그대로 올린다`);
}
console.log("ascii-worker-bundle: ok");
