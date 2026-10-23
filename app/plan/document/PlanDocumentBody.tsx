"use client";

import { apiMessage, userErrorMessage } from "../../../lib/client/user-error";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGenerationProgress } from "../GenerationProgress";
import { useRouter } from "next/navigation";
import DocumentWorkspace from "./DocumentWorkspace";
import PlanLoading from "../PlanLoading";
import MissingBusinessScreen from "../MissingBusiness";
import { hydrateFromServer, lastHydrationFailed, assembleSections, activePlan, loadState, isSamplePlan, setActivePlan, type Plan } from "../../../lib/plan-builder/plan-store";
import { chaptersForType, documentArrangement } from "../../../lib/plan-builder/blueprint";
import { htmlToMarkdown } from "../../../lib/plan-builder/html-to-markdown";
import { coachDocumentSnapshot, completedDocumentKey } from "../../../lib/plan-builder/coach-document";
import { documentContext } from "../../../lib/plan-builder/document-context";
import { useDeckExport } from "./use-deck-export";
import { PPT_GENERATION_VERIFIED } from "../../../lib/plan-builder/deck-availability";
import { useDocumentEdits } from "./use-document-edits";
import { coachDocumentRevision, currentBusinessDesign, readCoach } from "../../../lib/plan-builder/coach";
import type { DocumentReviewSource } from "./DocumentSourceReview";
import { buildExecutiveSummary, hasExecutiveSummaryContent, type ExecutiveSummary } from "../../../lib/plan-builder/executive-summary";
import { PACKAGE_AMOUNT } from "../../../lib/payments/domain";
import { businessHubState } from "../../../lib/plan-builder/business-hub";
import { showNotice } from "../../../components/confirm-dialog";
import { saveFile, saveUrl, SAVE_UNSUPPORTED_MESSAGE } from "../../../lib/save-file";
import { useStudioDirty, useStudioNav, useStudioPane } from "../studio/StudioContext";
import { MissingBusinessBody } from "../MissingBusiness";
import hub from "../BusinessHub.module.css";
import frame from "../chat/page.module.css";
import styles from "./DocumentWorkspace.module.css";

/** 화면의 장별 읽기와 관계없이 전체 문서를 같은 배치로 내보낸다. */
/** 이 장이 이번 제작(__coach_generation.revision) 기준으로 써졌는지 — 직접 고치거나 잠근 장은 다시 쓰지 않으니 써진 것으로 본다 */
function writtenForCurrentRun(plan: Plan, key: string): boolean {
  const section = plan.sections[key] as (Plan["sections"][string] & { coachRevision?: number; edited?: boolean; locked?: boolean }) | undefined;
  if (!section || !(section.markdown?.trim() || section.html?.trim())) return false;
  const revision = (plan.answers.__coach_generation as { revision?: number } | undefined)?.revision;
  return revision == null || section.coachRevision === revision || !!section.edited || !!section.locked;
}

export function PlanDocumentBody() {
  const router = useRouter();
  /* 작업실 안이면 그 칸의 사업 — 주소를 고쳐 쓰지 않고(작업실 주소가 망가진다), 사업은 작업실이 정해 준다 */
  const pane = useStudioPane();
  const panePlanId = pane?.planId ?? null;
  /*
   * 작업실에서 계획서 칸이 숨겨져 있는 동안(대화·홈페이지 탭을 보는 중) 새 장이 써지거나 작성이 끝나면 그 탭에 점을 찍는다.
   * 이미 4초마다 묻는 진행(아래)에서 새로 붙인 장이 있을 때만 — 따로 묻지 않는다. 작업실 밖에서는 아무 일도 없다.
   */
  const studioNav = useStudioNav();
  const activityRef = useRef<{ mark?: (tab: "plan") => void; active: boolean }>({ active: true });
  activityRef.current = { mark: pane ? studioNav?.markActivity : undefined, active: pane?.active ?? true };
  const [sections, setSections] = useState<ReturnType<typeof assembleSections>>([]);
  const [title, setTitle] = useState("사업계획서");
  const [identity, setIdentity] = useState<{ headline: string; pitch: string } | undefined>(undefined);
  const [planType, setPlanType] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "docx" | "pptx" | null>(null);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /* 주소의 사업을 못 찾았는데 서버 목록도 못 불러왔을 때 — 목록으로 보내지 않고 다시 시도하게 */
  const [loadFailed, setLoadFailed] = useState(false);
  /* 주소의 사업이 없다(지웠거나 다른 계정 것) */
  const [missing, setMissing] = useState(false);
  const [isSample, setIsSample] = useState(false);
  /** 이 문서의 결제 상태 — null이면 확인 중. 잠겨 있으면 버튼에 미리 보여준다 */
  const [access, setAccess] = useState<{ paid: boolean; price: number } | null>(null);
  const [accessError, setAccessError] = useState(false);
  const [documentPlanId, setDocumentPlanId] = useState<string | null>(null);
  /*
   * 만드는 중이면 몇 초마다 진행을 묻고, 새로 끝난 장만 서버에서 다시 받아 붙인다 — 새로고침하지 않아도 장이 하나씩 생긴다.
   * 이미 보이던 장(사람이 보고 있거나 고치는 중일 수 있다)은 건드리지 않는다. 새 장은 '쓰이는 것처럼' 문단이 차례로 나타난다.
   */
  const generation = useGenerationProgress(documentPlanId && !isSample ? documentPlanId : null, true, 4000);
  /*
   * 화면에 붙인 장(이번 제작 기준으로 써진 것) — 서버가 다 썼다고 하는데 아직 안 붙인 장을 매번 다시 받아 붙인다.
   * 예전엔 '본 적 있음'을 받기 전에 표시해서, 받아 오다 한 번 실패하거나 처음 열 때 사이에 끝난 장은 새로고침 전까지 안 보였다.
   * 끝나면(진행 중 → 끝) 한 번 더 맞추고 완료 안내·다음 단계를 띄운다(updateSourceStatus).
   */
  const appliedKeys = useRef<Set<string>>(new Set());
  /* 이 칸이 스스로 새 소식을 알렸다 — 그 알림으로 오르는 새로 읽기 번호(pane.refresh)에는 다시 받지 않는다(방금 받았다) */
  const selfMarked = useRef(false);
  const wasActive = useRef(false);
  const syncing = useRef(false);
  const [freshKeys, setFreshKeys] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const progress = generation.state;
    if (!progress || !documentPlanId) return;
    const pending = progress.sections.filter(section => section.done && !appliedKeys.current.has(section.key)).map(section => section.key);
    const finished = wasActive.current && !progress.active;
    if (progress.active) wasActive.current = true;
    if ((!pending.length && !finished) || syncing.current) return;
    syncing.current = true;
    // 전체 상태를 다시 올리지 않는다(autoPush=false) — 받기만 한다
    hydrateFromServer(false).then(state => {
      const plan = state.plans.find(item => item.id === documentPlanId);
      if (!plan) return;
      const arrived = pending.filter(key => writtenForCurrentRun(plan, key));
      /* 작성이 끝났으면 새 장이 없어도 한 번 맞춘다 — 보이던 장은 그대로, 아직 안 붙은 장만 붙어 내려받기 · 다음 단계 단추가 바로 생긴다 */
      if (arrived.length || finished) {
        const fresh = assembleSections({ ...state, activePlanId: documentPlanId });
        setSections(current => fresh.map(item => { const shown = current.find(section => section.key === item.key); return shown && (shown.markdown || shown.html) && !arrived.includes(item.key) ? shown : item; }));
        for (const key of arrived) appliedKeys.current.add(key);
        if (arrived.length) setFreshKeys(new Set(arrived));
      }
      if (arrived.length || finished) updateSourceStatus(plan);
      /* 만드는 중에 새로 붙은 장·작성 끝만 — 처음 열 때 이미 써 있던 장을 붙이는 것은 새 소식이 아니다 */
      if (((arrived.length && progress.active) || finished) && !activityRef.current.active && activityRef.current.mark) { selfMarked.current = true; activityRef.current.mark("plan"); }
      if (finished) wasActive.current = false;
    }).catch(() => { /* 다음 차례에 다시 받는다 */ }).finally(() => { syncing.current = false; });
  }, [generation.state, documentPlanId]); // eslint-disable-line react-hooks/exhaustive-deps
  // A finished run with a section still missing stopped there (that section failed twice) — stop showing "writing".
  const writing = generation.state?.active && !["errored", "terminated", "complete"].includes(generation.state.runStatus ?? "")
    ? { done: generation.state.done, total: generation.state.total, current: generation.state.sections.find(section => !section.done)?.title ?? null } : null;
  const [coachHref, setCoachHref] = useState<string | null>(null);
  const [contextNotice, setContextNotice] = useState("");
  const [completionKey, setCompletionKey] = useState<string | null>(null);
  /** 모든 항목이 써졌는지 — 사업 조건이 바뀌어 다시 볼 곳이 있어도 다음 단계는 보여 준다 */
  const [allWritten, setAllWritten] = useState(false);
  const [reviewSource, setReviewSource] = useState<DocumentReviewSource | null>(null);
  const [summary, setSummary] = useState<ExecutiveSummary | null>(null);
  const [summaryError, setSummaryError] = useState("");
  function updateSourceStatus(plan: Plan) {
    try {
      const nextSummary = buildExecutiveSummary(plan, documentContext(loadState(), plan.id)?.business);
      setSummary(isSamplePlan(plan.id) || !hasExecutiveSummaryContent(nextSummary) ? null : nextSummary);
      setSummaryError("");
    } catch {
      setSummary(null); setSummaryError("저장된 실적 기록을 읽지 못해 한 장 요약은 보여 드리지 않았어요. 기존 문서는 그대로 있어요.");
    }
    const coach = readCoach(plan.answers), snapshot = coachDocumentSnapshot(plan);
    setCompletionKey(isSamplePlan(plan.id) ? null : completedDocumentKey(plan));
    setAllWritten(!isSamplePlan(plan.id) && businessHubState(plan).complete);
    setReviewSource(coach ? { revision: coachDocumentRevision(coach), fields: coach.fields, sections: Object.fromEntries(Object.entries(plan.sections).filter(([, section]) => section.coachRevision !== coachDocumentRevision(coach)).map(([key, section]) => [key, section.generatedAt])) } : null);
    /* 예시는 읽기 전용 — 갱신·검토 안내를 띄우지 않는다 */
    setContextNotice(isSamplePlan(plan.id) ? "" : snapshot?.stale.length ? "바꾼 답이 아직 계획서에 들어가지 않았어요" : snapshot?.manualReview.length ? "직접 고친 항목이 있어요. 바꾼 답과 맞는지 한 번 확인해 주세요" : "");
  }
  // PPT 자동 생성이 꺼져 있으면 제작 상태를 묻지 않는다(오픈 범위 밖 — lib/launch-scope.ts)
  const deck = useDeckExport(documentPlanId, PPT_GENERATION_VERIFIED && !isSample && !!access?.paid, title);
  const edits = useDocumentEdits((key, section) => {
    setSections(current => current.map(item => item.key === key ? { ...item, markdown: section.markdown, html: section.html } : item));
    const plan = loadState().plans.find(item => item.id === documentPlanId);
    if (plan) updateSourceStatus(plan);
    void deck.refresh();
  });

  /* 작업실 안 — 서버 저장이 안 끝났거나 실패한 수정이 있으면 작업실 밖으로 나갈 때 한 번 묻는다(탭 바꾸기는 칸을 그대로 두니 묻지 않는다) */
  useStudioDirty("plan-document", edits.pending, "저장하지 못한 계획서 수정이 있어요. 나가면 이 기기에 보관한 초안만 남아요.");

  useEffect(() => {
    let alive = true;
    /* 서버 확인이 실패해도 끝없이 '불러오는 중'에 머물지 않게 — 이 기기의 저장본으로 이어서 연다 */
    hydrateFromServer().catch(() => loadState()).then((s) => {
      if (!alive) return;
      const requested = panePlanId ?? new URLSearchParams(window.location.search).get("planId");
      if (requested) {
        // 서버 목록을 못 불러와서 못 찾은 것이면 목록으로 보내지 않는다(목록도 비어 보인다) — 다시 시도하게
        // 못 찾은 사업은 말없이 목록으로 보내지 않는다 — 다른 화면과 같은 '사업을 찾지 못했어요'(MissingBusiness)
        if (!s.plans.some(p => p.id === requested)) { if (lastHydrationFailed()) { setLoadFailed(true); setReady(true); return; } setMissing(true); setReady(true); return; }
        s = { ...s, activePlanId: requested }; setActivePlan(requested);
      }
      setSections(assembleSections(s));
      const p = activePlan(s);
      // 처음 열 때 이미 화면에 있는 장 — 이번 제작 기준으로 써진 것만 '붙였음'으로 센다(나머지는 진행 확인 때 받아 붙인다)
      if (p) appliedKeys.current = new Set(Object.keys(p.sections).filter(key => writtenForCurrentRun(p, key)));
      if (p) {
        const recovered = isSamplePlan(p.id) ? {} : edits.initialize(p);
        setSections(assembleSections(s).map(section => recovered[section.key] ? { ...section, html: recovered[section.key], markdown: htmlToMarkdown(recovered[section.key]) } : section));
        if (!requested) router.replace(`/plan/document?planId=${encodeURIComponent(p.id)}`);
        updateSourceStatus(p);
        const snapshot = coachDocumentSnapshot(p);
        if (snapshot) {
          setCoachHref(`/plan/chat?planId=${encodeURIComponent(p.id)}`);
        }
        setDocumentPlanId(p.id);
        setTitle(p.title);
        const coachState = readCoach(p.answers);
        const identityNow = coachState ? currentBusinessDesign(coachState)?.identity : undefined;
        setIdentity(identityNow ? { headline: identityNow.headline, pitch: identityNow.pitch } : undefined);
        setPlanType(p.planType);
        setIsSample(isSamplePlan(p.id));
        if (!isSamplePlan(p.id)) {
          fetch(`/api/plan/access?planType=${encodeURIComponent(p.planType)}&planId=${encodeURIComponent(p.id)}`)
            .then((r) => { if (!r.ok) throw new Error("access unavailable"); return r.json(); })
            // 결제 확인을 못 했다(unavailable)를 '미결제'로 읽지 않는다 — 결제한 사람에게 결제하라고 했다
            .then((d) => { if (d.unavailable) throw new Error("access unavailable"); if (alive) setAccess({ paid: !!d.paid, price: Number(d.price) || PACKAGE_AMOUNT }); })
            .catch(() => { if (alive) setAccessError(true); });
        }
      }
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [router, panePlanId]);

  /*
   * 문서 배치. PSST처럼 재배치가 정의된 유형은 그 순서·제목으로 묶고,
   * 아니면 작성 챕터 그대로 묶는다. 번호(1.1식)도 배치를 따른다.
   */
  const arrangement = useMemo(() => documentArrangement(planType || undefined), [planType]);

  const numbering = useMemo(() => {
    const map = new Map<string, { num: string; chapterNum: number }>();
    if (arrangement) {
      arrangement.forEach((part, ci) => {
        part.keys.forEach((k, si) => map.set(k, { num: `${ci + 1}.${si + 1}`, chapterNum: ci + 1 }));
      });
      return map;
    }
    chaptersForType(planType || undefined).forEach((ch, ci) => {
      ch.sections.forEach((s, si) => map.set(`${ch.id}/${s.id}`, { num: `${ci + 1}.${si + 1}`, chapterNum: ci + 1 }));
    });
    return map;
  }, [planType, arrangement]);

  // 챕터별 그룹 (문서 흐름·목차 공용)
  const grouped = useMemo(() => {
    if (arrangement) {
      const byKey = new Map(sections.map((s) => [s.key, s]));
      return arrangement
        .map((part) => [part.title, part.keys.map((k) => byKey.get(k)).filter((x): x is (typeof sections)[number] => !!x)] as const)
        .filter(([, list]) => list.length > 0) as Array<[string, typeof sections]>;
    }
    const map = new Map<string, typeof sections>();
    for (const s of sections) {
      const list = map.get(s.chapterTitle) ?? [];
      list.push(s);
      map.set(s.chapterTitle, list);
    }
    return [...map.entries()];
  }, [sections, arrangement]);

  /** 내보내기용 — 화면과 같은 배치·같은 챕터 제목으로 보낸다 */
  const exportSections = useMemo(
    () => grouped.flatMap(([chapterTitle, list]) => list.map((s) => ({ chapterTitle, sectionTitle: s.sectionTitle, markdown: s.markdown }))),
    [grouped],
  );

  /** 문서에서 고친 내용을 저장한다. 원본은 마크다운이므로 되돌려 담는다. */
  function saveEdit(key: string, nextHtml: string) {
    edits.save(key, nextHtml);
  }

  /** 완성한 계획서로 발표용 PPT를 만든다(결제 확인은 서버가 한다). */
  async function handleDeck() {
    if (sections.length) await deck.startOrDownload();
  }

  /** 파일을 받았으면 true — 화면이 내려받기 창을 닫고 '내려받았어요'를 보인다 */
  async function handleExport(format: "pdf" | "docx", view: "summary" | "detailed" = "detailed"): Promise<boolean> {
    if (!sections.length && view !== "summary") return false;
    setExporting(format);
    try {
      const context = documentContext(loadState(), documentPlanId);
      if (!context) throw new Error("document not found");
      const res = await fetch("/api/plan/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          format,
          view,
          sourceVersion: view === "summary" ? summary?.sourceVersion : undefined,
          planType,
          planId: context.plan.id,
          business: context.business,
          sections: exportSections,
        }),
      });
      if (res.status === 402) {
        await showNotice("PDF·Word 내려받기는 결제 후 이용할 수 있어요. 결제 화면으로 이동할게요.", { confirmLabel: "결제 화면으로" });
        goPay();
        return false;
      }
      if (!res.ok) {
        const failure = await res.json().catch(() => ({}));
        throw new Error(failure.message || "파일을 만들지 못했어요. 저장된 문서는 그대로 있어요.");
      }
      const blob = await res.blob();
      // 앱 안에서는 <a download> 가 아무 일도 하지 않는다 — 휴대폰 공유 창으로 건넨다(lib/save-file.ts)
      const saved = await saveFile(blob, `${title}${view === "summary" ? " 한 장 요약" : ""}.${format}`);
      if (saved === "unsupported") { setDeckError(SAVE_UNSUPPORTED_MESSAGE); return false; }
      return saved !== "cancelled";
    } catch (error) {
      setDeckError(userErrorMessage(error, "파일을 만들지 못했어요. 저장된 문서는 그대로 있어요."));
      return false;
    } finally {
      setExporting(null);
    }
  }

  const locked = !isSample && access !== null && !access.paid;
  const busy = exporting !== null || !sections.length || isSample || edits.pending;

  /*
   * 예시의 PDF·Word 는 미리 구워 둔 파일을 그냥 내려준다.
   *
   * 예시는 결제 대상이 아니라서 /api/plan/document 가 막는다. 서버 검사에 예외를
   * 내면 그 구멍으로 실제 문서도 새어 나가므로, 파일을 미리 만들어 두고
   * (scripts/bake-sample-files.mts) 정적 파일로 건넨다. 누를 때마다 만들지
   * 않으니 기다림도 없다.
   *
   * 발표자료(PPTX)도 같은 자리에 둔다. 다만 슬라이드 구성은 AI 가 만들기 때문에
   * 운영에서 한 번 뽑아 와야 굽을 수 있다(scripts/bake-sample-decks.mts).
   * 못 구운 예시가 생기면 그 단추만 잠기도록 목록으로 둔다.
   */
  const samplePlanId = isSample ? documentPlanId : null;
  const BAKED_DECKS = new Set(["sample_flower_fm", "sample_flower_psst", "sample_coffee"]);
  function sampleFile(ext: "pdf" | "docx" | "pptx"): string | null {
    if (!samplePlanId) return null;
    if (ext === "pptx" && !BAKED_DECKS.has(samplePlanId)) return null;
    return `/samples/${samplePlanId}.${ext}`;
  }

  /** 결제 전이면 서버 왕복 없이 바로 결제 화면으로 */
  function goPay() {
    if (!documentPlanId) return;
    router.push(`/plan/pay?planId=${encodeURIComponent(documentPlanId)}&planType=${encodeURIComponent(planType)}`);
  }

  async function retryAccess() {
    if (!documentPlanId) return;
    setAccessError(false);
    try {
      const response = await fetch(`/api/plan/access?planType=${encodeURIComponent(planType)}&planId=${encodeURIComponent(documentPlanId)}`);
      if (!response.ok) throw new Error("access unavailable");
      const data = await response.json();
      if (data.unavailable) throw new Error("access unavailable");
      setAccess({ paid: !!data.paid, price: Number(data.price) || PACKAGE_AMOUNT });
    } catch { setAccessError(true); }
  }

  /*
   * 작업실이 이 칸에 새 소식을 알리면(작성 시작 → 계획서 탭 보여 주기 · 점, useStudioPane().refresh) — 칸이 이미 보이고 있어도
   * 진행을 다시 묻고(처음 물었을 때 쉬고 있었으면 멈춰 있다) 문서를 다시 받는다. 예전엔 창을 다시 눌러야(focus) '쓰는 중'과 새 장이 보였다.
   * 보이던 장(보거나 고치는 중일 수 있다)은 건드리지 않고 아직 없는 장 · 제목 · 완료 상태만 맞춘다.
   */
  const paneRefresh = pane?.refresh ?? 0;
  const seenRefresh = useRef(paneRefresh);
  /*
   * 3단계: 작성 중이 아니면 보이던 장도 서버 내용이 달라졌을 때 바꿔 끼운다 — 대화 칸의 채팅 수정(edit-apply)이 금액을 본문에
   * 바로 바꿔 넣으면(patchDocumentAmounts) 숨어 있던 계획서 칸이 예전 금액을 그대로 보여 줬다. 고치는 중인 장(초안·저장 중)은 그대로 둔다.
   * 작성 중에는 예전처럼 아직 없는 장만 붙인다(새 장은 진행 확인이 문단 나타나기와 함께 붙인다).
   */
  const lastSync = useRef(0);
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  function syncFromServer(id: string, state: Awaited<ReturnType<typeof hydrateFromServer>>) {
    lastSync.current = Date.now();
    const plan = state.plans.find(item => item.id === id);
    if (!plan) return;
    const fresh = assembleSections({ ...state, activePlanId: id });
    /* 바꿔 끼울 장을 먼저 고른다(고치기 상태 맞추기는 그리기 밖에서) — 고치는 중인 장은 syncServer 가 false */
    const replace = new Set(generation.state?.active ? [] : fresh.filter(item => {
      const shown = sectionsRef.current.find(section => section.key === item.key);
      const stored = plan.sections[item.key];
      return shown && (shown.markdown || shown.html) && (shown.markdown !== item.markdown || shown.html !== item.html) && stored && edits.syncServer(id, item.key, stored);
    }).map(item => item.key));
    setSections(current => fresh.map(item => { const shown = current.find(section => section.key === item.key); return shown && (shown.markdown || shown.html) && !replace.has(item.key) ? shown : item; }));
    for (const key of Object.keys(plan.sections)) if (writtenForCurrentRun(plan, key)) appliedKeys.current.add(key);
    setTitle(plan.title);
    updateSourceStatus(plan);
  }
  useEffect(() => {
    if (seenRefresh.current === paneRefresh) return;
    seenRefresh.current = paneRefresh;
    if (selfMarked.current) { selfMarked.current = false; return; }
    const id = documentPlanId;
    if (!id || isSample) return;
    generation.restart();
    if (syncing.current) return;
    hydrateFromServer(false).then(state => syncFromServer(id, state)).catch(() => { /* 진행 확인이 다음 차례에 다시 받는다 */ });
  }, [paneRefresh, documentPlanId, isSample]); // eslint-disable-line react-hooks/exhaustive-deps
  /*
   * 숨어 있던 계획서 칸이 다시 보일 때(휴대폰 탭 · 오른쪽 탭 바꾸기) — 대화 칸이 새로 읽기 번호를 올리지 않은 채 사실을 바꿨어도
   * (채팅 수정 적용 등) 보이는 순간 한 번 서버 내용과 맞춘다. 탭을 자주 오가도 15초에 한 번만 묻는다.
   */
  const paneVisible = pane?.active ?? true;
  const wasVisible = useRef(paneVisible);
  useEffect(() => {
    const shown = paneVisible && !wasVisible.current;
    wasVisible.current = paneVisible;
    if (!shown || !pane || !documentPlanId || isSample || syncing.current || Date.now() - lastSync.current < 15000) return;
    const id = documentPlanId;
    lastSync.current = Date.now();
    hydrateFromServer(false).then(state => syncFromServer(id, state)).catch(() => { /* 다음에 보일 때 다시 받는다 */ });
  }, [paneVisible, documentPlanId, isSample]); // eslint-disable-line react-hooks/exhaustive-deps

  // 문서에서 금액을 고치면 서버가 본문 금액을 바로 바꿔 넣는다 — 새로고침 없이 보이게 다시 불러온다.
  const reloadSections = () => {
    if (!documentPlanId) return;
    hydrateFromServer().then(s => {
      const plan = s.plans.find(item => item.id === documentPlanId);
      if (!plan) return;
      setSections(assembleSections({ ...s, activePlanId: documentPlanId }));
      updateSourceStatus(plan);
    }).catch(() => undefined);
  };
  /* 작업실 안에서는 머리줄·main 없이 칸 본문만 — 작업실 루트가 페이지의 유일한 main 이다 */
  if (missing) return pane ? <div className={`${frame.page} ${styles.page}`} data-embedded=""><div className={hub.scroll}><div className={hub.content}><MissingBusinessBody /></div></div></div> : <MissingBusinessScreen chromeTitle="사업계획서" />;
  /* 작업실 안에서는 작업실 머리줄의 사업명이 h1 — 칸 안의 제목은 h2 */
  const FailedHeading = pane ? "h2" : "h1";
  const failedBody = <div><FailedHeading style={{ fontSize: 20, margin: "0 0 8px" }}>사업계획서를 불러오지 못했어요</FailedHeading><p style={{ color: "#667085", margin: "0 0 16px" }}>연결을 확인하고 다시 불러와 주세요. 작성한 내용은 서버에 그대로 있어요.</p><button type="button" onClick={() => window.location.reload()} style={{ padding: "10px 18px", borderRadius: 10, border: 0, background: "#236be5", color: "#fff", fontWeight: 700 }}>다시 불러오기</button></div>;
  if (loadFailed) return pane ? <div data-embedded="" style={{ height: "100%", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>{failedBody}</div> : <main style={{ minHeight: "60vh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
    {failedBody}
  </main>;
  return <DocumentWorkspace onReflected={() => generation.restart()} onFactsSaved={reloadSections} writing={writing} freshKeys={freshKeys} title={title} identity={identity} planId={documentPlanId} planType={planType} ready={ready}
    summary={summary} summaryError={summaryError}
    reviewSource={reviewSource} onReviewed={(key, section, updatedAt) => {
      if (!documentPlanId) return;
      edits.acceptReviewed(documentPlanId, key, section, updatedAt);
    }}
    completionKey={completionKey} allWritten={allWritten}
    grouped={grouped} numbering={numbering} isSample={isSample} coachHref={coachHref}
    notice={contextNotice} editStates={edits.states} onSave={saveEdit} onDraft={edits.stage}
    restoreKeys={edits.restoreKeys} onRestore={edits.restore} onRetrySave={edits.retry} onDiscardDraft={edits.discard}
    exporting={exporting} locked={locked} accessPending={!isSample && access === null}
    accessError={accessError} onRetryAccess={() => void retryAccess()}
    deckStatus={isSample ? "" : deck.message} deckLabel={isSample ? "PPT 샘플 내려받기" : deck.label}
    error={deckError || deck.error} onDownload={async (format, view) => {
      const file = sampleFile(format);
      if (file) {
        // 예시 파일도 앱 안에서는 새 창 대신 공유 창으로 — 새 창으로 열면 앱 안에 PDF만 뜨고 돌아갈 길이 없다
        try {
          const saved = await saveUrl(file, `${title}.${format}`);
          if (saved === "unsupported") { setDeckError(SAVE_UNSUPPORTED_MESSAGE); return false; }
          return saved !== "cancelled";
        } catch (error) { setDeckError(userErrorMessage(error, "파일을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")); return false; }
      }
      if (edits.hasPending()) { setDeckError("고친 내용을 먼저 저장한 뒤 파일을 받아 주세요."); return false; }
      setDeckError(null);
      if (locked) { goPay(); return false; }
      if (format === "pptx") { void handleDeck(); return false; }
      return handleExport(format, view);
    }} canDownload={(format, view) => !!sampleFile(format) || (view === "summary" ? !!summary && exporting === null && !isSample && !edits.pending && format !== "pptx" : !busy && (format !== "pptx" || (!deck.busy && deck.canRequest)))} />;
}
