"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { STUDIO_REDIRECT, studioRedirectHref } from "../../../lib/plan-builder/studio";

/*
 * 예전 화면(대화 · 계획서 · 홈페이지 · 사업 관리의 시작하기/유지보수)을 같은 사업의 작업실로 보낸다 — 플래그(STUDIO_REDIRECT)를 켰을 때만.
 * ?classic=1 이면 예전 화면 그대로. 보낼 주소가 있으면 본문을 아예 그리지 않는다(홈페이지 화면은 열리는 순간
 * 홈페이지를 만들고 AI 자동 채우기를 시작한다 — 보낼 화면에서 그런 일이 생기면 안 된다).
 * 주소 판단은 lib/plan-builder/studio.ts 의 studioRedirectHref 하나로 한다(테스트: scripts/studio-navigation.test.ts).
 * useSearchParams 를 쓰므로 Suspense 안(BusinessKeyed · 대화 화면의 Suspense)에 둔다.
 */
export default function StudioRedirect({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const query = useSearchParams().toString();
  const target = STUDIO_REDIRECT ? studioRedirectHref(`${pathname}${query ? `?${query}` : ""}`) : null;
  useEffect(() => {
    if (!target) return;
    /* #sec- 같은 해시는 서버가 모르는 값이라 여기서 붙인다 */
    const hash = target.includes("#") ? "" : window.location.hash;
    router.replace(`${target}${hash}`);
  }, [target, router]);
  return <>{target ? fallback : children}</>;
}
