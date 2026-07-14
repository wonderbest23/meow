"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Boxes,
  Check,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Users,
  Wrench,
} from "lucide-react";
import type {
  OperationsAssessment,
  OperationsPackage,
  OperationsWorkspace,
  SupplierQuote,
} from "../lib/operations/domain";
import { assessOperations } from "../lib/operations/engine";
import type { ProjectRecord } from "../lib/service-domain";
import { downloadBusinessDocuments } from "../lib/delivery/client-download";

type Tab = "overview" | "procurement" | "sop" | "checklist" | "policy";

const assetCategoryLabels: Record<OperationsWorkspace["assets"][number]["category"], string> = {
  initial_inventory: "첫 판매용 재고",
  equipment: "장비",
  software: "업무 도구",
  safety: "안전 용품",
  office: "사무 용품",
  packaging: "포장재",
};

const checklistCategoryLabels: Record<OperationsWorkspace["openingChecklist"][number]["category"], string> = {
  registration: "사업자 등록",
  permit: "인허가",
  location: "사업장",
  finance: "자금·결제",
  supplier: "공급처",
  safety: "안전",
  labor: "채용·근로",
  customer: "고객 응대",
  privacy: "개인정보",
  launch: "영업 시작",
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function won(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

export function OperationsPanel({
  project,
  onSaved,
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord) => void;
}) {
  const [workspace, setWorkspace] = useState<OperationsWorkspace | null>(project.operationsWorkspace);
  const [assessment, setAssessment] = useState<OperationsAssessment | null>(project.operationsAssessment);
  const [operationsPackage, setOperationsPackage] = useState<OperationsPackage | null>(project.operationsPackage);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState<"loading" | "saving" | "idle">("loading");
  const [message, setMessage] = useState("");
  const [quote, setQuote] = useState({
    supplierName: "",
    itemName: "",
    unitPrice: 0,
    minimumOrderQuantity: 1,
    leadTimeDays: 0,
    sourceUrl: "",
  });

  useEffect(() => {
    async function load() {
      setBusy("loading");
      try {
        const response = await fetch(`/api/projects/${project.id}/operations`, { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "운영 준비 정보를 불러오지 못했습니다.");
        setWorkspace(payload.workspace);
        setAssessment(payload.assessment);
        setOperationsPackage(payload.operationsPackage);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "운영 준비 정보를 불러오지 못했습니다.");
      } finally {
        setBusy("idle");
      }
    }
    void load();
  }, [project.id]);

  const preview = useMemo(
    () => workspace ? assessOperations(workspace) : assessment,
    [workspace, assessment],
  );

  const save = async () => {
    if (!workspace) return;
    setBusy("saving");
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${project.id}/operations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workspace),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "운영 준비 정보를 저장하지 못했습니다.");
      setWorkspace(payload.workspace);
      setAssessment(payload.assessment);
      setOperationsPackage(payload.operationsPackage);
      onSaved(payload.project);
      setMessage("운영 준비 상태와 실행 문서를 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setBusy("idle");
    }
  };

  const addQuote = () => {
    if (!workspace || !quote.supplierName.trim() || !quote.itemName.trim()) {
      setMessage("공급처와 품목을 입력해주세요.");
      return;
    }
    const record: SupplierQuote = {
      id: crypto.randomUUID(),
      category: "inventory",
      supplierName: quote.supplierName,
      itemName: quote.itemName,
      unitPrice: quote.unitPrice,
      minimumOrderQuantity: quote.minimumOrderQuantity,
      shippingCost: 0,
      leadTimeDays: quote.leadTimeDays,
      sourceUrl: quote.sourceUrl,
      quotedAt: quote.sourceUrl ? today() : "",
      status: quote.sourceUrl ? "verified" : "in_progress",
      note: "",
    };
    setWorkspace({ ...workspace, supplierQuotes: [...workspace.supplierQuotes, record] });
    setQuote({ supplierName: "", itemName: "", unitPrice: 0, minimumOrderQuantity: 1, leadTimeDays: 0, sourceUrl: "" });
  };

  const download = async () => {
    if (!operationsPackage) return;
    try {
      await downloadBusinessDocuments({
        format: "pdf",
        project: {
          title: project.title,
          sector: String(project.opportunity.sector ?? ""),
          model: String(project.opportunity.model ?? ""),
          customer: String(project.opportunity.customer ?? ""),
          generatedAt: operationsPackage.generatedAt,
          sample: false,
        },
        documents: [{ id: "operations", title: operationsPackage.title, type: "운영 준비와 실행 절차", versionLabel: "서버 생성본", markdown: operationsPackage.markdown }],
      });
      setMessage("운영 문서 인쇄용 파일(PDF)을 만들었습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "운영 문서를 만들지 못했습니다.");
    }
  };

  if (!workspace || !preview) {
    return <section className="operations-panel loading"><LoaderCircle className="spin" /><p>{message || "사업 유형에 맞는 운영 준비 항목을 만들고 있습니다."}</p></section>;
  }

  return (
    <section className="operations-panel">
      <header>
        <div><span><ClipboardCheck /></span><div><small>1단계 · 영업 준비</small><h3>실제 영업을 위한 운영 준비 문서</h3><p>견적, 장비, 보험, 근로, 고객 응대, 업무 절차를 계약서·영수증 같은 확인 자료와 함께 준비합니다.</p></div></div>
        <em className={preview.hardBlockers.length ? "blocked" : "ready"}>{preview.hardBlockers.length ? `해결 필요 ${preview.hardBlockers.length}개` : <><Check /> 영업 시작 준비 완료</>}</em>
      </header>

      <div className="operations-score">
        <article><small>운영 준비도</small><strong>{preview.readinessScore}%</strong><span>확인 자료 기준</span></article>
        <article><small>필수 검증</small><strong>{preview.verifiedRequiredCount}/{preview.requiredCount}</strong><span>완료/전체</span></article>
        <article><small>예상 조달비</small><strong>{won(preview.estimatedProcurementCost)}</strong><span>직접 입력 기준</span></article>
        <article><small>검증 견적</small><strong>{won(preview.verifiedQuoteCost)}</strong><span>원문 확인 기준</span></article>
      </div>

      <nav className="operations-tabs">
        <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}><ShieldCheck /> 판정</button>
        <button className={tab === "procurement" ? "active" : ""} onClick={() => setTab("procurement")}><Boxes /> 조달·장비</button>
        <button className={tab === "sop" ? "active" : ""} onClick={() => setTab("sop")}><FileText /> 업무 절차</button>
        <button className={tab === "checklist" ? "active" : ""} onClick={() => setTab("checklist")}><ClipboardCheck /> 영업 시작 확인</button>
        <button className={tab === "policy" ? "active" : ""} onClick={() => setTab("policy")}><Users /> 고객 응대·근로</button>
      </nav>

      {message && <div className="operations-message" role="status">{message}</div>}

      {tab === "overview" && (
        <div className="operations-body">
          {preview.hardBlockers.length > 0 ? <div className="operation-blockers"><header><AlertTriangle /><div><strong>아직 영업 시작을 권할 수 없습니다</strong><p>필수 항목은 계약서·영수증 같은 확인 자료의 인터넷 주소까지 저장해야 완료로 계산합니다.</p></div></header>{preview.hardBlockers.map((blocker) => <article key={blocker.id}><span>필수</span><div><strong>{blocker.title}</strong><p>{blocker.reason}</p></div></article>)}</div> : <div className="operation-ready"><Check /><h4>필수 운영 조건을 통과했습니다</h4><p>실제 영업 시작 직전 최신 확인 자료와 현장 상태를 다시 살펴보세요.</p></div>}
          {preview.warnings.length > 0 && <div className="operation-warnings"><strong>자동 점검 경고</strong>{preview.warnings.map((warning) => <p key={warning}>• {warning}</p>)}</div>}
          <div className="operation-next-actions">
            <button onClick={() => setTab("procurement")}><span><Boxes /></span><div><strong>실제 견적 입력</strong><p>공급처 가격과 납기를 원문으로 확인합니다.</p></div></button>
            <button onClick={() => setTab("sop")}><span><Wrench /></span><div><strong>업무 미리 연습</strong><p>업무 절차를 직접 실행하고 결과 확인 자료를 남깁니다.</p></div></button>
            <button onClick={() => setTab("checklist")}><span><ClipboardCheck /></span><div><strong>영업 전 문제 해결</strong><p>등록·인허가·안전 항목을 확인합니다.</p></div></button>
          </div>
        </div>
      )}

      {tab === "procurement" && (
        <div className="operations-body">
          <div className="operation-section-heading"><div><strong>공급처 견적</strong><p>가격만 보지 말고 최소주문수량과 납기를 함께 기록합니다.</p></div><span>{workspace.supplierQuotes.length}건</span></div>
          <div className="quote-form">
            <label><span>공급처</span><input value={quote.supplierName} onChange={(event) => setQuote({ ...quote, supplierName: event.target.value })} placeholder="업체명" /></label>
            <label><span>품목</span><input value={quote.itemName} onChange={(event) => setQuote({ ...quote, itemName: event.target.value })} placeholder="상품·장비명" /></label>
            <label><span>단가</span><input type="number" min="0" value={quote.unitPrice} onChange={(event) => setQuote({ ...quote, unitPrice: Number(event.target.value) || 0 })} /></label>
            <label><span>최소수량</span><input type="number" min="1" value={quote.minimumOrderQuantity} onChange={(event) => setQuote({ ...quote, minimumOrderQuantity: Math.max(1, Number(event.target.value) || 1) })} /></label>
            <label><span>납기(일)</span><input type="number" min="0" value={quote.leadTimeDays} onChange={(event) => setQuote({ ...quote, leadTimeDays: Number(event.target.value) || 0 })} /></label>
            <label className="wide"><span>견적 원문 인터넷 주소</span><input type="url" value={quote.sourceUrl} onChange={(event) => setQuote({ ...quote, sourceUrl: event.target.value })} placeholder="견적서 파일 또는 업체 견적 페이지 주소" /></label>
            <button onClick={addQuote}><Plus /> 견적 추가</button>
          </div>
          <div className="quote-list">{workspace.supplierQuotes.map((entry) => <article key={entry.id}><span className={entry.status}>{entry.status === "verified" ? "원문 확인" : "확인 중"}</span><div><strong>{entry.supplierName} · {entry.itemName}</strong><p>{won(entry.unitPrice)} × 최소 {entry.minimumOrderQuantity}개 · 납기 {entry.leadTimeDays}일</p></div>{entry.sourceUrl && <a href={entry.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink /></a>}<button aria-label="견적 삭제" onClick={() => setWorkspace({ ...workspace, supplierQuotes: workspace.supplierQuotes.filter((quoteItem) => quoteItem.id !== entry.id) })}><Trash2 /></button></article>)}{!workspace.supplierQuotes.length && <p className="operation-empty">실제 공급처 견적이 아직 없습니다.</p>}</div>

          <div className="operation-section-heading assets-heading"><div><strong>재고·장비·도구</strong><p>0원은 아직 견적을 넣지 않은 상태입니다.</p></div><span>{workspace.assets.length}개</span></div>
          <div className="asset-list">{workspace.assets.map((entry, index) => <article key={entry.id}><div><small>{assetCategoryLabels[entry.category]}</small><strong>{entry.name}</strong></div><label><span>수량</span><input type="number" min="1" value={entry.quantity} onChange={(event) => setWorkspace({ ...workspace, assets: workspace.assets.map((assetItem, itemIndex) => itemIndex === index ? { ...assetItem, quantity: Math.max(1, Number(event.target.value) || 1) } : assetItem) })} /></label><label><span>예상 단가</span><input type="number" min="0" value={entry.estimatedUnitCost} onChange={(event) => setWorkspace({ ...workspace, assets: workspace.assets.map((assetItem, itemIndex) => itemIndex === index ? { ...assetItem, estimatedUnitCost: Number(event.target.value) || 0 } : assetItem) })} /></label><select value={entry.status} onChange={(event) => setWorkspace({ ...workspace, assets: workspace.assets.map((assetItem, itemIndex) => itemIndex === index ? { ...assetItem, status: event.target.value as typeof entry.status } : assetItem) })}><option value="not_started">미준비</option><option value="in_progress">준비 중</option><option value="blocked">막힘</option><option value="verified">확인 자료 완료</option></select><input className="asset-evidence" type="url" value={entry.evidenceUrl} onChange={(event) => setWorkspace({ ...workspace, assets: workspace.assets.map((assetItem, itemIndex) => itemIndex === index ? { ...assetItem, evidenceUrl: event.target.value } : assetItem) })} placeholder="영수증·계약서 파일 주소" /></article>)}</div>
        </div>
      )}

      {tab === "sop" && (
        <div className="operations-body">
          <div className="operation-section-heading"><div><strong>표준 업무 절차</strong><p>문서가 있는 것과 실제로 해본 것은 다릅니다. 미리 연습한 결과의 인터넷 주소를 남겨야 완료됩니다.</p></div><span>{workspace.sops.length}개</span></div>
          <div className="sop-list">{workspace.sops.map((entry, index) => <details key={entry.id} open={index === 0}><summary><span className={entry.status}>{entry.status === "verified" ? <Check /> : index + 1}</span><div><strong>{entry.title}</strong><small>{entry.trigger} · {entry.ownerRole}</small></div><em>{entry.status === "verified" ? "연습 완료" : "확인 필요"}</em></summary><div><ol>{entry.steps.map((step) => <li key={step}>{step}</li>)}</ol><p><strong>실패 시:</strong> {entry.failureResponse}</p><div className="sop-actions"><select value={entry.status} onChange={(event) => setWorkspace({ ...workspace, sops: workspace.sops.map((sopItem, itemIndex) => itemIndex === index ? { ...sopItem, status: event.target.value as typeof entry.status } : sopItem) })}><option value="not_started">미실행</option><option value="in_progress">연습 중</option><option value="blocked">문제 발견</option><option value="verified">연습 완료</option></select><input type="url" value={entry.evidenceUrl} onChange={(event) => setWorkspace({ ...workspace, sops: workspace.sops.map((sopItem, itemIndex) => itemIndex === index ? { ...sopItem, evidenceUrl: event.target.value } : sopItem) })} placeholder="실행 기록 또는 결과 파일 주소" /></div></div></details>)}</div>
        </div>
      )}

      {tab === "checklist" && (
        <div className="operations-body">
          <div className="operation-section-heading"><div><strong>영업 시작 전 필수 확인</strong><p>완료 선택만으로는 통과되지 않습니다. 필수 항목에는 계약서·신고서 같은 확인 자료의 인터넷 주소가 필요합니다.</p></div><span>{workspace.openingChecklist.length}개</span></div>
          <div className="opening-check-list">{workspace.openingChecklist.map((entry, index) => <article key={entry.id} className={entry.status}><span>{entry.status === "verified" ? <Check /> : entry.required ? "필수" : "권고"}</span><div><small>{checklistCategoryLabels[entry.category]}</small><strong>{entry.title}</strong><p>{entry.reason}</p>{entry.officialUrl && <a href={entry.officialUrl} target="_blank" rel="noreferrer">공식 안내 <ExternalLink /></a>}</div><select value={entry.status} onChange={(event) => setWorkspace({ ...workspace, openingChecklist: workspace.openingChecklist.map((checkItem, itemIndex) => itemIndex === index ? { ...checkItem, status: event.target.value as typeof entry.status } : checkItem) })}><option value="not_started">미확인</option><option value="in_progress">확인 중</option><option value="blocked">진행 막힘</option><option value="verified">확인 자료 완료</option></select><input type="url" value={entry.evidenceUrl} onChange={(event) => setWorkspace({ ...workspace, openingChecklist: workspace.openingChecklist.map((checkItem, itemIndex) => itemIndex === index ? { ...checkItem, evidenceUrl: event.target.value } : checkItem) })} placeholder="예: 신고서 파일 또는 확인한 공식 주소" /></article>)}</div>
        </div>
      )}

      {tab === "policy" && (
        <div className="operations-body">
          <div className="operation-section-heading"><div><strong>고객응대·환불 기준</strong><p>사이트에 게시할 내용과 실제 처리 절차가 같아야 합니다.</p></div></div>
          <div className="operation-policy-form">
            <label><span>고객 문의 방법</span><input value={workspace.policies.customerSupportChannel} onChange={(event) => setWorkspace({ ...workspace, policies: { ...workspace.policies, customerSupportChannel: event.target.value } })} placeholder="예: 02-1234-5678, 카카오톡 상담창구, help@example.com" /></label>
            <label><span>응답 목표(시간)</span><input type="number" min="1" value={workspace.policies.responseTimeHours} onChange={(event) => setWorkspace({ ...workspace, policies: { ...workspace.policies, responseTimeHours: Math.max(1, Number(event.target.value) || 1) } })} /></label>
            <label className="wide"><span>취소·환불정책</span><textarea value={workspace.policies.refundPolicy} onChange={(event) => setWorkspace({ ...workspace, policies: { ...workspace.policies, refundPolicy: event.target.value } })} /></label>
            <label className="wide"><span>불만·분쟁 처리 단계</span><textarea value={workspace.policies.complaintEscalation} onChange={(event) => setWorkspace({ ...workspace, policies: { ...workspace.policies, complaintEscalation: event.target.value } })} placeholder="예: 담당자 확인 → 대표자 검토 → 환불 또는 재제공 안내" /></label>
            <label><span>개인정보 요청 방법</span><input value={workspace.policies.privacyRequestChannel} onChange={(event) => setWorkspace({ ...workspace, policies: { ...workspace.policies, privacyRequestChannel: event.target.value } })} placeholder="예: privacy@example.com 이메일" /></label>
            <label><span>사고 비상 연락처</span><input value={workspace.policies.incidentContact} onChange={(event) => setWorkspace({ ...workspace, policies: { ...workspace.policies, incidentContact: event.target.value } })} /></label>
          </div>

          <div className="operation-section-heading labor-heading"><div><strong>채용·급여 준비</strong><p>직원이 없다면 자동 통과하며, 채용 계획이 있으면 근로계약서 같은 확인 자료까지 살펴봅니다.</p></div><span>{workspace.labor.plannedWorkerCount}명</span></div>
          <div className="labor-check-grid">{[
            ["writtenContractPrepared", "서면 근로계약"],
            ["wageAndHoursConfirmed", "임금·근로시간"],
            ["insuranceReviewed", "4대보험 적용"],
            ["payrollProcessTested", "급여 지급 예행연습"],
          ].map(([key, label]) => <label key={key}><input type="checkbox" checked={Boolean(workspace.labor[key as keyof typeof workspace.labor])} onChange={(event) => setWorkspace({ ...workspace, labor: { ...workspace.labor, [key]: event.target.checked } })} /><span><Check /> {label}</span></label>)}</div>
          {workspace.labor.plannedWorkerCount > 0 && <input className="labor-evidence" type="url" value={workspace.labor.evidenceUrl} onChange={(event) => setWorkspace({ ...workspace, labor: { ...workspace.labor, evidenceUrl: event.target.value } })} placeholder="근로계약·급여 연습 확인 파일 주소" />}

          <div className="operation-section-heading insurance-heading"><div><strong>보험·위험 검토</strong><p>가입 필요성은 업종·시설·고용 조건에 따라 보험사와 공식 기관에서 확인합니다.</p></div></div>
          <div className="insurance-list">{workspace.insurance.map((entry, index) => <article key={entry.id}><span><ShieldCheck /></span><div><strong>{entry.name}{entry.required && <em>필수 확인</em>}</strong><p>{entry.reason}</p><a href={entry.officialUrl} target="_blank" rel="noreferrer">금융감독원·공식 안내 <ExternalLink /></a></div><select value={entry.status} onChange={(event) => setWorkspace({ ...workspace, insurance: workspace.insurance.map((insuranceItem, itemIndex) => itemIndex === index ? { ...insuranceItem, status: event.target.value as typeof entry.status } : insuranceItem) })}><option value="not_started">미확인</option><option value="in_progress">상담 중</option><option value="blocked">가입 문제</option><option value="verified">확인 완료</option></select><input type="url" value={entry.evidenceUrl} onChange={(event) => setWorkspace({ ...workspace, insurance: workspace.insurance.map((insuranceItem, itemIndex) => itemIndex === index ? { ...insuranceItem, evidenceUrl: event.target.value } : insuranceItem) })} placeholder="보험 상담 기록 또는 가입 파일 주소" /></article>)}</div>
        </div>
      )}

      <footer className="operations-footer">
        <div><strong>확인 자료 없는 완료는 막습니다</strong><span>저장할 때 모든 상태를 다시 검사합니다.</span></div>
        <button disabled={!operationsPackage} onClick={() => void download()}><Download /> 운영 문서 인쇄용 파일(PDF)</button>
        <button className="save-operations" disabled={busy !== "idle"} onClick={save}>{busy === "saving" ? <LoaderCircle className="spin" /> : <Save />} 운영 준비 저장</button>
      </footer>
    </section>
  );
}
