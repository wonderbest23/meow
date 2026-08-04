"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sectionCountForType } from "../../lib/plan-builder/blueprint";
import { hydrateFromServer, setActivePlan, deletePlan, renamePlan, loadState, isSamplePlan, type PlanState } from "../../lib/plan-builder/plan-store";
import { Pencil, FileText, Plus, Rocket, TrendingUp, Landmark, ClipboardList, Users, Calculator, BarChart3 } from "lucide-react";
import styles from "./PlanList.module.css";

/**
 * 유형별 시각 정체성 — 색·아이콘·짧은 라벨.
 * 색만으로는 계획서와 재무 모델이 구별되지 않아서, 워터마크 아이콘과
 * 표지의 짧은 라벨(칩)까지 유형마다 다르게 둔다.
 */
const TYPE_META: Record<string, { accent: string; Icon: typeof FileText; short: string }> = {
  // 하드커버 딥톤 — 채도를 낮추고 어둡게, 금박 장식이 얹히는 바탕
  "창업 초기 · 사업계획서": { accent: "#1e3a6e", Icon: Rocket, short: "창업 초기" },
  "성장·확장 · 사업계획서": { accent: "#1d4a34", Icon: TrendingUp, short: "성장·확장" },
  "정부지원 · PSST 사업계획서": { accent: "#5c2e22", Icon: Landmark, short: "정부지원 PSST" },
  "간단 · 사업계획서": { accent: "#6e2f47", Icon: ClipboardList, short: "간단 요약" },
  "내부용 · 사업계획서": { accent: "#3b3370", Icon: Users, short: "내부 전략" },
  "창업 초기 · 재무 예측": { accent: "#14494e", Icon: Calculator, short: "재무 예측" },
  "정밀 · 재무 모델": { accent: "#23303f", Icon: BarChart3, short: "재무 모델" },
};
const DEFAULT_META = { accent: "#1e3a6e", Icon: FileText, short: "사업계획서" };

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
        <div className={styles.frame} />
      </div>
    );
  }


  const ownPlans = state ? state.plans.filter((p) => !isSamplePlan(p.id)) : [];
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
          사업 정보는 마이페이지에 둔다.
          플랜이 여러 개인데 목록 맨 위에 사업 카드가 하나 떠 있으면
          어느 플랜의 정보인지 읽히지 않는다. 여기는 플랜만 늘어놓는다.
        */}
        {/* 플랜 목록 */}
        <div className={styles.listHead}>
          <h2 className={styles.listTitle}>
            내 플랜<span>{ownPlans.length}개</span>
          </h2>
          <Link href="/plan/start" className={styles.newBtn}>+ 새 플랜</Link>
        </div>

        {ownPlans.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>아직 만든 플랜이 없어요</p>
            <p className={styles.emptyDesc}>사업 정보를 입력하고 첫 사업계획서를 시작해보세요.</p>
            <Link href="/plan/start" className={styles.newBtn}>+ 첫 플랜 만들기</Link>
          </div>
        ) : (
          <div className={styles.deck}>
            {ownPlans.map((p) => {
              const total = sectionCountForType(p.planType);
              const done = Object.keys(p.sections).filter((k) => k !== "financials/__review").length;
              const pct = total ? Math.round((done / total) * 100) : 0;
              const isActive = p.id === state.activePlanId;
              const meta = TYPE_META[p.planType] ?? DEFAULT_META;
              const acc = meta.accent;
              // 예시 플랜은 읽기 전용 — 이름 변경·복제·삭제를 걸지 않는다
              const sample = isSamplePlan(p.id);
              return (
                <button
                  key={p.id}
                  className={styles.planCard}
                  style={{ ["--acc" as string]: acc }}
                  onClick={() => openPlan(p.id)}
                >
                  <span className={`${styles.sheet} ${isActive ? styles.sheetActive : ""}`}>
                    <span className={styles.cover}>
                      <span className={styles.spine} aria-hidden="true" />
                      <span className={styles.coverFrame} aria-hidden="true" />
                      <span className={styles.pages} aria-hidden="true" />
                      {sample ? (
                        <span className={styles.coverBadge}>예시</span>
                      ) : isActive ? (
                        <span className={styles.coverBadge}>작업 중</span>
                      ) : null}
                      <span className={styles.emblem} aria-hidden="true"><meta.Icon /></span>
                      <span className={styles.orn} aria-hidden="true"><i /><b>❦</b><i /></span>
                      {pct === 100 && <span className={styles.stamp} aria-label="완성됨">완성</span>}
                      {editingId === p.id ? (
                        <input
                          className={styles.coverInput}
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
                        <span className={styles.coverName}>
                          {p.title}
                          {sample ? null : <span
                            role="button"
                            tabIndex={0}
                            className={styles.renameBtn}
                            title="이름 변경"
                            onClick={(e) => startRename(e, p.id, p.title)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") startRename(e as unknown as React.MouseEvent, p.id, p.title);
                            }}
                          >
                            <Pencil size={12} />
                          </span>}
                        </span>
                      )}
                      <span className={styles.band}>{meta.short}</span>
                      <span className={styles.coverType}>{p.planType}</span>
                    </span>
                    <span className={styles.strip}>
                      {pct === 0 ? (
                        <b className={styles.notStarted}>시작 전</b>
                      ) : (
                        <>
                          <span className={styles.bar}>
                            <span className={`${styles.barFill} ${pct === 100 ? styles.done : ""}`} style={{ width: `${pct}%` }} />
                          </span>
                          <b className={styles.pct}>{pct === 100 ? "완성" : `${pct}%`}</b>
                        </>
                      )}
                    </span>
                  </span>
                  <span className={styles.cardMeta}>
                    <span className={styles.metaType}>{p.planType}</span>
                    <span className={styles.metaRow}>
                      <span className={styles.date}>{new Date(p.updatedAt).toLocaleDateString("ko-KR")}</span>
                      {sample ? null : <><span
                        role="button"
                        tabIndex={0}
                        className={styles.delBtn}
                        onClick={(e) => removePlan(e, p.id, p.title)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") removePlan(e as unknown as React.MouseEvent, p.id, p.title);
                        }}
                      >
                        삭제
                      </span></>}
                    </span>
                  </span>
                </button>
              );
            })}

            {/* 레퍼런스의 + New Plan 점선 카드 */}
            <Link href="/plan/start" className={styles.newCard}>
              <span className={styles.newCardInner}>
                <span className={styles.newCardBody}>
                  <Plus size={22} />
                  새 플랜
                </span>
                {/* 플랜 카드의 진행 바 자리를 그대로 비워 둔다 — 높이가 어긋나지 않게 */}
                <span className={styles.strip} aria-hidden="true">
                  <span className={styles.bar} />
                  <b className={styles.pct}>&nbsp;</b>
                </span>
              </span>
              {/* 플랜 카드 아래 유형·날짜 줄과 같은 높이를 비워 두 카드의 아랫단을 맞춘다 */}
              <span className={styles.cardMeta} aria-hidden="true">
                <span className={styles.metaType}>&nbsp;</span>
                <span className={styles.metaRow}>
                  <span className={styles.date}>&nbsp;</span>
                </span>
              </span>
            </Link>
          </div>
        )}

        {/* 결제 전 샘플 — 어드민이 실제 AI로 만든 완성본 3부. 결제 이력이 생기면 접는다. */}
        {!hasAnyPaid && samples.length > 0 && (
          <div className={styles.sampleBlock}>
            <div className={styles.listHead}>
              <h2 className={styles.listTitle}>
                결제 전에 완성본을 확인하세요<span>샘플 {samples.length}부</span>
              </h2>
            </div>
            <div className={styles.deck}>
              {samples.map((p) => {
                const meta = TYPE_META[p.planType] ?? DEFAULT_META;
                return (
                  <button
                    key={p.id}
                    className={styles.planCard}
                    style={{ ["--acc" as string]: meta.accent }}
                    onClick={() => openPlan(p.id)}
                  >
                    <span className={styles.sheet}>
                      <span className={styles.cover}>
                        <span className={styles.spine} aria-hidden="true" />
                        <span className={styles.coverFrame} aria-hidden="true" />
                        <span className={styles.pages} aria-hidden="true" />
                        <span className={styles.coverBadge}>샘플</span>
                        <span className={styles.emblem} aria-hidden="true"><meta.Icon /></span>
                        <span className={styles.orn} aria-hidden="true"><i /><b>❦</b><i /></span>
                        <span className={styles.sampleMark} aria-hidden="true">SAMPLE</span>
                        <span className={styles.coverName}>{p.title.replace(/^샘플 · /, "")}</span>
                        <span className={styles.band}>{meta.short}</span>
                        <span className={styles.coverType}>{p.planType}</span>
                      </span>
                      <span className={styles.strip}>
                        <span className={styles.bar}><span className={`${styles.barFill} ${styles.done}`} style={{ width: "100%" }} /></span>
                        <b className={styles.pct}>완성</b>
                      </span>
                    </span>
                    <span className={styles.cardMeta}>
                      <span className={styles.metaType}>{p.planType}</span>
                      <span className={styles.metaRow}>
                        <span className={styles.date}>실제 AI 생성 문서 · 읽기 전용</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
