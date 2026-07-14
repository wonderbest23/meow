import type { Metadata } from "next";
import { SupportChatWidget } from "../components/support-chat-widget";
import "./globals.css";

export const metadata: Metadata = {
  title: "오늘창업 | 나만의 사업 가능성 탐색",
  description: "대화와 질문을 통해 나에게 맞는 사업 가능성을 찾고 실행 자료까지 만드는 오늘창업 서비스입니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}<SupportChatWidget /></body>
    </html>
  );
}
