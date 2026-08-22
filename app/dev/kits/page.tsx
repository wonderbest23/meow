import { notFound } from "next/navigation";
import { LandingBlocksRenderer } from "../../../components/landing-blocks";
import { createLandingPageData } from "../../../lib/landing/page-data";
import { isLandingKit, landingKitOptions } from "../../../lib/landing/kits";

/*
 * 킷 9개를 한 번에 눈으로 확인하는 개발용 화면 — 운영에서는 404.
 * /dev/kits?kit=consult
 */
const SAMPLE = {
  businessName: "한빛싱크",
  heroLabel: "성수동 · 주방 싱크 전문",
  headline: "막힌 싱크, 오늘 안에 뚫어 드립니다",
  subheadline: "성수동·서울숲 일대 30분 내 방문. 출장비 없이 견적부터 확인하세요.",
  ctaLabel: "견적 문의",
  heroImageUrl: "https://images.unsplash.com/photo-1556911220-bff31c812dba?auto=format&fit=crop&w=1600&q=80",
  offerTitle: "싱크 배관 긴급 출장",
  offerDescription: "막힘·누수·악취, 현장에서 원인 확인 후 바로 처리합니다.",
  priceLabel: "기본 출장 49,000원",
  benefits: [
    { title: "30분 내 방문", description: "성수동 근처라 부르면 바로 갑니다." },
    { title: "견적 먼저", description: "작업 전 금액을 말씀드리고 시작합니다." },
    { title: "재발 보증", description: "같은 자리 재발 시 2주 안 무상 처리." },
  ],
  proofItems: [],
  businessAddress: "서울 성동구 성수동",
  openHours: "매일 08:00–22:00",
};

export default async function DevKitsPage({ searchParams }: { searchParams: Promise<{ kit?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { kit } = await searchParams;
  const id = isLandingKit(kit) ? kit : "consult";
  const data = createLandingPageData(SAMPLE, "service", id);
  /* 후기·영상은 값이 있어야 나온다 — 미리보기라 채워 넣는다 */
  data.content = data.content.map((c) => {
    if (c.type === "ReviewSection") return { ...c, props: { ...c.props, quote1: "밤 11시에 불렀는데 바로 와주셨어요. 견적도 말한 그대로.", name1: "김민서", role1: "성수동 · 2회 이용", quote2: "다른 데서 못 찾은 누수 원인을 10분 만에 찾았습니다.", name2: "박준호", role2: "서울숲 · 카페 운영", quote3: "출장비 없다는 말이 진짜였어요.", name3: "이수연", role3: "뚝섬 · 첫 이용" } };
    if (c.type === "VideoSection") return { ...c, props: { ...c.props, videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", description: "현장에서 어떻게 처리하는지 1분으로 보여드립니다." } };
    return c;
  });
  return (
    <main style={{ background: "#fff" }}>
      <nav style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", gap: 6, padding: 8, background: "#161c2d", flexWrap: "wrap" }}>
        {landingKitOptions.map((o) => (
          <a key={o.id} href={`?kit=${o.id}`} style={{ padding: "6px 10px", borderRadius: 6, fontSize: 13, color: o.id === id ? "#161c2d" : "#fff", background: o.id === id ? "#fff" : "#ffffff22" }}>{o.sample} · {o.name}</a>
        ))}
      </nav>
      <LandingBlocksRenderer data={data} />
    </main>
  );
}
