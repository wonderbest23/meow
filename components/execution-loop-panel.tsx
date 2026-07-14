"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  CircleDollarSign,
  FlaskConical,
  LoaderCircle,
  Plus,
  RefreshCcw,
  Save,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import type {
  ExecutionExperiment,
  ExecutionLoopAnalysis,
  ExecutionWorkspace,
} from "../lib/execution-loop/domain";
import { analyzeExecutionLoop } from "../lib/execution-loop/engine";
import type { ProjectRecord } from "../lib/service-domain";

type Tab = "dashboard" | "experiments" | "hypotheses";

const channelLabels: Record<ExecutionExperiment["channel"], string> = {
  direct: "직접 제안",
  referral: "소개",
  community: "커뮤니티",
  blog: "블로그",
  social: "사회관계망",
  search_ad: "검색광고",
  display_ad: "디스플레이광고",
  offline: "오프라인",
  partner: "제휴",
  landing: "판매 페이지",
};

const hypothesisCategoryLabels: Record<ExecutionWorkspace["hypotheses"][number]["category"], string> = {
  customer: "고객",
  problem: "고객 문제",
  channel: "고객을 만나는 경로",
  price: "가격",
};

const metricFields = [
  ["reached", "직접 도달", "명"],
  ["impressions", "광고 노출", "회"],
  ["clicks", "클릭", "회"],
  ["landingVisitors", "판매 페이지 방문", "명"],
  ["inquiries", "문의", "건"],
  ["interviews", "인터뷰", "건"],
  ["proposals", "가격 제안", "건"],
  ["purchases", "구매", "건"],
  ["refunds", "환불", "건"],
  ["revenue", "매출", "원"],
  ["refundAmount", "환불액", "원"],
  ["adSpend", "광고·획득비", "원"],
  ["variableCost", "실제 변동비", "원"],
] as const;

function emptyExperiment(): ExecutionExperiment {
  return {
    id: crypto.randomUUID(),
    name: "",
    type: "outreach",
    channel: "direct",
    startedAt: new Date().toISOString().slice(0, 10),
    endedAt: "",
    status: "running",
    metrics: {
      reached: 0,
      impressions: 0,
      clicks: 0,
      landingVisitors: 0,
      inquiries: 0,
      interviews: 0,
      proposals: 0,
      purchases: 0,
      refunds: 0,
      refundAmount: 0,
      revenue: 0,
      adSpend: 0,
      variableCost: 0,
    },
    evidenceUrl: "",
    learning: "",
  };
}

function value(value: number | null, suffix = "") {
  return value === null ? "표본 부족" : `${value.toLocaleString("ko-KR")}${suffix}`;
}

export function ExecutionLoopPanel({
  project,
  onSaved,
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord) => void;
}) {
  const [workspace, setWorkspace] = useState<ExecutionWorkspace | null>(project.executionWorkspace);
  const [serverAnalysis, setServerAnalysis] = useState<ExecutionLoopAnalysis | null>(project.executionAnalysis);
  const [automaticLanding, setAutomaticLanding] = useState<{ status: string; pageViews?: number; ctaClicks?: number; leads?: number; slug?: string } | null>(null);
  const [experiment, setExperiment] = useState<ExecutionExperiment>(emptyExperiment);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [busy, setBusy] = useState<"loading" | "saving" | "idle">("loading");
  const [message, setMessage] = useState("");

  const load = async () => {
    setBusy("loading");
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${project.id}/execution-loop`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "실행 결과를 불러오지 못했습니다.");
      setWorkspace(payload.workspace);
      setServerAnalysis(payload.analysis);
      setAutomaticLanding(payload.automaticSources.landing);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "실행 결과를 불러오지 못했습니다.");
    } finally {
      setBusy("idle");
    }
  };

  useEffect(() => {
    void load();
  }, [project.id]);

  const preview = useMemo(() => {
    if (!workspace) return serverAnalysis;
    return analyzeExecutionLoop(workspace, {
      landingMetrics: automaticLanding?.status === "connected"
        ? {
            pageViews: automaticLanding.pageViews ?? 0,
            ctaClicks: automaticLanding.ctaClicks ?? 0,
            leads: automaticLanding.leads ?? 0,
            conversionRate: automaticLanding.pageViews
              ? Math.round(((automaticLanding.leads ?? 0) / automaticLanding.pageViews) * 1000) / 10
              : 0,
          }
        : null,
      monthlyFixedCost: project.businessAssessment?.financial.monthlyFixedCost ?? 0,
    });
  }, [workspace, automaticLanding, project.businessAssessment, serverAnalysis]);

  const addExperiment = () => {
    if (!workspace || !experiment.name.trim()) {
      setMessage("실험 이름을 입력해주세요.");
      return;
    }
    if (experiment.status === "completed" && !experiment.evidenceUrl) {
      setMessage("완료한 실행에는 원본 자료나 화면 캡처의 인터넷 주소가 필요합니다.");
      return;
    }
    setWorkspace({ ...workspace, experiments: [...workspace.experiments, experiment] });
    setExperiment(emptyExperiment());
    setMessage("");
  };

  const save = async () => {
    if (!workspace) return;
    setBusy("saving");
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${project.id}/execution-loop`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workspace),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "실행 결과를 저장하지 못했습니다.");
      setWorkspace(payload.workspace);
      setServerAnalysis(payload.analysis);
      onSaved(payload.project);
      setMessage("실행 결과를 저장하고 가설·실측 재무를 다시 계산했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setBusy("idle");
    }
  };

  if (!workspace || !preview) {
    return <section className="execution-loop-panel loading"><LoaderCircle className="spin" /><p>{message || "실행 결과를 연결하고 있습니다."}</p></section>;
  }

  return (
    <section className="execution-loop-panel">
      <header>
        <div><span><TrendingUp /></span><div><small>2단계 · 실제 반응으로 다시 계산</small><h3>반응이 사업 가정과 손익을 다시 계산합니다</h3><p>인터뷰·홍보·문의·결제 결과를 모으고, 확인할 자료가 충분할 때만 검증 판정을 냅니다.</p></div></div>
        <em>실행 자료 신뢰도 {preview.confidenceScore}%</em>
      </header>

      <div className="execution-auto-source">
        <span className={automaticLanding?.status === "connected" ? "connected" : ""}><RefreshCcw /></span>
        <div><strong>공개 판매 페이지 자동 연결</strong><p>{automaticLanding?.status === "connected" ? `/launch/${automaticLanding.slug} · 방문 ${automaticLanding.pageViews} · 클릭 ${automaticLanding.ctaClicks} · 신청 ${automaticLanding.leads}` : "공개 판매 페이지가 없어 자동 방문 자료가 없습니다."}</p></div>
        <button onClick={load} disabled={busy !== "idle"}>새로고침</button>
      </div>

      <nav className="execution-tabs">
        <button className={tab === "dashboard" ? "active" : ""} onClick={() => setTab("dashboard")}><BarChart3 /> 실제 결과 요약</button>
        <button className={tab === "experiments" ? "active" : ""} onClick={() => setTab("experiments")}><FlaskConical /> 실험 기록</button>
        <button className={tab === "hypotheses" ? "active" : ""} onClick={() => setTab("hypotheses")}><Target /> 가설 판정</button>
      </nav>

      {message && <div className="execution-message" role="status">{message}</div>}

      {tab === "dashboard" && (
        <div className="execution-body">
          <div className="execution-funnel">
            <article><small>노출·도달</small><strong>{(preview.totals.impressions + preview.totals.reached).toLocaleString("ko-KR")}</strong><span>시작 표본</span></article>
            <i />
            <article><small>판매 페이지 방문</small><strong>{preview.totals.landingVisitors.toLocaleString("ko-KR")}</strong><span>문의 전환 {value(preview.funnel.visitorToInquiryRate, "%")}</span></article>
            <i />
            <article><small>문의</small><strong>{preview.totals.inquiries.toLocaleString("ko-KR")}</strong><span>제안전환 {value(preview.funnel.inquiryToProposalRate, "%")}</span></article>
            <i />
            <article><small>구매</small><strong>{preview.totals.purchases.toLocaleString("ko-KR")}</strong><span>환불률 {value(preview.funnel.refundRate, "%")}</span></article>
          </div>

          <div className="calibrated-financials">
            <header><CircleDollarSign /><div><strong>실제 결과 기준 손익</strong><p>처음 예상한 값과 별도로 실제 결제·비용 자료만 사용합니다.</p></div></header>
            <div>
              <article><small>실제 평균 판매가</small><strong>{value(preview.calibratedFinancials.observedAveragePrice, "원")}</strong></article>
              <article><small>고객 1명 확보비용</small><strong>{value(preview.calibratedFinancials.customerAcquisitionCost, "원")}</strong></article>
              <article><small>고객 1명당 남는 금액</small><strong>{value(preview.calibratedFinancials.observedContributionPerPurchase, "원")}</strong></article>
              <article><small>월 손익분기 판매량</small><strong>{value(preview.calibratedFinancials.observedBreakEvenUnits, "건")}</strong></article>
            </div>
          </div>

          {preview.bestChannel && <div className="best-channel"><TrendingUp /><div><small>현재 가장 효과적인 고객 경로</small><strong>{channelLabels[preview.bestChannel.channel]}</strong><p>구매 {preview.bestChannel.purchases}건 · 순매출 {preview.bestChannel.revenue.toLocaleString("ko-KR")}원 · 고객 1명 확보비용 {value(preview.bestChannel.acquisitionCost, "원")}</p></div></div>}

          {preview.warnings.length > 0 && <div className="execution-warnings"><AlertTriangle /><div><strong>판정 전에 확인하세요</strong>{preview.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}
          <div className="execution-recommendations"><strong>다음 자동 권고</strong>{preview.recommendedActions.map((action, index) => <p key={action}><span>{index + 1}</span>{action}</p>)}</div>
        </div>
      )}

      {tab === "experiments" && (
        <div className="execution-body">
          <div className="experiment-form">
            <div className="experiment-basic">
              <label><span>실험 이름</span><input value={experiment.name} onChange={(event) => setExperiment({ ...experiment, name: event.target.value })} placeholder="예: 커뮤니티 첫 제안 30명" /></label>
              <label><span>실행 유형</span><select value={experiment.type} onChange={(event) => setExperiment({ ...experiment, type: event.target.value as ExecutionExperiment["type"] })}><option value="interview">고객 인터뷰</option><option value="outreach">직접 제안</option><option value="advertising">광고</option><option value="offer">가격 제안</option><option value="sales">판매</option><option value="landing">외부 판매 페이지</option></select></label>
              <label><span>고객을 만난 방법</span><select value={experiment.channel} onChange={(event) => setExperiment({ ...experiment, channel: event.target.value as ExecutionExperiment["channel"] })}>{Object.entries(channelLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label><span>상태</span><select value={experiment.status} onChange={(event) => setExperiment({ ...experiment, status: event.target.value as ExecutionExperiment["status"], endedAt: event.target.value === "completed" ? new Date().toISOString().slice(0, 10) : "" })}><option value="planned">계획</option><option value="running">진행 중</option><option value="completed">완료·근거 있음</option></select></label>
            </div>
            <div className="experiment-metrics">{metricFields.map(([key, label, suffix]) => <label key={key}><span>{label}</span><div><input type="number" min="0" value={experiment.metrics[key]} onChange={(event) => setExperiment({ ...experiment, metrics: { ...experiment.metrics, [key]: Math.max(0, Number(event.target.value) || 0) } })} /><em>{suffix}</em></div></label>)}</div>
            <label className="experiment-wide"><span>원본 자료·화면 캡처 인터넷 주소</span><input type="url" value={experiment.evidenceUrl} onChange={(event) => setExperiment({ ...experiment, evidenceUrl: event.target.value })} placeholder="인터뷰 기록, 결제 내역 또는 화면 캡처 파일 주소" /></label>
            <label className="experiment-wide"><span>배운 점</span><textarea value={experiment.learning} onChange={(event) => setExperiment({ ...experiment, learning: event.target.value })} placeholder="누가 어떤 말과 행동을 보였는지 사실 중심으로 기록하세요." /></label>
            <button className="add-experiment" onClick={addExperiment}><Plus /> 실행 결과 추가</button>
          </div>

          <div className="experiment-list">{workspace.experiments.map((entry) => <article key={entry.id}><span className={entry.status}>{entry.status === "completed" ? <Check /> : entry.status === "running" ? "진행" : "계획"}</span><div><small>{channelLabels[entry.channel]} · {entry.startedAt}</small><strong>{entry.name}</strong><p>도달 {entry.metrics.reached} · 문의 {entry.metrics.inquiries} · 제안 {entry.metrics.proposals} · 구매 {entry.metrics.purchases} · 매출 {entry.metrics.revenue.toLocaleString("ko-KR")}원</p>{entry.learning && <em>{entry.learning}</em>}</div><button aria-label="실험 삭제" onClick={() => setWorkspace({ ...workspace, experiments: workspace.experiments.filter((item) => item.id !== entry.id) })}><Trash2 /></button></article>)}{!workspace.experiments.length && <p className="execution-empty">아직 직접 기록한 실행 결과가 없습니다. 판매 페이지 방문 수만으로는 가격과 손익을 확인할 수 없습니다.</p>}</div>
        </div>
      )}

      {tab === "hypotheses" && (
        <div className="execution-body">
          <div className="hypothesis-list">{workspace.hypotheses.map((hypothesis) => {
            const verdict = preview.verdicts.find((item) => item.hypothesisId === hypothesis.id)!;
            return <article key={hypothesis.id} className={verdict.verdict}><div className="hypothesis-head"><span>{hypothesisCategoryLabels[hypothesis.category]}</span><em>{verdict.verdict === "validated" ? "확인됨" : verdict.verdict === "invalidated" ? "맞지 않음" : verdict.verdict === "promising" ? "가능성 있음" : "자료 부족"}</em></div><h4>{hypothesis.claim}</h4><p><strong>성공 기준</strong>{hypothesis.successCriterion}</p><div>{verdict.evidence.map((evidence) => <span key={evidence}>{evidence}</span>)}</div><footer><strong>신뢰도 {verdict.confidence}%</strong><p>{verdict.nextAction}</p></footer></article>;
          })}</div>
        </div>
      )}

      <footer className="execution-footer"><div><strong>판매 페이지 방문 수는 자동, 매출·비용은 증빙 입력</strong><span>저장할 때 모든 사업 가정과 실제 손익을 다시 계산합니다.</span></div><button className="save-execution-loop" disabled={busy !== "idle"} onClick={save}>{busy === "saving" ? <LoaderCircle className="spin" /> : <Save />} 실행 결과 저장</button></footer>
    </section>
  );
}
