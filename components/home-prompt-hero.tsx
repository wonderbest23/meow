"use client";

/*
 * 첫 화면(2026-10-23 승인 디자인) — 큰 제목, 내 말로 적는 입력 카드, 결과물 진열 띠.
 *
 * 입력 카드는 진짜 입력칸이다. 적고 보내면 새 대화(작업실이 켜져 있으면 /plan/studio?new=1&idea=…, 아니면 /plan/chat?new=1&idea=…)로 가서 적은 말이 첫 메시지로 이어진다.
 * 로그인 화면을 거치며 주소의 idea 가 빠질 수 있어 같은 글을 sessionStorage('oneul-landing-idea', {text, at})에도 잠깐 맡긴다.
 * 비어 있으면 지금처럼 새 대화만 연다.
 *
 * 움직임 값은 base44 첫 화면에서 잰 것: 글자 치기 45ms·지우기 25ms·다 친 뒤 2초 쉼·다음 예시 전 0.4초·시작 0.5초 뒤,
 * 진열 띠는 7초마다 다음 탭, 화면(브라우저 틀·휴대폰 틀)마다 90ms 차이로 '끊어 바꾸기'(사라짐 60ms → 나타남 160ms).
 * 탭마다 화면 안 그림이 움직인다(2026-10-24 사장님: 그림이 가만히 있어 무엇을 보여 주는지 안 보인다) —
 * 맨 위를 0.8초 보여 주고 → 3초 동안 천천히 아래로 내려 강조할 곳까지 → 그곳으로 살짝 당겨 보며(1.16배) 작은 이름표를 띄우고 → 잠깐 머문 뒤 다음 탭.
 * 움직임 줄이기 설정이면 예시 문장을 그대로 두고, 띠도 저절로 넘기지 않으며, 그림은 맨 위에 둔 채 이름표만 보여 준다.
 * 입력칸에 초점이 있거나 진열 띠 위에 마우스가 있는 동안, 멈춤 단추를 누른 동안에는 그 자리에 멈춘다(글을 쓰거나 그림을 보는 중에 바뀌지 않게).
 */
import { Children, cloneElement, isValidElement, useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { composerEnterSends } from "../app/plan/chat/intake-ui/guidance";
import { newChatHref } from "../lib/plan-builder/studio";
import { nativePlatform } from "../lib/native-app";
import { LANDING_IDEA_MAX, normalizeLandingIdea, stashLandingIdea } from "../lib/plan-builder/landing-idea";
import { IphoneMockup } from "./iphone-mockup";
import styles from "./home-prompt-hero.module.css";

/** 대화 첫 입력 한도와 같다 */
const IDEA_LIMIT = LANDING_IDEA_MAX;

const PROMPTS = [
  "500만원으로 동네 카페를 차리고 싶어요.",
  "회사 근처에서 무인 김밥 가게를 해보고 싶어요.",
  "수제 캔들을 스마트스토어에서 팔고 싶어요.",
  "아파트 상가에 초등 공부방을 열고 싶어요.",
];

/** 강조할 곳 — 그림 높이에 대한 위·아래 끝(%)과 가로 가운데(%, 기본 50) */
type ShowcaseFocus = { top: number; bottom: number; x?: number };
type ShowcaseItem = { src: string; alt: string; width: number; height: number; focus: ShowcaseFocus };
/* 화면 두 칸 — 컴퓨터 화면(브라우저 틀)과 휴대폰 화면(아이폰 틀). 휴대폰 너비에서는 아이폰 틀 한 장만 크게 */
type ShowcaseSlot = "screen" | "phone";
const SLOTS: ShowcaseSlot[] = ["screen", "phone"];
const S = "/home-media/showcase";
/*
 * 그림은 한 화면보다 길게(아래로 내려 볼 수 있게) 찍었다 — 앱 머리줄이 맨 위에 있다.
 * 컴퓨터 화면: 1280×2000 화면을 찍어 1600×2500 으로. 틀 안에는 위 16:10(1280×800)만 보이고 아래로 내려 간다.
 * 휴대폰 화면: 390×(1720~2400) 화면을 찍어 너비 780 으로. 틀 안에는 상태 표시줄 아래 390×790 만 보인다. 컴퓨터 화면을 줄여 넣지 않는다.
 */
const screen = (name: string, alt: string, focus: ShowcaseFocus): ShowcaseItem => ({ src: `${S}/${name}.webp`, alt, width: 1600, height: 2500, focus });
const phone = (name: string, cssHeight: number, alt: string, focus: ShowcaseFocus): ShowcaseItem => ({ src: `${S}/${name}.webp`, alt, width: 780, height: cssHeight * 2, focus });
/** 보이는 칸의 높이 ÷ 너비 — 컴퓨터 화면 16:10, 휴대폰 화면 390×790 */
const VIEW_RATIO: Record<ShowcaseSlot, number> = { screen: 10 / 16, phone: 790 / 390 };

/*
 * 진열 띠 — 실제 AI로 만든 예시 사업('성수 쿠키공방', 성수동 1인 수제 쿠키 가게)의 실제 화면만 쓴다(2026-10-24 다시 찍음, 로컬 시험 서버·실제 AI).
 * 대화로 답한 선물 상자 18,000원·상자 비용 6,500원·월 고정비 220만 원·예산 2,500만 원으로 만든 계획서·한 장 요약·공개 홈페이지·개업 준비 그대로다.
 * 탭마다 컴퓨터 화면과 '같은 탭'의 휴대폰 화면(390 너비로 따로 찍은 것)을 함께 보여 준다.
 * note 는 강조할 곳에 띄우는 작은 이름표(14자 안) — 그림 대체 글에도 같은 내용이 들어 있어 낭독기에는 읽히지 않게 둔다.
 * 설명 문장·출처 안내 줄은 두지 않는다(2026-10-23 사장님: 군더더기).
 * 발표 자료(PPT)는 결제 제공 범위가 아니라서 탭에 두지 않는다(lib/plan-builder/deck-availability.ts).
 */
const EXAMPLE = "실제 AI로 만든 예시 가게 ‘성수 쿠키공방’";
const SHOWCASE: Array<{ label: string; note: string } & Record<ShowcaseSlot, ShowcaseItem>> = [
  {
    label: "계획서",
    note: "하루 7건이면 본전",
    screen: screen("cookie-plan-tall", `${EXAMPLE}의 사업계획서 작업실 — 왼쪽 대화에는 '선물 상자 가격을 19,000원으로 올려 줘' 요청과 바꿀 내용 확인 카드, 오른쪽 4장 재무 계획에는 고정비 월 2,200,000원·상자 한 개 비용 6,500원·대표 생활비 표와 '세 가지 경우로 본 한 달': 한 건에 11,500원이 남고 본전 판매량은 월 192건(하루 약 7건)`, { top: 92.3, bottom: 97.5, x: 74 }),
    phone: phone("cookie-plan-tall-m", 2400, `${EXAMPLE}의 사업계획서 재무 계획을 휴대폰으로 본 화면 — 초기 지출을 500만 원 수준으로 줄이는 방법, '세 가지 경우로 본 한 달': 한 건에 11,500원이 남고 본전 판매량은 월 192건(하루 약 7건), 조심스러운 경우 월 96건이면 3,096,000원 부족, 12개월 통장 누적`, { top: 31.4, bottom: 37.8 }),
  },
  {
    label: "한 장 요약",
    note: "첫 달·본전 계산",
    screen: screen("cookie-summary-tall", `${EXAMPLE}의 한 장 요약 — '아침에 구운 쿠키 선물 상자, 퇴근길에 바로 찾아가요', 사업과 고객, 제공안과 판매, 수익 구조와 계획 계산(손익분기 월 192건 / 매출 3,456,000원), 다음 행동과 확인 기준`, { top: 35.4, bottom: 45.3, x: 74 }),
    phone: phone("cookie-summary-tall-m", 1720, `${EXAMPLE}의 한 장 요약을 휴대폰으로 본 화면 — 수제 쿠키 6종 6개입 선물 상자 18,000원, 첫 달 가정(조심스러운 경우 96건 판매 / 한 달 -3,096,000원), 손익분기 월 192건 / 매출 3,456,000원`, { top: 47.2, bottom: 61.6 }),
  },
  {
    label: "홈페이지",
    note: "손님이 보는 메뉴",
    screen: screen("cookie-homepage-tall", `계획서로 만들어 공개한 ${EXAMPLE} 홈페이지 — 빵 사진 위에 가게 이름과 '아침에 구운 쿠키 선물 상자, 퇴근길에 바로 찾아가요', 예약 문의하기 단추, 메뉴(수제 쿠키 6개입 선물 상자 18,000원)`, { top: 59.9, bottom: 82.8, x: 37 }),
    phone: phone("cookie-homepage-tall-m", 2400, `손님이 휴대폰으로 보는 ${EXAMPLE} 공개 홈페이지 — 예약 문의하기 단추, 쿠키 6종 · 6개입 · 픽업 오후 12시~8시, 메뉴(수제 쿠키 6개입 선물 상자 18,000원), 이용 순서`, { top: 37.5, bottom: 57 }),
  },
  {
    label: "개업 준비",
    note: "할 일 10단계",
    screen: screen("cookie-launch-tall", `${EXAMPLE}의 개업 준비 전체 과정 10단계 — 팔고 싶은 상품 정하기, 작게 시작할 범위, 식품 제조·가공 시작 준비와 신고 순서, 일할 공간, 사업자등록, 세금 관리, 홈페이지 공개, 주문·결제 점검, 첫 홍보, 운영 결과로 개선`, { top: 45, bottom: 70, x: 66 }),
    phone: phone("cookie-launch-tall-m", 1720, `${EXAMPLE}의 개업 준비를 휴대폰으로 본 화면 — 2/10 '작게 시작할 범위를 정해요'와 전체 과정 10단계: 식품 제조·가공 신고 순서, 사업자등록, 세금 관리, 홈페이지 공개, 주문·결제 점검, 첫 홍보`, { top: 53.4, bottom: 81.4 }),
  },
];

type Slot = { set: number; phase: "hold" | "gone" | "enter" };

/** 진열 띠가 다음 탭으로 넘어가는 간격 — 화면 안 움직임과 진행 막대가 이 한 번에 맞춰 돈다(박자는 home-prompt-hero.module.css 의 @keyframes showcase-move) */
const ADVANCE_MS = 7000;
/** 강조할 곳으로 당겨 보는 배율 */
const ZOOM = 1.16;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/*
 * 화면 안 움직임 값 — 모두 그림 크기에 대한 비율이라 틀 크기가 달라도 같다.
 * --ty: 아래로 내리는 거리(그림 높이의 %), 강조할 곳의 가운데가 보이는 칸의 56% 높이에 오게(끝을 넘지 않게).
 * --ox/--oy: 당겨 보는 중심 = 강조할 곳의 가운데. 내린 뒤 그 점을 중심으로 키우므로 강조할 곳이 제자리에서 커진다.
 * --chip-x/--chip-y: 이름표 자리(보이는 칸의 %) — 키운 뒤 강조할 곳의 위 끝 바로 위.
 */
function motionVars(item: ShowcaseItem, kind: ShowcaseSlot): CSSProperties {
  const view = Math.min(1, VIEW_RATIO[kind] / (item.height / item.width));
  const top = item.focus.top / 100, bottom = item.focus.bottom / 100, x = item.focus.x ?? 50;
  const center = (top + bottom) / 2;
  const ty = clamp(0.56 * view - center, -(1 - view), 0);
  const centerInView = (center + ty) / view;
  /*
   * 휴대폰 화면은 당겨 보지 않는다 — 390 너비 화면을 1.16배로 키우면 양옆 여백과 머리줄 끝('대화로 고치기')이 잘렸다(모바일 점검 r37).
   * 컴퓨터 화면(넓은 그림)만 강조할 곳을 당겨 본다.
   */
  const zoom = kind === "phone" ? 1 : ZOOM;
  const chipY = clamp(centerInView - ((bottom - top) / 2) * zoom / view, 0.14, 0.8);
  return {
    "--ty": `${(ty * 100).toFixed(2)}%`,
    "--zoom": zoom,
    "--ox": `${x}%`,
    "--oy": `${(center * 100).toFixed(2)}%`,
    "--chip-x": `${clamp(x, 22, 78)}%`,
    "--chip-y": `${(chipY * 100).toFixed(2)}%`,
    "--showcase-ms": `${ADVANCE_MS}ms`,
  } as CSSProperties;
}

/** 틀 안의 보이는 칸 — 긴 그림이 그 안에서 내려가고 커진다. 움직이는 것은 transform·opacity 뿐이라 둘레가 밀리지 않는다 */
function ShowcaseView({ item, kind, note, loading }: { item: ShowcaseItem; kind: ShowcaseSlot; note: string; loading: "eager" | "lazy" }) {
  return <>
    <div className={styles.track} style={motionVars(item, kind)}>
      <img src={item.src} alt={item.alt} width={item.width} height={item.height} loading={loading} decoding="async" />
    </div>
    <span className={styles.chip} style={motionVars(item, kind)} aria-hidden="true">{note}</span>
  </>;
}

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

/*
 * 앱(아이폰·안드로이드) 안에서는 마이크 단추를 숨긴다 — 앱 설정(Info.plist)에 마이크·음성 인식 사용 설명이 없어
 * 눌러도 쓸 수 없다. 앱은 User-Agent 끝에 OneulstartApp 을 붙인다(mobile/capacitor.config.json).
 */
function inNativeApp() {
  return nativePlatform() !== null || (typeof navigator !== "undefined" && navigator.userAgent.includes("OneulstartApp"));
}

/*
 * 가운뎃점(·)으로 이은 낱말('계획서·홈페이지·개업')은 한 덩어리로 — 휴대폰에서 '·개업'처럼 점부터 새 줄이 시작됐다(2026-10-24).
 * 점 앞뒤에 줄바꿈 금지 문자(U+2060)를 넣는다. 관리자 문구(글·<br/> 조각)도 같은 규칙으로.
 */
function glueDots(node: ReactNode): ReactNode {
  if (typeof node === "string") return node.replace(/·/g, "\u2060·\u2060");
  if (Array.isArray(node)) return Children.map(node, glueDots);
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children !== undefined) return cloneElement(node as ReactElement<{ children?: ReactNode }>, undefined, glueDots(node.props.children));
  return node;
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

/** signedIn — 예전 '로그인해도 이어져요' 안내용(2026-10-24 군더더기라 걷음). 부르는 쪽 호환을 위해 받기만 한다 */
/* 제목에서 처음 나오는 '사업'에만 옅은 파랑 그라데이션을 천천히 흘린다(대표 요청 2026-10-23, 토스처럼 모던하게) — 문구는 운영 화면에서 바뀔 수 있어 낱말을 찾아 감싼다 */
const ACCENT_WORD = "사업";
function accentLine(line: string, active: boolean): ReactNode {
  const at = active ? line.indexOf(ACCENT_WORD) : -1;
  if (at < 0) return line;
  return <>{line.slice(0, at)}<span className={styles.accent}>{ACCENT_WORD}</span>{line.slice(at + ACCENT_WORD.length)}</>;
}

export function HomePromptHero({ title, subtitle, hidden = [] }: { title: string; subtitle: ReactNode; hidden?: string[]; signedIn?: boolean | null }) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [typed, setTyped] = useState("");
  const [tab, setTab] = useState(0);
  const [playing, setPlaying] = useState(true);
  /* 진열 띠·탭 줄 위에 마우스가 있는 동안 — 그 자리에 멈춘다(멈춤 단추의 상태와는 따로) */
  const [hovering, setHovering] = useState(false);
  /* 탭을 직접 고른 뒤 — 저절로 넘기지 않고 그 탭의 움직임만 한 번 보여 준 뒤 끝 장면에 머문다 */
  const [manual, setManual] = useState(false);
  /* 움직임을 처음부터 다시 돌릴 때마다 하나씩 — 화면 안 움직임과 진행 막대를 같은 순간에 새로 시작한다 */
  const [run, setRun] = useState(0);
  const [slots, setSlots] = useState<Slot[]>(() => SLOTS.map(() => ({ set: 0, phase: "hold" })));
  const [micReady, setMicReady] = useState(false);
  const [listening, setListening] = useState(false);
  const [micNote, setMicNote] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const timers = useRef(new Set<number>());
  /** 마지막으로 친 예시 번호 — 입력칸을 비우고 나가면 처음이 아니라 다음 예시부터 친다 */
  const promptIndex = useRef(0);
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
    setMicReady(!!speechRecognition() && !inNativeApp());
    const onChange = () => { setReduced(media.matches); if (media.matches) setPlaying(false); };
    media.addEventListener("change", onChange);
    const pending = timers.current;
    return () => { media.removeEventListener("change", onChange); pending.forEach(id => window.clearTimeout(id)); pending.clear(); recognition.current?.stop(); };
  }, []);

  /*
   * 상담 떠 있는 단추(support-chat-widget)가 입력 카드의 보내기 단추를 덮으면 그동안만 숨긴다 — 낮은 화면(640×450 등)에서
   * 보내기 단추 위에 겹쳤다(점검 2026-10-23). 겹치는지는 실제 위치로 재고, 표시는 html 의 data-compose-covered 로(globals.css).
   */
  useEffect(() => {
    const card = form.current;
    if (!card) return;
    const root = document.documentElement;
    let frame = 0;
    const check = () => {
      frame = 0;
      const widget = document.querySelector<HTMLElement>(".support-chat-widget:not(.open)");
      const b = widget?.getBoundingClientRect();
      const hits = (a: DOMRect) => !!b && b.width > 0 && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      /* 휴대폰(480px 이하)에서는 아이폰 진열(#home-showcase)을 덮는 동안에도 비켜 둔다 — 화면 속 글을 가렸다(모바일 점검 r37) */
      const showcase = window.matchMedia("(max-width: 480px)").matches ? document.getElementById("home-showcase") : null;
      const covered = hits(card.getBoundingClientRect()) || (!!showcase && hits(showcase.getBoundingClientRect()));
      if (covered) root.setAttribute("data-compose-covered", ""); else root.removeAttribute("data-compose-covered");
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(check); };
    /* 상담 단추는 화면이 붙은 뒤 조금 늦게 그려진다 — 몇 번 더 잰다 */
    const timers = [0, 400, 1500, 4000].map(ms => window.setTimeout(schedule, ms));
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      timers.forEach(id => window.clearTimeout(id));
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      root.removeAttribute("data-compose-covered");
    };
  }, []);

  /*
   * 휴대폰(480px 이하)에서는 아래로 읽어 내려가는 동안 상담 단추를 비켜 둔다 — 아래 구간 카드 글의 끝 글자를 덮었다(점검 r36, 360px).
   * 조금이라도 위로 올리거나 첫 화면 근처로 돌아오면 다시 보인다. 표시는 html 의 data-support-tucked 로(globals.css — 키보드로 닿으면 보인다).
   */
  useEffect(() => {
    const root = document.documentElement;
    const narrow = window.matchMedia("(max-width: 480px)");
    let last = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const moved = y - last;
      if (!narrow.matches || y < window.innerHeight * 0.6) root.removeAttribute("data-support-tucked");
      else if (moved > 8) root.setAttribute("data-support-tucked", "");
      else if (moved < -8) root.removeAttribute("data-support-tucked");
      /* 아주 조금 움직인 것은 모아 두었다가 함께 본다 */
      else return;
      last = y;
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    window.addEventListener("scroll", schedule, { passive: true });
    narrow.addEventListener("change", schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      narrow.removeEventListener("change", schedule);
      root.removeAttribute("data-support-tucked");
    };
  }, []);

  /* 다른 탭 사진을 미리 받아 둔다 — 바꾸는 순간 빈 칸이 보이지 않게. 휴대폰 너비에서는 보이는 휴대폰 화면만 받는다 */
  useEffect(() => {
    if (!mounted) return;
    const id = window.setTimeout(() => {
      const kinds: ShowcaseSlot[] = window.matchMedia("(max-width: 640px)").matches ? ["phone"] : SLOTS;
      for (const set of SHOWCASE.slice(1)) for (const kind of kinds) { const image = new Image(); image.src = set[kind].src; }
    }, 1200);
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
    if (reduced) { setSlots(SLOTS.map(() => ({ set: next, phase: "hold" }))); return; }
    const setSlot = (index: number, patch: Partial<Slot>) => setSlots(current => current.map((slot, k) => k === index ? { ...slot, ...patch } : slot));
    SLOTS.forEach((_, index) => {
      const at = index * 90;
      later(at, () => setSlot(index, { phase: "gone" }));
      later(at + 60, () => setSlot(index, { set: next, phase: "enter" }));
      later(at + 60 + 160, () => setSlot(index, { phase: "hold" }));
    });
  }, [later, reduced]);

  /*
   * 한 탭의 움직임(화면 안 내리기·당겨 보기·이름표)과 진행 막대는 같은 길이(ADVANCE_MS)의 CSS 움직임이고, 멈출 때는 함께 그 자리에 선다(animation-play-state).
   * 저절로 넘길 때는 진행 막대가 다 찬 순간(animationend) 다음 탭으로 — 시계를 따로 두지 않아 멈췄다 이어도 어긋나지 않는다.
   * 숨은 창에서는 브라우저가 움직임을 멈추므로 그동안 넘어가지도 않는다.
   */
  const moving = mounted && !reduced && !focused && !hovering && (playing || manual);
  const motion = !mounted ? "idle" : reduced ? "static" : moving ? "run" : "pause";
  const advance = () => { if (playing && !reduced) cutTo((tabRef.current + 1) % SHOWCASE.length); };
  const togglePlay = () => {
    if (playing) { setPlaying(false); setManual(false); return; }
    /* 직접 고른 탭을 보던 중이면 그 탭을 처음부터 다시 — 움직임과 진행 막대를 같이 시작한다 */
    if (manual) { setManual(false); setRun(value => value + 1); }
    setPlaying(true);
  };
  const hoverProps = { onPointerEnter: (event: PointerEvent) => { if (event.pointerType === "mouse") setHovering(true); }, onPointerLeave: () => setHovering(false) };

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

  const pickTab = (index: number) => { setPlaying(false); setManual(true); if (index === tabRef.current) setRun(value => value + 1); cutTo(index); };
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
      {titleLines.map((line, index) => <span key={index}>{accentLine(line, index === titleLines.findIndex(text => text.includes(ACCENT_WORD)))}{index < titleLines.length - 1 ? <br /> : null}</span>)}
    </h1>
    {hidden.includes("promptHome.subtitle") ? null : <p className={styles.subtitle} data-sc-field="promptHome.subtitle">{glueDots(subtitle)}</p>}

    <form ref={form} className={styles.card} aria-label="사업 아이디어로 대화 시작" onSubmit={event => { event.preventDefault(); submit(); }}>
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

    <div className={styles.tabsRow} {...hoverProps}>
      {/*
        * 알약 모양 탭(2026-10-23 사장님: base44 의 [괄호]·네모 점 말고 우리 모양으로) — 옅은 회색 통 안에서 고른 탭만 흰 알약으로 떠오른다.
        * 저절로 넘기는 동안에는 고른 알약 아래 얇은 막대가 7초에 걸쳐 차서 다음 탭까지 남은 시간을 보여 준다(멈추면 화면 안 움직임과 함께 그 자리에 선다).
        */}
      <div role="tablist" aria-label="만들어지는 결과물" className={styles.tabs}>
        {SHOWCASE.map((set, index) => <button
          key={set.label}
          type="button"
          role="tab"
          id={`home-showcase-tab-${index}`}
          aria-selected={index === tab}
          aria-controls="home-showcase"
          tabIndex={index === tab ? 0 : -1}
          className={styles.tab}
          onClick={() => pickTab(index)}
          onKeyDown={event => onTabKey(event, index)}
        >
          {/* 굵은 글자 폭을 늘 잡아 두어 고른 탭이 바뀌어도 탭 줄이 옆으로 밀리지 않는다 */}
          <span className={styles.tabText} data-text={set.label}>{set.label}</span>
          {index === tab && mounted && !reduced && !manual && <span key={`${tab}-${run}`} className={styles.progress} style={{ animationDuration: `${ADVANCE_MS}ms`, animationPlayState: moving ? "running" : "paused" }} onAnimationEnd={advance} aria-hidden="true" />}
        </button>)}
      </div>
      {/* 이름은 그대로 두고 눌림 상태(aria-pressed)만 바뀐다 — 이름까지 바뀌면 낭독기가 다른 단추로 읽었다 */}
      <button type="button" className={styles.play} aria-pressed={!playing} aria-label="예시 넘김 멈추기" title={playing ? "예시 넘김 멈추기" : "예시 넘김 다시 시작"} onClick={togglePlay}>
        {playing
          ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" /><rect x="14" y="5" width="4" height="14" /></svg>
          : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z" /></svg>}
      </button>
    </div>

    {/*
      * 컴퓨터: 큰 브라우저 틀(컴퓨터 화면) + 오른쪽 아래에 걸친 아이폰 틀(같은 탭의 휴대폰 화면). 휴대폰 너비: 아이폰 틀 한 장만 가운데 크게.
      * 자리는 보이는 칸의 비율(aspect-ratio)로 미리 잡아 두어 넘길 때도 움직이는 동안에도 아래가 밀리지 않는다.
      * 브라우저 틀 그림은 휴대폰 너비에서 숨겨지므로 늦게 받기(lazy) — 숨긴 그림은 받지 않는다.
      * data-motion: idle(화면이 붙기 전 — 맨 위) · run · pause(그 자리에 멈춤) · static(움직임 줄이기 — 맨 위 + 이름표).
      */}
    <div id="home-showcase" role="tabpanel" aria-labelledby={`home-showcase-tab-${tab}`} className={styles.showcase} {...hoverProps}>
      <div className={styles.stage} data-motion={motion}>
        {SLOTS.map((kind, index) => {
          const slot = slots[index];
          const set = SHOWCASE[slot.set];
          const view = <ShowcaseView key={`${slot.set}-${run}`} item={set[kind]} kind={kind} note={set.note} loading={kind === "phone" ? "eager" : "lazy"} />;
          if (kind === "phone") return <IphoneMockup key={kind} className={styles.phone} data-phase={slot.phase}>{view}</IphoneMockup>;
          return <figure key={kind} className={styles.browser} data-phase={slot.phase}>
            <span className={styles.browserBar} aria-hidden="true"><i /><i /><i /></span>
            <div className={styles.browserView}>{view}</div>
          </figure>;
        })}
      </div>
    </div>
  </section>;
}
