"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Lock } from "lucide-react";
import { SAMPLE_BUSINESS, SAMPLE_CHAPTERS } from "../../../lib/plan-builder/sample-plan";
import { calculateFinancials, financialsToMarkdown } from "../../../lib/plan-builder/financials";
import { renderPlanMarkdown } from "../../../lib/plan-builder/markdown";
import wiz from "../SectionWizard.module.css";
import doc from "../document/PlanDocument.module.css";
import styles from "./PlanSample.module.css";

/*
 * /plan/sample — 로그인 전에 완성본을 그대로 보여준다.
 *
 * 설명하는 화면보다 다 만들어진 문서 한 부를 보여주는 편이 빠르다.
 * 실제 문서 화면(/plan/document)과 같은 골격을 쓰되 편집·내보내기는 빼고,
 * 재무 블록은 화면을 열 때 실제 계산기로 계산해 넣는다.
 */

/** 샘플 사업의 재무 입력 — 본문에 적힌 숫자와 같은 값이다 */
const SAMPLE_FINANCIALS = {
  unitPrice: 4900,
  unitVariableCost: 1800,
  monthlyFixedCost: 4_000_000,
  startingVolume: 1400,
  monthlyGrowthPct: 5,
  initialInvestment: 26_000_000,
};

export default function PlanSamplePage() {
  const [htmlByKey, setHtmlByKey] = useState<Record<string, string>>({});

  // 재무 블록은 적어두지 않고 계산해 넣는다 — 산식이 바뀌면 샘플도 같이 바뀌어야 한다
  const chapters = useMemo(() => {
    const fin = calculateFinancials(SAMPLE_FINANCIALS);
    const finMd = financialsToMarkdown(fin, { growthLabel: "천천히 안정 성장", growthPct: 5, staffIncluded: true });
    return SAMPLE_CHAPTERS.map((c) => ({
      ...c,
      sections: c.sections.map((s) => ({ ...s, markdown: s.markdown.replace("<!--FINANCIALS-->", finMd) })),
    }));
  }, []);

  useEffect(() => {
    let alive = true;
    const all = chapters.flatMap((c) => c.sections);
    Promise.all(all.map((s) => renderPlanMarkdown(s.markdown).then((html) => [s.key, html] as const))).then((pairs) => {
      if (alive) setHtmlByKey(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [chapters]);

  const total = chapters.reduce((sum, c) => sum + c.sections.length, 0);

  function scrollToSection(key: string) {
    document.getElementById(`sec-${key.replace("/", "-")}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className={`${wiz.page} ${doc.page}`}>
      <div className={wiz.frame}>
        <div className={doc.app}>
          <nav className={wiz.nav} aria-label="샘플 목차">
            <div className={styles.navTag}>샘플 문서</div>
            {chapters.map((chapter, ci) => (
              <div key={chapter.title} className={`${wiz.chap} ${wiz.open}`}>
                <button className={wiz.ch} onClick={() => scrollToSection(chapter.sections[0].key)}>
                  <span className={wiz.cname}>{chapter.title}</span>
                  <span className={wiz.cnum}>{ci + 1}</span>
                </button>
                <div className={wiz.secs}>
                  {chapter.sections.map((section, si) => (
                    <button key={section.key} className={wiz.sec} onClick={() => scrollToSection(section.key)}>
                      <span className={wiz.secLabel}>
                        <span className={wiz.secNo}>{ci + 1}.{si + 1}</span>
                        {section.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <section className={doc.main}>
            <header className={doc.mhead}>
              <div className={doc.routeHeader}>
                <h1 className={doc.routeTitle}>
                  {SAMPLE_BUSINESS.name}
                  <span>완성본 샘플 · 가상 사업 사례</span>
                </h1>
              </div>
              <div className={doc.toolbar}>
                <div className={doc.seg}>
                  <button type="button" className={doc.segOn}>
                    <FileText size={13} /> 문서 보기
                  </button>
                </div>
                <div className={doc.spring} />
                <Link href="/plan/start" className={styles.cta}>
                  내 사업으로 만들기
                </Link>
              </div>
            </header>

            <div className={doc.canvas}>
              <div className={styles.banner}>
                <Lock size={15} strokeWidth={2} />
                <p>
                  가상 사업체 <b>새벽커피</b>로 {chapters.length}개 챕터 {total}개 섹션을 끝까지 채운 문서입니다.
                  재무 표와 그래프는 본문에 적힌 숫자를 실제 계산기로 돌린 결과입니다.
                </p>
              </div>

              <article className={doc.paper}>
                <header className={doc.docHeader}>
                  <h2 className={doc.docTitle}>{SAMPLE_BUSINESS.name} 사업계획서</h2>
                  <div className={doc.docSub}>
                    {SAMPLE_BUSINESS.planType} · {SAMPLE_BUSINESS.industry} · {SAMPLE_BUSINESS.region} · {total}개 섹션
                  </div>
                </header>

                {chapters.map((chapter, ci) => (
                  <div key={chapter.title} className={doc.chapter}>
                    <div className={doc.chapterHead}>
                      <span className={doc.chapterNum}>{ci + 1}</span>
                      <h3 className={doc.chapterName}>{chapter.title}</h3>
                    </div>

                    {chapter.sections.map((section, si) => (
                      <section key={section.key} id={`sec-${section.key.replace("/", "-")}`} className={doc.section}>
                        <div className={doc.secHead}>
                          <i className={doc.secDash} aria-hidden="true" />
                          <h4 className={doc.secTitle}>{section.title}</h4>
                          <span className={doc.secNum}>{ci + 1}.{si + 1}</span>
                        </div>
                        <div
                          className={`${doc.body} ${styles.body}`}
                          dangerouslySetInnerHTML={{ __html: htmlByKey[section.key] ?? "" }}
                        />
                      </section>
                    ))}
                  </div>
                ))}
              </article>

              <div className={styles.footer}>
                <h2>내 사업으로 이런 문서를 만들어 보세요</h2>
                <p>질문에 답하면 위와 같은 형태로 채워집니다. 앞 두 섹션은 결제 없이 써보실 수 있습니다.</p>
                <Link href="/plan/start" className={styles.footerBtn}>시작하기</Link>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
