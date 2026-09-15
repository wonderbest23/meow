"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Check, FileText, LockKeyhole, Monitor, Pencil, Save, Type } from "lucide-react";
import { BrainwavePage } from "./brainwave-page";
import { KO_0_2226 } from "../lib/landing/brainwave/ko/0-2226";
import { websiteSceneFrame } from "../lib/home-sequence-motion";
import styles from "./home-website-demo.module.css";

const steps = ["초안 만들기", "문구 다듬기", "미리보기"];
const descriptions = ["계획서에 담긴 사업이 한 페이지로", "첫 문장을 내 사업에 더 가깝게", "바뀐 내용을 화면에서 바로 확인해요"];
const noop = () => {};

const WebsitePreview = memo(function WebsitePreview({ edited }: { edited: boolean }) {
  const overrides = useMemo(() => ({ texts: {
    ...KO_0_2226(),
    "0:2376/0": edited ? "기다림 없는 출근길" : "새벽 5시에 문을 여는",
    "0:2376/1": edited ? "나의 아침 커피" : "동네 커피 스탠드",
    "I0:2373;0:4738": "합정역점",
    "I0:2374;0:4738": "픽업 시간",
    "I0:2372;0:4557": "메뉴 보기",
  } }), [edited]);
  return <BrainwavePage pageId="0-2226" overrides={overrides} onPick={noop} />;
});

export function HomeWebsiteDemo() {
  const root = useRef<HTMLDivElement>(null);
  const seek = useRef<(progress: number) => void>(noop);
  const [renderPreview, setRenderPreview] = useState(false);
  const [view, setView] = useState({ step: 2, edited: true });
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const stage = element.querySelector<HTMLElement>("[data-website-stage]")!;
    const slider = element.querySelector<HTMLInputElement>('input[type="range"]')!;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let manual: number | null = null;
    const draw = () => {
      raf = 0;
      const pinned = !reduced.matches && innerHeight >= 680;
      element.dataset.motion = pinned ? "on" : "off";
      slider.disabled = reduced.matches;
      const distance = element.offsetHeight - stage.offsetHeight;
      const native = (76 - element.getBoundingClientRect().top) / Math.max(1, distance);
      const frame = websiteSceneFrame(manual ?? (pinned ? native : 1), reduced.matches);
      element.dataset.step = String(frame.step);
      element.dataset.progress = frame.progress.toFixed(4);
      element.style.setProperty("--site-reveal", String(frame.reveal));
      element.style.setProperty("--site-record", String(frame.record));
      element.style.setProperty("--site-inspector", String(frame.inspector));
      element.style.setProperty("--site-highlight", String(frame.highlight));
      element.style.setProperty("--site-saved", String(frame.saved));
      element.style.setProperty("--site-turn", `${frame.turn}deg`);
      element.style.setProperty("--site-progress", `${frame.progress * 100}%`);
      slider.value = String(frame.progress * 100);
      slider.setAttribute("aria-valuetext", `${steps[frame.step]} ${frame.edited ? "수정한 문구" : "처음 만든 문구"}`);
      setView(previous => previous.step === frame.step && previous.edited === frame.edited ? previous : { step: frame.step, edited: frame.edited });
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };
    const resumeScroll = () => { manual = null; schedule(); };
    const pointer = (event: PointerEvent) => { if (event.target !== slider) resumeScroll(); };
    const keyboard = (event: KeyboardEvent) => {
      if (event.target !== slider && ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) resumeScroll();
    };
    seek.current = progress => { manual = progress; draw(); };
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      setRenderPreview(true);
      observer.disconnect();
    }, { rootMargin: "600px" });
    observer.observe(element);
    const resize = new ResizeObserver(schedule);
    resize.observe(stage);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("wheel", resumeScroll, { passive: true });
    window.addEventListener("touchmove", resumeScroll, { passive: true });
    window.addEventListener("pointerdown", pointer);
    window.addEventListener("keydown", keyboard);
    window.addEventListener("resize", schedule);
    reduced.addEventListener("change", schedule);
    draw();
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("wheel", resumeScroll);
      window.removeEventListener("touchmove", resumeScroll);
      window.removeEventListener("pointerdown", pointer);
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("resize", schedule);
      reduced.removeEventListener("change", schedule);
      seek.current = noop;
    };
  }, []);
  return <div className={styles.demo} ref={root} id="website-preview" aria-label="홈페이지 초안과 편집 과정 예시">
    <div className={styles.stage} data-website-stage>
      <ol className={styles.steps}>{steps.map((step, index) => <li key={step} aria-current={view.step === index ? "step" : undefined}><span>{String(index + 1).padStart(2, "0")}</span>{step}</li>)}</ol>
      <div className={styles.caption}>{descriptions.map((text, index) => <p key={text} aria-hidden={view.step !== index}>{text}</p>)}</div>
      <div className={styles.composition} aria-hidden="true" inert>
        <div className={styles.browser}>
          <div className={styles.toolbar}><span className={styles.dots}><i /><i /><i /></span><span className={styles.address}><LockKeyhole />새벽커피 홈페이지</span><Monitor /></div>
          <div className={styles.editorBar}><strong>내 사업 홈페이지</strong><span><Pencil />에디터</span><span className={styles.saved}><Check />수정 반영</span></div>
          <div className={styles.canvas}>
            <div className={styles.page}>
              {renderPreview ? <WebsitePreview edited={view.edited} /> : <img className={styles.fallback} src="/brainwave/thumbs/0-2226.jpg" width="640" height="560" loading="lazy" alt="" />}
            </div>
            <div className={styles.buildMask}><span>새벽커피</span><i /><i /><i /></div>
          </div>
        </div>
        <div className={styles.record}>
          <span className={styles.recordLabel}><FileText />사업계획서</span>
          <strong>새벽커피</strong>
          <dl><div><dt>고객</dt><dd>출근길 직장인</dd></div><div><dt>상품</dt><dd>사전 주문 픽업 커피</dd></div><div><dt>매장</dt><dd>서울 마포구 합정역</dd></div></dl>
          <div className={styles.recordProgress}><i /></div>
        </div>
        <div className={styles.inspector}>
          <div className={styles.inspectorTitle}><Type /><strong>문구 수정</strong><span>제목</span></div>
          <div className={styles.textField}>{view.edited ? <>기다림 없는 출근길<br />나의 아침 커피</> : <>새벽 5시에 문을 여는<br />동네 커피 스탠드</>}</div>
          <span className={styles.apply}><Save />{view.edited ? "수정한 문구 반영" : "내 문구로 다듬기"}</span>
        </div>
      </div>
      <div className={styles.footer}>
        <span>가상 사업의 편집 예시</span>
        <input type="range" min="0" max="100" step="0.1" defaultValue="100" aria-label="홈페이지 편집 미리보기 위치"
          onChange={event => seek.current(event.currentTarget.valueAsNumber / 100)}
          onKeyDown={event => {
            if (event.key !== "Home" && event.key !== "End") return;
            event.preventDefault();
            seek.current(event.key === "Home" ? 0 : 1);
          }} />
      </div>
    </div>
  </div>;
}
