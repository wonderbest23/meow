/*
 * 배포 전 안전 점검.
 *
 * next dev 와 next build 는 같은 .next 폴더를 쓴다. 둘이 겹치면 빌드가 CPU 0% 로
 * 멈추고, 멈춘 빌드가 .next/lock 을 쥔 채 남아서 그다음 배포까지 조용히 실패한다
 * ("Another next build process is already running"). 로그 마지막 줄이 "> next build"
 * 에서 멈춰 있어 실패한 줄도 모르고 넘어가기 쉽다 — 실제로 이 프로젝트에서 배포가
 * 세 번 그렇게 날아갔다.
 *
 * 그래서 배포를 시작하기 전에 두 가지만 본다.
 *   1. 개발서버가 돌고 있는가 → 있으면 멈추고 사람에게 알린다(임의로 죽이지 않는다).
 *   2. 죽은 빌드가 남긴 잠금이 있는가 → 주인 프로세스가 없으면 치운다.
 */
import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const run = (cmd) => {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
};

const dev = run("pgrep -f 'next dev'");
if (dev) {
  console.error("\n✖ 개발서버(next dev)가 돌고 있어 배포를 시작하지 않았습니다.");
  console.error("  개발서버와 빌드는 같은 .next 폴더를 써서 겹치면 빌드가 멈춥니다.");
  console.error("  터미널에서 Ctrl+C 로 끄거나:  pkill -f 'next dev'");
  console.error(`  (실행 중인 PID: ${dev.split("\n").join(", ")})\n`);
  process.exit(1);
}

const building = run("pgrep -f 'next build'");
if (building) {
  console.error("\n✖ 이미 next build 가 실행 중입니다. 끝난 뒤에 다시 시도하세요.");
  console.error(`  (PID: ${building.split("\n").join(", ")})\n`);
  process.exit(1);
}

/* 주인 없는 잠금만 치운다 — 위에서 실행 중인 빌드가 없음을 확인한 뒤다 */
if (existsSync(".next/lock")) {
  rmSync(".next/lock", { force: true });
  console.log("· 이전 빌드가 남긴 .next/lock 을 치웠습니다.");
}

console.log("· 배포 전 점검 통과");
