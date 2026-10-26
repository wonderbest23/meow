"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BRAINWAVE_CREDIT } from "../lib/landing/brainwave/catalog";
import { HOME_LOGO } from "../lib/landing/home-logo";
import type { RankedOpportunity } from "../lib/opportunity-engine";
import type { ProjectRecord } from "../lib/service-domain";
import { SiteHeader, SiteLogo, useSignedIn } from "../components/site-header";
import { HomePromptHero } from "../components/home-prompt-hero";
import { HomePromptSections } from "../components/home-prompt-sections";
import { HomeCopyChrome } from "../components/home-copy-chrome";
import homeLanding from "../components/home-landing.module.css";
import { LEGAL_PENDING_TEXT, mailOrderStatusLabels, type MailOrderStatus } from "../lib/platform-legal/domain";
import { SITE_COPY_FIELDS } from "../lib/site-copy/domain";
import { fetchWithTransientRetry } from "../lib/client/fetch-with-retry";
import dynamic from "next/dynamic";

/*
 * 첫 화면(클라이언트 부분) — 메타·구조화 데이터는 서버 파일 app/page.tsx 가 붙인다.
 * 예전 결과물 화면(?view=project)은 문서·PPT 편집기·재무표 코드가 커서 그 주소일 때만 받는다(점검 r42-B 결정 2).
 * 받는 동안은 예전과 같은 '예전 결과물을 불러오고 있어요'를 보인다.
 */
const ProjectWorkspace = dynamic(() => import("./legacy-project-workspace"), {
  ssr: false,
  loading: () => <div role="status">예전 결과물을 불러오고 있어요.</div>,
});

type Screen = "home" | "start" | "project";

/*
 * 예전 흐름(진단·탐색·미리보기·계좌이체 결제·샘플)은 더 이상 열지 않는다.
 * 지금 서비스는 새 대화(/plan/chat)로 시작하고 카드로만 결제한다(약관 2026-10-05).
 * 그 화면 코드는 지웠고, 주소로 열 수 있는 것은 예전에 결제한 결과물(project)과 새 대화로 넘기는 start 뿐.
 */
const legacyStorageKeys = [
  "venture-current-screen",
  "venture-dna",
  "venture-selected-opportunity",
  "venture-sample-return",
  "venture-sample-view",
  "venture-conversation-draft",
  "venture-direct-plan-job",
];
const Header = SiteHeader;
const Logo = SiteLogo;

function Home({
  onStart,
}: {
  onStart: () => void;
}) {
  /*
   * 바닥글 사업자 정보 — 불러오지 못한 것(failed)과 아직 비어 있는 값을 나눈다. 빈 값은 /business-info 와 같은 말(LEGAL_PENDING_TEXT)로
   * 적는다 — 예전엔 값이 비어 있어도 '불러오지 못했어요'로 보였다(점검 2026-10-23).
   */
  const [businessInfo, setBusinessInfo] = useState<{
    operatorName: string; representativeName: string; businessRegistrationNumber: string; mailOrderSalesNumber: string;
    mailOrderStatus: MailOrderStatus; internetDomainName: string;
    businessAddress: string; supportEmail: string; supportPhone: string; hostingProvider: string;
  } | "loading" | "failed">("loading");
  useEffect(() => {
    void fetch("/api/platform/readiness", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setBusinessInfo(data?.business && typeof data.business === "object" ? data.business : "failed");
      })
      .catch(() => setBusinessInfo("failed"));
  }, []);
  const business = typeof businessInfo === "object" ? businessInfo : null;
  /** 빈 값은 사업자 정보 화면과 같은 말로 */
  const legalValue = (value: string | null | undefined) => value?.trim() || LEGAL_PENDING_TEXT;
  /* 로그인했으면 첫 화면의 '로그인해도 이어져요'·'로그인·계정 복구'를 빼고, 머리말은 '내 사업'을 보인다 */
  const signedIn = useSignedIn();
  /*
   * 어드민이 고친 홈 문구(/admin/homepage). 코드의 기본 문구로 먼저 그려지고,
   * 오버라이드가 오면 바꿔 끼운다 — 실패하면 그냥 기본 문구다.
   */
  const [siteCopy, setSiteCopy] = useState<{ texts: Record<string, string>; hidden: string[] }>({ texts: {}, hidden: [] });
  useEffect(() => {
    fetch("/api/site-copy", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { texts?: Record<string, string>; hidden?: string[] }) => { if (j && typeof j === "object") setSiteCopy({ texts: j.texts ?? {}, hidden: j.hidden ?? [] }); })
      .catch(() => {});
  }, []);
  /*
   * 어드민 편집 미리보기(/admin/homepage 의 iframe, ?copyEdit=1) — 저장 전 초안을 받아 바로 그리고,
   * 섹션 테두리(HomeCopyChrome)를 얹어 누르면 어드민 쪽 입력칸으로 간다.
   * 예전엔 이 연결이 빠져 있어 미리보기가 저장 전에는 바뀌지 않고 눌러도 아무 일이 없었다.
   */
  const [copyEdit, setCopyEdit] = useState(false);
  const [copySelected, setCopySelected] = useState<string | null>(null);
  useEffect(() => {
    if (window.parent === window || new URL(window.location.href).searchParams.get("copyEdit") !== "1") return;
    setCopyEdit(true);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const data = event.data as { type?: string; id?: string; texts?: Record<string, string>; hidden?: string[] } | null;
      if (data?.type === "sc-draft") setSiteCopy({ texts: data.texts ?? {}, hidden: data.hidden ?? [] });
      if (data?.type === "sc-selected" && data.id) {
        setCopySelected(data.id);
        document.querySelector(`[data-sc-section="${data.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "sc-ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  /*
   * 상단 서리(점진 블러): 맨 위에서는 헤더가 투명하고, 내려가면 헤더 뒤가 밝게 흐려진다.
   * 세기는 스크롤 0~120px 구간에서 0→1로 오르는 --frost 하나로 정한다(home-landing.module.css).
   */
  const headerShell = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const shell = headerShell.current;
    if (!shell) return;
    let frame = 0;
    const apply = () => { frame = 0; shell.style.setProperty("--frost", Math.min(1, Math.max(0, window.scrollY / 120)).toFixed(3)); };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(apply); };
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (frame) window.cancelAnimationFrame(frame); };
  }, []);
  /* 기본 문구는 lib/site-copy/domain.ts 의 def 와 같다 — 어드민이 고친 값이 있으면 그것으로 */
  const copyDefault = (id: string) => SITE_COPY_FIELDS.find((field) => field.id === id)?.def ?? "";
  const sc = (id: string) => siteCopy.texts[id] ?? copyDefault(id);
  /** \n 을 <br/> 로 */
  const scBr = (id: string) => sc(id).split("\n").map((line, i, all) => <Fragment key={i}>{line}{i < all.length - 1 ? <br /> : null}</Fragment>);

  /*
   * 2026-10-23 새 첫 화면 — 밝은 점 무늬 바탕 위에 '내 말로 적는 입력 카드'와 결과물 진열 띠, 그 아래 안내 구간.
   * 예전 검정 첫 화면(HomeOpening·HomeServiceOverview)은 여기서 그리지 않는다(다른 시험 화면이 아직 쓴다).
   */
  return (
    <main className={homeLanding.page}>
      <div className={homeLanding.headerShell} ref={headerShell}>
        <Header homeNav logo={HOME_LOGO} onStart={onStart} onHome={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
      </div>
      <div className={homeLanding.content}>
        <HomePromptHero title={sc("promptHome.title")} subtitle={scBr("promptHome.subtitle")} hidden={siteCopy.hidden} signedIn={signedIn} />
        <HomePromptSections signedIn={signedIn} />
      </div>
      {copyEdit ? <HomeCopyChrome hidden={siteCopy.hidden} selected={copySelected} /> : null}

      {/*
        푸터 — 가는 선으로 나눈 세 구획.
        ① 로고와 안내 링크 ② 접이식 상세(사업자 정보 항목표 · 이용 안내 · 디자인 출처) ③ 저작권 줄.
        상세는 기본으로 접어 두어 화면 아래를 길게 차지하지 않는다. 사업자 법정 표기와
        AI 고지는 한 번 눌러 펼치는 자리에 두되, 디자인이 어떻게 바뀌어도 지우지 않는다.
      */}
      <footer className="home-footer">
        <div className="home-footer-head">
          <Logo logo={HOME_LOGO} onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} />
          <nav aria-label="하단 안내">
            <a href="/business-info">사업자·통신판매 정보</a>
            <a href="/privacy">개인정보처리방침</a>
            <a href="/ai-notice">인공지능·국외 처리</a>
            <a href="/terms">이용약관</a>
            <a href="/refund">취소·환불 기준</a>
            {signedIn === true ? null : <a href="/account">로그인·계정 복구</a>}
          </nav>
        </div>
        <details className="home-footer-details">
          <summary>
            <span>사업자 정보 · 이용 안내</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </summary>
          <div className="home-footer-body">
            <div aria-labelledby="footer-business-heading">
              <strong className="home-footer-title" id="footer-business-heading">사업자 정보</strong>
              {business ? (
                <dl className="home-footer-info">
                  <dt>상호</dt><dd>{legalValue(business.operatorName)}</dd>
                  <dt>대표</dt><dd>{legalValue(business.representativeName)}</dd>
                  <dt>사업자등록번호</dt><dd>{legalValue(business.businessRegistrationNumber)}</dd>
                  {/* 상태 문구가 '통신판매업 신고 완료'처럼 항목명을 되풀이하므로 값에서는 뗀다 */}
                  <dt>통신판매업</dt><dd>{(mailOrderStatusLabels[business.mailOrderStatus] ?? mailOrderStatusLabels.preparing).replace(/^통신판매업\s*/, "")}{business.mailOrderSalesNumber ? ` · ${business.mailOrderSalesNumber}` : ""}</dd>
                  <dt>주소</dt><dd>{legalValue(business.businessAddress)}</dd>
                  {business.supportPhone && <><dt>전화</dt><dd><a href={`tel:${business.supportPhone.replace(/[^\d+]/g, "")}`}>{business.supportPhone}</a></dd></>}
                  {business.supportEmail && <><dt>이메일</dt><dd><a href={`mailto:${business.supportEmail}`}>{business.supportEmail}</a></dd></>}
                  <dt>사이트</dt><dd>{legalValue(business.internetDomainName)}</dd>
                  <dt>호스팅</dt><dd>{legalValue(business.hostingProvider)}</dd>
                </dl>
              ) : businessInfo === "failed" ? (
                <p className="home-footer-empty">사업자 정보를 불러오지 못했어요. <a href="/business-info">사업자 정보 보기</a></p>
              ) : (
                <p className="home-footer-empty">사업자 정보를 불러오고 있어요.</p>
              )}
            </div>
            <div aria-labelledby="footer-notes-heading">
              <strong className="home-footer-title" id="footer-notes-heading">이용 안내</strong>
              <ul className="home-footer-notes">
                <li>인공지능 생성 내용은 반드시 원문과 현장 자료로 확인해 주세요.</li>
                <li>사진과 화면 예시는 AI로 만든 브랜드 이미지와 가상 사업 예시이며 실제 고객이나 실적이 아니에요.</li>
                <li>전체 문서 생성과 파일 내려받기는 결제 후 이용할 수 있어요.</li>
              </ul>
            </div>
            <p className="home-footer-credits">
              {/* 화면 골격 값(Neuros Lite, CC BY 4.0)과 홈페이지 틀(Brainwave)은 지금도 쓰고 있어 출처 표기는 남긴다 */}
              디자인 출처 · BRIX Templates의 ‘Website Wireframes UI Kit’ · Khoa(JAK)의 ‘Neuros Lite’ · <a href={BRAINWAVE_CREDIT.url} target="_blank" rel="noopener noreferrer">{BRAINWAVE_CREDIT.text}</a> · <a href="https://creativecommons.org/licenses/by/4.0/deed.ko" target="_blank" rel="noopener noreferrer">저작자표시 4.0 국제 라이선스(CC BY 4.0)</a>
            </p>
          </div>
        </details>
        <div className="home-footer-legal">
          <small>© 2026 오늘창업</small>
        </div>
      </footer>
    </main>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedProject, setSelectedProject] = useState<RankedOpportunity | null>(null);
  const [serverProject, setServerProject] = useState<ProjectRecord | null>(null);

  const navigate = useCallback((next: Screen, options?: { replace?: boolean; projectId?: string }) => {
    const url = new URL(window.location.href);
    if (next === "home") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    if (next === "project" && options?.projectId) url.searchParams.set("project", options.projectId);
    else url.searchParams.delete("project");
    const method = options?.replace ? "replaceState" : "pushState";
    window.history[method]({ screen: next }, "", `${url.pathname}${url.search}${url.hash}`);
    setScreen(next);
  }, []);

  useEffect(() => {
    // 예전 흐름이 남긴 기기 저장값 — 더 읽지 않으니 지운다
    for (const key of legacyStorageKeys) window.localStorage.removeItem(key);
    const screenFromLocation = (): Screen => {
      const requested = new URL(window.location.href).searchParams.get("view");
      return requested === "start" || requested === "project" ? requested : "home";
    };
    const initial = screenFromLocation();
    const url = new URL(window.location.href);
    // 지워진 예전 화면 주소(?view=explore 등)로 들어오면 주소도 첫 화면으로 정리한다
    if (initial === "home") url.searchParams.delete("view");
    window.history.replaceState({ screen: initial }, "", `${url.pathname}${url.search}${url.hash}`);
    setScreen(initial);
    const handlePopState = () => setScreen(screenFromLocation());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get("view") !== "project") return;
    const linkedProjectId = currentUrl.searchParams.get("project");
    const projectId = linkedProjectId ?? window.localStorage.getItem("venture-project-id");
    if (!projectId) {
      navigate("start", { replace: true });
      return;
    }
    void fetchWithTransientRetry(`/api/projects/${projectId}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("저장된 프로젝트를 불러오지 못했습니다.");
        return response.json();
      })
      .then((payload: { project: ProjectRecord }) => {
        setServerProject(payload.project);
        setSelectedProject(payload.project.opportunity as unknown as RankedOpportunity);
        window.localStorage.setItem("venture-project-id", payload.project.id);
        navigate("project", { replace: true, projectId: payload.project.id });
      })
      .catch(() => {
        if (!linkedProjectId) window.localStorage.removeItem("venture-project-id");
        navigate("start", { replace: true });
      });
  }, [navigate]);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (screen === "start") router.replace("/plan/chat?new=1");
  }, [screen, router]);

  if (screen === "start") return <div role="status">사업 기획 대화를 열고 있어요.</div>;
  if (screen === "project") {
    if (selectedProject) return <ProjectWorkspace opportunity={selectedProject} serverProject={serverProject} setServerProject={setServerProject} onHome={() => navigate("home")} />;
    return <div role="status">예전 결과물을 불러오고 있어요.</div>;
  }
  // 새 기획은 대화로 시작하고, 이미 작성한 예전 결과물 경로(?view=project)는 유지한다.
  return <Home onStart={() => router.push("/plan/chat?new=1")} />;
}
