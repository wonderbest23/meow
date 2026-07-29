"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { startNewPlan } from "../../../lib/plan-builder/plan-store";
import styles from "./PlanStart.module.css";

const TONES: Record<number, { tint: string; acc: string }> = {
  1: { tint: "#eef1ff", acc: "#3358f4" },
  2: { tint: "#e7f5f0", acc: "#12a58a" },
  3: { tint: "#eaf3fb", acc: "#2f7bd6" },
  4: { tint: "#fbeaee", acc: "#de5f7d" },
  5: { tint: "#e8f2fd", acc: "#2f6fe0" },
  6: { tint: "#f0eefc", acc: "#6b5bdd" },
};

const doc = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h9l4 4v14H6z" /><path d="M15 3v4h4" /><path d="M9 12h7M9 16h5" /></svg>
);
const chart = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M4 19h16" /><rect x="6" y="11" width="3" height="6" /><rect x="11" y="7" width="3" height="10" /><rect x="16" y="4" width="3" height="13" /></svg>
);
const rocket = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2" /><path d="M9 15l-3-3c1-5 5-9 11-9 0 6-4 10-9 11l-3-3z" /><circle cx="14.5" cy="9.5" r="1.6" /></svg>
);

interface PlanType {
  id: string;
  cat: string;
  type: string;
  category: "bp" | "forecast";
  pop: boolean;
  tone: number;
  icon: React.ReactElement;
  desc: string;
}

const PLAN_TYPES: PlanType[] = [
  { id: "startup-bp", cat: "창업 초기", type: "사업계획서", category: "bp", pop: true, tone: 1, icon: rocket, desc: "아이디어를 검증하고 시장 진입 전략을 세우는 창업자 필수 로드맵." },
  { id: "growth-bp", cat: "성장·확장", type: "사업계획서", category: "bp", pop: true, tone: 2, icon: chart, desc: "운영 중인 사업의 확장·신시장 진입·자금 확보를 위한 종합 계획." },
  { id: "detailed-fm", cat: "정밀", type: "재무 모델", category: "forecast", pop: true, tone: 3, icon: chart, desc: "다년 재무 예측으로 투자·M&A까지 대비하는 심화 분석." },
  { id: "simple-bp", cat: "간단", type: "사업계획서", category: "bp", pop: false, tone: 4, icon: doc, desc: "가치 제안과 핵심 목표를 빠르게 정리하는 요약형." },
  { id: "startup-ff", cat: "창업 초기", type: "재무 예측", category: "forecast", pop: false, tone: 5, icon: chart, desc: "1~5년 예측으로 아이디어를 검증하고 초기 자금을 확보." },
  { id: "internal-bp", cat: "내부용", type: "사업계획서", category: "bp", pop: false, tone: 6, icon: doc, desc: "팀 정렬과 실행 추적을 위한 내부 전략 문서." },
];

export default function PlanStartPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<"bp" | "forecast">("bp");

  function pick(pt: PlanType) {
    const planTitle = title.trim() || "새 플랜";
    startNewPlan(planTitle, `${pt.cat} · ${pt.type}`);
    router.push("/plan");
  }

  const visible = PLAN_TYPES.filter((p) => p.category === category);

  return (
    <div className={styles.page}>
      <div className={styles.frame}>
        <div className={styles.app}>
          <nav className={styles.rail} aria-label="주요 메뉴">
            <div className={styles.railLogo}>오</div>
            <button className={`${styles.railBtn} ${styles.on}`} title="플랜"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M9.5 13h6M9.5 16.5h6" /></svg></button>
            <button className={styles.railBtn} title="도움말"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-8 8H4l1.5-4A8 8 0 1 1 21 12Z" /></svg></button>
            <div className={styles.railSpring} />
            <button className={`${styles.railBtn} ${styles.railLock}`} title="업그레이드"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg></button>
          </nav>

          <div className={styles.main}>
            <h1 className={styles.h1}>새 플랜 만들기</h1>
            <p className={styles.lead}><b>어떤 걸 만들까요?</b> 창업 단계와 목적에 맞는 플랜을 고르면, 그에 맞는 질문만 안내해 드려요.</p>

            <div className={styles.titleField}>
              <label className={styles.titleLabel} htmlFor="planTitle">사업/플랜 이름</label>
              <input id="planTitle" className={styles.titleInput} placeholder="예: 새벽커피" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>

            <div className={styles.cats}>
              <button className={category === "bp" ? styles.catOn : ""} onClick={() => setCategory("bp")}>사업계획서</button>
              <button className={category === "forecast" ? styles.catOn : ""} onClick={() => setCategory("forecast")}>재무 예측</button>
            </div>

            <div className={styles.grid}>
              {visible.map((pt) => {
                const tone = TONES[pt.tone] ?? TONES[1];
                return (
                  <button
                    key={pt.id}
                    className={styles.card}
                    style={{ ["--acc" as string]: tone.acc, ["--tint" as string]: tone.tint }}
                    onClick={() => pick(pt)}
                  >
                    <div className={styles.cardTop}>
                      {pt.pop && <span className={styles.badge}>인기</span>}
                      {pt.icon}
                    </div>
                    <div className={styles.cat}>{pt.cat}</div>
                    <h3 className={styles.cardTitle}>{pt.type}</h3>
                    <p className={styles.desc}>{pt.desc}</p>
                    <div className={styles.go}>이 유형으로 시작 →</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
