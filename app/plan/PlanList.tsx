"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { totalSections } from "../../lib/plan-builder/blueprint";
import { hydrateFromServer, setActivePlan, deletePlan, type PlanState } from "../../lib/plan-builder/plan-store";
import styles from "./PlanList.module.css";

/** 내 플랜 목록(대시보드) — 사업 요약 + 플랜 카드 */
export default function PlanList() {
  const router = useRouter();
  const [state, setState] = useState<PlanState | null>(null);

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

  const total = totalSections();
  const biz = state.business;

  function openPlan(id: string) {
    setActivePlan(id);
    router.push("/plan/overview");
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
          <div className={styles.grid}>
            {state.plans.map((p) => {
              const done = Object.keys(p.sections).length;
              const pct = total ? Math.round((done / total) * 100) : 0;
              const isActive = p.id === state.activePlanId;
              return (
                <button key={p.id} className={`${styles.card} ${isActive ? styles.active : ""}`} onClick={() => openPlan(p.id)}>
                  <div className={styles.cardTop}>
                    <span className={styles.cardType}>{p.planType}</span>
                    {isActive && <span className={styles.activeBadge}>작업 중</span>}
                  </div>
                  <h3 className={styles.cardTitle}>{p.title}</h3>
                  <div className={styles.progressRow}>
                    <span className={styles.bar}>
                      <span className={`${styles.barFill} ${pct === 100 ? styles.done : ""}`} style={{ width: `${pct}%` }} />
                    </span>
                    <span className={styles.pct}>{done}/{total} · {pct}%</span>
                  </div>
                  <div className={styles.cardFoot}>
                    <span className={styles.date}>{new Date(p.updatedAt).toLocaleDateString("ko-KR")} 수정</span>
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
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
