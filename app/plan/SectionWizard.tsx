"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PLAN_BLUEPRINT, chaptersForType, sectionKey, type PlanSectionStatus } from "../../lib/plan-builder/blueprint";
import { estimateMinutes,
  questionsForSection,
  isVisible,
  visibleRequiredCount,
  type QuestionGroup,
  type QuestionDef,
} from "../../lib/plan-builder/questions";
import {
  saveSection,
  toggleSectionLock,
  restorePreviousSection,
  loadState,
  businessContext,
  priorSectionsSummary,
  activePlan,
  loadAnswers,
  saveAnswers,
  isSamplePlan,
} from "../../lib/plan-builder/plan-store";
import { FINANCIAL_OVERRIDE_KEY } from "../../lib/plan-builder/financials";
import { enqueueGeneration, isGenerating, subscribeGeneration, totalPendingCount } from "../../lib/plan-builder/generation-queue";
import { findConsistencyIssues, issuesForSection } from "../../lib/plan-builder/consistency";
import ConsistencyPanel from "./ConsistencyPanel";
import InheritNote from "./InheritNote";
import GuideBubble, { ringClass } from "./GuideBubble";
import { Spinner } from "./PlanLoading";
import PlanGate from "./PlanGate";
import { htmlToMarkdown } from "../../lib/plan-builder/html-to-markdown";
import FinancialReview from "./FinancialReview";
import { Sparkles, PenLine, Lock, Unlock, Undo2, RefreshCw } from "lucide-react";
import styles from "./SectionWizard.module.css";
import RegionInput from "../../components/region-input";

/** 지역을 묻는 질문인지 — id 나 예시 문구로 가린다 */
function isRegionQuestion(q: QuestionDef): boolean {
  if (["city", "region", "area", "location"].includes(q.id)) return true;
  const ph = q.input.kind === "text" ? (q.input.placeholder ?? "") : "";
  return /지역|소재지|어디에 있/.test(q.q) && ph.includes("예: 서울");
}

type AnswerMap = Record<string, unknown>;

const Check = ({ n = 11 }: { n?: number }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" width={n} height={n}>
    <path d="M5 12.5 10 17l9-11" />
  </svg>
);


/**
 * 컨테이너를 부드럽게 스크롤한다.
 * 네이티브 smooth는 환경에 따라 무시되므로 직접 그린다(동작 보장).
 */
function scrollToElement(container: HTMLElement, el: HTMLElement) {
  // 폭이 좁으면 컨테이너가 아니라 창(window)이 스크롤 주체다 — 실제로 스크롤 가능한 쪽을 움직인다
  const containerScrolls = container.scrollHeight > container.clientHeight + 4;
  const er = el.getBoundingClientRect();
  let read: () => number;
  let write: (v: number) => void;
  let target: number;
  if (containerScrolls) {
    const cr = container.getBoundingClientRect();
    const raw = container.scrollTop + (er.top - cr.top) - (container.clientHeight - er.height) / 2;
    target = Math.max(0, Math.min(raw, container.scrollHeight - container.clientHeight));
    read = () => container.scrollTop;
    write = (v) => { container.scrollTop = v; };
  } else {
    const raw = window.scrollY + er.top - (window.innerHeight - er.height) / 2;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    target = Math.max(0, Math.min(raw, Math.max(0, max)));
    read = () => window.scrollY;
    write = (v) => window.scrollTo(0, v);
  }
  const start = read();
  const delta = target - start;
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || Math.abs(delta) < 4) {
    write(target);
    return;
  }
  const duration = Math.min(620, 240 + Math.abs(delta) * 0.45);
  const t0 = performance.now();
  let done = false;
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / duration);
    write(start + delta * (1 - Math.pow(1 - p, 3))); // easeOutCubic
    if (p < 1) requestAnimationFrame(step);
    else done = true;
  };
  requestAnimationFrame(step);
  // 탭이 백그라운드면 rAF가 돌지 않는다 — 애니메이션은 없더라도 목표 위치에는 도달시킨다
  window.setTimeout(() => {
    if (!done) write(target);
  }, duration + 150);
}

function isAnswered(q: QuestionDef, v: unknown): boolean {
  if (v == null) return false;
  if (q.input.kind === "multi") return Array.isArray(v) && v.length > 0;
  if (q.input.kind === "text") return typeof v === "string" && v.trim().length > 0;
  return typeof v === "string" ? v.length > 0 : Boolean(v);
}

export interface SectionWizardProps {
  chapterId: string;
  sectionId: string;
  statuses?: Record<string, PlanSectionStatus>;
  planTitle?: string;
  planType?: string;
  onBack?: () => void;
  /** 마지막 섹션에서 '문서 보러 가기' */
  onOpenDocument?: () => void;
  onNavigateSection?: (chapterId: string, sectionId: string) => void;
  onComplete?: (chapterId: string, sectionId: string, answers: AnswerMap) => void;
}

export default function SectionWizard({
  chapterId,
  sectionId,
  statuses = {},
  planTitle = "새 플랜",
  planType = "창업 초기 · 사업계획서",
  onBack,
  onOpenDocument,
  onNavigateSection,
  onComplete,
}: SectionWizardProps) {
  /** 이 유형이 채우는 챕터 — 좌측 목차에 이것만 보인다 */
  const chapters = useMemo(() => chaptersForType(planType), [planType]);
  const chapter = PLAN_BLUEPRINT.find((c) => c.id === chapterId) ?? PLAN_BLUEPRINT[0];
  const section = chapter.sections.find((s) => s.id === sectionId) ?? chapter.sections[0];
  const key = sectionKey(chapter.id, section.id);

  /** 모순 패널에서 넘어온 강조 대상 질문들 — 빨간 테두리로 짚어준다 */
  const [conflictQids, setConflictQids] = useState<string[]>([]);
  // 문서 유형에 따라 묻는 질문이 달라진다(재무 문서에서 브랜드 질문을 빼는 식)
  const groups = useMemo(() => questionsForSection(key, section.title, planType), [key, section.title, planType]);

  /*
   * 한 번에 묶음 하나.
   * 예전에는 질문 열몇 개가 한 화면에 다 있어 스크롤로 훑어야 했다 —
   * "지금 뭘 답해야 하는지" 가 보이지 않는다. 묶음 단위로 넘긴다.
   * 섹션이 바뀌면 처음으로 돌아간다.
   */
  const [gi, setGi] = useState(0);
  useEffect(() => { setGi(0); }, [key]);
  const stepCount = groups.length;
  const stepIndex = Math.min(gi, Math.max(stepCount - 1, 0));
  const stepGroup = groups[stepIndex];
  const isLastStep = stepIndex >= stepCount - 1;

  /** 이 유형의 전체 섹션 순서 — '다음 단계 (n/총)' 표시와 이동에 쓴다 */
  const flatSectionList = useMemo(
    () => chapters.flatMap((ch) => ch.sections.map((sec) => ({ chapterId: ch.id, sectionId: sec.id, title: sec.title }))),
    [chapters],
  );
  const currentIndex = useMemo(
    () => flatSectionList.findIndex((item) => item.chapterId === chapterId && item.sectionId === sectionId),
    [flatSectionList, chapterId, sectionId],
  );
  const nextSection = currentIndex >= 0 ? flatSectionList[currentIndex + 1] ?? null : null;

  const [answers, setAnswers] = useState<AnswerMap>({});
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  const [loadingSug, setLoadingSug] = useState<Record<string, boolean>>({});
  const [genSource, setGenSource] = useState<"ai" | "fallback" | null>(null);
  // 생성 중 실시간으로 쌓이는 본문
  const [savedMd, setSavedMd] = useState<string>("");
  // 이 섹션을 사용자가 직접 고쳤는지 / 다시 생성으로부터 잠갔는지
  const [edited, setEdited] = useState(false);
  const [locked, setLocked] = useState(false);
  // 로그인·결제 권한 (서버 판정 결과를 받아온다)
  const [access, setAccess] = useState<{
    authenticated: boolean; paid: boolean; freeKeys: string[]; freeLabels: string[]; price: number;
  } | null>(null);
  // 재무 수치 검토에서 사용자가 고친 값 (질문 섹션이 아니라 별도 키에 저장)
  const [finOverrides, setFinOverrides] = useState<AnswerMap>({});
  // 플랜 전체 답변 스냅샷 — 재무 입력이 다른 섹션에 흩어져 있어 함께 필요하다.
  // 렌더 중 저장소를 읽으면 서버 렌더와 어긋나므로 진입 후 상태로 채운다.
  const [planAnswers, setPlanAnswers] = useState<Record<string, Record<string, unknown>>>({});
  // 생성을 시도했는데 빈 필수 항목이 있을 때만 빨갛게 표시한다(처음부터 겁주지 않는다)
  const [showMissing, setShowMissing] = useState(false);
  /** 예시(샘플) 플랜은 읽기 전용 — 고쳐도 저장되지 않으므로 수정 도구를 아예 감춘다 */
  const [readOnly, setReadOnly] = useState(false);
  /** 이 섹션에 보여줄 예시 답변이 있는지 */
  const hasSampleAnswers = Object.keys(answers).length > 0;
  /** 예시 답변을 고치려 한 적이 있는지 — 안내를 띄운다 */
  const [sampleBlocked, setSampleBlocked] = useState(false);
  /** 이 섹션에 이미 만들어 둔 본문이 있는지 */
  const [hasBody, setHasBody] = useState(false);
  /** 생성 이후 답변을 고쳤는지 — 고쳤으면 넘어갈 때 자동으로 다시 만든다 */
  const [answersDirty, setAnswersDirty] = useState(false);
  /** 백그라운드 생성 상태(이 섹션 / 전체 대기 수) */
  const [queueTick, setQueueTick] = useState(0);
  useEffect(() => subscribeGeneration(() => setQueueTick((n) => n + 1)), []);
  const bodyRef = useRef<HTMLDivElement>(null);

  // 섹션 진입 시: 저장된 답변 복원 + 이미 생성된 본문이 있으면 표시
  useEffect(() => {
    const p = activePlan();
    setReadOnly(isSamplePlan(p?.id));
    setAnswers(loadAnswers(key));
    setFinOverrides(loadAnswers(FINANCIAL_OVERRIDE_KEY));
    setPlanAnswers(p?.answers ?? {});
    // 모순 패널에서 짚고 들어왔는가 — 그렇다면 본문 대신 답변 화면을 열고 해당 질문을 강조한다
    let conflictFocus: string[] = [];
    try {
      const raw = sessionStorage.getItem("plan-conflict-focus");
      if (raw) {
        const parsed = JSON.parse(raw) as { key?: string; qids?: string[] };
        if (parsed.key === key && parsed.qids?.length) {
          conflictFocus = parsed.qids;
          // 즉시 지우면 개발 모드의 이펙트 2회 실행에서 2회차가 빈손이 되어 강조가 풀린다.
          // 잠시 뒤에 지워 같은 마운트 안의 재실행은 같은 값을 보게 한다.
          window.setTimeout(() => {
            try { sessionStorage.removeItem("plan-conflict-focus"); } catch { /* 무해 */ }
          }, 1500);
        }
      }
    } catch { /* 강조 실패는 치명적이지 않다 */ }
    setConflictQids(conflictFocus);
    if (conflictFocus.length) {
      window.setTimeout(() => {
        const container = bodyRef.current;
        const el = container?.querySelector<HTMLElement>(`[data-qid="${conflictFocus[0]}"]`);
        if (container && el) scrollToElement(container, el);
      }, 150);
    }

    const stored = p?.sections[key];
    setHasBody(!!stored);
    setAnswersDirty(false);
    if (stored) {
      // 본문은 문서 화면에서 본다 — 위저드는 '답변 → 다음'만 담당한다
      setSavedMd(stored.markdown);
      setGenSource("ai");
      setEdited(!!stored.edited);
      setLocked(!!stored.locked);
    } else {
      setSavedMd("");
      setGenSource(null);
      setEdited(false);
      setLocked(false);
    }
    setShowMissing(false);
  }, [key]);

  // 답변 변경 시 자동 저장(디바운스) — 새로고침·이동해도 유실되지 않게
  const hydratedKey = useRef<string | null>(null);
  useEffect(() => {
    // 섹션 전환 직후 첫 렌더(복원값)는 저장하지 않는다
    if (hydratedKey.current !== key) {
      hydratedKey.current = key;
      return;
    }
    setAnswersDirty(true);
    const t = setTimeout(() => saveAnswers(key, answers), 500);
    return () => clearTimeout(t);
  }, [answers, key]);

  // 권한은 서버에 묻는다 — 화면에서 판단하지 않는다
  useEffect(() => {
    let alive = true;
    const pid = activePlan(loadState())?.id ?? "";
    fetch(`/api/plan/access?planType=${encodeURIComponent(planType)}&planId=${encodeURIComponent(pid)}`)
      .then((r) => r.json())
      .then((d) => {
        if (alive) setAccess(d);
      })
      .catch(() => {
        // 확인 실패 시엔 잠근 쪽으로 둔다
        if (alive) setAccess({ authenticated: false, paid: false, freeKeys: [], freeLabels: [], price: 0 });
      });
    return () => {
      alive = false;
    };
  }, [planType]);

  // 글이 쌓이는 동안 항상 마지막 줄이 보이게

  /* 지금 답할 질문(첫 미답변) — 말풍선+링이 항상 붙어 있고, 답하면 다음으로 옮겨간다 */
  const currentQid = useMemo(() => {
    if (readOnly) return null;
    const flat = groups.flatMap((g) => g.questions).filter((q) => isVisible(q, answers));
    return flat.find((q) => !isAnswered(q, answers[q.id]))?.id ?? null;
  }, [groups, answers, readOnly]);

  /**
   * 선택형 답변 직후 다음 미답변 질문으로 부드럽게 이동한다.
   * 타이핑(text)과 복수 선택(multi)은 스크롤을 뺏지 않는다.
   */
  function advanceFrom(qid: string, nextAnswers: AnswerMap) {
    const flat = groups.flatMap((g) => g.questions).filter((q) => isVisible(q, nextAnswers));
    const idx = flat.findIndex((q) => q.id === qid);
    if (idx < 0) return;
    const next = flat.slice(idx + 1).find((q) => !isAnswered(q, nextAnswers[q.id]));
    if (!next) return;
    // 새 답의 등장 애니메이션이 자리 잡은 뒤 이동
    window.setTimeout(() => {
      const container = bodyRef.current;
      const el = container?.querySelector<HTMLElement>(`[data-qid="${next.id}"]`);
      if (container && el) scrollToElement(container, el);
    }, 180);
  }

  const setAnswer = (qid: string, v: unknown) => {
    const next = { ...answers, [qid]: v };
    setAnswers(next);
    const q = groups.flatMap((g) => g.questions).find((x) => x.id === qid);
    if (!q || q.input.kind === "text") return; // 타이핑은 스크롤을 뺏지 않는다
    const wasAnswered = isAnswered(q, answers[qid]);
    const nowAnswered = isAnswered(q, v);
    // 선택형은 답할 때마다, 복수 선택은 '미답변→답변' 첫 전환에만 이동
    const always = q.input.kind !== "multi";
    if (nowAnswered && (always || !wasAnswered)) advanceFrom(qid, next);
  };
  const toggleMulti = (qid: string, opt: string) => {
    const cur = Array.isArray(answers[qid]) ? (answers[qid] as string[]) : [];
    const nextVal = cur.includes(opt) ? cur.filter((o) => o !== opt) : [...cur, opt];
    const next = { ...answers, [qid]: nextVal };
    setAnswers(next);
    // 첫 선택(미답변→답변)에만 다음 질문으로 이동 — 추가 선택은 방해하지 않는다
    if (cur.length === 0 && nextVal.length > 0) advanceFrom(qid, next);
  };

  // 사업 정보 + 지금까지의 답변을 AI 맥락 문자열로
  function buildContext(): string {
    const parts: string[] = [];
    const biz = businessContext();
    if (biz) parts.push(`[사업 정보]\n${biz}`);
    const lines: string[] = [];
    for (const g of groups) {
      for (const q of g.questions) {
        const v = answers[q.id];
        if (v == null || v === "") continue;
        lines.push(`- ${q.q} → ${Array.isArray(v) ? v.join(", ") : String(v)}`);
      }
    }
    if (lines.length) parts.push(`[이 섹션에서 답한 내용]\n${lines.join("\n")}`);
    const prior = priorSectionsSummary(key);
    if (prior) parts.push(`[앞서 작성한 내용 요약]\n${prior}`);
    return parts.join("\n\n");
  }

  async function loadSuggest(q: QuestionDef) {
    setLoadingSug((p) => ({ ...p, [q.id]: true }));
    try {
      const res = await fetch("/api/plan/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q.q, help: q.help, context: buildContext(), count: 4 }),
      });
      const data = (await res.json()) as { suggestions?: string[] };
      setSuggestions((p) => ({ ...p, [q.id]: data.suggestions ?? [] }));
    } catch {
      setSuggestions((p) => ({ ...p, [q.id]: ["(추천을 불러오지 못했습니다 — 직접 입력해주세요)"] }));
    } finally {
      setLoadingSug((p) => ({ ...p, [q.id]: false }));
    }
  }

  /** 재무 검토에서 고친 값을 즉시 저장한다 — 생성 시 원문 파싱값보다 우선 적용된다. */
  function setFinOverride(fieldId: string, value: string) {
    setFinOverrides((prev) => {
      const next = { ...prev, [fieldId]: value };
      saveAnswers(FINANCIAL_OVERRIDE_KEY, next);
      return next;
    });
  }

  /** 생성 시점에 쓰는 플랜 전체 답변 — 저장소의 최신 값 + 편집 중인 답변·보정값 */
  function mergedAnswers(): Record<string, Record<string, unknown>> {
    return {
      ...(activePlan()?.answers ?? {}),
      [key]: answers,
      [FINANCIAL_OVERRIDE_KEY]: finOverrides,
    };
  }

  /**
   * 다시 생성 전에 손으로 고친 내용을 지켜준다.
   * 잠긴 섹션은 아예 막고, 고친 흔적이 있으면 한 번 묻는다.
   */

  /** 잠금 토글 */

  /** 직전 본문으로 되돌리기 */

  /** 본문을 실시간으로 받아 화면에 쌓는다. */

  /**
   * 인라인 편집 결과를 저장한다.
   * 원본 형식은 마크다운이므로(PDF·DOCX가 여기서 나온다) HTML을 되돌려 저장한다.
   */

  /** 직접 수정한 마크다운을 저장 (HTML은 서버에서 다시 렌더) */

  const { answeredReq, totalReq, pct, perGroup } = useMemo(() => {
    const totalReq = visibleRequiredCount(groups, answers);
    let answeredReq = 0;
    const perGroup: Record<string, { done: number; total: number }> = {};
    for (const g of groups) {
      let gd = 0;
      let gt = 0;
      for (const q of g.questions) {
        if (q.optional || !isVisible(q, answers)) continue;
        gt += 1;
        if (isAnswered(q, answers[q.id])) {
          gd += 1;
          answeredReq += 1;
        }
      }
      perGroup[g.id] = { done: gd, total: gt };
    }
    return { answeredReq, totalReq, pct: totalReq ? Math.round((answeredReq / totalReq) * 100) : 100, perGroup };
  }, [groups, answers]);

  // 검토 패널이 볼 답변 — 상태만으로 만들어 서버/클라이언트 첫 렌더가 일치한다.
  const reviewAnswers = useMemo(
    () => ({ ...planAnswers, [key]: answers, [FINANCIAL_OVERRIDE_KEY]: finOverrides }),
    [planAnswers, key, answers, finOverrides],
  );

  // 이 섹션이 걸려 있는 모순만 추린다 — 다른 챕터 이야기로 주의를 뺏지 않는다.
  const sectionIssues = useMemo(
    () => issuesForSection(findConsistencyIssues(reviewAnswers, loadState().business), key),
    [reviewAnswers, key],
  );

  // 지금도 실제로 어긋나 있는 질문 — 답을 고치면 즉시 빠져서 빨간 표시가 풀린다
  const liveConflictQids = useMemo(() => {
    const s = new Set<string>();
    for (const issue of sectionIssues) {
      for (const r of issue.refs) {
        if (r.key === key) for (const qid of r.qids ?? []) s.add(qid);
      }
    }
    return s;
  }, [sectionIssues, key]);

  /** 이 섹션이 잠겨 있는지 — 서버와 같은 규칙 */
  const gate: "login_required" | "payment_required" | null = !access
    ? null
    : !access.authenticated
      ? "login_required"
      : access.paid || access.freeKeys.includes(key)
        ? null
        : "payment_required";

  /**
   * 안내 비컨의 대상 — 순서상 첫 미완료 섹션.
   * 레퍼런스 방식: 다음 행동으로 이어지는 모든 클릭 지점(목차 항목·생성 버튼)에
   * 같은 펄스를 동시에 붙이고, 상태가 바뀌면 비컨이 다음 대상으로 옮겨간다.
   */
  const guideKey = useMemo(() => {
    for (const ch of chapters) {
      for (const sec of ch.sections) {
        const k = sectionKey(ch.id, sec.id);
        if (statuses[k] !== "done") return k;
      }
    }
    return null;
  }, [chapters, statuses]);

  // 트래커 그룹이 방금 다 채워졌을 때 한 번 번쩍 — 진행이 반영됐음을 알린다
  const prevFilled = useRef<Set<string>>(new Set());
  const [flashed, setFlashed] = useState<Set<string>>(new Set());
  useEffect(() => {
    const now = new Set<string>();
    for (const g of groups) {
      const pg = perGroup[g.id];
      if (pg && pg.total > 0 && pg.done >= pg.total) now.add(g.id);
    }
    const fresh = [...now].filter((id) => !prevFilled.current.has(id));
    prevFilled.current = now;
    if (!fresh.length) return;
    setFlashed((prev) => new Set([...prev, ...fresh]));
    const t = setTimeout(() => {
      setFlashed((prev) => {
        const next = new Set(prev);
        for (const id of fresh) next.delete(id);
        return next;
      });
    }, 1000);
    return () => clearTimeout(t);
  }, [groups, perGroup]);

  const complete = answeredReq >= totalReq;

  /** 아직 답하지 않은 필수 질문 id — 화면 순서대로 */
  const missingIds = useMemo(() => {
    const out: string[] = [];
    for (const g of groups) {
      for (const q of g.questions) {
        if (q.optional || !isVisible(q, answers)) continue;
        if (!isAnswered(q, answers[q.id])) out.push(q.id);
      }
    }
    return out;
  }, [groups, answers]);

  /** 다 채웠으면 생성, 아니면 첫 빈 항목으로 데려간다. */
  /**
   * 하나뿐인 다음 버튼.
   * 필수 답변이 비어 있으면 그 질문으로 데려가고,
   * 다 채웠으면 본문 생성을 뒤에 맡기고 바로 다음 섹션으로 넘어간다.
   */
  /*
   * 예시 답변을 건드리면 막고 이유를 알린다.
   * 조용히 무시하면 고쳐진 줄 알고 넘어간다 — 문서 화면에서 겪었던 문제다.
   */
  function blockSampleEdit(event: React.SyntheticEvent) {
    event.preventDefault();
    event.stopPropagation();
    setSampleBlocked(true);
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goNext() {
    if (!complete) {
      setShowMissing(true);
      const first = missingIds[0];
      if (!first) return;
      window.setTimeout(() => {
        const container = bodyRef.current;
        const el = container?.querySelector<HTMLElement>(`[data-qid="${first}"]`);
        if (!container || !el) return;
        scrollToElement(container, el);
        el.querySelector<HTMLElement>("input, textarea, button")?.focus({ preventScroll: true });
      }, 40);
      return;
    }

    setShowMissing(false);
    // 아직 본문이 없거나 답변을 고쳤으면 생성을 걸어 둔다(이미 만든 그대로면 그냥 넘어간다)
    if (!readOnly && !locked && (!hasBody || answersDirty)) {
      saveAnswers(key, answers);
      enqueueGeneration({
        key,
        chapterId: chapter.id,
        sectionId: section.id,
        title: section.title,
        answers,
        allAnswers: mergedAnswers(),
      });
      setHasBody(true);
      setAnswersDirty(false);
      onComplete?.(chapter.id, section.id, answers);
    }

    if (nextSection) onNavigateSection?.(nextSection.chapterId, nextSection.sectionId);
    else onOpenDocument?.();
  }

  const C = 2 * Math.PI * 15.5;

  return (
    <div className={styles.page}>
      <div className={styles.frame}>
        <div className={styles.app}>

          {/* main */}
          <section className={styles.main}>
            <div className={styles.mhead}>
              <div className={styles.crumb}>{chapter.title}</div>
              <h1>{section.title}</h1>
              <div className={styles.meters}>
                {/* '상태'는 하단 버튼과 중복이라 뺐다 — 시간과 진행만 남긴다 */}
                <div className={styles.mt}><div className={styles.mtL}>예상 소요시간</div><div className={styles.mtV}><span className={styles.mtPrefix}>예상 소요시간 </span>{estimateMinutes(key, section.title, planType)}분</div></div>

              </div>
            </div>

            <div className={styles.mbody} ref={bodyRef}>
              {readOnly && !hasSampleAnswers ? (
                /* 답변이 준비되지 않은 예시 — 완성 문서로 안내한다 */
                <div className={styles.samplePanel}>
                  <strong>예시로 만들어 둔 완성 문서예요</strong>
                  <p>이 예시는 완성본만 준비돼 있습니다. 완성된 본문은 문서 화면에서 볼 수 있어요.</p>
                  <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onOpenDocument}>
                    문서 보러 가기 →
                  </button>
                </div>
              ) : gate && !readOnly ? (
                <PlanGate
                  reason={gate}
                  freeLabels={access?.freeLabels}
                  price={access?.price}
                  sectionTitle={section.title}
                />
              ) : (
              <>
              {/*
                예시 문서 — 질문과 답변을 그대로 보여준다.
                이 화면을 감추면 '무엇을 답하면 저런 문서가 나오는지'를 알 수 없다.
                고치려고 하면 막고 이유를 알린다.
              */}
              {readOnly && (
                <div className={styles.sampleBanner}>
                  <strong>이렇게 답해서 만든 문서예요</strong>
                  <p>아래는 예시로 채워 둔 답변입니다. 내 플랜에서는 직접 답하면 이 자리에 내 사업 내용이 들어갑니다.</p>
                  {sampleBlocked && <span className={styles.sampleBlocked}>예시라서 답변을 수정할 수 없습니다</span>}
                </div>
              )}
              <InheritNote />
              <ConsistencyPanel issues={sectionIssues} onOpenSection={onNavigateSection} compact />

              {/* 상태 칩 — 이미 만든 섹션인지, 지금 만들어지는 중인지 */}
              {(hasBody || isGenerating(key)) && (
                <div className={styles.genHead}>
                  {isGenerating(key) ? (
                    <span className={styles.genBadge}><Spinner /> 본문 만드는 중…</span>
                  ) : (
                    <span className={styles.genBadge}><Sparkles size={13} /> 본문 작성 완료</span>
                  )}
                  {readOnly && <span className={styles.lockBtn}>예시 문서 · 열람 전용</span>}
                </div>
              )}

              <div
                className={readOnly ? styles.sampleLocked : undefined}
                onClickCapture={readOnly ? blockSampleEdit : undefined}
                onKeyDownCapture={readOnly ? blockSampleEdit : undefined}
              >
              {(
                (stepGroup ? [stepGroup] : []).map((g: QuestionGroup) => (
                  <div key={`${g.id}-${stepIndex}`} className={styles.group}>
                    <div className={styles.gl}>
                      <span className={styles.gi} aria-hidden="true" />{g.label}
                      {stepCount > 1 && <span className={styles.glStep}>{stepIndex + 1} / {stepCount}</span>}
                    </div>
                    {g.questions.filter((q) => isVisible(q, answers)).map((q) => (
                      <div
                        key={q.id}
                        data-qid={q.id}
                        className={`${styles.q} ${q.showWhen ? styles.qSub : ""} ${showMissing && missingIds.includes(q.id) ? styles.qMissing : ""} ${conflictQids.includes(q.id) ? (liveConflictQids.has(q.id) ? styles.qConflict : styles.qResolved) : ""} ${currentQid === q.id ? ringClass() : ""}`}
                      >
                        {currentQid === q.id && <GuideBubble text="여기부터 답하면 돼요" />}
                        <div className={styles.qq}>
                          {q.q}
                          {showMissing && missingIds.includes(q.id) && <span className={styles.needTag}>입력이 필요합니다</span>}
                          {conflictQids.includes(q.id) && (liveConflictQids.has(q.id)
                            ? <span className={styles.conflictTag}>이 답변이 서로 달라요</span>
                            : <span className={styles.resolvedTag}>해결됐어요</span>)}
                        </div>
                        {q.help && <div className={styles.qh}>{q.help}</div>}
                        {renderInput(q, answers[q.id], { setAnswer, toggleMulti, styles, suggested: suggestions[q.id] ?? [] })}
                        {q.aiSuggest && (
                          <AISuggest
                            q={q}
                            loading={!!loadingSug[q.id]}
                            list={suggestions[q.id]}
                            picked={
                              Array.isArray(answers[q.id])
                                ? (answers[q.id] as string[])
                                : typeof answers[q.id] === "string" && answers[q.id]
                                  ? [answers[q.id] as string]
                                  : []
                            }
                            onLoad={() => loadSuggest(q)}
                            onPick={(text) => {
                              if (q.input.kind === "text") setAnswer(q.id, text);
                              else if (q.input.kind === "multi") toggleMulti(q.id, text);
                              else setAnswer(q.id, text);
                            }}
                            styles={styles}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                ))
              )}
              </div>

              {/* 재무 챕터에서는 인식한 숫자와 계산 결과를 항상 확인할 수 있게 한다 */}
              {chapter.id === "financials" && (
                <FinancialReview allAnswers={reviewAnswers} onOverride={setFinOverride} />
              )}
              </>
              )}
            </div>

            {/* 잠긴 화면(로그인·결제 안내)에는 하단 바가 필요 없다 — 빈 띠만 남았다 */}
            {gate && !readOnly ? null : (
            <div className={styles.foot}>
              {/* 진행 게이지 — 하단 바 위쪽 끝에 꽉 차게. 지나온 묶음은 초록. */}
              {stepCount > 1 && (
                <span className={styles.gauge} aria-hidden="true">
                  <i style={{ width: `${Math.round(((stepIndex + 1) / stepCount) * 100)}%` }} />
                </span>
              )}

              {/*
               * 버튼은 하나다.
               * 본문 생성은 뒤에서 돌고, 사용자는 계속 다음 질문으로 나아간다.
               * (본문 확인·수정은 문서 화면에서 한꺼번에)
               */}
              {readOnly ? (
                <>
                  <span className={styles.readOnlyNote}>예시 답변 · 수정 불가</span>
                  <button type="button" className={styles.btn} onClick={onOpenDocument}>완성 문서 보기</button>
                  <a className={`${styles.btn} ${styles.btnPrimary}`} href="/plan/start">내 플랜 만들기 →</a>
                </>
              ) : (
                <>
                  {totalPendingCount() > 0 && (
                    <span className={styles.readOnlyNote}>
                      <Spinner /> 본문 {totalPendingCount()}개를 서버에서 만들고 있어요 — 창을 닫아도 계속됩니다
                    </span>
                  )}
                  {stepIndex > 0 && (
                    <button className={styles.btn} onClick={() => { setGi(stepIndex - 1); bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }}>
                      ← 이전
                    </button>
                  )}
                  <button
                    className={`${styles.btn} ${styles.btnPrimary} ${complete ? styles.beacon : ""}`}
                    onClick={() => {
                      if (!isLastStep) {
                        /* 이 묶음의 필수 답이 비었으면 그 질문으로 데려간다 — 다음 묶음으로 넘기지 않는다 */
                        const miss = (stepGroup?.questions ?? []).filter(
                          (q) => !q.optional && isVisible(q, answers) && !isAnswered(q, answers[q.id]),
                        );
                        if (miss.length > 0) { goNext(); return; }
                        setGi(stepIndex + 1);
                        setShowMissing(false);
                        bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                        return;
                      }
                      goNext();
                    }}
                  >
                    {!isLastStep
                      ? "다음 →"
                      : nextSection
                        ? `다음 단계 (${currentIndex + 2}/${flatSectionList.length}) →`
                        : "문서 보러 가기 →"}
                  </button>
                </>
              )}
            </div>
            )}
          </section>

          {/* tracker */}
          <aside className={styles.tracker}>
            <div className={styles.tpH}>이 섹션 진행률</div>
            <div className={styles.ring}>
              <svg viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--wz-track)" strokeWidth="4" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--wz-brand)" strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C - (C * pct) / 100} transform="rotate(-90 18 18)" />
              </svg>
              <div><div className={styles.rt}>{pct}%</div><div className={styles.rl}>{answeredReq} / {totalReq} 문항</div></div>
            </div>
            <div className={styles.tpH}>항목</div>
            <ul className={styles.trackList}>
              {groups.map((g) => {
                const pg = perGroup[g.id] ?? { done: 0, total: 0 };
                const filled = pg.total > 0 && pg.done >= pg.total;
                return (
                  <li key={g.id} className={`${filled ? styles.filled : ""} ${showMissing && !filled ? styles.trackMissing : ""} ${flashed.has(g.id) ? styles.flash : ""}`}>
                    <span className={styles.tdot}>{filled && <Check />}</span>
                    <span className={styles.tn}>{g.label}</span>
                    <span className={styles.tc}>{pg.done}/{pg.total}</span>
                  </li>
                );
              })}
            </ul>
            <button
              className={`${styles.finish} ${!complete ? styles.finishWaiting : !gate ? styles.beacon : ""}`}
              disabled={!!gate}
              onClick={goNext}
            >
              <Check n={16} /> {complete ? (nextSection ? "다음 단계" : "문서 보러 가기") : `${totalReq - answeredReq}개 더 답하기`}
            </button>
          </aside>
        </div>
      </div>
    </div>
  );
}

/*
 * AI 추천.
 *
 * 예전에는 고르면 위쪽에 칩으로 쌓았다. 추천 문장이 길다 보니 칩이
 * 서너 줄을 먹고 화면이 흐트러졌고, 같은 문장이 카드와 칩 두 곳에
 * 나와 무엇이 골라진 상태인지 오히려 헷갈렸다.
 * 이제는 고른 카드 자체가 파랗게 켜진다 — 다시 누르면 꺼진다.
 */
function AISuggest({
  q,
  loading,
  list,
  picked,
  onLoad,
  onPick,
  styles,
}: {
  q: QuestionDef;
  loading: boolean;
  list?: string[];
  /** 지금 골라져 있는 값들 — 카드를 켜진 상태로 보여주기 위해 */
  picked: string[];
  onLoad: () => void;
  onPick: (text: string) => void;
  styles: Record<string, string>;
}) {
  return (
    <div>
      {!list && (
        <button className={styles.suggestBtn} disabled={loading} onClick={onLoad}>
          {loading ? <Spinner /> : <Sparkles size={13} />} {loading ? "추천 불러오는 중…" : "AI 추천 받기"}
        </button>
      )}
      {list && list.length > 0 && (
        <div className={styles.sugList}>
          {list.map((s, i) => {
            const on = picked.includes(s);
            return (
              <button
                key={i}
                type="button"
                className={`${styles.sugCard} ${on ? styles.sugCardOn : ""}`}
                aria-pressed={on}
                onClick={() => onPick(s)}
              >
                {s}
              </button>
            );
          })}
          <button className={styles.suggestBtn} disabled={loading} onClick={onLoad}>
            {loading ? <Spinner /> : <Sparkles size={12} />} {loading ? "다시 불러오는 중…" : "다른 추천 받기"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * 정해진 보기가 없는 질문(상품 분류·문제·세그먼트 등).
 * 예전에는 AI 추천이 오기 전까지 아무것도 없어서 손을 댈 수 없었다.
 * 이제 직접 적어 넣을 수 있고, AI 추천은 아래에서 골라 더할 수 있다.
 */
function FreeChoice({
  value,
  multi,
  placeholder,
  onChange,
  styles,
  suggested = [],
}: {
  value: unknown;
  multi: boolean;
  placeholder: string;
  onChange: (v: unknown) => void;
  styles: Record<string, string>;
  /** 지금 화면에 떠 있는 AI 추천 — 이 문장들은 카드가 켜져서 보이므로 칩으로 또 쌓지 않는다 */
  suggested?: string[];
}) {
  const [draft, setDraft] = useState("");
  const picked = multi
    ? Array.isArray(value)
      ? (value as string[])
      : []
    : typeof value === "string" && value
      ? [value]
      : [];

  function add() {
    const t = draft.trim();
    if (!t) return;
    if (multi) {
      if (!picked.includes(t)) onChange([...picked, t]);
    } else {
      onChange(t);
    }
    setDraft("");
  }
  function remove(v: string) {
    if (multi) onChange(picked.filter((x) => x !== v));
    else onChange("");
  }

  /*
   * 추천 카드에 이미 켜져 있는 문장은 칩으로 또 보여주지 않는다.
   * 같은 문장이 두 곳에 나오면 무엇이 골라졌는지 오히려 헷갈리고,
   * 추천 문장은 길어서 칩이 서너 줄을 먹는다.
   */
  const chips = picked.filter((v) => !suggested.includes(v));

  return (
    <div className={styles.free}>
      {chips.length > 0 && (
        <div className={styles.freeChips}>
          {chips.map((v) => (
            <span key={v} className={styles.freeChip}>
              {v}
              <button type="button" onClick={() => remove(v)} aria-label={`${v} 빼기`}>
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className={styles.freeRow}>
        <input
          className={styles.txt}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault(); // 폼 제출·줄바꿈 방지만
          }}
          onKeyUp={(e) => {
            /*
             * 추가는 keyup에서 한다. keydown 시점엔 한글 IME 조합이 아직
             * 확정 전이라, 거기서 추가하면 마지막 음절이 한 번 더 들어갔다
             * ("어려움" → "움" 중복 칩). keyup 시점엔 조합이 끝나 있어
             * Enter 한 번으로 완전한 문자열이 정확히 한 번 추가된다.
             */
            if (e.key === "Enter") add();
          }}
        />
        <button type="button" className={styles.freeAdd} onClick={add} disabled={!draft.trim()}>
          추가
        </button>
      </div>
      <p className={styles.freeHint}>
        직접 적어 넣거나, 아래 <b>AI 추천</b>에서 골라 더할 수 있어요.
      </p>
    </div>
  );
}

function renderInput(
  q: QuestionDef,
  value: unknown,
  ctx: {
    setAnswer: (qid: string, v: unknown) => void;
    toggleMulti: (qid: string, opt: string) => void;
    styles: Record<string, string>;
    /** 지금 떠 있는 AI 추천 — 자유 입력이 중복 칩을 만들지 않도록 */
    suggested?: string[];
  }
) {
  const { setAnswer, toggleMulti, styles } = ctx;

  switch (q.input.kind) {
    case "yesno":
      return (
        <div className={styles.yn}>
          {["예", "아니오"].map((label, i) => {
            const val = i === 0 ? "yes" : "no";
            return (
              <button key={val} className={`${styles.opt} ${value === val ? styles.on : ""}`} onClick={() => setAnswer(q.id, val)}>
                {label}
              </button>
            );
          })}
        </div>
      );
    case "single": {
      const opts = q.input.options;
      if (opts.length === 0) {
        return <FreeChoice value={value} multi={false} placeholder="직접 입력하고 Enter" onChange={(v) => setAnswer(q.id, v)} styles={styles} suggested={ctx.suggested} />;
      }
      return (
        <div className={styles.radio}>
          {opts.map((opt) => (
            <button key={opt} className={`${styles.opt} ${value === opt ? styles.on : ""}`} onClick={() => setAnswer(q.id, opt)}>{opt}</button>
          ))}
        </div>
      );
    }
    case "multi": {
      const opts = q.input.options;
      const arr = Array.isArray(value) ? (value as string[]) : [];
      if (opts.length === 0) {
        return <FreeChoice value={value} multi placeholder="직접 입력하고 Enter" onChange={(v) => setAnswer(q.id, v)} styles={styles} suggested={ctx.suggested} />;
      }
      return (
        <div className={styles.chk}>
          {opts.map((opt) => (
            <button key={opt} className={`${styles.opt} ${arr.includes(opt) ? styles.on : ""}`} onClick={() => toggleMulti(q.id, opt)}>
              <span className={styles.box}><Check n={12} /></span>
              {opt}
            </button>
          ))}
        </div>
      );
    }
    case "select":
      return (
        <div className={styles.radio}>
          {q.input.options.map((opt) => (
            <button key={opt} className={`${styles.opt} ${value === opt ? styles.on : ""}`} onClick={() => setAnswer(q.id, opt)}>{opt}</button>
          ))}
        </div>
      );
    case "text":
      return q.input.long ? (
        <textarea className={styles.txt} rows={3} placeholder={q.input.placeholder} value={typeof value === "string" ? value : ""} onChange={(e) => setAnswer(q.id, e.target.value)} />
      ) : isRegionQuestion(q) ? (
        /* 지역은 손으로 다 치지 않아도 되게 — '마포' 만 쳐도 '서울 마포구' */
        <RegionInput
          className={styles.txt}
          placeholder={q.input.placeholder}
          value={typeof value === "string" ? value : ""}
          onChange={(v) => setAnswer(q.id, v)}
        />
      ) : (
        <input className={styles.txt} placeholder={q.input.placeholder} value={typeof value === "string" ? value : ""} onChange={(e) => setAnswer(q.id, e.target.value)} />
      );
    default:
      return null;
  }
}
