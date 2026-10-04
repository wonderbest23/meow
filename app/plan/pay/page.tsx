import { Suspense } from "react";
import PlanCheckout from "./PlanCheckout";
import AppFrame from "../AppFrame";
import { payBackHref } from "../../../lib/plan-builder/journey";

export const metadata = { title: "결제 · 오늘창업" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

// useSearchParams(어느 문서를 결제하는지)를 쓰므로 Suspense 경계가 필요하다
export default async function PlanPayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  /* 머리줄 ← 도 카드의 '나중에 하기'와 같은 곳 — 그 사업의 계획서(홈페이지 상품이면 홈페이지) */
  return (
    <AppFrame title="결제" backHref={payBackHref(one(query.product), one(query.planId))}>
      <Suspense fallback={null}>
        <PlanCheckout />
      </Suspense>
    </AppFrame>
  );
}
