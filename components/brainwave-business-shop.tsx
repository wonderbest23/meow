"use client";

import { Quote } from "lucide-react";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { kitPieces, revealProps, useKitMotion, type BusinessDesignProps } from "./brainwave-business-pieces";
import motion from "./brainwave-business-motion.module.css";
import styles from "./brainwave-business-shop.module.css";

/*
 * 06 ECommerce(온라인 상점) — 사업 내용을 넣은 페이지.
 *
 * Figma 구성 그대로: 흰 머리글 → 둥근 사진 첫 화면(가운데 흰 큰 제목) → 첫 화면 아래에
 * 겹쳐 올라오는 카드 → 보라 띠 → 사진 위 마무리 문구와 초록 버튼. 좌표 대신 흐름으로
 * 쌓아서 글이 길어져도, 사장님 사진으로 바꿔도 이 모양이 유지된다.
 */

const HEADER = "0:1360";
const HERO = "0:1321";
const CATEGORY = "0:1329";
const ITEMS = "0:1150";
const CONTENT = "0:1137";
const REVIEW = "0:1112";
const CTA = "0:1104";
const DRAWN = [HEADER, HERO, CATEGORY, ITEMS, CONTENT, REVIEW, CTA];
const CARDS = [["0:1333", "0:1334", "0:1332/0/0"], ["0:1338", "0:1339", "0:1337/0/0"], ["0:1343", "0:1344", "0:1342/0/0"], ["0:1348", "0:1349", "0:1347/0/0"], ["0:1353", "0:1354", "0:1352/0/0"], ["0:1358", "0:1359", "0:1357/0/0"]] as const;
const PRODUCTS = [["0:1164", "0:1166", "0:1171/0/0"], ["0:1184", "0:1186", "0:1192/0/0"], ["0:1205", "0:1207", "0:1213/0/0"], ["0:1226", "0:1228", "0:1234/0/0"], ["0:1248", "0:1250", "0:1256/0/0"], ["0:1270", "0:1272", "0:1277/0/0"], ["0:1290", "0:1292", "0:1297/0/0"], ["0:1310", "0:1312", "0:1318/0/0"]] as const;

export function BusinessShop0_1102({ overrides, hidden, sectionOrder, onPick, desktop = false }: BusinessDesignProps) {
  const { text, photo, lines, Text, Button, Photo, PhotoSlot, ordered } = kitPieces({ overrides, hidden, sectionOrder, onPick }, { button: styles.button, photoSlot: styles.photoSlot });
  const motionRef = useKitMotion(!onPick);

  /* 가게 이름 첫 글자 — 머리글의 도장 모양 표시와 사진 없는 첫 화면의 큰 글자 장식에 같이 쓴다(로고 그림이 없어도 한 브랜드로 보이게) */
  const mark = [...text("0:1361").trim()][0] ?? "";
  /* 흐르는 띠 — 가게 이름과 한 줄 소개를 크게 흘린다(공개 화면만. 손님이 쓴 글만 쓰므로 어떤 업종에도 거짓이 없다) */
  const band = onPick ? [] : [text("0:1361"), text("0:1328")].map(value => value.split("\n")[0].trim()).filter(Boolean);

  /*
   * 마우스를 따라오는 것 두 가지(마우스가 있는 기기 · 공개 화면만):
   *  - 첫 화면 빛([data-glow]) — 마우스 자리에 은은한 빛
   *  - 카드 기울기([data-tilt]) — 마우스 쪽으로 살짝 기운다
   */
  useEffect(() => {
    const root = motionRef.current;
    if (!root || onPick || !window.matchMedia("(hover: hover) and (pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let tilted: HTMLElement | null = null;
    const flat = () => { tilted?.style.removeProperty("--rx"); tilted?.style.removeProperty("--ry"); tilted = null; };
    const move = (event: PointerEvent) => {
      const target = event.target as HTMLElement;
      const glow = target.closest<HTMLElement>("[data-glow]");
      if (glow) {
        const r = glow.getBoundingClientRect();
        glow.style.setProperty("--mx", `${(((event.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
        glow.style.setProperty("--my", `${(((event.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
      }
      const card = target.closest<HTMLElement>("[data-tilt]");
      if (card !== tilted) flat();
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--ry", `${(((event.clientX - r.left) / r.width - .5) * 9).toFixed(2)}deg`);
        card.style.setProperty("--rx", `${(((event.clientY - r.top) / r.height - .5) * -9).toFixed(2)}deg`);
        tilted = card;
      }
    };
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerleave", flat);
    return () => { root.removeEventListener("pointermove", move); root.removeEventListener("pointerleave", flat); flat(); };
  }, [motionRef, onPick]);

  const sections: Record<string, () => ReactNode> = {
    [HEADER]: () => <header key={HEADER} data-bw-node={HEADER} className={styles.header}>
      {mark ? <span className={styles.mark} aria-hidden>{mark}</span> : null}
      {Text({ id: "0:1361", as: "strong", className: styles.brand })}
    </header>,
    [HERO]: () => {
      const url = photo("0:1325/0/0");
      return <section key={HERO} data-bw-node={HERO} className={styles.heroWrap}>
        <div className={`${styles.hero} ${url ? styles.heroPhoto : ""}`} data-scroll data-glow="">
          {url ? Photo({ id: "0:1325/0/0", url, className: styles.heroImage, kenburns: true }) : null}
          <div className={styles.heroShade} aria-hidden />
          {/* 사진이 없을 때만 — 분위기 무늬와 가게 이름 첫 글자가 사진 자리를 채운다 */}
          {!url ? <div className={styles.aurora} aria-hidden><i /><i /><i /></div> : null}
          {!url ? <div className={styles.heroPattern} aria-hidden /> : null}
          {!url ? <div className={styles.heroGlow} aria-hidden /> : null}
          {/* 가게 이름 첫 글자를 여러 겹으로 쌓아 두께를 만든 입체 글자 — 스크롤하면 돈다(3D 모델 없이) */}
          {!url && mark ? <div className={styles.mark3d} aria-hidden><div className={styles.markSolid}>{Array.from({ length: 12 }, (_, k) => <span key={k} style={{ "--k": k } as CSSProperties}>{mark}</span>)}</div></div> : null}
          <div className={styles.heroCopy}>
            {Text({ id: "0:1327", as: "h1", reveal: { order: 0, kind: "title" } })}
            {Text({ id: "0:1328", className: styles.heroLead, reveal: 2 })}
            {/* 킷 첫 화면에는 버튼이 없다 — 마무리 칸의 문의 버튼을 첫 화면에도 둔다(같은 버튼이라 글·이동이 함께 바뀐다) */}
            {Button({ buttonId: "0:1110", textId: "I0:1110;0:4626", className: styles.heroButton, reveal: 4 })}
          </div>
          {!url ? PhotoSlot({ id: "0:1325/0/0", className: styles.heroSlot }) : null}
        </div>
      </section>;
    },
    [CATEGORY]: () => {
      const cards = CARDS.filter(([title, value]) => text(title) || text(value));
      if (!cards.length) return null;
      return <section key={CATEGORY} data-bw-node={CATEGORY} className={styles.cards} data-count={cards.length}>
        {cards.map(([title, value, imageId], index) => {
          const url = photo(imageId);
          return <article key={title} className={`${styles.card} ${url ? styles.cardWithPhoto : ""}`} {...revealProps(index % 3)} data-tilt="">
            {url ? Photo({ id: imageId, url, className: styles.cardImage }) : PhotoSlot({ id: imageId, className: styles.cardSlot })}
            <div className={styles.cardBody}>
              {Text({ id: title, as: "h3" })}
              {Text({ id: value })}
            </div>
          </article>;
        })}
      </section>;
    },
    [ITEMS]: () => {
      const items = PRODUCTS.filter(([name]) => text(name));
      if (!items.length) return null;
      return <section key={ITEMS} data-bw-node={ITEMS} className={styles.band}>
        {Text({ id: "0:1319", as: "h2", className: styles.bandTitle })}
        <div className={styles.products}>
          {items.map(([name, price, imageId]) => {
            const url = photo(imageId);
            return <article key={name} className={styles.product}>
              <div className={styles.productImage}>{url ? Photo({ id: imageId, url }) : PhotoSlot({ id: imageId })}</div>
              {Text({ id: price, as: "strong", className: styles.price })}
              {Text({ id: name, as: "h3" })}
            </article>;
          })}
        </div>
      </section>;
    },
    [CONTENT]: () => {
      if (!text("0:1141") && !text("0:1142")) return null;
      const url = photo("0:1146/0/0");
      const steps = lines("0:1142");
      /* 사진 없이 단계가 여럿이면 '붙어서 넘어가는 이용 순서' — 띠가 화면에 붙은 채 단계가 하나씩 밝아진다 */
      const story = !url && !onPick && steps.length > 1;
      return <section key={CONTENT} data-bw-node={CONTENT} className={styles.violetWrap}>
        {band.length ? <div className={styles.marquee} aria-hidden><div>{[0, 1].map(half => <span key={half}>{Array.from({ length: 4 }, () => band).flat().map((word, index) => <b key={index}>{word}</b>)}</span>)}</div></div> : null}
        <div className={story ? styles.story : undefined} data-scroll={story ? "" : undefined}>
        <div className={`${styles.violet} ${url || onPick ? styles.violetWithPhoto : ""}`} data-scroll={story ? undefined : ""}>
          {url ? <div className={styles.violetFrame} {...revealProps(0)}>{Photo({ id: "0:1146/0/0", url, className: styles.violetImage })}</div> : PhotoSlot({ id: "0:1146/0/0", className: styles.violetSlot })}
          <div className={styles.violetCopy}>
            {Text({ id: "0:1141", as: "h2", reveal: 1 })}
            {/* 여러 줄(단계)이면 공개 화면에서 한 줄씩 차례로 떠오른다 */}
            {steps.length > 1
              ? <ol className={styles.violetSteps} style={{ "--gap": (.5 / steps.length).toFixed(3) } as CSSProperties}>{steps.map((line, index) => <li key={index} data-reveal="" style={{ "--r": index + 2, "--i": index } as CSSProperties}>{line}</li>)}</ol>
              : Text({ id: "0:1142", className: styles.violetLead, reveal: 2 })}
            {Button({ buttonId: "0:1140", textId: "I0:1140;0:4572", className: styles.linkButton, reveal: steps.length + 2 })}
          </div>
        </div>
        </div>
      </section>;
    },
    [REVIEW]: () => {
      if (!text("0:1115")) return null;
      return <section key={REVIEW} data-bw-node={REVIEW} className={styles.reviewWrap}>
        <div className={styles.review}>
          <Quote className={styles.quoteMark} size={34} aria-hidden />
          {Text({ id: "0:1115", className: styles.quote })}
          <p className={styles.reviewer}>{Text({ id: "I0:1127;0:4621", as: "strong" })} {Text({ id: "I0:1127;0:4622", as: "span" })}</p>
        </div>
      </section>;
    },
    [CTA]: () => {
      if (!text("0:1111")) return null;
      const url = photo("0:1108/0/0");
      return <section key={CTA} data-bw-node={CTA} data-bw-closing="" className={styles.ctaWrap}>
        <div className={`${styles.cta} ${url ? styles.ctaPhoto : ""}`} data-scroll>
          {url ? Photo({ id: "0:1108/0/0", url, className: styles.ctaImage }) : null}
          <div className={styles.ctaShade} aria-hidden />
          <div className={styles.ctaCopy}>
            {Text({ id: "0:1111", as: "h2", reveal: { order: 0, kind: "title" } })}
            {Button({ buttonId: "0:1110", textId: "I0:1110;0:4626", className: styles.greenButton, reveal: 2 })}
            {/* 편집 화면에만 — 마무리 띠 사진이 비었을 때 넣을 곳 */}
            {!url ? PhotoSlot({ id: "0:1108/0/0", className: styles.ctaSlot }) : null}
          </div>
        </div>
      </section>;
    },
  };

  return <div ref={motionRef} data-own-motion className={`bwmob ${styles.page} ${motion.motion} ${desktop ? styles.desktop : ""}`}>
    {/* 읽은 만큼 차오르는 줄 — 브라우저 기본 스크롤 연동 애니메이션(지원하는 브라우저 · 공개 화면만) */}
    {!onPick ? <div className={styles.progress} aria-hidden /> : null}
    {ordered(sectionOrder, DRAWN).map(id => sections[id]())}
  </div>;
}
