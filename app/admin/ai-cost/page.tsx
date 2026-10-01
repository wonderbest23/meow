"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import AdminNav from "../AdminNav";
import { USAGE_KIND_LABELS, type CostSummary } from "../../../lib/llm/cost";
import styles from "../generation/page.module.css";

type Data = { summary: CostSummary; rows: number; truncated: boolean; from: string | null; to: string | null; planId: string | null; checkedAt: string; cacheColumns: boolean };
type Bucket = CostSummary["total"];
const RANGES = [["today", "오늘"], ["7d", "7일"], ["30d", "30일"], ["90d", "90일"]] as const;

const won = (usd: number, rate: number) => `${Math.round(usd * rate).toLocaleString("ko-KR")}원`;
const dollars = (usd: number) => `$${usd < 1 ? usd.toFixed(3) : usd.toFixed(2)}`;
const count = (value: number) => value.toLocaleString("ko-KR");
function date(value: string | null) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("ko-KR") : "처음부터"; }

function Row({ name, sub, bucket, rate }: { name: string; sub?: string; bucket: Bucket; rate: number }) {
  return <tr>
    <td><strong>{name}</strong>{sub && <small>{sub}</small>}</td>
    <td>{count(bucket.calls)}{bucket.failed ? <small className={styles.failure}>실패 {count(bucket.failed)}</small> : null}</td>
    <td>{count(bucket.inputTokens)} / {count(bucket.outputTokens)}{bucket.cacheReadTokens ? <small>캐시 읽기 {count(bucket.cacheReadTokens)}</small> : null}</td>
    <td><strong>{won(bucket.usd, rate)}</strong><small>{dollars(bucket.usd)}{bucket.unpriced ? ` · 요금 미확인 ${count(bucket.unpriced)}건` : ""}</small></td>
    <td>{bucket.calls ? won(bucket.usd / bucket.calls, rate) : "-"}</td>
  </tr>;
}

function Table({ title, note, head, rows }: { title: string; note?: string; head: string; rows: ReactNode }) {
  return <section className={styles.section}><header><h2>{title}</h2>{note && <p>{note}</p>}</header>
    <div className={styles.table}><table><thead><tr><th>{head}</th><th>호출</th><th>토큰(입력 / 출력)</th><th>비용</th><th>1회 평균</th></tr></thead><tbody>{rows}</tbody></table></div>
  </section>;
}

export default function AiCostAdminPage() {
  const [range, setRange] = useState("7d");
  const [planId, setPlanId] = useState("");
  const [applied, setApplied] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError("");
    const query = new URLSearchParams({ range, ...(applied ? { planId: applied } : {}) });
    void fetch(`/api/admin/ai-cost?${query}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const value = await response.json();
      if (controller.signal.aborted) return;
      setLogin(response.status === 401);
      if (!response.ok) throw new Error(value.message ?? value.error?.message ?? "조회하지 못했습니다");
      setData(value);
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "조회하지 못했습니다"); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [range, applied, refresh]);

  const summary = data?.summary;
  const rate = summary?.krwPerUsd ?? 1400;
  return <main className={styles.page}>
    {!login && <AdminNav title="AI 비용" subtitle="기록된 토큰 × 모델 요금으로 계산한 AI 사용 비용" />}
    <div className={styles.content}>
      <div className={styles.toolbar}>
        <label>기간<select value={range} onChange={event => setRange(event.target.value)}>{RANGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <form onSubmit={event => { event.preventDefault(); setApplied(planId.trim()); }} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label>사업 ID<input value={planId} onChange={event => setPlanId(event.target.value)} placeholder="plan_… (비우면 전체)" style={{ minWidth: 260 }} /></label>
          <button type="submit" disabled={busy}>보기</button>
        </form>
        <button title="새로고침" aria-label="새로고침" disabled={busy} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={18} /></button>
        {data && <small>{date(data.from)} ~ {data.to ? date(data.to) : "지금"} · 조회 {date(data.checkedAt)}</small>}
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {login && <Link href="/admin">관리자 로그인</Link>}
      {busy && <p role="status">비용을 계산하고 있습니다</p>}
      {data && summary && <>
        <section className={styles.section}>
          <header>
            <h1>{data.planId ? `사업 ${data.planId}` : "전체"} AI 비용 {won(summary.total.usd, rate)}</h1>
            <p>
              호출 {count(summary.total.calls)}건 · {dollars(summary.total.usd)} · 1달러 {count(rate)}원 기준(AI_COST_KRW_PER_USD)
              {summary.total.unpriced ? ` · 요금표에 없는 모델 ${count(summary.total.unpriced)}건은 비용에서 빠짐` : ""}
              {!data.cacheColumns ? " · 캐시 칸이 없어 캐시 할인 없이 계산(마이그레이션 0037 확인)" : ""}
              {data.truncated ? " · 기록이 많아 최근 5만 건까지만 계산" : ""}
            </p>
          </header>
          <p style={{ margin: 0, fontSize: 13, opacity: .7 }}>실제 청구액은 Anthropic 콘솔(결제 화면)이 기준입니다. 이 화면은 서버가 남긴 토큰 기록으로 계산한 값이라, 기록이 빠진 호출(예: 기록 실패)만큼 적게 나올 수 있어요.</p>
        </section>
        <Table title="기능별" note="어떤 기능에 돈이 드는지" head="기능" rows={summary.byKind.map(item => <Row key={item.kind} name={USAGE_KIND_LABELS[item.kind] ?? item.kind} sub={item.kind} bucket={item} rate={rate} />)} />
        <Table title="날짜별" note="한국 시간 기준" head="날짜" rows={summary.byDay.map(item => <Row key={item.day} name={item.day} bucket={item} rate={rate} />)} />
        {!data.planId && <Table title="사업별(상위 50)" note="사업 ID를 위 칸에 넣으면 그 사업만 볼 수 있어요. 사업이 기록되지 않은 호출은 맨 아래 줄" head="사업 ID" rows={<>
          {summary.byPlan.map(item => <Row key={item.planId} name={item.planId} bucket={item} rate={rate} />)}
          {summary.unattributed.calls ? <Row name="사업 미기록" sub="예전 기록 · 사업 밖의 호출(고객센터 AI 등)" bucket={summary.unattributed} rate={rate} /> : null}
        </>} />}
        <Table title="모델별" head="모델" rows={summary.byModel.map(item => <Row key={item.model} name={item.model} bucket={item} rate={rate} />)} />
        {summary.total.calls === 0 && <p className={styles.empty}>이 기간에 기록된 AI 호출이 없습니다</p>}
      </>}
    </div>
  </main>;
}
