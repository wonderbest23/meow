"use client";

import { Quote } from "lucide-react";
import type { ReactNode } from "react";
import { kitPieces, type BusinessDesignProps } from "./brainwave-business-pieces";
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
  const { text, photo, Text, Button, Photo, PhotoSlot, ordered } = kitPieces({ overrides, hidden, sectionOrder, onPick }, { button: styles.button, photoSlot: styles.photoSlot });

  const sections: Record<string, () => ReactNode> = {
    [HEADER]: () => <header key={HEADER} data-bw-node={HEADER} className={styles.header}>{Text({ id: "0:1361", as: "strong", className: styles.brand })}</header>,
    [HERO]: () => {
      const url = photo("0:1325/0/0");
      return <section key={HERO} data-bw-node={HERO} className={styles.heroWrap}>
        <div className={`${styles.hero} ${url ? styles.heroPhoto : ""}`}>
          {url ? Photo({ id: "0:1325/0/0", url, className: styles.heroImage }) : null}
          <div className={styles.heroShade} aria-hidden />
          <div className={styles.heroCopy}>
            {Text({ id: "0:1327", as: "h1" })}
            {Text({ id: "0:1328", className: styles.heroLead })}
          </div>
          {!url ? PhotoSlot({ id: "0:1325/0/0", className: styles.heroSlot }) : null}
        </div>
      </section>;
    },
    [CATEGORY]: () => {
      const cards = CARDS.filter(([title, value]) => text(title) || text(value));
      if (!cards.length) return null;
      return <section key={CATEGORY} data-bw-node={CATEGORY} className={styles.cards}>
        {cards.map(([title, value, imageId]) => {
          const url = photo(imageId);
          return <article key={title} className={`${styles.card} ${url ? styles.cardWithPhoto : ""}`}>
            {url ? Photo({ id: imageId, url, className: styles.cardImage }) : null}
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
      return <section key={CONTENT} data-bw-node={CONTENT} className={styles.violetWrap}>
        <div className={`${styles.violet} ${url || onPick ? styles.violetWithPhoto : ""}`}>
          {url ? Photo({ id: "0:1146/0/0", url, className: styles.violetImage }) : PhotoSlot({ id: "0:1146/0/0", className: styles.violetSlot })}
          <div className={styles.violetCopy}>
            {Text({ id: "0:1141", as: "h2" })}
            {Text({ id: "0:1142", className: styles.violetLead })}
            {Button({ buttonId: "0:1140", textId: "I0:1140;0:4572", className: styles.linkButton })}
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
      return <section key={CTA} data-bw-node={CTA} className={styles.ctaWrap}>
        <div className={`${styles.cta} ${url ? styles.ctaPhoto : ""}`}>
          {url ? Photo({ id: "0:1108/0/0", url, className: styles.ctaImage }) : null}
          <div className={styles.ctaShade} aria-hidden />
          <div className={styles.ctaCopy}>
            {Text({ id: "0:1111", as: "h2" })}
            {Button({ buttonId: "0:1110", textId: "I0:1110;0:4626", className: styles.greenButton })}
          </div>
        </div>
      </section>;
    },
  };

  return <div className={`bwmob ${styles.page} ${desktop ? styles.desktop : ""}`}>
    {ordered(sectionOrder, DRAWN).map(id => sections[id]())}
  </div>;
}
