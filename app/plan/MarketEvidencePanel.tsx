"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, LoaderCircle, RefreshCw, Search } from "lucide-react";
import styles from "./MarketEvidencePanel.module.css";

/*
 * 공식 시장자료 자동검색 — 질문 화면의 관련 섹션(문제와 해결·시장 세그먼트·경쟁 분석)에 붙는다.
 *
 * 누르면 서버가 저장된 플랜 답변으로 공식 기관(KOSIS·공공데이터포털·소상공인진흥공단 등)
 * 원문을 검색해 인용이 확인된 수치만 저장한다. 찾은 근거는 본문을 만들 때 그 섹션에
 * 함께 들어간다. 검색은 여기 단추를 눌렀을 때만 돈다 — 생성·재생성·화면 진입은 검색하지 않는다.
 *
 * 웹검색으로 얻은 자료는 항상 '원문 재확인 권장' 상태다. '검증 완료'라고 쓰지 않는다.
 */
export type PublicEvidence = {
  id: string;
  title: string;
  metric: string;
  value: string;
  unit: string;
  sourceName: string;
  sourceUrl: string;
  observedAt: string;
  retrievedAt: string;
  verification: "verified" | "user_supplied" | "needs_review";
  note: string;
};

type Readiness = { ok: boolean; missing: string[]; recommended: string[]; message: string };

function statusLabel(v: PublicEvidence["verification"]) {
  if (v === "verified") return "공식 API 확인";
  if (v === "user_supplied") return "직접 입력";
  return "공식 원문 검색 결과 · 원문 재확인 권장";
}

export default function MarketEvidencePanel({ planId, disabled }: { planId: string | null; disabled?: boolean }) {
  const [evidence, setEvidence] = useState<PublicEvidence[] | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [configured, setConfigured] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    if (!planId) return;
    try {
      const res = await fetch(`/api/plan/market-research?planId=${encodeURIComponent(planId)}`, { cache: "no-store" });
      const j = (await res.json()) as { evidence?: PublicEvidence[]; readiness?: Readiness; configured?: boolean };
      setEvidence(j.evidence ?? []);
      setReadiness(j.readiness ?? null);
      setConfigured(j.configured !== false);
    } catch {
      setEvidence([]);
    }
  }, [planId]);

  useEffect(() => { void load(); }, [load]);

  async function run() {
    if (!planId || busy) return;
    if (readiness && !readiness.ok) { setNote({ kind: "warn", text: readiness.message }); return; }
    if (evidence?.length && !window.confirm(`이미 공식자료 ${evidence.length}건이 있습니다. 다시 검색하면 새로 찾은 자료가 더해집니다(기존 자료는 유지). 계속할까요?`)) return;
    setBusy(true); setNote(null);
    try {
      const res = await fetch("/api/plan/market-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const j = (await res.json().catch(() => ({}))) as { addedCount?: number; evidence?: PublicEvidence[]; error?: { message?: string }; readiness?: Readiness };
      if (!res.ok) {
        if (j.readiness) setReadiness(j.readiness);
        setNote({ kind: res.status === 422 ? "warn" : "error", text: j.error?.message ?? "공식 근거를 자동 탐색하지 못했습니다." });
        return;
      }
      setEvidence(j.evidence ?? []);
      setOpen(true);
      setNote({ kind: "ok", text: j.addedCount ? `공식자료 ${j.addedCount}건을 새로 찾았습니다. 본문을 만들 때 이 근거가 함께 들어갑니다.` : "새로 추가된 자료는 없습니다. 이미 저장된 자료와 같은 출처였습니다." });
    } catch {
      setNote({ kind: "error", text: "연결이 끊겼습니다. 잠시 뒤 다시 시도해주세요." });
    } finally {
      setBusy(false);
    }
  }

  if (!planId) return null;
  const count = evidence?.length ?? 0;

  return (
    <section className={styles.panel} aria-label="공식 시장자료">
      <div className={styles.head}>
        <div className={styles.title}>
          <Search size={15} />
          <div>
            <strong>공식 시장자료 자동검색</strong>
            <small>{count ? `공식자료 ${count}건 검색됨` : "KOSIS·공공데이터포털 등 공식 원문에서 이 사업의 수요·고객·경쟁 수치를 찾습니다."}</small>
          </div>
        </div>
        <div className={styles.actions}>
          {count > 0 && (
            <button type="button" className={styles.ghost} onClick={() => setOpen((v) => !v)}>{open ? "접기" : "자료 보기"}</button>
          )}
          <button type="button" className={styles.primary} disabled={busy || disabled || !configured} onClick={() => void run()} title={!configured ? "운영용 OpenAI 연결이 필요합니다" : undefined}>
            {busy ? <><LoaderCircle className={styles.spin} size={14} /> 검색 중 (최대 2분)</> : count ? <><RefreshCw size={14} /> 다시 검색</> : <><Search size={14} /> 공식자료 찾기</>}
          </button>
        </div>
      </div>

      {readiness && !readiness.ok && <p className={`${styles.note} ${styles.warn}`}>{readiness.message}</p>}
      {readiness?.ok && readiness.recommended.length > 0 && !note && count === 0 && <p className={`${styles.note} ${styles.hint}`}>{readiness.message}</p>}
      {note && <p className={`${styles.note} ${styles[note.kind]}`} role="status">{note.text}</p>}

      {open && count > 0 && (
        <ul className={styles.list}>
          {evidence!.map((e) => (
            <li key={e.id}>
              <div className={styles.metric}><b>{e.metric}</b><span>{e.value}{e.unit && !e.value.includes(e.unit) ? ` ${e.unit}` : ""}</span></div>
              <div className={styles.meta}>
                <span>{e.sourceName}</span>
                <span>기준일 {e.observedAt || "확인 필요"}</span>
                <em className={e.verification === "verified" ? styles.ok : undefined}>{statusLabel(e.verification)}</em>
                {e.sourceUrl && <a href={e.sourceUrl} target="_blank" rel="noreferrer">원문 <ExternalLink size={11} /></a>}
              </div>
              {e.note && <p className={styles.why}>{e.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
