"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { saveBusiness, createPlan, hydrateFromServer, loadState, answerDonor, EMPTY_BUSINESS, type BusinessProfile } from "../../../lib/plan-builder/plan-store";
import { sectionCountForType } from "../../../lib/plan-builder/blueprint";
import { Sparkles, Star, ArrowRight } from "lucide-react";
import PlanGate from "../PlanGate";
import styles from "./PlanStart.module.css";
import PlanLoading from "../PlanLoading";

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
  /** 카드에 크게 보이는 구분되는 이름 */
  name: string;
  /** 문서 표지에 찍히는 유형 */
  type: string;
  category: "bp" | "forecast";
  /** 대표로 크게 보여줄 하나 */
  featured?: boolean;
  tone: number;
  icon: React.ReactElement;
  desc: string;
  /** 이런 분께 맞습니다 */
  fits: string[];
}

const PLAN_TYPES: PlanType[] = [
  {
    id: "startup-bp",
    name: "창업 초기 사업계획서",
    type: "창업 초기 · 사업계획서",
    category: "bp",
    featured: true,
    tone: 1,
    icon: rocket,
    desc: "아이디어를 검증하고 시장 진입 전략까지 세우는, 처음 만드는 사업계획서.",
    fits: ["아직 문서를 만들어본 적 없는 분", "지원사업·대출 신청 전 초안이 필요한 분"],
  },
  {
    id: "growth-bp",
    name: "성장·확장 사업계획서",
    type: "성장·확장 · 사업계획서",
    category: "bp",
    tone: 2,
    icon: chart,
    desc: "이미 운영 중인 사업의 확장·신시장 진입·추가 자금 확보를 위한 계획.",
    fits: ["매출이 나고 있는 분", "2호점·신규 라인을 준비하는 분"],
  },
  {
    id: "psst-bp",
    name: "정부지원 PSST 계획서",
    type: "정부지원 · PSST 사업계획서",
    category: "bp",
    tone: 3,
    icon: doc,
    desc: "문제인식·실현가능성·성장전략·팀 구성 — 지원사업 심사 순서로 완성되는 문서.",
    fits: ["예비창업·초기창업패키지를 준비하는 분", "심사 기준에 맞는 구성이 필요한 분"],
  },
  {
    id: "simple-bp",
    name: "간단 요약 계획서",
    type: "간단 · 사업계획서",
    category: "bp",
    tone: 4,
    icon: doc,
    desc: "가치 제안과 핵심 목표만 짧게 정리하는 요약형.",
    fits: ["먼저 방향만 잡아보려는 분", "짧게 설명할 자료가 필요한 분"],
  },
  {
    id: "internal-bp",
    name: "내부 전략 문서",
    type: "내부용 · 사업계획서",
    category: "bp",
    tone: 6,
    icon: doc,
    desc: "외부 제출용이 아니라 팀이 같은 그림을 보고 실행을 추적하기 위한 문서.",
    fits: ["동업자·팀과 방향을 맞추려는 분", "분기 계획을 정리하려는 분"],
  },
  {
    id: "startup-ff",
    name: "창업 재무 예측",
    type: "창업 초기 · 재무 예측",
    category: "forecast",
    featured: true,
    tone: 5,
    icon: chart,
    desc: "매출·비용·손익분기를 숫자로 따져 초기 자금이 얼마나 필요한지 확인.",
    fits: ["얼마가 필요한지 계산이 필요한 분", "손익분기 시점을 알고 싶은 분"],
  },
  {
    id: "detailed-fm",
    name: "정밀 재무 모델",
    type: "정밀 · 재무 모델",
    category: "forecast",
    tone: 3,
    icon: chart,
    desc: "3년 매출·손익 예측까지 붙여 투자 심사에 대비하는 심화 분석.",
    fits: ["투자자 심사를 앞둔 분", "3년 치 숫자가 필요한 분"],
  },
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
  /** 답변을 물려줄 기존 플랜 정보 (없으면 선택 UI를 숨긴다) */
  const [donor, setDonor] = useState<{ title: string; planType: string; count: number } | null>(null);
  /** true = 기존 사업 답변 이어받기(기본), false = 처음부터 새로 */
  const [inherit, setInherit] = useState(true);
  /** 이미 만들어 둔 유형 — 같은 사업으로 이어갈 때는 목록에서 뺀다(중복 구매 방지) */
  const [existingTypes, setExistingTypes] = useState<Set<string>>(new Set());
  /*
   * 플랜 빌더는 가입해야 쓸 수 있다.
   * 예전에는 입구를 열어두고 섹션 생성 단계에서야 막았다. 그래서 로그인하지
   * 않아도 사업 정보가 채워진 채 2단계로 넘어가 있었고(이전 방문 때 이 브라우저에
   * 남긴 값), 한참 진행한 뒤에야 로그인하라는 말을 듣게 됐다.
   */
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/plan/access")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        setAuthed(!!d.authenticated);
      })
      .catch(() => { if (alive) setAuthed(false); });
    return () => { alive = false; };
  }, []);

  // 이미 등록한 사업이 있으면 불러와서 재입력을 줄인다(사업 1개 유지)
  // 로그인한 뒤에만 불러온다 — 로그아웃 상태에서 남의 기기 값이 채워져 보이면 안 된다
  useEffect(() => {
    if (!authed) return;
    const s = loadState();
    if (s.business.name) {
      setBiz(s.business);
      setHasExisting(true);
      if (s.plans.length > 0) setStep(2); // 사업+플랜이 이미 있으면 유형 선택부터
    }
    setDonor(answerDonor());
    setExistingTypes(new Set(s.plans.filter((p) => !p.id.startsWith("sample_")).map((p) => p.planType)));
  }, [authed]);

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

  async function pick(pt: PlanType) {
    /*
     * 만들기 전에 서버 상태를 먼저 당겨온다.
     * 오래 열려 있던 탭의 낡은 로컬 캐시 위에서 플랜을 만들면
     * 답변 물려받기가 옛 플랜을 보고, 저장 병합도 불필요하게 늘어난다.
     */
    await hydrateFromServer().catch(() => {});
    saveBusiness(biz);
    createPlan(pt.type, biz.name, { inheritAnswers: inherit });
    router.push("/plan/overview");
  }

  // 같은 사업으로 이어갈 때는 이미 만든 유형을 숨긴다 — 같은 문서를 또 사는 건 의미가 없다
  const hideExisting = Boolean(donor) && inherit;
  const visible = PLAN_TYPES.filter((p) => p.category === category && !(hideExisting && existingTypes.has(p.type)));
  const hiddenCount = hideExisting ? PLAN_TYPES.filter((p) => p.category === category && existingTypes.has(p.type)).length : 0;
  const featured = visible.find((p) => p.featured);
  const others = visible.filter((p) => p !== featured);

  // 로그인 확인 전에는 아무것도 단정하지 않는다(깜빡임 방지)
  if (authed === null) return <div className={styles.page}><div className={styles.frame}><PlanLoading variant="deck" count={4} note="준비하는 중…" /></div></div>;

  // 실제로 플랜을 만드는 단계 — 여기부터는 로그인이 필요하다
  if (!authed) {
    return (
      <div className={styles.page}>
        <div className={styles.frame}>
          <div className={styles.app}>
            <div className={styles.main}>
              <h1 className={styles.h1}>새 플랜 만들기</h1>
              <PlanGate reason="login_required" />
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                    <label className={styles.label} htmlFor="bizName">
                      사업/브랜드 이름<span className={styles.req}>*</span>
                      {biz.name.trim() && <span className={styles.okTag}>✓</span>}
                    </label>
                    <input id="bizName" className={styles.input} placeholder="예: 새벽커피" value={biz.name} onChange={(e) => set("name", e.target.value)} />
                  </div>

                  <div className={`${styles.field} ${styles.fieldWide}`}>
                    <label className={styles.label} htmlFor="bizDesc">
                      사업 설명<span className={styles.req}>*</span>
                      {biz.description.trim().length >= 5 && <span className={styles.okTag}>✓</span>}
                    </label>
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
                      <Sparkles size={13} /> {improving ? "다듬는 중…" : "AI로 설명 다듬기"}
                    </button>
                  </div>

                  <div className={styles.field}>
                    <span className={styles.label}>대표자 역할</span>
                    <Select value={biz.role} options={ROLES} placeholder="선택해 주세요" onChange={(v) => set("role", v)} />
                  </div>

                  <div className={styles.field}>
                    <span className={styles.label}>진행 단계</span>
                    <Select value={biz.stage} options={STAGES} placeholder="선택해 주세요" onChange={(v) => set("stage", v)} />
                  </div>

                  <div className={styles.field}>
                    <span className={styles.label}>업종</span>
                    <Select value={biz.industry} options={INDUSTRIES} placeholder="선택해 주세요" onChange={(v) => set("industry", v)} />
                  </div>

                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="bizRegion">지역</label>
                    <input id="bizRegion" className={styles.input} placeholder="예: 서울 마포구" value={biz.region} onChange={(e) => set("region", e.target.value)} />
                  </div>
                </div>

                {/*
                  버튼에는 할 일만 적는다. 다음 단계 이름까지 넣으면 문구가 길어져
                  모바일에서 두 줄로 감긴다. 아직 못 넘어가는 이유는 버튼 아래에 둔다.
                */}
                <div className={styles.actions}>
                  <button
                    className={`${styles.primaryBtn} ${step1Ok ? styles.ready : ""}`}
                    disabled={!step1Ok}
                    onClick={() => setStep(2)}
                  >
                    다음 단계
                  </button>
                  {!step1Ok && (
                    <span className={styles.todo}>
                      {!biz.name.trim() ? "사업 이름" : "사업 설명"}을 입력해 주세요
                    </span>
                  )}
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

                {/* 기존 답변 이어받기 선택 — 이미 작성한 플랜이 있을 때만 */}
                {donor && (
                  <div className={styles.inheritBox}>
                    <div className={styles.inheritHead}>이미 작성한 답변이 있어요</div>
                    <div className={styles.inheritOpts} role="radiogroup" aria-label="답변 이어받기 선택">
                      <button
                        type="button"
                        role="radio"
                        aria-checked={inherit}
                        className={`${styles.inheritOpt} ${inherit ? styles.inheritOn : ""}`}
                        onClick={() => setInherit(true)}
                      >
                        <span className={styles.inheritRadio} aria-hidden="true" />
                        <span className={styles.inheritText}>
                          <b>같은 사업, 답변 이어받기</b>
                          <span>‘{donor.title}’의 답변 {donor.count}개를 가져와요 — 겹치는 질문은 건너뜁니다</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!inherit}
                        className={`${styles.inheritOpt} ${!inherit ? styles.inheritOn : ""}`}
                        onClick={() => setInherit(false)}
                      >
                        <span className={styles.inheritRadio} aria-hidden="true" />
                        <span className={styles.inheritText}>
                          <b>처음부터 새로 시작</b>
                          <span>다른 사업을 만들거나 답을 전부 새로 쓸 때 — 빈 상태로 시작해요</span>
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                <div className={styles.cats}>
                  <button className={category === "bp" ? styles.catOn : ""} onClick={() => setCategory("bp")}>사업계획서</button>
                  <button className={category === "forecast" ? styles.catOn : ""} onClick={() => setCategory("forecast")}>재무 예측</button>
                </div>

                {hiddenCount > 0 && (
                  <p className={styles.hiddenNote}>
                    이미 만든 유형 {hiddenCount}개는 목록에서 뺐어요. 다른 사업으로 만들려면 위에서 ‘처음부터 새로 시작’을 선택해 주세요.
                  </p>
                )}
                {/* 표지형 카드 덱 — 레퍼런스 대시보드의 플랜 카드 구조(커버+하단 스트립+배지) */}
                <div className={styles.deck}>
                  {[...(featured ? [featured] : []), ...others].map((pt) => {
                    const tone = TONES[pt.tone] ?? TONES[1];
                    return (
                      <button
                        key={pt.id}
                        className={styles.planCard}
                        style={{ ["--acc" as string]: tone.acc, ["--tint" as string]: tone.tint }}
                        onClick={() => pick(pt)}
                      >
                        <span className={styles.sheet}>
                          <span className={styles.cover}>
                            {pt.featured && (
                              <span className={styles.coverBadge}>
                                <Star size={10} fill="currentColor" /> 가장 인기
                              </span>
                            )}
                            <span className={styles.coverIcon} aria-hidden="true">{pt.icon}</span>
                            <span className={styles.coverName}>{pt.name}</span>
                          </span>
                          <span className={styles.strip}>
                            <b>{sectionCountForType(pt.type)}개 섹션</b>
                            <ArrowRight size={14} />
                          </span>
                        </span>
                        <span className={styles.cardDesc}>{pt.desc}</span>
                      </button>
                    );
                  })}
                </div>

                <p className={styles.sameNote}>
                  유형에 따라 채우는 <b>섹션 구성과 개수가 다릅니다</b>. 같은 사업으로 다른 유형을
                  만들면 답변을 이어받아, 겹치는 섹션은 다시 답하지 않아도 돼요.
                </p>

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
