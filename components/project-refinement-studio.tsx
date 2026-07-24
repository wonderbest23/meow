"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileCheck2,
  History,
  LoaderCircle,
  RefreshCw,
  Search,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { DraftRefinementInput, ProjectRefinementVersion } from "../lib/draft-package/domain";
import type { MarketEvidence } from "../lib/market/domain";
import { refinementChanges } from "../lib/refinement/domain";

type ReviewSuggestion = {
  field: "brandName" | "customer" | "oneLiner";
  value: string;
  reason: string;
};

type ReviewResult = {
  summary: string;
  suggestions: ReviewSuggestion[];
  warnings: string[];
};

const steps = ["핵심 내용", "가격과 비용", "시장 근거", "검토하고 적용"];
const fieldNames: Record<ReviewSuggestion["field"], string> = {
  brandName: "사업 이름",
  customer: "주요 고객",
  oneLiner: "한 줄 소개",
};

function money(value: number) {
  return Math.max(0, Math.round(value)).toLocaleString("ko-KR");
}

function numberFromInput(value: string) {
  return Math.max(0, Number(value.replace(/[^0-9]/g, "")) || 0);
}

function MoneyInput({
  label,
  value,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  hint: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="refinement-money-field">
      <span>{label}</span>
      <div><input inputMode="numeric" value={money(value)} onChange={(event) => onChange(numberFromInput(event.target.value))} /><em>원</em></div>
      <small>{hint}</small>
    </label>
  );
}

export function ProjectRefinementStudio({
  projectId,
  initialInput,
  history,
  evidence,
  marketResearching,
  marketMessage,
  onResearchMarket,
  onApply,
}: {
  projectId: string;
  initialInput: DraftRefinementInput;
  history: ProjectRefinementVersion[];
  evidence: MarketEvidence[];
  marketResearching: boolean;
  marketMessage: string;
  onResearchMarket: () => Promise<void>;
  onApply: (input: DraftRefinementInput, source?: "edit" | "restore") => Promise<void>;
}) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(initialInput);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [loadedVersion, setLoadedVersion] = useState<ProjectRefinementVersion | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);
  useEffect(() => {
    if (!open) setDraft(initialInput);
  }, [initialInput, open]);

  const changes = useMemo(() => refinementChanges(initialInput, draft), [draft, initialInput]);
  const valid = draft.brandName.trim().length >= 2
    && draft.customer.trim().length >= 2
    && draft.oneLiner.trim().length >= 10
    && draft.priceWon >= 1_000
    && draft.region.trim().length >= 2;
  const evidenceSorted = [...evidence].sort((a, b) => b.observedAt.localeCompare(a.observedAt));
  const verifiedCount = evidence.filter((item) => item.verification === "verified").length;

  const update = (value: Partial<DraftRefinementInput>) => {
    setDraft((current) => ({ ...current, ...value }));
    setReview(null);
    setReviewMessage("");
    setLoadedVersion(null);
  };

  const openStudio = () => {
    setDraft(initialInput);
    setStep(0);
    setReview(null);
    setReviewMessage("");
    setLoadedVersion(null);
    setOpen(true);
  };

  const requestReview = async () => {
    setReviewing(true);
    setReviewMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/refinements/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "전체 내용을 검토하지 못했습니다.");
      setReview(payload.review as ReviewResult);
      setReviewMessage(`${payload.model ?? "인공지능"} 검토가 끝났습니다.`);
    } catch (error) {
      setReviewMessage(error instanceof Error ? error.message : "전체 내용을 검토하지 못했습니다.");
    } finally {
      setReviewing(false);
    }
  };

  const applySuggestion = (suggestion: ReviewSuggestion) => {
    update({ [suggestion.field]: suggestion.value });
    setReview((current) => current ? {
      ...current,
      suggestions: current.suggestions.filter((item) => item !== suggestion),
    } : current);
  };

  const loadVersion = (version: ProjectRefinementVersion) => {
    setDraft({ ...version.input, note: "" });
    setLoadedVersion(version);
    setReview(null);
    setReviewMessage(`${version.label} 내용을 불러왔습니다. 아래 변경 내용을 확인한 뒤 적용하세요.`);
  };

  const apply = async () => {
    if (!valid || changes.length === 0) return;
    await onApply(draft, loadedVersion ? "restore" : "edit");
  };

  const modal = open ? (
    <div className="refinement-studio-overlay" role="dialog" aria-modal="true" aria-labelledby="refinement-studio-title">
      <section className="refinement-studio">
        <header className="refinement-studio-header">
          <div><small>전체 결과 한 번에 수정</small><h2 id="refinement-studio-title">사업 내용 편집실</h2><p>4단계만 확인하면 모든 결과물이 같은 내용으로 다시 만들어집니다.</p></div>
          <button onClick={() => setOpen(false)} aria-label="편집실 닫기">닫기</button>
        </header>
        <nav className="refinement-progress" aria-label="수정 진행 단계">
          {steps.map((label, index) => <button key={label} className={`${index === step ? "active" : ""} ${index < step ? "done" : ""}`} onClick={() => index <= step && setStep(index)} aria-current={index === step ? "step" : undefined}><i>{index < step ? <Check /> : index + 1}</i><span>{label}</span></button>)}
        </nav>

        <div className="refinement-studio-body">
          {step === 0 && <section className="refinement-step">
            <header><small>1 / 4</small><h3>고객에게 보여줄 핵심 내용</h3><p>이미 만들어진 초안을 넣어두었습니다. 틀린 부분만 고치면 됩니다.</p></header>
            <div className="refinement-fields">
              <label><span>사업 이름</span><input autoFocus value={draft.brandName} maxLength={100} onChange={(event) => update({ brandName: event.target.value })} /><small>판매 페이지와 모든 문서 표지에 사용됩니다.</small></label>
              <label><span>사업 지역</span><input value={draft.region} maxLength={100} onChange={(event) => update({ region: event.target.value })} /><small>온라인 전국 사업이면 ‘전국·온라인’으로 적어도 됩니다.</small></label>
              <label className="wide"><span>주요 고객</span><textarea value={draft.customer} maxLength={300} rows={3} onChange={(event) => update({ customer: event.target.value })} /><small>누가, 어떤 상황에서 구매하는지 한 문장으로 적습니다.</small></label>
              <label className="wide"><span>한 줄 소개</span><textarea value={draft.oneLiner} maxLength={1000} rows={4} onChange={(event) => update({ oneLiner: event.target.value })} /><small>{draft.oneLiner.length}자 · 구체적인 고객과 결과가 보이면 충분합니다.</small></label>
            </div>
          </section>}

          {step === 1 && <section className="refinement-step">
            <header><small>2 / 4</small><h3>가격과 비용 확인</h3><p>현재 초안의 계산값입니다. 모르면 그대로 두고 나중에 실제 견적으로 바꿔도 됩니다.</p></header>
            <div className="refinement-money-grid">
              <MoneyInput label="첫 상품 가격" value={draft.priceWon} onChange={(priceWon) => update({ priceWon })} hint="고객 한 명 또는 한 건이 결제하는 금액" />
              <MoneyInput label="한 건당 변동비" value={draft.variableCostPerUnit} onChange={(variableCostPerUnit) => update({ variableCostPerUnit })} hint="재료, 외주, 결제 수수료처럼 판매할 때 드는 비용" />
              <MoneyInput label="월 고정비" value={draft.monthlyFixedCostWon} onChange={(monthlyFixedCostWon) => update({ monthlyFixedCostWon })} hint="임대료, 소프트웨어, 광고처럼 매달 드는 비용" />
              <label className="refinement-money-field"><span>월 목표 판매량</span><div><input inputMode="numeric" value={money(draft.targetMonthlyUnits)} onChange={(event) => update({ targetMonthlyUnits: numberFromInput(event.target.value) })} /><em>건</em></div><small>처음 3개월에 현실적으로 처리할 수 있는 수량</small></label>
            </div>
            <div className="refinement-finance-check">
              <span><small>한 건 판매 후 남는 금액</small><strong>{Math.max(0, draft.priceWon - draft.variableCostPerUnit).toLocaleString("ko-KR")}원</strong></span>
              <span><small>월 예상 매출</small><strong>{(draft.priceWon * draft.targetMonthlyUnits).toLocaleString("ko-KR")}원</strong></span>
              <span><small>월 예상 손익</small><strong className={(draft.priceWon - draft.variableCostPerUnit) * draft.targetMonthlyUnits - draft.monthlyFixedCostWon < 0 ? "negative" : ""}>{((draft.priceWon - draft.variableCostPerUnit) * draft.targetMonthlyUnits - draft.monthlyFixedCostWon).toLocaleString("ko-KR")}원</strong></span>
            </div>
          </section>}

          {step === 2 && <section className="refinement-step">
            <header><small>3 / 4</small><h3>시장 근거 확인</h3><p>출처 없는 숫자는 만들지 않습니다. 공식 원문을 찾거나, 현재 근거로 계속 진행할 수 있습니다.</p></header>
            <div className="refinement-evidence-summary"><span><FileCheck2 /><b>{evidence.length}</b><small>저장된 근거</small></span><span><CheckCircle2 /><b>{verifiedCount}</b><small>공식 확인</small></span><button disabled={marketResearching} onClick={() => void onResearchMarket()}>{marketResearching ? <><LoaderCircle className="spin" /> 찾는 중</> : <><Search /> 공식 근거 더 찾기</>}</button></div>
            {marketMessage && <p className="refinement-status-message"><CircleHelp /> {marketMessage}</p>}
            <div className="refinement-evidence-list">
              {evidenceSorted.length > 0 ? evidenceSorted.slice(0, 6).map((item) => <article key={item.id}><span>{item.verification === "verified" ? <CheckCircle2 /> : <Clock3 />}</span><div><strong>{item.title}</strong><p>{item.metric}: {item.value}</p><small>{item.sourceName} · {item.observedAt}</small></div>{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer">원문</a>}</article>) : <div className="refinement-empty-evidence"><Search /><strong>저장된 시장 출처가 아직 없습니다.</strong><p>공식 근거 찾기를 실행하지 않아도 초안 수정은 가능하지만, 시장 숫자는 확인 필요 상태로 표시됩니다.</p></div>}
            </div>
            <label className="refinement-note"><span>전체 문서에 추가로 요청할 내용 <em>선택</em></span><textarea value={draft.note} maxLength={1000} rows={4} onChange={(event) => update({ note: event.target.value })} placeholder="예: 전문용어를 줄이고 직장인 고객이 이해하기 쉽게 써주세요." /></label>
          </section>}

          {step === 3 && <section className="refinement-step review-step">
            <header><small>4 / 4</small><h3>바뀌는 내용을 확인하세요</h3><p>적용하면 문서 10종, 발표자료 2종, 손익 엑셀과 판매 페이지가 같은 정보로 다시 만들어집니다.</p></header>
            <div className="refinement-review-layout">
              <section className="refinement-diff-panel"><header><div><RefreshCw /><span><strong>변경 전후</strong><small>{changes.length}개 항목 변경</small></span></div></header>{changes.length > 0 ? <div>{changes.map((change) => <article key={change.key}><strong>{change.label}</strong><p><del>{change.before}</del><ChevronRight /><ins>{change.after}</ins></p></article>)}</div> : <div className="refinement-no-change"><CheckCircle2 /><strong>바뀐 내용이 없습니다.</strong><p>앞 단계에서 필요한 항목만 수정하세요.</p></div>}</section>
              <section className="refinement-ai-review"><header><div><WandSparkles /><span><strong>인공지능 최종 검토</strong><small>허구의 사실은 추가하지 않고 문장과 숫자 충돌만 확인합니다.</small></span></div><button disabled={reviewing} onClick={() => void requestReview()}>{reviewing ? <><LoaderCircle className="spin" /> 검토 중</> : <><Sparkles /> 검토하기</>}</button></header>{reviewMessage && <p className="refinement-status-message">{reviewMessage}</p>}{review && <div className="refinement-review-result"><p>{review.summary}</p>{review.warnings.map((warning) => <div className="warning" key={warning}><CircleHelp /><span>{warning}</span></div>)}{review.suggestions.map((suggestion) => <article key={`${suggestion.field}-${suggestion.value}`}><small>{fieldNames[suggestion.field]} 제안</small><strong>{suggestion.value}</strong><p>{suggestion.reason}</p><button onClick={() => applySuggestion(suggestion)}><Check /> 이 문장 적용</button></article>)}</div>}</section>
            </div>
            {history.length > 0 && <section className="refinement-history"><header><History /><div><strong>이전 수정 기록</strong><small>이전 판을 불러온 뒤 변경 전후를 확인하고 다시 적용할 수 있습니다.</small></div></header><div>{[...history].reverse().slice(0, 5).map((version) => <button key={version.id} className={loadedVersion?.id === version.id ? "active" : ""} onClick={() => loadVersion(version)}><span><strong>{version.label}</strong><small>{new Date(version.createdAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · {version.changes.length}개 변경</small></span><em className={version.status}>{version.status === "processing" ? "제작 중" : version.status === "failed" ? "확인 필요" : "적용됨"}</em><ChevronRight /></button>)}</div></section>}
          </section>}
        </div>

        <footer className="refinement-studio-footer">
          <button className="back" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}><ArrowLeft /> 이전</button>
          <span><i style={{ width: `${((step + 1) / steps.length) * 100}%` }} /></span>
          {step < steps.length - 1
            ? <button className="next" disabled={step === 0 && !valid} onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}>다음 <ArrowRight /></button>
            : <button className="apply" disabled={!valid || changes.length === 0} onClick={() => void apply()}><RefreshCw /> 전체 결과에 적용</button>}
        </footer>
      </section>
    </div>
  ) : null;

  return (
    <>
      <section className="refinement-launch-card">
        <div><span><Sparkles /></span><div><small>초안은 이미 완성됐어요</small><strong>사업 내용을 한 번에 수정하세요</strong><p>한 곳에서 바꾸면 문서, 발표자료, 엑셀과 판매 페이지에 함께 반영됩니다.</p></div></div>
        <button onClick={openStudio}>전체 내용 수정 <ArrowRight /></button>
      </section>
      {mounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
