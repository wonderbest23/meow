import { PlatformLegalPage } from "../../components/platform-legal-page";
import { pageMetadata } from "../site-metadata";

export const metadata = pageMetadata({ title: "개인정보처리방침", description: "오늘창업이 처리하는 개인정보와 이용 목적, 보유 기간, 이용자의 권리를 안내해요.", path: "/privacy" });

export const dynamic = "force-dynamic";
export default function PrivacyPage() { return <PlatformLegalPage type="privacy" />; }
