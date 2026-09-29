"use client";

import { ArrowRight, ImagePlus } from "lucide-react";
import { BUSINESS_TEMPLATE_PROFILES, businessTemplateManifest } from "../lib/landing/brainwave/business-content";
import { BusinessConsult0_290 } from "./brainwave-business-consult";
import { runBrainwaveButton } from "../lib/landing/brainwave/button-action";
import type { BrainwaveOverrides, BrainwavePick } from "./brainwave-page";
import styles from "./brainwave-business-mobile.module.css";

export function BrainwaveBusinessMobile({ pageId, overrides, hidden, sectionOrder, onPick, desktop = false }: {
  pageId: string;
  overrides: BrainwaveOverrides;
  hidden: Set<string>;
  sectionOrder: string[];
  onPick?: BrainwavePick;
  desktop?: boolean;
}) {
  // Figma 디자인을 옮겨 둔 템플릿은 그 화면으로 그린다
  if (pageId === "0-290") return <BusinessConsult0_290 overrides={overrides} hidden={hidden} sectionOrder={sectionOrder} onPick={onPick} desktop={desktop} />;
  const profile = BUSINESS_TEMPLATE_PROFILES[pageId];
  if (!profile) return null;
  const text = (id: string) => hidden.has(id) ? "" : overrides.texts?.[id] ?? "";
  const pick = (id: string) => onPick ? (event: React.MouseEvent<HTMLElement>) => { event.stopPropagation(); onPick("text", id, event.currentTarget); } : undefined;
  const props = (id: string, baseSize = 17) => ({ "data-bw-text": onPick ? id : undefined, onClick: pick(id), style: overrides.sizes?.[id] ? { fontSize: baseSize * overrides.sizes[id] } : undefined });
  const manifest = businessTemplateManifest[pageId];
  // Desktop headers overlay the hero; the mobile flow places that header before it.
  const sections = overrides.order?.length ? sectionOrder : sectionOrder.toSorted((a, b) => Number(manifest.sections.find(section => section.id === b)?.name === "Header") - Number(manifest.sections.find(section => section.id === a)?.name === "Header"));
  /*
   * 같은 사진은 페이지에 한 번만 — 사업 템플릿은 사진 자리마다 대표 사진 한 장을
   * 채우므로, 첫 화면에서 본 사진이 아래 칸에서 똑같이 한 번 더 나왔다.
   * 편집 화면에서는 각 자리를 눌러 바꿀 수 있어야 하므로 모두 보여 준다.
   */
  const pageImages = new Set<string>();
  return <div className={`bwmob ${styles.page} ${desktop ? styles.desktop : ""}`}>
    {sections.map(sectionId => {
      const section = manifest.sections.find(item => item.id === sectionId);
      if (!section || hidden.has(section.id)) return null;
      const hero = section.name === "Hero";
      const header = section.name === "Header";
      const facts = profile.facts.filter(fact => section.nodes.includes(fact.value) && text(fact.value));
      const factIds = new Set(profile.facts.flatMap(fact => [fact.label, fact.value]));
      const buttonTextIds = new Set(section.buttons.flatMap(button => button.texts));
      const seenText = new Set(facts.map(fact => text(fact.value)));
      const titles = Object.keys(profile.fields).filter(id => ["detailsTitle", "contactTitle"].includes(profile.fields[id]));
      /*
       * 상호(brand)는 큰 제목 위 작은 글씨다. 큰 제목이 상호와 같으면(예전 페이지)
       * 상호 줄을 빼고 큰 제목만 남긴다.
       */
      const brandIsHeadline = section.nodes.includes(profile.headline) && text(profile.headline) === text(profile.brand);
      const priority = [profile.brand, profile.headline, ...titles, profile.description];
      const textIds = [...new Set([...priority, ...manifest.texts])].filter(id => {
        const value = text(id);
        if (!section.nodes.includes(id) || !value || factIds.has(id) || buttonTextIds.has(id) || ["one", "two", "three"].includes(profile.fields[id])) return false;
        if (id === profile.brand && brandIsHeadline) return false;
        if (seenText.has(value)) return false;
        seenText.add(value);
        return true;
      });
      const seenImages = new Set<string>();
      const imageIds = section.images.filter(id => {
        const url = overrides.images?.[id];
        if (hidden.has(id) || !url || seenImages.has(url) || (!onPick && pageImages.has(url))) return false;
        seenImages.add(url);
        pageImages.add(url);
        return true;
      });
      const seenButtons = new Set<string>();
      const buttons = section.buttons.filter(button => {
        const label = button.texts.map(text).filter(Boolean).join(" ");
        const key = `${label}:${overrides.links?.[button.id] ?? "contact"}`;
        if (hidden.has(button.id) || !label || seenButtons.has(key)) return false;
        seenButtons.add(key);
        return true;
      });
      /*
       * 편집 화면에서만 — 사진이 하나도 없는 칸에 '사진 넣기' 자리를 하나 보여 준다.
       * 사진이 없으면 사진 자리를 숨겨 두는데, 그러면 사장님이 누를 곳이 없어
       * 자기 매장 사진을 넣을 방법을 찾지 못했다. 공개 화면에는 나오지 않는다.
       */
      const emptySlot = onPick && !imageIds.length ? section.images.find(id => !overrides.images?.[id]) : undefined;
      if (!textIds.length && !facts.length && !imageIds.length && !buttons.length) return null;
      return <section key={section.id} data-bw-node={section.id} className={hero ? styles.hero : header ? styles.header : styles.details}>
        {textIds.map(id => id === profile.headline
          ? <h1 key={id} {...props(id, desktop ? 48 : 36)}>{text(id)}</h1>
          : titles.includes(id) ? <h2 key={id} className={styles.sectionTitle} {...props(id, 24)}>{text(id)}</h2>
          : <p key={id} className={id === profile.brand ? styles.brand : styles.description} {...props(id, id === profile.brand ? 16 : 17)}>{text(id)}</p>)}
        {facts.map(fact => <div key={fact.value} className={styles.fact}>
          {text(fact.label) ? <h2 {...props(fact.label, 18)}>{text(fact.label)}</h2> : null}
          <p {...props(fact.value, 16)}>{text(fact.value)}</p>
        </div>)}
        {buttons.map(({ id, texts }) => {
          const textId = texts.find(id => text(id))!;
          return <button key={id} type="button" data-bw-btn={id} className={styles.action} onClick={event => {
            event.stopPropagation();
            if (onPick) onPick("button", id, event.currentTarget);
            else runBrainwaveButton(overrides.links, id);
          }}><span style={overrides.sizes?.[textId] ? { fontSize: 16 * overrides.sizes[textId] } : undefined}>{text(textId)}</span><ArrowRight size={18} aria-hidden /></button>;
        })}
        {emptySlot ? <button type="button" className={styles.photoSlot} data-bw-image={emptySlot} onClick={event => { event.stopPropagation(); onPick!("image", emptySlot, event.currentTarget); }}><ImagePlus size={20} aria-hidden /> 사진 넣기</button> : null}
        {imageIds.map(id => <img key={id} className={styles.photo} src={overrides.images![id]} alt="" data-bw-image={onPick ? id : undefined} onClick={onPick ? event => { event.stopPropagation(); onPick("image", id, event.currentTarget); } : undefined} />)}
      </section>;
    })}
  </div>;
}
