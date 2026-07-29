"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveBusiness, createPlan, loadState, EMPTY_BUSINESS, type BusinessProfile } from "../../../lib/plan-builder/plan-store";
import styles from "./PlanStart.module.css";

/** 드롭다운 선택 — 레퍼런스 스타일 */
function Select({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: string[];
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // 아래 공간이 부족하면 위로 펼친다 — 창 밖으로 나가 선택하지 못하는 일이 없게
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function toggle() {
    setOpen((wasOpen) => {
      if (!wasOpen && ref.current) {
        const r = ref.current.getBoundingClientRect();
        const below = window.innerHeight - r.bottom;
        setDropUp(below < 280 && r.top > below);
      }
      return !wasOpen;
    });
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.select} ref={ref}>
      <button
        type="button"
        className={`${styles.selectBtn} ${open ? styles.open : ""} ${value ? "" : styles.placeholder}`}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {value || placeholder}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className={`${styles.menu} ${dropUp ? styles.menuUp : ""}`} role="listbox">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={value === opt}
              className={`${styles.option} ${value === opt ? styles.optionOn : ""}`}
              onClick={() => {
                onChange(value === opt ? "" : opt);
                setOpen(false);
              }}
            >
              {opt}
              {value === opt && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17l9-11" /></svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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

const ROLES = ["예비창업자", "사업자(운영 중)", "공동창업팀", "부업·사이드", "컨설턴트", "기타"];
const INDUSTRIES = ["카페·음식점", "온라인 쇼핑몰", "오프라인 매장", "교육·강의", "서비스·용역", "제조·생산", "IT·앱·웹", "콘텐츠·크리에이터", "기타"];
const STAGES = ["아이디어 단계", "준비 중(개업 전)", "개업 직후", "운영 중"];

export default function PlanStartPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [biz, setBiz] = useState<BusinessProfile>({ ...EMPTY_BUSINESS });
  const [category, setCategory] = useState<"bp" | "forecast">("bp");
  const [improving, setImproving] = useState(false);
  const [hasExisting, setHasExisting] = useState(false);

  // 이미 등록한 사업이 있으면 불러와서 재입력을 줄인다(사업 1개 유지)
  useEffect(() => {
    const s = loadState();
    if (s.business.name) {
      setBiz(s.business);
      setHasExisting(true);
      if (s.plans.length > 0) setStep(2); // 사업+플랜이 이미 있으면 유형 선택부터
    }
  }, []);

  const set = <K extends keyof BusinessProfile>(k: K, v: BusinessProfile[K]) => setBiz((p) => ({ ...p, [k]: v }));

  // 1단계 완료 조건: 사업명 + 설명
  const step1Ok = biz.name.trim().length > 0 && biz.description.trim().length >= 5;

  async function improveDescription() {
    if (!biz.description.trim()) return;
    setImproving(true);
    try {
      const res = await fetch("/api/plan/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: "이 사업을 한두 문장으로 명확하게 설명한다면?",
          help: "고객이 이해하기 쉽게, 무엇을 누구에게 제공하는지 담아 구체적으로.",
          context: [
            biz.name && `사업명: ${biz.name}`,
            `현재 설명: ${biz.description}`,
            biz.industry && `업종: ${biz.industry}`,
            biz.region && `지역: ${biz.region}`,
          ].filter(Boolean).join("\n"),
          count: 3,
        }),
      });
      const data = (await res.json()) as { suggestions?: string[] };
      const best = data.suggestions?.[0];
      if (best && !best.startsWith("(예시)")) set("description", best);
    } catch {
      // 실패 시 기존 설명 유지
    } finally {
      setImproving(false);
    }
  }

  function pick(pt: PlanType) {
    saveBusiness(biz);
    createPlan(`${pt.cat} · ${pt.type}`, biz.name);
    router.push("/plan/overview");
  }

  const visible = PLAN_TYPES.filter((p) => p.category === category);

  return (
    <div className={styles.page}>
      <div className={styles.frame}>
        <div className={styles.app}>
          <div className={styles.main}>
            <h1 className={styles.h1}>새 플랜 만들기</h1>
            <p className={styles.lead}>
              {step === 1
                ? hasExisting
                  ? <><b>사업 정보를 확인해 주세요.</b> 수정하면 앞으로 만드는 모든 플랜에 반영됩니다.</>
                  : <><b>먼저 사업을 알려주세요.</b> 여기 적은 내용이 이후 모든 질문과 AI 추천에 반영됩니다.</>
                : <><b>어떤 걸 만들까요?</b> 같은 사업으로 여러 종류의 플랜을 만들 수 있어요.</>}
            </p>

            {/* 단계 표시 */}
            <div className={styles.steps}>
              <div className={`${styles.step} ${step === 1 ? styles.stepOn : styles.stepDone}`}>
                <span className={styles.stepNum}>{step === 1 ? "1" : "✓"}</span> 사업 정보
              </div>
              <div className={styles.stepBar} />
              <div className={`${styles.step} ${step === 2 ? styles.stepOn : ""}`}>
                <span className={styles.stepNum}>2</span> 플랜 유형
              </div>
            </div>

            {step === 1 ? (
              <>
                <div className={styles.formGrid}>
                  <div className={`${styles.field} ${styles.fieldWide}`}>
                    <label className={styles.label} htmlFor="bizName">사업/브랜드 이름<span className={styles.req}>*</span></label>
                    <input id="bizName" className={styles.input} placeholder="예: 새벽커피" value={biz.name} onChange={(e) => set("name", e.target.value)} />
                  </div>

                  <div className={`${styles.field} ${styles.fieldWide}`}>
                    <label className={styles.label} htmlFor="bizDesc">사업 설명<span className={styles.req}>*</span></label>
                    <textarea
                      id="bizDesc"
                      className={styles.textarea}
                      rows={3}
                      placeholder="예: 서울 마포구에서 스페셜티 원두와 수제 디저트를 파는 동네 카페입니다. 매장과 온라인 주문을 함께 운영합니다."
                      value={biz.description}
                      onChange={(e) => set("description", e.target.value)}
                    />
                    <p className={styles.hint}>무엇을, 누구에게, 어떻게 제공하는지 한두 문장으로 적어주세요. 이 내용이 25개 섹션 전체의 AI 추천에 쓰입니다.</p>
                    <button className={styles.aiBtn} onClick={improveDescription} disabled={improving || biz.description.trim().length < 5}>
                      ✨ {improving ? "다듬는 중…" : "AI로 설명 다듬기"}
                    </button>
                  </div>

                  <div className={styles.field}>
                    <span className={styles.label}>대표자 역할</span>
                    <Select value={biz.role} options={ROLES} placeholder="선택하세요" onChange={(v) => set("role", v)} />
                  </div>

                  <div className={styles.field}>
                    <span className={styles.label}>진행 단계</span>
                    <Select value={biz.stage} options={STAGES} placeholder="선택하세요" onChange={(v) => set("stage", v)} />
                  </div>

                  <div className={styles.field}>
                    <span className={styles.label}>업종</span>
                    <Select value={biz.industry} options={INDUSTRIES} placeholder="선택하세요" onChange={(v) => set("industry", v)} />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="bizRegion">지역</label>
                    <input id="bizRegion" className={styles.input} placeholder="예: 서울 마포구" value={biz.region} onChange={(e) => set("region", e.target.value)} />
                  </div>
                </div>

                <div className={styles.actions}>
                  <button className={styles.primaryBtn} disabled={!step1Ok} onClick={() => setStep(2)}>다음 →</button>
                  {!step1Ok && <span className={styles.hint}>사업 이름과 설명을 입력하면 다음으로 넘어갑니다.</span>}
                </div>
              </>
            ) : (
              <>
                <div className={styles.summaryBox}>
                  <b>{biz.name}</b>
                  {biz.industry && ` · ${biz.industry}`}
                  {biz.region && ` · ${biz.region}`}
                  <br />
                  {biz.description}
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

                <div className={styles.actions} style={{ marginTop: 18 }}>
                  <button className={styles.ghostBtn} onClick={() => setStep(1)}>← 사업 정보 수정</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
