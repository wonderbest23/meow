"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { hydrateFromServer, assembleSections, activePlan, loadState, saveSection } from "../../../lib/plan-builder/plan-store";
import { htmlToMarkdown } from "../../../lib/plan-builder/html-to-markdown";
import InlineDocEditor from "../InlineDocEditor";
import styles from "./PlanDocument.module.css";

/** /plan/document — 생성된 섹션을 하나의 문서로 조립해 보여주고 내보낸다. */
export default function PlanDocumentPage() {
  const router = useRouter();
  const [sections, setSections] = useState<ReturnType<typeof assembleSections>>([]);
  const [title, setTitle] = useState("사업계획서");
  const [planType, setPlanType] = useState("");
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

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

  // 목차용: 챕터별 그룹
  const grouped = useMemo(() => {
    const map = new Map<string, typeof sections>();
    for (const s of sections) {
      const list = map.get(s.chapterTitle) ?? [];
      list.push(s);
      map.set(s.chapterTitle, list);
    }
    return [...map.entries()];
  }, [sections]);

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
          sections: sections.map((a) => ({ chapterTitle: a.chapterTitle, sectionTitle: a.sectionTitle, markdown: a.markdown })),
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
          sections: sections.map((a) => ({ chapterTitle: a.chapterTitle, sectionTitle: a.sectionTitle, markdown: a.markdown })),
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

  return (
    <div className={styles.page}>
      <div className={styles.frame}>
        <div className={styles.bar}>
          <button className={styles.back} onClick={() => router.push("/plan/overview")} aria-label="개요로">←</button>
          <h1 className={styles.title}>
            문서 보기 <span>· {title}</span>
          </h1>
          <div className={styles.spring} />
          <button className={`${styles.exportBtn} ${styles.ghost}`} disabled={!sections.length || exporting !== null} onClick={() => handleExport("docx")}>
            {exporting === "docx" ? "내보내는 중…" : "Word 내보내기"}
          </button>
          <button className={`${styles.exportBtn} ${styles.ghost}`} disabled={!sections.length || exporting !== null} onClick={handleDeck}>
            {exporting === "pptx" ? "만드는 중…" : "발표자료(PPT)"}
          </button>
          <button className={styles.exportBtn} disabled={!sections.length || exporting !== null} onClick={() => handleExport("pdf")}>
            {exporting === "pdf" ? "내보내는 중…" : "PDF 내보내기"}
          </button>
        </div>
        {deckError ? <p className={styles.deckError}>{deckError}</p> : null}

        {!ready ? null : sections.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>아직 생성된 내용이 없어요</p>
            <p className={styles.emptyDesc}>개요에서 섹션을 열고 질문에 답하면 이곳에 문서가 쌓입니다.</p>
            <Link href="/plan/overview" className={styles.emptyBtn}>개요로 가기</Link>
          </div>
        ) : (
          <div className={styles.layout}>
            {/* 목차 */}
            <aside className={styles.toc}>
              <div className={styles.tocHead}>목차 · {sections.length}개 섹션</div>
              {grouped.map(([chapter, list]) => (
                <div key={chapter}>
                  <div className={styles.tocChapter}>{chapter}</div>
                  {list.map((s) => (
                    <button
                      key={s.key}
                      className={styles.tocItem}
                      onClick={() => document.getElementById(`sec-${s.key.replace("/", "-")}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    >
                      {s.sectionTitle}
                    </button>
                  ))}
                </div>
              ))}
            </aside>

            {/* 문서 */}
            <article className={styles.doc}>
              <header className={styles.docHeader}>
                <h2 className={styles.docTitle}>{title}</h2>
                <div className={styles.docSub}>
                  {planType}
                  {planType && " · "}
                  {new Date().toLocaleDateString("ko-KR")} 기준 · {sections.length}개 섹션
                </div>
              </header>

              {sections.map((s) => (
                <section key={s.key} id={`sec-${s.key.replace("/", "-")}`} className={styles.section}>
                  <div className={styles.secCrumb}>{s.chapterTitle}</div>
                  <h3 className={styles.secTitle}>{s.sectionTitle}</h3>
                  {/* 문서 화면에서도 바로 고칠 수 있다 — 위저드로 되돌아갈 필요가 없다 */}
                  <div className={styles.body}>
                    <InlineDocEditor
                      html={s.html}
                      status={failedKey === s.key ? "failed" : savedKey === s.key ? "saved" : "idle"}
                      onChange={(nextHtml) => saveEdit(s.key, nextHtml)}
                    />
                  </div>
                </section>
              ))}
            </article>
          </div>
        )}
      </div>
    </div>
  );
}
