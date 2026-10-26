import type { Metadata } from "next";
/* puck.css 는 바깥 글꼴 CSS 를 @import 해 모든 화면의 첫 표시를 막는다 — @import 없는 판 + 같은 글꼴 선언(puck-inter-font.css) */
import "@puckeditor/core/no-external.css";
import "./puck-inter-font.css";
import "./release-20260916.css";
import { LoginDialogHost } from "../components/login-dialog";
import { SupportChatWidget } from "../components/support-chat-widget";
import { sharedOpenGraph } from "./site-metadata";

const HOME_TITLE = "오늘창업 | 대화로 만드는 사업계획서와 홈페이지";
const HOME_SHARE_DESCRIPTION = "대화 → 사업계획서 → 홈페이지 → 유지보수까지 한 곳에서";

/*
 * 기본(홈) 제목·카드. 아이콘은 app/favicon.ico · icon.png · apple-icon.png 파일이 자동으로 붙는다.
 * 대표 주소(canonical)는 여기 두지 않는다 — 아래 모든 화면(손님 홈페이지 포함)이 물려받아 전부 홈을 가리키게 된다.
 * 트위터(X) 카드는 Next 가 openGraph 값으로 채운다 — 따로 두면 닫힌 손님 홈페이지(openGraph: null)까지 오늘창업 카드를 물려받는다.
 * 화면마다의 제목·대표 주소는 app/site-metadata.ts 의 pageMetadata 로 각 화면에서 정한다.
 */
export const metadata: Metadata = {
  metadataBase: new URL("https://oneulstart.com"),
  title: HOME_TITLE,
  description: "하려는 사업을 대화로 이야기하면 사업계획서를 만들고, 그 내용으로 홈페이지를 만들어 공개하고 관리까지 이어가는 오늘창업 서비스입니다.",
  openGraph: sharedOpenGraph(HOME_TITLE, HOME_SHARE_DESCRIPTION, "/"),
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}<SupportChatWidget /><LoginDialogHost /></body>
    </html>
  );
}
