import { BUSINESS_TEMPLATE_PROFILES } from "./business-content";
import type { BrainwavePageData, BrainwaveOverrides } from "../../../components/brainwave-page";

/** Fixed template masks and text coordinates are unsafe for arbitrary customer media or long copy. */
export function businessNeedsFlow(page: Pick<BrainwavePageData, "id" | "slots">, overrides?: BrainwaveOverrides) {
  const profile = BUSINESS_TEMPLATE_PROFILES[page.id];
  if (!profile || overrides?.contentMode !== "business") return false;
  if (Object.entries(overrides.images ?? {}).some(([id, url]) => url && !overrides.hidden?.includes(id) && url !== page.slots.image.find(slot => slot.id === id)?.src)) return true;
  return Object.entries(overrides.texts ?? {}).some(([id, text]) => {
    if (overrides.hidden?.includes(id)) return false;
    const size = overrides.sizes?.[id] ?? 1;
    const field = profile.fields[id];
    const max = id === profile.headline ? 24 : field === "businessName" ? 18 : field === "cta" ? 16 : 65;
    return text.length * size > max || text.includes("\n");
  });
}
