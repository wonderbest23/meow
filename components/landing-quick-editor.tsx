"use client";

import {
  Check,
  ExternalLink,
  Globe2,
  Headphones,
  Image as ImageIcon,
  Maximize2,
  MessageCircle,
  PanelsTopLeft,
  RefreshCw,
  Rocket,
  Save,
  ShieldCheck,
  Store,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import {
  applyLandingTemplate,
  landingTemplateOptions,
  type LandingDraft,
} from "../lib/landing/domain";
import { CUSTOM_HOMEPAGE_FROM_AMOUNT } from "../lib/payments/domain";
import type { LandingSiteRecord } from "../lib/landing/domain";
import { createLandingPageData, syncLandingPageData } from "../lib/landing/page-data";
import { LandingDomainConnector } from "./landing-domain-connector";
import { LandingMediaField } from "./landing-media-field";

const LandingVisualBuilder = dynamic(
  () => import("./landing-visual-builder").then((module) => module.LandingVisualBuilder),
  { ssr: false },
);

type EditorStep = "design" | "content" | "business";
type EditorAction = "idle" | "saving" | "saved" | "publishing";

export function LandingQuickEditor({
  draft,
  action,
  message,
  published,
  publicPath,
  projectId,
  customDomain,
  demo,
  onChange,
  onReset,
  onSave,
  onPublish,
  onPreview,
  onSiteUpdated,
}: {
  draft: LandingDraft;
  action: EditorAction;
  message: string;
  published: boolean;
  publicPath: string;
  projectId: string | null;
  customDomain: string;
  demo: boolean;
  onChange: (draft: LandingDraft) => void;
  onReset: () => void;
  onSave: () => void;
  onPublish: () => void;
  onPreview: () => void;
  onSiteUpdated: (site: LandingSiteRecord) => void;
}) {
  const [step, setStep] = useState<EditorStep>("design");
  const [builderOpen, setBuilderOpen] = useState(false);
  const busy = action === "saving" || action === "publishing";
  const update = (patch: Partial<LandingDraft>) => {
    const next = { ...draft, ...patch };
    const pageData = patch.pageData ?? syncLandingPageData(
      draft.pageData ?? createLandingPageData(draft, draft.templateId),
      next,
      Object.keys(patch),
    );
    onChange({ ...next, pageData });
  };
  const requestExpertBuild = () => {
    window.dispatchEvent(new CustomEvent("venture:open-support-chat", {
      detail: {
        message: [
          "[전문 홈페이지 제작 상담]",
          `사업명: ${draft.businessName || "아직 정하지 않음"}`,
          `기본 제작비: ${CUSTOM_HOMEPAGE_FROM_AMOUNT.toLocaleString("ko-KR")}원부터`,
          "현재 자동 제작된 홈페이지를 바탕으로 전문 디자인과 추가 기능 제작 상담을 받고 싶습니다.",
          "원하는 내용: ",
        ].join("\n"),
      },
    }));
  };

  return (
    <section className="landing-quick-editor">
      <header className="landing-quick-heading">
        <div className="report-title-row"><Globe2 /><div><small>홈페이지 제작비 포함</small><h3>내 사업 홈페이지</h3></div></div>
        <div className="landing-report-actions">
          <button title="추천 설정으로 되돌리기" aria-label="추천 설정으로 되돌리기" onClick={onReset}>처음 설정</button>
          <button className="landing-fullscreen-trigger" onClick={onPreview}><Maximize2 /> 전체화면</button>
          <button className="preview-primary landing-publish-primary" disabled={busy} onClick={onPublish}><Rocket /> {action === "publishing" ? "공개 중" : published ? "수정하고 공개" : "저장하고 공개"}</button>
        </div>
      </header>

      <div className="landing-included-banner">
        <span><Check /></span>
        <div><strong>결제 금액에 홈페이지 제작과 무료 주소가 포함됩니다.</strong><p>별도 제작비 없이 바로 공개됩니다. 원하는 개인 도메인만 도메인 업체에서 별도로 구매하면 됩니다.</p></div>
        <em>{published || demo ? "홈페이지 준비됨" : "자동 제작 중"}</em>
      </div>

      {publicPath && <div className="landing-public-address"><Globe2 /><span><small>현재 무료 주소</small><strong>{publicPath}</strong></span>{!demo && <a href={publicPath} target="_blank" rel="noreferrer">열기 <ExternalLink /></a>}</div>}
      {message && <div className={`landing-report-message ${action}`} role="status">{message}</div>}

      <nav className="landing-easy-steps" aria-label="홈페이지 편집 단계">
        <button className={step === "design" ? "active" : ""} onClick={() => setStep("design")}><span>1</span><b>디자인 선택</b><small>틀·사진·로고</small></button>
        <button className={step === "content" ? "active" : ""} onClick={() => setStep("content")}><span>2</span><b>내용 확인</b><small>문구·가격·혜택</small></button>
        <button className={step === "business" ? "active" : ""} onClick={() => setStep("business")}><span>3</span><b>사업자·도메인</b><small>하단 정보·주소</small></button>
      </nav>

      {step === "design" && (
        <div className="landing-easy-panel">
          <header><small>업종에 맞는 틀</small><h4>마음에 드는 디자인 하나만 고르세요</h4><p>문구는 그대로 두고 배치, 대표색과 기본 사진을 한 번에 바꿉니다.</p></header>
          <div className="landing-template-grid">
            {landingTemplateOptions.map((template) => (
              <button key={template.id} className={draft.templateId === template.id ? "active" : ""} onClick={() => onChange(applyLandingTemplate(draft, template.id))}>
                <span style={{ backgroundImage: `url(${template.heroImageUrl})` }}><i style={{ background: template.accentColor }} /></span>
                <b>{template.name}</b><small>{template.description}</small>
                {draft.templateId === template.id && <em><Check /> 선택됨</em>}
              </button>
            ))}
          </div>
          <section className="landing-advanced-edit-callout">
            <span><PanelsTopLeft /></span>
            <div><small>더 자유롭게 만들기</small><strong>섹션을 직접 추가하고 순서를 바꾸세요</strong><p>첫 화면, 장점, 사진, 이용 과정, 상품과 신청 안내를 끌어다 놓고 선택한 글과 이미지만 바꿀 수 있습니다.</p></div>
            <button type="button" onClick={() => setBuilderOpen(true)}>자유 편집 열기 <PanelsTopLeft /></button>
          </section>
          <div className="landing-media-grid">
            <LandingMediaField label="대표 이미지" description="첫 화면을 채우는 사진입니다." value={draft.heroImageUrl} kind="hero" onChange={(heroImageUrl) => update({ heroImageUrl, heroImageAlt: `${draft.businessName} 대표 이미지` })} />
            <LandingMediaField label="로고" description="없으면 사업 이름으로 깔끔하게 표시합니다." value={draft.logoImageUrl} kind="logo" onChange={(logoImageUrl) => update({ logoImageUrl })} />
          </div>
          <div className="landing-simple-style"><strong>대표색</strong><div>{["#176b4d", "#2457a6", "#a04435", "#6d4ca3", "#222222"].map((color) => <button key={color} title={color} aria-label={`대표색 ${color}`} className={draft.accentColor === color ? "active" : ""} style={{ background: color }} onClick={() => update({ accentColor: color })} />)}<label title="직접 색상 선택"><input type="color" value={draft.accentColor} onChange={(event) => update({ accentColor: event.target.value })} /></label></div></div>
        </div>
      )}

      {step === "content" && (
        <div className="landing-easy-panel">
          <header><small>고객이 보는 내용</small><h4>추천 문구를 읽고 틀린 부분만 고치세요</h4><p>어려운 용어 없이 고객, 제공 내용과 가격이 바로 보이게 구성했습니다.</p></header>
          <div className="landing-essential-form">
            <label><span>사업 이름</span><input value={draft.businessName} maxLength={120} onChange={(event) => update({ businessName: event.target.value })} /></label>
            <label><span>버튼 문구</span><input value={draft.ctaLabel} maxLength={40} onChange={(event) => update({ ctaLabel: event.target.value })} /></label>
            <label className="wide"><span>첫 화면 큰 문구</span><textarea value={draft.headline} maxLength={120} onChange={(event) => update({ headline: event.target.value })} /></label>
            <label className="wide"><span>큰 문구 아래 설명</span><textarea value={draft.subheadline} maxLength={300} onChange={(event) => update({ subheadline: event.target.value })} /></label>
            <label><span>첫 상품 이름</span><input value={draft.offerTitle} maxLength={120} onChange={(event) => update({ offerTitle: event.target.value })} /></label>
            <label><span>가격</span><input value={draft.priceLabel} maxLength={100} onChange={(event) => update({ priceLabel: event.target.value })} /></label>
            <label className="wide"><span>첫 상품 설명</span><textarea value={draft.offerDescription} maxLength={1000} onChange={(event) => update({ offerDescription: event.target.value })} /></label>
          </div>
          <div className="landing-benefit-simple"><strong>고객이 선택할 이유 3개</strong>{draft.benefits.slice(0, 3).map((benefit, index) => <label key={index}><b>{index + 1}</b><input aria-label={`혜택 ${index + 1} 제목`} value={benefit.title} onChange={(event) => update({ benefits: draft.benefits.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) })} /><textarea aria-label={`혜택 ${index + 1} 설명`} value={benefit.description} onChange={(event) => update({ benefits: draft.benefits.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item) })} /></label>)}</div>
        </div>
      )}

      {step === "business" && (
        <div className="landing-easy-panel">
          <header><small>신뢰와 인터넷 주소</small><h4>사업자 하단 정보와 도메인을 준비하세요</h4><p>등록 전이면 비워둘 수 있지만, 홈페이지에서 직접 판매받기 전에는 실제 정보로 채워야 합니다.</p></header>
          <div className="landing-page-purpose">
            <button className={draft.pageMode === "lead_validation" ? "active" : ""} onClick={() => update({ pageMode: "lead_validation" })}><Store /><span><b>상담·예약 받기</b><small>문의 후 조건을 안내하는 사업</small></span></button>
            <button className={draft.pageMode === "transaction" ? "active" : ""} onClick={() => update({ pageMode: "transaction" })}><ShieldCheck /><span><b>홈페이지에서 바로 판매</b><small>가격·환불·통신판매 정보 필요</small></span></button>
          </div>
          <label className="landing-lead-switch"><input type="checkbox" checked={draft.leadCaptureEnabled} onChange={(event) => update({ leadCaptureEnabled: event.target.checked })} /><span><i /></span><p><strong>고객 신청폼 사용</strong><small>켜면 이름과 연락처를 안전하게 접수합니다.</small></p></label>
          <div className="landing-business-form">
            <label><span>대표자 이름</span><input value={draft.businessRepresentative} onChange={(event) => update({ businessRepresentative: event.target.value })} placeholder="사업자등록증과 같은 이름" /></label>
            <label><span>전화번호</span><input value={draft.businessPhone} onChange={(event) => update({ businessPhone: event.target.value, businessContact: event.target.value })} placeholder="고객 문의 전화" /></label>
            <label><span>이메일</span><input type="email" value={draft.businessEmail} onChange={(event) => update({ businessEmail: event.target.value })} placeholder="hello@mybusiness.kr" /></label>
            <label><span>사업자등록번호</span><input value={draft.businessRegistrationNumber} onChange={(event) => update({ businessRegistrationNumber: event.target.value })} placeholder="000-00-00000" /></label>
            <label className="wide"><span>사업장 주소</span><input value={draft.businessAddress} onChange={(event) => update({ businessAddress: event.target.value })} placeholder="고객 불만을 처리할 수 있는 실제 주소" /></label>
            <label><span>통신판매업 신고번호</span><input value={draft.mailOrderSalesNumber} onChange={(event) => update({ mailOrderSalesNumber: event.target.value })} placeholder="신고번호 또는 면제 근거" /></label>
            {draft.leadCaptureEnabled && <label><span>개인정보 문의</span><input value={draft.privacyContact} onChange={(event) => update({ privacyContact: event.target.value })} placeholder="이메일 또는 전화번호" /></label>}
            {draft.pageMode === "transaction" && <label className="wide"><span>교환·환불 조건</span><textarea value={draft.refundPolicy} onChange={(event) => update({ refundPolicy: event.target.value })} placeholder="취소 가능 시점, 환불 금액과 처리 기간" /></label>}
            {draft.pageMode === "transaction" && <label className="wide"><span>이용약관 주소</span><input type="url" value={draft.termsUrl} onChange={(event) => update({ termsUrl: event.target.value })} placeholder="https://로 시작하는 약관 주소" /></label>}
            <label className="wide"><span>무료 주소 끝부분</span><div className="slug-input"><em>/launch/</em><input value={draft.slug} onChange={(event) => update({ slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></div></label>
          </div>
          <LandingDomainConnector
            projectId={projectId}
            initialCustomDomain={customDomain}
            published={published}
            demo={demo}
            onSiteUpdated={onSiteUpdated}
          />
        </div>
      )}

      <footer className="landing-quick-actions">
        <p><ImageIcon /> 수정 전에도 추천 디자인으로 홈페이지가 준비되어 있습니다.</p>
        <button disabled={busy} onClick={onSave}><Save /> {action === "saving" ? "저장 중" : "초안 저장"}</button>
        <button disabled={busy} onClick={onPublish}><Rocket /> {action === "publishing" ? "공개 중" : "저장하고 공개"}</button>
      </footer>

      <section className="landing-expert-build">
        <span><Headphones /></span>
        <div><small>선택 제작 서비스 · {CUSTOM_HOMEPAGE_FROM_AMOUNT.toLocaleString("ko-KR")}원부터</small><strong>맞춤 홈페이지 제작 요청</strong><p>자동 제작본보다 세밀한 디자인이나 예약·결제 같은 추가 기능이 필요하면 상담 후 범위와 비용을 먼저 안내합니다.</p></div>
        <button type="button" onClick={requestExpertBuild}>1:1 제작 상담 <MessageCircle /></button>
      </section>

      {builderOpen && (
        <LandingVisualBuilder
          data={draft.pageData ?? createLandingPageData(draft, draft.templateId)}
          businessName={draft.businessName}
          onClose={() => setBuilderOpen(false)}
          onSave={(pageData) => {
            update({ pageData });
            setBuilderOpen(false);
          }}
        />
      )}
    </section>
  );
}
