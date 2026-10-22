import { BUSINESS_TEMPLATE_PROFILES, businessTemplateManifest } from "./brainwave/business-content";
import type { LandingDraft } from "./domain";

/** 홈페이지에 '오시는 길·영업시간' 칸이 보이는지 — 보이는데 비어 있으면 손님에게 '문의 주시면 안내해 드려요'만 보인다 */
function visitHoursShown(draft: LandingDraft): boolean {
  const bw = draft.pageData?.brainwave;
  const profile = bw ? BUSINESS_TEMPLATE_PROFILES[bw.page] : undefined;
  const manifest = bw ? businessTemplateManifest[bw.page] : undefined;
  if (!bw || !profile || !manifest) return false;
  const hoursIds = Object.entries(profile.fields).filter(([, field]) => field === "hours").map(([id]) => id);
  return hoursIds.some((id) => !bw.hidden.includes(id) && manifest.sections.some((section) => section.nodes.includes(id) && !bw.hidden.includes(section.id)));
}

/**
 * 가게 이름이 설명 문장처럼 보이는지 — '아파트 상가 아침 빵집'처럼 띄어 쓴 긴 이름은 계획서 제목이 그대로 들어온 것이다.
 * 계획서에 이름 후보가 있을 때만 알린다(공개 화면 맨 위·맨 아래 로고에 그대로 나온다).
 */
export function looksDescriptiveName(name: string): boolean {
  const trimmed = name.trim();
  return /\s/.test(trimmed) && trimmed.length > 8;
}

/**
 * 공개 전에 비어 있으면 안 되는 것 — 법정 표기(사업자 정보 칸의 '채울 것 n개'와 공개 확인창이 같은 목록을 쓴다).
 * 손님이 찾아오는 디자인이면 영업시간도, 이름 후보가 있는데 이름이 설명 문장이면 '가게 이름'도 넣는다.
 */
export function homepageMissingInfo(draft: LandingDraft, options: { nameCandidates?: boolean } = {}): string[] {
  return [
    options.nameCandidates && looksDescriptiveName(draft.businessName) && "가게 이름",
    !draft.businessRepresentative.trim() && "대표자",
    !draft.businessAddress.trim() && "사업장 주소",
    !(draft.businessPhone || draft.businessContact).trim() && "전화번호",
    !draft.businessEmail.trim() && "이메일",
    !draft.businessRegistrationNumber.trim() && "사업자등록번호",
    draft.leadCaptureEnabled && !draft.privacyContact.trim() && "개인정보 문의처",
    visitHoursShown(draft) && !draft.openHours.trim() && "영업시간",
  ].filter(Boolean) as string[];
}

