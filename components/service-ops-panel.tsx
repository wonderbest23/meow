"use client";

import { useEffect, useState } from "react";
import { Activity, Check, Database, LoaderCircle, RefreshCcw } from "lucide-react";
import type { ServiceAuditEntry } from "../lib/service-audit/domain";
import type { ProjectRecord } from "../lib/service-domain";

const actionLabels: Record<ServiceAuditEntry["action"], string> = {
  "project.created": "프로젝트 생성",
  "payment.order_created": "결제 주문 생성",
  "payment.confirmed": "결제 승인",
  "payment.failed": "결제 실패",
  "stage.inputs_saved": "단계 입력 저장",
  "stage.generation_started": "결과물 생성 시작",
  "stage.generation_succeeded": "결과물 생성 성공",
  "stage.generation_failed": "결과물 생성 실패",
  "stage.generation_retried": "결과물 재생성",
  "stage.approved": "단계 승인",
  "stage.revision_requested": "수정 요청",
  "business_setup.saved": "사업 조건 저장",
  "market.saved": "시장 근거 저장",
  "business_plan.generated": "사업계획서 생성",
  "landing.published": "판매 페이지 공개",
  "operations.saved": "운영 준비 저장",
  "execution_loop.saved": "실행 결과 저장",
  "quality.audit_saved": "품질 감사 저장",
  "grants.saved": "공공지원 조건 저장",
  "grants.matched": "공고 자격 판정",
};

export function ServiceOpsPanel({ project }: { project: ProjectRecord }) {
  const [loading, setLoading] = useState(true);
  const [persistence, setPersistence] = useState("demo-memory");
  const [logs, setLogs] = useState<ServiceAuditEntry[]>([]);
  const [approvedStages, setApprovedStages] = useState(0);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/audit`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "서비스 상태를 불러오지 못했습니다.");
      setPersistence(payload.persistence);
      setLogs(payload.logs);
      setApprovedStages(payload.approvedStages);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "서비스 상태를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [project.id, project.updatedAt, project.qualityAudit?.generatedAt]);

  if (loading) {
    return <section className="service-ops-panel loading"><LoaderCircle className="spin" /><p>서비스 운영 상태를 확인하고 있습니다.</p></section>;
  }

  return (
    <section id="service-ops-panel" className="service-ops-panel">
      <header>
        <div><span><Activity /></span><div><small>기본 단계 · 서비스 운영</small><h3>서비스 운영 상태</h3><p>이용·생성·승인 이력을 서버에 기록하고 재시도 가능 여부를 확인합니다.</p></div></div>
        <em>{persistence === "supabase" ? "영구 저장" : "개발 메모리"}</em>
      </header>
      <div className="service-ops-summary">
        <article><small>이용 상태</small><strong>{project.packagePrice === 0 ? "베타 무료 이용" : project.paymentStatus === "paid" ? "실제 결제" : project.paymentStatus === "test_paid" ? "개발용 결제" : project.paymentStatus}</strong></article>
        <article><small>승인 단계</small><strong>{approvedStages}/6</strong></article>
        <article><small>품질 점수</small><strong>{project.qualityAudit?.score ?? "—"}</strong></article>
        <article><small>감사 로그</small><strong>{logs.length}건</strong></article>
      </div>
      <div className="service-ops-list">
        {logs.length === 0 ? <p className="service-ops-empty"><Database /> 아직 기록된 서비스 처리 내역이 없습니다.</p> : logs.map((entry) => (
          <article key={entry.id} className={entry.status}>
            <span>{entry.status === "success" ? <Check /> : entry.status === "error" ? "!" : "·"}</span>
            <div><strong>{actionLabels[entry.action] ?? entry.action}</strong><p>{entry.detail}</p><small>{new Date(entry.createdAt).toLocaleString("ko-KR")}{entry.stageIndex !== null ? ` · ${entry.stageIndex + 1}단계` : ""}</small></div>
          </article>
        ))}
      </div>
      {message && <p className="service-ops-message">{message}</p>}
      <footer><div><strong>생성 실패 시</strong><span>같은 단계에서 다시 시도 버튼이 최대 3회까지 열립니다.</span></div><button onClick={load}><RefreshCcw /> 새로고침</button></footer>
    </section>
  );
}
