import { Suspense } from "react";
import PlanPayResult from "./PlanPayResult";
import AppFrame from "../../AppFrame";

export const metadata = { title: "결제 결과 · 오늘창업" };

export default function PlanPayResultPage() {
  return (
    <AppFrame title="결제 결과">
      <Suspense fallback={null}>
        <PlanPayResult />
      </Suspense>
    </AppFrame>
  );
}
