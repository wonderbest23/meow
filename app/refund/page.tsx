import { PlatformLegalPage } from "../../components/platform-legal-page";
import { pageMetadata } from "../site-metadata";

export const metadata = pageMetadata({ title: "취소·환불 기준", description: "오늘창업 결제 상품의 취소와 환불 기준, 신청 방법을 안내해요.", path: "/refund" });

export const dynamic = "force-dynamic";
export default function RefundPage() { return <PlatformLegalPage type="refund" />; }
