import type { ReactNode } from "react";
import AppFrame from "../AppFrame";

/* 설정 틀(lovable 구조 3단계) — PC 는 설정 메뉴(이용 안내 · 약관·정책) + 판 안쪽 48, 휴대폰은 ‹ · 제목 */
export default function Layout({ children }: { children: ReactNode }) {
  return <AppFrame title="약관·정책" settings="back">{children}</AppFrame>;
}
