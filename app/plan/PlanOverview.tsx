"use client";

import { useEffect, useMemo, useState } from "react";
import { PLAN_BLUEPRINT, totalSections, type PlanSectionStatus } from "../../lib/plan-builder/blueprint";
import { planStatuses, assembleSections, hydrateFromServer } from "../../lib/plan-builder/plan-store";
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

const Connector = () => (
  <div className={styles.conn} aria-hidden="true">
    <svg viewBox="0 0 60 36" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 5 C 44 7, 48 16, 42 30" />
      <path d="M34 24 l8 8 8 -6" />
    </svg>
  </div>
);

export interface PlanOverviewProps {
  /** 섹션 완료 상태 맵 (key = `${chapterId}/${sectionId}`) */
  statuses?: Record<string, PlanSectionStatus>;
  /** 섹션 클릭 시 (다음 단계에서 위저드로 연결) */
  onOpenSection?: (chapterId: string, sectionId: string) => void;
  /** 뒤로 */
  onBack?: () => void;
  planTitle?: string;
}

export default function PlanOverview({ statuses: propStatuses = {}, onOpenSection, onBack, planTitle = "새 플랜" }: PlanOverviewProps) {
  const [view, setView] = useState<"structure" | "document">("structure");
  const [storeStatuses, setStoreStatuses] = useState<Record<string, PlanSectionStatus>>({});
  const [assembled, setAssembled] = useState<ReturnType<typeof assembleSections>>([]);
  const [title, setTitle] = useState(planTitle);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);

  // 서버(→로컬 캐시)에서 상태·본문 하이드레이트
  useEffect(() => {
    let alive = true;
    hydrateFromServer().then((s) => {
      if (!alive) return;
      setStoreStatuses(planStatuses(s));
      setAssembled(assembleSections(s));
      if (s.title) setTitle(s.title);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 스토어에 생성된 게 있으면 스토어 우선, 없으면 데모 prop
  const statuses = Object.keys(storeStatuses).length ? storeStatuses : propStatuses;

  async function handleExport(format: "pdf" | "docx") {
    if (!assembled.length) return;
    setExporting(format);
    try {
      const res = await fetch("/api/plan/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, format, sections: assembled.map((a) => ({ chapterTitle: a.chapterTitle, sectionTitle: a.sectionTitle, markdown: a.markdown })) }),
      });
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("내보내기에 실패했습니다. 생성된 섹션이 있는지 확인해주세요.");
    } finally {
      setExporting(null);
    }
  }

  const { doneCount, total, pct } = useMemo(() => {
    const total = totalSections();
    let done = 0;
    for (const ch of PLAN_BLUEPRINT) {
      for (const s of ch.sections) {
        if (statuses[`${ch.id}/${s.id}`] === "done") done += 1;
      }
    }
    return { doneCount: done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  }, [statuses]);

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

        {/* 구조 / 문서 토글 */}
        <div className={styles.tools}>
          <div className={styles.seg}>
            <button type="button" className={view === "structure" ? styles.segOn : ""} onClick={() => setView("structure")}>
              🧭 구조 보기
            </button>
            <button type="button" className={view === "document" ? styles.segOn : ""} onClick={() => setView("document")}>
              📄 문서 보기
            </button>
          </div>
        </div>

        {/* 문서 보기: 조립 문서 + 내보내기 */}
        {view === "document" && (
          <div className={styles.docView}>
            <div className={styles.exportBar}>
              <div className={styles.exportInfo}>
                생성된 섹션 <b>{assembled.length}</b>개 · {title}
              </div>
              <button className={styles.exportBtn} disabled={!assembled.length || exporting !== null} onClick={() => handleExport("pdf")}>
                {exporting === "pdf" ? "내보내는 중…" : "PDF 내보내기"}
              </button>
              <button className={styles.exportBtn} disabled={!assembled.length || exporting !== null} onClick={() => handleExport("docx")}>
                {exporting === "docx" ? "내보내는 중…" : "Word 내보내기"}
              </button>
            </div>
            {assembled.length === 0 ? (
              <div className={styles.docEmpty}>아직 생성된 섹션이 없습니다. 구조 보기에서 섹션을 열어 답변하고 생성해보세요.</div>
            ) : (
              assembled.map((a) => (
                <section key={a.key} className={styles.docSection}>
                  <div className={styles.docCrumb}>{a.chapterTitle}</div>
                  <h2 className={styles.docTitle}>{a.sectionTitle}</h2>
                  <div className={styles.docBody} dangerouslySetInnerHTML={{ __html: a.html }} />
                </section>
              ))
            )}
          </div>
        )}

        {/* 챕터 밴드 */}
        {view === "structure" && (
        <div className={styles.plan}>
          {PLAN_BLUEPRINT.map((chapter, ci) => {
            const tone = TONES[chapter.tone] ?? TONES[1];
            return (
              <div
                key={chapter.id}
                className={styles.band}
                style={{ ["--bandBg" as string]: tone.bg, ["--bandAccent" as string]: tone.accent }}
              >
                <div>
                  <div className={styles.chapNo}>챕터 {ci + 1}</div>
                  <h3 className={styles.chapName}>
                    <b>{chapter.lead}</b>
                    {chapter.rest}
                  </h3>
                </div>
                <div className={styles.nodes}>
                  {chapter.sections.map((section) => {
                    counter += 1;
                    const key = `${chapter.id}/${section.id}`;
                    const done = statuses[key] === "done";
                    const num = counter;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        className={`${styles.node} ${done ? styles.done : ""}`}
                        onClick={() => onOpenSection?.(chapter.id, section.id)}
                        title={section.summary}
                      >
                        <span className={styles.nodeNum}>{done ? <CheckIcon /> : num}</span>
                        <span className={styles.nodeLabel}>{section.title}</span>
                        <span className={styles.nodeTime}>{section.estMinutes}분</span>
                      </button>
                    );
                  })}
                </div>
                {ci < PLAN_BLUEPRINT.length - 1 && <Connector />}
              </div>
            );
          })}
        </div>
        )}
        </div>
       </div>
      </div>
    </div>
  );
}
