"use client";

import { Clock, MapPin, Navigation, Quote, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { LOCAL_ADDRESS_PENDING, LOCAL_HOURS_PENDING } from "../lib/landing/brainwave/business-content";
import { kitPieces, revealProps, useKitMotion, type BusinessDesignProps } from "./brainwave-business-pieces";
import motion from "./brainwave-business-motion.module.css";
import styles from "./brainwave-business-gallery.module.css";

/*
 * 07 Mobile App 킷 → 갤러리형. 인테리어·부동산·사진·웨딩·숙박처럼 사진이 곧 실력인 업종.
 *
 * 손님은 글보다 사진으로 고른다 — 첫 화면은 사진으로 꽉 채우고, 바로 아래 작업 사례를 격자로
 * 보여 준다(누르면 크게). 흑백에 가까운 차분한 색과 넓은 여백으로 사진이 주인공이 되게 했다.
 * 킷 맨 아래 칸에는 글이 든 버튼이 없어, 마무리는 첫 화면과 같은 문의 버튼을 한 번 더 쓴다.
 */

const HEADER = "0:1098";
const HERO = "0:968";
const WORKS = "0:767";
const SERVICES = "0:558";
const PROCESS = "0:743";
const PACKAGES = "0:461";
const REVIEWS = "0:611";
const STUDIO = "0:892";
const CLOSING = "0:422";
const DRAWN = [HEADER, HERO, WORKS, SERVICES, PROCESS, PACKAGES, REVIEWS, STUDIO, CLOSING];
const WORK_PHOTOS = ["0:875/0", "0:876/0", "0:877/0", "0:878/0", "0:879/0", "0:880/0", "0:881/0", "0:882/0"] as const;
const SERVICE_ITEMS = [["0:565", "0:566"], ["0:571", "0:572"], ["0:577", "0:578"], ["0:583", "0:584"], ["0:591", "0:592"], ["0:601", "0:602"]] as const;
const STEP_ROWS = [["0:752", "0:754", "0:753"], ["0:758", "0:760", "0:759"], ["0:764", "0:766", "0:765"]] as const;
const PACKAGE_ITEMS = [{ name: "0:531", price: "0:534/1", button: "0:535", text: "I0:535;0:4557" }, { name: "0:553", price: "0:556/1", button: "0:557", text: "I0:557;0:4557" }] as const;
const REVIEW_ITEMS = [["0:616/0", "0:615", "0:617"], ["0:621/0", "0:620", "0:622"], ["0:626/0", "0:625", "0:627"]] as const;

function mapUrl(address: string): string | null {
  const value = address.trim();
  if (!value || value === LOCAL_ADDRESS_PENDING || /문의|안내/.test(value)) return null;
  return `https://map.naver.com/p/search/${encodeURIComponent(value.split("\n")[0])}`;
}

export function BusinessGallery0_421({ overrides, hidden, sectionOrder, onPick, desktop = false }: BusinessDesignProps) {
  const { text, photo, lines, Text, Button, Photo, PhotoSlot, ordered } = kitPieces({ overrides, hidden, sectionOrder, onPick }, { button: styles.button, photoSlot: styles.photoSlot });
  const motionRef = useKitMotion(!onPick);
  // 작업 사례 크게 보기 — 공개 화면에서만(편집 화면에서 누르면 사진 바꾸기)
  const [viewing, setViewing] = useState<string | null>(null);
  useEffect(() => {
    if (!viewing) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setViewing(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [viewing]);
  const address = hidden.has(STUDIO) ? "" : text("0:895");
  const hours = hidden.has(STUDIO) ? "" : text("0:898");
  const map = mapUrl(address);

  const sections: Record<string, () => ReactNode> = {
    [HEADER]: () => <header key={HEADER} data-bw-node={HEADER} className={styles.header}>
      {Text({ id: "0:1099", as: "strong", className: styles.brand })}
      {Button({ buttonId: "0:1101", textId: "I0:1101;0:4613", className: styles.headerButton })}
    </header>,
    [HERO]: () => {
      const url = photo("0:1082/0/0");
      return <section key={HERO} data-bw-node={HERO} className={`${styles.hero} ${url ? styles.heroPhoto : ""}`} data-scroll>
        {url ? Photo({ id: "0:1082/0/0", url, className: styles.heroImage, kenburns: true }) : null}
        <div className={styles.heroShade} aria-hidden />
        <div className={styles.heroCopy}>
          {Text({ id: "0:1091", as: "h1", reveal: { order: 0, kind: "title" } })}
          {Text({ id: "0:1092", className: styles.heroLead, reveal: 1 })}
          {Button({ buttonId: "0:1090", textId: "I0:1090;0:4557", className: styles.heroButton, reveal: 2 })}
        </div>
        {!url ? PhotoSlot({ id: "0:1082/0/0", className: styles.heroSlot }) : null}
      </section>;
    },
    [WORKS]: () => {
      const photos = WORK_PHOTOS.map(id => [id, photo(id)] as const).filter(([, url]) => url);
      const slots = onPick ? WORK_PHOTOS.filter(id => !photo(id)).slice(0, Math.max(0, 4 - photos.length)) : [];
      if (!photos.length && !slots.length && !text("0:890")) return null;
      return <section key={WORKS} data-bw-node={WORKS} className={styles.works}>
        <div className={styles.head}>
          {Text({ id: "0:890", as: "h2", reveal: 0 })}
          {Text({ id: "0:891", className: styles.lead, reveal: 1 })}
        </div>
        <div className={styles.grid}>
          {photos.map(([id, url], index) => <figure key={id} className={styles.work} {...revealProps(index % 4)}>
            {onPick
              ? Photo({ id, url })
              : <button type="button" className={styles.workOpen} aria-label="크게 보기" onClick={() => setViewing(url)}>{Photo({ id, url })}</button>}
          </figure>)}
          {slots.map(id => <figure key={id} className={styles.work}>{PhotoSlot({ id })}</figure>)}
        </div>
      </section>;
    },
    [SERVICES]: () => {
      const items = SERVICE_ITEMS.filter(([title, body]) => text(title) || text(body));
      if (!items.length) return null;
      return <section key={SERVICES} data-bw-node={SERVICES} className={styles.services}>
        {Text({ id: "0:609/0", as: "h2", reveal: 0 })}
        <div className={styles.serviceList}>
          {items.map(([title, body], index) => <article key={title} className={styles.service} {...revealProps(index % 3 + 1)}>
            <span className={styles.serviceNumber} aria-hidden>{String(index + 1).padStart(2, "0")}</span>
            <div>
              {Text({ id: title, as: "h3" })}
              {Text({ id: body })}
            </div>
          </article>)}
        </div>
      </section>;
    },
    [PROCESS]: () => {
      const rows = STEP_ROWS.filter(([, title, body]) => text(title) || text(body));
      if (!rows.length) return null;
      return <section key={PROCESS} data-bw-node={PROCESS} className={styles.process}>
        <div className={styles.head}>
          {Text({ id: "0:745", as: "h2", reveal: 0 })}
          {Text({ id: "0:746", className: styles.lead, reveal: 1 })}
        </div>
        <ol className={styles.steps}>
          {rows.map(([number, title, body], index) => <li key={title} {...revealProps(index + 1)}>
            <span className={styles.stepNumber} aria-hidden>{text(number) || index + 1}</span>
            {Text({ id: title, as: "h3" })}
            {Text({ id: body })}
          </li>)}
        </ol>
      </section>;
    },
    [PACKAGES]: () => {
      const items = PACKAGE_ITEMS.filter(item => text(item.name));
      if (!items.length) return null;
      return <section key={PACKAGES} data-bw-node={PACKAGES} className={styles.packages}>
        <div className={styles.head}>
          {Text({ id: "0:512", as: "h2", reveal: 0 })}
          {Text({ id: "0:513", className: styles.lead, reveal: 1 })}
        </div>
        <div className={styles.packageList}>
          {items.map((item, index) => <article key={item.name} className={styles.package} {...revealProps(index + 1)}>
            {Text({ id: item.name, as: "h3" })}
            {Text({ id: item.price, as: "strong", className: styles.price })}
            {Button({ buttonId: item.button, textId: item.text, className: styles.packageButton })}
          </article>)}
        </div>
      </section>;
    },
    [REVIEWS]: () => {
      const items = REVIEW_ITEMS.filter(([, name, quote]) => onPick || (text(name) && text(quote)));
      if (!items.length) return null;
      return <section key={REVIEWS} data-bw-node={REVIEWS} className={styles.reviews}>
        <p className={styles.eyebrow}>손님 후기</p>
        <div className={styles.reviewList}>
          {items.map(([photoId, name, quote], index) => {
            const url = photo(photoId);
            return <figure key={name} className={styles.review} {...revealProps(index)}>
              <Quote className={styles.quoteMark} size={26} aria-hidden />
              {Text({ id: quote, as: "p", className: styles.quote, placeholder: "실제 손님이 남긴 후기를 적어 주세요" })}
              <figcaption>
                {url ? <span className={styles.avatar}>{Photo({ id: photoId, url })}</span> : onPick ? <span className={styles.avatar}>{PhotoSlot({ id: photoId })}</span> : null}
                {Text({ id: name, as: "strong", placeholder: "손님 이름(예: 김○○ 님)" })}
              </figcaption>
            </figure>;
          })}
        </div>
      </section>;
    },
    [STUDIO]: () => {
      if (!text("0:900") && !address && !hours) return null;
      const url = photo("0:958/0/0");
      return <section key={STUDIO} id={onPick ? undefined : "visit"} data-bw-node={STUDIO} className={styles.studio}>
        <div className={styles.studioMedia} data-scroll>
          {url ? Photo({ id: "0:958/0/0", url, className: styles.studioImage }) : PhotoSlot({ id: "0:958/0/0", className: styles.studioSlot })}
        </div>
        <div className={styles.studioCopy}>
          {Text({ id: "0:900", as: "h2", reveal: 0 })}
          {Text({ id: "0:901", className: styles.lead, reveal: 1 })}
          {address ? <div className={styles.row} {...revealProps(2)}>
            <MapPin size={18} aria-hidden />
            <div>
              {Text({ id: "0:896", as: "strong" })}
              {Text({ id: "0:895" })}
              {map && !onPick ? <a className={styles.mapLink} href={map} target="_blank" rel="noreferrer"><Navigation size={14} aria-hidden /> 네이버 지도에서 보기</a> : null}
            </div>
          </div> : null}
          {hours ? <div className={styles.row} {...revealProps(3)}>
            <Clock size={18} aria-hidden />
            <div>
              {Text({ id: "0:899", as: "strong" })}
              {lines("0:898").length > 1 && hours !== LOCAL_HOURS_PENDING ? <p className={styles.hours}>{lines("0:898").join("\n")}</p> : Text({ id: "0:898", className: styles.hours })}
            </div>
          </div> : null}
        </div>
      </section>;
    },
    [CLOSING]: () => {
      if (!text("0:436")) return null;
      const url = photo("0:434/0/0");
      return <section key={CLOSING} data-bw-node={CLOSING} className={`${styles.closing} ${url ? styles.closingPhoto : ""}`} data-scroll>
        {url ? Photo({ id: "0:434/0/0", url, className: styles.closingImage }) : null}
        <div className={styles.closingShade} aria-hidden />
        <div className={styles.closingCopy}>
          {Text({ id: "0:436", as: "h2", reveal: { order: 0, kind: "title" } })}
          {Text({ id: "0:457", className: styles.lead, reveal: 1 })}
          {/* 킷 맨 아래에는 글이 든 버튼이 없다 — 첫 화면의 문의 버튼을 한 번 더 둔다(글·이동이 함께 바뀐다) */}
          {Button({ buttonId: "0:1090", textId: "I0:1090;0:4557", className: styles.closingButton, reveal: 2 })}
        </div>
      </section>;
    },
  };

  return <div ref={motionRef} data-own-motion className={`bwmob ${styles.page} ${motion.motion} ${desktop ? styles.desktop : ""}`}>
    {ordered(sectionOrder, DRAWN).map(id => sections[id]())}
    {viewing ? <div className={styles.viewer} role="dialog" aria-modal="true" aria-label="사진 크게 보기" onClick={() => setViewing(null)}>
      <button type="button" className={styles.viewerClose} aria-label="닫기" onClick={() => setViewing(null)}><X size={22} /></button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={viewing.replace(/w=\d+/, "w=1800")} alt="" onClick={event => event.stopPropagation()} />
    </div> : null}
  </div>;
}
