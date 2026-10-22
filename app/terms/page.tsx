import { PlatformLegalPage } from "../../components/platform-legal-page";
import { pageMetadata } from "../site-metadata";

export const metadata = pageMetadata({ title: "이용약관", description: "오늘창업 이용약관이에요. 상품과 가격, 결제와 이용자·회사의 권리와 의무를 안내해요.", path: "/terms" });

export const dynamic = "force-dynamic";
export default function TermsPage() { return <PlatformLegalPage type="terms" />; }
