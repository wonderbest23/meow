import { PlatformLegalPage } from "../../components/platform-legal-page";
import { pageMetadata } from "../site-metadata";

export const metadata = pageMetadata({ title: "인공지능·국외 처리 안내", description: "오늘창업이 쓰는 인공지능 서비스와 국외 처리, 생성 결과를 쓸 때 주의할 점을 안내해요.", path: "/ai-notice" });

export const dynamic = "force-dynamic";
export default function AiNoticePage() { return <PlatformLegalPage type="ai" />; }
