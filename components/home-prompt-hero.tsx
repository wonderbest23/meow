"use client";

/*
 * 첫 화면(2026-10-23 승인 디자인) — 큰 제목, 내 말로 적는 입력 카드, 결과물 진열 띠.
 *
 * 입력 카드는 진짜 입력칸이다. 적고 보내면 새 대화(작업실이 켜져 있으면 /plan/studio?new=1&idea=…, 아니면 /plan/chat?new=1&idea=…)로 가서 적은 말이 첫 메시지로 이어진다.
 * 로그인 화면을 거치며 주소의 idea 가 빠질 수 있어 같은 글을 sessionStorage('oneul-landing-idea', {text, at})에도 잠깐 맡긴다.
 * 비어 있으면 지금처럼 새 대화만 연다.
 *
 * 움직임 값은 base44 첫 화면에서 잰 것: 글자 치기 45ms·지우기 25ms·다 친 뒤 2초 쉼·다음 예시 전 0.4초·시작 0.5초 뒤,
 * 진열 띠는 4초마다 다음 탭, 카드마다 90ms 차이로 '끊어 바꾸기'(사라짐 60ms → 나타남 160ms).
 * 움직임 줄이기 설정이면 예시 문장을 그대로 두고 띠도 저절로 넘기지 않는다.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { composerEnterSends } from "../app/plan/chat/intake-ui/guidance";
import { newChatHref } from "../lib/plan-builder/studio";
import { LANDING_IDEA_MAX, normalizeLandingIdea, stashLandingIdea } from "../lib/plan-builder/landing-idea";
import styles from "./home-prompt-hero.module.css";

/** 대화 첫 입력 한도와 같다 */
const IDEA_LIMIT = LANDING_IDEA_MAX;

const PROMPTS = [
  "500만원으로 동네 카페를 차리고 싶어요.",
  "회사 근처에서 무인 김밥 가게를 해보고 싶어요.",
  "수제 캔들을 스마트스토어에서 팔고 싶어요.",
  "아파트 상가에 초등 공부방을 열고 싶어요.",
];

type Shape = "sq" | "tall";
type ShowcaseItem = { src: string; alt: string; width: number; height: number };
const SHAPES: Shape[] = ["sq", "tall", "tall", "sq"];
const sq = (src: string, alt: string): ShowcaseItem => ({ src, alt, width: 640, height: 640 });
const tall = (src: string, alt: string): ShowcaseItem => ({ src, alt, width: 480, height: 678 });
const report = (page: string, alt: string): ShowcaseItem => ({ src: `/home-media/results/report-${page}.webp`, alt, width: 1132, height: 1600 });
const S = "/home-media/showcase";

/*
 * 진열 띠 — 실제 화면과 실제 예시 문서만 쓴다(새벽커피 예시 계획서·예시 홈페이지, 로컬 시험 서버의 빵집 사업 화면).
 * 발표 자료(PPT)는 결제 제공 범위가 아니라서 탭에 두지 않는다(lib/plan-builder/deck-availability.ts).
 */
const SHOWCASE: Array<{ label: string; items: ShowcaseItem[] }> = [
  { label: "계획서", items: [
    sq(`${S}/plan-cover.webp`, "사업계획서 표지와 본문 페이지를 겹쳐 놓은 그림"),
    report("01", "새벽커피 예시 사업계획서 PDF 표지"),
    report("03", "예시 사업계획서의 사업 개요와 정리 표 페이지"),
    sq(`${S}/plan.webp`, "화면에서 읽는 예시 사업계획서 본문"),
  ] },
  { label: "한 장 요약", items: [
    sq(`${S}/summary.webp`, "사업과 고객, 상품과 가격을 한 장에 정리한 요약 화면"),
    tall(`${S}/summary-m.webp`, "휴대폰에서 보는 한 장 요약 — 사업, 고객, 거래 조건, 계획 계산"),
    report("15", "예시 사업계획서의 12개월 손익 추정 그래프 페이지"),
    sq(`${S}/numbers.webp`, "판매가, 건당 비용, 월 고정비로 계산한 손익분기 화면"),
  ] },
  { label: "홈페이지", items: [
    sq(`${S}/homepage.webp`, "새벽커피 예시 홈페이지 첫 화면"),
    tall(`${S}/homepage-m.webp`, "휴대폰으로 본 새벽커피 예시 홈페이지"),
    tall(`${S}/homepage-page-m.webp`, "예시 홈페이지를 미리보는 오늘창업 화면"),
    sq(`${S}/homepage-rooms.webp`, "예시 홈페이지의 숫자 소개와 공간 안내 구간"),
  ] },
  { label: "개업 준비", items: [
    sq(`${S}/launch.webp`, "빵집 개업까지 할 일 10단계 목록 — 상품, 신고 순서, 사업자등록, 세금, 첫 홍보"),
    tall(`${S}/launch-m.webp`, "휴대폰에서 보는 사업 시작하기 단계 목록"),
    tall(`${S}/ops-m.webp`, "문을 연 뒤 홈페이지 관리와 실적 기록 화면"),
    sq(`${S}/ops.webp`, "유지보수 화면 — 홈페이지 관리, 실적과 개선 기록"),
  ] },
];

type Slot = { set: number; phase: "hold" | "gone" | "enter" };

type SpeechRecognitionLike = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void; stop: () => void;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;
function speechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** 보낼 주소 — 비어 있으면 새 대화만 연다. 작업실이 켜져 있으면 작업실의 새 대화(/plan/studio?new=1&idea=…)로 — newChatHref */
export function landingIdeaHref(text: string) {
  return newChatHref(normalizeLandingIdea(text));
}

/** 로그인을 거치며 주소의 idea 가 빠져도 이어지게 — 대화 화면이 5분 안에 한 번만 읽고 지운다(lib/plan-builder/landing-idea.ts) */
export function rememberLandingIdea(text: string) {
  let storage: Storage | null = null;
  try { storage = window.sessionStorage; } catch { /* 저장소가 막혀 있으면 주소로만 넘어간다 */ }
  stashLandingIdea(storage, text, Date.now());
}

export function HomePromptHero({ title, subtitle, hidden = [] }: { title: string; subtitle: ReactNode; hidden?: string[] }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState("");
  const [tab, setTab] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [slots, setSlots] = useState<Slot[]>(() => SHAPES.map(() => ({ set: 0, phase: "hold" })));
  const [micReady, setMicReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [micNote, setMicNote] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const timers = useRef(new Set<number>());
  /** 마지막으로 친 예시 번호 — 입력칸을 비우고 나가면 처음이 아니라 다음 예시부터 친다 */
  const promptIndex = useRef(0);
  const cutting = useRef(false);
  const tabRef = useRef(0);
  tabRef.current = tab;

  const later = useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(() => { timers.current.delete(id); fn(); }, ms);
    timers.current.add(id);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMounted(true);
    setReduced(media.matches);
    if (media.matches) setPlaying(false);
    setMicReady(!!speechRecognition());
    const onChange = () => { setReduced(media.matches); if (media.matches) setPlaying(false); };
    media.addEventListener("change", onChange);
    const pending = timers.current;
    return () => { media.removeEventListener("change", onChange); pending.forEach(id => window.clearTimeout(id)); pending.clear(); recognition.current?.stop(); };
  }, []);

  /* 다른 탭 사진을 미리 받아 둔다 — 바꾸는 순간 빈 칸이 보이지 않게 */
  useEffect(() => {
    if (!mounted) return;
    const id = window.setTimeout(() => { for (const set of SHOWCASE.slice(1)) for (const item of set.items) { const image = new Image(); image.src = item.src; } }, 1200);
    return () => window.clearTimeout(id);
  }, [mounted]);

  /* 예시 문장 치기 — 손님이 입력칸을 누르거나 글을 적으면 멈추고, 비우고 나가면 다음 예시부터 다시 친다 */
  const overlay = mounted && !text && !focused;
  useEffect(() => {
    if (!overlay) return;
    if (reduced) { setTyped(PROMPTS[0]); return; }
    let index = promptIndex.current, length = 0, mode: "typing" | "deleting" = "typing";
    let timer = 0;
    const step = () => {
      const prompt = PROMPTS[index % PROMPTS.length];
      let next = 45;
      if (mode === "typing") { length += 1; if (length >= prompt.length) { mode = "deleting"; next = 2000; } }
      else { length -= 1; next = 25; if (length <= 0) { mode = "typing"; index += 1; promptIndex.current = index % PROMPTS.length; next = 400; } }
      setTyped(prompt.slice(0, Math.max(0, length)));
      timer = window.setTimeout(step, next);
    };
    setTyped("");
    timer = window.setTimeout(step, 500);
    return () => { window.clearTimeout(timer); promptIndex.current = (index + (length > 0 ? 1 : 0)) % PROMPTS.length; };
  }, [overlay, reduced]);

  const cutTo = useCallback((next: number) => {
    if (next === tabRef.current) return;
    setTab(next);
    if (reduced) { setSlots(SHAPES.map(() => ({ set: next, phase: "hold" }))); return; }
    cutting.current = true;
    const setSlot = (index: number, patch: Partial<Slot>) => setSlots(current => current.map((slot, k) => k === index ? { ...slot, ...patch } : slot));
    SHAPES.forEach((_, index) => {
      const at = index * 90;
      later(at, () => setSlot(index, { phase: "gone" }));
      later(at + 60, () => setSlot(index, { set: next, phase: "enter" }));
      later(at + 60 + 160, () => setSlot(index, { phase: "hold" }));
    });
    later((SHAPES.length - 1) * 90 + 220, () => { cutting.current = false; });
  }, [later, reduced]);

  useEffect(() => {
    if (!playing || reduced) return;
    const id = window.setInterval(() => {
      if (cutting.current || document.hidden) return;
      cutTo((tabRef.current + 1) % SHOWCASE.length);
    }, 4000);
    return () => window.clearInterval(id);
  }, [playing, reduced, cutTo]);

  const submit = () => {
    const idea = normalizeLandingIdea(text);
    if (idea) rememberLandingIdea(idea);
    recognition.current?.stop();
    router.push(landingIdeaHref(idea));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (composerEnterSends({ key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing, keyCode: event.nativeEvent.keyCode }, window.matchMedia("(pointer: coarse)").matches)) {
      event.preventDefault();
      submit();
    }
  };

  const toggleMic = () => {
    if (listening) { recognition.current?.stop(); return; }
    const Recognition = speechRecognition();
    if (!Recognition) return;
    const engine = new Recognition();
    engine.lang = "ko-KR";
    engine.interimResults = false;
    engine.continuous = false;
    engine.onresult = event => {
      let heard = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) if (event.results[i].isFinal) heard += event.results[i][0].transcript;
      if (heard.trim()) setText(current => `${current}${current && !/\s$/.test(current) ? " " : ""}${heard.trim()}`.slice(0, IDEA_LIMIT));
    };
    engine.onerror = event => setMicNote(event.error === "not-allowed" || event.error === "service-not-allowed" ? "마이크 사용을 허용하면 말로 적을 수 있어요." : event.error === "no-speech" ? "말소리가 들리지 않았어요. 다시 눌러 말해 주세요." : "음성 입력을 쓰지 못했어요. 글로 적어 주세요.");
    engine.onend = () => { setListening(false); recognition.current = null; };
    recognition.current = engine;
    setMicNote("");
    try { engine.start(); setListening(true); } catch { setListening(false); setMicNote("음성 입력을 쓰지 못했어요. 글로 적어 주세요."); }
  };

  const pickTab = (index: number) => { setPlaying(false); cutTo(index); };
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (index + delta + SHOWCASE.length) % SHOWCASE.length;
    pickTab(next);
    document.getElementById(`home-showcase-tab-${next}`)?.focus();
  };

  const titleLines = title.split("\n");
  return <section className={styles.hero} data-sc-section="promptHome" aria-labelledby="home-hero-title">
    {/* 어드민에서 제목을 숨겨도 문서 제목(h1)은 화면 낭독기에 남긴다 */}
    <h1 id="home-hero-title" className={hidden.includes("promptHome.title") ? styles.srOnly : styles.title} data-sc-field="promptHome.title">
      {titleLines.map((line, index) => <span key={index}>{line}{index < titleLines.length - 1 ? <br /> : null}</span>)}
    </h1>
    {hidden.includes("promptHome.subtitle") ? null : <p className={styles.subtitle} data-sc-field="promptHome.subtitle">{subtitle}</p>}

    <form className={styles.card} aria-label="사업 아이디어로 대화 시작" onSubmit={event => { event.preventDefault(); submit(); }}>
      <label htmlFor="home-idea" className={styles.srOnly}>어떤 사업을 생각하고 계세요?</label>
      <div className={styles.field}>
        <textarea
          id="home-idea"
          ref={textarea}
          className={styles.textarea}
          rows={2}
          maxLength={IDEA_LIMIT}
          enterKeyHint="send"
          value={text}
          /* 글자 치기 예시가 아직 안 돌 때(서버 화면·스크립트 꺼짐)만 보이는 안내 */
          placeholder={mounted ? undefined : PROMPTS[0]}
          onChange={event => setText(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
        />
        {overlay && <p className={styles.typing} aria-hidden="true">{typed}<span className={styles.caret} /></p>}
      </div>
      <div className={styles.actions}>
        {micNote && <p className={styles.micNote} role="status">{micNote}</p>}
        <span className={styles.spacer} />
        {micReady && <button type="button" className={styles.iconButton} aria-label={listening ? "음성 입력 멈추기" : "음성으로 말하기"} aria-pressed={listening} data-listening={listening || undefined} onClick={toggleMic}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
        </button>}
        <button type="submit" className={styles.send} aria-label="대화 시작하기">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 17L17 7M9 7h8v8" /></svg>
        </button>
      </div>
    </form>
    <p className={styles.hint}>로그인해도 적은 내용은 그대로 이어져요</p>

    <div className={styles.tabsRow}>
      <div role="tablist" aria-label="만들어지는 결과물" className={styles.tabs}>
        {SHOWCASE.map((set, index) => <span key={set.label} className={styles.tabItem}>
          {index > 0 && <i className={styles.tabDot} aria-hidden="true" />}
          <button
            type="button"
            role="tab"
            id={`home-showcase-tab-${index}`}
            aria-selected={index === tab}
            aria-controls="home-showcase"
            tabIndex={index === tab ? 0 : -1}
            className={styles.tab}
            onClick={() => pickTab(index)}
            onKeyDown={event => onTabKey(event, index)}
          >{index === tab ? <><span aria-hidden="true">[</span>{set.label}<span aria-hidden="true">]</span></> : set.label}</button>
        </span>)}
      </div>
      <button type="button" className={styles.play} aria-pressed={!playing} aria-label={playing ? "예시 넘김 멈추기" : "예시 넘김 다시 시작"} onClick={() => setPlaying(value => !value)}>
        {playing
          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z" /></svg>}
      </button>
    </div>

    <div id="home-showcase" role="tabpanel" aria-labelledby={`home-showcase-tab-${tab}`} className={styles.strip}>
      {SHAPES.map((shape, index) => {
        const slot = slots[index];
        const item = SHOWCASE[slot.set].items[index];
        return <figure key={index} className={`${styles.cardImage} ${styles[shape]} ${index === 3 ? styles.desktopOnly : ""}`} data-phase={slot.phase}>
          <img src={item.src} alt={item.alt} width={item.width} height={item.height} loading={index < 3 ? "eager" : "lazy"} decoding="async" />
        </figure>;
      })}
    </div>
  </section>;
}
