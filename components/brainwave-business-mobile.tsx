"use client";

import { ArrowRight } from "lucide-react";
import { BUSINESS_TEMPLATE_PROFILES, businessTemplateManifest } from "../lib/landing/brainwave/business-content";
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
  const profile = BUSINESS_TEMPLATE_PROFILES[pageId];
  if (!profile) return null;
  const text = (id: string) => hidden.has(id) ? "" : overrides.texts?.[id] ?? "";
  const pick = (id: string) => onPick ? (event: React.MouseEvent<HTMLElement>) => { event.stopPropagation(); onPick("text", id, event.currentTarget); } : undefined;
  const props = (id: string, baseSize = 17) => ({ "data-bw-text": onPick ? id : undefined, onClick: pick(id), style: overrides.sizes?.[id] ? { fontSize: baseSize * overrides.sizes[id] } : undefined });
  const manifest = businessTemplateManifest[pageId];
  // Desktop headers overlay the hero; the mobile flow places that header before it.
  const sections = overrides.order?.length ? sectionOrder : sectionOrder.toSorted((a, b) => Number(manifest.sections.find(section => section.id === b)?.name === "Header") - Number(manifest.sections.find(section => section.id === a)?.name === "Header"));
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
      const priority = [profile.headline, profile.brand, ...titles, profile.description];
      const textIds = [...new Set([...priority, ...manifest.texts])].filter(id => {
        const value = text(id);
        if (!section.nodes.includes(id) || !value || factIds.has(id) || buttonTextIds.has(id) || ["one", "two", "three"].includes(profile.fields[id])) return false;
        if (seenText.has(value)) return false;
        seenText.add(value);
        return true;
      });
      const seenImages = new Set<string>();
      const imageIds = section.images.filter(id => {
        const url = overrides.images?.[id];
        if (hidden.has(id) || !url || seenImages.has(url)) return false;
        seenImages.add(url);
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
        {imageIds.map(id => <img key={id} className={styles.photo} src={overrides.images![id]} alt="" data-bw-image={onPick ? id : undefined} onClick={onPick ? event => { event.stopPropagation(); onPick("image", id, event.currentTarget); } : undefined} />)}
      </section>;
    })}
  </div>;
}
