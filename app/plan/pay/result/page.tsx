import { Suspense } from "react";
import PlanPayResult from "./PlanPayResult";
import AppFrame from "../../AppFrame";
import { payResultBackHref } from "../../../../lib/plan-builder/journey";

export const metadata = { title: "결제 결과 · 오늘창업" };

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? null;

export default async function PlanPayResultPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  /* 머리줄 ← 는 결과 카드의 단추와 같은 사업 화면으로 — 내 사업 목록으로 튀지 않게 */
  return (
    <AppFrame title="결제 결과" backHref={payResultBackHref(one(query.product), one(query.planId))}>
      <Suspense fallback={null}>
        <PlanPayResult />
      </Suspense>
    </AppFrame>
  );
}
