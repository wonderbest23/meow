import type { Metadata } from "next";
import "@puckeditor/core/puck.css";
import "./release-20260916.css";
import { LoginDialogHost } from "../components/login-dialog";
import { SupportChatWidget } from "../components/support-chat-widget";

export const metadata: Metadata = {
  metadataBase: new URL("https://oneulstart.com"),
  title: "오늘창업 | 대화로 만드는 사업계획서와 홈페이지",
  description: "하려는 사업을 대화로 이야기하면 사업계획서를 만들고, 그 내용으로 홈페이지를 만들어 공개하고 관리까지 이어가는 오늘창업 서비스입니다.",
  openGraph: { siteName: "오늘창업", locale: "ko_KR", type: "website", title: "오늘창업 | 대화로 만드는 사업계획서와 홈페이지", description: "대화 → 사업계획서 → 홈페이지 → 유지보수까지 한 곳에서" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}<SupportChatWidget /><LoginDialogHost /></body>
    </html>
  );
}
