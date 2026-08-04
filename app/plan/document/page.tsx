"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileDown, FileText, Presentation, LayoutGrid } from "lucide-react";
import { hydrateFromServer, assembleSections, activePlan, loadState, saveSection } from "../../../lib/plan-builder/plan-store";
import { chaptersForType, documentArrangement } from "../../../lib/plan-builder/blueprint";
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

  useEffect(() => {
    let alive = true;
    hydrateFromServer().then((s) => {
      if (!alive) return;
      setSections(assembleSections(s));
      const p = activePlan(s);
      if (p) {
        setTitle(p.title);
        setPlanType(p.planType);
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
          business: loadState().business,
          sections: exportSections,
        }),
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

  const busy = exporting !== null || !sections.length;

  return (
    <div className={`${wiz.page} ${styles.page}`}>
      <div className={wiz.frame}>
        <div className={styles.app}>
          {/* 좌측 목차 — 위저드와 동일한 어두운 내비 모듈을 그대로 쓴다 */}
          <nav className={wiz.nav} aria-label="문서 목차">
            <button className={wiz.navTop} onClick={() => router.push("/plan/overview")}>플랜 개요</button>
            {grouped.map(([chapterTitle, list]) => {
              const chapterNum = numbering.get(list[0]?.key ?? "")?.chapterNum;
              return (
                <div key={chapterTitle} className={`${wiz.chap} ${wiz.open}`}>
                  <button className={wiz.ch} onClick={() => list[0] && scrollToSection(list[0].key)}>
                    <span className={wiz.cname}>{chapterTitle}</span>
                    {chapterNum ? <span className={wiz.cnum}>{chapterNum}</span> : null}
                  </button>
                  <div className={wiz.secs}>
                    {list.map((s) => (
                      <button key={s.key} className={wiz.sec} onClick={() => scrollToSection(s.key)}>
                        <span className={wiz.secLabel}>
                          {numbering.has(s.key) ? <span className={wiz.secNo}>{numbering.get(s.key)!.num}</span> : null}
                          {s.sectionTitle}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>

          {/* 본문 */}
          <section className={styles.main}>
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
                <button className={styles.tool} disabled={busy} onClick={() => handleExport("docx")} title="Word로 내려받기">
                  <FileText size={14} /> {exporting === "docx" ? "내보내는 중…" : "Word"}
                </button>
                <button className={styles.tool} disabled={busy} onClick={handleDeck} title="발표자료(PPT) 만들기">
                  <Presentation size={14} /> {exporting === "pptx" ? "만드는 중…" : "PPT"}
                </button>
                <button className={`${styles.tool} ${styles.toolPrimary}`} disabled={busy} onClick={() => handleExport("pdf")} title="PDF로 내려받기">
                  <FileDown size={14} /> {exporting === "pdf" ? "내보내는 중…" : "PDF"}
                </button>
              </div>
              {deckError ? <p className={styles.deckError}>{deckError}</p> : null}
            </header>

            <div className={styles.canvas}>
              {!ready ? null : sections.length === 0 ? (
                <div className={styles.empty}>
                  <p className={styles.emptyTitle}>아직 생성된 내용이 없어요</p>
                  <p className={styles.emptyDesc}>개요에서 섹션을 열고 질문에 답하면 이곳에 문서가 쌓입니다.</p>
                  <Link href="/plan/overview" className={styles.emptyBtn}>개요로 가기</Link>
                </div>
              ) : (
                <article className={styles.paper}>
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
