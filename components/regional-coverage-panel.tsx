"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Database,
  ExternalLink,
  LoaderCircle,
  MapPinned,
  RefreshCcw,
  ShieldAlert,
} from "lucide-react";
import {
  datasetKindLabels,
  type RegionalCoverageReport,
} from "../lib/regional-data/domain";
import type { ProjectRecord } from "../lib/service-domain";

const statusLabels: Record<RegionalCoverageReport["items"][number]["status"], string> = {
  verified_fresh: "최신 근거",
  verified_stale: "갱신 필요",
  connector_ready: "자동 조회 준비",
  manual_required: "공식 확인 필요",
  missing: "소스 없음",
};

export function RegionalCoveragePanel({ project }: { project: ProjectRecord }) {
  const [report, setReport] = useState<RegionalCoverageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${project.id}/regional-coverage`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "지역 자료 상태를 확인하지 못했습니다.");
      setReport(payload.report);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "지역 자료 상태를 확인하지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [project.id, project.marketWorkspace?.evidence.length, project.businessSetup?.region]);

  if (loading || !report) {
    return <section className="regional-coverage-panel loading"><LoaderCircle className="spin" /><p>{message || "사업 지역의 공식 자료 범위를 확인하고 있습니다."}</p></section>;
  }

  return (
    <section className="regional-coverage-panel">
      <header>
        <div><span><MapPinned /></span><div><small>2단계 · 전국 17개 지역 자료 확인</small><h3>{report.provinceLabel} 자료 최신 상태</h3><p>서울 자료를 다른 지역에 대입하지 않고 전국·지자체 공식 자료를 지역별로 나눠 확인합니다.</p></div></div>
        <em>{report.freshRequiredCount}/{report.requiredCount} 최신</em>
      </header>

      <div className="regional-score-row">
        <div className="regional-score-ring" style={{ "--coverage": `${report.coverageScore * 3.6}deg` } as React.CSSProperties}><span><strong>{report.coverageScore}</strong><small>/100</small></span></div>
        <div><small>필수 자료 확보 정도</small><strong>{report.coverageScore >= 80 ? "의사결정 가능" : report.coverageScore >= 50 ? "추가 갱신 필요" : "근거 부족"}</strong><p>확인된 공식 근거와 기준일만 높은 점수로 반영합니다.</p></div>
        <a href={report.localPortal.url} target="_blank" rel="noreferrer"><Database /> {report.localPortal.name}<ExternalLink /></a>
      </div>

      <div className="regional-coverage-list">
        {report.items.map((item) => (
          <details key={item.kind} className={item.status} open={item.required && item.status !== "verified_fresh"}>
            <summary>
              <span>{item.status === "verified_fresh" ? <Check /> : item.required ? <ShieldAlert /> : <Database />}</span>
              <div><small>{item.required ? "필수 자료" : "선택 자료"}</small><strong>{datasetKindLabels[item.kind]}</strong></div>
              <em>{statusLabels[item.status]}</em>
              <p>{item.latestObservedAt ? `기준일 ${item.latestObservedAt} · ${item.ageDays}일 전` : "저장된 공식 근거 없음"}</p>
            </summary>
            <div>
              <p className="regional-action">{item.action}</p>
              <div className="regional-source-list">
                {item.availableSources.map((source) => <a key={source.id} href={source.sourceUrl} target="_blank" rel="noreferrer"><span className={source.configured ? "configured" : ""}>{source.access === "api" ? source.configured ? "자동 조회 연결" : "연결키 필요" : source.access === "portal" ? "공식 누리집" : "직접 확인"}</span><div><strong>{source.name}</strong><p>{source.note}</p></div><ExternalLink /></a>)}
              </div>
            </div>
          </details>
        ))}
      </div>

      {report.warnings.length > 0 && <div className="regional-warnings"><AlertTriangle /><div><strong>지역 적용 주의사항</strong>{report.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></div>}

      <footer><div><strong>지역 또는 근거를 바꿨나요?</strong><span>시장 근거 저장 후 다시 계산하면 기준일이 반영됩니다.</span></div><button onClick={() => document.getElementById("market-plan-panel")?.scrollIntoView({ behavior: "smooth" })}><Database /> 시장 근거 수정</button><button onClick={load}><RefreshCcw /> 다시 계산</button></footer>
    </section>
  );
}
