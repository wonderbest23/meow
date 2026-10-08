"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import AdminNav from "../AdminNav";
import type { MigrationReport, MigrationStatus, ReadinessReport } from "../../../lib/schema-readiness";
import styles from "../generation/page.module.css";

/*
 * DB 준비 상태 — 운영 DB에 빠진 마이그레이션을 파일 이름으로 보여 준다.
 * 상담 저장(0024)이 운영 DB에 없는데도 화면은 멀쩡해 보여 몇 달 동안 아무도 몰랐다(2026-10-08).
 */
const LABELS: Record<MigrationStatus, string> = { missing: "없음", partial: "일부만 있음", unknown: "확인 못 함", optional: "선택(꺼져 있음)", manual: "직접 확인", ok: "있음" };
const STATE: Record<MigrationStatus, string> = { missing: "failed", partial: "failed", unknown: "", optional: "", manual: "", ok: "complete" };
const ORDER: MigrationStatus[] = ["missing", "partial", "unknown", "optional", "manual", "ok"];
const BUCKET_TEXT = {
  ok: "있음 · 공개",
  missing: "없음 — Supabase → Storage 에서 landing-images 버킷을 Public 으로 만들어 주세요. 없으면 홈페이지 사진 올리기가 실패해요.",
  private: "있지만 비공개 — Public 으로 바꿔 주세요. 비공개면 공개한 홈페이지의 사진이 깨져 보여요.",
  unknown: "확인하지 못했어요",
};

function Rows({ items }: { items: MigrationReport[] }) {
  return <div className={styles.table}><table>
    <thead><tr><th>상태</th><th>파일</th><th>없으면 안 되는 기능</th><th>빠진 것</th></tr></thead>
    <tbody>{items.map(item => <tr key={item.file}>
      <td data-state={STATE[item.status] || undefined}><strong>{LABELS[item.status]}</strong></td>
      <td><code>{item.file}</code></td>
      <td>{item.feature}{item.note && <small>{item.note}</small>}</td>
      <td>{item.missing.length ? item.missing.map(label => <small key={label}>{label}</small>) : item.unknown.length ? item.unknown.map(label => <small key={label}>{label} (확인 못 함)</small>) : "-"}</td>
    </tr>)}</tbody>
  </table></div>;
}

export default function SchemaAdminPage() {
  const [data, setData] = useState<ReadinessReport | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError("");
    void fetch("/api/admin/schema", { cache: "no-store", signal: controller.signal }).then(async response => {
      const value = await response.json();
      if (controller.signal.aborted) return;
      setLogin(response.status === 401);
      if (!response.ok) throw new Error(value.error?.message ?? "확인하지 못했습니다");
      setData(value);
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "확인하지 못했습니다"); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [refresh]);

  const sorted = data ? [...data.migrations].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || a.file.localeCompare(b.file)) : [];
  const attention = sorted.filter(item => ["missing", "partial", "unknown"].includes(item.status));
  const rest = sorted.filter(item => !attention.includes(item));
  const toRun = data ? data.migrations.filter(item => item.status === "missing").map(item => item.file) : [];
  return <main className={styles.page}>
    {!login && <AdminNav title="DB 준비 상태" subtitle="운영 DB에 빠진 마이그레이션을 파일 이름으로 보여 줘요" />}
    <div className={styles.content}>
      <div className={styles.toolbar}>
        <button title="다시 확인" aria-label="다시 확인" disabled={busy} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={18} /></button>
        {data && <small>확인 {new Date(data.checkedAt).toLocaleString("ko-KR")} · {data.source === "openapi" ? "DB 스키마 목록으로 확인" : data.source === "probe" ? "테이블을 하나씩 읽어 확인(함수는 확인 못 함)" : "DB가 연결되어 있지 않아요"}</small>}
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {login && <Link href="/admin">관리자 로그인</Link>}
      {busy && !data && <p role="status">DB를 확인하고 있습니다</p>}
      {data && <>
        <section className={styles.section}>
          <header>
            <h1>{data.ready ? "필요한 마이그레이션이 모두 들어가 있어요" : `확인이 필요한 마이그레이션 ${attention.length}개`}</h1>
            <p>없음 {data.summary.missing} · 일부만 있음 {data.summary.partial} · 확인 못 함 {data.summary.unknown} · 있음 {data.summary.ok} · 직접 확인 {data.summary.manual} · 선택 {data.summary.optional}</p>
          </header>
          {toRun.length > 0 && <div className={styles.error} style={{ marginBottom: 20 }}>
            <strong>Supabase → SQL Editor 에서 아래 파일을 위에서부터 순서대로 한 번씩 실행해 주세요.</strong>
            <ol style={{ margin: "8px 0 0", paddingLeft: 20 }}>{toRun.map(file => <li key={file}><code>supabase/migrations/{file}</code></li>)}</ol>
            {data.summary.partial > 0 && <p style={{ margin: "8px 0 0" }}>‘일부만 있음’은 그대로 다시 실행하면 오류가 날 수 있어요. 빠진 것만 따로 실행해야 해요.</p>}
          </div>}
          {attention.length > 0 ? <Rows items={attention} /> : <p className={styles.empty}>빠진 마이그레이션이 없어요.</p>}
        </section>
        <section className={styles.section}>
          <header><h2>사진 저장소</h2><p>마이그레이션이 만들지 않아 Supabase 화면에서 직접 만들어야 해요.</p></header>
          <p data-state={data.bucket.status === "ok" ? "complete" : undefined}><code>{data.bucket.name}</code> — {BUCKET_TEXT[data.bucket.status]}</p>
        </section>
        <section className={styles.section}>
          <details><summary>나머지 {rest.length}개 보기</summary><Rows items={rest} /></details>
        </section>
      </>}
    </div>
  </main>;
}
