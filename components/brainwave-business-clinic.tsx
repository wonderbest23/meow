"use client";

import { Clock, MapPin, Navigation, Stethoscope, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { CLINIC_HOURS_PENDING, LOCAL_ADDRESS_PENDING } from "../lib/landing/brainwave/business-content";
import { kitPieces, revealProps, useKitMotion, type BusinessDesignProps } from "./brainwave-business-pieces";
import motion from "./brainwave-business-motion.module.css";
import styles from "./brainwave-business-clinic.module.css";

/*
 * 02 SaaS 킷 → 병원·클리닉. 병원·치과·한의원·약국·재활처럼 환자가 찾아오는 곳.
 *
 * 환자가 먼저 찾는 것: 무엇을 진료하는지 → 언제 여는지 → 어디인지 → 어떻게 예약하는지.
 * 킷의 차분한 흰 바탕·둥근 카드를 살리고, 색은 신뢰감 있는 청록으로 바꿨다.
 * 의료진은 AI 가 지어낼 수 없어 처음엔 숨겨 두고, 편집기에서 켜면 빈 칸에 안내 글이 보인다.
 */

const HEADER = "0:2551";
const HERO = "0:2540";
const FACTS = "0:2497";
const SERVICES = "0:2519";
const GALLERY = "0:2508";
const STEPS = "0:2470";
const DOCTORS = "0:2455";
const VISIT = "0:2393";
const FAQ = "0:2420";
const CLOSING = "0:2387";
const DRAWN = [HEADER, HERO, FACTS, SERVICES, GALLERY, STEPS, DOCTORS, VISIT, FAQ, CLOSING];
const NUMBERS = [["0:2499", "0:2500"], ["0:2502", "0:2503"], ["0:2505", "0:2506"]] as const;
const SERVICE_CARDS = [["0:2521", "0:2522"], ["0:2528", "0:2529"], ["0:2534", "0:2535"]] as const;
const GALLERY_PHOTOS = ["0:2515/0/0", "0:2516/0/0", "0:2517/0/0", "0:2518/0/0"] as const;
const STEP_ROWS = [["0:2477", "0:2474", "0:2473"], ["0:2483", "0:2480", "0:2479"], ["0:2489", "0:2486", "0:2485"]] as const;
const DOCTOR_CARDS = [
  { photo: "0:2459/0", name: "0:2461", role: "0:2460", title: "0:2462", body: "0:2458" },
  { photo: "0:2465/0", name: "0:2467", role: "0:2466", title: "0:2468", body: "0:2464" },
] as const;
const QUESTIONS = [["0:2422", "0:2423"], ["0:2431", "0:2432"], ["0:2439", "0:2440"], ["0:2447", "0:2448"]] as const;

/** '평일 09:00–18:00' → ['평일', '09:00–18:00'] — 숫자가 나오는 곳에서 나눈다. 못 나누면 한 줄 그대로 */
export function hoursRows(value: string): Array<[string, string]> {
  return value.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
    const hit = line.match(/^([^\d]+?)[\s:：]+(\d.*|휴진.*|휴무.*)$/);
    return hit ? [hit[1].trim(), hit[2].trim()] : ["", line];
  });
}

function mapUrl(address: string): string | null {
  const value = address.trim();
  if (!value || value === LOCAL_ADDRESS_PENDING || /문의|안내/.test(value)) return null;
  return `https://map.naver.com/p/search/${encodeURIComponent(value.split("\n")[0])}`;
}

export function BusinessClinic0_2385({ overrides, hidden, sectionOrder, onPick, desktop = false }: BusinessDesignProps) {
  const { text, photo, Text, Button, Photo, PhotoSlot, ordered } = kitPieces({ overrides, hidden, sectionOrder, onPick }, { button: styles.button, photoSlot: styles.photoSlot });
  const motionRef = useKitMotion(!onPick);
  const hours = hidden.has(VISIT) ? "" : text("0:2418");
  const address = hidden.has(VISIT) ? "" : text("0:2399");
  const map = mapUrl(address);
  const knownHours = hours && hours !== CLINIC_HOURS_PENDING ? hours : "";

  const sections: Record<string, () => ReactNode> = {
    [HEADER]: () => <header key={HEADER} data-bw-node={HEADER} className={styles.header}>
      {Text({ id: "0:2552", as: "strong", className: styles.brand })}
      {Button({ buttonId: "0:2554", textId: "I0:2554;0:4613", className: styles.headerButton })}
    </header>,
    [HERO]: () => {
      const url = photo("0:2550/0/0");
      const chips = [
        knownHours ? { icon: <Clock size={15} aria-hidden />, label: knownHours.split("\n")[0] } : null,
        map ? { icon: <MapPin size={15} aria-hidden />, label: address.split("\n")[0] } : null,
      ].filter(Boolean) as Array<{ icon: ReactNode; label: string }>;
      return <section key={HERO} data-bw-node={HERO} className={styles.hero}>
        <div className={styles.heroCopy}>
          {Text({ id: "0:2542", as: "h1", reveal: { order: 0, kind: "title" } })}
          {Text({ id: "0:2543", className: styles.heroLead, reveal: 1 })}
          {Button({ buttonId: "0:2544", textId: "I0:2546;0:4460", className: styles.button, reveal: 2 })}
          {chips.length ? <a className={styles.chips} href={onPick ? undefined : "#visit"} {...revealProps(3)}>
            {chips.map(chip => <span key={chip.label}>{chip.icon}{chip.label}</span>)}
          </a> : null}
        </div>
        <div className={styles.heroMedia} data-scroll>
          {url ? Photo({ id: "0:2550/0/0", url, className: styles.heroImage, kenburns: true }) : PhotoSlot({ id: "0:2550/0/0", className: styles.heroSlot })}
        </div>
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
    [SERVICES]: () => {
      const cards = SERVICE_CARDS.filter(([title, body]) => text(title) || text(body));
      if (!cards.length) return null;
      return <section key={SERVICES} data-bw-node={SERVICES} className={styles.services}>
        {cards.map(([title, body], index) => <article key={title} className={styles.service} {...revealProps(index)}>
          <span className={styles.serviceIcon} aria-hidden><Stethoscope size={20} /></span>
          {Text({ id: title, as: "h3" })}
          {Text({ id: body })}
        </article>)}
      </section>;
    },
    [GALLERY]: () => {
      const photos = GALLERY_PHOTOS.map(id => [id, photo(id)] as const).filter(([, url]) => url || onPick);
      if (!text("0:2512") && !text("0:2511") && !photos.some(([, url]) => url)) return null;
      return <section key={GALLERY} data-bw-node={GALLERY} className={styles.gallery}>
        <div className={styles.head}>
          {Text({ id: "0:2512", as: "h2", reveal: 0 })}
          {Text({ id: "0:2511", className: styles.lead, reveal: 1 })}
        </div>
        <div className={styles.photos} data-scroll>
          {photos.map(([id, url], index) => <div key={id} className={styles.photoCell} {...revealProps(index)}>
            {url ? Photo({ id, url }) : PhotoSlot({ id })}
          </div>)}
        </div>
      </section>;
    },
    [STEPS]: () => {
      const rows = STEP_ROWS.filter(([, title, body]) => text(title) || text(body));
      if (!rows.length) return null;
      const url = photo("0:2491/0/0");
      return <section key={STEPS} data-bw-node={STEPS} className={styles.steps}>
        <div className={styles.stepsCopy}>
          {Text({ id: "0:2496", as: "h2", reveal: 0 })}
          {Text({ id: "0:2495", className: styles.lead, reveal: 1 })}
          <ol className={styles.stepList}>
            {rows.map(([number, title, body], index) => <li key={title} {...revealProps(index + 2)}>
              <span className={styles.stepNumber} aria-hidden>{text(number) || index + 1}</span>
              <div>
                {Text({ id: title, as: "h3" })}
                {Text({ id: body })}
              </div>
            </li>)}
          </ol>
        </div>
        <div className={styles.stepsMedia} data-scroll>
          {url ? Photo({ id: "0:2491/0/0", url, className: styles.stepsImage }) : PhotoSlot({ id: "0:2491/0/0", className: styles.stepsSlot })}
        </div>
      </section>;
    },
    [DOCTORS]: () => {
      const cards = DOCTOR_CARDS.filter(card => onPick || text(card.name));
      if (!cards.length) return null;
      return <section key={DOCTORS} data-bw-node={DOCTORS} className={styles.doctors}>
        <p className={styles.eyebrow}>의료진</p>
        <div className={styles.doctorGrid}>
          {cards.map((card, index) => {
            // 예전에 만든 페이지는 대표 사진이 의료진 자리에도 복사돼 있다 — 사람 사진이 아니면 비운 자리로
            const raw = photo(card.photo);
            const url = raw && raw !== (overrides.images?.["0:2550/0/0"] ?? "") ? raw : "";
            return <article key={card.name} className={styles.doctor} {...revealProps(index)}>
              <div className={styles.doctorPhoto}>{url ? Photo({ id: card.photo, url }) : onPick ? PhotoSlot({ id: card.photo }) : <UserRound size={40} aria-hidden />}</div>
              <div className={styles.doctorBody}>
                {Text({ id: card.name, as: "h3", placeholder: "원장 이름" })}
                {Text({ id: card.role, className: styles.role, placeholder: "직함·전문 분야(예: 대표원장 · 치과보존과 전문의)" })}
                {Text({ id: card.title, as: "strong", className: styles.doctorTitle, placeholder: "한 줄 소개" })}
                {Text({ id: card.body, className: styles.doctorText, placeholder: "학력·경력·진료 철학" })}
              </div>
            </article>;
          })}
        </div>
      </section>;
    },
    [VISIT]: () => {
      if (!text("0:2419") && !hours && !address) return null;
      const rows = hoursRows(hours);
      return <section key={VISIT} id={onPick ? undefined : "visit"} data-bw-node={VISIT} className={styles.visitWrap}>
        <div className={styles.visit}>
          {Text({ id: "0:2419", as: "h2", reveal: 0 })}
          <div className={styles.visitGrid}>
            {hours ? <div className={styles.hoursCard} {...revealProps(1)}>
              <p className={styles.cardLabel}><Clock size={16} aria-hidden /> 진료 시간</p>
              {onPick || !knownHours
                ? Text({ id: "0:2418", className: styles.hoursText })
                : <table className={styles.hours}><tbody>{rows.map(([label, value], index) => <tr key={index}>{label ? <th scope="row">{label}</th> : null}<td colSpan={label ? 1 : 2}>{value}</td></tr>)}</tbody></table>}
            </div> : null}
            {address ? <div className={styles.addressCard} {...revealProps(2)}>
              <p className={styles.cardLabel}><MapPin size={16} aria-hidden /> 오시는 길</p>
              {Text({ id: "0:2399", className: styles.addressText })}
              {map && !onPick ? <a className={styles.mapLink} href={map} target="_blank" rel="noreferrer"><Navigation size={14} aria-hidden /> 네이버 지도에서 보기</a> : null}
            </div> : null}
          </div>
        </div>
      </section>;
    },
    [FAQ]: () => {
      const questions = QUESTIONS.filter(([question]) => text(question));
      if (!questions.length) return null;
      return <section key={FAQ} data-bw-node={FAQ} className={styles.faq}>
        {Text({ id: "0:2454/0", as: "h2", reveal: 0 })}
        <div className={styles.faqList}>
          {questions.map(([question, answer], index) => <details key={question} open={index === 0 || Boolean(onPick)} {...revealProps(index + 1)}>
            <summary>{Text({ id: question, as: "span" })}</summary>
            {Text({ id: answer })}
          </details>)}
        </div>
      </section>;
    },
    [CLOSING]: () => {
      if (!text("0:2390")) return null;
      return <section key={CLOSING} data-bw-node={CLOSING} className={styles.closingWrap}>
        <div className={styles.closing}>
          {Text({ id: "0:2390", as: "h2", reveal: { order: 0, kind: "title" } })}
          {Text({ id: "0:2389", className: styles.lead, reveal: 1 })}
          {Button({ buttonId: "0:2391", textId: "I0:2391;0:4460", className: styles.closingButton, reveal: 2 })}
        </div>
      </section>;
    },
  };

  return <div ref={motionRef} data-own-motion className={`bwmob ${styles.page} ${motion.motion} ${desktop ? styles.desktop : ""}`}>
    {ordered(sectionOrder, DRAWN).map(id => sections[id]())}
  </div>;
}
