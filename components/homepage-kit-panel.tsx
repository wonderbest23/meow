"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BrainwaveTemplatePicker } from "./brainwave-template-picker";
import { Check, ChevronDown, Copy, ExternalLink, Globe2, Inbox, LayoutTemplate, LoaderCircle, Pencil, PhoneCall, RefreshCw, Rocket, Save, Share2, ShieldCheck, Sparkles } from "lucide-react";
import { applyContactMethod, CONTACT_METHOD_INFO, CONTACT_METHODS, contactHref, DEFAULT_CONTACT, draftPhone, normalizeWebUrl, quickActions, type LandingContact } from "../lib/landing/contact-method";
import { privacyPolicyWithContact, type LandingDraft, type LandingLeadRecord, type LandingSiteRecord } from "../lib/landing/domain";
import { LandingBlocksRenderer } from "./landing-blocks";
import { LandingDomainConnector } from "./landing-domain-connector";
import { BRAINWAVE_PAGES } from "../lib/landing/brainwave/catalog";
import { createBusinessTemplate, visitInfoTexts } from "../lib/landing/brainwave/business-content";
import { applyBusinessContent } from "../lib/landing/page-data";
import { HomepageSourceUpdate } from "./homepage-source-update";
import { HomepageLeadNotification, useHomepageLeadNotifications } from "./homepage-lead-notifications";

/*
 * 킷 페이지 홈페이지 화면.
 *
 * 예전 화면은 옛 블록 편집기 시절의 3단계(디자인 8종 고르기 → 문구 폼 →
 * 사업자)와 '자유 편집' 단추, 포함 안내, 전문가 제작 광고가 한 화면에 쌓여
 * 있었다. 킷 페이지에서는 디자인 고르기·문구 폼이 편집기 안으로 들어갔으니
 * 밖에 남길 것은 넷뿐이다:
 *   1) 페이지 미리보기 + 편집 열기 (주된 행동 하나)
 *   2) 사업자 정보 — 법으로 적어야 하는 것, 공개 전 필수
 *   3) 내 도메인
 *   4) 접수된 문의 — 신청폼으로 들어온 것
 * 저장·공개는 맨 위 한 줄에만 둔다.
 *
 * 2026-08-25 개편(사용자 요청): 화면이 길어 읽기 어렵다 —
 *   - 주된 행동(템플릿 선택·에디터)은 미리보기 위의 큰 버튼 두 개로 강조하고,
 *   - 2·3·4 는 접이식으로 접어 두되 요약 줄에 상태 배지(채울 것 n개·문의 n건)를 단다.
 *   - 공개 전의 /launch/ 주소는 눌러도 404 라서 링크 대신 안내로만 보여 준다.
 */
type Action = "idle" | "saving" | "saved" | "publishing";

/* 접이식 카드 — 요약 줄(아이콘·제목·상태 배지)만 보이다가 누르면 펼쳐진다 */
function Fold({ icon, title, badge, hint, children, defaultOpen, id }: {
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** 왼쪽 사이드바에서 바로 찾아오는 앵커 */
  id?: string;
}) {
  return (
    <details className="hk-fold" open={defaultOpen} id={id}>
      <summary>
        <span className="hk-fold-ic">{icon}</span>
        <span className="hk-fold-tt">
          <strong>{title} {badge}</strong>
          {hint ? <small>{hint}</small> : null}
        </span>
        <ChevronDown size={18} className="hk-fold-chev" aria-hidden />
      </summary>
      <div className="hk-fold-body">{children}</div>
    </details>
  );
}

export function HomepageKitPanel({
  draft,
  site,
  projectId,
  publicPath,
  action,
  message,
  onChange,
  onSave,
  onPublish,
  onOpenEditor,
  onSiteUpdated,
  onSourceApplied,
  aiFill,
}: {
  draft: LandingDraft;
  site: LandingSiteRecord | null;
  projectId: string | null;
  publicPath: string;
  action: Action;
  message: string;
  onChange: (draft: LandingDraft) => void;
  onSave: () => void;
  onPublish: () => void;
  onOpenEditor: () => void;
  onSiteUpdated: (site: LandingSiteRecord) => void;
  onSourceApplied?: (site: LandingSiteRecord, expectedUpdatedAt: string) => void;
  /** 계획서로 채우기(AI) — 카드·이용 순서·마무리 문구와 업종 사진 */
  aiFill?: { running: boolean; run: () => void };
}) {
  const update = (patch: Partial<LandingDraft>) => onChange({ ...draft, ...patch });
  const busy = action === "saving" || action === "publishing" || Boolean(aiFill?.running);
  const published = site?.status === "published";
  /* 손님 연락 방법 — 바꾸면 문의 버튼의 이동·글이 한 번에 따라간다(applyContactMethod) */
  const contact = draft.contact ?? DEFAULT_CONTACT;
  const contactInfo = CONTACT_METHOD_INFO[contact.method];
  const setContact = (patch: Partial<LandingContact>) => onChange(applyContactMethod(draft, { ...draft, contact: { ...contact, ...patch } }));
  const setPhone = (value: string) => onChange(applyContactMethod(draft, { ...draft, businessPhone: value, businessContact: value }));
  const contactReady = contactHref(contact, draftPhone(draft)) !== null;
  const quickCount = quickActions(contact, draftPhone(draft), draft.leadCaptureEnabled).length;
  /* 공개한 주소 복사·공유 — 오픈하자마자 단골·단지 커뮤니티에 뿌릴 수 있게 */
  const [copied, setCopied] = useState(false);
  const publicUrl = typeof window !== "undefined" && publicPath ? `${window.location.origin}${publicPath}` : publicPath;
  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(publicUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { window.prompt("주소를 복사해 주세요", publicUrl); }
  };
  const shareUrl = async () => {
    if (typeof navigator.share === "function") { try { await navigator.share({ title: draft.businessName, text: `${draft.businessName} 홈페이지`, url: publicUrl }); return; } catch { return; } }
    await copyUrl();
  };
  const page = BRAINWAVE_PAGES.find((p) => p.id === draft.pageData?.brainwave?.page);
  const [picking, setPicking] = useState(false);
  const [contentNotice, setContentNotice] = useState("");
  const bw = draft.pageData?.brainwave;
  // 큰 제목(계획서의 한 줄 소개)은 폼에 칸이 없다 — 템플릿을 바꿔도 이어 쓴다
  const contentSource = () => ({ businessName: draft.businessName, ...(draft.pageData?.businessContent?.headline ? { headline: draft.pageData.businessContent.headline } : {}), offer: draft.offerTitle, description: draft.offerDescription, customer: draft.pageData?.businessContent?.customer ?? "", price: draft.priceLabel, cta: draft.ctaLabel, image: draft.heroImageUrl });
  const applyBusiness = () => {
    if (!draft.pageData || busy || !draft.businessName.trim()) return;
    onChange({ ...draft, pageData: applyBusinessContent(draft.pageData, contentSource()) });
    setContentNotice("사업 정보를 반영했어요. 직접 고친 글과 사진은 유지됩니다. 저장하면 적용됩니다.");
  };
  const pickTemplate = (id: string) => {
    if (!draft.pageData || !bw || busy) return;
    if (id === bw.page) { setPicking(false); return; }
    const businessContent = { ...contentSource(), businessName: draft.businessName.trim() || "내 사업" };
    // 새 템플릿의 문의 버튼도 지금 연락 방법으로(전화면 전화) — 새로 만든 버튼은 '문의 양식'에서 시작한다
    const brainwave = createBusinessTemplate(businessContent, id);
    Object.assign(brainwave.texts, visitInfoTexts(id, { address: draft.businessAddress, hours: draft.openHours }));
    const next = { ...draft, pageData: { ...draft.pageData, businessContent, brainwave, content: [] } };
    onChange(applyContactMethod({ ...next, contact: DEFAULT_CONTACT }, next));
    setPicking(false);
  };

  /* 접수된 문의 — 같은 프로젝트의 landing API 가 돌려준다 */
  const [leads, setLeads] = useState<LandingLeadRecord[] | null>(null);
  const [leadsError, setLeadsError] = useState("");
  const [leadsRefresh, setLeadsRefresh] = useState(0);
  const notifications = useHomepageLeadNotifications(projectId, leadsRefresh);
  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    setLeads(null); setLeadsError("");
    fetch(`/api/projects/${projectId}/landing`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.leads)) throw new Error("LEADS_LOAD_FAILED");
        if (!controller.signal.aborted) setLeads(data.leads);
      })
      .catch(() => { if (!controller.signal.aborted) setLeadsError("문의를 불러오지 못했습니다. 새로고침해 다시 확인해주세요."); });
    return () => controller.abort();
  }, [projectId, leadsRefresh]);

  /* 공개 전에 비어 있으면 안 되는 것 — 법정 표기 */
  const missing = [
    !draft.businessRepresentative.trim() && "대표자",
    !draft.businessAddress.trim() && "사업장 주소",
    !(draft.businessPhone || draft.businessContact).trim() && "전화번호",
    !draft.businessEmail.trim() && "이메일",
    !draft.businessRegistrationNumber.trim() && "사업자등록번호",
    draft.leadCaptureEnabled && !draft.privacyContact.trim() && "개인정보 문의처",
  ].filter(Boolean) as string[];

  return (
    <section className="hk">
      <header className="hk-top">
        {/* 개요·문서·섹션 화면과 같은 머리 규칙 — [←] 제목 20px · 아래 13px */}
        <a href="/plan/overview" className="hk-back" aria-label="플랜 개요로">←</a>
        <div>
          <h3>내 사업 홈페이지</h3>
          {publicPath ? (
            <p className="hk-url">
              <span>{published ? "공개 중" : "아직 비공개"}</span>
              {published
                ? <><a href={publicPath} target="_blank" rel="noreferrer">{publicPath} <ExternalLink size={13} /></a>
                  <button type="button" className="hk-url-btn" onClick={copyUrl}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "복사됨" : "주소 복사"}</button>
                  <button type="button" className="hk-url-btn" onClick={shareUrl}><Share2 size={13} /> 공유</button></>
                /* 공개 전에는 이 주소가 아직 없어서(404) 링크를 걸지 않는다 */
                : <em className="hk-url-pending">{publicPath} — 공개하면 이 주소로 열립니다</em>}
            </p>
          ) : <p className="hk-url">첫 공개 후 주소가 생깁니다</p>}
        </div>
        <div className="hk-actions">
          <button type="button" disabled={busy} onClick={onSave}>{action === "saving" ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />} 저장</button>
          <button type="button" className="hk-primary" disabled={busy} onClick={onPublish}>{action === "publishing" ? <LoaderCircle className="spin" size={15} /> : <Rocket size={15} />} {published ? "새 버전 공개" : "공개하기"}</button>
        </div>
      </header>
      {message ? <p className="hk-msg">{message}</p> : null}
      {contentNotice ? <p className="hk-msg" role="status">{contentNotice}</p> : null}

      {/*
        미리보기 — 브라우저 목업(신호등 점 + 주소창) 안에 담는다.
        '이게 실제로 손님 브라우저에서 열리는 화면'이라는 게 한눈에 읽힌다.
        템플릿·에디터 버튼은 목업 바 오른쪽의 작은 버튼으로 — 예전의 큰 버튼
        두 개는 미리보기보다 목소리가 컸다(사용자 지적).
      */}
      <div className="hk-preview hk-mock" id="hk-preview">
        <div className="hk-mock-bar">
          <span aria-hidden="true" className="hk-dots"><i className="hk-dot r" /><i className="hk-dot y" /><i className="hk-dot g" /></span>
          <span className="hk-mock-url">{publicPath ? `oneulstart.com${publicPath}` : "내 사업 홈페이지"}</span>
          <span className="hk-mock-actions">
            {aiFill ? <button type="button" onClick={aiFill.run} disabled={busy} title="계획서 내용으로 카드·이용 순서·마무리 문구와 업종 사진을 채워요. 직접 고친 글·사진은 그대로 둬요.">
              {aiFill.running ? <LoaderCircle className="spin" size={14} /> : <Sparkles size={14} />} {aiFill.running ? "채우는 중…" : "AI로 채우기"}
            </button> : null}
            {projectId && site && onSourceApplied ? <HomepageSourceUpdate projectId={projectId} site={site} draft={draft} disabled={busy} onApplied={onSourceApplied} /> : null}
            <button type="button" onClick={applyBusiness} disabled={busy || !draft.businessName.trim() || !bw || !BRAINWAVE_PAGES.some(page => page.id === bw.page && page.group === "landing")} title="사업 정보 적용">
              <RefreshCw size={14} /> 사업 정보 적용
            </button>
            <button type="button" disabled={busy} onClick={() => setPicking(true)} title={page ? `지금 템플릿: ${page.ko}` : "디자인 고르기"}>
              <LayoutTemplate size={14} /> 템플릿
            </button>
            <button type="button" className="hk-mock-edit" disabled={busy} onClick={onOpenEditor}>
              <Pencil size={14} /> 에디터 열기
            </button>
          </span>
        </div>
        {/* 미리보기 안에 킷 템플릿의 <button>·<input> 이 있어서 <button> 으로 감싸면 invalid HTML(하이드레이션 오류) */}
        <div role="button" tabIndex={busy ? -1 : 0} aria-disabled={busy} className="hk-preview-body" onClick={() => { if (!busy) onOpenEditor(); }} onKeyDown={(e) => { if (!busy && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpenEditor(); } }} aria-label="에디터 열기">
          <LandingBlocksRenderer data={draft.pageData!} />
          <span className="hk-preview-cover"><Pencil size={18} /> 누르면 에디터가 열립니다 — 글은 그 자리에서, 사진은 눌러서 바꿉니다</span>
        </div>
      </div>
      {picking && bw ? <BrainwaveTemplatePicker current={bw.page} onPick={pickTemplate} onClose={() => setPicking(false)} /> : null}

      {/* 손님 연락 방법 — 문의·예약 버튼과 휴대폰 아래 고정 버튼이 어디로 연결될지 */}
      <Fold
        id="hk-contact"
        icon={<PhoneCall size={18} />}
        title="손님 연락 방법"
        badge={<em className={`hk-badge ${contactReady ? "hk-badge-ok" : "hk-badge-warn"}`}>{contactReady ? contactInfo.label : `${contactInfo.label} — 입력 필요`}</em>}
        hint="홈페이지의 문의·예약 버튼을 누르면 어디로 연결할지 한 번에 정해요"
      >
        <div className="hk-contact-methods" role="radiogroup" aria-label="연결 방법">
          {CONTACT_METHODS.map((method) => (
            <label key={method} className={method === contact.method ? "on" : ""}>
              <input type="radio" name="hk-contact-method" checked={method === contact.method} onChange={() => setContact({ method })} />
              {CONTACT_METHOD_INFO[method].label}
            </label>
          ))}
        </div>
        <p className="hk-contact-hint">{contactInfo.hint} 모든 문의 버튼에 한 번에 적용돼요(버튼 하나만 따로 정한 것은 그대로예요).</p>
        <div className="hk-grid">
          {contactInfo.field === "phone" ? (
            <label className="wide"><span>전화번호</span><input inputMode="tel" value={draft.businessPhone} onChange={(e) => setPhone(e.target.value)} placeholder={contactInfo.placeholder} /></label>
          ) : null}
          {contactInfo.field && contactInfo.field !== "phone" ? (
            <label className="wide"><span>{contactInfo.label} 주소</span>
              <input inputMode="url" value={contact[contactInfo.field]} onChange={(e) => setContact({ [contactInfo.field as string]: e.target.value } as Partial<LandingContact>)}
                onBlur={(e) => setContact({ [contactInfo.field as string]: normalizeWebUrl(e.target.value) } as Partial<LandingContact>)} placeholder={contactInfo.placeholder} />
            </label>
          ) : null}
        </div>
        {!contactReady ? <p className="hk-contact-warn">{contactInfo.field === "phone" ? "전화번호" : "주소"}를 넣으면 버튼이 연결돼요. 그 전까지는 문의 양식으로 연결돼요.</p> : null}
        <div className="hk-contact-quick">
          <label className="hk-switch">
            <input type="checkbox" checked={contact.quickBar} onChange={(e) => setContact({ quickBar: e.target.checked })} />
            <span>휴대폰 화면 아래 고정 버튼 <small>{quickCount ? `손님 휴대폰에 ${quickCount}개가 떠 있어요(전화·카톡·예약 중 넣은 것).` : "전화번호·카카오톡 채널·예약 주소 중 하나를 넣으면 나타나요."}</small></span>
          </label>
          {contact.quickBar ? (
            <div className="hk-grid">
              {contactInfo.field !== "phone" ? <label><span>전화번호</span><input inputMode="tel" value={draft.businessPhone} onChange={(e) => setPhone(e.target.value)} placeholder="010-1234-5678" /></label> : null}
              {contact.method !== "kakao" ? <label><span>카카오톡 채널</span><input inputMode="url" value={contact.kakaoUrl} onChange={(e) => setContact({ kakaoUrl: e.target.value })} onBlur={(e) => setContact({ kakaoUrl: normalizeWebUrl(e.target.value) })} placeholder="https://pf.kakao.com/_xxxxx" /></label> : null}
              {contact.method !== "booking" ? <label><span>예약 페이지</span><input inputMode="url" value={contact.bookingUrl} onChange={(e) => setContact({ bookingUrl: e.target.value })} onBlur={(e) => setContact({ bookingUrl: normalizeWebUrl(e.target.value) })} placeholder="https://booking.naver.com/…" /></label> : null}
            </div>
          ) : null}
        </div>
        <div className="hk-fold-save">
          <button type="button" disabled={busy} onClick={onSave}>{action === "saving" ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />} 연락 방법 저장</button>
        </div>
      </Fold>

      {/* 2. 사업자 정보 — 접이식 */}
      <Fold
        id="hk-business"
        icon={<ShieldCheck size={18} />}
        title="사업자 정보"
        badge={missing.length ? <em className="hk-badge hk-badge-warn">채울 것 {missing.length}개</em> : <em className="hk-badge hk-badge-ok">완료</em>}
        hint={missing.length
          ? (draft.pageMode === "transaction" ? `공개 전에 채워 주세요: ${missing.join(", ")}` : `지금도 공개할 수 있어요. 결제를 받기 전에는 꼭 채워 주세요: ${missing.join(", ")}`)
          : "홈페이지 맨 아래에 표시되는 법정 정보입니다."}
      >
        <div className="hk-grid">
          <label><span>사업 이름</span><input value={draft.businessName} maxLength={120} onChange={(e) => update({ businessName: e.target.value })} /></label>
          <label><span>대표자</span><input value={draft.businessRepresentative} onChange={(e) => update({ businessRepresentative: e.target.value })} placeholder="사업자등록증과 같은 이름" /></label>
          <label><span>전화번호</span><input value={draft.businessPhone} onChange={(e) => update({ businessPhone: e.target.value, businessContact: e.target.value })} placeholder="010-0000-0000" /></label>
          <label><span>이메일</span><input type="email" value={draft.businessEmail} onChange={(e) => update({ businessEmail: e.target.value })} placeholder="hello@mybusiness.kr" /></label>
          <label><span>사업자등록번호</span><input value={draft.businessRegistrationNumber} onChange={(e) => update({ businessRegistrationNumber: e.target.value })} placeholder="000-00-00000" /></label>
          <label><span>통신판매업 신고번호</span><input value={draft.mailOrderSalesNumber} onChange={(e) => update({ mailOrderSalesNumber: e.target.value })} placeholder="없으면 비워 두세요" /></label>
          <label className="wide"><span>사업장 주소</span><input value={draft.businessAddress} onChange={(e) => update({ businessAddress: e.target.value })} placeholder="고객 문의를 처리할 수 있는 실제 주소" /></label>
          <label className="wide"><span>영업시간</span><input value={draft.openHours} onChange={(e) => update({ openHours: e.target.value })} placeholder="예: 평일 09:00–19:00 · 일요일 휴무" /></label>
          <label className="wide hk-switch">
            <input type="checkbox" checked={draft.leadCaptureEnabled} onChange={(e) => update({ leadCaptureEnabled: e.target.checked })} />
            <span>고객 문의 양식 받기 <small>홈페이지 아래에 이름·연락처 양식이 붙고, 접수된 문의가 아래 칸에 쌓입니다.</small></span>
          </label>
          {draft.leadCaptureEnabled ? <label><span>개인정보 문의처</span><input value={draft.privacyContact} onChange={(e) => update({ privacyContact: e.target.value, privacyPolicy: privacyPolicyWithContact(draft.privacyPolicy, e.target.value) })} placeholder="이메일 또는 전화번호" /></label> : null}
          <label><span>문의 버튼 문구</span><input value={draft.ctaLabel} maxLength={40} onChange={(e) => update({ ctaLabel: e.target.value })} /></label>
          <label className="wide"><span>무료 주소 끝부분</span><div className="slug-input"><em>/launch/</em><input value={draft.slug} onChange={(e) => update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></div></label>
        </div>
        {/* 이 칸에서 고친 것을 바로 저장 — 위로 스크롤해 전체 저장을 찾지 않게 */}
        <div className="hk-fold-save">
          <button type="button" disabled={busy} onClick={onSave}>{action === "saving" ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />} 사업자 정보 저장</button>
        </div>
      </Fold>

      {/* 3. 도메인 — 접이식. 카드 안의 자체 제목은 CSS 로 숨긴다(요약 줄과 중복) */}
      <Fold
        id="hk-domain"
        icon={<Globe2 size={18} />}
        title="내 도메인 연결"
        badge={site?.customDomain ? <em className="hk-badge hk-badge-ok">{site.customDomain}</em> : null}
        hint="www.mybrand.com 같은 내 주소 붙이기 · 호스팅 1년"
      >
        <LandingDomainConnector
          projectId={projectId}
          initialCustomDomain={site?.customDomain ?? ""}
          published={Boolean(published)}
          demo={false}
          onSiteUpdated={onSiteUpdated}
        />
      </Fold>

      {/* 4. 접수된 문의 — 접이식 */}
      <Fold
        id="hk-leads"
        icon={<Inbox size={18} />}
        title="접수된 문의"
        badge={leadsError ? <em className="hk-badge hk-badge-warn">확인 필요</em> : leads === null ? <em className="hk-badge">불러오는 중</em> : <em className={`hk-badge ${leads.length ? "hk-badge-info" : ""}`}>{leads.length}건</em>}
        hint={draft.leadCaptureEnabled ? "홈페이지 문의 양식으로 들어온 것입니다. 보유기간이 지나면 지워 주세요." : "문의 양식이 꺼져 있습니다. 사업자 정보에서 켜면 접수됩니다."}
      >
        <div className="hk-fold-save"><button type="button" aria-label="문의 새로고침" title="문의 새로고침" disabled={leads === null && !leadsError} onClick={() => setLeadsRefresh(value => value + 1)}><RefreshCw size={14} /> 새로고침</button></div>
        {notifications.error ? <p className="hk-empty" role="alert">{notifications.error}</p> : null}
        {leadsError ? <p className="hk-empty" role="alert">{leadsError}</p> : leads === null ? <p className="hk-empty">불러오는 중…</p> : leads.length === 0 ? <p className="hk-empty">아직 접수된 문의가 없습니다. 공개 주소를 알리면 여기 쌓입니다.</p> : (
          <ul className="hk-leads">
            {leads.map((lead) => (
              <li key={lead.id}>
                <i>{lead.name.slice(0, 1)}</i>
                <div>
                  <strong>{lead.name}</strong>
                  <span>{[lead.phone, lead.email].filter(Boolean).join(" · ")}</span>
                  {lead.message ? <p>{lead.message}</p> : null}
                  <small>{new Date(lead.createdAt).toLocaleString("ko-KR")}{lead.marketingAgreed ? " · 홍보 수신 동의" : ""}</small>
                  {notifications.items ? <HomepageLeadNotification value={notifications.items.find(item => item.leadId === lead.id)} busy={notifications.retrying !== null} onRetry={() => { void notifications.retry(lead.id); }} /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Fold>
    </section>
  );
}
