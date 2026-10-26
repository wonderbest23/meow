import { firstSectorMatch } from "../sector-match";
import { isPlaceholderPhoto, type LandingDraft } from "./domain";
import { looksDescriptiveName } from "./publish-check";
import { shareImage } from "./share-card";

/*
 * 공개 홈페이지의 가게 정보(LocalBusiness JSON-LD) — 검색(구글 등)이 가게 이름·주소·전화를 바로 읽게 한다.
 *
 * 틀린 정보가 검색에 올라가면 손님이 엉뚱한 곳으로 찾아가거나 없는 번호로 전화한다(점검 r42-B 결정 6번).
 * 그래서 사장님이 실제로 적은 값만 쓰고, 하나라도 미덥지 않으면 통째로 넣지 않는다:
 *   - 가게 이름: 비었거나, 계획서 제목이 그대로 들어온 설명 문장('아파트 상가 아침 빵집')이거나, 시험 값이면 뺀다.
 *   - 주소: 계획서에서 채운 지역 이름('서울 마포구')만 있으면 뺀다 — 도로명·지번처럼 번지 숫자가 있어야 한다.
 *   - 전화: 국내 번호 꼴이어야 하고, 견본 번호(010-0000-0000·010-1234-5678 등)는 뺀다.
 *   - 영업시간: '매일 10:00~21:00', '평일 09:00-18:00, 토 10:00-14:00'처럼 형식이 확실할 때만. 한 칸이라도 못 읽으면 영업시간을 통째로 뺀다.
 *   - 소개 문장은 넣지 않는다(자동으로 채운 문장일 수 있다).
 * 사이트맵에는 넣지 않는다(보류 — 사장님 동의 문제).
 */

const TEST_VALUE = /(테스트|시험용|샘플|예시|임시|더미|test|sample|example|dummy|asdf|qwer|lorem|ㅁㄴㅇㄹ|ㅇㅇ|xxx|미정|등록\s*전)/i;

/*
 * 업종 → schema.org 하위 형식. 상호·첫 화면 제목·대표 상품 글에서 먼저 나온 말로 고른다(lib/sector-match.ts).
 * 확실한 가게 꼴만 둔다 — 못 고르면 LocalBusiness.
 */
const SUBTYPES: ReadonlyArray<{ test: RegExp; type: string }> = [
  { test: /(치과)/, type: "Dentist" },
  { test: /(약국)/, type: "Pharmacy" },
  /* 동물병원 — schema.org VeterinaryCare 는 LocalBusiness 하위가 아니라(검사기 경고) 병원(MedicalClinic)으로 잡히지 않게 일반 가게로 */
  { test: /(동물\s*병원)/, type: "LocalBusiness" },
  { test: /(의원|병원|클리닉|한의원|정형외과|피부과|내과|소아과|이비인후과)/, type: "MedicalClinic" },
  { test: /(카페|커피|coffee|cafe)/i, type: "CafeOrCoffeeShop" },
  { test: /(베이커리|빵|제과|bakery)/i, type: "Bakery" },
  { test: /(아이스크림|젤라또)/, type: "IceCreamShop" },
  { test: /(술집|주점|호프|포차|와인\s*바|칵테일\s*바)/, type: "BarOrPub" },
  { test: /(식당|음식점|레스토랑|한식|중식|일식|양식|분식|국밥|고깃집|횟집|치킨|피자|도시락|반찬)/, type: "Restaurant" },
  { test: /(미용실|헤어|hair)/i, type: "HairSalon" },
  { test: /(네일)/, type: "NailSalon" },
  { test: /(피부\s*관리|에스테틱|왁싱|속눈썹|뷰티|살롱)/, type: "BeautySalon" },
  { test: /(필라테스|요가|헬스|피트니스|크로스핏|체육관|gym)/i, type: "ExerciseGym" },
  { test: /(꽃집|플라워|화원)/, type: "Florist" },
  { test: /(세탁|빨래방)/, type: "DryCleaningOrLaundry" },
  { test: /(부동산|공인중개)/, type: "RealEstateAgent" },
  { test: /(자동차\s*정비|카센터|정비소)/, type: "AutoRepair" },
  { test: /(서점|책방)/, type: "BookStore" },
  { test: /(반려|펫샵|애견\s*용품)/, type: "PetStore" },
  { test: /(호텔|게스트\s*하우스|펜션|민박|숙소)/, type: "LodgingBusiness" },
];

export function localBusinessType(config: Pick<LandingDraft, "businessName" | "headline" | "offerTitle">): string {
  const text = [config.businessName, config.headline, config.offerTitle].join(" \n ");
  return firstSectorMatch(SUBTYPES, text, (entry) => entry.test)?.type ?? "LocalBusiness";
}

const clean = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();

function usableName(name: string): string | null {
  const value = clean(name);
  if (value.length < 2 || TEST_VALUE.test(value) || looksDescriptiveName(value)) return null;
  return value;
}

/* 지역 이름만이 아니라 번지가 있는 주소 — '양화로 12', '망원동 123-4', '중앙길 7' */
function usableAddress(address: string): string | null {
  const value = clean(address);
  if (value.length < 6 || TEST_VALUE.test(value)) return null;
  if (!/[가-힣]+(로|길|동|읍|면|리|가)\s*\d+/.test(value)) return null;
  return value;
}

const REGIONS = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[가-힣]*$/;

function postalAddress(address: string) {
  const parts = address.split(" ");
  const out: Record<string, string> = { "@type": "PostalAddress" };
  let rest = parts;
  if (REGIONS.test(parts[0] ?? "")) {
    out.addressRegion = parts[0];
    rest = parts.slice(1);
    if (/^[가-힣]+(시|군|구)$/.test(rest[0] ?? "") && rest.length > 1) {
      out.addressLocality = rest[0];
      rest = rest.slice(1);
    }
  }
  out.streetAddress = rest.join(" ") || address;
  out.addressCountry = "KR";
  return out;
}

/* 국내 전화번호 → 하이픈 꼴. 견본 번호·자릿수가 안 맞으면 null */
export function usablePhone(raw: string): string | null {
  const value = clean(raw);
  if (!value || TEST_VALUE.test(value) || value.includes("@")) return null;
  let digits = value.replace(/[^\d+]/g, "");
  if (digits.startsWith("+82")) digits = `0${digits.slice(3).replace(/^0/, "")}`;
  if (!/^\d+$/.test(digits)) return null;
  /* 견본 번호 — 뒤 여덟 자리가 한 숫자뿐(0000-0000)·1234-5678·같은 숫자 네 개씩(1111-2222) */
  const last = digits.slice(-8);
  if (/^(\d)\1+$/.test(last) || last === "12345678" || /^(\d)\1{3}(\d)\2{3}$/.test(last)) return null;
  if (/^01[016789]\d{7,8}$/.test(digits)) return digits.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
  if (/^02\d{7,8}$/.test(digits)) return digits.replace(/^(02)(\d{3,4})(\d{4})$/, "$1-$2-$3");
  if (/^050\d\d{8}$/.test(digits)) return digits.replace(/^(\d{4})(\d{4})(\d{4})$/, "$1-$2-$3");
  if (/^0[3-6]\d\d{7,8}$/.test(digits) || /^070\d{8}$/.test(digits)) return digits.replace(/^(\d{3})(\d{3,4})(\d{4})$/, "$1-$2-$3");
  if (/^1[568]\d{6}$/.test(digits)) return digits.replace(/^(\d{4})(\d{4})$/, "$1-$2");
  return null;
}

/* ── 영업시간 ─────────────────────────────────────────── */

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const DAY_INDEX: Record<string, number> = { 월: 0, 화: 1, 수: 2, 목: 3, 금: 4, 토: 5, 일: 6 };

function parseDays(spec: string): number[] | null {
  const value = spec.replace(/요일/g, "").replace(/\s+/g, "");
  if (value === "매일" || value === "연중무휴" || value === "월~일" || value === "월-일") return [0, 1, 2, 3, 4, 5, 6];
  if (value === "평일") return [0, 1, 2, 3, 4];
  if (value === "주말") return [5, 6];
  const range = /^([월화수목금토일])[~\-–]([월화수목금토일])$/.exec(value);
  if (range) {
    const from = DAY_INDEX[range[1]], to = DAY_INDEX[range[2]];
    if (to < from) return null;
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }
  if (/^[월화수목금토일]([,·、/][월화수목금토일])*$/.test(value)) return [...new Set(value.split(/[,·、/]/).map((day) => DAY_INDEX[day]))];
  return null;
}

function parseTime(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]), minute = Number(match[2]);
  if (minute > 59 || hour > 24 || (hour === 24 && minute !== 0)) return null;
  return hour === 24 ? "23:59" : `${String(hour).padStart(2, "0")}:${match[2]}`;
}

type HoursSpec = { "@type": "OpeningHoursSpecification"; dayOfWeek: string[]; opens: string; closes: string };

/**
 * 영업시간 글 → OpeningHoursSpecification. 칸은 쉼표·줄바꿈·'/'로 나눈다.
 * 'X 휴무'·'X 정기휴무' 칸은 그 요일을 빼는 뜻이라 건너뛴다(겹치게 적은 영업 칸이 있으면 못 읽은 것으로 본다).
 * 한 칸이라도 못 읽으면 null — 반쯤 맞는 영업시간은 검색에 올리지 않는다.
 */
export function parseOpenHours(raw: string): HoursSpec[] | null {
  const text = clean(raw.replace(/\n/g, ", "));
  if (!text || TEST_VALUE.test(text)) return null;
  const segments = text.split(/\s*(?:,|\/|;)\s*/).filter(Boolean);
  const specs: HoursSpec[] = [];
  const closedDays = new Set<number>();
  const openDays = new Set<number>();
  for (const segment of segments) {
    const closed = /^(.+?)\s*(?:정기\s*)?휴무$/.exec(segment);
    if (closed) {
      const days = parseDays(closed[1]);
      if (!days) return null;
      days.forEach((day) => closedDays.add(day));
      continue;
    }
    const match = /^(.+?)\s+(\d{1,2}:\d{2})\s*[~\-–]\s*(\d{1,2}:\d{2})$/.exec(segment);
    if (!match) return null;
    const days = parseDays(match[1]);
    const opens = parseTime(match[2]);
    const closes = parseTime(match[3]);
    if (!days || !opens || !closes || opens === closes) return null;
    if (days.some((day) => openDays.has(day))) return null;
    days.forEach((day) => openDays.add(day));
    specs.push({ "@type": "OpeningHoursSpecification", dayOfWeek: days.map((day) => `https://schema.org/${DAY_NAMES[day]}`), opens, closes });
  }
  if (!specs.length) return null;
  /* '매일 10:00~21:00, 월 휴무'처럼 휴무일이 영업일과 겹치면 그 요일을 뺀다. 빠져 비면 못 읽은 것으로 본다 */
  if (closedDays.size) {
    for (const spec of specs) {
      spec.dayOfWeek = spec.dayOfWeek.filter((url) => !closedDays.has(DAY_NAMES.indexOf(url.replace("https://schema.org/", "") as typeof DAY_NAMES[number])));
      if (!spec.dayOfWeek.length) return null;
    }
  }
  return specs;
}

/* ── 조립 ─────────────────────────────────────────────── */

/**
 * 가게 정보가 실제로 채워진 홈페이지만 JSON-LD 를 만든다. 이름·주소·전화 중 하나라도 미덥지 않으면 null.
 * url 은 이 홈페이지의 대표 주소(canonical).
 */
export function landingLocalBusinessJsonLd(config: LandingDraft, url: string): Record<string, unknown> | null {
  const name = usableName(config.businessName);
  const address = usableAddress(config.businessAddress);
  const telephone = usablePhone(config.businessPhone) ?? usablePhone(config.businessContact);
  if (!name || !address || !telephone) return null;
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": localBusinessType(config),
    name,
    url,
    telephone,
    address: postalAddress(address),
  };
  /* 사진은 견본(Unsplash 업종 사진·템플릿 사진)이 아닌, 사장님이 올린 https 사진만 */
  const photo = shareImage(config);
  if (photo && /^https:\/\//.test(photo) && !photo.startsWith("https://images.unsplash.com/")) data.image = photo;
  const logo = clean(config.logoImageUrl);
  if (/^https:\/\//.test(logo) && !isPlaceholderPhoto(logo)) data.logo = logo;
  const email = clean(config.businessEmail);
  if (email && !TEST_VALUE.test(email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) data.email = email;
  const hours = parseOpenHours(config.openHours);
  if (hours) data.openingHoursSpecification = hours;
  return data;
}

/** <script type="application/ld+json"> 안에 넣을 글 — '</script>'로 끊기지 않게 < 를 바꾼다 */
export function jsonLdText(data: Record<string, unknown>): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/[\u2028\u2029]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16)}`);
}
