/*
 * 배포할 서버 파일(약 50MB)을 ASCII 글자만 남게 바꾼다 — 서버 메모리를 절반 가까이 줄이려고.
 *
 * 왜: V8은 소스에 한글 같은 글자가 하나라도 있으면 소스 전체를 글자당 2바이트로 메모리에 올린다.
 * 묶음 도구(esbuild)는 문자열 안의 한글은 \uXXXX 로 바꿔 주지만 정규식 안의 한글은 그대로 둔다. 그래서 5천만 자 중
 * 8만 자가 남아, 서버가 시작하자마자 119MB(한도 128MB)를 썼다. 운영에서 사업 방향 정리처럼 30초 넘게 도는 작업이
 * "Worker exceeded memory limit"로 죽었다(2026-11-18 운영 기록: 세 번 연속 실패, 손님은 170초 뒤 "정리하지 못했어요").
 * 남은 글자를 \uXXXX 로 바꾸면 같은 코드가 68MB로 시작한다(로컬 workerd 실측: 118.7MB → 68.0MB).
 *
 * 하는 일: wrangler 가 올릴 파일을 --dry-run 으로 먼저 만들고(.open-next/ascii), 그 안의 JS에서 ASCII 밖 글자를 \uXXXX 로 바꾼다.
 * 문자열 · 템플릿 · 정규식 · 이름 · 주석 어디서든 \uXXXX 는 같은 글자를 뜻해 동작은 바뀌지 않는다.
 * 배포는 이 파일을 다시 묶지 않고 그대로 올린다(package.json deploy: --no-bundle).
 */
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const OUT_DIR = ".open-next/ascii";

/** ASCII 밖 글자를 \uXXXX 로 바꾼다(UTF-16 단위별 — 이모지는 대리 쌍 두 개가 된다). */
export function escapeNonAscii(source) {
  let count = 0;
  const text = source.replace(/[^\x00-\x7f]/g, ch => { count++; return `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`; });
  return { text, count };
}

function main() {
  rmSync(OUT_DIR, { recursive: true, force: true });
  // OPEN_NEXT_DEPLOY: wrangler 가 OpenNext 프로젝트를 보고 opennextjs-cloudflare 를 다시 부르지 않게(같은 값을 OpenNext 배포도 쓴다)
  const built = spawnSync("npx", ["--no-install", "wrangler", "deploy", "--dry-run", "--outdir", OUT_DIR, ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, OPEN_NEXT_DEPLOY: "true" } });
  if (built.status !== 0) { console.error("✘ 서버 파일을 미리 만들지 못했어요(wrangler deploy --dry-run)."); process.exit(1); }
  const scripts = readdirSync(OUT_DIR).filter(name => /\.(js|mjs)$/.test(name));
  if (!scripts.includes("cloudflare-worker.js")) { console.error(`✘ ${OUT_DIR}/cloudflare-worker.js 가 없어요. wrangler 출력 이름이 바뀌었는지 확인하세요.`); process.exit(1); }
  for (const name of scripts) {
    const file = join(OUT_DIR, name), before = readFileSync(file, "utf8"), { text, count } = escapeNonAscii(before);
    if (/[^\x00-\x7f]/.test(text)) { console.error(`✘ ${file} 에 ASCII 밖 글자가 남았어요.`); process.exit(1); }
    writeFileSync(file, text);
    console.log(`· ${file}: ${count.toLocaleString()}자를 \\uXXXX 로 바꿈 · ${(text.length / 1048576).toFixed(1)}MB`);
  }
  // 소스맵은 올리지 않는다(지금도 올리지 않음). 70MB 파일이 추가 모듈로 딸려 가지 않게 지운다.
  for (const name of readdirSync(OUT_DIR)) if (name.endsWith(".map")) rmSync(join(OUT_DIR, name));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
