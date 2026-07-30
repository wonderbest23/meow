"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sectionCountForType } from "../../lib/plan-builder/blueprint";
import { hydrateFromServer, setActivePlan, deletePlan, renamePlan, duplicatePlan, loadState, type PlanState } from "../../lib/plan-builder/plan-store";
import { Pencil, FileText, Plus } from "lucide-react";
import styles from "./PlanList.module.css";

/** 플랜 유형 → 표지 색 (start 페이지 카드와 같은 계열) */
const COVER_ACCENTS: Record<string, string> = {
  "창업 초기 · 사업계획서": "#3358f4",
  "성장·확장 · 사업계획서": "#12a58a",
  "간단 · 사업계획서": "#de5f7d",
  "내부용 · 사업계획서": "#6b5bdd",
  "창업 초기 · 재무 예측": "#2f6fe0",
  "정밀 · 재무 모델": "#2f7bd6",
};

/** 내 플랜 목록(대시보드) — 사업 요약 + 표지형 플랜 카드 */
export default function PlanList() {
  const router = useRouter();
  const [state, setState] = useState<PlanState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  useEffect(() => {
    let alive = true;
    hydrateFromServer().then((s) => {
      if (alive) setState(s);
    });
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

  const biz = state.business;

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

  function copyPlan(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    const newId = duplicatePlan(id);
    if (newId) setState(loadState());
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
        {/* 사업 요약 */}
        {biz.name ? (
          <div className={styles.bizCard}>
            <div className={styles.bizMain}>
              <div className={styles.bizLabel}>내 사업</div>
              <h1 className={styles.bizName}>{biz.name}</h1>
              {biz.description && <p className={styles.bizDesc}>{biz.description}</p>}
              <div className={styles.bizMeta}>
                {biz.industry && <span className={styles.tag}>{biz.industry}</span>}
                {biz.region && <span className={styles.tag}>{biz.region}</span>}
                {biz.stage && <span className={styles.tag}>{biz.stage}</span>}
                {biz.role && <span className={styles.tag}>{biz.role}</span>}
              </div>
            </div>
            <Link href="/plan/start" className={styles.editBtn}>사업 정보 수정</Link>
          </div>
        ) : null}

        {/* 플랜 목록 */}
        <div className={styles.listHead}>
          <h2 className={styles.listTitle}>
            내 플랜<span>{state.plans.length}개</span>
          </h2>
          <Link href="/plan/start" className={styles.newBtn}>+ 새 플랜</Link>
        </div>

        {state.plans.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>아직 만든 플랜이 없어요</p>
            <p className={styles.emptyDesc}>사업 정보를 입력하고 첫 사업계획서를 시작해보세요.</p>
            <Link href="/plan/start" className={styles.newBtn}>+ 첫 플랜 만들기</Link>
          </div>
        ) : (
          <div className={styles.deck}>
            {state.plans.map((p) => {
              const total = sectionCountForType(p.planType);
              const done = Object.keys(p.sections).filter((k) => k !== "financials/__review").length;
              const pct = total ? Math.round((done / total) * 100) : 0;
              const isActive = p.id === state.activePlanId;
              const acc = COVER_ACCENTS[p.planType] ?? "#3358f4";
              return (
                <button
                  key={p.id}
                  className={styles.planCard}
                  style={{ ["--acc" as string]: acc }}
                  onClick={() => openPlan(p.id)}
                >
                  <span className={`${styles.sheet} ${isActive ? styles.sheetActive : ""}`}>
                    <span className={styles.cover}>
                      {isActive && <span className={styles.coverBadge}>작업 중</span>}
                      <span className={styles.coverIcon} aria-hidden="true"><FileText /></span>
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
                          <span
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
                          </span>
                        </span>
                      )}
                    </span>
                    <span className={styles.strip}>
                      <span className={styles.bar}>
                        <span className={`${styles.barFill} ${pct === 100 ? styles.done : ""}`} style={{ width: `${pct}%` }} />
                      </span>
                      <b className={styles.pct}>{pct}%</b>
                    </span>
                  </span>
                  <span className={styles.cardMeta}>
                    <span className={styles.metaType}>{p.planType}</span>
                    <span className={styles.metaRow}>
                      <span className={styles.date}>{new Date(p.updatedAt).toLocaleDateString("ko-KR")}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        className={styles.copyBtn}
                        title="이 플랜을 복제"
                        onClick={(e) => copyPlan(e, p.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") copyPlan(e as unknown as React.MouseEvent, p.id);
                        }}
                      >
                        복제
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        className={styles.delBtn}
                        onClick={(e) => removePlan(e, p.id, p.title)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") removePlan(e as unknown as React.MouseEvent, p.id, p.title);
                        }}
                      >
                        삭제
                      </span>
                    </span>
                  </span>
                </button>
              );
            })}

            {/* 레퍼런스의 + New Plan 점선 카드 */}
            <Link href="/plan/start" className={styles.newCard}>
              <span className={styles.newCardInner}>
                <Plus size={22} />
                새 플랜
              </span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
