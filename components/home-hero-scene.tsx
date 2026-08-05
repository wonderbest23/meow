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
              <span><Sparkles /> 사업계획서 플랜 빌더</span>
              <em><i /> 준비됨</em>
            </header>
            <div className="hero-report-workspace">
              <aside>
                <strong>플랜 개요</strong>
                <span className="active"><FileText /> 사업 개요</span>
                <span><BarChart3 /> 고객과 시장</span>
                <span><Presentation /> 사업 전략</span>
                <span><Globe2 /> 재무 계획</span>
              </aside>
              <section>
                <div className="hero-report-kicker"><span>창업 초기 · 사업계획서</span><em>진행률 100%</em></div>
                <h2>새벽커피<br />사업계획서</h2>
                <p>질문에 답한 사실만으로 인공지능이 섹션별 본문과 12개월 손익표를 완성했습니다.</p>
                <div className="hero-report-metrics">
                  <span><small>완료 섹션</small><strong>25개</strong></span>
                  <span><small>손익분기</small><strong>7개월차</strong></span>
                  <span><small>작성 시간</small><strong>52분</strong></span>
                </div>
                <div className="hero-report-sections" aria-hidden="true">
                  <div><em>1</em><span>사업 개요</span><b>완료 6/6</b></div>
                  <div><em>2</em><span>고객과 시장</span><b>완료 5/5</b></div>
                  <div><em>3</em><span>재무 계획</span><b>완료 4/4</b></div>
                </div>
                <div className="hero-report-checks">
                  <span><Check /> 전 섹션 생성 완료</span>
                  <span><Check /> 재무표 자동 계산</span>
                  <span><Check /> 발표자료 준비됨</span>
                </div>
              </section>
            </div>
            <footer><span>PDF</span><span>WORD</span><span>PPT</span><strong>문서 보기</strong></footer>
            <i className="hero-report-scan" aria-hidden="true" />
          </article>
        </div>

        <div className="hero-floating-file hero-file-plan"><FileText /><span><strong>사업계획서</strong><small>PDF · Word</small></span><Check /></div>
        <div className="hero-floating-file hero-file-market"><BarChart3 /><span><strong>재무 모델</strong><small>3년 추정</small></span><Check /></div>
        <div className="hero-floating-file hero-file-deck"><Presentation /><span><strong>발표자료</strong><small>PPT</small></span><Check /></div>
        <div className="hero-floating-file hero-file-web"><Globe2 /><span><strong>정부지원 PSST</strong><small>4부 구성</small></span><Check /></div>
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
