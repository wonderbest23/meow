"use client";

import { ArrowRight, MessageCircle } from "lucide-react";
import type { ReactNode } from "react";
import { kitPieces, revealProps, useKitMotion, type BusinessDesignProps } from "./brainwave-business-pieces";
import motion from "./brainwave-business-motion.module.css";
import styles from "./brainwave-business-consult.module.css";

/*
 * 08 Consultation(상담 서비스) — 사업 내용을 넣은 페이지.
 *
 * 예전에는 킷을 절대좌표 그대로 그리다가, 글이 조금만 길어지거나 사진을 바꾸면
 * 넘침을 막으려고 흰 바탕에 글만 늘어놓은 간이 화면으로 바꿨다. 실제 사업 문구는
 * 거의 다 그 기준을 넘어서, 손님은 늘 간이 화면만 봤다.
 *
 * 여기서는 Figma 의 색·글자 크기·간격·배경을 그대로 가져오되 좌표 대신 흐름으로
 * 쌓는다. 글이 길면 칸이 같이 늘어나므로 간이 화면으로 물러날 일이 없다.
 * 글·사진·버튼은 킷과 같은 노드 id 로 읽고 쓴다 — 편집기에서 누르면 그 자리가 고쳐진다.
 */


const HERO = "0:409";
const FACTS = "0:398";
const SERVICES = "0:366";
const DETAILS = "0:332";
const ALERT = "0:327";
const CONTACT = "0:297";
const STEPS = [["0:340", "0:337", "0:336"], ["0:346", "0:343", "0:342"], ["0:352", "0:349", "0:348"]] as const;
const STATS = [["0:400", "0:401"], ["0:403", "0:404"], ["0:406", "0:407"]] as const;
const SERVICE_CARDS = [["0:372/0", "0:373"], ["0:379/0", "0:380"], ["0:386/0", "0:387"], ["0:393/0", "0:394"]] as const;
const DRAWN = [HERO, FACTS, SERVICES, DETAILS, ALERT, CONTACT];

export function BusinessConsult0_290({ overrides, hidden, sectionOrder, onPick, desktop = false }: BusinessDesignProps) {
  const motionRef = useKitMotion(!onPick);
  const { text, photo, Text, Button, Photo, PhotoSlot, ordered } = kitPieces({ overrides, hidden, sectionOrder, onPick }, { button: styles.button, photoSlot: styles.photoSlot });

  const sections: Record<string, () => ReactNode> = {
    [HERO]: () => {
      const url = photo("0:411/0");
      return <section key={HERO} data-bw-node={HERO} className={`${styles.hero} ${url ? styles.heroPhoto : ""}`} data-scroll>
        {url ? Photo({ id: "0:411/0", url: url, className: styles.heroImage, kenburns: true }) : null}
        <div className={styles.heroShade} aria-hidden />
        <header className={styles.nav}>
          {Text({ id: "0:418", as: "strong", className: styles.brand })}
          {Button({ buttonId: "0:420", textId: "I0:420;0:4613", className: styles.navButton })}
        </header>
        <div className={styles.heroCopy}>
          {Text({ id: "0:414", as: "h1", reveal: { order: 0, kind: "title" } })}
          {Text({ id: "0:415", className: styles.heroLead, reveal: 2 })}
          {Button({ buttonId: "0:416", textId: "I0:416;0:4460", reveal: 4 })}
        </div>
        {!url ? PhotoSlot({ id: "0:411/0", className: styles.heroSlot }) : null}
      </section>;
    },
    [FACTS]: () => {
      const stats = STATS.filter(([value]) => text(value));
      if (!stats.length) return null;
      return <section key={FACTS} data-bw-node={FACTS} className={styles.stats}>
        {stats.map(([value, label]) => <div key={value} className={styles.stat}>{Text({ id: value, as: "strong" })}{Text({ id: label })}</div>)}
      </section>;
    },
    [SERVICES]: () => {
      const cards = SERVICE_CARDS.filter(([, name]) => text(name));
      if (!cards.length && !text("0:397")) return null;
      return <section key={SERVICES} data-bw-node={SERVICES} className={styles.band}>
        <div className={styles.head}>{Text({ id: "0:397", as: "h2" })}{Text({ id: "0:396", className: styles.lead })}</div>
        <div className={styles.cards}>
          {cards.map(([imageId, name]) => {
            const url = photo(imageId);
            return <article key={name} className={styles.card}>
              {url ? Photo({ id: imageId, url: url, className: styles.cardImage }) : PhotoSlot({ id: imageId, className: styles.cardSlot })}
              <div className={styles.cardName}>{Text({ id: name, as: "strong" })}<ArrowRight size={16} aria-hidden /></div>
            </article>;
          })}
        </div>
      </section>;
    },
    [DETAILS]: () => {
      const steps = STEPS.filter(([, title, body]) => text(title) || text(body));
      if (!steps.length && !text("0:365")) return null;
      const url = photo("0:357/0/0");
      /* 소개 문장이 첫 항목과 같으면(대표 상품을 두 번 적은 셈) 한 번만 */
      const intro = text("0:364") && !steps.some(([, , body]) => text(body) === text("0:364"));
      return <section key={DETAILS} data-bw-node={DETAILS} className={`${styles.band} ${styles.soft}`}>
        <div className={styles.head}>{Text({ id: "0:365", as: "h2", reveal: 0 })}{intro ? Text({ id: "0:364", className: styles.lead }) : null}</div>
        <div className={`${styles.why} ${url || onPick ? styles.whyWithPhoto : ""}`}>
          {url ? Photo({ id: "0:357/0/0", url: url, className: styles.whyImage }) : PhotoSlot({ id: "0:357/0/0", className: styles.whySlot })}
          <ol className={styles.steps}>
            {steps.map(([, title, body], index) => <li key={title} className={styles.step} {...revealProps(index)}>
              <span className={styles.stepNumber} aria-hidden>{index + 1}</span>
              <div>{Text({ id: title, as: "h3" })}{Text({ id: body })}</div>
            </li>)}
          </ol>
        </div>
      </section>;
    },
    [ALERT]: () => {
      if (!text("0:329/0") && !text("0:329/1")) return null;
      return <section key={ALERT} data-bw-node={ALERT} className={styles.alert}>
        <p>{Text({ id: "I0:330;0:4592", as: "span", className: styles.pill })} {Text({ id: "0:329/0", as: "span" })}{Text({ id: "0:329/1", as: "strong" })}</p>
      </section>;
    },
    [CONTACT]: () => {
      if (!text("0:309")) return null;
      return <section key={CONTACT} data-bw-node={CONTACT} className={styles.contact}>
        <div className={styles.contactCopy}>
          <span className={styles.contactIcon} aria-hidden><MessageCircle size={22} /></span>
          {Text({ id: "0:309", as: "h2", reveal: { order: 0, kind: "title" } })}
          {Text({ id: "0:308", className: styles.contactLead })}
        </div>
        {Button({ buttonId: "0:302", textId: "I0:302;0:4557", className: styles.contactButton, reveal: 2 })}
      </section>;
    },
  };

  return <div ref={motionRef} data-own-motion className={`bwmob ${styles.page} ${motion.motion} ${desktop ? styles.desktop : ""}`}>
    {ordered(sectionOrder, DRAWN).map(id => sections[id]())}
  </div>;
}
