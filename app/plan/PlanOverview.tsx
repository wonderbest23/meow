"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { chaptersForType, sectionCountForType, type PlanSectionStatus } from "../../lib/plan-builder/blueprint";
import {
  planStatuses,
  assembleSections,
  hydrateFromServer,
  activePlan,
  answeredSectionKeys,
  loadState,
  loadAnswers,
  saveSection,
  priorSectionsSummary,
} from "../../lib/plan-builder/plan-store";
import { findConsistencyIssues, type ConsistencyIssue } from "../../lib/plan-builder/consistency";
import { estimateMinutes } from "../../lib/plan-builder/questions";
import ConsistencyPanel from "./ConsistencyPanel";
import { LayoutGrid, FileText, Zap, Lock, Presentation } from "lucide-react";
import styles from "./PlanOverview.module.css";

// 챕터 톤(1~6) → 밴드 배경 / 강조색 (오늘창업 블루 계열 파스텔)
const TONES: Record<number, { bg: string; accent: string }> = {
  1: { bg: "#eef1ff", accent: "#3358f4" }, // 인디고
  2: { bg: "#e7f5f0", accent: "#12a58a" }, // 민트-블루
  3: { bg: "#eaf3fb", accent: "#2f7bd6" }, // 스카이
  4: { bg: "#eef0ff", accent: "#4b5be6" }, // 페리윙클
  5: { bg: "#e8f2fd", accent: "#2f6fe0" }, // 로열
  6: { bg: "#f0eefc", accent: "#6b5bdd" }, // 바이올렛-블루
};

const CheckIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
    <path d="M5 12.5 10 17l9-11" />
  </svg>
);

export interface PlanOverviewProps {
  /** 섹션 완료 상태 맵 (key = `${chapterId}/${sectionId}`) */
  statuses?: Record<string, PlanSectionStatus>;
  /** 섹션 클릭 시 (다음 단계에서 위저드로 연결) */
  onOpenSection?: (chapterId: string, sectionId: string) => void;
  /** 뒤로 */
  onBack?: () => void;
  /** 문서 보기 화면으로 */
  onOpenDocument?: () => void;
  planTitle?: string;
}

export default function PlanOverview({ statuses: propStatuses = {}, onOpenSection, onBack, onOpenDocument, planTitle = "새 플랜" }: PlanOverviewProps) {
  const [storeStatuses, setStoreStatuses] = useState<Record<string, PlanSectionStatus>>({});
  const [assembled, setAssembled] = useState<ReturnType<typeof assembleSections>>([]);
  const [inProgress, setInProgress] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<{ done: number; total: number; current: string | null } | null>(null);
  const cancelBulk = useRef(false);
  const [title, setTitle] = useState(planTitle);
  const [type, setType] = useState<string | undefined>(undefined);
  const [issues, setIssues] = useState<ConsistencyIssue[]>([]);
  /** 잠근 섹션 — 일괄 생성이 건너뛴다 */
  const [lockedKeys, setLockedKeys] = useState<Set<string>>(new Set());

  // 서버(→로컬 캐시)에서 상태·본문 하이드레이트
  useEffect(() => {
    let alive = true;
    hydrateFromServer().then((s) => {
      if (!alive) return;
      setStoreStatuses(planStatuses(s));
      setAssembled(assembleSections(s));
      setInProgress(new Set(answeredSectionKeys(s)));
      const p = activePlan(s);
      if (p) {
        setTitle(p.title);
        setType(p.planType);
      }
      setIssues(findConsistencyIssues(p?.answers ?? {}, s.business));
      setLockedKeys(new Set(Object.entries(p?.sections ?? {}).filter(([, v]) => v?.locked).map(([k]) => k)));
    });
    return () => {
      alive = false;
    };
  }, []);

  /** 이 플랜 유형이 실제로 채우는 챕터·섹션 */
  const chapters = useMemo(() => chaptersForType(type), [type]);

  // 스토어에 생성된 게 있으면 스토어 우선, 없으면 데모 prop
  const statuses = Object.keys(storeStatuses).length ? storeStatuses : propStatuses;

  const { doneCount, total, pct } = useMemo(() => {
    const total = sectionCountForType(type);
    let done = 0;
    for (const ch of chapters) {
      for (const s of ch.sections) {
        if (statuses[`${ch.id}/${s.id}`] === "done") done += 1;
      }
    }
    return { doneCount: done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [statuses, type, chapters]);

  // 아직 생성되지 않았지만 답변이 있는 섹션 = 일괄 생성 대상
  const pendingKeys = useMemo(() => {
    const out: Array<{ key: string; chapterId: string; sectionId: string; title: string }> = [];
    for (const ch of chapters) {
      for (const s of ch.sections) {
        const key = `${ch.id}/${s.id}`;
        if (statuses[key] !== "done" && inProgress.has(key) && !lockedKeys.has(key)) {
          out.push({ key, chapterId: ch.id, sectionId: s.id, title: s.title });
        }
      }
    }
    return out;
  }, [statuses, inProgress, chapters, lockedKeys]);

  /** 답변이 있는 미생성 섹션을 순차 생성한다(앞 섹션 결과가 뒤에 반영되도록 순서 유지). */
  async function generateAll() {
    if (pendingKeys.length === 0) return;
    cancelBulk.current = false;
    setBulk({ done: 0, total: pendingKeys.length, current: null });

    const state = loadState();
    const plan = activePlan(state);
    if (!plan) {
      setBulk(null);
      return;
    }

    for (let i = 0; i < pendingKeys.length; i += 1) {
      if (cancelBulk.current) break;
      const target = pendingKeys[i];
      setBulk({ done: i, total: pendingKeys.length, current: target.title });
      try {
        const res = await fetch("/api/plan/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chapterId: target.chapterId,
            sectionId: target.sectionId,
            answers: loadAnswers(target.key),
            planTitle: plan.title,
            planType: plan.planType,
            planId: plan.id,
            business: state.business,
            priorSummary: priorSectionsSummary(target.key),
            allAnswers: activePlan()?.answers ?? {},
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { markdown?: string; html?: string };
          if (data.markdown && data.html) saveSection(target.key, data.markdown, data.html);
        }
      } catch {
        // 실패한 섹션은 건너뛰고 계속 진행
      }
    }

    setBulk(null);
    // 결과 반영
    const next = loadState();
    setStoreStatuses(planStatuses(next));
    setAssembled(assembleSections(next));
    setInProgress(new Set(answeredSectionKeys(next)));
    setIssues(findConsistencyIssues(activePlan(next)?.answers ?? {}, next.business));
    const np = activePlan(next);
    setLockedKeys(new Set(Object.entries(np?.sections ?? {}).filter(([, v]) => v?.locked).map(([k]) => k)));
  }

  /** 다음에 손대야 할 섹션 — 아직 생성되지 않은 첫 섹션 */
  const nextKey = useMemo(() => {
    for (const ch of chapters) {
      for (const s of ch.sections) {
        const key = `${ch.id}/${s.id}`;
        if (statuses[key] !== "done") return key;
      }
    }
    return null;
  }, [statuses, chapters]);

  // 전역 순번(1-based)
  let counter = 0;

  return (
    <div className={styles.page}>
      <div className={styles.frame}>
       <div className={styles.app}>
        <div className={styles.main}>
        <div className={styles.bar}>
          <div className={styles.barLeft}>
            <button type="button" className={styles.back} onClick={onBack} aria-label="뒤로">
              ←
            </button>
            <h1 className={styles.title}>
              플랜 개요 <span>· {title}</span>
            </h1>
          </div>
        </div>

        {/* 진행 미터 */}
        <div className={styles.meters}>
          <div className={styles.meter}>
            <div className={styles.meterLabel}>전략 깊이</div>
            <div className={styles.meterRow}>
              <span className={styles.meterValue}>{doneCount >= total * 0.6 ? "높음" : doneCount > 0 ? "보통" : "낮음"}</span>
              <span className={styles.segs}>
                {[0, 1, 2, 3].map((i) => (
                  <i key={i} className={i < Math.ceil((doneCount / Math.max(total, 1)) * 4) ? styles.on : ""} />
                ))}
              </span>
            </div>
          </div>
          <div className={styles.meter}>
            <div className={styles.meterLabel}>진행률</div>
            <div className={styles.meterRow}>
              <span className={styles.meterValue}>{pct}%</span>
              <span className={styles.segs}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <i key={i} className={i < Math.round((pct / 100) * 5) ? styles.ok : ""} />
                ))}
              </span>
            </div>
          </div>
          <div className={styles.meter}>
            <div className={styles.meterLabel}>완료 섹션</div>
            <div className={styles.meterRow}>
              <span className={styles.meterValue}>
                {doneCount} / {total}
              </span>
            </div>
          </div>
          <div className={styles.spring} />
        </div>

        {/* 다 채운 사람에게 마지막 단계 — 발표자료 */}
        {doneCount > 0 && doneCount === total && (
          <button type="button" className={styles.finale} onClick={onOpenDocument}>
            <span className={styles.finaleIcon} aria-hidden="true"><Presentation size={22} /></span>
            <span className={styles.finaleBody}>
              <b>{total}개 섹션을 모두 채우셨습니다</b>
              <span>이제 이 내용으로 사업 제안서(PPT)를 만들 수 있어요. 문서 화면에서 바로 받으실 수 있습니다.</span>
            </span>
            <span className={styles.finaleGo}>제안서 만들기 →</span>
          </button>
        )}

        <ConsistencyPanel issues={issues} onOpenSection={onOpenSection} />

        {/* 구조 / 문서 전환 */}
        <div className={styles.tools}>
          <div className={styles.seg}>
            <button type="button" className={styles.segOn}><LayoutGrid size={13} /> 구조 보기</button>
            <button type="button" onClick={onOpenDocument}><FileText size={13} /> 문서 보기</button>
          </div>
          <span className={styles.docCount}>생성 완료 {assembled.length}개</span>
          <div className={styles.spring} />
          {bulk ? (
            <div className={styles.bulkStatus}>
              <span className={styles.bulkBar}>
                <span className={styles.bulkFill} style={{ width: `${Math.round((bulk.done / bulk.total) * 100)}%` }} />
              </span>
              <span className={styles.bulkText}>
                {bulk.current ? `${bulk.current} 생성 중…` : "준비 중…"} ({bulk.done}/{bulk.total})
              </span>
              <button type="button" className={styles.bulkCancel} onClick={() => (cancelBulk.current = true)}>
                중지
              </button>
            </div>
          ) : (
            <button type="button" className={styles.bulkBtn} onClick={generateAll} disabled={pendingKeys.length === 0}>
              <Zap size={13} /> 남은 {pendingKeys.length}개 한번에 생성
            </button>
          )}
        </div>

        {/* 챕터 밴드 */}
        <div className={styles.plan}>
          {chapters.map((chapter, ci) => {
            const tone = TONES[chapter.tone] ?? TONES[1];
            return (
              <div
                key={chapter.id}
                className={styles.band}
                style={{ ["--bandBg" as string]: tone.bg, ["--bandAccent" as string]: tone.accent }}
              >
                <div className={styles.chapHead}>
                  <span className={styles.chapNo}>{ci + 1}</span>
                  <h3 className={styles.chapName}>{chapter.title}</h3>
                  {(() => {
                    const d = chapter.sections.filter((sec) => statuses[`${chapter.id}/${sec.id}`] === "done").length;
                    const t = chapter.sections.length;
                    return (
                      <span className={`${styles.chapCount} ${d === t && t > 0 ? styles.chapCountDone : ""}`}>
                        {d === t && t > 0 ? "완료 " : ""}{d}/{t}
                      </span>
                    );
                  })()}
                </div>
                <div className={styles.nodes}>
                  {chapter.sections.map((section) => {
                    counter += 1;
                    const key = `${chapter.id}/${section.id}`;
                    const done = statuses[key] === "done";
                    const writing = !done && inProgress.has(key);
                    const isNext = key === nextKey;
                    const isLocked = lockedKeys.has(key);
                    const num = counter;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        className={`${styles.node} ${done ? styles.done : ""} ${writing ? styles.writing : ""} ${isNext ? styles.next : ""}`}
                        onClick={() => onOpenSection?.(chapter.id, section.id)}
                        title={section.summary}
                      >
                        <span className={styles.nodeNum}>{done ? <CheckIcon /> : num}</span>
                        <span className={styles.nodeLabel}>{section.title}</span>
                        {isLocked && <span className={styles.lockTag} title="잠긴 섹션 — 일괄 생성이 건너뜁니다"><Lock size={10} strokeWidth={2.4} /></span>}
                        {isNext && <span className={styles.nextTag}>여기부터</span>}
                        {writing && !isNext && <span className={styles.writingTag}>작성 중</span>}
                        {done && <span className={styles.nodeDoneTag}>완료</span>}
                        <span className={styles.nodeTime}>{estimateMinutes(`${chapter.id}/${section.id}`, section.title, type)}분</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        </div>
       </div>
      </div>
    </div>
  );
}
