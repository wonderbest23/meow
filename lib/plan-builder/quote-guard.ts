import { PHILOSOPHY_QUOTES, type PhilosophyQuote } from "./philosophy-quotes";

/*
 * 가짜 명언 거르기(대표 결정 2026-11-17, philosophy-quotes.ts) — AI가 쓴 계획서 본문을 저장하기 전에 돈다(AI 호출 0회).
 *
 * 철학자·사상가·유명인 이름과 함께 따옴표로 인용한 문장을 찾아 출처를 검증한 목록(PHILOSOPHY_QUOTES)과 맞춘다.
 * - 목록의 문장과 맞지 않으면(공백·문장부호를 빼고 비교, 조사·어미 몇 글자 차이는 허용) 그 문장을 지운다.
 *   잘 알려진 오인용('탁월함은 습관이다'-아리스토텔레스, 괴테 '시작하라', '지피지기 백전백승', '같은 강물에 두 번')도 여기서 지워진다.
 * - 맞는 문장인데 출처가 틀리면(니체 문장을 헤겔이라 함, 다른 책 이름) 그것도 지운다.
 * - 장마다 받은 후보(allowedIds)가 있으면 그 밖의 인용도 지운다 — 한 계획서 안에서 같은 명언이 두 번 나오지 않게.
 * - 명언·격언·옛말·속담이라고 부르며 따옴표로 인용했는데 누가 했는지 밝히지 않은 말도 지운다(누가·어디서를 밝히는 규칙).
 * 손님 말처럼 사람 이름이 없는 따옴표, '안전선' 같은 강조, 장 이름은 건드리지 않는다. 표와 코드 블록도 건드리지 않는다.
 */

export type QuoteGuardReason = "unknown_quote" | "wrong_source" | "no_source" | "not_candidate" | "extra_quote" | "known_misquote";
export type QuoteGuardFinding = { reason: QuoteGuardReason; quote: string };
export type QuoteGuardResult = { markdown: string; removed: number; findings: QuoteGuardFinding[] };

/* 목록 밖의 사상가·유명인(흔히 명언이 붙는 사람). 흔한 낱말과 겹치는 이름(부처·다산·퇴계·율곡·나폴레옹 등)은 넣지 않는다 */
const OTHER_FIGURES = [
  "괴테", "링컨", "아인슈타인", "스티브 잡스", "에디슨", "처칠", "간디", "마크 트웨인", "벤저민 프랭클린", "벤자민 프랭클린", "프랭클린", "피터 드러커", "드러커",
  "헨리 포드", "워런 버핏", "버핏", "빌 게이츠", "일론 머스크", "제프 베이조스", "루소", "비트겐슈타인", "하이데거", "마키아벨리", "셰익스피어", "톨스토이",
  "도스토옙스키", "도스토예프스키", "한비자", "묵자", "석가", "붓다", "마틴 루터 킹", "넬슨 만델라", "만델라", "헬렌 켈러", "월트 디즈니", "정주영", "이병철",
  "세종대왕", "이순신", "정약용", "피카소", "레오나르도 다 빈치", "다빈치", "뉴턴", "마르크스", "애덤 스미스", "러셀", "키케로", "호라티우스", "핀다로스",
  "에피쿠로스", "디오게네스", "피타고라스", "플루타르코스", "오프라 윈프리", "마윈", "손정의", "이나모리 가즈오", "마쓰시타 고노스케", "존 스튜어트 밀",
  "프로이트", "아들러", "에리히 프롬", "데일 카네기", "카네기", "칭기즈 칸", "헤밍웨이", "생텍쥐페리", "헤르만 헤세", "칼릴 지브란", "달라이 라마", "틱낫한",
  "빅터 프랭클", "빅토르 프랑클", "노먼 빈센트 필", "토마스 아퀴나스", "아우구스티누스", "베토벤", "단테",
];
/*
 * 흔한 낱말과 겹치는 목록 인물(장자=맏아들, 손자=손주, 순자=사람 이름, 베이컨=음식, 중용=낱말) —
 * 같은 문장에 그 사람의 책 이름이 있을 때만 사상가 이름으로 본다(할머니가 손자에게 '맛있다'고 권하는 문장을 지우지 않게).
 */
const AMBIGUOUS: Record<string, readonly string[]> = {
  장자: ["『장자』"], 순자: ["『순자』"], 손자: ["손자병법"], 베이컨: ["신기관"], 중용: ["『중용』", "《중용》"],
};
/* 잘 알려진 오인용 — 따옴표가 없어도 그 문장을 지운다(이 말들은 어느 자리에서도 원문 인용이 아니다) */
const KNOWN_MISQUOTES = [
  /탁월함은[^.!?\n]{0,20}습관/, /백전백승/, /같은\s*강물?에\s*두\s*번/, /운명을\s*사랑하라/, /대담함(?:에는|은)[^.!?\n]{0,20}(?:천재성|마법)/,
  /시작하라[^가-힣\n]{0,4}그\s*안에[^.!?\n]{0,12}(?:천재성|마법)/, /같은\s*일을\s*반복하면서\s*다른\s*결과/, /꿈꿀\s*수\s*있다면[^.!?\n]{0,10}할\s*수\s*있/,
];
const PROVERB_MARKER = /명언|격언|옛말|속담|금언|잠언/;

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const LIST_NAMES = [...new Set(PHILOSOPHY_QUOTES.flatMap(quote => quote.aliases))];
const ALL_NAMES = [...new Set([...LIST_NAMES, ...OTHER_FIGURES])].sort((a, b) => b.length - a.length);
const NAME_RE = new RegExp(`(?<![가-힣A-Za-z])(${ALL_NAMES.map(escape).join("|")})`, "g");
/** '— 노자 『도덕경』'처럼 이름으로 시작하는 출처 꼬리인지 */
const FIGURE_START = new RegExp(`^\\s*(?:${ALL_NAMES.map(escape).join("|")})`);
const startsWithFigure = (text: string) => FIGURE_START.test(text) && figuresIn(text).size > 0;
const KNOWN_TITLES = new Set(PHILOSOPHY_QUOTES.flatMap(quote => quote.works));
/*
 * 따옴표가 '누가 한 말'로 이어져 있는지 — '"…"라고 했습니다', '"…"이라는 옛말', '"…" — 노자', '공자의 말처럼 "…"', '니체는 "…"'.
 * 같은 문장에 사상가 이름이 있어도 따옴표가 상호·홍보 문구('"동네 반찬 선생님"이라는 이름으로')면 건드리지 않는다.
 */
const SPEECH_AFTER = /^\s*(?:(?:이?라|하)?고\s*[^.!?\n]{0,12}?(?:했|말|썼|적었|적혀|남겼|가르쳤|일렀|물었|노래|표현|강조|인용)|이?라는\s*(?:옛말|말|명언|격언|속담|가르침|문장|구절|금언|잠언)|[—–―(])/;
const SPEECH_BEFORE = new RegExp(`(?:말처럼|말대로|말했듯이?|썼듯이?|적었듯이?|가르침처럼|(?:옛말|명언|격언|속담|금언|잠언)처럼|말했습니다|썼습니다|남긴|적은|쓴|말|:|』\\s*(?:에서|에는|의|속)?|(?:${ALL_NAMES.map(escape).join("|")})(?:의|는|은|가|이|도)?)\\s*$`);
const speechLinked = (before: string, after: string) => SPEECH_AFTER.test(after) || SPEECH_BEFORE.test(before);

/** 비교용: 공백·문장부호·따옴표·강조 기호를 뺀다 */
export function normalizeQuote(text: string): string {
  return text.normalize("NFC").replace(/[\s"'“”‘’「」『』《》〈〉()[\]{}.,!?…·:;—–―\-~*_`]/g, "");
}

function levenshtein(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, current[j]);
    }
    if (best > limit) return limit + 1;
    previous = current;
  }
  return previous[b.length];
}

/**
 * 인용문이 목록의 어느 말인지. 짧은 문장(12자 미만)은 한 글자, 그 밖에는 12%(최소 2글자)까지 다른 글자를 허용한다 —
 * '견뎌 낸다'→'견뎌 냅니다' 같은 어미는 통과하고, '위태롭지 않다'→'이긴다', '믿어라'→'알라'처럼 뜻이 바뀌면 걸린다.
 * 앞부분만 줄인 인용은 원문의 70% 이상이 글자 그대로일 때만 인정한다(맹자·논어 '한 삼태기'처럼 희망적인 뒷부분을 빼면 걸린다).
 */
export function matchPhilosophyQuote(text: string): PhilosophyQuote | null {
  const norm = normalizeQuote(text);
  if (norm.length < 4) return null;
  let best: PhilosophyQuote | null = null, bestScore = Infinity;
  for (const quote of PHILOSOPHY_QUOTES) {
    for (const form of [quote.ko, ...(quote.alsoAccept ?? [])]) {
      const target = normalizeQuote(form);
      const tolerance = target.length < 12 ? 1 : Math.max(2, Math.ceil(target.length * 0.12));
      const distance = levenshtein(norm, target, tolerance);
      const score = distance <= tolerance ? distance : target.includes(norm) && norm.length >= Math.ceil(target.length * 0.7) ? tolerance + 0.5 : Infinity;
      if (score < bestScore) { best = quote; bestScore = score; }
    }
  }
  return best;
}

/** 문장 속 사상가 이름(흔한 낱말과 겹치는 이름은 그 사람의 책 이름이 함께 있을 때만) */
function figuresIn(context: string): Set<string> {
  const found = new Set<string>();
  for (const match of context.matchAll(NAME_RE)) {
    const name = match[1];
    const needs = AMBIGUOUS[name];
    if (needs && !needs.some(title => context.includes(title))) continue;
    found.add(name);
  }
  // '프랜시스 베이컨'처럼 풀네임이면 책 이름 없이도 그 사람이다
  if (/프랜시스\s*베이컨/.test(context)) found.add("베이컨");
  if (/손무/.test(context)) found.add("손자");
  return found;
}
const titlesIn = (context: string) => [...context.matchAll(/[『《]([^』》\n]+)[』》]/g)].map(match => match[1].trim()).filter(title => KNOWN_TITLES.has(title));

type Span = { start: number; end: number; inner: string; double: boolean };
/** 따옴표 구간 — 큰따옴표(" “” 「」)를 먼저 잡고, 그 밖의 작은따옴표(' ‘’)를 잡는다 */
function quoteSpans(line: string): Span[] {
  const spans: Span[] = [];
  for (const match of line.matchAll(/"([^"\n]+)"|“([^”\n]+)”|「([^」\n]+)」/g)) spans.push({ start: match.index!, end: match.index! + match[0].length, inner: match[1] ?? match[2] ?? match[3], double: true });
  const masked = mask(line, spans);
  for (const match of masked.matchAll(/'([^'\n]+)'|‘([^’\n]+)’/g)) spans.push({ start: match.index!, end: match.index! + match[0].length, inner: line.slice(match.index! + 1, match.index! + match[0].length - 1), double: false });
  return spans.sort((a, b) => a.start - b.start);
}
const mask = (line: string, spans: Span[]) => spans.reduce((text, span) => text.slice(0, span.start) + "x".repeat(span.end - span.start) + text.slice(span.end), line);

/** 인용으로 볼 따옴표인지 — 강조 낱말('안전선')·장 이름('비용' 장)은 빼고, 작은따옴표는 문장 꼴일 때만 */
function looksQuoted(span: Span, line: string): boolean {
  if (/^\s*장(?![가-힣])/.test(line.slice(span.end))) return false;
  const norm = normalizeQuote(span.inner);
  if (span.double) return norm.length >= 6;
  // 작은따옴표는 강조에도 쓰여 문장 꼴이거나 '…'이라는(옛말·말처럼) 꼴일 때만
  return norm.length >= 6 && /^\s*이?라(?:는|고)/.test(line.slice(span.end)) || norm.length >= 8 && /\s/.test(span.inner.trim()) && /(?:[다요라까가오네지]|[.!?])\s*[.!?…]?$/.test(span.inner.trim());
}

const LINE_PREFIX = /^(\s*(?:>\s*)*(?:[-*+]\s+|\d+[.)]\s+)?)/;
const ATTRIBUTION_LINE = /^\s*(?:>\s*)*(?:[—–―]{1,2}|--)\s*(.{1,60})$/;
/** 문장 범위 — 따옴표 안의 마침표는 문장 끝으로 보지 않는다 */
function sentences(line: string, spans: Span[]): Array<{ start: number; end: number }> {
  const start = line.match(LINE_PREFIX)![1].length;
  // 따옴표가 문장부호로 끝나고 띄어 쓴 다음 말이 이어지면('"…다." 이번 주에는') 따옴표 끝이 문장 끝이다 — 출처 꼬리('— 노자', '(노자)')가 붙으면 아니다
  const ends = spans.filter(span => /[.!?…]\s*$/.test(span.inner) && /^\s+(?![—–―(\s])\S/.test(line.slice(span.end))).map(span => span.end);
  const masked = mask(line, spans);
  const out: Array<{ start: number; end: number }> = [];
  let from = start;
  const stops = [...[...masked.slice(start).matchAll(/[.!?…]+(?=\s|$)/g)].map(match => start + match.index! + match[0].length), ...ends].sort((a, b) => a - b);
  for (const end of stops) {
    if (end <= from) continue;
    out.push({ start: from, end });
    from = end;
  }
  if (line.slice(from).trim()) out.push({ start: from, end: line.length });
  return out;
}

type Judge = (quote: string, context: string, linked?: boolean) => QuoteGuardReason | null;

/** 본문에서 출처가 맞지 않는 명언 문장을 지운다. 지운 것이 없으면 본문은 글자 그대로다 */
export function guardPhilosophyQuotes(markdown: string, options: { allowedIds?: readonly string[]; maxQuotes?: number; keepFrom?: string } = {}): QuoteGuardResult {
  const allowed = options.allowedIds ? new Set(options.allowedIds) : null;
  // AI가 기존 본문을 다시 쓸 때, 원래 본문에 이미 있던 인용(대표가 직접 넣은 말 등)은 건드리지 않는다 — 새로 생긴 인용만 거른다
  const before = options.keepFrom ? normalizeQuote(options.keepFrom) : "";
  const findings: QuoteGuardFinding[] = [];
  let kept = 0;
  const judge: Judge = (quote, context, linked = true) => {
    if (before && normalizeQuote(quote).length >= 6 && before.includes(normalizeQuote(quote))) return null;
    if (KNOWN_MISQUOTES.some(pattern => pattern.test(quote))) return "known_misquote";
    if (!linked) return null; // 누가 한 말로 이어지지 않은 따옴표(상호·홍보 문구·강조)
    const names = figuresIn(context);
    if (!names.size && !PROVERB_MARKER.test(context.replace(quote, ""))) return null; // 사상가의 말로 인용한 것이 아니다(손님 말·강조)
    const match = matchPhilosophyQuote(quote);
    if (!match) return "unknown_quote";
    if (!match.aliases.some(alias => names.has(alias))) return names.size ? "wrong_source" : "no_source";
    if (titlesIn(context).some(title => !match.works.includes(title))) return "wrong_source";
    if (allowed && !allowed.has(match.id)) return "not_candidate";
    if (options.maxQuotes != null && kept >= options.maxQuotes) return "extra_quote";
    kept += 1;
    return null;
  };
  const lines = markdown.split("\n");
  const dropLine = new Set<number>();
  const cuts = new Map<number, Array<{ start: number; end: number }>>();
  const cut = (index: number, range: { start: number; end: number }) => cuts.set(index, [...(cuts.get(index) ?? []), range]);
  const reject = (reason: QuoteGuardReason, quote: string) => findings.push({ reason, quote: quote.trim().slice(0, 80) });
  let fenced = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
    if (fenced || /^\s*\|/.test(line) || !line.trim()) continue;
    const next = lines[i + 1] ?? "";
    const nextAttribution = startsWithFigure(next.match(ATTRIBUTION_LINE)?.[1] ?? "") ? next : "";
    const spans = quoteSpans(line).filter(span => looksQuoted(span, line));
    const ranges = sentences(line, spans);
    if (spans.length) {
      for (const span of spans) {
        const at = ranges.findIndex(item => span.start >= item.start && span.start < item.end);
        const range = ranges[at] ?? { start: 0, end: line.length };
        let context = line.slice(range.start, range.end) + (nextAttribution ? ` ${nextAttribution}` : "");
        // '노자는 이렇게 말했습니다. "…"'처럼 이름이 바로 앞 문장에 있으면 두 문장을 함께 본다(지울 때도 함께)
        const prev = at > 0 ? ranges[at - 1] : null;
        const lead = prev && !figuresIn(context).size && /(?:이렇게|다음과\s*같이|이런\s*말)[^.!?]*[.!?:]\s*$|:\s*$/.test(line.slice(prev.start, prev.end)) && figuresIn(line.slice(prev.start, prev.end)).size ? prev : null;
        if (lead) context = line.slice(lead.start, range.end);
        const linked = !!lead || !!nextAttribution || speechLinked(line.slice(range.start, span.start), line.slice(span.end, range.end));
        const reason = judge(span.inner, context, linked);
        if (!reason) continue;
        reject(reason, span.inner);
        cut(i, range);
        if (lead) cut(i, lead);
        if (nextAttribution) dropLine.add(i + 1);
      }
    } else {
      // 따옴표 없는 인용: '> 천 리 길도 … — 노자' 한 줄, 또는 다음 줄이 '— 노자'
      const content = line.slice(line.match(LINE_PREFIX)![1].length);
      const inline = content.match(/^(.*?\S)\s*[—–―]{1,2}\s*([^—–―]{1,60})$/);
      if (inline && startsWithFigure(inline[2]) && normalizeQuote(inline[1]).length >= 6 && !ATTRIBUTION_LINE.test(line)) {
        const reason = judge(inline[1], content);
        if (reason) { reject(reason, inline[1]); dropLine.add(i); }
      } else if (nextAttribution && /^\s*>/.test(line)) {
        const reason = judge(content, `${content} ${nextAttribution}`);
        if (reason) { reject(reason, content); dropLine.add(i); dropLine.add(i + 1); }
      }
    }
    // 오인용 문장은 따옴표가 없어도 지운다
    for (const range of ranges) {
      const sentence = line.slice(range.start, range.end);
      if (KNOWN_MISQUOTES.some(pattern => pattern.test(sentence)) && !(before && before.includes(normalizeQuote(sentence))) && !(cuts.get(i) ?? []).some(item => item.start === range.start) && !dropLine.has(i)) {
        reject("known_misquote", sentence);
        cut(i, range);
      }
    }
  }
  if (!findings.length) return { markdown, removed: 0, findings };
  const out: string[] = [];
  lines.forEach((line, index) => {
    if (dropLine.has(index)) return;
    const ranges = cuts.get(index);
    if (!ranges) { out.push(line); return; }
    const prefix = line.match(LINE_PREFIX)![1];
    let text = line;
    for (const range of [...new Map(ranges.map(item => [item.start, item])).values()].sort((a, b) => b.start - a.start)) text = `${text.slice(0, range.start).trimEnd()} ${text.slice(range.end).trimStart()}`;
    const body = text.slice(Math.min(prefix.length, text.length)).trim();
    if (body) out.push(`${prefix}${body}`);
  });
  return { markdown: out.join("\n").replace(/\n{3,}/g, "\n\n").trim(), removed: findings.length, findings };
}

/** 저장 전에 거르고 지운 횟수를 운영 로그로 남긴다(본문은 남기지 않는다 — 걸린 이유와 횟수만) */
export function guardSectionQuotes(markdown: string, log: { where: string; section?: string; allowedIds?: readonly string[]; maxQuotes?: number; keepFrom?: string }): string {
  const result = guardPhilosophyQuotes(markdown, { allowedIds: log.allowedIds, maxQuotes: log.maxQuotes, keepFrom: log.keepFrom });
  if (result.removed) console.info("[philosophy-quote] removed", JSON.stringify({ where: log.where, section: log.section ?? null, removed: result.removed, reasons: result.findings.map(finding => finding.reason) }));
  return result.markdown;
}
