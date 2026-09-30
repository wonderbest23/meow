"use client";

import { Check, Clock, MapPin, Navigation } from "lucide-react";
import type { ReactNode } from "react";
import { LOCAL_ADDRESS_PENDING, LOCAL_HOURS_PENDING } from "../lib/landing/brainwave/business-content";
import { kitPieces, revealProps, useKitMotion, type BusinessDesignProps } from "./brainwave-business-pieces";
import motion from "./brainwave-business-motion.module.css";
import styles from "./brainwave-business-local.module.css";

/*
 * 03 Coworking(동네 가게) — 카페·식당·미용실·필라테스처럼 손님이 찾아오는 가게.
 *
 * Figma 구성: 화면을 꽉 채운 매장 사진 위 큰 흰 제목과 보라 버튼 → 숫자 셋 띠 →
 * 사진 카드 셋 → 특징 → 사진과 글 → 어두운 안내 → 소식 띠. 손님이 먼저 찾는 것
 * (무엇을·얼마에·어디서·언제)이 차례로 나오게 칸의 역할만 바꿨다.
 */

const HERO = "0:2358";
const FACTS = "0:2347";
const MENU = "0:2322";
const FEATURES = "0:2283";
const STORY = "0:2309";
const VISIT = "0:2238";
const CLOSING = "0:2228";
const DRAWN = [HERO, FACTS, MENU, FEATURES, STORY, VISIT, CLOSING];
const NUMBERS = [["0:2349", "0:2350"], ["0:2352", "0:2353"], ["0:2355", "0:2356"]] as const;
const ITEMS = [["0:2324", "0:2325", "0:2329/0/0"], ["0:2331", "0:2332", "0:2336/0/0"], ["0:2338", "0:2339", "0:2343/0/0"]] as const;
const POINTS = [["0:2285", "0:2286"], ["0:2294", "0:2295"], ["0:2301", "0:2302"]] as const;

/** 지도 링크를 걸 만한 주소인지 — '문의 주시면…' 같은 안내 글에는 걸지 않는다 */
function mapUrl(address: string): string | null {
  const value = address.trim();
  if (!value || value === LOCAL_ADDRESS_PENDING || /문의|안내/.test(value)) return null;
  return `https://map.naver.com/p/search/${encodeURIComponent(value.split("\n")[0])}`;
}

export function BusinessLocal0_2226({ overrides, hidden, sectionOrder, onPick, desktop = false }: BusinessDesignProps) {
  const { text, photo, lines, Text, Button, Photo, PhotoSlot, ordered } = kitPieces({ overrides, hidden, sectionOrder, onPick }, { button: styles.button, photoSlot: styles.photoSlot });
  const motionRef = useKitMotion(!onPick);
  const address = hidden.has(VISIT) ? "" : text("0:2282");
  const hours = hidden.has(VISIT) ? "" : text("0:2268");
  const map = mapUrl(address);

  const sections: Record<string, () => ReactNode> = {
    [HERO]: () => {
      const url = photo("0:2362/0/0");
      // 첫 화면 아래 한 줄 — 영업시간·위치(적어 둔 것만). 누르면 오시는 길로 내려간다
      const chips = [
        hours && hours !== LOCAL_HOURS_PENDING ? { icon: <Clock size={15} aria-hidden />, label: hours.split("\n")[0] } : null,
        address && address !== LOCAL_ADDRESS_PENDING && map ? { icon: <MapPin size={15} aria-hidden />, label: address.split("\n")[0] } : null,
      ].filter(Boolean) as Array<{ icon: ReactNode; label: string }>;
      return <section key={HERO} data-bw-node={HERO} className={`${styles.hero} ${url ? styles.heroPhoto : ""}`} data-scroll>
        {url ? Photo({ id: "0:2362/0/0", url, className: styles.heroImage, kenburns: true }) : null}
        <div className={styles.heroShade} aria-hidden />
        <div className={styles.heroCopy}>
          {Text({ id: "0:2376/0", as: "h1", reveal: { order: 0, kind: "title" } })}
          {Text({ id: "0:2377", className: styles.heroLead, reveal: 2 })}
          {Button({ buttonId: "0:2372", textId: "I0:2372;0:4557", className: styles.heroButton, reveal: 3 })}
          {chips.length ? <a className={styles.chips} href={onPick ? undefined : "#visit"} {...revealProps(4)}>
            {chips.map(chip => <span key={chip.label}>{chip.icon}{chip.label}</span>)}
          </a> : null}
        </div>
        {!url ? PhotoSlot({ id: "0:2362/0/0", className: styles.heroSlot }) : null}
      </section>;
    },
    [FACTS]: () => {
      const numbers = NUMBERS.filter(([value]) => text(value));
      if (!numbers.length) return null;
      return <section key={FACTS} data-bw-node={FACTS} className={styles.facts}>
        {numbers.map(([value, label], index) => <div key={value} className={styles.fact} {...revealProps(index)}>
          {Text({ id: value, as: "strong" })}
          {Text({ id: label })}
        </div>)}
      </section>;
    },
    [MENU]: () => {
      const items = ITEMS.filter(([name]) => text(name));
      if (!items.length) return null;
      return <section key={MENU} data-bw-node={MENU} className={styles.menu}>
        <div className={styles.head}>
          {Text({ id: "0:2345", as: "h2", reveal: 0 })}
          {Text({ id: "0:2346", className: styles.lead, reveal: 1 })}
        </div>
        <div className={styles.items}>
          {items.map(([name, price, imageId], index) => {
            const url = photo(imageId);
            return <article key={name} className={styles.item} {...revealProps(index)}>
              <div className={styles.itemImage}>{url ? Photo({ id: imageId, url }) : PhotoSlot({ id: imageId })}</div>
              <div className={styles.itemBody}>
                {Text({ id: name, as: "h3" })}
                {Text({ id: price, as: "strong", className: styles.price })}
              </div>
            </article>;
          })}
        </div>
      </section>;
    },
    [FEATURES]: () => {
      const points = POINTS.filter(([title, body]) => text(title) || text(body));
      if (!points.length) return null;
      return <section key={FEATURES} data-bw-node={FEATURES} className={styles.points}>
        {points.map(([title, body], index) => <article key={title} className={styles.point} {...revealProps(index)}>
          <span className={styles.check} aria-hidden><Check size={18} /></span>
          <div>
            {Text({ id: title, as: "h3" })}
            {Text({ id: body })}
          </div>
        </article>)}
      </section>;
    },
    [STORY]: () => {
      if (!text("0:2312/0") && !text("0:2313")) return null;
      const first = photo("0:2317/0/0");
      const second = photo("0:2321/0/0");
      // 번호는 목록이 단다 — 글 앞의 '①'·'1.' 은 떼어 두 번 붙지 않게
      const steps = lines("0:2313").map(line => line.replace(/^(?:[\u2460-\u2473]|\d{1,2}[.)])\s*/, ""));
      return <section key={STORY} data-bw-node={STORY} className={styles.story}>
        <div className={styles.storyCopy}>
          <h2 {...revealProps(0)}>{Text({ id: "0:2312/0", as: "span" })} {Text({ id: "0:2312/1", as: "span" })}</h2>
          {/* 여러 줄(단계)이면 공개 화면에서 번호를 달아 한 줄씩 떠오른다 */}
          {steps.length > 1
            ? <ol className={styles.steps}>{steps.map((line, index) => <li key={index} {...revealProps(index + 1)}>{line}</li>)}</ol>
            : Text({ id: "0:2313", className: styles.lead, reveal: 1 })}
        </div>
        <div className={styles.storyPhotos} data-scroll>
          {first ? Photo({ id: "0:2317/0/0", url: first, className: styles.storyMain }) : PhotoSlot({ id: "0:2317/0/0", className: styles.storySlot })}
          {second ? Photo({ id: "0:2321/0/0", url: second, className: styles.storySub }) : null}
        </div>
      </section>;
    },
    [VISIT]: () => {
      if (!text("0:2281") && !address && !hours) return null;
      return <section key={VISIT} id={onPick ? undefined : "visit"} data-bw-node={VISIT} className={styles.visitWrap}>
        <div className={styles.visit}>
          {Text({ id: "0:2281", as: "h2", reveal: 0 })}
          <div className={styles.rows}>
            {address ? <div className={styles.row} {...revealProps(1)}>
              <MapPin size={20} aria-hidden />
              <div>
                {Text({ id: "0:2282" })}
                {map && !onPick ? <a className={styles.mapLink} href={map} target="_blank" rel="noreferrer"><Navigation size={14} aria-hidden /> 네이버 지도에서 보기</a> : null}
              </div>
            </div> : null}
            {hours ? <div className={styles.row} {...revealProps(2)}>
              <Clock size={20} aria-hidden />
              <div>
                {Text({ id: "0:2269", as: "strong" })}
                {Text({ id: "0:2268", className: styles.hours })}
              </div>
            </div> : null}
          </div>
        </div>
      </section>;
    },
    [CLOSING]: () => {
      if (!text("0:2237")) return null;
      return <section key={CLOSING} data-bw-node={CLOSING} className={styles.closingWrap}>
        <div className={styles.closing}>
          {Text({ id: "0:2237", as: "h2", reveal: { order: 0, kind: "title" } })}
          {Text({ id: "0:2235", className: styles.lead, reveal: 1 })}
          {Button({ buttonId: "0:2233", textId: "I0:2233;0:4557", className: styles.closingButton, reveal: 2 })}
        </div>
      </section>;
    },
  };

  return <div ref={motionRef} data-own-motion className={`bwmob ${styles.page} ${motion.motion} ${desktop ? styles.desktop : ""}`}>
    {/* 가게 이름 띠 — 킷에서는 첫 화면 칸에 있지만, 페이지 끝까지 위에 붙어 있도록 페이지 맨 앞에 둔다 */}
    {!hidden.has(HERO) ? <header className={styles.header}>{Text({ id: "0:2383", as: "strong", className: styles.brand })}</header> : null}
    {ordered(sectionOrder, DRAWN).map(id => sections[id]())}
  </div>;
}
