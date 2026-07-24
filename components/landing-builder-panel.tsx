"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  BarChart3,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  Globe2,
  LoaderCircle,
  MonitorSmartphone,
  PanelsTopLeft,
  RefreshCcw,
  Rocket,
  Save,
  ShieldCheck,
} from "lucide-react";
import {
  applyLandingTemplate,
  landingTemplateOptions,
  type LandingDraft,
  type LandingLeadRecord,
  type LandingSiteRecord,
} from "../lib/landing/domain";
import type { ProjectRecord } from "../lib/service-domain";
import { createLandingPageData, syncLandingPageData } from "../lib/landing/page-data";
import { LandingBlocksRenderer } from "./landing-blocks";
import { LandingMediaField } from "./landing-media-field";

const LandingVisualBuilder = dynamic(
  () => import("./landing-visual-builder").then((module) => module.LandingVisualBuilder),
  { ssr: false },
);

type Action = "idle" | "loading" | "saving" | "publishing" | "rolling-back";

export function LandingBuilderPanel({ project }: { project: ProjectRecord }) {
  const [draft, setDraft] = useState<LandingDraft | null>(null);
  const [site, setSite] = useState<LandingSiteRecord | null>(null);
  const [leads, setLeads] = useState<LandingLeadRecord[]>([]);
  const [action, setAction] = useState<Action>("loading");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"edit" | "preview" | "leads" | "versions">("edit");
  const [builderOpen, setBuilderOpen] = useState(false);

  const publicPath = site?.status === "published" ? `/launch/${site.slug}` : null;
  const publicUrl = useMemo(() => {
    if (!publicPath || typeof window === "undefined") return publicPath;
    return `${window.location.origin}${publicPath}`;
  }, [publicPath]);

  const updateDraft = (patch: Partial<LandingDraft>) => {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft({
      ...next,
      pageData: patch.pageData ?? syncLandingPageData(
        draft.pageData ?? createLandingPageData(draft, draft.templateId),
        next,
        Object.keys(patch),
      ),
    });
  };

  const load = async () => {
    setAction("loading");
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${project.id}/landing`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "판매 페이지 설정을 불러오지 못했습니다.");
      setSite(payload.site);
      setLeads(payload.leads ?? []);
      setDraft(payload.site?.draft ?? payload.suggestedDraft);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "판매 페이지 설정을 불러오지 못했습니다.");
    } finally {
      setAction("idle");
    }
  };

  useEffect(() => {
    void load();
  }, [project.id]);

  const save = async (): Promise<LandingSiteRecord> => {
    if (!draft) throw new Error("저장할 설정이 없습니다.");
    setAction("saving");
    setMessage("");
    const response = await fetch(`/api/projects/${project.id}/landing`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? "판매 페이지를 저장하지 못했습니다.");
    setSite(payload.site);
    return payload.site;
  };

  const saveOnly = async () => {
    try {
      await save();
      setMessage("초안을 저장했습니다. 공개 중인 페이지는 다시 발행하기 전까지 바뀌지 않습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setAction("idle");
    }
  };

  const publish = async () => {
    try {
      await save();
      setAction("publishing");
      const response = await fetch(`/api/projects/${project.id}/landing/publish`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "판매 페이지를 공개하지 못했습니다.");
      setSite(payload.site);
      setMessage(`버전 ${payload.site.publishedVersion}을 공개했습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "공개 중 오류가 발생했습니다.");
    } finally {
      setAction("idle");
    }
  };

  const rollback = async (version: number) => {
    setAction("rolling-back");
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${project.id}/landing/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "버전을 되돌리지 못했습니다.");
      setSite(payload.site);
      setDraft(payload.site.draft);
      setMessage(`공개 페이지를 버전 ${version}으로 되돌렸습니다.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "롤백 중 오류가 발생했습니다.");
    } finally {
      setAction("idle");
    }
  };

  if (!draft) {
    return <section className="landing-builder-panel loading"><LoaderCircle className="spin" /><p>{message || "판매 페이지 설정을 준비하고 있습니다."}</p></section>;
  }

  return (
    <section className="landing-builder-panel">
      <header>
        <div><span><Globe2 /></span><div><small>홈페이지 제작비 포함</small><h3>실제 고객이 보는 홈페이지</h3><p>업종별 디자인을 고르고 사진·로고·사업자 정보만 확인하면 바로 공개됩니다.</p></div></div>
        <em className={site?.status === "published" ? "published" : ""}>{site?.status === "published" ? <><Check /> 공개 중 · {site.publishedVersion}판</> : "아직 비공개"}</em>
      </header>

      {site && (
        <div className="landing-metrics">
          <article><span><BarChart3 /></span><div><small>방문</small><strong>{site.metrics.pageViews.toLocaleString("ko-KR")}</strong></div></article>
          <article><span><ChevronRight /></span><div><small>버튼 클릭</small><strong>{site.metrics.ctaClicks.toLocaleString("ko-KR")}</strong></div></article>
          <article><span><Check /></span><div><small>신청</small><strong>{site.metrics.leads.toLocaleString("ko-KR")}</strong></div></article>
          <article><span><Rocket /></span><div><small>전환율</small><strong>{site.metrics.conversionRate}%</strong></div></article>
        </div>
      )}

      <nav className="landing-builder-tabs">
        <button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}><MonitorSmartphone /> 내용 편집</button>
        <button className={mode === "leads" ? "active" : ""} onClick={() => { setMode("leads"); void load(); }}><Check /> 신청 목록</button>
        <button className={mode === "versions" ? "active" : ""} onClick={() => setMode("versions")}><Clock3 /> 발행 기록</button>
      </nav>

      {message && <div className="landing-builder-message" role="status">{message}</div>}

      {mode === "edit" && (
        <div className="landing-builder-body">
          <section className="landing-edit-section landing-template-section">
            <div className="landing-section-title"><span>01</span><div><strong>업종별 디자인과 이미지</strong><p>마음에 드는 틀 하나를 고른 뒤 내 사진과 로고로 바꾸세요.</p></div></div>
            <div className="landing-template-grid">{landingTemplateOptions.map((template) => <button key={template.id} className={draft.templateId === template.id ? "active" : ""} onClick={() => setDraft(applyLandingTemplate(draft, template.id))}><span style={{ backgroundImage: `url(${template.heroImageUrl})` }}><i style={{ background: template.accentColor }} /></span><b>{template.name}</b><small>{template.description}</small>{draft.templateId === template.id && <em><Check /> 선택됨</em>}</button>)}</div>
            <section className="landing-advanced-edit-callout">
              <span><PanelsTopLeft /></span>
              <div><small>자유 편집</small><strong>필요한 섹션만 골라 직접 구성하세요</strong><p>첫 화면, 장점, 사진, 이용 과정과 상품 섹션을 추가하고 끌어서 순서를 바꿀 수 있습니다.</p></div>
              <button type="button" onClick={() => setBuilderOpen(true)}>자유 편집 열기 <PanelsTopLeft /></button>
            </section>
            <div className="landing-media-grid"><LandingMediaField label="대표 이미지" description="첫 화면에 크게 표시됩니다." value={draft.heroImageUrl} kind="hero" onChange={(heroImageUrl) => updateDraft({ heroImageUrl, heroImageAlt: `${draft.businessName} 대표 이미지` })} /><LandingMediaField label="로고" description="없으면 사업 이름으로 표시합니다." value={draft.logoImageUrl} kind="logo" onChange={(logoImageUrl) => updateDraft({ logoImageUrl })} /></div>
          </section>

          <section className="landing-edit-section">
            <div className="landing-section-title"><span>02</span><div><strong>공개 주소와 첫 화면</strong><p>방문자가 5초 안에 누구를 위한 무엇인지 이해해야 합니다.</p></div></div>
            <div className="landing-form-grid">
              <label><span>페이지 목적</span><select value={draft.pageMode} onChange={(event) => setDraft({ ...draft, pageMode: event.target.value as LandingDraft["pageMode"] })}><option value="lead_validation">상담·수요 검증</option><option value="transaction">결제·청약 판매</option></select></label>
              <label><span>고객에게 보여줄 이름</span><input value={draft.businessName} onChange={(event) => updateDraft({ businessName: event.target.value })} placeholder="예: 이어봄" /></label>
              <label><span>공개 주소 끝부분</span><div className="slug-input"><em>/launch/</em><input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} placeholder="영문 소문자 예: ieobom" /></div><small>인터넷 주소에 들어가므로 영문 소문자와 숫자만 사용할 수 있습니다.</small></label>
              <label className="wide"><span>첫 화면 핵심 문구</span><textarea value={draft.headline} onChange={(event) => updateDraft({ headline: event.target.value })} placeholder="누구의 어떤 문제를 어떻게 해결하는지 한 문장으로 적으세요." /></label>
              <label className="wide"><span>핵심 문구 아래 설명</span><textarea value={draft.subheadline} onChange={(event) => updateDraft({ subheadline: event.target.value })} placeholder="제공 범위, 진행 기간, 고객이 받는 결과를 구체적으로 적으세요." /></label>
              <label><span>신청 버튼</span><input value={draft.ctaLabel} onChange={(event) => updateDraft({ ctaLabel: event.target.value })} /></label>
              <label><span>대표 색상</span><div className="color-input"><input type="color" value={draft.accentColor} onChange={(event) => setDraft({ ...draft, accentColor: event.target.value })} /><input value={draft.accentColor} onChange={(event) => setDraft({ ...draft, accentColor: event.target.value })} /></div></label>
              <label><span>배경 스타일</span><select value={draft.backgroundTone} onChange={(event) => setDraft({ ...draft, backgroundTone: event.target.value as LandingDraft["backgroundTone"] })}><option value="cream">따뜻한 크림</option><option value="white">선명한 화이트</option><option value="dark">집중형 다크</option></select></label>
              <label><span>가격 표시</span><input value={draft.priceLabel} onChange={(event) => updateDraft({ priceLabel: event.target.value })} /></label>
            </div>
          </section>

          <section className="landing-edit-section">
            <div className="landing-section-title"><span>03</span><div><strong>고객이 받는 가치</strong><p>확인되지 않은 성과를 약속하지 말고 실제 제공 내용을 적습니다.</p></div></div>
            <div className="landing-benefit-editor">{draft.benefits.map((benefit, index) => <article key={index}><span>{index + 1}</span><input value={benefit.title} onChange={(event) => updateDraft({ benefits: draft.benefits.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) })} /><textarea value={benefit.description} onChange={(event) => updateDraft({ benefits: draft.benefits.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) })} /></article>)}</div>
            <div className="landing-form-grid">
              <label><span>제안 제목</span><input value={draft.offerTitle} onChange={(event) => updateDraft({ offerTitle: event.target.value })} /></label>
              <label className="wide"><span>제안 설명</span><textarea value={draft.offerDescription} onChange={(event) => updateDraft({ offerDescription: event.target.value })} /></label>
            </div>
          </section>

          <section className="landing-edit-section">
            <div className="landing-section-title"><span>04</span><div><strong>사업자 하단 정보와 신청폼</strong><p>사업자 정보, 개인정보 동의와 환불 조건을 실제 운영 내용으로 확인합니다.</p></div></div>
            <div className="landing-toggle-grid">
              <Toggle label="이메일 수집" checked={draft.collectEmail} onChange={(checked) => setDraft({ ...draft, collectEmail: checked })} />
              <Toggle label="전화번호 수집" checked={draft.collectPhone} onChange={(checked) => setDraft({ ...draft, collectPhone: checked })} />
              <Toggle label="문의 내용 수집" checked={draft.collectMessage} onChange={(checked) => setDraft({ ...draft, collectMessage: checked })} />
              <Toggle label="방문·전환 측정" checked={draft.analyticsEnabled} onChange={(checked) => setDraft({ ...draft, analyticsEnabled: checked })} />
              <Toggle label="홍보 정보 수신 선택 동의" checked={draft.marketingOptInEnabled} onChange={(checked) => setDraft({ ...draft, marketingOptInEnabled: checked })} />
              <Toggle label="고객 신청폼 사용" checked={draft.leadCaptureEnabled} onChange={(checked) => setDraft({ ...draft, leadCaptureEnabled: checked })} />
            </div>
            <div className="landing-form-grid">
              <label><span>개인정보 처리 주체</span><input value={draft.privacyController} onChange={(event) => setDraft({ ...draft, privacyController: event.target.value })} /></label>
              <label><span>개인정보 문의 연락처</span><input value={draft.privacyContact} onChange={(event) => setDraft({ ...draft, privacyContact: event.target.value })} placeholder="이메일 또는 전화번호" /></label>
              <label><span>보유기간</span><input value={draft.privacyRetentionPeriod} onChange={(event) => setDraft({ ...draft, privacyRetentionPeriod: event.target.value })} /></label>
              <label className="wide"><span>수집·이용 목적</span><textarea value={draft.privacyPurpose} onChange={(event) => setDraft({ ...draft, privacyPurpose: event.target.value })} /></label>
              <label className="wide"><span>동의 거부 안내</span><textarea value={draft.privacyRefusalNotice} onChange={(event) => setDraft({ ...draft, privacyRefusalNotice: event.target.value })} /></label>
              <label className="wide"><span>개인정보처리방침 전문</span><textarea value={draft.privacyPolicy} onChange={(event) => setDraft({ ...draft, privacyPolicy: event.target.value })} /></label>
              {draft.analyticsEnabled && <label className="wide"><span>방문 분석 수집 안내</span><textarea value={draft.analyticsNotice} onChange={(event) => setDraft({ ...draft, analyticsNotice: event.target.value })} /></label>}
              <label className="wide"><span>법적·주의 문구</span><textarea value={draft.legalNotice} onChange={(event) => setDraft({ ...draft, legalNotice: event.target.value })} /></label>
            </div>
            <div className="landing-form-grid"><label><span>대표자 성명</span><input value={draft.businessRepresentative} onChange={(event) => setDraft({ ...draft, businessRepresentative: event.target.value })} /></label><label><span>사업자 전화번호</span><input value={draft.businessPhone} onChange={(event) => setDraft({ ...draft, businessPhone: event.target.value, businessContact: event.target.value })} /></label><label><span>사업자 이메일</span><input type="email" value={draft.businessEmail} onChange={(event) => setDraft({ ...draft, businessEmail: event.target.value })} /></label><label className="wide"><span>사업장 주소</span><input value={draft.businessAddress} onChange={(event) => setDraft({ ...draft, businessAddress: event.target.value })} /></label><label><span>사업자등록번호</span><input value={draft.businessRegistrationNumber} onChange={(event) => setDraft({ ...draft, businessRegistrationNumber: event.target.value })} /></label><label><span>통신판매업 신고번호·면제근거</span><input value={draft.mailOrderSalesNumber} onChange={(event) => setDraft({ ...draft, mailOrderSalesNumber: event.target.value })} /></label>{draft.pageMode === "transaction" && <label className="wide"><span>교환·환불 조건</span><textarea value={draft.refundPolicy} onChange={(event) => setDraft({ ...draft, refundPolicy: event.target.value })} /></label>}{draft.pageMode === "transaction" && <label className="wide"><span>거래조건·약관 인터넷 주소</span><input type="url" value={draft.termsUrl} onChange={(event) => setDraft({ ...draft, termsUrl: event.target.value })} placeholder="https://로 시작하는 약관 페이지 주소" /></label>}</div>
            <div className="landing-legal-check"><ShieldCheck /><p><strong>자동 안전장치</strong>필수 개인정보 동의를 하지 않으면 신청 버튼이 활성화되지 않으며, 수집하지 않기로 한 필드는 서버에서도 거부됩니다.</p></div>
          </section>

          <section className="landing-domain-shop">
            <div><Globe2 /><span><strong>개인 도메인은 별도 구매</strong><p>무료 공개 주소는 이미 제공됩니다. 원하는 주소를 구매한 뒤 연결을 요청하세요.</p></span></div>
            <nav><a href="https://domain.gabia.com/" target="_blank" rel="noreferrer">가비아에서 검색 <ExternalLink /></a><a href="https://www.hosting.kr/domain" target="_blank" rel="noreferrer">호스팅케이알에서 검색 <ExternalLink /></a><a href="https://www.cafe24.com/?controller=product_domain" target="_blank" rel="noreferrer">카페24에서 검색 <ExternalLink /></a></nav>
          </section>

          <section className="landing-external-status">
            <div><span><Globe2 /></span><p><strong>나만의 인터넷 주소</strong><small>주소 소유 확인과 연결 설정이 필요합니다.</small></p><em>외부 계정 연결 필요</em></div>
            <div><span><ShieldCheck /></span><p><strong>온라인 결제</strong><small>통신판매 신고, 환불정책, 결제대행사 계약 확인 후 연결합니다.</small></p><em>아직 미연결</em></div>
          </section>
        </div>
      )}

      {mode === "preview" && (
        <div className="landing-preview-wrap">
          <div className={`landing-mini-preview tone-${draft.backgroundTone}`} style={{ "--preview-accent": draft.accentColor } as React.CSSProperties}>
            <LandingBlocksRenderer data={draft.pageData ?? createLandingPageData(draft, draft.templateId)} />
          </div>
        </div>
      )}

      {mode === "versions" && (
        <div className="landing-version-list">
          {site?.versions.map((version) => <article key={version.id}><span>{version.version}판</span><div><strong>{version.config.headline}</strong><small>{new Date(version.createdAt).toLocaleString("ko-KR")} · 공개 주소 끝부분: {version.config.slug}</small></div>{site.publishedVersion === version.version ? <em><Check /> 현재 공개</em> : <button disabled={action !== "idle"} onClick={() => rollback(version.version)}><RefreshCcw /> 이 버전으로 복구</button>}</article>)}
          {!site?.versions.length && <p className="landing-version-empty">아직 발행 기록이 없습니다. 첫 공개 후 이전 버전으로 되돌릴 수 있습니다.</p>}
        </div>
      )}

      {mode === "leads" && (
        <div className="landing-lead-list">
          <header><div><strong>최근 신청 {leads.length}건</strong><p>필수 동의를 받은 신청만 표시합니다. 업무 목적이 끝나면 설정한 보유기간에 맞춰 삭제해야 합니다.</p></div><button disabled={action !== "idle"} onClick={load}><RefreshCcw /> 새로고침</button></header>
          {leads.map((lead) => <article key={lead.id}><span>{lead.name.slice(0, 1)}</span><div><strong>{lead.name}</strong><p>{lead.email || lead.phone}</p><small>{new Date(lead.createdAt).toLocaleString("ko-KR")} · 홍보 정보 수신 동의 {lead.marketingAgreed ? "예" : "아니오"}</small>{lead.message && <em>{lead.message}</em>}</div></article>)}
          {!leads.length && <p className="landing-version-empty">아직 접수된 신청이 없습니다. 공개 페이지 주소를 공유해 첫 반응을 확인하세요.</p>}
        </div>
      )}

      <footer className="landing-builder-footer">
        <div>{publicUrl ? <><span>공개 페이지 주소</span><a href={publicPath!} target="_blank" rel="noreferrer">{publicUrl}<ExternalLink /></a></> : <><span>공개 페이지 주소</span><small>첫 발행 후 생성됩니다.</small></>}</div>
        <button className="save-landing" disabled={action !== "idle"} onClick={saveOnly}>{action === "saving" ? <LoaderCircle className="spin" /> : <Save />} 초안 저장</button>
        <button className="publish-landing" disabled={action !== "idle"} onClick={publish}>{action === "publishing" ? <LoaderCircle className="spin" /> : <Rocket />} {site?.status === "published" ? "새 버전 발행" : "지금 공개하기"}</button>
      </footer>

      {builderOpen && (
        <LandingVisualBuilder
          data={draft.pageData ?? createLandingPageData(draft, draft.templateId)}
          businessName={draft.businessName}
          onClose={() => setBuilderOpen(false)}
          onSave={(pageData) => {
            updateDraft({ pageData });
            setBuilderOpen(false);
          }}
        />
      )}
    </section>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <label><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><span><i /></span><strong>{label}</strong></label>;
}
