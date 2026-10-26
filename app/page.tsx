import type { Metadata } from "next";
import HomePage from "./home-page";

/*
 * 첫 화면 — 서버 파일은 대표 주소(canonical)·구조화 데이터만 붙이고, 화면은 app/home-page.tsx(클라이언트)가 그린다.
 * 대표 주소는 루트 layout 에 두지 않는다(아래 모든 화면이 물려받아 홈을 가리키게 된다) — 첫 화면에만 둔다.
 * www.oneulstart.com·?… 주소로 열려도 검색에는 https://oneulstart.com/ 하나로 잡히게 한다(점검 r42-B 결정 4).
 * 제목·설명·공유 카드는 layout 의 기본값(홈 문구)을 그대로 쓴다.
 */
export const metadata: Metadata = {
  alternates: { canonical: "https://oneulstart.com/" },
};

/* 검색에 오늘창업이 어떤 곳인지 알리는 Organization — 사업자 정보처럼 바뀔 수 있는 값은 넣지 않는다 */
const ORGANIZATION_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "오늘창업",
  url: "https://oneulstart.com/",
  logo: "https://oneulstart.com/icon.png",
};

export default function Page() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }} />
      <HomePage />
    </>
  );
}
