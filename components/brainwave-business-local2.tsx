"use client";

import { ChevronDown, Clock, MapPin, Navigation, Phone, Quote } from "lucide-react";
import type { ReactNode } from "react";
import { LOCAL_ADDRESS_PENDING, LOCAL_HOURS_PENDING } from "../lib/landing/brainwave/business-content";
import { mapUrl } from "./brainwave-business-local";
import { kitPieces, revealProps, useKitMotion, type BusinessDesignProps } from "./brainwave-business-pieces";
import motion from "./brainwave-business-motion.module.css";
import styles from "./brainwave-business-local2.module.css";

/*
 * 동네 가게 2(1-2226) — 킷 디자인이 아니라 직접 짠 화면. 동네 가게(0-2226)와 같은 손님 순서(무엇을·얼마에·어디서·언제)에
 * AI 가 쓴 글이 빠짐없이 보이도록 칸을 늘렸다: 소개 카드 여섯, 줄 메뉴 여섯, 사진 모음, 자주 묻는 질문 넷, 후기.
 * 구성은 HyperUI·Tailblocks·Meraki UI 블록(MIT, THIRD_PARTY_NOTICES.md)을 참고해 이 서비스의 색 변수로 다시 썼다.
 * 글·사진 자리는 '1:번호' — 제목·내용처럼 짝인 칸은 번호가 나란하다(lib/landing/ai-fill.ts copyNodes 와 같은 번호).
 */

const HERO = "1:10";
const FACTS = "1:20";
const CARDS = "1:30";
const MENU = "1:50";
const GALLERY = "1:70";
const STEPS = "1:80";
const FAQ = "1:90";
const REVIEWS = "1:100";
const VISIT = "1:110";
const CLOSING = "1:120";
const DRAWN = [HERO, FACTS, CARDS, MENU, GALLERY, STEPS, FAQ, REVIEWS, VISIT, CLOSING];
const pairs = (first: number, count: number) => Array.from({ length: count }, (_, index) => [`1:${first + index * 2}`, `1:${first + index * 2 + 1}`] as const);
const NUMBERS = pairs(21, 3);
const CARD_SLOTS = pairs(33, 6);
const MENU_SLOTS = pairs(53, 6);
const MENU_PHOTOS = ["1:65", "1:66", "1:67"];
const GALLERY_PHOTOS = ["1:72", "1:73", "1:74", "1:75", "1:76"];
const QUESTIONS = pairs(92, 4);
const REVIEW_SLOTS = [["1:102"], ["1:103"], ["1:104"]] as const;

export function BusinessLocalTwo1_2226({ overrides, hidden, sectionOrder, onPick, desktop = false }: BusinessDesignProps) {
  const { text, photo, lines, Text, Button, Photo, PhotoSlot, ordered } = kitPieces({ overrides, hidden, sectionOrder, onPick }, { button: styles.button, photoSlot: styles.photoSlot });
  const motionRef = useKitMotion(!onPick);
  const editing = Boolean(onPick);
  const address = hidden.has(VISIT) ? "" : text("1:112");
  const hours = hidden.has(VISIT) ? "" : text("1:114");
  const phone = hidden.has(VISIT) ? "" : text("1:115");
  const map = mapUrl(address);
  // 같은 사진은 먼저 물은 자리만 보인다 — 구역 순서를 바꿔도 첫 화면·메뉴 카드가 사진 모음보다 먼저 갖게 여기서 차례로 묻는다
  const heroUrl = photo("1:16");
  MENU_PHOTOS.forEach(photo);
  /* 공개 화면은 채운 칸만. 편집 화면은 그 뒤에 빈 칸 하나를 더 보여 줘 눌러서 늘리게 한다(따로 숨긴 칸은 빼고) */
  const open = (slots: ReadonlyArray<readonly string[]>) => {
    const next = slots.findIndex(ids => !ids.some(text) && !ids.some(id => hidden.has(id)));
    return slots.filter((ids, index) => ids.some(text) || (editing && index === next));
  };

  const sections: Record<string, () => ReactNode> = {
    [HERO]: () => {
      // 첫 화면 아래 한 줄 — 영업시간·위치(적어 둔 것만). 누르면 오시는 길로 내려간다
      const chips = [
        hours && hours !== LOCAL_HOURS_PENDING ? { icon: <Clock size={15} aria-hidden />, label: hours.split("\n")[0] } : null,
        address && address !== LOCAL_ADDRESS_PENDING && map ? { icon: <MapPin size={15} aria-hidden />, label: address.split("\n")[0] } : null,
      ].filter(Boolean) as Array<{ icon: ReactNode; label: string }>;
      return <section key={HERO} data-bw-node={HERO} className={styles.hero} data-scroll>
        <div className={styles.heroCopy}>
          {Text({ id: "1:12", as: "h1", reveal: { order: 0, kind: "title" } })}
          {Text({ id: "1:13", className: styles.heroLead, reveal: 1 })}
          {Button({ buttonId: "1:14", textId: "I1:14;1:15", className: styles.heroButton, reveal: 2 })}
          {chips.length ? <a className={styles.chips} href={onPick ? undefined : "#visit"} {...revealProps(3)}>
            {chips.map(chip => <span key={chip.label}>{chip.icon}{chip.label}</span>)}
          </a> : null}
        </div>
        {heroUrl ? <div className={styles.heroMedia}>{Photo({ id: "1:16", url: heroUrl, className: styles.heroImage, kenburns: true })}</div> : PhotoSlot({ id: "1:16", className: styles.heroSlot })}
      </section>;
    },
    [FACTS]: () => {
      const numbers = open(NUMBERS);
      if (!numbers.length) return null;
      return <section key={FACTS} data-bw-node={FACTS} className={styles.facts}>
        {numbers.map(([value, label], index) => <div key={value} className={styles.fact} {...revealProps(index)}>
          {Text({ id: value, as: "strong", placeholder: "숫자(예: 4명)" })}
          {Text({ id: label, placeholder: "숫자의 뜻(예: 한 수업 정원)" })}
        </div>)}
      </section>;
    },
    [CARDS]: () => {
      const cards = open(CARD_SLOTS);
      if (!cards.length && !text("1:31") && !text("1:32")) return null;
      return <section key={CARDS} data-bw-node={CARDS} className={styles.band}>
        <div className={styles.head}>
          {Text({ id: "1:31", as: "h2", reveal: 0, placeholder: "소개 제목" })}
          {Text({ id: "1:32", className: styles.lead, reveal: 1, placeholder: "소개 글" })}
        </div>
        <div className={styles.cards}>
          {cards.map(([title, body], index) => <article key={title} className={styles.card} {...revealProps(index % 3)}>
            {Text({ id: title, as: "h3", placeholder: "카드 제목" })}
            {Text({ id: body, placeholder: "카드 설명" })}
          </article>)}
        </div>
      </section>;
    },
    [MENU]: () => {
      const rows = open(MENU_SLOTS);
      if (!rows.length) return null;
      /*
       * 사진 카드는 앞의 세 메뉴 가운데 사진이 있는 것만(편집 화면은 사진 넣을 자리도). 이름·가격은 아래 줄 메뉴가 모두 보여 주고
       * 거기서 고친다 — 카드에도 같은 글 자리를 달면 편집기가 한 글을 두 곳에서 잡아, 카드 쪽은 글만 보여 준다.
       */
      const photoCards = MENU_SLOTS.slice(0, 3).map(([name, price], index) => ({ name, price, imageId: MENU_PHOTOS[index], url: photo(MENU_PHOTOS[index]) }))
        .filter(item => text(item.name) && (item.url || editing));
      return <section key={MENU} data-bw-node={MENU} className={`${styles.band} ${styles.tinted}`}>
        <div className={styles.head}>
          {Text({ id: "1:51", as: "h2", reveal: 0, placeholder: "메뉴·가격" })}
          {Text({ id: "1:52", className: styles.lead, reveal: 1, placeholder: "메뉴 소개" })}
        </div>
        {photoCards.length ? <div className={styles.items}>
          {photoCards.map(({ name, price, imageId, url }, index) => <article key={name} className={styles.item} {...revealProps(index)}>
            <div className={styles.itemImage}>{url ? Photo({ id: imageId, url }) : PhotoSlot({ id: imageId })}</div>
            <div className={styles.itemBody}><h3>{text(name)}</h3>{text(price) ? <strong>{text(price)}</strong> : null}</div>
          </article>)}
        </div> : null}
        <ul className={styles.rows}>
          {rows.map(([name, price]) => <li key={name} className={styles.row}>
            {Text({ id: name, as: "span", className: styles.rowName, placeholder: "메뉴 이름" })}
            <span className={styles.dots} aria-hidden />
            {Text({ id: price, as: "strong", className: styles.rowPrice, placeholder: "가격" })}
          </li>)}
        </ul>
      </section>;
    },
    [GALLERY]: () => {
      const shots = GALLERY_PHOTOS.map(id => ({ id, url: photo(id) })).filter(shot => shot.url);
      const slot = editing ? GALLERY_PHOTOS.find(id => !photo(id)) : undefined;
      if (!shots.length && !slot) return null;
      return <section key={GALLERY} data-bw-node={GALLERY} className={styles.band}>
        <div className={styles.head}>{Text({ id: "1:71", as: "h2", reveal: 0 })}</div>
        <div className={styles.shots}>
          {shots.map(({ id, url }, index) => <div key={id} className={styles.shot} {...revealProps(index % 3)}>{Photo({ id, url })}</div>)}
          {slot ? <div className={styles.shot}>{PhotoSlot({ id: slot })}</div> : null}
        </div>
      </section>;
    },
    [STEPS]: () => {
      if (!text("1:81") && !text("1:82") && !editing) return null;
      // 번호는 목록이 단다 — 글 앞의 '①'·'1.' 은 떼어 두 번 붙지 않게
      const steps = lines("1:82").map(line => line.replace(/^(?:[①-⑳]|\d{1,2}[.)])\s*/, ""));
      return <section key={STEPS} data-bw-node={STEPS} className={`${styles.band} ${styles.tinted}`}>
        <div className={styles.head}>{Text({ id: "1:81", as: "h2", reveal: 0, placeholder: "이용 순서" })}</div>
        {/* 여러 줄(단계)이면 공개 화면에서 번호를 달아 한 줄씩 떠오른다 */}
        {steps.length > 1
          ? <ol className={styles.steps}>{steps.map((line, index) => <li key={index} {...revealProps(index + 1)}>{line}</li>)}</ol>
          : Text({ id: "1:82", className: styles.stepText, reveal: 1, placeholder: "한 줄에 한 단계씩 적어 주세요" })}
      </section>;
    },
    [FAQ]: () => {
      const items = open(QUESTIONS);
      if (!items.length) return null;
      return <section key={FAQ} data-bw-node={FAQ} className={styles.band}>
        <div className={styles.head}>{Text({ id: "1:91", as: "h2", reveal: 0 })}</div>
        <div className={styles.questions}>
          {/* 편집 화면은 답도 바로 고치게 모두 펼쳐 두고, 질문을 눌러도 접히지 않게 한다 */}
          {items.map(([question, answer], index) => <details key={question} className={styles.question} open={editing || index === 0}>
            <summary onClickCapture={editing ? event => event.preventDefault() : undefined}>{Text({ id: question, as: "h3", placeholder: "질문" })}<ChevronDown size={18} aria-hidden /></summary>
            {Text({ id: answer, placeholder: "답" })}
          </details>)}
        </div>
      </section>;
    },
    [REVIEWS]: () => {
      const reviews = open(REVIEW_SLOTS);
      /* 후기가 아직 없을 때 — 안내 글 칸(1:105)에 글이 있으면 그 글만 보인다. 후기를 지어내지 않고 솔직한 빈 상태를 보이는 스위치다 */
      const none = !REVIEW_SLOTS.some(([id]) => text(id)) && (editing || text("1:105"));
      if (!reviews.length && !none) return null;
      return <section key={REVIEWS} data-bw-node={REVIEWS} className={`${styles.band} ${styles.tinted}`}>
        <div className={styles.head}>{Text({ id: "1:101", as: "h2", reveal: 0 })}</div>
        {reviews.length ? <div className={styles.reviews}>
          {reviews.map(([id], index) => <figure key={id} className={styles.review} {...revealProps(index)}>
            <Quote size={22} aria-hidden />
            {Text({ id, placeholder: "실제 손님이 남긴 후기를 적어 주세요" })}
          </figure>)}
        </div> : null}
        {none ? <div className={styles.noReviews}>{Text({ id: "1:105", placeholder: "후기가 아직 없으면 여기에 '아직 후기가 없어요'처럼 적어 주세요" })}</div> : null}
      </section>;
    },
    [VISIT]: () => {
      if (!text("1:111") && !address && !hours && !phone) return null;
      return <section key={VISIT} id={onPick ? undefined : "visit"} data-bw-node={VISIT} className={styles.visitWrap}>
        <div className={styles.visit}>
          {Text({ id: "1:111", as: "h2", reveal: 0 })}
          <div className={styles.visitRows}>
            {address ? <div className={styles.visitRow} {...revealProps(1)}>
              <MapPin size={20} aria-hidden />
              <div>
                <strong>주소</strong>
                {Text({ id: "1:112" })}
                {map && !onPick ? <a className={styles.pill} href={map} target="_blank" rel="noreferrer"><Navigation size={14} aria-hidden /> 네이버 지도에서 보기</a> : null}
              </div>
            </div> : null}
            {hours ? <div className={styles.visitRow} {...revealProps(2)}>
              <Clock size={20} aria-hidden />
              <div>
                {Text({ id: "1:113", as: "strong" })}
                {Text({ id: "1:114", className: styles.hours })}
              </div>
            </div> : null}
            {phone ? <div className={styles.visitRow} {...revealProps(3)}>
              <Phone size={20} aria-hidden />
              <div>
                <strong>전화</strong>
                {Text({ id: "1:115" })}
                {!onPick ? <a className={styles.pill} href={`tel:${phone.replace(/[^\d+]/g, "")}`}><Phone size={14} aria-hidden /> 전화 걸기</a> : null}
              </div>
            </div> : null}
          </div>
        </div>
      </section>;
    },
    [CLOSING]: () => {
      if (!text("1:121")) return null;
      return <section key={CLOSING} data-bw-node={CLOSING} data-bw-closing="" className={styles.closingWrap}>
        <div className={styles.closing}>
          {Text({ id: "1:121", as: "h2", reveal: { order: 0, kind: "title" } })}
          {Text({ id: "1:122", className: styles.lead, reveal: 1 })}
          {Button({ buttonId: "1:123", textId: "I1:123;1:124", className: styles.closingButton, reveal: 2 })}
        </div>
      </section>;
    },
  };

  return <div ref={motionRef} data-own-motion className={`bwmob ${styles.page} ${motion.motion} ${desktop ? styles.desktop : ""}`}>
    {/* 가게 이름 띠 — 페이지 끝까지 위에 붙어 있도록 페이지 맨 앞에 둔다(동네 가게와 같다) */}
    {!hidden.has(HERO) ? <header className={styles.header}>{Text({ id: "1:11", as: "strong", className: styles.brand })}</header> : null}
    {ordered(sectionOrder, DRAWN).map(id => sections[id]())}
  </div>;
}
