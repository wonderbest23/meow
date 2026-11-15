"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, FileText, Megaphone, MessageSquare, Monitor } from "lucide-react";
import { latestPeriod, periodShortLabel, recordSummary, type OperatingState } from "../../../lib/plan-builder/operating-records";
import { sampleOperatingState } from "../../../lib/plan-builder/sample-operations";
import type { HomepageStatus } from "../../../lib/plan-builder/journey";
import { unansweredCount, useInquiries } from "../inquiries/use-inquiries";
import { AppButton } from "../../../components/app-button";
import styles from "./OperationsHub.module.css";

export type OpsApp = "homepage" | "reports" | "marketing" | "periods";

/**
 * 유지보수 첫 화면(2026-11-15 사장님) — 지금 할 일 한 줄, 앱 아이콘처럼 다섯 칸, 한 줄 요약.
 * 아이콘을 누르면 그 화면 하나만 열린다(BusinessWorkspace). 문의는 이미 있는 손님 문의 화면으로 간다.
 */
export default function OperationsHub({ planId, sample, homepage, onOpen }: { planId: string; sample: boolean; homepage: HomepageStatus; onOpen: (app: OpsApp) => void }) {
  const [records, setRecords] = useState<OperatingState | null>(() => sample ? sampleOperatingState(planId) : null);
  useEffect(() => {
    if (sample) { setRecords(sampleOperatingState(planId)); return; }
    let alive = true;
    // 못 불러오면 숫자를 지어내지 않고 비워 둔다 — 아이콘은 그대로 눌린다
    fetch(`/api/plan/operations?planId=${encodeURIComponent(planId)}`, { cache: "no-store", signal: AbortSignal.timeout(20000) })
      .then(async response => response.ok ? (await response.json()).records as OperatingState : null)
      .then(value => { if (alive && value) setRecords(value); }).catch(() => {});
    return () => { alive = false; };
  }, [planId, sample]);
  const inquiries = useInquiries(!sample);
  const waiting = inquiries.items ? unansweredCount(inquiries.items.filter(item => item.planId === planId)) : null;
  const period = records ? latestPeriod(records.periods) : null;
  const summary = records ? recordSummary(records.periods) : "";
  const tiles: { key: OpsApp | "inquiries"; label: string; note: string; icon: React.ReactNode }[] = [
    { key: "homepage", label: "홈페이지 관리", note: sample ? "예시" : homepage === "published" ? "공개 중" : homepage === "draft" ? "공개 전" : homepage === "none" ? "아직 없음" : "", icon: <Monitor aria-hidden="true" /> },
    { key: "reports", label: "리포트", note: records ? `${records.reports.length}개` : "", icon: <FileText aria-hidden="true" /> },
    { key: "marketing", label: "마케팅", note: "맡길 수 있는 일", icon: <Megaphone aria-hidden="true" /> },
    { key: "periods", label: "기간별 실적", note: records ? `기록 ${records.periods.length}개` : "", icon: <BarChart3 aria-hidden="true" /> },
    { key: "inquiries", label: "문의 접수", note: sample ? "내 사업에서 열려요" : homepage === null ? "" : homepage !== "published" ? "홈페이지를 공개하면 열려요" : waiting === null ? "" : waiting ? `새 문의 ${waiting}건` : "새 문의 없음", icon: <MessageSquare aria-hidden="true" /> },
  ];
  return <div className={styles.hub} data-operations-hub>
    <div className={styles.now}>
      <span className={styles.tag}>지금 할 일</span>
      <strong>{period?.nextAction || (records ? "이번 기간 실적을 기록해 보세요" : "기록을 확인하고 있어요")}</strong>
      <AppButton type="button" variant="primary" size="small" onClick={() => onOpen("periods")}>하러 가기<ArrowRight size={16} aria-hidden="true" /></AppButton>
    </div>
    <ul className={styles.apps}>{tiles.map(tile => {
      const inner = <><span className={styles.icon} data-app={tile.key}>{tile.icon}{tile.key === "inquiries" && !!waiting && <em>{waiting}</em>}</span><b>{tile.label}</b><small>{tile.note}</small></>;
      return <li key={tile.key}>{tile.key === "inquiries"
        ? sample || homepage !== "published" ? <span className={styles.app} aria-disabled="true">{inner}</span> : <Link className={styles.app} href="/plan/inquiries">{inner}</Link>
        : <button type="button" className={styles.app} onClick={() => onOpen(tile.key as OpsApp)}>{inner}</button>}</li>;
    })}</ul>
    <div className={styles.summary}>
      <span className={styles.tag}>한 줄 요약</span>
      <p>{summary || (records ? "기간 실적을 저장하면 여기에 한 줄로 정리해 드려요" : "기록을 확인하고 있어요")}</p>
      {period && summary && <small>{periodShortLabel(period)} 기록 기준</small>}
    </div>
  </div>;
}
