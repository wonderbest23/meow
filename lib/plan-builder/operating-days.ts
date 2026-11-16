/*
 * 영업일 읽기(2026-11-16 사장님) — "주말에만 할 거야" 같은 말이 메모나 사업 설명에 있으면 계산표도 그 날수로 맞춘다.
 * 예전엔 '하루 ○건'에 늘 월 26일을 곱해서, 방향 글은 주말 기준인데 계산표는 26일 기준으로 어긋났다(실제 AI 확인 2026-11-16).
 * 규칙으로만 읽는다(같은 말이면 늘 같은 날수). 못 읽으면 null — 그때는 예전처럼 월 26일(주 6일)로 계산한다.
 */
const KO_COUNT: Record<string, number> = { 한: 1, 하루: 1, 일: 1, 두: 2, 이: 2, 이틀: 2, 세: 3, 삼: 3, 사흘: 3, 네: 4, 사: 4, 나흘: 4, 다섯: 5, 오: 5, 닷새: 5, 여섯: 6, 육: 6, 엿새: 6, 일곱: 7, 칠: 7 };
const DAY_NAMES = "월화수목금토일";
export type OperatingDays = { daysPerWeek: number; phrase: string };

function readOne(text: string): OperatingDays | null {
  const found = (daysPerWeek: number, match: RegExpMatchArray) => ({ daysPerWeek, phrase: match[0].trim() });
  let match: RegExpMatchArray | null;
  if ((match = text.match(/연중\s*무휴|하루도\s*안\s*쉬|매일\s*(?:열|영업|운영|할|해|문)/))) return found(7, match);
  if ((match = text.match(/주말\s*(?:에만|만|이틀만|에만\s*열|\s*영업|에만\s*할)|토\s*[·,]?\s*일(?:요일)?\s*(?:에만|만)/))) return found(2, match);
  if ((match = text.match(/평일\s*(?:에만|만|\s*영업)|주중\s*(?:에만|만)/))) return found(5, match);
  // '주 3일' · '일주일에 사흘만' · '주 5일만' — 날수를 말할 때만(주 2회 수업 같은 횟수는 영업일이 아니다)
  if ((match = text.match(/(?:일주일에|한\s*주에|주)\s*(\d|이틀|사흘|나흘|닷새|엿새|한|두|세|네|다섯|여섯|일곱)\s*(?:일)?\s*(?:만|씩|만\s*열|\s*영업|\s*근무|\s*운영)?(?![가-힣]*(?:회|번|시간|명|건|개))/))) {
    const raw = match[1], days = /\d/.test(raw) ? Number(raw) : KO_COUNT[raw];
    const said = /일|이틀|사흘|나흘|닷새|엿새/.test(match[0].replace(/일주일에|한\s*주에/, ""));
    if (said && days >= 1 && days <= 7) return found(days, match);
  }
  // '토요일만' · '금토일만' · '화목만 열어요'
  if ((match = text.match(new RegExp(`((?:[${DAY_NAMES}]\\s*[·,]?\\s*){1,6})(?:요일)?\\s*(?:에만|만)`)))) {
    const days = new Set(match[1].replace(/[^월화수목금토일]/g, "")).size;
    if (days >= 1 && days <= 6 && !/[가-힣]$/.test(text.slice(0, match.index))) return found(days, match);
  }
  return null;
}

/** 여러 글 가운데 가장 나중 글에서 읽은 영업일 — 메모는 적은 순서대로 넘긴다(뒤에 적은 말이 이긴다) */
export function operatingDaysFrom(texts: ReadonlyArray<string | null | undefined>): OperatingDays | null {
  for (const text of [...texts].reverse()) { const read = text ? readOne(text) : null; if (read) return read; }
  return null;
}

/*
 * '하루 80건'을 영업일에 맞춰 '일주일 160건'으로 — 이 값을 읽는 계산(월 판매량 · 본전 · 현금흐름)이 모두 월 4.3주로 환산하게 된다.
 * 주 6일은 예전 가정(월 26일)과 같아 그대로 둔다. 하루 기준이 아닌 값('일주일 20명' · '한 달 100건')도 그대로 둔다.
 */
export function capacityForOperatingDays(capacity: string, daysPerWeek: number): string {
  if (daysPerWeek === 6 || daysPerWeek < 1 || daysPerWeek > 7) return capacity;
  return capacity.replace(/하루\s*([\d,]+)\s*([가-힣·]*)/, (whole, count: string, unit: string) => {
    const number = Number(count.replace(/,/g, ""));
    return Number.isFinite(number) ? `일주일 ${(number * daysPerWeek).toLocaleString("ko-KR")}${unit}` : whole;
  });
}
