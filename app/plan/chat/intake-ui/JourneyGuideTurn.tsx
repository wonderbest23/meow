"use client";

import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import styles from "../intake.module.css";
import { ChatSpeaker } from "./IntakePanels";
import type { JourneyGuide } from "../../../../lib/plan-builder/journey-guides";

/*
 * 단계별 대화 세트의 첫 안내 말풍선과 다음 할 일 단추(journey-guides.ts) — 주소에 guide= 가 있으면 대화 맨 아래에 붙는다.
 * 고정 문구라 AI 를 부르지 않고, 대화 기록에 저장하지 않는다(화면에만). 단추는 주소 링크 — 작업실이 같은 사업 주소를 탭 바꾸기로 바꾼다.
 */
export function JourneyGuideTurn({ guide }: { guide: JourneyGuide }) {
  return <section className={styles.assistantMessage} aria-label="다음 단계 안내" data-journey-guide={guide.code}>
    <ChatSpeaker />
    <p>{guide.message}</p>
    {guide.actions.length > 0 && <div className={`${styles.studioSuggest} ${styles.guideActions}`}>
      {guide.actions.map(action => action.external
        ? <a key={action.label} className={styles.chip} href={action.href} target="_blank" rel="noopener noreferrer">{action.label}<ExternalLink size={14} aria-hidden="true" /><span className={styles.srOnly}> (새 창)</span></a>
        : <Link key={action.label} className={styles.chip} href={action.href}>{action.label}<ChevronRight size={16} aria-hidden="true" /></Link>)}
    </div>}
  </section>;
}
