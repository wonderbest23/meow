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
  // 응답 헤더에 서버 종류(x-powered-by: Next.js)를 알리지 않는다.
  poweredByHeader: false,
  ...(lowMemory ? { experimental: { cpus: 1, workerThreads: false } } : {}),
  // 예전 문서 시작 화면 — 이제 새 사업은 대화(사업 기획)로 시작한다. 옛 링크·즐겨찾기는 그쪽으로 보낸다.
  async redirects() {
    return [
      { source: "/plan/start", destination: "/plan/chat?new=1", permanent: false },
      /* 사업 기획 목록은 내 사업 목록과 같은 목록이라 하나로 합쳤다 */
      { source: "/plan/planning", destination: "/plan", permanent: false },
    ];
  },
};

export default nextConfig;

initOpenNextCloudflareForDev();
