import { inferProposalSector, type ProposalSector } from "./proposal-blueprint";

/**
 * Rule-based sector guess for a free-text business description (no AI).
 * Moved from app/plan/chat/intake-ui/model.ts so the server-side question catalogue can pick
 * sector chip sets before an industry answer exists; the client re-exports this function.
 */
export function descriptionSector(text: string): ProposalSector {
  // The delivery format matters more than the industry of the intended customer.
  const subject = text.replace(/^.*?(?:대상(?:으로)?|을 위한|를 위한|에게)\s*/, "");
  if (/(?:앱|소프트웨어|플랫폼|웹사이트|게임|영상|사진).{0,12}(?:강의|수업|교육|과외|코칭)/i.test(subject)) return "education";
  if (/(?:홈페이지|웹사이트|앱).{0,8}(?:제작|개발)\s*(?:대행|용역)|(?:플랫폼|소프트웨어).{0,8}컨설팅/i.test(subject)) return "b2b_service";
  if (/웹\s*(?:사이트|서비스)|게임\s*개발|애플리케이션|어플|\bapp\b|\bsaas\b|앱(?:으로|을|은|이|$)/i.test(subject)) return "software";
  if (/과외|클래스|튜터/.test(subject)) return "education";
  if (/스마트스토어|온라인\s*쇼핑|쇼핑\s*몰/.test(subject)) return "retail_commerce";
  return inferProposalSector(subject);
}
