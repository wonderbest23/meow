"use client";

import { useEffect, useState, type ReactNode } from "react";
import { BrainwaveTemplatePicker } from "./brainwave-template-picker";
import { ChevronDown, ExternalLink, Globe2, Inbox, LayoutTemplate, LoaderCircle, Pencil, Rocket, Save, ShieldCheck } from "lucide-react";
import type { LandingDraft, LandingLeadRecord, LandingSiteRecord } from "../lib/landing/domain";
import { LandingBlocksRenderer } from "./landing-blocks";
import { LandingDomainConnector } from "./landing-domain-connector";
import { BRAINWAVE_PAGES } from "../lib/landing/brainwave/catalog";

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
function Fold({ icon, title, badge, hint, children, defaultOpen }: {
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  hint?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="hk-fold" open={defaultOpen}>
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
}) {
  const update = (patch: Partial<LandingDraft>) => onChange({ ...draft, ...patch });
  const busy = action === "saving" || action === "publishing";
  const published = site?.status === "published";
  const page = BRAINWAVE_PAGES.find((p) => p.id === draft.pageData?.brainwave?.page);
  const [picking, setPicking] = useState(false);
  const bw = draft.pageData?.brainwave;
  const pickTemplate = (id: string) => {
    if (!draft.pageData || !bw) return;
    if (id === bw.page) { setPicking(false); return; }
    const dirty = Object.keys(bw.texts ?? {}).length + Object.keys(bw.images ?? {}).length > 0;
    if (dirty && !window.confirm("템플릿을 바꾸면 지금까지 고친 글·사진은 새 페이지에 맞지 않아 초기화됩니다. 바꿀까요?")) return;
    onChange({ ...draft, pageData: { ...draft.pageData, brainwave: { page: id, texts: {}, images: {}, links: {} }, content: [] } });
    setPicking(false);
  };

  /* 접수된 문의 — 같은 프로젝트의 landing API 가 돌려준다 */
  const [leads, setLeads] = useState<LandingLeadRecord[] | null>(null);
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/landing`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { leads?: LandingLeadRecord[] }) => setLeads(j.leads ?? []))
      .catch(() => setLeads([]));
  }, [projectId]);

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
        <div>
          <h3>내 사업 홈페이지</h3>
          {publicPath ? (
            <p className="hk-url">
              <span>{published ? "공개 중" : "아직 비공개"}</span>
              {published
                ? <a href={publicPath} target="_blank" rel="noreferrer">{publicPath} <ExternalLink size={13} /></a>
                /* 공개 전에는 이 주소가 아직 없어서(404) 링크를 걸지 않는다 */
                : <em className="hk-url-pending">{publicPath} — 공개하면 이 주소로 열립니다</em>}
            </p>
          ) : <p className="hk-url"><span>첫 공개 후 주소가 생깁니다</span></p>}
        </div>
        <div className="hk-actions">
          <button type="button" disabled={busy} onClick={onSave}>{action === "saving" ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />} 저장</button>
          <button type="button" className="hk-primary" disabled={busy} onClick={onPublish}>{action === "publishing" ? <LoaderCircle className="spin" size={15} /> : <Rocket size={15} />} {published ? "새 버전 공개" : "공개하기"}</button>
        </div>
      </header>
      {message ? <p className="hk-msg">{message}</p> : null}

      {/* 1. 주된 행동 — 큰 버튼 둘 */}
      <div className="hk-cta">
        <button type="button" className="hk-cta-btn" onClick={() => setPicking(true)}>
          <LayoutTemplate size={20} />
          <span><strong>템플릿 선택하기</strong><small>{page ? `지금: ${page.ko}` : "디자인 고르기"}</small></span>
        </button>
        <button type="button" className="hk-cta-btn hk-cta-primary" onClick={onOpenEditor}>
          <Pencil size={20} />
          <span><strong>에디터로 꾸미기</strong><small>글·사진을 그 자리에서 수정</small></span>
        </button>
      </div>

      {/* 미리보기 — 누르면 편집기 */}
      <div className="hk-preview">
        {/* 미리보기 안에 킷 템플릿의 <button>·<input> 이 있어서 <button> 으로 감싸면 invalid HTML(하이드레이션 오류) */}
        <div role="button" tabIndex={0} className="hk-preview-body" onClick={onOpenEditor} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenEditor(); } }} aria-label="에디터 열기">
          <LandingBlocksRenderer data={draft.pageData!} />
          <span className="hk-preview-cover"><Pencil size={18} /> 누르면 에디터가 열립니다 — 글은 그 자리에서, 사진은 눌러서 바꿉니다</span>
        </div>
      </div>
      {picking && bw ? <BrainwaveTemplatePicker current={bw.page} onPick={pickTemplate} onClose={() => setPicking(false)} /> : null}

      {/* 2. 사업자 정보 — 접이식 */}
      <Fold
        icon={<ShieldCheck size={18} />}
        title="사업자 정보"
        badge={missing.length ? <em className="hk-badge hk-badge-warn">채울 것 {missing.length}개</em> : <em className="hk-badge hk-badge-ok">완료</em>}
        hint={missing.length ? `공개 전에 채워 주세요: ${missing.join(", ")}` : "홈페이지 맨 아래에 표시되는 법정 정보입니다."}
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
          {draft.leadCaptureEnabled ? <label><span>개인정보 문의처</span><input value={draft.privacyContact} onChange={(e) => update({ privacyContact: e.target.value })} placeholder="이메일 또는 전화번호" /></label> : null}
          <label><span>문의 버튼 문구</span><input value={draft.ctaLabel} maxLength={40} onChange={(e) => update({ ctaLabel: e.target.value })} /></label>
          <label className="wide"><span>무료 주소 끝부분</span><div className="slug-input"><em>/launch/</em><input value={draft.slug} onChange={(e) => update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></div></label>
        </div>
      </Fold>

      {/* 3. 도메인 — 접이식. 카드 안의 자체 제목은 CSS 로 숨긴다(요약 줄과 중복) */}
      <Fold
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
        icon={<Inbox size={18} />}
        title="접수된 문의"
        badge={leads && leads.length > 0 ? <em className="hk-badge hk-badge-info">{leads.length}건</em> : <em className="hk-badge">0건</em>}
        hint={draft.leadCaptureEnabled ? "홈페이지 문의 양식으로 들어온 것입니다. 보유기간이 지나면 지워 주세요." : "문의 양식이 꺼져 있습니다. 사업자 정보에서 켜면 접수됩니다."}
      >
        {leads === null ? <p className="hk-empty">불러오는 중…</p> : leads.length === 0 ? <p className="hk-empty">아직 접수된 문의가 없습니다. 공개 주소를 알리면 여기 쌓입니다.</p> : (
          <ul className="hk-leads">
            {leads.map((lead) => (
              <li key={lead.id}>
                <i>{lead.name.slice(0, 1)}</i>
                <div>
                  <strong>{lead.name}</strong>
                  <span>{[lead.phone, lead.email].filter(Boolean).join(" · ")}</span>
                  {lead.message ? <p>{lead.message}</p> : null}
                  <small>{new Date(lead.createdAt).toLocaleString("ko-KR")}{lead.marketingAgreed ? " · 홍보 수신 동의" : ""}</small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Fold>
    </section>
  );
}
