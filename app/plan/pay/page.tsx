import { Suspense } from "react";
import PlanCheckout from "./PlanCheckout";

export const metadata = { title: "결제 · 오늘창업" };

// useSearchParams(어느 문서를 결제하는지)를 쓰므로 Suspense 경계가 필요하다
export default function PlanPayPage() {
  return (
    <Suspense fallback={null}>
      <PlanCheckout />
    </Suspense>
  );
}
