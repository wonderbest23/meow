"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, List, LockKeyhole, MoreHorizontal, MousePointer2 } from "lucide-react";
import { WorkspaceDocumentStatus, WorkspaceIdentity, WorkspaceNavigation, WorkspaceSummary } from "../app/plan/workspace/WorkspaceContent";
import type { CoachField } from "../lib/plan-builder/coach";
import { DocumentChapterHeading, DocumentReadHeading, DocumentSectionHeading } from "../app/plan/document/DocumentReadContent";
import sample from "../public/home-media/results/workspace-sample.json";
import { WORKSPACE_DEMO_DURATION, WORKSPACE_DEMO_STEPS, workspaceDemoFrame } from "../lib/home-workspace-motion";
import workspace from "../app/plan/BusinessHub.module.css";
import theme from "./workspace-theme.module.css";
import documentStyles from "../app/plan/document/DocumentWorkspace.module.css";
import styles from "./home-workspace-demo.module.css";

const sampleFields: CoachField[] = sample.fields.map(field => ({ key: field.key as CoachField["key"], value: field.value, basis: "user", quote: field.value, messageId: "public-sample" }));

const noop = () => {};

export function HomeWorkspaceDemo({ previewProgress }: { previewProgress?: number } = {}) {
  const root = useRef<HTMLElement>(null);
  const seek = useRef<(value: number) => void>(noop);
  const held = useRef(false);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(() => workspaceDemoFrame(previewProgress ?? 0).step);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const frame = element.querySelector<HTMLElement>("[data-workspace-frame]")!;
    const screen = element.querySelector<HTMLElement>("[data-workspace-screen]")!;
    const slider = element.querySelector<HTMLInputElement>("input")!;
    let progress = previewProgress ?? (media.matches ? .42 : 0);
    let visible = false;
    let raf = 0;
    let last = 0;
    let active = -1;
    let disposed = false;
    let scale = 1;
    let nativeWidth = 480;
    let height = 500;
    const targets = { tabX: 300, tabY: 230, buttonX: 240, buttonY: 430, summaryPan: 100, documentsPan: 100 };

    function measure() {
      nativeWidth = frame.clientWidth < 400 ? 360 : 480;
      scale = frame.clientWidth / nativeWidth;
      height = frame.clientHeight / scale - 42;
      element!.style.setProperty("--demo-native-width", `${nativeWidth}px`);
      element!.style.setProperty("--demo-scale", String(scale));
      element!.style.setProperty("--demo-screen-height", `${height}px`);
      const tab = screen.querySelector<HTMLElement>("[data-workspace-documents]");
      const button = screen.querySelector<HTMLElement>("[data-workspace-open-document]");
      const facts = screen.querySelector<HTMLElement>("[data-workspace-facts]");
      // Offsets are measured in the unscaled app so cursor and camera share its coordinates.
      const position = (node: HTMLElement) => {
        let x = 0, y = 0;
        let current: HTMLElement | null = node;
        while (current && current !== screen) { x += current.offsetLeft; y += current.offsetTop; current = current.offsetParent as HTMLElement | null; }
        return { x: x + node.offsetWidth / 2, y: y + node.offsetHeight / 2 };
      };
      if (tab) { const point = position(tab); targets.tabX = point.x; targets.tabY = point.y; }
      if (button) { const point = position(button); targets.buttonX = point.x; targets.buttonY = point.y; targets.documentsPan = Math.max(0, point.y - height * .6); }
      if (facts) { const point = position(facts); targets.summaryPan = Math.max(0, point.y - height * .6); }
      draw();
    }

    function draw() {
      if (disposed) return;
      const state = workspaceDemoFrame(progress);
      if (state.step !== active) { active = state.step; setStep(active); }
      const pan = state.pan * (state.step === 0 ? targets.summaryPan : targets.documentsPan);
      const target = state.step === 0 ? { x: targets.tabX, y: targets.tabY } : { x: targets.buttonX, y: targets.buttonY - pan };
      element!.dataset.step = String(state.step);
      element!.dataset.progress = state.progress.toFixed(4);
      element!.dataset.running = String(visible && !document.hidden && !media.matches && !held.current && progress < 1 && previewProgress === undefined);
      element!.dataset.reducedMotion = String(media.matches);
      element!.style.setProperty("--demo-pan", `${-pan}px`);
      element!.style.setProperty("--demo-focus", String(state.focus));
      element!.style.setProperty("--demo-enter", String(state.entrance));
      element!.style.setProperty("--demo-open", String(state.reportOpen));
      element!.style.setProperty("--demo-report-pan", String(state.reportPan));
      element!.style.setProperty("--demo-click", String(state.click));
      element!.style.setProperty("--demo-pointer-opacity", String(state.cursorOpacity));
      const startX = nativeWidth * .84;
      element!.style.setProperty("--demo-pointer-x", `${startX + (target.x - startX) * state.cursorMove}px`);
      element!.style.setProperty("--demo-pointer-y", `${height - 36 + (target.y - height + 36) * state.cursorMove}px`);
      element!.style.setProperty("--demo-progress", `${state.progress * 100}%`);
      slider.value = String(state.progress * 100);
      slider.setAttribute("aria-valuetext", `${state.step + 1}단계 ${WORKSPACE_DEMO_STEPS[state.step]}`);
    }

    function tick(now: number) {
      raf = 0;
      if (disposed || !visible || document.hidden || media.matches || progress >= 1 || previewProgress !== undefined) { last = 0; return; }
      if (!held.current) progress = Math.min(1, progress + (last ? Math.min(now - last, 80) : 0) / WORKSPACE_DEMO_DURATION);
      last = now;
      draw();
      raf = requestAnimationFrame(tick);
    }
    function resume() {
      cancelAnimationFrame(raf); last = 0;
      if (visible && !document.hidden && !media.matches && progress < 1 && previewProgress === undefined) raf = requestAnimationFrame(tick);
      draw();
    }
    seek.current = value => { progress = Math.min(1, Math.max(0, value)); draw(); resume(); };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; resume(); }, { threshold: .3 });
    observer.observe(element);
    const resize = new ResizeObserver(measure);
    resize.observe(frame);
    screen.querySelectorAll("[data-workspace-page]").forEach(node => resize.observe(node));
    document.addEventListener("visibilitychange", resume);
    const reduce = () => { if (media.matches && progress === 0) progress = .42; resume(); };
    media.addEventListener("change", reduce);
    measure();
    setReady(true);
    return () => { disposed = true; cancelAnimationFrame(raf); observer.disconnect(); resize.disconnect(); document.removeEventListener("visibilitychange", resume); media.removeEventListener("change", reduce); seek.current = noop; };
  }, [previewProgress]);

  return <figure id="workspace-preview" className={styles.demo} ref={root} data-workspace-demo data-graphic="workspace" data-step={step} aria-label="내 사업 관리 사용 예시">
    <div className={styles.frame} data-workspace-frame aria-hidden="true" inert>
      <div className={`${styles.app} ${theme.tokens}`}>
        <div className={styles.browserBar}><span className={styles.browserDots}><i /><i /><i /></span><span><LockKeyhole size={11} />oneulstart.com</span><MoreHorizontal size={17} /></div>
        <div className={styles.screen} data-workspace-screen>
          <div className={styles.world}>
            <div className={styles.appHeader}><ChevronLeft size={24} /><div><strong>내 사업 관리</strong><span>오늘창업</span></div><img src="/today-startup-mark-2026.png" width="28" height="28" alt="" /></div>
            <div className={`${workspace.content} ${styles.content}`}>
              <WorkspaceIdentity title="새벽커피" status="문서 완성" />
              <WorkspaceNavigation view={step === 0 ? "summary" : "documents"} onChange={noop}><button>대화 이어가기</button></WorkspaceNavigation>
              <div className={styles.pages}>
                <section className={`${workspace.section} ${styles.summary}`} data-workspace-page>
                  <WorkspaceSummary description={sample.description} fields={sampleFields}>
                    <button className={workspace.primary}>대화로 수정하기</button>
                  </WorkspaceSummary>
                </section>
                <section className={`${workspace.section} ${styles.documents}`} data-workspace-page>
                  <h2>내 사업 자료</h2>
                  <WorkspaceDocumentStatus complete count={sample.count} total={sample.count} onOpen={noop} />
                  <button className={workspace.secondary}>자료를 더 다듬기</button>
                  <div className={workspace.nextStep}><span>계획 다음 단계</span><h3>내 사업의 시작 순서 정하기</h3><p>지금 선택한 사업의 상품·운영·홈페이지 준비를 이어가요.</p><button className={workspace.secondary}>준비 과정 이어가기</button></div>
                </section>
              </div>
            </div>
          </div>
          <div className={styles.pointer}><span /><MousePointer2 size={30} fill="#202632" stroke="#fff" strokeWidth={1.5} /></div>
          <div className={styles.report}>
            <div className={styles.reportToolbar}><ChevronLeft size={24} /><div><strong>사업계획서</strong><span>오늘창업</span></div><MoreHorizontal size={24} /></div>
            <div className={`${documentStyles.readingBar} ${styles.readingBar}`}><button className={documentStyles.tocToggle}><List size={19} />목차</button><span>1 / {sample.chapters}장</span><span className={documentStyles.mode}>예시 문서</span><button className={documentStyles.help}>문의</button></div>
            <div className={styles.reportPages}><article className={`${documentStyles.article} ${styles.reportReader}`}>
              <DocumentReadHeading title={sample.title} planType={sample.planType} isSample />
              <div className={documentStyles.chapter}>
                <DocumentChapterHeading number={1} title={sample.chapter} />
                <section className={documentStyles.section}><DocumentSectionHeading number="1.1" title={sample.section} /><div className={documentStyles.body}><div className="tiptap" contentEditable={false} dangerouslySetInnerHTML={{ __html: sample.html }} /></div></section>
              </div>
            </article></div>
            <footer className={`${documentStyles.actions} ${styles.readerActions}`}><button className={documentStyles.secondary} disabled>예시 · 읽기 전용</button><button className={documentStyles.primary}>내려받기</button></footer>
          </div>
        </div>
      </div>
    </div>
    <figcaption className={styles.caption}><span>{WORKSPACE_DEMO_STEPS[step]}</span><span>공개 샘플로 보는 이용 흐름</span></figcaption>
    <input className={styles.scrubber} type="range" min="0" max="100" step="0.1" defaultValue="0" disabled={!ready} aria-label="내 사업 관리 미리보기 재생 위치" onFocus={() => { held.current = true; }} onBlur={() => { held.current = false; }} onPointerDown={() => { held.current = true; }} onChange={event => seek.current(event.currentTarget.valueAsNumber / 100)} />
  </figure>;
}
