"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import AdminNav from "../AdminNav";
import { jobDuration, jobNextStep, type AdminJob, type AdminUsage } from "../../../lib/llm/admin-jobs";
import styles from "./page.module.css";

type Data = { jobs: AdminJob[]; nextOffset: number | null; usage: AdminUsage[] | null; checkedAt: string };
const kinds = { deck: "PPT", coach: "사업 대화", operating: "운영 개선" };
const statuses: Record<string, string> = { ready: "완료", complete: "완료", failed: "실패", queued: "대기", running: "진행 중" };
const checkpoints = { source: "원본 기록", draft_slides: "슬라이드 초안", reviewed_slides: "검토된 슬라이드", analysis: "분석 결과" };
function date(value: string | null) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("ko-KR") : "미기록"; }
function tokens(input: number | null, output: number | null) { return input !== null && output !== null ? `${input.toLocaleString()} / ${output.toLocaleString()}` : "미기록"; }
function duration(ms: number | null) { return ms === null ? "미기록" : `${(ms / 1000).toFixed(1)}초`; }

export default function GenerationAdminPage() {
  const [data, setData] = useState<Data | null>(null);
  const [status, setStatus] = useState("all");
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError(""); setData(null);
    void fetch(`/api/admin/generation?offset=${offset}&status=${status}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const value = await response.json();
      if (controller.signal.aborted) return;
      setLogin(response.status === 401);
      if (!response.ok) throw new Error(value.message ?? value.error?.message ?? "조회하지 못했습니다");
      setData(value);
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "조회하지 못했습니다"); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [offset, status, refresh]);

  return <main className={styles.page}>
    {!login && <AdminNav title="생성 작업" subtitle="작업 상태와 AI 호출 기록" />}
    <div className={styles.content}>
      <div className={styles.toolbar}><label>작업 상태<select value={status} onChange={event => { setStatus(event.target.value); setOffset(0); }}><option value="all">전체</option><option value="failed">실패</option><option value="running">진행 중</option><option value="complete">완료</option></select></label><button title="새로고침" aria-label="새로고침" disabled={busy} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={18} /></button>{data && <small>조회 {date(data.checkedAt)}</small>}</div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {login && <Link href="/admin">관리자 로그인</Link>}
      {busy && <p role="status">작업을 불러오고 있습니다</p>}
      {data && <>
        <section className={styles.section}><header><h1>사업별 생성 상태</h1><p>최근 7일 내 저장된 사업 계정 최대 1,000개 기준</p></header>
          <div className={styles.table}><table><thead><tr><th>작업과 사업 ID</th><th>상태</th><th>마지막 단계</th><th>저장된 내용</th><th>다음 확인</th><th>처리 시간</th><th>최종 변경</th></tr></thead><tbody>{data.jobs.map(job => <tr key={job.id}><td><strong>{kinds[job.kind]}</strong><small>{job.planId}</small></td><td><span data-state={job.status}>{statuses[job.status ?? ""] ?? "확인 필요"}</span></td><td>{job.phase ?? "미기록"}{job.errorCode && <small className={styles.failure}>{job.errorCode}</small>}</td><td>{checkpoints[job.checkpoint]}</td><td>{jobNextStep(job)}</td><td>{duration(jobDuration(job))}</td><td>{date(job.updatedAt)}</td></tr>)}</tbody></table></div>
          {data.jobs.length === 0 && <p className={styles.empty}>해당 조건의 작업이 없습니다</p>}
          <div className={styles.pagination}><button title="이전 페이지" aria-label="이전 페이지" disabled={offset === 0 || busy} onClick={() => setOffset(value => Math.max(0, value - 20))}><ChevronLeft size={18} /></button><span>{offset / 20 + 1}</span><button title="다음 페이지" aria-label="다음 페이지" disabled={data.nextOffset === null || busy} onClick={() => setOffset(data.nextOffset!)}><ChevronRight size={18} /></button></div>
        </section>
        <section className={styles.section}><header><h2>최근 AI 호출</h2><p>최근 25건 · 토큰은 입력 / 출력 기준 · 실제 청구액은 제공업체에서 확인</p></header>
          {data.usage === null ? <p role="alert">호출 기록을 조회하지 못했습니다. DB와 마이그레이션을 확인해 주세요</p> : <><div className={styles.table}><table><thead><tr><th>시각</th><th>유형</th><th>제공업체와 모델</th><th>결과</th><th>처리 시간</th><th>토큰</th></tr></thead><tbody>{data.usage.map(call => <tr key={call.id}><td>{date(call.created_at)}</td><td>{call.kind}</td><td>{call.provider}<small>{call.model ?? "모델 미기록"}</small></td><td><span data-state={call.ok ? "complete" : "failed"}>{call.ok ? "응답 수신" : "실패"}</span>{call.failure_code && <small className={styles.failure}>{call.failure_code}</small>}</td><td>{duration(call.elapsed_ms)}</td><td>{tokens(call.input_tokens, call.output_tokens)}</td></tr>)}</tbody></table></div>{data.usage.length === 0 && <p className={styles.empty}>저장된 AI 호출 기록이 없습니다</p>}</>}
        </section>
      </>}
    </div>
  </main>;
}
