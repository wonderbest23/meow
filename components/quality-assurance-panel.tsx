"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import type { QualityAudit } from "../lib/quality/domain";
import type { ProjectRecord } from "../lib/service-domain";

export function QualityAssurancePanel({
  project,
  onSaved,
}: {
  project: ProjectRecord;
  onSaved: (project: ProjectRecord) => void;
}) {
  const [audit, setAudit] = useState<QualityAudit | null>(project.qualityAudit ?? null);
  const [loading, setLoading] = useState(!project.qualityAudit);
  const [working, setWorking] = useState<"audit" | "legal" | null>(null);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/quality`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "품질 감사를 불러오지 못했습니다.");
      setAudit(payload.audit);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "품질 감사를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [project.id, project.updatedAt]);

  const runAndSave = async () => {
    setWorking("audit");
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${project.id}/quality`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "품질 감사를 실행하지 못했습니다.");
      setAudit(payload.audit);
      onSaved(payload.project);
      setMessage("현재 프로젝트 상태로 품질 감사 결과를 저장했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "품질 감사를 실행하지 못했습니다.");
    } finally {
      setWorking(null);
    }
  };

  const refreshLegal = async () => {
    setWorking("legal");
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${project.id}/quality/legal-refresh`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "법령 원문 상태를 확인하지 못했습니다.");
      await load();
      setMessage("공식 원문이 바뀌었는지 확인하는 값과 마지막 확인 시각을 갱신했습니다.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "법령 원문 상태를 확인하지 못했습니다.");
    } finally {
      setWorking(null);
    }
  };

  if (loading || !audit) {
    return <section id="quality-assurance-panel" className="quality-assurance-panel loading"><LoaderCircle className="spin" /><p>{message || "계산·근거·법령·단계 일관성을 검사하고 있습니다."}</p></section>;
  }

  return (
    <section id="quality-assurance-panel" className={`quality-assurance-panel ${audit.status}`}>
      <header>
        <div><span>{audit.status === "passed" ? <ShieldCheck /> : <ShieldX />}</span><div><small>2단계 · 자동 품질 확인</small><h3>자동 품질 확인 센터</h3><p>계산 오류와 위험한 표현, 법령 변경을 승인 전에 자동 차단합니다.</p></div></div>
        <em>{audit.status === "passed" ? "출시 가능" : audit.status === "blocked" ? "승인 차단" : "조건부 준비"}</em>
      </header>

      <div className="quality-summary">
        <div className="quality-score"><strong>{audit.score}</strong><span>/100</span><small>품질 점수</small></div>
        <div><strong>{audit.blockerCount}</strong><span>차단</span><small>승인 전에 수정</small></div>
        <div><strong>{audit.warningCount}</strong><span>주의</span><small>증빙·표본 보완</small></div>
        <div><strong>{audit.regressionScenarios.filter((item) => item.status === "passed").length}</strong><span>통과</span><small>반복 오류 검사</small></div>
      </div>

      <div className="quality-content">
        <div className="quality-section">
          <div className="quality-section-title"><FileCheck2 /><div><strong>업종 공통 반복 오류 검사</strong><p>입력과 결과물에서 반드시 같아야 하는 값을 매번 다시 계산합니다.</p></div></div>
          <div className="quality-regressions">
            {audit.regressionScenarios.map((scenario) => (
              <div key={scenario.id} className={scenario.status}>
                <span>{scenario.status === "passed" ? <Check /> : scenario.status === "failed" ? <ShieldX /> : "—"}</span>
                <div><strong>{scenario.name}</strong><p>{scenario.detail}</p></div>
              </div>
            ))}
          </div>
        </div>

        <div className="quality-section">
          <div className="quality-section-title"><AlertTriangle /><div><strong>수정할 내용</strong><p>차단 항목은 관련 단계의 승인 기능에서도 거부됩니다.</p></div></div>
          {audit.findings.length === 0 ? <div className="quality-empty"><Check /> 현재 발견된 품질 문제가 없습니다.</div> : (
            <div className="quality-findings">
              {audit.findings.map((item) => (
                <article key={item.id} className={item.severity}>
                  <span>{item.severity === "blocker" ? "차단" : item.severity === "warning" ? "주의" : "안내"}</span>
                  <div><strong>{item.title}</strong><p>{item.detail}</p><small>조치: {item.action}</small></div>
                  {item.relatedStage !== null && <em>{item.relatedStage + 1}단계</em>}
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="quality-section">
          <div className="quality-section-title"><ShieldCheck /><div><strong>공식 법령 변경 확인</strong><p>원문 수정일과 문서 크기를 이전 확인값과 비교해 바뀐 내용을 찾습니다.</p></div></div>
          <div className="quality-legal-list">
            {audit.legalSources.map(({ definition, snapshot, stale }) => (
              <details key={definition.id} open={snapshot?.status === "changed"}>
                <summary><span className={snapshot?.status ?? "missing"}>{snapshot?.status === "changed" ? "변경" : !snapshot || stale ? "확인 필요" : "확인됨"}</span><div><strong>{definition.name}</strong><p>{definition.authority} · {snapshot ? new Date(snapshot.checkedAt).toLocaleDateString("ko-KR") : "기준선 없음"}</p></div></summary>
                <div><p>영향: {definition.affectedModules.join(", ")}{snapshot?.status === "changed" ? " · 자동 승인 차단 중이며 품질 규칙 새 버전 배포가 필요합니다." : ""}</p><a href={definition.url} target="_blank" rel="noreferrer">공식 원문 열기 <ExternalLink /></a></div>
              </details>
            ))}
          </div>
        </div>
      </div>

      {message && <p className="quality-message">{message}</p>}
      <footer><div><strong>결과물 또는 입력을 바꿨나요?</strong><span>새 감사 결과를 저장한 뒤 최종 출시 상태를 판단하세요.</span></div><button disabled={working !== null} onClick={refreshLegal}>{working === "legal" ? <LoaderCircle className="spin" /> : <RefreshCcw />} 법령 원문 확인</button><button className="primary" disabled={working !== null} onClick={runAndSave}>{working === "audit" ? <LoaderCircle className="spin" /> : <ShieldCheck />} 품질 감사 저장</button></footer>
    </section>
  );
}
