import { Noto_Serif_KR } from "next/font/google";
import PlanShell from "./PlanShell";

// 표지 제목용 명조 — 책 표지 조판의 핵심. CSS 변수로만 노출한다.
const serifKR = Noto_Serif_KR({ weight: ["600", "900"], subsets: ["latin"], variable: "--font-serif-kr" });

/**
 * /plan 이하 모든 화면이 고정 레일 셸을 공유한다.
 *
 * plan-ui 클래스는 globals.css의 사이트 전역 버튼 정규화
 * (모든 button에 14px 라운드·굵기 800 강제, svg 숨김)에서
 * 이 영역을 빼내는 표식이다. 덕분에 여기서는 모듈 CSS가 그대로 먹는다.
 */
export default function PlanLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`plan-ui ${serifKR.variable}`}>
      <PlanShell>{children}</PlanShell>
    </div>
  );
}
