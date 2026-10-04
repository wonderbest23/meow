import type { ReactNode } from "react";
import AppFrame from "../AppFrame";

/* 다른 화면과 같은 틀(← 제목 ☰ · 왼쪽 메뉴) */
export default function Layout({ children }: { children: ReactNode }) {
  return <AppFrame title="이용 안내">{children}</AppFrame>;
}
