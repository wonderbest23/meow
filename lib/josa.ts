/**
 * 받침에 따라 조사를 고른다 — '‘스톡사진 판매’(으)로'처럼 둘 다 적지 않게(재검증 2026-10-22).
 * 끝의 따옴표·괄호·공백은 건너뛰고 마지막 한글 글자를 본다. 한글이 아니면 받침 없는 쪽을 쓴다.
 */
function lastSyllable(word: string): number | null {
  // 끝 따옴표를 떼고, 끝 괄호 덧말('촬영(프로필·가족)')은 앞 낱말을 본다 — 조사는 괄호 앞 말에 맞춘다
  let plain = word;
  for (let i = 0; i < 4; i++) {
    const next = plain.replace(/[\s'"‘’“”「」『』.,!?…·]+$/u, "").replace(/\s*\([^()]*\)$|\s*\[[^[\]]*\]$/u, "");
    if (next === plain) break;
    plain = next;
  }
  const code = plain.slice(-1).codePointAt(0);
  return code != null && code >= 0xac00 && code <= 0xd7a3 ? code - 0xac00 : null;
}

/** 받침이 있는지 */
export function hasFinalConsonant(word: string): boolean {
  const code = lastSyllable(word);
  return code !== null && code % 28 !== 0;
}

/** 으로 / 로 — ㄹ 받침은 '로' */
export function withRo(word: string): string {
  const code = lastSyllable(word);
  return `${word}${code === null || code % 28 === 0 || code % 28 === 8 ? "로" : "으로"}`;
}

/** 이에요 / 예요 */
export function withIeyo(word: string): string {
  return `${word}${hasFinalConsonant(word) ? "이에요" : "예요"}`;
}

/** 을 / 를 */
export function withEul(word: string): string {
  return `${word}${hasFinalConsonant(word) ? "을" : "를"}`;
}
