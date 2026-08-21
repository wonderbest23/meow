"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sectionCountForType } from "../../lib/plan-builder/blueprint";
import { hydrateFromServer, setActivePlan, deletePlan, renamePlan, loadState, isSamplePlan, type PlanState } from "../../lib/plan-builder/plan-store";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
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

  return (
    <div className={styles.page}>
      <div className={styles.frame}>
        {/*
          CRM UI Kit(Dashboard) 배치 — 옅은 바탕 위 흰 카드, 제목 한 줄, 숫자는 최소.
          예전의 통계 카드 셋·안내 말풍선·포스터형 표지는 '어렵다'는 피드백으로
          걷어냈다. 한 카드에 제목·유형·진행 한 줄이면 충분하다.
        */}
        <div className={styles.listHead}>
          <h2 className={styles.listTitle}>내 플랜</h2>
          {ownPlans.length > 0 && (
            <Link href="/plan/start" className={styles.newBtn}><Plus size={16} /> 새 플랜</Link>
          )}
        </div>

        {ownPlans.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyArt} aria-hidden="true"><FileText size={28} /></span>
            <p className={styles.emptyTitle}>아직 만든 플랜이 없어요</p>
            <p className={styles.emptyDesc}>사업 이름과 한두 문장 설명이면 시작할 수 있어요.</p>
            <Link href="/plan/start" className={styles.newBtn}><Plus size={16} /> 첫 플랜 만들기</Link>
          </div>
        ) : (
          <div className={styles.deck}>
            {ownPlans.map((p) => {
              const total = sectionCountForType(p.planType);
              const done = Object.keys(p.sections).filter((k) => k !== "financials/__review").length;
              const pct = total ? Math.round((done / total) * 100) : 0;
              const isActive = p.id === state.activePlanId;
              const meta = TYPE_META[p.planType] ?? DEFAULT_META;
              return (
                <div
                  key={p.id}
                  className={`${styles.card} ${isActive ? styles.cardActive : ""}`}
                  style={{ ["--acc" as string]: meta.accent }}
                  role="button"
                  tabIndex={0}
                  onClick={() => openPlan(p.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPlan(p.id); } }}
                >
                  <div className={styles.cardTop}>
                    <span className={styles.emblem} aria-hidden="true"><meta.Icon /></span>
                    <span className={styles.cardActions}>
                      <button type="button" className={styles.iconBtn} title="이름 변경" aria-label="이름 변경" onClick={(e) => startRename(e, p.id, p.title)}><Pencil size={14} /></button>
                      <button type="button" className={styles.iconBtn} title="삭제" aria-label="삭제" onClick={(e) => removePlan(e, p.id, p.title)}><Trash2 size={14} /></button>
                    </span>
                  </div>

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
                    <strong className={styles.cardTitle}>{p.title}</strong>
                  )}
                  <span className={styles.cardType}>{p.planType}</span>

                  <div className={styles.progress}>
                    <span className={styles.progressNum}><b>{done}</b> / {total} <small>섹션 완료</small></span>
                    <span className={styles.bar}><span className={`${styles.barFill} ${pct === 100 ? styles.done : ""}`} style={{ width: `${pct}%` }} /></span>
                  </div>

                  <div className={styles.cardFoot}>
                    <span>{pct === 100 ? "완성" : pct === 0 ? "시작 전" : "작성 중"}</span>
                    <span>{new Date(p.updatedAt).toLocaleDateString("ko-KR")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 결제 전 샘플 — 어드민이 실제 AI로 만든 완성본. 결제 이력이 생기면 접는다. */}
        {!hasAnyPaid && samples.length > 0 && (
          <div className={styles.sampleBlock}>
            <div className={styles.listHead}>
              <h2 className={styles.sectionTitle}>완성 샘플 미리 보기</h2>
              <span className={styles.sectionNote}>실제 AI로 만든 문서 · 읽기 전용</span>
            </div>
            <div className={styles.deck}>
              {samples.map((p) => {
                const meta = TYPE_META[p.planType] ?? DEFAULT_META;
                return (
                  <div
                    key={p.id}
                    className={styles.card}
                    style={{ ["--acc" as string]: meta.accent }}
                    role="button"
                    tabIndex={0}
                    onClick={() => openPlan(p.id)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openPlan(p.id); } }}
                  >
                    <div className={styles.cardTop}>
                      <span className={styles.emblem} aria-hidden="true"><meta.Icon /></span>
                      <span className={styles.sampleTag}>샘플</span>
                    </div>
                    <strong className={styles.cardTitle}>{p.title.replace(/^샘플 · /, "")}</strong>
                    <span className={styles.cardType}>{p.planType}</span>
                    <div className={styles.progress}>
                      <span className={styles.progressNum}><b>{sectionCountForType(p.planType)}</b> / {sectionCountForType(p.planType)} <small>섹션 완료</small></span>
                      <span className={styles.bar}><span className={`${styles.barFill} ${styles.done}`} style={{ width: "100%" }} /></span>
                    </div>
                    <div className={styles.cardFoot}>
                      <span>완성</span>
                      <span>열어 보기 →</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
