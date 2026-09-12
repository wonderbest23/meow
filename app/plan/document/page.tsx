"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DocumentWorkspace from "./DocumentWorkspace";
import { hydrateFromServer, assembleSections, activePlan, loadState, isSamplePlan, setActivePlan } from "../../../lib/plan-builder/plan-store";
import { chaptersForType, documentArrangement } from "../../../lib/plan-builder/blueprint";
import { htmlToMarkdown } from "../../../lib/plan-builder/html-to-markdown";
import { coachDocumentSnapshot, completedDocumentKey } from "../../../lib/plan-builder/coach-document";
import { documentContext } from "../../../lib/plan-builder/document-context";
import { useDeckExport } from "./use-deck-export";
import { useDocumentEdits } from "./use-document-edits";

/** 화면의 장별 읽기와 관계없이 전체 문서를 같은 배치로 내보낸다. */
export default function PlanDocumentPage() {
  const router = useRouter();
  const [sections, setSections] = useState<ReturnType<typeof assembleSections>>([]);
  const [title, setTitle] = useState("사업계획서");
  const [planType, setPlanType] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "docx" | "pptx" | null>(null);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isSample, setIsSample] = useState(false);
  /** 이 문서의 결제 상태 — null이면 확인 중. 잠겨 있으면 버튼에 미리 보여준다 */
  const [access, setAccess] = useState<{ paid: boolean; price: number } | null>(null);
  const [accessError, setAccessError] = useState(false);
  const [documentPlanId, setDocumentPlanId] = useState<string | null>(null);
  const [coachHref, setCoachHref] = useState<string | null>(null);
  const [contextNotice, setContextNotice] = useState("");
  const [completionKey, setCompletionKey] = useState<string | null>(null);
  const deck = useDeckExport(documentPlanId, !isSample && !!access?.paid, title);
  const edits = useDocumentEdits((key, section) => {
    setSections(current => current.map(item => item.key === key ? { ...item, markdown: section.markdown, html: section.html } : item));
    void deck.refresh();
  });

  useEffect(() => {
    let alive = true;
    hydrateFromServer().then((s) => {
      if (!alive) return;
      const requested = new URLSearchParams(window.location.search).get("planId");
      if (requested) {
        if (!s.plans.some(p => p.id === requested)) { router.replace("/plan"); return; }
        s = { ...s, activePlanId: requested }; setActivePlan(requested);
      }
      setSections(assembleSections(s));
      const p = activePlan(s);
      if (p) {
        const recovered = isSamplePlan(p.id) ? {} : edits.initialize(p);
        setSections(assembleSections(s).map(section => recovered[section.key] ? { ...section, html: recovered[section.key], markdown: htmlToMarkdown(recovered[section.key]) } : section));
        if (!requested) router.replace(`/plan/document?planId=${encodeURIComponent(p.id)}`);
        setCompletionKey(isSamplePlan(p.id) ? null : completedDocumentKey(p));
        const snapshot = coachDocumentSnapshot(p);
        if (snapshot) {
          setCoachHref(`/plan/chat?planId=${encodeURIComponent(p.id)}`);
          setContextNotice(snapshot.stale.length ? "대화에서 수정한 내용이 있습니다. 최신 내용을 반영한 뒤 파일을 받아주세요." : snapshot.manualReview.length ? "직접 수정한 항목은 유지했습니다. 최근 사업 정보와 함께 확인해주세요." : "");
        }
        setDocumentPlanId(p.id);
        setTitle(p.title);
        setPlanType(p.planType);
        setIsSample(isSamplePlan(p.id));
        if (!isSamplePlan(p.id)) {
          fetch(`/api/plan/access?planType=${encodeURIComponent(p.planType)}&planId=${encodeURIComponent(p.id)}`)
            .then((r) => { if (!r.ok) throw new Error("access unavailable"); return r.json(); })
            .then((d) => { if (alive) setAccess({ paid: !!d.paid, price: Number(d.price) || 149000 }); })
            .catch(() => { if (alive) setAccessError(true); });
        }
      }
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [router]);

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

  async function handleExport(format: "pdf" | "docx") {
    if (!sections.length) return;
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
          planType,
          planId: context.plan.id,
          business: context.business,
          sections: exportSections,
        }),
      });
      if (res.status === 402) {
        alert("PDF·Word 내려받기는 결제 후 이용할 수 있습니다. 결제 화면으로 이동합니다.");
        goPay();
        return;
      }
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
      setAccess({ paid: !!data.paid, price: Number(data.price) || 149000 });
    } catch { setAccessError(true); }
  }

  return <DocumentWorkspace title={title} planId={documentPlanId} planType={planType} ready={ready}
    completionKey={completionKey}
    grouped={grouped} numbering={numbering} isSample={isSample} coachHref={coachHref}
    notice={contextNotice} editStates={edits.states} onSave={saveEdit} onDraft={edits.stage}
    restoreKeys={edits.restoreKeys} onRestore={edits.restore} onRetrySave={edits.retry} onDiscardDraft={edits.discard}
    exporting={exporting} locked={locked} accessPending={!isSample && access === null}
    accessError={accessError} onRetryAccess={() => void retryAccess()}
    deckStatus={isSample ? "" : deck.message} deckLabel={isSample ? "PPT 샘플 내려받기" : deck.label}
    error={deckError || deck.error} onDownload={(format) => {
      const file = sampleFile(format);
      if (file) { window.open(file, "_blank", "noopener"); return; }
      if (edits.hasPending()) { setDeckError("수정 내용을 먼저 저장한 뒤 파일을 받아주세요."); return; }
      setDeckError(null);
      if (locked) { goPay(); return; }
      if (format === "pptx") void handleDeck(); else void handleExport(format);
    }} canDownload={(format) => !!sampleFile(format) || (!busy && (format !== "pptx" || (!deck.busy && deck.canRequest)))} />;
}
