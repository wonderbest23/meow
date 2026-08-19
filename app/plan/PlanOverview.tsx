"use client";

import { REGEN_PACK_AMOUNT, REGEN_PACK_COUNT } from "../../lib/payments/domain";
import { rememberRegenQuota, regenQuotaOf, subscribeRegenQuota, REGEN_WARN_AT } from "../../lib/plan-builder/regen-store";
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
  isSamplePlan,
} from "../../lib/plan-builder/plan-store";
import { findConsistencyIssues, type ConsistencyIssue } from "../../lib/plan-builder/consistency";
import { estimateMinutes } from "../../lib/plan-builder/questions";
import ConsistencyPanel from "./ConsistencyPanel";
import InheritNote from "./InheritNote";
import PlanLoading from "./PlanLoading";
import GuideBubble, { ringClass } from "./GuideBubble";
import { LayoutGrid, FileText, Zap, Lock, Presentation } from "lucide-react";
import { generatingTitle, subscribeGeneration, totalPendingCount, refreshServerPending, failedCount, isGenerating, generationFailureMessage } from "../../lib/plan-builder/generation-queue";
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
  /* 일괄 생성이 실패했을 때 알린다 — 조용히 끝나면 다 된 줄 안다 */
  const [bulkError, setBulkError] = useState<string | null>(null);
  /*
   * 다시 생성 남은 횟수.
   * 서버가 응답에 실어 주는 값을 그대로 보여준다 — 여기서 다시 계산하지 않는다.
   * 20회를 다 쓰는 순간 예고 없이 막히면 손님은 그걸 고장으로 읽는다.
   */
  const [regenTick, setRegenTick] = useState(0);
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  useEffect(() => subscribeRegenQuota(() => setRegenTick((n) => n + 1)), []);

  /*
   * 화면이 열릴 때 한 번 물어본다.
   * 생성 응답에만 실어 오면 손님은 '한 번 써 봐야' 몇 회 남았는지 알게 된다.
   */
  useEffect(() => {
    if (!activePlanId) return;
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/plan/regen-quota?planId=${encodeURIComponent(activePlanId)}`);
        if (!res.ok || !alive) return;
        const data = (await res.json()) as { quota?: unknown };
        rememberRegenQuota(activePlanId, data.quota);
      } catch {
        /* 조회 실패는 조용히 넘어간다 — 안내가 없을 뿐 생성은 막지 않는다 */
      }
    })();
    return () => {
      alive = false;
    };
  }, [activePlanId]);
  const cancelBulk = useRef(false);
  const [title, setTitle] = useState(planTitle);
  const [type, setType] = useState<string | undefined>(undefined);
  const [issues, setIssues] = useState<ConsistencyIssue[]>([]);
  /** 잠근 섹션 — 일괄 생성이 건너뛴다 */
  const [lockedKeys, setLockedKeys] = useState<Set<string>>(new Set());
  /** 예시(샘플) 플랜은 읽기 전용 — 완성 문구·생성 도구를 다르게 보여준다 */
  const [readOnly, setReadOnly] = useState(false);

  const [ready, setReady] = useState(false);

  // 로컬 캐시로 즉시 채우고, 서버 하이드레이트로 조용히 갱신한다.
  // 예전에는 서버 응답을 기다렸다가 채워서 완성 배너·진행률이 한 박자 늦게 나타났다.
  useEffect(() => {
    let alive = true;
    const apply = (s: ReturnType<typeof loadState>) => {
      if (!alive) return;
      setStoreStatuses(planStatuses(s));
      setAssembled(assembleSections(s));
      setInProgress(new Set(answeredSectionKeys(s)));
      const p = activePlan(s);
      setActivePlanId(p?.id ?? null);
      if (p) {
        setTitle(p.title);
        setType(p.planType);
      }
      setReadOnly(isSamplePlan(p?.id));
      setIssues(findConsistencyIssues(p?.answers ?? {}, s.business));
      setLockedKeys(new Set(Object.entries(p?.sections ?? {}).filter(([, v]) => v?.locked).map(([k]) => k)));
      setReady(true);
    };
    apply(loadState());
    hydrateFromServer().then(apply);
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

  /*
   * 위저드에서 '다음 단계'로 넘어가며 걸어 둔 본문 생성은 뒤에서 돈다.
   * 개요로 돌아왔을 때 몇 개가 남았는지 보이지 않으면 '왜 아직 비어 있지?'가 된다.
   */
  const [queueTick, setQueueTick] = useState(0);
  useEffect(() => subscribeGeneration(() => setQueueTick((n) => n + 1)), []);
  /*
   * 서버에 맡긴 생성은 이 창 밖에서 돈다 — 몇 개 남았는지 주기적으로 확인한다.
   * 남은 게 없으면 확인도 멈춘다(빈 폴링을 계속 돌리지 않는다).
   */
  useEffect(() => {
    const planId = activePlan(loadState())?.id;
    if (!planId) return;
    let alive = true;
    void refreshServerPending(planId);
    const timer = setInterval(() => {
      if (!alive) return;
      if (totalPendingCount() === 0) return;
      void refreshServerPending(planId);
    }, 15_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);
  const queued = totalPendingCount();
  /* 뒤에서 만들다 실패한 섹션 — 알리지 않으면 영영 비어 있는 줄 모른다 */
  const failedSections = failedCount();

  /*
   * 되살리기 대상 — '답변은 있는데 본문이 비어 있고, 지금 만들고 있지도 않은' 섹션.
   *
   * 예전에는 지금 만들고 있는 섹션까지 여기에 들어갔다. 그래서 화면에
   * "본문 1개 만드는 중" 과 "답변한 섹션 1개 한번에 생성" 이 나란히 떴고,
   * 그 버튼을 누르면 이미 만들고 있는 것을 한 번 더 불렀다 — 같은 섹션에
   * API 를 두 번 쓴 것이다. isGenerating 으로 뺀다.
   */
  const pendingKeys = useMemo(() => {
    const out: Array<{ key: string; chapterId: string; sectionId: string; title: string }> = [];
    for (const ch of chapters) {
      for (const s of ch.sections) {
        const key = `${ch.id}/${s.id}`;
        if (statuses[key] !== "done" && inProgress.has(key) && !lockedKeys.has(key) && !isGenerating(key)) {
          out.push({ key, chapterId: ch.id, sectionId: s.id, title: s.title });
        }
      }
    }
    return out;
    // queueTick 은 큐가 바뀔 때 이 목록을 다시 세라는 신호다
  }, [statuses, inProgress, chapters, lockedKeys, queueTick]);

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

    /*
     * 실패를 세어 둔다. 예전에는 전부 실패해도 진행 막대가 끝까지 차고
     * 아무 말이 없어서, 한 개도 만들어지지 않았는데 다 된 줄 알았다.
     */
    let failures = 0;
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
          const data = (await res.json()) as { markdown?: string; html?: string; quota?: unknown };
          rememberRegenQuota(plan.id, data.quota);
          // 시작할 때의 플랜에 저장한다 — 오래 걸리는 동안 활성 플랜이 바뀔 수 있다
          if (data.markdown && data.html) saveSection(target.key, data.markdown, data.html, { planId: plan.id });
          else failures += 1;
        } else {
          failures += 1;
        }
      } catch {
        // 실패한 섹션은 건너뛰고 계속 진행 — 다만 몇 개가 실패했는지는 알린다
        failures += 1;
      }
    }

    setBulk(null);
    if (failures > 0) {
      setBulkError(
        failures === pendingKeys.length
          ? "본문을 만들지 못했습니다. 잠시 후 다시 시도해주세요."
          : `${failures}개 섹션을 만들지 못했습니다. 다시 시도하면 그 섹션만 만듭니다.`,
      );
    } else {
      setBulkError(null);
    }
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

  /** 다음 섹션의 번호·제목 — 이어서 작성 배너용 */
  const nextInfo = useMemo(() => {
    if (!nextKey) return null;
    let n = 0;
    for (const ch of chapters) {
      for (const sec of ch.sections) {
        n += 1;
        if (`${ch.id}/${sec.id}` === nextKey) return { chapterId: ch.id, sectionId: sec.id, num: n, title: sec.title };
      }
    }
    return null;
  }, [nextKey, chapters]);

  // 전역 순번(1-based)
  let counter = 0;

  // 첫 페인트 전(로컬 캐시 읽기 전)에는 공용 로딩 — 0%→완성으로 튀는 화면 방지
  if (!ready) {
    return (
      <div className={styles.page}>
        <div className={styles.frame}>
          <div className={styles.app}>
            <PlanLoading variant="rows" note="플랜을 불러오는 중…" />
          </div>
        </div>
      </div>
    );
  }

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
          {/*
            보기 전환은 문서 화면과 같은 자리(제목 줄 오른쪽)에 둔다.
            예전에는 개요만 본문 한가운데 있어서, 버튼을 눌러 넘어가면
            같은 컨트롤이 다른 곳에 나타나 길을 잃었다.
          */}
          <div className={styles.seg} role="tablist" aria-label="보기 전환">
            <button type="button" className={styles.segOn}><LayoutGrid size={13} /> 구조 보기</button>
            <button type="button" onClick={onOpenDocument}><FileText size={13} /> 문서 보기</button>
          </div>
        </div>

        {/* 진행 미터 */}
        {/* 진행률이 주인공 — 나머지 둘은 보조 지표로 가라앉힌다 */}
        <div className={styles.meters}>
          <div className={`${styles.meter} ${styles.meterPrimary}`}>
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
          <div className={styles.spring} />
        </div>

        {/* 이어받아 만든 플랜이면 왜 미리 채워져 있는지 먼저 설명한다 */}
        <InheritNote />

        {/* 다 채운 사람에게 마지막 단계 — 발표자료 */}
        {/* 작성 중이면 다음 할 일을 바로 이어준다 — 재방문 시 첫 행동이 명확해야 한다 */}
        {doneCount < total && nextInfo && (
          <button
            type="button"
            className={`${styles.finale} ${styles.continueBanner}`}
            onClick={() => onOpenSection?.(nextInfo.chapterId, nextInfo.sectionId)}
          >
            <span className={styles.finaleBody}>
              <b>{doneCount === 0 ? "첫 섹션부터 시작해 보세요" : `섹션 ${total - doneCount}개가 남아 있어요`}</b>
              <span>다음 차례: {nextInfo.num}. {nextInfo.title}</span>
            </span>
            <span className={styles.finaleGo}>이어서 작성 →</span>
          </button>
        )}
        {doneCount > 0 && doneCount === total && (
          <button type="button" className={`${styles.finale} ${ringClass()}`} onClick={onOpenDocument}>
            <GuideBubble text={readOnly ? "완성본을 살펴보세요" : "다음은 발표자료예요"} />
            <span className={styles.finaleIcon} aria-hidden="true"><Presentation size={22} /></span>
            <span className={styles.finaleBody}>
              {readOnly ? (
                <>
                  <b>예시로 만들어 둔 완성 문서예요</b>
                  <span>실제 서비스로 생성한 결과물입니다. 내 사업으로도 같은 문서를 만들 수 있어요.</span>
                </>
              ) : (
                <>
                  <b>사업계획서가 완성됐어요 🎉</b>
                  <span>{total}개 섹션을 모두 작성했습니다. 문서 화면에서 PDF·Word로 받거나, 발표자료(PPT)까지 만들 수 있어요.</span>
                </>
              )}
            </span>
            <span className={styles.finaleGo}>문서 보러 가기 →</span>
          </button>
        )}

        <ConsistencyPanel issues={issues} onOpenSection={onOpenSection} />

        {/* 생성 진행·일괄 생성 */}
        <div className={styles.tools}>
          <div className={styles.spring} />
          {queued > 0 && !bulk && (
            <span className={styles.queueTag} title="기다리지 않아도 됩니다 — 다른 섹션을 계속 진행하세요">
              <i className={styles.queueDot} /> 본문 {queued}개 만드는 중{generatingTitle() ? ` · ${generatingTitle()}` : ""}
            </span>
          )}
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
            /*
             * 이 버튼은 평소에 쓰는 것이 아니라 되살리기다.
             *
             * 정상 흐름에서는 섹션을 다 채우고 '다음'을 누르면 본문이 저절로
             * 만들어진다. 그러니 이 버튼이 보인다는 건 무언가 걸렸다는 뜻이다 —
             * 생성이 실패했거나, 만드는 도중에 창을 닫았거나.
             *
             * 그래서 (1) 지금 만들고 있는 게 하나도 없을 때만 보이고,
             * (2) 이름도 '한번에 생성'이 아니라 무엇을 되살리는지로 적는다.
             * 위의 '이어서 작성'이 이 화면의 주된 행동이고, 이건 그 옆의
             * 조용한 복구 수단이라 생김새도 한 단 낮춘다.
             */
            pendingKeys.length > 0 && queued === 0 && (
              <button type="button" className={styles.bulkBtn} onClick={generateAll}>
                <Zap size={13} /> 본문이 비어 있는 {pendingKeys.length}개 만들기
              </button>
            )
          )}
        </div>

        {bulkError && (
          <p className={styles.bulkError} role="status">{bulkError}</p>
        )}

        {/* 실패 이유가 있으면 그것부터 — '만들지 못했습니다'만으로는 무엇을 해야 할지 알 수 없다 */}
        {!bulkError && failedSections > 0 && (
          <p className={styles.bulkError} role="status">
            {generationFailureMessage()
              ?? `${failedSections}개 섹션의 본문을 만들지 못했습니다. 위 ‘본문이 비어 있는 N개 만들기’로 다시 시도해 주세요.`}
          </p>
        )}

        {(() => {
          /* regenTick 은 구독 알림을 렌더로 잇는 용도다 */
          void regenTick;
          const q = regenQuotaOf(activePlanId ?? undefined);
          if (!q || q.remaining > REGEN_WARN_AT) return null;
          return (
            <p className={styles.regenNote} role="status" data-empty={q.remaining === 0 ? "true" : undefined}>
              {q.remaining > 0
                ? `이 문서에 포함된 다시 생성이 ${q.remaining}회 남았습니다. (총 ${q.allowed}회)`
                : `이 문서에 포함된 다시 생성 ${q.allowed}회를 모두 썼습니다. 직접 고쳐 쓰는 것은 계속 할 수 있습니다.`}
              {q.remaining === 0 && activePlanId && (
                <>
                  {" "}
                  <a
                    className={styles.regenBuy}
                    href={`/plan/pay?planId=${encodeURIComponent(activePlanId)}&planType=${encodeURIComponent(type ?? "")}&product=regen`}
                  >
                    {REGEN_PACK_COUNT}회 추가 ({REGEN_PACK_AMOUNT.toLocaleString("ko-KR")}원)
                  </a>
                </>
              )}
            </p>
          );
        })()}

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
                        className={`${styles.node} ${done ? styles.done : ""} ${writing ? styles.writing : ""} ${isNext ? styles.next : ""} ${isNext ? ringClass() : ""}`}
                        onClick={() => onOpenSection?.(chapter.id, section.id)}
                        title={section.summary}
                      >
                        <span className={styles.nodeNum}>{done ? <CheckIcon /> : num}</span>
                        <span className={styles.nodeLabel}>{section.title}</span>
                        {isLocked && <span className={styles.lockTag} title="수정 보호 중 — 일괄 생성이 건너뜁니다"><Lock size={10} strokeWidth={2.4} /></span>}
                        {isNext && <GuideBubble text="다음은 여기예요" />}
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
