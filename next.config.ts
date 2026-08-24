import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

/*
 * BUILD_LOW_MEMORY=1 로 빌드하면 워커를 하나만 쓴다.
 *
 * next build 는 기본적으로 CPU 코어 수만큼 워커를 띄운다(이 맥은 10개). 각 워커가
 * 수백 MB 를 쓰므로 여유 메모리가 적은 상태에서는 서로 메모리를 못 받아 CPU 0% 로
 * 굳어버린다 — 오류도 없이 멈추기만 해서 원인을 찾기 어렵다. 실제로 그 상태로
 * 세 시간 넘게 매달려 있던 빌드가 있었다.
 *
 * 느리지만(직렬 컴파일) 적은 메모리로 끝까지 간다. 평소에는 이 변수를 켜지 않는다.
 */
const lowMemory = process.env.BUILD_LOW_MEMORY === "1";

const nextConfig: NextConfig = {
  ...(lowMemory ? { experimental: { cpus: 1, workerThreads: false } } : {}),
};

export default nextConfig;

initOpenNextCloudflareForDev();
