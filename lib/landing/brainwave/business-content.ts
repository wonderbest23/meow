import { z } from "zod";
import manifestJson from "./content-manifest.json";
import type { BrainwaveData } from "../page-data";

export const businessContentSchema = z.object({
  businessName: z.string().min(1).max(120),
  /** 사업 한 줄 소개 — 첫 화면에서 상호 아래 설명으로 쓴다. 예전 페이지에는 없다 */
  headline: z.string().max(120).optional(),
  offer: z.string().max(600),
  description: z.string().max(600),
  customer: z.string().max(600),
  price: z.string().max(100),
  cta: z.string().max(40),
  image: z.string().max(900_000),
});
export type BusinessContent = z.infer<typeof businessContentSchema>;
type Field = keyof BusinessContent | "headline" | "detailsTitle" | "contactTitle" | "contactInvite" | "contactDescription" | "offerLabel" | "customerLabel" | "priceLabel" | "one" | "two" | "three"
  | "visitTitle" | "address" | "hoursLabel" | "hours";
type Profile = {
  sections: string[];
  fields: Record<string, Field>;
  brand: string;
  headline: string;
  description: string;
  button: string;
  facts: Array<{ label: string; value: string }>;
  hide?: string[];
};

export const BUSINESS_TEMPLATE_PROFILES: Record<string, Profile> = {
  "0-290": {
    sections: ["0:409", "0:332", "0:297"], brand: "0:418", headline: "0:414", description: "0:415", button: "I0:416;0:4460",
    fields: { "0:418": "businessName", "0:414": "headline", "0:415": "description", "I0:416;0:4460": "cta", "I0:420;0:4613": "cta", "0:309": "contactInvite", "I0:302;0:4557": "cta", "0:365": "detailsTitle", "0:364": "offer", "0:337": "offerLabel", "0:336": "offer", "0:343": "customerLabel", "0:342": "customer", "0:349": "priceLabel", "0:348": "price", "0:340": "one", "0:346": "two", "0:352": "three" },
    facts: [{ label: "0:337", value: "0:336" }, { label: "0:343", value: "0:342" }, { label: "0:349", value: "0:348" }],
  },
  /*
   * 동네 가게(03 Coworking 킷) — 카페·식당·미용실·필라테스처럼 손님이 찾아오는 가게.
   * 손님이 먼저 찾는 것(무엇을 파는지·얼마인지·어디에 있는지·언제 여는지)을 한 화면씩 둔다:
   *   첫 화면(0:2358) → 숫자 셋(0:2347) → 메뉴·가격(0:2322, 사진 카드) → 좋은 점(0:2283)
   *   → 이용 순서(0:2309) → 오시는 길·영업시간(0:2238) → 마무리(0:2228)
   * 숫자·메뉴·이용 순서는 AI 채우기가 계획서에서 찾았을 때만 연다.
   */
  "0-2226": {
    sections: ["0:2358", "0:2283", "0:2238", "0:2228"], brand: "0:2383", headline: "0:2376/0", description: "0:2377", button: "I0:2372;0:4557",
    fields: {
      "0:2383": "businessName", "0:2376/0": "headline", "0:2377": "description", "I0:2372;0:4557": "cta",
      "0:2285": "offerLabel", "0:2286": "offer", "0:2294": "customerLabel", "0:2295": "customer", "0:2301": "priceLabel", "0:2302": "price",
      "0:2281": "visitTitle", "0:2282": "address", "0:2269": "hoursLabel", "0:2268": "hours",
      "0:2237": "contactInvite", "I0:2233;0:4557": "cta",
    },
    facts: [{ label: "0:2285", value: "0:2286" }, { label: "0:2294", value: "0:2295" }, { label: "0:2301", value: "0:2302" }],
    hide: ["0:2376/1", "0:2365", "0:2364", "0:2371", "0:2373", "0:2374", "0:2375", "0:2378", "0:2384", "0:2276", "0:2275", "0:2246", "0:2247", "0:2252", "0:2257", "0:2262", "0:2232", "0:2235", "0:2236/0", "0:2236/1"],
  },
  /*
   * 온라인 상점 — 첫 화면(큰 제목 + 소개) 아래로 제공 내용·이용 대상·가격 카드가
   * 겹쳐 올라오고, 사진 위 마무리 문구로 끝난다. 보라 띠(0:1137)는 채울 말이
   * 따로 없어 새 페이지에서는 숨긴다(편집기에서 되살려 쓸 수 있다).
   */
  "0-1102": {
    sections: ["0:1360", "0:1321", "0:1329", "0:1104"], brand: "0:1361", headline: "0:1327", description: "0:1328", button: "I0:1110;0:4626",
    fields: { "0:1361": "businessName", "0:1327": "headline", "0:1328": "description", "0:1333": "offerLabel", "0:1334": "offer", "0:1338": "customerLabel", "0:1339": "customer", "0:1343": "priceLabel", "0:1344": "price", "0:1141": "detailsTitle", "0:1142": "contactDescription", "I0:1140;0:4572": "cta", "0:1111": "contactInvite", "I0:1110;0:4626": "cta" },
    facts: [{ label: "0:1333", value: "0:1334" }, { label: "0:1338", value: "0:1339" }, { label: "0:1343", value: "0:1344" }],
    hide: ["0:1363"],
  },
  "0-2": {
    sections: ["0:177", "0:113", "0:64", "0:4"], brand: "0:178", headline: "0:169", description: "0:170", button: "I0:168;0:4557",
    fields: { "0:178": "businessName", "0:169": "headline", "0:170": "description", "I0:168;0:4557": "cta", "I0:180;0:4613": "cta", "0:87": "detailsTitle", "0:86": "offer", "0:72": "offerLabel", "0:70": "offer", "0:78": "customerLabel", "0:76": "customer", "0:84": "priceLabel", "0:82": "price", "I0:69;0:4453": "cta", "I0:75;0:4453": "cta", "I0:81;0:4453": "cta", "0:8": "contactTitle", "I0:9;0:4626": "cta" },
    facts: [{ label: "0:72", value: "0:70" }, { label: "0:78", value: "0:76" }, { label: "0:84", value: "0:82" }],
    hide: ["0:171"],
  },
  "0-2385": {
    sections: ["0:2551", "0:2540", "0:2519", "0:2387"], brand: "0:2552", headline: "0:2542", description: "0:2543", button: "I0:2546;0:4460",
    fields: { "0:2552": "businessName", "0:2542": "headline", "0:2543": "description", "I0:2546;0:4460": "cta", "I0:2554;0:4613": "cta", "0:2521": "offerLabel", "0:2522": "offer", "0:2528": "customerLabel", "0:2529": "customer", "0:2534": "priceLabel", "0:2535": "price", "0:2390": "contactTitle", "0:2389": "offer", "I0:2391;0:4460": "cta" },
    facts: [{ label: "0:2521", value: "0:2522" }, { label: "0:2528", value: "0:2529" }, { label: "0:2534", value: "0:2535" }],
  },
  "0-2555": {
    sections: ["0:3342", "0:3269", "0:2912"], brand: "6:1738", headline: "0:3276", description: "0:3278", button: "I0:3275;0:4557",
    fields: { "6:1738": "businessName", "0:3276": "headline", "0:3277": "offer", "0:3278": "description", "I0:3275;0:4557": "cta", "I0:3345;0:4613": "cta", "0:3267": "detailsTitle", "0:3268": "offer", "0:3169": "offerLabel", "0:3170": "offer", "0:3162": "customerLabel", "0:3163": "customer", "0:2968": "priceLabel", "0:2969": "price", "I0:3168;0:4572": "cta", "I0:3047;0:4572": "cta", "I0:2967;0:4572": "cta" },
    facts: [{ label: "0:3169", value: "0:3170" }, { label: "0:3162", value: "0:3163" }, { label: "0:2968", value: "0:2969" }],
  },
  "0-181": {
    sections: ["0:286", "0:270", "0:239"], brand: "0:287", headline: "0:282", description: "0:284", button: "I0:281;0:4557",
    fields: { "0:287": "businessName", "0:282": "headline", "0:283": "offer", "0:284": "description", "I0:281;0:4557": "cta", "I0:289;0:4613": "cta", "0:268": "detailsTitle", "0:269": "offer", "0:248": "customerLabel", "0:247": "customer", "0:257": "priceLabel", "0:256": "price" },
    facts: [{ label: "0:248", value: "0:247" }, { label: "0:257", value: "0:256" }],
    hide: ["0:275"],
  },
  "0-1950": {
    sections: ["0:2222", "0:2159", "0:2052"], brand: "0:2223", headline: "0:2220", description: "0:2221", button: "I0:2217;0:4557",
    fields: { "0:2223": "businessName", "0:2220": "headline", "0:2221": "description", "I0:2217;0:4557": "cta", "0:2089": "detailsTitle", "0:2088": "offer", "0:2057": "offerLabel", "0:2056": "offer", "0:2063": "customerLabel", "0:2062": "customer", "0:2069": "priceLabel", "0:2068": "price", "0:2060": "one", "0:2066": "two", "0:2072": "three" },
    facts: [{ label: "0:2057", value: "0:2056" }, { label: "0:2063", value: "0:2062" }, { label: "0:2069", value: "0:2068" }],
    hide: ["0:2214", "0:2216", "0:2218", "0:2219"],
  },
  "0-1371": {
    sections: ["0:1946", "0:1509", "0:1460"], brand: "0:1947", headline: "0:1944", description: "0:1945", button: "I0:1943;0:4703",
    fields: { "0:1947": "businessName", "0:1944": "headline", "0:1945": "description", "I0:1943;0:4703": "cta", "I0:1949;0:4613": "cta", "0:1462": "offerLabel", "0:1463": "offer", "0:1470": "customerLabel", "0:1471": "customer", "0:1478": "priceLabel", "0:1479": "price" },
    facts: [{ label: "0:1462", value: "0:1463" }, { label: "0:1470", value: "0:1471" }, { label: "0:1478", value: "0:1479" }],
  },
  "0-421": {
    sections: ["0:1098", "0:968", "0:743"], brand: "0:1099", headline: "0:1091", description: "0:1092", button: "I0:1090;0:4557",
    fields: { "0:1099": "businessName", "0:1091": "headline", "0:1092": "description", "I0:1090;0:4557": "cta", "I0:1101;0:4613": "cta", "0:745": "detailsTitle", "0:746": "offer", "0:754": "offerLabel", "0:753": "offer", "0:760": "customerLabel", "0:759": "customer", "0:766": "priceLabel", "0:765": "price", "0:752": "one", "0:758": "two", "0:764": "three" },
    facts: [{ label: "0:754", value: "0:753" }, { label: "0:760", value: "0:759" }, { label: "0:766", value: "0:765" }],
    hide: ["0:1096", "0:1097"],
  },
};

export const BUSINESS_TEMPLATE_IDS = Object.keys(BUSINESS_TEMPLATE_PROFILES);
/*
 * Figma 디자인을 흐름 배치로 옮겨 둔 템플릿. 이 페이지들은 글 길이·사진과 상관없이
 * 늘 그 디자인으로 그린다(components/brainwave-business-*.tsx).
 */
export const BUSINESS_DESIGNED_PAGES = new Set(["0-290", "0-1102", "0-2226"]);

/* 동네 가게의 오시는 길·영업시간 기본 글 — 사업자 정보에 주소·영업시간이 없을 때 */
export const LOCAL_ADDRESS_PENDING = "주소는 문의 주시면 안내해 드려요";
export const LOCAL_HOURS_PENDING = "영업시간은 문의 주시면 안내해 드려요";
// Search-only controls are removed from business drafts; keep their remaining CTA aligned.
export const BUSINESS_NODE_STYLES: Record<string, Record<string, string>> = {
  "0:2372": { left: "calc(50% - 110px)", right: "auto", width: "220px" },
  "0:2217": { left: "0", right: "auto", width: "200px" },
};
type Manifest = Record<string, { texts: string[]; sections: Array<{ id: string; name: string; nodes: string[]; images: string[]; buttons: Array<{ id: string; texts: string[] }> }> }>;
export const businessTemplateManifest = manifestJson as Manifest;

/*
 * 사업 정보로 자동으로 만들어지는 글 전부(예전 템플릿 배치에서 쓰던 문구 포함).
 * 지금 글이 이 중 하나면 '사장님이 쓴 글'이 아니라 자동 문구다 — AI 채우기가 바꿔도 된다.
 */
export function businessTemplateDefaults(content: BusinessContent): Set<string> {
  const name = content.businessName;
  const values = [
    name, content.headline ?? "", content.offer, content.description, content.customer, content.price, content.cta,
    "이용 안내", "제공 내용", "이용 대상", "가격 안내", "01", "02", "03",
    "오시는 길·영업시간", "영업시간", LOCAL_ADDRESS_PENDING, LOCAL_HOURS_PENDING,
    `${name} 문의`, `${name}에 문의해 보세요`,
    [content.offer, content.customer && `이용 대상: ${content.customer}`, content.price && `가격: ${content.price}`].filter(Boolean).join("\n"),
  ];
  return new Set(values.map((value) => value.trim()).filter(Boolean));
}

export function createBusinessTemplate(content: BusinessContent, page: string): BrainwaveData {
  const profile = BUSINESS_TEMPLATE_PROFILES[page];
  const manifest = businessTemplateManifest[page];
  if (!profile || !manifest) throw new Error("사업 홈페이지에 사용할 수 없는 템플릿입니다.");
  const value = {
    /*
     * 첫 화면 큰 제목은 사업 이름, 그 아래가 한 줄 소개다.
     * 한 줄 소개("퇴근하면 문 앞에…")를 큰 제목으로 올렸더니 무슨 사이트인지
     * 이름부터 알 수 없었다 — 사이트는 이름을 먼저 보여주고 설명을 붙인다.
     * 한 줄 소개는 템플릿마다 큰 제목 바로 아래 자리(profile.description)에 넣는다.
     */
    ...content, headline: content.businessName, detailsTitle: "이용 안내", contactTitle: `${content.businessName} 문의`, contactInvite: `${content.businessName}에 문의해 보세요`,
    contactDescription: [content.offer, content.customer && `이용 대상: ${content.customer}`, content.price && `가격: ${content.price}`].filter(Boolean).join("\n"),
    offerLabel: "제공 내용", customerLabel: "이용 대상", priceLabel: "가격 안내", one: "01", two: "02", three: "03",
    visitTitle: "오시는 길·영업시간", address: LOCAL_ADDRESS_PENDING, hoursLabel: "영업시간", hours: LOCAL_HOURS_PENDING,
  };
  // Empty overrides cover every original slot, including sections later restored by the editor.
  const texts = Object.fromEntries(manifest.texts.map(id => [id, ""]));
  for (const [id, field] of Object.entries(profile.fields)) texts[id] = value[field];
  const tagline = content.headline?.trim();
  if (tagline) texts[profile.description] = tagline;
  const hidden = manifest.sections.filter(section => !profile.sections.includes(section.id)).map(section => section.id);
  hidden.push(...(profile.hide ?? []));
  for (const fact of profile.facts) if (!texts[fact.value].trim()) hidden.push(fact.label, fact.value);
  const links: Record<string, string> = {};
  const images: Record<string, string> = {};
  for (const section of manifest.sections) {
    for (const id of section.images) {
      if (content.image) images[id] = content.image;
      else hidden.push(id);
    }
    for (const { id, texts: buttonTexts } of section.buttons) {
      const used = buttonTexts.some(textId => profile.fields[textId] === "cta");
      links[id] = used ? "contact" : "none";
      if (!used) hidden.push(id);
    }
  }
  return { page, texts, images, links, sizes: {}, hidden: [...new Set(hidden)], order: [], contentMode: "business" };
}

/**
 * 오시는 길·영업시간 칸 — 사업자 정보의 주소·영업시간을 그 템플릿의 자리에 넣는다.
 * 모르는 것은 빼고 돌려준다(기본 글 '문의 주시면 안내해 드려요'가 그대로 남는다).
 */
export function visitInfoTexts(page: string, info: { address?: string; hours?: string }): Record<string, string> {
  const profile = BUSINESS_TEMPLATE_PROFILES[page];
  if (!profile) return {};
  const out: Record<string, string> = {};
  for (const [id, field] of Object.entries(profile.fields)) {
    if (field === "address" && info.address?.trim()) out[id] = info.address.trim();
    if (field === "hours" && info.hours?.trim()) out[id] = info.hours.trim();
  }
  return out;
}
