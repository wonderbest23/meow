import { PlatformLegalPage } from "../../components/platform-legal-page";
import { pageMetadata } from "../site-metadata";

export const metadata = pageMetadata({ title: "사업자·통신판매 정보", description: "오늘창업 운영 사업자와 통신판매업 신고 정보, 고객 문의처를 안내해요.", path: "/business-info" });

export const dynamic = "force-dynamic";
export default function BusinessInfoPage() { return <PlatformLegalPage type="business" />; }
