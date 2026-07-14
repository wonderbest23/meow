"use client";

import { BarChart3, Check, ExternalLink, FileText, Globe2, Presentation, Sparkles } from "lucide-react";
import { type PointerEvent, useRef } from "react";

const researchSources = [
  {
    topic: "직업 적합성",
    sample: "172편 · 836개 효과크기",
    citation: "Kristof-Brown 외, 2005",
    href: "https://doi.org/10.1111/j.1744-6570.2005.00672.x",
  },
  {
    topic: "창업 자기효능감",
    sample: "5개 대학 · 265명",
    citation: "Zhao 외, 2005",
    href: "https://pubmed.ncbi.nlm.nih.gov/16316279/",
  },
  {
    topic: "구체적인 실행 계획",
    sample: "94개 실험 · 8,461명",
    citation: "Gollwitzer & Sheeran, 2006",
    href: "https://doi.org/10.1016/S0065-2601(06)38002-1",
  },
];

export function HomeHeroScene() {
  const stageRef = useRef<HTMLDivElement>(null);

  const moveReport = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || !stageRef.current) return;
    const bounds = stageRef.current.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    stageRef.current.style.setProperty("--report-rotate-x", `${(-y * 8).toFixed(2)}deg`);
    stageRef.current.style.setProperty("--report-rotate-y", `${(x * 10).toFixed(2)}deg`);
    stageRef.current.style.setProperty("--report-rotate-z", `${(x * 1.8).toFixed(2)}deg`);
    stageRef.current.style.setProperty("--report-shift-x", `${(x * 18).toFixed(2)}px`);
    stageRef.current.style.setProperty("--report-shift-y", `${(y * 14).toFixed(2)}px`);
  };

  const resetReport = () => {
    if (!stageRef.current) return;
    stageRef.current.style.setProperty("--report-rotate-x", "0deg");
    stageRef.current.style.setProperty("--report-rotate-y", "0deg");
    stageRef.current.style.setProperty("--report-rotate-z", "0deg");
    stageRef.current.style.setProperty("--report-shift-x", "0px");
    stageRef.current.style.setProperty("--report-shift-y", "0px");
  };

  return (
    <div className="home-hero-scene evidence-hero-scene">
      <div
        className="hero-report-stage"
        ref={stageRef}
        onPointerMove={moveReport}
        onPointerLeave={resetReport}
        aria-label="최종 결과물 화면 예시"
      >
        <i className="hero-report-axis axis-one" aria-hidden="true" />
        <i className="hero-report-axis axis-two" aria-hidden="true" />

        <div className="hero-report-tilt">
          <article className="hero-report-card">
            <header>
              <div><i /><i /><i /></div>
              <span><Sparkles /> 맞춤 사업 실행 보고서</span>
              <em><i /> 준비됨</em>
            </header>
            <div className="hero-report-workspace">
              <aside>
                <strong>최종 결과</strong>
                <span className="active"><FileText /> 사업 요약</span>
                <span><BarChart3 /> 시장 확인</span>
                <span><Presentation /> 사업소개서</span>
                <span><Globe2 /> 판매 페이지</span>
              </aside>
              <section>
                <div className="hero-report-kicker"><span>추천 1순위</span><em>적합도 86%</em></div>
                <h2>생활권 반려동물<br />긴급 돌봄 연결</h2>
                <p>고객 문제와 가격을 먼저 확인하고 한 생활권에서 작게 시작하는 실행안입니다.</p>
                <div className="hero-report-metrics">
                  <span><small>첫 검증</small><strong>14일</strong></span>
                  <span><small>확인 고객</small><strong>10명</strong></span>
                  <span><small>예상 손익분기</small><strong>32만원</strong></span>
                </div>
                <div className="hero-report-progress" aria-hidden="true"><i /><i /><i /><i /><i /></div>
                <div className="hero-report-checks">
                  <span><Check /> 사업 방향 확인</span>
                  <span><Check /> 실행 문서 완성</span>
                  <span><Check /> 첫 고객 일정</span>
                </div>
              </section>
            </div>
            <footer><span>PDF</span><span>WORD</span><span>PPTX</span><strong>전체 화면 미리보기</strong></footer>
            <i className="hero-report-scan" aria-hidden="true" />
          </article>
        </div>

        <div className="hero-floating-file hero-file-plan"><FileText /><span><strong>사업계획서</strong><small>PDF · 24쪽</small></span><Check /></div>
        <div className="hero-floating-file hero-file-market"><BarChart3 /><span><strong>시장·고객 진단</strong><small>WORD</small></span><Check /></div>
        <div className="hero-floating-file hero-file-deck"><Presentation /><span><strong>사업소개서</strong><small>PPTX</small></span><Check /></div>
        <div className="hero-floating-file hero-file-web"><Globe2 /><span><strong>판매 페이지</strong><small>WEB</small></span><Check /></div>
      </div>
    </div>
  );
}

export function HomeResearchEvidence() {
  return (
    <section className="home-research-evidence" aria-labelledby="home-research-title">
      <div className="home-research-inner">
        <header>
          <span>리포트 설계 근거</span>
          <h2 id="home-research-title">추천과 실행 순서를<br />연구 근거로 설계했습니다</h2>
          <p>아래 숫자는 서비스 성공률이 아니라 참고한 연구의 표본과 분석 단위입니다.</p>
        </header>
        <div className="home-research-list">
          {researchSources.map((source, index) => (
            <a href={source.href} key={source.topic} target="_blank" rel="noreferrer">
              <em>{String(index + 1).padStart(2, "0")}</em>
              <span><small>{source.topic}</small><strong>{source.sample}</strong><i>{source.citation}</i></span>
              <ExternalLink />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
