import { Suspense } from "react";
import PlanPayResult from "./PlanPayResult";

export const metadata = { title: "결제 결과 · 오늘창업" };

export default function PlanPayResultPage() {
  return (
    <Suspense fallback={null}>
      <PlanPayResult />
    </Suspense>
  );
}
