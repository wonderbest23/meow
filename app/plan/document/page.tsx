"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileDown, FileText, Globe2, Presentation, LayoutGrid, Lock, Maximize2, X } from "lucide-react";
import { hydrateFromServer, assembleSections, activePlan, loadState, saveSection, isSamplePlan } from "../../../lib/plan-builder/plan-store";
import { chaptersForType, documentArrangement } from "../../../lib/plan-builder/blueprint";
import PlanLoading, { Spinner } from "../PlanLoading";
import { htmlToMarkdown } from "../../../lib/plan-builder/html-to-markdown";
import InlineDocEditor from "../InlineDocEditor";
import wiz from "../SectionWizard.module.css";
import styles from "./PlanDocument.module.css";

/**
 * /plan/document — 생성된 섹션을 하나의 문서로 조립해 보여주고 내보낸다.
 * 레퍼런스 문서 화면의 골격을 따른다: 좌측 어두운 목차(위저드와 동일 모듈) +
 * 큰 제목/세그먼트 헤더 + 번호 붙은 섹션 헤딩(1.1식)이 흐르는 문서 캔버스.
 */
export default function PlanDocumentPage() {
  const router = useRouter();
  const [sections, setSections] = useState<ReturnType<typeof assembleSections>>([]);
  const [title, setTitle] = useState("사업계획서");
  const [planType, setPlanType] = useState("");
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "docx" | "pptx" | null>(null);
  const [deckError, setDeckError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isSample, setIsSample] = useState(false);
  /** 이 문서의 결제 상태 — null이면 확인 중. 잠겨 있으면 버튼에 미리 보여준다 */
  const [access, setAccess] = useState<{ paid: boolean; price: number } | null>(null);
  /*
   * 전체 모드 — 앱 껍데기를 걷어내고 문서만 이어서 읽는다(PDF 미리보기처럼).
   * 편집기 없이 렌더된 HTML만 흘리므로 스크롤이 가볍고, 모바일에서 특히 유용하다.
   */
  const [reader, setReader] = useState(false);

  useEffect(() => {
    let alive = true;
    hydrateFromServer().then((s) => {
      if (!alive) return;
      setSections(assembleSections(s));
      const p = activePlan(s);
      if (p) {
        setTitle(p.title);
        setPlanType(p.planType);
        setIsSample(isSamplePlan(p.id));
        if (!isSamplePlan(p.id)) {
          fetch(`/api/plan/access?planType=${encodeURIComponent(p.planType)}&planId=${encodeURIComponent(p.id)}`)
            .then((r) => r.json())
            .then((d) => { if (alive) setAccess({ paid: !!d.paid, price: Number(d.price) || 149000 }); })
            .catch(() => {});
        }
      }
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

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

  // 전체 모드에서 배경 스크롤 잠금 + Esc로 닫기
  useEffect(() => {
    if (!reader) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReader(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [reader]);

  function scrollToSection(key: string) {
    document.getElementById(`sec-${key.replace("/", "-")}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /** 문서에서 고친 내용을 저장한다. 원본은 마크다운이므로 되돌려 담는다. */
  function saveEdit(key: string, nextHtml: string) {
    const md = htmlToMarkdown(nextHtml);
    if (!md.trim()) return;
    if (!saveSection(key, md, nextHtml)) {
      setFailedKey(key);
      return;
    }
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, markdown: md, html: nextHtml } : s)));
    setSavedKey(key);
  }

  /** 완성한 계획서로 발표용 PPT를 만든다(결제 확인은 서버가 한다). */
  async function handleDeck() {
    if (!sections.length) return;
    setExporting("pptx");
    setDeckError(null);
    try {
      const state = loadState();
      const plan = activePlan(state);
      const res = await fetch("/api/plan/deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: state.business.name || title,
          businessDescription: state.business.description,
          planType,
          planId: plan?.id,
          sections: exportSections,
          allAnswers: plan?.answers ?? {},
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setDeckError(data.message ?? "발표자료를 만들지 못했습니다.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title} 사업 제안서.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setDeckError("발표자료를 만들지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setExporting(null);
    }
  }

  async function handleExport(format: "pdf" | "docx") {
    if (!sections.length) return;
    setExporting(format);
    try {
      const res = await fetch("/api/plan/document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          format,
          planType,
          planId: activePlan(loadState())?.id,
          business: loadState().business,
          sections: exportSections,
        }),
      });
      if (res.status === 402) {
        const p = activePlan(loadState());
        const q = p ? `?planId=${encodeURIComponent(p.id)}&planType=${encodeURIComponent(p.planType)}` : "";
        alert("PDF·Word 내려받기는 결제 후 이용할 수 있습니다. 결제 화면으로 이동합니다.");
        router.push(`/plan/pay${q}`);
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
  const busy = exporting !== null || !sections.length || isSample;

  /** 결제 전이면 서버 왕복 없이 바로 결제 화면으로 */
  function goPay() {
    const p = activePlan(loadState());
    const q = p ? `?planId=${encodeURIComponent(p.id)}&planType=${encodeURIComponent(p.planType)}` : "";
    router.push(`/plan/pay${q}`);
  }

  return (
    <div className={`${wiz.page} ${styles.page}`}>
      {reader && (
        <div className={styles.reader} role="dialog" aria-label="문서 전체 화면">
          <div className={styles.readerBar}>
            <span className={styles.readerTitle}>{title}</span>
            <button type="button" className={styles.readerClose} onClick={() => setReader(false)} aria-label="전체 화면 닫기">
              <X size={16} /> 닫기
            </button>
          </div>
          <div className={styles.readerScroll}>
            <article className={`${styles.readerPaper} ${isSample ? styles.paperSample : ""}`}>
              {isSample && <span className={styles.paperMark} aria-hidden="true">SAMPLE</span>}
              <header className={styles.docHeader}>
                <h2 className={styles.docTitle}>{title}</h2>
                <div className={styles.docSub}>{planType}{planType && " · "}{sections.length}개 섹션</div>
              </header>
              {grouped.map(([chapterTitle, list], ci) => (
                <div key={chapterTitle} className={styles.chapter}>
                  <div className={styles.chapterHead}>
                    <span className={styles.chapterNum}>{ci + 1}</span>
                    <h3 className={styles.chapterName}>{chapterTitle}</h3>
                  </div>
                  {list.map((sec) => (
                    <section key={sec.key} className={styles.section}>
                      <div className={styles.secHead}>
                        <i className={styles.secDash} aria-hidden="true" />
                        <h4 className={styles.secTitle}>{sec.sectionTitle}</h4>
                        {numbering.has(sec.key) ? <span className={styles.secNum}>{numbering.get(sec.key)!.num}</span> : null}
                      </div>
                      <div className={styles.readerBody} dangerouslySetInnerHTML={{ __html: sec.html }} />
                    </section>
                  ))}
                </div>
              ))}
            </article>
          </div>
        </div>
      )}
      <div className={wiz.frame}>
        <div className={styles.app}>
          {/* 본문 */}
          <section className={styles.main}>
            {/*
              모바일에서는 좌측 목차가 통째로 숨어 '플랜 개요'로 돌아갈 길이 없었다.
              좁은 화면 전용으로 개요 링크와 챕터 점프를 가로 스트립으로 둔다.
            */}
            {/* 뒤로가기는 셸 pill 하나로 통일 — 여기는 챕터 이동 칩만. 칩이 없으면 줄도 없다 */}
            {grouped.length > 0 && (
            <div className={styles.mobileNav}>
              {grouped.map(([chapterTitle, list]) => (
                <button key={chapterTitle} type="button" className={styles.mobileChap} onClick={() => list[0] && scrollToSection(list[0].key)}>
                  {chapterTitle}
                </button>
              ))}
            </div>
            )}
            <header className={styles.mhead}>
              <div className={styles.routeHeader}>
                <h1 className={styles.routeTitle}>
                  {title}
                  <span>사업계획서 문서</span>
                </h1>
              </div>
              <div className={styles.toolbar}>
                {/* 레퍼런스의 Structural/Document View 세그먼트 */}
                <div className={styles.seg} role="tablist" aria-label="보기 전환">
                  <button type="button" onClick={() => router.push("/plan/overview")}>
                    <LayoutGrid size={13} /> 구조 보기
                  </button>
                  <button type="button" className={styles.segOn}>
                    <FileText size={13} /> 문서 보기
                  </button>
                </div>
                <div className={styles.spring} />
                {isSample && <span className={styles.sampleNote}>샘플은 열람 전용 — 내려받기는 내 문서에서</span>}
                {locked && (
                  <span className={styles.sampleNote}>
                    <Lock size={11} strokeWidth={2.4} /> 내려받기는 결제 후 열립니다 · {access!.price.toLocaleString("ko-KR")}원
                  </span>
                )}
                <button className={styles.tool} disabled={busy} onClick={() => (locked ? goPay() : handleExport("docx"))} title={isSample ? "샘플은 내려받을 수 없습니다" : locked ? "결제 후 열립니다" : "Word로 내려받기"}>
                  {exporting === "docx" ? <Spinner /> : locked ? <Lock size={13} /> : <FileText size={14} />} {exporting === "docx" ? "내보내는 중…" : "Word"}
                </button>
                {/* 계획서를 다 쓰면 홈페이지에 실을 말도 이미 다 답해 둔 상태다 — 그대로 옮겨 만든다 */}
                <button className={styles.tool} disabled={busy} onClick={() => (isSample ? undefined : locked ? goPay() : router.push("/plan/homepage"))} title={isSample ? "샘플은 홈페이지를 만들 수 없습니다" : locked ? "결제 후 열립니다" : "계획서 내용으로 홈페이지 만들기"}>
                  {locked ? <Lock size={13} /> : <Globe2 size={14} />} 홈페이지
                </button>
                <button className={styles.tool} disabled={busy} onClick={() => (locked ? goPay() : handleDeck())} title={locked ? "결제 후 열립니다" : "발표자료(PPT) 만들기"}>
                  {exporting === "pptx" ? <Spinner /> : locked ? <Lock size={13} /> : <Presentation size={14} />} {exporting === "pptx" ? "만드는 중…" : "PPT"}
                </button>
                <button className={`${styles.tool} ${styles.toolPrimary}`} disabled={busy} onClick={() => (locked ? goPay() : handleExport("pdf"))} title={locked ? "결제 후 열립니다" : "PDF로 내려받기"}>
                  {exporting === "pdf" ? <Spinner /> : locked ? <Lock size={13} /> : <FileDown size={14} />} {exporting === "pdf" ? "내보내는 중…" : "PDF"}
                </button>
              </div>
              {deckError ? <p className={styles.deckError}>{deckError}</p> : null}
            </header>

            {/* 전체 화면은 툴바가 아니라 문서 위에 떠 있는다 — 헤더가 홀쭉해진다 */}
            {sections.length > 0 && (
              <button type="button" className={styles.fsFloat} onClick={() => setReader(true)} title="문서만 전체 화면으로 이어서 읽기">
                <Maximize2 size={14} /> 전체 화면
              </button>
            )}

            <div className={styles.canvas}>
              {!ready ? (
                /* 불러오는 동안 — 앱 전체가 공유하는 로딩 표현 */
                <div className={styles.paper}>
                  <PlanLoading variant="document" count={3} note="문서를 불러오는 중…" />
                </div>
              ) : sections.length === 0 ? (
                <div className={styles.empty}>
                  <p className={styles.emptyTitle}>아직 생성된 내용이 없어요</p>
                  <p className={styles.emptyDesc}>개요에서 섹션을 열고 질문에 답하면 이곳에 문서가 쌓입니다.</p>
                  <Link href="/plan/overview" className={styles.emptyBtn}>개요로 가기</Link>
                </div>
              ) : (
                <article className={`${styles.paper} ${isSample ? styles.paperSample : ""}`}>
                  {isSample && <span className={styles.paperMark} aria-hidden="true">SAMPLE</span>}
                  <header className={styles.docHeader}>
                    <h2 className={styles.docTitle}>{title}</h2>
                    <div className={styles.docSub}>
                      {planType}
                      {planType && " · "}
                      {new Date().toLocaleDateString("ko-KR")} 기준 · {sections.length}개 섹션
                    </div>
                  </header>

                  {grouped.map(([chapterTitle, list]) => {
                    const chapterNum = numbering.get(list[0]?.key ?? "")?.chapterNum;
                    return (
                      <div key={chapterTitle} className={styles.chapter}>
                        <div className={styles.chapterHead}>
                          {chapterNum ? <span className={styles.chapterNum}>{chapterNum}</span> : null}
                          <h3 className={styles.chapterName}>{chapterTitle}</h3>
                        </div>

                        {list.map((s) => (
                          <section key={s.key} id={`sec-${s.key.replace("/", "-")}`} className={styles.section}>
                            {/* 레퍼런스 헤딩 행: 강조 대시 + 제목 + 우측 번호 */}
                            <div className={styles.secHead}>
                              <i className={styles.secDash} aria-hidden="true" />
                              <h4 className={styles.secTitle}>{s.sectionTitle}</h4>
                              {numbering.has(s.key) ? <span className={styles.secNum}>{numbering.get(s.key)!.num}</span> : null}
                            </div>
                            <div className={styles.body}>
                              <InlineDocEditor
                                html={s.html}
                                readOnly={isSample}
                                status={failedKey === s.key ? "failed" : savedKey === s.key ? "saved" : "idle"}
                                onChange={(nextHtml) => saveEdit(s.key, nextHtml)}
                              />
                            </div>
                          </section>
                        ))}
                      </div>
                    );
                  })}
                </article>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
