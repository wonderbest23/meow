"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { chaptersForType, type PlanSectionStatus } from "../../lib/plan-builder/blueprint";
import { activePlan, hydrateFromServer, isSamplePlan, loadState, planStatuses } from "../../lib/plan-builder/plan-store";
import { subscribeGeneration } from "../../lib/plan-builder/generation-queue";
import styles from "./PlanRailNav.module.css";

/*
 * 레일 안의 플랜 목차.
 *
 * 예전에는 목차가 화면 오른쪽에 별도 열(232px)로 있었다. 왼쪽 레일과
 * 합쳐 400px 넘게 껍데기가 차지하는 바람에 좁은 창에서 본문이 눌렸고,
 * '지금 보는 플랜'이 화면 양쪽에 나뉘어 있는 것도 어색했다.
 * 열려 있는 플랜의 목차를 레일 아래에 붙여 한 곳으로 모은다.
 */

/** 이 경로가 '플랜 하나를 열어 둔 상태'인가 */
function insidePlan(pathname: string): boolean {
  if (pathname === "/plan" || pathname === "/plan/") return false;
  if (pathname.startsWith("/plan/start")) return false;
  if (pathname.startsWith("/plan/info")) return false;
  if (pathname.startsWith("/plan/me")) return false;
  if (pathname.startsWith("/plan/pay")) return false;
  return pathname.startsWith("/plan/");
}

/** 지금 보고 있는 섹션 키 — /plan/{chapterId}/{sectionId} */
function currentSectionKey(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean); // ["plan", ch, sec]
  if (parts.length !== 3 || parts[0] !== "plan") return null;
  if (parts[1] === "overview" || parts[1] === "document") return null;
  return `${parts[1]}/${parts[2]}`;
}

export default function PlanRailNav() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void hydrateFromServer().then(() => {
      if (alive) setReady(true);
    });
    // 본문이 만들어지면 완료 표시가 바뀐다
    const off = subscribeGeneration(() => setTick((n) => n + 1));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const show = insidePlan(pathname);
  const plan = useMemo(() => (show ? activePlan(loadState()) : null), [show, pathname, tick, ready]);
  const statuses = useMemo<Record<string, PlanSectionStatus>>(
    () => (show ? planStatuses(loadState()) : {}),
    [show, pathname, tick, ready],
  );
  const chapters = useMemo(() => (plan ? chaptersForType(plan.planType) : []), [plan]);

  const activeKey = currentSectionKey(pathname);
  const onDocument = pathname.startsWith("/plan/document");
  const sample = isSamplePlan(plan?.id);

  /* 열려 있는 챕터 — 지금 보는 섹션의 챕터는 항상 펼친다 */
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const activeChapter = activeKey ? activeKey.split("/")[0] : null;

  if (!show || !plan || chapters.length === 0) return null;

  function goSection(chapterId: string, sectionId: string) {
    /*
     * 문서 화면에서는 페이지를 떠나지 않고 그 자리로 스크롤한다 —
     * 이어서 읽던 문서가 통째로 바뀌면 흐름이 끊긴다.
     */
    if (onDocument) {
      const el = document.getElementById(`sec-${chapterId}-${sectionId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    /*
     * 예시 문서에는 질문·답변 화면이 없다. 그리로 보내면 로그인하라는
     * 안내만 뜬다 — 보러 온 사람에게는 막다른 길이다. 바로 그 대목으로 보낸다.
     */
    if (sample) {
      router.push(`/plan/document#sec-${chapterId}-${sectionId}`);
      return;
    }
    router.push(`/plan/${chapterId}/${sectionId}`);
  }

  return (
    <div className={styles.wrap} data-plan-nav="" aria-label="플랜 목차">
      <p className={styles.planName} title={plan.title}>{plan.title}</p>

      {chapters.map((chapter, ci) => {
        const open = collapsed[chapter.id] !== true || chapter.id === activeChapter;
        const done = chapter.sections.filter((s) => statuses[`${chapter.id}/${s.id}`] === "done").length;
        return (
          <div key={chapter.id} className={styles.chapter}>
            <button
              type="button"
              className={styles.chapterBtn}
              onClick={() => setCollapsed((prev) => ({ ...prev, [chapter.id]: prev[chapter.id] !== true }))}
              aria-expanded={open}
            >
              <span className={styles.chapterNum}>{ci + 1}</span>
              <span className={styles.chapterName}>{chapter.title}</span>
              <span className={styles.chapterCount}>{done}/{chapter.sections.length}</span>
            </button>
            {open && (
              <div className={styles.sections}>
                {chapter.sections.map((section, si) => {
                  const key = `${chapter.id}/${section.id}`;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      className={`${styles.section} ${activeKey === key ? styles.sectionOn : ""} ${statuses[key] === "done" ? styles.sectionDone : ""}`}
                      onClick={() => goSection(chapter.id, section.id)}
                      title={section.title}
                    >
                      <span className={styles.sectionNo}>{ci + 1}.{si + 1}</span>
                      <span className={styles.sectionName}>{section.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
