"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sectionCountForType } from "../../lib/plan-builder/blueprint";
import { hydrateFromServer, setActivePlan, deletePlan, renamePlan, loadState, isSamplePlan, type PlanState } from "../../lib/plan-builder/plan-store";
import { ArrowDownUp, BookOpen, CalendarDays, Check, CheckCircle2, ChevronRight, Clock, FileText, List, ListChecks, Pencil, PenLine, Plus, Trash2 } from "lucide-react";
import styles from "./PlanList.module.css";
import PlanLoading from "./PlanLoading";

/**
 * 유형별 시각 정체성 — 색·아이콘·짧은 라벨.
 * 색만으로는 계획서와 재무 모델이 구별되지 않아서, 워터마크 아이콘과
 * 표지의 짧은 라벨(칩)까지 유형마다 다르게 둔다.
 */
import { TYPE_META, DEFAULT_META } from "./type-meta";

/** 내 플랜 목록(대시보드) — 사업 요약 + 표지형 플랜 카드 */
export default function PlanList() {
  const router = useRouter();
  const [state, setState] = useState<PlanState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  /** 결제 이력이 하나라도 있으면 샘플 줄을 접는다 — 이미 실물을 갖고 있으니 */
  const [hasAnyPaid, setHasAnyPaid] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [filter, setFilter] = useState<"all" | "todo" | "done">("all");

  useEffect(() => {
    let alive = true;
    hydrateFromServer().then((s) => {
      if (alive) setState(s);
    });
    fetch("/api/plan/access")
      .then((r) => r.json())
      .then((d) => { if (alive) setHasAnyPaid(!!d.hasAnyPaid); })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!state) {
    return (
      <div className={styles.page}>
        <div className={styles.frame}>
          <PlanLoading variant="deck" note="내 플랜을 불러오는 중…" />
        </div>
      </div>
    );
  }


  const planPct = (p: (typeof state.plans)[number]) => {
    const total = sectionCountForType(p.planType);
    const done = Object.keys(p.sections).filter((k) => k !== "financials/__review").length;
    return total ? Math.round((done / total) * 100) : 0;
  };
  /* 진행 중 → 시작 전 → 완성 순. 완성본은 볼 일이 적으니 맨 아래로 보낸다. */
  const ownPlans = state
    ? state.plans
        .filter((p) => !isSamplePlan(p.id))
        .sort((a, b) => {
          const rank = (p: typeof a) => {
            const pct = planPct(p);
            return pct === 100 ? 2 : pct > 0 ? 0 : 1;
          };
          const d = rank(a) - rank(b);
          return d !== 0 ? d : (b.updatedAt || "").localeCompare(a.updatedAt || "");
        })
    : [];
  const samples = state ? state.plans.filter((p) => isSamplePlan(p.id)) : [];

  function openPlan(id: string) {
    setActivePlan(id);
    router.push("/plan/overview");
  }

  function startRename(e: React.MouseEvent, id: string, title: string) {
    e.stopPropagation();
    setEditingId(id);
    setDraftTitle(title);
  }

  function commitRename(id: string) {
    const next = draftTitle.trim();
    if (next) {
      renamePlan(id, next);
      setState((prev) =>
        prev ? { ...prev, plans: prev.plans.map((p) => (p.id === id ? { ...p, title: next } : p)) } : prev,
      );
    }
    setEditingId(null);
  }

  function removePlan(e: React.MouseEvent, id: string, title: string) {
    e.stopPropagation();
    if (!confirm(`'${title}' 플랜을 삭제할까요? 작성한 내용도 함께 지워집니다.`)) return;
    deletePlan(id);
    setState((prev) => (prev ? { ...prev, plans: prev.plans.filter((p) => p.id !== id) } : prev));
  }

  const filtered = ownPlans.filter((p) => {
    const pct = planPct(p);
    if (filter === "todo") return pct < 100;
    if (filter === "done") return pct === 100;
    return true;
  });
  const counts = {
    all: ownPlans.length,
    todo: ownPlans.filter((p) => planPct(p) < 100).length,
    done: ownPlans.filter((p) => planPct(p) === 100).length,
    sample: samples.length,
  };

  const Row = ({ p, sample }: { p: (typeof state.plans)[number]; sample: boolean }) => {
    const total = sectionCountForType(p.planType);
    const done = Object.keys(p.sections).filter((k) => k !== "financials/__review").length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    const meta = TYPE_META[p.planType] ?? DEFAULT_META;
    const status = sample ? "sample" : pct === 100 ? "done" : pct === 0 ? "idle" : "live";
    return (
      <div
        className={`${styles.row} ${p.id === state.activePlanId ? styles.rowActive : ""}`}
        style={{ ["--acc" as string]: meta.accent }}
        role="button"
        tabIndex={0}
        onClick={() => openPlan(p.id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPlan(p.id); } }}
      >
        <span className={`${styles.check} ${status === "done" || sample ? styles.checkOn : ""}`} aria-hidden="true">
          {(status === "done" || sample) && <Check size={12} />}
        </span>
        <span className={styles.rowIcon} aria-hidden="true"><meta.Icon /></span>
        <span className={styles.rowMain}>
          {editingId === p.id ? (
            <input
              className={styles.titleInput}
              value={draftTitle}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraftTitle(e.target.value)}
              onBlur={() => commitRename(p.id)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") commitRename(p.id);
                if (e.key === "Escape") setEditingId(null);
              }}
            />
          ) : (
            <b>{sample ? p.title.replace(/^샘플 · /, "") : p.title}</b>
          )}
          <small>{p.planType}</small>
        </span>
        <span className={styles.rowMeta}>
          <span title="완료한 섹션"><ListChecks size={13} /> {done}/{total}</span>
          <span title="마지막 수정"><CalendarDays size={13} /> {new Date(p.updatedAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}</span>
        </span>
        <span className={`${styles.chip} ${styles[`chip_${status}`]}`}>
          {status === "sample" ? "샘플" : status === "done" ? "완성" : status === "idle" ? "시작 전" : `작성 중 ${pct}%`}
        </span>
        {sample ? (
          <span className={styles.rowActions} aria-hidden="true"><ChevronRight size={16} /></span>
        ) : (
          <span className={styles.rowActions}>
            <button type="button" className={styles.iconBtn} title="이름 변경" aria-label="이름 변경" onClick={(e) => startRename(e, p.id, p.title)}><Pencil size={14} /></button>
            <button type="button" className={styles.iconBtn} title="삭제" aria-label="삭제" onClick={(e) => removePlan(e, p.id, p.title)}><Trash2 size={14} /></button>
          </span>
        )}
      </div>
    );
  };

  return (
    <div className={styles.page}>
      {/*
        CRM UI Kit 의 Tasks 화면 구조 — [아이콘 레일] [현황 사이드바] [본문].
        레일은 PlanShell 이 그리고, 여기서는 현황 사이드바와 본문을 그린다.
        본문은 필터 칩 줄 + 행 목록. 카드 격자가 아니다.
      */}
      <div className={styles.layout}>
        {/* ── 현황 사이드바 ── */}
        <aside className={styles.side}>
          <div className={styles.sideHead}>
            <strong>플랜 현황</strong>
            <span>내 문서 전체</span>
          </div>
          <div className={styles.tiles}>
            {[
              { key: "all", label: "전체", value: counts.all, Icon: FileText },
              { key: "todo", label: "작성 중", value: counts.todo, Icon: PenLine },
              { key: "done", label: "완성", value: counts.done, Icon: CheckCircle2 },
              { key: "sample", label: "샘플", value: counts.sample, Icon: BookOpen },
            ].map((t) => (
              <div key={t.key} className={`${styles.tile} ${styles[`tile_${t.key}`]}`}>
                <span className={styles.tileText}><small>{t.label}</small><strong>{t.value}</strong></span>
                <span className={styles.tileIcon} aria-hidden="true"><t.Icon size={18} /></span>
              </div>
            ))}
          </div>

          {ownPlans.length > 0 && (
            <div className={styles.sideChart}>
              <div className={styles.sideHead}>
                <strong>진행 현황</strong>
                <span>플랜별 완료 비율</span>
              </div>
              <div className={styles.bars} aria-label="플랜별 진행률">
                {ownPlans.slice(0, 8).map((p) => (
                  <span key={p.id} className={styles.barCol} title={`${p.title} ${planPct(p)}%`}>
                    <i style={{ height: `${Math.max(6, planPct(p))}%` }} />
                  </span>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* ── 본문 ── */}
        <section className={styles.main}>
          <div className={styles.topbar}>
            <h2 className={styles.listTitle}>내 플랜</h2>
            <Link href="/plan/start" className={styles.newBtn}><Plus size={16} /> 새 플랜</Link>
          </div>

          <div className={styles.filters}>
            <div className={styles.segs} role="tablist" aria-label="플랜 필터">
              {([
                ["all", "전체", List],
                ["done", "완성", CheckCircle2],
                ["todo", "작성 중", Clock],
              ] as const).map(([key, label, Icon]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  className={`${styles.seg} ${filter === key ? styles.segOn : ""}`}
                  onClick={() => setFilter(key)}
                >
                  <Icon size={13} /> {label}
                </button>
              ))}
            </div>
            <span className={styles.sort}><ArrowDownUp size={13} /> 정렬: 최근 수정</span>
          </div>

          <div className={styles.list}>
            {/* 킷의 'Type to add a new task…' 줄 */}
            <Link href="/plan/start" className={`${styles.row} ${styles.rowNew}`}>
              <span className={styles.check} aria-hidden="true" />
              <span className={styles.rowMain}><b>새 플랜 만들기…</b><small>사업 이름과 한두 문장이면 시작됩니다</small></span>
              <span className={styles.rowActions} aria-hidden="true"><Plus size={16} /></span>
            </Link>

            {filtered.length === 0 && ownPlans.length > 0 && (
              <p className={styles.emptyRow}>이 조건에 맞는 플랜이 없어요.</p>
            )}
            {filtered.map((p) => <Row key={p.id} p={p} sample={false} />)}

            {!hasAnyPaid && samples.length > 0 && (
              <>
                <p className={styles.groupLabel}>완성 샘플 · 실제 AI로 만든 문서, 읽기 전용</p>
                {samples.map((p) => <Row key={p.id} p={p} sample />)}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
