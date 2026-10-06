/*
 * 손님에게 바로 연락하는 링크 — 접수된 문의의 [전화]·[문자]·[이메일] 단추.
 *
 * 문의를 받고 답장이 늦으면 손님은 다른 가게로 간다. 번호를 복사해 전화 앱에 붙이는 대신
 * 한 번 눌러 바로 걸고, 첫 인사 문자는 미리 채워 둔다.
 * 문자 링크는 `sms:번호?&body=` 모양 — iOS 는 `&body=`, 안드로이드는 `?body=` 를 읽는데
 * `?&body=` 는 양쪽 모두 본문으로 받아들인다.
 */

/** 숫자만(국제번호 +82 는 0 으로 바꾼다). 전화·문자 링크와 화면 표시에 같이 쓴다 */
export function phoneDigits(input: string): string {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+82") || (digits.startsWith("82") && digits.length >= 11 && !digits.startsWith("820"))) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

/** 휴대폰(010·011·016~019)이면 숫자 10~11자리, 아니면 null */
export function normalizeMobilePhone(input: string): string | null {
  const digits = phoneDigits(input);
  return /^01[016789]\d{7,8}$/.test(digits) ? digits : null;
}

/** 화면 표시용 — 010-1234-5678, 02-123-4567, 031-123-4567, 1588-1234. 모르는 모양은 받은 그대로 */
export function formatKoreanPhone(input: string): string {
  const digits = phoneDigits(input);
  if (/^01[016789]\d{7,8}$/.test(digits)) return digits.length === 11 ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}` : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (/^02\d{7,8}$/.test(digits)) return digits.length === 10 ? `02-${digits.slice(2, 6)}-${digits.slice(6)}` : `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
  if (/^0[3-6]\d\d{7,8}$/.test(digits) || /^070\d{8}$/.test(digits)) return digits.length === 11 ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}` : `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (/^1[5-9]\d{6}$/.test(digits)) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return input.trim();
}

/** 걸 수 있는 번호(8자리 이상)일 때만 링크를 만든다 — 엉뚱한 글이 전화 앱으로 가지 않게 */
function dialable(input: string): string | null {
  const digits = phoneDigits(input);
  return /^\d{8,12}$/.test(digits) ? digits : null;
}

export function telHref(phone: string): string | null {
  const digits = dialable(phone);
  return digits ? `tel:${digits}` : null;
}

export function smsHref(phone: string, body = ""): string | null {
  const digits = dialable(phone);
  if (!digits) return null;
  return body ? `sms:${digits}?&body=${encodeURIComponent(body)}` : `sms:${digits}`;
}

export function mailtoHref(email: string, subject = "", body = ""): string | null {
  const address = email.trim();
  // 주소 칸에 ?·& 가 섞이면 제목·본문을 바꿔치기할 수 있다 — 평범한 주소만
  if (!/^[^\s@?&#<>"]+@[^\s@?&#<>"]+\.[^\s@?&#<>"]+$/.test(address)) return null;
  const query = [subject && `subject=${encodeURIComponent(subject)}`, body && `body=${encodeURIComponent(body)}`].filter(Boolean).join("&");
  return `mailto:${address}${query ? `?${query}` : ""}`;
}

/** 첫 답장 문자 — 짧고 바로 보낼 수 있게 */
export function leadReplyText(businessName: string): string {
  const name = businessName.trim();
  return name ? `안녕하세요, ${name}입니다. 문의 주셔서 연락드려요.` : "안녕하세요. 문의 주셔서 연락드려요.";
}

export function leadReplySubject(businessName: string): string {
  const name = businessName.trim();
  return name ? `[${name}] 문의 주셔서 감사합니다` : "문의 주셔서 감사합니다";
}
