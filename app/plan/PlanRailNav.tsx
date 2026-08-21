"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { chaptersForType } from "../../lib/plan-builder/blueprint";
import { hydrateFromServer, isSamplePlan, loadState, setActivePlan, type Plan } from "../../lib/plan-builder/plan-store";
import { subscribeGeneration } from "../../lib/plan-builder/generation-queue";
import styles from "./PlanRailNav.module.css";

/*
 * 레일 안의 플랜 목록.
 *
 * 예전에는 '지금 열어 둔 플랜 하나'의 목차만 보여줬다. 그래서 플랜 목록
 * 화면에서는 서랍에 아무것도 없었고, 다른 플랜으로 가려면 목록으로
 * 되돌아가야 했다. 만든 플랜을 전부 세워 두고, 하나를 펼치면 그 플랜으로
 * 만들어진 것(개요·문서·홈페이지)과 목차가 같이 나오게 한다.
 *
 * 펼치기와 이동을 나눈 이유: 누르자마자 화면이 바뀌면 '뭐가 들어 있나'
 * 들여다보는 것조차 이동이 된다. 이름을 누르면 펼치기만 하고, 실제 이동은
 * 그 안의 항목을 눌렀을 때만 일어난다.
 */

/** 지금 보고 있는 섹션 키 — /plan/{chapterId}/{sectionId} */
function currentSectionKey(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean); // ["plan", ch, sec]
  if (parts.length !== 3 || parts[0] !== "plan") return null;
  if (parts[1] === "overview" || parts[1] === "document") return null;
  return `${parts[1]}/${parts[2]}`;
}

/** 이 플랜에서 본문이 만들어진 섹션 수 */
function doneCount(plan: Plan, chapterId: string): number {
  return Object.keys(plan.sections).filter((key) => key.startsWith(`${chapterId}/`)).length;
}

export default function PlanRailNav() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const [tick, setTick] = useState(0);
  const [ready, setReady] = useState(false);
  /*
   * 플랜 목록은 브라우저 저장소에 있다. 서버는 그걸 읽을 수 없어서 서버가 그린
   * 첫 화면과 브라우저가 그린 화면이 어긋난다(hydration mismatch).
   * 브라우저에 올라온 뒤에만 그린다.
   */
  const [mounted, setMounted] = useState(false);
  /** 펼쳐 둔 플랜 — 사용자가 고르기 전에는 작업 중인 플랜을 편다 */
  const [openId, setOpenId] = useState<string | null>(null);
  /*
   * 챕터는 접어 둔 상태가 기본이다.
   * 다 펼치면 플랜 하나가 서랍을 가득 채워 나머지 플랜이 화면 밖으로 밀린다 —
   * 여러 플랜을 훑어보려고 만든 목록인데 그 목적이 사라진다.
   * 단, 지금 보고 있는 대목이 속한 챕터는 열어 둔다.
   */
  const [openChapters, setOpenChapters] = useState<Record<string, boolean>>({});
  /*
   * 샘플은 '사기 전에 완성본을 보여주는' 판매용이다. 결제 이력이 생기면
   * 목록 화면이 샘플 줄을 접는데(PlanList의 hasAnyPaid), 레일만 계속 보여주면
   * 같은 사람에게 화면마다 다른 말을 하는 셈이 된다. 같은 규칙을 따른다.
   */
  const [hasAnyPaid, setHasAnyPaid] = useState(false);

  useEffect(() => {
    let alive = true;
    setMounted(true);
    void hydrateFromServer().then(() => {
      if (alive) setReady(true);
    });
    fetch("/api/plan/access")
      .then((r) => r.json())
      .then((d) => {
        if (alive) setHasAnyPaid(!!d.hasAnyPaid);
      })
      .catch(() => {});
    // 본문이 만들어지면 완료 개수가 바뀐다
    const off = subscribeGeneration(() => setTick((n) => n + 1));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const state = useMemo(() => loadState(), [pathname, tick, ready, mounted]);

  /* 내가 만든 것 먼저, 예시는 뒤에 — 목록 화면과 같은 순서 */
  const plans = useMemo(() => {
    const own = state.plans.filter((p) => !isSamplePlan(p.id));
    if (hasAnyPaid) return own;
    return [...own, ...state.plans.filter((p) => isSamplePlan(p.id))];
  }, [state, hasAnyPaid]);

  const activeKey = currentSectionKey(pathname);
  const onDocument = pathname.startsWith("/plan/document");
  const expandedId = openId ?? state.activePlanId ?? plans[0]?.id ?? null;

  if (!mounted || plans.length === 0) return null;
  /*
   * 목록 화면(/plan)에서는 그리지 않는다. 오른쪽 본문이 이미 플랜 목록인데
   * 왼쪽에 플랜마다 챕터 일곱 줄을 또 펼치면 같은 것을 두 번 보여주는 셈이고,
   * 그게 '대시보드가 어렵다'의 가장 큰 원인이었다. 플랜 안으로 들어가면 나온다.
   */
  if (pathname === "/plan") return null;

  /** 이동할 때는 작업 중인 플랜도 그쪽으로 옮긴다 — 이후 문서·PPT가 헷갈리지 않게 */
  function go(planId: string, href: string) {
    if (state.activePlanId !== planId) setActivePlan(planId);
    router.push(href);
  }

  function goSection(plan: Plan, chapterId: string, sectionId: string) {
    const sample = isSamplePlan(plan.id);
    /*
     * 문서 화면에서 같은 플랜의 대목을 누르면 페이지를 떠나지 않고 그 자리로
     * 스크롤한다 — 이어서 읽던 문서가 통째로 바뀌면 흐름이 끊긴다.
     */
    if (onDocument && state.activePlanId === plan.id) {
      const el = document.getElementById(`sec-${chapterId}-${sectionId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    /*
     * 예시에는 질문·답변 화면이 없다. 그리로 보내면 로그인하라는 안내만
     * 뜬다 — 보러 온 사람에게는 막다른 길이다. 바로 그 대목으로 보낸다.
     */
    if (sample) {
      go(plan.id, `/plan/document#sec-${chapterId}-${sectionId}`);
      return;
    }
    go(plan.id, `/plan/${chapterId}/${sectionId}`);
  }

  return (
    <div className={styles.wrap} data-plan-nav="" aria-label="내 플랜 목록">
      {plans.map((plan) => {
        const sample = isSamplePlan(plan.id);
        const open = expandedId === plan.id;
        const chapters = chaptersForType(plan.planType);
        const total = chapters.reduce((n, c) => n + c.sections.length, 0);
        const done = Object.keys(plan.sections).length;
        const isActive = state.activePlanId === plan.id;

        return (
          <div key={plan.id} className={styles.plan}>
            <button
              type="button"
              className={`${styles.planRow} ${isActive ? styles.planOn : ""}`}
              onClick={() => setOpenId(open ? "" : plan.id)}
              aria-expanded={open}
              title={plan.title}
            >
              <span className={`${styles.caret} ${open ? styles.caretOpen : ""}`} aria-hidden="true">
                ▸
              </span>
              <span className={styles.planName}>{plan.title}</span>
              {sample ? (
                <span className={styles.sampleTag}>예시</span>
              ) : (
                <span className={styles.planCount}>
                  {done}/{total}
                </span>
              )}
            </button>

            {open && (
              <div className={styles.planBody}>
                {/* 이 플랜으로 만들어진 것 — 목차보다 먼저 둔다 */}
                <div className={styles.outputs}>
                  {!sample && (
                    <button type="button" className={styles.output} onClick={() => go(plan.id, "/plan/overview")}>
                      개요
                    </button>
                  )}
                  <button type="button" className={styles.output} onClick={() => go(plan.id, "/plan/document")}>
                    문서
                  </button>
                  <button type="button" className={styles.output} onClick={() => go(plan.id, "/plan/homepage")}>
                    홈페이지
                  </button>
                </div>

                {chapters.map((chapter, ci) => {
                  const chapterKey = `${plan.id}:${chapter.id}`;
                  const chapterOpen =
                    openChapters[chapterKey] ?? (isActive && activeKey?.split("/")[0] === chapter.id);
                  const chapterDone = doneCount(plan, chapter.id);
                  return (
                    <div key={chapter.id} className={styles.chapter}>
                      <button
                        type="button"
                        className={styles.chapterBtn}
                        onClick={() => setOpenChapters((prev) => ({ ...prev, [chapterKey]: !chapterOpen }))}
                        aria-expanded={chapterOpen}
                      >
                        <span className={styles.chapterNum}>{ci + 1}</span>
                        <span className={styles.chapterName}>{chapter.title}</span>
                        <span className={styles.chapterCount}>
                          {chapterDone}/{chapter.sections.length}
                        </span>
                      </button>
                      {chapterOpen && (
                        <div className={styles.sections}>
                          {chapter.sections.map((section, si) => {
                            const key = `${chapter.id}/${section.id}`;
                            const here = isActive && activeKey === key;
                            return (
                              <button
                                key={section.id}
                                type="button"
                                className={`${styles.section} ${here ? styles.sectionOn : ""} ${plan.sections[key] ? styles.sectionDone : ""}`}
                                onClick={() => goSection(plan, chapter.id, section.id)}
                                title={section.title}
                              >
                                <span className={styles.sectionNo}>
                                  {ci + 1}.{si + 1}
                                </span>
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
            )}
          </div>
        );
      })}
    </div>
  );
}
