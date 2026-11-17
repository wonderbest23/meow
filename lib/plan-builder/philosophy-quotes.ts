/*
 * 철학자의 말(대표 결정 2026-11-17: "아무리 가치 없어 보이는 사업이라도 니체·헤겔처럼 궁극적으로 희망적인 말로 '이게 가능하다'고 보이게 이끈다"
 * → "좀 더 철학적인 인물과 말투 인용을 더 많이 가져와서 대입해").
 *
 * 출처를 하나씩 대조한 51개(scratchpad quotes/verified.json, 2026-11-17)를 코드 상수로 옮겼다. 검증 메모를 따라:
 * - 『논어』는 판본마다 장 번호가 달라 편 이름만, 『도덕경』 64장은 '(통행본)'을 붙인다.
 * - 헤겔 '미네르바의 부엉이'는 되돌아보는 자리에서만(reviewOnly) — 시작·희망 문장으로 쓰면 오독이다.
 * - 베이컨 '아는 것 그 자체가 힘이다'는 신학 논변이라 메모가 권한 『신기관』 1권 경구 3으로 바꿨다. 파스칼 '마음의 이유'는 신앙 맥락이고 대체 문장이 없어 뺐다(50개).
 * - 무거운 말(heavy: 니체 '나를 죽이지 않는 것', 맹자 '큰일을 맡기려 할 때', 아우렐리우스 '마지막 행동처럼', 소크라테스 '검토하지 않는 삶', 카뮈 시지프)은
 *   기본 후보에서 빠지고, 어려움·되돌아보기 자리가 모자랄 때만 하나 들어간다.
 * - 소로·윌리엄 제임스·손자 '위태롭지 않다'는 결과 약속으로 읽힐 수 있어(promiseRisk) 후보에 주의를 붙이고 기다리는 화면에는 쓰지 않는다.
 * - '시작이 절반'·'제비 한 마리'는 철학자가 인용한 옛말(proverb) — "아리스토텔레스가 『정치학』에서 인용한 옛말처럼"으로 쓴다.
 * - 사르트르·카뮈는 저작권 보호 기간(copyright) — 한 문장, 출처 표기만.
 *
 * 장마다 그 장에 맞는 자리(slot)로 후보 3~5개를 고른다. 순서는 계획서 id로 정해져(같은 계획서는 언제나 같은 후보) 사업마다 다른 문장이 나오고,
 * 한 계획서 안에서는 장끼리 후보가 겹치지 않아 같은 명언이 두 번 나오지 않는다. AI 호출은 늘지 않는다(지시문에 몇 줄 더할 뿐).
 * 본문에 나온 인용이 이 목록과 맞는지는 quote-guard.ts가 저장 전에 거른다.
 */

export type QuoteSlot = "start" | "firststep" | "persist" | "limit" | "review" | "meaning" | "customer" | "value" | "difficulty" | "plan";
export const QUOTE_SLOTS: readonly QuoteSlot[] = ["start", "firststep", "persist", "limit", "review", "meaning", "customer", "value", "difficulty", "plan"];

export interface PhilosophyQuote {
  id: string;
  /** 본문에서 부르는 이름 */
  author: string;
  /** 이 말의 출처로 맞는 이름(가짜 명언 거르기에서 출처를 맞춘다) — 옛말 인용은 인용한 철학자 모두 */
  aliases: readonly string[];
  /** 책 이름(『』 없이) */
  works: readonly string[];
  /** 화면·지시문에 쓰는 짧은 출처 — "니체 『우상의 황혼』" */
  source: string;
  /** 검증한 위치(판본 기준) — 화면에는 쓰지 않는다 */
  locus: string;
  /** 본문에 글자 그대로 넣을 한국어 문장 */
  ko: string;
  /** 쓸 수 있는 자리 */
  slots: readonly QuoteSlot[];
  /** 기다리는 화면에 한 줄로 넣을 만큼 짧다 */
  short: boolean;
  /** 무거운 말 — 기본 후보에서 빠지고 어려움·되돌아보기 자리에서만 드물게 */
  heavy?: true;
  /** 결과 약속으로 읽힐 수 있다 — 조건으로만, 기다리는 화면에는 쓰지 않는다 */
  promiseRisk?: true;
  /** 철학자가 인용한 옛말 */
  proverb?: true;
  /** 되돌아보는 자리에서만 */
  reviewOnly?: true;
  /** 저작권 보호 기간 — 한 문장, 출처 표기만 */
  copyright?: true;
  /** 같은 원문으로 인정하는 다른 꼴(앞부분을 줄이기 전 문장 등) */
  alsoAccept?: readonly string[];
  /** 쓰는 법 주의 — 후보 줄에 짧게 붙는다 */
  hint?: string;
}

export const PHILOSOPHY_QUOTES: readonly PhilosophyQuote[] = [
  { id: "nietzsche-why", author: "니체", aliases: ["니체"], works: ["우상의 황혼"], source: "니체 『우상의 황혼』", locus: "잠언과 화살 12", ko: "자기 삶의 '왜'를 가진 사람은 거의 어떤 '어떻게'도 견뎌 낸다.", slots: ["meaning", "difficulty"], short: false },
  { id: "nietzsche-amorfati", author: "니체", aliases: ["니체"], works: ["즐거운 학문"], source: "니체 『즐거운 학문』", locus: "4권 276절 ('새해에')", ko: "사물의 필연을 아름답게 보는 법을 더 배우고 싶다. 아모르 파티, 이제부터 이것이 내 사랑이기를.", slots: ["difficulty", "meaning"], short: false, hint: "'운명을 사랑하라'로 줄이지 않는다" },
  { id: "nietzsche-become", author: "니체", aliases: ["니체"], works: ["즐거운 학문"], source: "니체 『즐거운 학문』", locus: "3권 270절", ko: "네 양심은 무엇을 말하는가? '너는 너 자신이 되어야 한다.'", slots: ["meaning", "start"], short: false },
  { id: "nietzsche-stronger", author: "니체", aliases: ["니체"], works: ["우상의 황혼"], source: "니체 『우상의 황혼』", locus: "잠언과 화살 8", ko: "나를 죽이지 않는 것은 나를 더 강하게 만든다.", slots: ["difficulty"], short: false, heavy: true, alsoAccept: ["삶이라는 전쟁 학교에서 — 나를 죽이지 않는 것은 나를 더 강하게 만든다."], hint: "실패를 겪은 대표에게는 쓰지 않는다" },
  { id: "nietzsche-chaos", author: "니체", aliases: ["니체"], works: ["차라투스트라는 이렇게 말했다"], source: "니체 『차라투스트라는 이렇게 말했다』", locus: "서문(Vorrede) 5", ko: "춤추는 별을 낳으려면 자기 안에 아직 혼돈을 품고 있어야 한다.", slots: ["start"], short: false, hint: "'혼돈'은 아직 정리 안 된 생각 정도로 가볍게" },
  { id: "hegel-passion", author: "헤겔", aliases: ["헤겔"], works: ["역사철학 강의"], source: "헤겔 『역사철학 강의』", locus: "서론 (Sibree 영역 §26, '정신이 이념을 실현하는 수단')", ko: "정열 없이 이루어진 위대한 일은 세상에 없다.", slots: ["start", "meaning"], short: true },
  { id: "hegel-owl", author: "헤겔", aliases: ["헤겔"], works: ["법철학"], source: "헤겔 『법철학』", locus: "서문(Vorrede) 끝부분", ko: "미네르바의 부엉이는 땅거미가 질 무렵에야 날기 시작한다.", slots: ["review"], short: false, reviewOnly: true, hint: "되돌아보는 문단에만, 시작·희망 문장으로 쓰지 않는다" },
  { id: "kant-sapere-aude", author: "칸트", aliases: ["칸트"], works: ["계몽이란 무엇인가에 대한 답변"], source: "칸트 『계몽이란 무엇인가에 대한 답변』", locus: "첫 문단 (1784, 베를린 월보 481쪽; 학술원판 8권 35쪽)", ko: "감히 알려고 하라! 너 자신의 지성을 쓸 용기를 가져라.", slots: ["start"], short: false },
  { id: "seneca-dare", author: "세네카", aliases: ["세네카"], works: ["루킬리우스에게 보내는 편지"], source: "세네카 『루킬리우스에게 보내는 편지』", locus: "편지 104, 26절", ko: "어려워서 감히 못 하는 것이 아니라, 감히 하지 않기 때문에 어려운 것이다.", slots: ["start", "difficulty"], short: false },
  { id: "seneca-harbor", author: "세네카", aliases: ["세네카"], works: ["루킬리우스에게 보내는 편지"], source: "세네카 『루킬리우스에게 보내는 편지』", locus: "편지 71, 3절", ko: "어느 항구로 갈지 모르는 사람에게는 어떤 바람도 순풍이 아니다.", slots: ["plan", "meaning"], short: false },
  { id: "seneca-time", author: "세네카", aliases: ["세네카"], works: ["인생의 짧음에 관하여"], source: "세네카 『인생의 짧음에 관하여』", locus: "1장 3절", ko: "우리에게 시간이 적은 것이 아니라, 우리가 많이 허비한 것이다.", slots: ["plan", "review"], short: false },
  { id: "epictetus-control", author: "에픽테토스", aliases: ["에픽테토스"], works: ["엥케이리디온"], source: "에픽테토스 『엥케이리디온』", locus: "1장 1절", ko: "어떤 것은 우리에게 달려 있고, 어떤 것은 우리에게 달려 있지 않다.", slots: ["limit", "plan"], short: false },
  { id: "epictetus-fig", author: "에픽테토스", aliases: ["에픽테토스"], works: ["담화록"], source: "에픽테토스 『담화록』", locus: "1권 15장 7절", ko: "위대한 것은 무엇도 갑자기 생기지 않는다. 포도 한 송이도, 무화과 하나도 그렇다.", slots: ["persist"], short: false },
  { id: "marcus-obstacle", author: "마르쿠스 아우렐리우스", aliases: ["마르쿠스 아우렐리우스", "아우렐리우스"], works: ["명상록"], source: "마르쿠스 아우렐리우스 『명상록』", locus: "5권 20절", ko: "행동을 가로막는 것이 행동을 나아가게 하고, 길을 막아선 것이 길잡이가 된다.", slots: ["difficulty"], short: false },
  { id: "marcus-last-act", author: "마르쿠스 아우렐리우스", aliases: ["마르쿠스 아우렐리우스", "아우렐리우스"], works: ["명상록"], source: "마르쿠스 아우렐리우스 『명상록』", locus: "2권 5절", ko: "삶의 모든 행동을 생애 마지막 행동처럼 하면, 헛된 생각에서 벗어날 수 있다.", slots: ["meaning", "persist"], short: false, heavy: true },
  { id: "aristotle-become-by-doing", author: "아리스토텔레스", aliases: ["아리스토텔레스"], works: ["니코마코스 윤리학"], source: "아리스토텔레스 『니코마코스 윤리학』", locus: "2권 1장 (1103a34–b2)", ko: "우리는 정의로운 일을 하면서 정의로워지고, 용감한 일을 하면서 용감해진다.", slots: ["firststep", "persist"], short: false },
  { id: "aristotle-learn-by-doing", author: "아리스토텔레스", aliases: ["아리스토텔레스"], works: ["니코마코스 윤리학"], source: "아리스토텔레스 『니코마코스 윤리학』", locus: "2권 1장 (1103a32–33)", ko: "할 줄 알게 되기 전에 배워야 하는 것들은, 직접 해 보면서 배운다.", slots: ["firststep", "start"], short: false },
  { id: "beginning-half", author: "아리스토텔레스", aliases: ["아리스토텔레스", "플라톤"], works: ["정치학", "법률", "니코마코스 윤리학"], source: "아리스토텔레스 『정치학』(옛말 인용)", locus: "플라톤 법률 6권 753e; 아리스토텔레스 정치학 5권 4장 1303b29", ko: "시작이 전체의 절반이다.", slots: ["start", "limit"], short: true, proverb: true, alsoAccept: ["시작이 전체의 절반이라는 옛말이 있다."] },
  { id: "aristotle-swallow", author: "아리스토텔레스", aliases: ["아리스토텔레스"], works: ["니코마코스 윤리학"], source: "아리스토텔레스 『니코마코스 윤리학』(옛말 인용)", locus: "1권 7장 (1098a18–19)", ko: "제비 한 마리가 봄을 만들지 않고, 하루가 봄을 만들지도 않는다.", slots: ["persist", "review"], short: false, proverb: true },
  { id: "socrates-examined-life", author: "소크라테스", aliases: ["소크라테스", "플라톤"], works: ["소크라테스의 변명"], source: "플라톤 『소크라테스의 변명』", locus: "38a", ko: "검토하지 않는 삶은 사람이 살 만한 삶이 아니다.", slots: ["review", "meaning"], short: true, heavy: true },
  { id: "confucius-knowing", author: "공자", aliases: ["공자"], works: ["논어"], source: "공자 『논어』 위정", locus: "위정(爲政) 17", ko: "아는 것을 안다 하고 모르는 것을 모른다 하는 것, 그것이 아는 것이다.", slots: ["review", "limit"], short: false },
  { id: "confucius-learning", author: "공자", aliases: ["공자"], works: ["논어"], source: "공자 『논어』 학이", locus: "학이(學而) 1", ko: "배우고 때때로 익히니, 또한 기쁘지 아니한가.", slots: ["persist"], short: true },
  { id: "confucius-haste", author: "공자", aliases: ["공자"], works: ["논어"], source: "공자 『논어』 자로", locus: "자로(子路) 17", ko: "빨리 하려 들면 이르지 못하고, 작은 이익을 보면 큰일을 이루지 못한다.", slots: ["limit", "persist"], short: false },
  { id: "confucius-mound", author: "공자", aliases: ["공자"], works: ["논어"], source: "공자 『논어』 자한", locus: "자한(子罕) 18 (주자 집주·Legge 기준; ctext 등은 19)", ko: "산을 쌓다 한 삼태기가 모자라 멈췄다면 멈춘 것은 나다. 평지에 한 삼태기를 부었어도 나아갔다면 나아간 것은 나다.", slots: ["persist", "firststep"], short: false, hint: "앞뒤 두 문장을 함께" },
  { id: "confucius-foresight", author: "공자", aliases: ["공자"], works: ["논어"], source: "공자 『논어』 위령공", locus: "위령공(衛靈公) 11 (주자 집주·Legge 기준; ctext 등은 12)", ko: "멀리 내다보는 생각이 없으면 반드시 가까운 근심이 생긴다.", slots: ["plan", "limit"], short: false },
  { id: "mencius-great-task", author: "맹자", aliases: ["맹자"], works: ["맹자"], source: "맹자 『맹자』 고자 하", locus: "고자 하(告子下) 15", ko: "하늘이 어떤 사람에게 큰일을 맡기려 할 때는 먼저 그 마음을 괴롭히고 몸을 수고롭게 한다. 그렇게 하지 못하던 일을 해낼 힘을 더해 준다.", slots: ["difficulty"], short: false, heavy: true, hint: "두 문장을 함께, 고생을 미화하지 않는다" },
  { id: "laozi-thousand-li", author: "노자", aliases: ["노자"], works: ["도덕경"], source: "노자 『도덕경』 64장(통행본)", locus: "64장 (왕필본)", ko: "천 리 길도 발밑에서 시작된다.", slots: ["firststep", "start"], short: true },
  { id: "laozi-sprout", author: "노자", aliases: ["노자"], works: ["도덕경"], source: "노자 『도덕경』 64장(통행본)", locus: "64장 (왕필본)", ko: "아름드리 나무도 털끝 같은 싹에서 자라고, 구층 누대도 흙을 쌓는 데서 시작된다.", slots: ["firststep", "persist"], short: false },
  { id: "laozi-small-first", author: "노자", aliases: ["노자"], works: ["도덕경"], source: "노자 『도덕경』 63장", locus: "63장", ko: "어려운 일은 쉬울 때 꾀하고, 큰일은 작을 때 한다. 세상의 큰일은 반드시 작은 일에서 시작된다.", slots: ["plan", "firststep"], short: false },
  { id: "zhuangzi-useless", author: "장자", aliases: ["장자"], works: ["장자"], source: "장자 『장자』 인간세", locus: "내편 인간세(人間世) 마지막 문장", ko: "사람들은 모두 쓸모 있는 것의 쓸모는 알지만, 쓸모없는 것의 쓸모는 알지 못한다.", slots: ["value"], short: false, hint: "장자가 사업을 두고 한 말처럼 풀지 않는다" },
  { id: "xunzi-half-steps", author: "순자", aliases: ["순자"], works: ["순자"], source: "순자 『순자』 권학", locus: "권학(勸學)", ko: "반걸음이 쌓이지 않으면 천 리에 이를 수 없고, 작은 물줄기가 모이지 않으면 강과 바다를 이룰 수 없다.", slots: ["firststep", "persist"], short: false },
  { id: "descartes-divide", author: "데카르트", aliases: ["데카르트"], works: ["방법서설"], source: "데카르트 『방법서설』", locus: "2부, 네 규칙 중 둘째", ko: "살펴볼 어려움 하나하나를 가능한 만큼, 또 잘 풀기 위해 필요한 만큼 작은 부분으로 나눈다.", slots: ["plan"], short: false },
  { id: "spinoza-rare", author: "스피노자", aliases: ["스피노자"], works: ["에티카"], source: "스피노자 『에티카』", locus: "5부 정리 42 주석 (책의 마지막 문장)", ko: "모든 고귀한 것은 드문 만큼 어렵다.", slots: ["difficulty"], short: true },
  { id: "schopenhauer-target", author: "쇼펜하우어", aliases: ["쇼펜하우어"], works: ["의지와 표상으로서의 세계"], source: "쇼펜하우어 『의지와 표상으로서의 세계』", locus: "31장 '천재에 관하여'", ko: "재능은 남들이 닿지 못하는 과녁을 맞히는 사수와 같고, 천재는 남들이 보지도 못하는 과녁을 맞히는 사수와 같다.", slots: ["value"], short: false, hint: "남들이 못 보는 기회를 말할 때만" },
  { id: "kierkegaard-backwards", author: "키르케고르", aliases: ["키르케고르", "키에르케고르"], works: ["일기"], source: "키르케고르 『일기』", locus: "1843년 일기 JJ:167 (구 Papirer IV A 164)", ko: "삶은 뒤를 돌아보며 이해된다는 철학자들의 말은 옳다. 그러나 삶은 앞을 향해 살아야 한다는 다른 말을 잊어서는 안 된다.", slots: ["review", "start"], short: false },
  { id: "emerson-trust", author: "에머슨", aliases: ["에머슨"], works: ["자기 신뢰"], source: "에머슨 『자기 신뢰』", locus: "에세이 본문 (Essays, 1841)", ko: "너 자신을 믿어라.", slots: ["start", "meaning"], short: true, alsoAccept: ["너 자신을 믿어라. 모든 마음은 그 쇠줄에 맞춰 떨린다."] },
  { id: "thoreau-dreams", author: "소로", aliases: ["소로", "소로우"], works: ["월든"], source: "소로 『월든』", locus: "맺음말(Conclusion)", ko: "꿈의 방향으로 자신 있게 나아가며 상상한 삶을 살려고 애쓰면, 평소에는 기대하지 못한 성공을 만나게 된다.", slots: ["start", "meaning"], short: false, promiseRisk: true, hint: "결과 약속이 아니라 소로의 체험담으로" },
  { id: "james-believe", author: "윌리엄 제임스", aliases: ["윌리엄 제임스"], works: ["삶은 살 가치가 있는가"], source: "윌리엄 제임스 『삶은 살 가치가 있는가』", locus: "강연 맺음말 (1895, International Journal of Ethics 6권 1호 24쪽)", ko: "삶을 두려워하지 말라. 삶이 살 가치가 있다고 믿으라. 그 믿음이 그 사실을 만드는 데 힘을 보탤 것이다.", slots: ["meaning", "start"], short: false, promiseRisk: true, hint: "'힘을 보탠다'까지만, 매출 약속으로 잇지 않는다" },
  { id: "sartre-makes-himself", author: "사르트르", aliases: ["사르트르"], works: ["실존주의는 휴머니즘이다"], source: "사르트르 『실존주의는 휴머니즘이다』", locus: "1945년 강연 (1946 출간), '실존주의의 제1원리' 대목", ko: "인간은 스스로 만들어 가는 것 외에 아무것도 아니다.", slots: ["meaning", "start"], short: true, copyright: true },
  { id: "camus-sisyphus", author: "카뮈", aliases: ["카뮈", "까뮈"], works: ["시지프 신화"], source: "카뮈 『시지프 신화』", locus: "마지막 장 '시지프 신화' 끝 문장", ko: "정상을 향한 투쟁 그 자체로 사람의 마음을 채우기에 충분하다. 행복한 시지프를 떠올려야 한다.", slots: ["persist", "difficulty"], short: false, heavy: true, copyright: true },
  { id: "montaigne-que-sais-je", author: "몽테뉴", aliases: ["몽테뉴"], works: ["수상록", "에세"], source: "몽테뉴 『수상록』", locus: "2권 12장 '레몽 스봉의 변호'", ko: "나는 무엇을 아는가?", slots: ["review"], short: true },
  { id: "bacon-novum-organum", author: "베이컨", aliases: ["베이컨", "프랜시스 베이컨"], works: ["신기관"], source: "베이컨 『신기관』", locus: "1권 경구 3", ko: "인간의 앎과 인간의 힘은 하나로 만난다. 원인을 모르면 결과를 낼 수 없다.", slots: ["review", "plan"], short: false },
  { id: "voltaire-garden", author: "볼테르", aliases: ["볼테르"], works: ["캉디드"], source: "볼테르 『캉디드』", locus: "30장 마지막 문장", ko: "우리는 우리 밭을 가꾸어야 한다.", slots: ["persist", "plan"], short: false, alsoAccept: ["좋은 말씀입니다. 그래도 우리는 우리 밭을 가꾸어야 합니다."] },
  { id: "heraclitus-other-waters", author: "헤라클레이토스", aliases: ["헤라클레이토스"], works: ["단편"], source: "헤라클레이토스 단편(B12)", locus: "DK 22 B12 (아리우스 디뒤모스 경유, 에우세비오스 인용)", ko: "같은 강에 들어서는 이들에게도 늘 다른 물이 흘러온다.", slots: ["review"], short: true, hint: "'같은 강에 두 번'으로 바꾸지 않는다" },
  { id: "zhongyong-prepare", author: "중용", aliases: ["중용"], works: ["중용"], source: "『중용』 20장", locus: "20장", ko: "모든 일은 미리 준비하면 서고, 준비하지 않으면 무너진다.", slots: ["plan", "limit"], short: false, hint: "공자의 말로 단정하지 않는다" },
  { id: "confucius-establish-others", author: "공자", aliases: ["공자"], works: ["논어"], source: "공자 『논어』 옹야", locus: "옹야(雍也) 28 (주자 집주·Legge 기준; ctext 등은 30)", ko: "어진 사람은 자기가 서고 싶으면 남을 세워 주고, 자기가 이루고 싶으면 남이 이루게 돕는다.", slots: ["customer"], short: false },
  { id: "sunzi-know-both", author: "손자", aliases: ["손자", "손무"], works: ["손자병법"], source: "손자 『손자병법』 모공", locus: "모공(謀攻) 편 끝", ko: "상대를 알고 나를 알면 백 번 싸워도 위태롭지 않다.", slots: ["customer", "limit"], short: true, promiseRisk: true, hint: "'백전백승'으로 바꾸지 않고 고객·시장 이해로" },
  { id: "sunzi-cannot-lose-first", author: "손자", aliases: ["손자", "손무"], works: ["손자병법"], source: "손자 『손자병법』 군형", locus: "군형(軍形) 편 첫머리", ko: "예로부터 잘 싸우는 이는 먼저 지지 않을 태세를 갖추고, 이길 수 있는 때를 기다렸다.", slots: ["limit", "plan"], short: false, hint: "경쟁자를 적으로 부르지 않는다" },
  { id: "epictetus-write", author: "에픽테토스", aliases: ["에픽테토스"], works: ["담화록"], source: "에픽테토스 『담화록』", locus: "2권 18장 1–2절", ko: "잘 읽는 사람이 되고 싶으면 읽고, 잘 쓰는 사람이 되고 싶으면 써라.", slots: ["start", "persist"], short: false },
  { id: "seneca-everywhere", author: "세네카", aliases: ["세네카"], works: ["루킬리우스에게 보내는 편지"], source: "세네카 『루킬리우스에게 보내는 편지』", locus: "편지 2, 2절", ko: "어디에나 있는 사람은 어디에도 없다.", slots: ["plan", "limit"], short: true },
];

const BY_ID = new Map(PHILOSOPHY_QUOTES.map(quote => [quote.id, quote]));
export const philosophyQuote = (id: string) => BY_ID.get(id);

/*
 * 장마다 어울리는 자리(앞에 둔 자리부터 하나씩 돌아가며 고른다).
 * 실행 요약·한눈에 보기 → 의미·시작·쓸모, 돈 장 → 지켜야 할 선·계획(그리고 '지켜야 할 선' 문단의 어려움), 12주 할 일 → 첫걸음·되돌아보기·계획·꾸준함,
 * 고객 장 → 손님, 위험이 나오는 장 → 어려움.
 * '쓸모'(장자 '쓸모없음의 쓸모'·쇼펜하우어 '남들이 못 보는 과녁') 말은 둘뿐이라 두 요약 장이 먼저 갖게 다른 장에서는 맨 뒤에 둔다 —
 * "가치 없어 보이는 사업에서 쓸모를 찾는다"는 대표 결정이 계획서의 첫 장·마지막 장에 오게.
 */
export const SECTION_QUOTE_SLOTS: Record<string, readonly QuoteSlot[]> = {
  "overview/summary": ["value", "meaning", "start"],
  "overview/problem": ["customer", "review", "value", "start"],
  "overview/mission": ["meaning", "value", "start"],
  "overview/ip": ["plan", "value"],
  "overview/achievements": ["review", "persist"],
  "overview/structure": ["plan", "limit"],
  "market/products": ["plan", "firststep", "value"],
  "market/segments": ["customer", "limit"],
  "market/personas": ["customer", "meaning", "firststep"],
  "market/competitors": ["customer", "limit", "value"],
  "market/swot": ["review", "difficulty", "limit"],
  "objectives/corporate": ["plan", "meaning", "persist"],
  "strategy/product": ["persist", "plan", "value"],
  "strategy/distribution": ["plan", "customer", "limit"],
  "strategy/price": ["limit", "plan", "value", "review"],
  "strategy/promotion": ["customer", "start", "firststep"],
  "strategy/people": ["customer", "persist", "plan"],
  "strategy/exit": ["review", "plan", "meaning"],
  "funding/requirements": ["limit", "plan"],
  "financials/revenue": ["plan", "limit", "persist"],
  "financials/staffing": ["plan", "persist"],
  "financials/expenses": ["limit", "plan", "difficulty"],
  "financials/assets": ["limit", "plan"],
  "financials/financing": ["limit", "plan", "difficulty"],
  "summary/roadmap": ["firststep", "review", "plan", "persist"],
  "summary/executive": ["meaning", "value", "start", "difficulty"],
};
const DEFAULT_SLOTS: readonly QuoteSlot[] = ["meaning", "plan", "persist"];
export const sectionQuoteSlots = (key: string) => SECTION_QUOTE_SLOTS[key] ?? DEFAULT_SLOTS;
/** 헤겔 '부엉이'처럼 되돌아보기에만 맞는 말이 들어갈 수 있는 장 */
const REVIEW_SECTIONS = new Set(["summary/roadmap", "overview/achievements", "market/swot", "strategy/exit"]);
/** 무거운 말이 들어갈 수 있는 자리 */
const HEAVY_SLOTS: readonly QuoteSlot[] = ["difficulty", "review"];
/** 먼저 고르는 장 — 대표가 가장 먼저 읽는 두 요약 장이 '쓸모' 같은 드문 자리를 먼저 갖는다 */
const FIRST_SECTIONS = ["overview/summary", "summary/executive", "financials/expenses", "summary/roadmap"];
export const QUOTE_CANDIDATES_PER_SECTION = 4;
const MIN_BEFORE_HEAVY = 2;

/* 계획서마다 정해지는 순서 — FNV-1a 해시로 씨앗을 만들고 xorshift로 섞는다(같은 씨앗이면 언제나 같은 순서) */
function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
  return hash >>> 0;
}
function seededOrder<T>(items: readonly T[], seed: string): T[] {
  let state = hash32(seed) || 1;
  const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x1_0000_0000; };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/**
 * 계획서 전체의 장별 후보. 장끼리 겹치지 않는다(같은 명언이 한 계획서에 두 번 나오지 않게).
 * 장을 동시에 써도 모든 장이 같은 씨앗·같은 장 목록으로 같은 표를 만들어 자기 몫만 쓰므로 결과가 같다.
 * 한 바퀴에 장마다 하나씩, 그 장의 자리를 돌아가며 고른다 — 앞 장이 드문 자리를 다 가져가 뒤 장이 비는 일을 줄인다.
 */
export function planQuoteCandidates(seed: string, sectionKeys: readonly string[]): Record<string, PhilosophyQuote[]> {
  const order = seededOrder(PHILOSOPHY_QUOTES, `philosophy:${seed}`);
  const used = new Set<string>();
  const keys = [...new Set([...FIRST_SECTIONS.filter(key => sectionKeys.includes(key)), ...sectionKeys])];
  const states = keys.map(key => ({ key, slots: sectionQuoteSlots(key), next: 0, picked: [] as PhilosophyQuote[] }));
  // 결과 약속으로 읽힐 수 있는 말(소로·제임스·손자)은 한 장에 하나까지
  const usable = (state: (typeof states)[number], quote: PhilosophyQuote, slot: QuoteSlot) => !used.has(quote.id) && quote.slots.includes(slot) && (!quote.reviewOnly || REVIEW_SECTIONS.has(state.key)) && !(quote.promiseRisk && state.picked.some(item => item.promiseRisk));
  const take = (state: (typeof states)[number], quote: PhilosophyQuote) => { state.picked.push(quote); used.add(quote.id); };
  for (let progress = true; progress;) {
    progress = false;
    for (const state of states) {
      if (state.picked.length >= QUOTE_CANDIDATES_PER_SECTION) continue;
      for (let turn = 0; turn < state.slots.length; turn++) {
        const slot = state.slots[(state.next + turn) % state.slots.length];
        const quote = order.find(item => !item.heavy && usable(state, item, slot));
        if (!quote) continue;
        take(state, quote);
        state.next = (state.next + turn + 1) % state.slots.length;
        progress = true;
        break;
      }
    }
  }
  // 무거운 말은 드물게 — 어려움·되돌아보기 자리의 후보가 하나 이하일 때, 계획서 전체에서 하나만
  for (const state of states) {
    if (state.picked.length >= MIN_BEFORE_HEAVY) continue;
    const quote = order.find(item => item.heavy && state.slots.some(slot => HEAVY_SLOTS.includes(slot) && usable(state, item, slot)));
    if (quote) { take(state, quote); break; }
  }
  // 보여 주는 순서도 계획서마다 섞는다 — 늘 같은 자리(예: '쓸모')가 맨 앞이면 AI가 매번 같은 말을 고르기 쉽다
  return Object.fromEntries(states.map(state => [state.key, seededOrder(state.picked, `philosophy:${seed}:${state.key}`)]));
}

/** 한 장의 후보 — 장 목록에 없는 장(한 장만 다시 쓰는 길)도 맨 뒤에 붙여 고른다 */
export function quoteCandidatesForSection(seed: string, sectionKeys: readonly string[], key: string): PhilosophyQuote[] {
  const keys = sectionKeys.includes(key) ? sectionKeys : [...sectionKeys, key];
  return planQuoteCandidates(seed, keys)[key] ?? [];
}

/*
 * 장 작성 지시문의 고정 규칙(시스템 지시문 — 장마다 같아 캐시가 유지된다). 후보 문장은 장마다 사용자 쪽 <task>에 붙는다.
 * 쉬운 말·숫자·보장 금지 규칙(<writing>·<facts>·<hope>)은 그대로 두고 덧붙인다.
 */
export const PHILOSOPHY_VOICE_RULES = `<philosophy>
이 문서는 작아 보이는 사업에서도 '이것이 가능하다'는 길을 찾아 주는 글입니다. 니체·헤겔·공자처럼 가능성과 의미와 조건을 먼저 말하고, 짧고 단정하고 따뜻한 문장으로 씁니다. 명언이 없는 문단도 같은 말투로 씁니다. 다만 어려운 한자어·철학 용어는 쓰지 않고, 쉬운 말과 숫자 규칙은 그대로 따릅니다.
- <task>의 '고를 수 있는 철학자의 말' 가운데 하나를 장마다 많아야 한 번, 장 첫 문단이나 '지켜야 할 선'·첫걸음 문단에 씁니다. 후보 문장을 글자 그대로 따옴표 안에 넣고 누가·어디서를 밝힙니다. 예: 니체는 『우상의 황혼』에서 "…"라고 했습니다. '옛말 인용'이 붙은 것은 '아리스토텔레스가 『정치학』에서 인용한 옛말처럼 "…"'으로 씁니다.
- 바로 다음 문장에서 이 사업의 실제 장면이나 숫자와 잇습니다. 명언만 두면 장식으로 읽히기 때문입니다.
- 명언은 태도와 조건을 말하는 데 쓰고 결과를 약속하는 데 쓰지 않습니다. 후보에 없는 명언·격언·속담·유명인의 말은 쓰지 않습니다. 출처가 틀린 인용은 문서 전체를 믿지 못하게 만들고, 저장할 때 지워집니다.
- 맨 앞 결론 문장('이 숫자라면 해 볼 만합니다. 조건은 ○○입니다')은 첫 문장 그대로 두고, 명언은 그 바로 뒤에 한 문장으로 붙입니다.
</philosophy>`;

/** 장마다 <task>에 붙는 후보 줄 — 출처, 글자 그대로의 문장, 짧은 주의 */
export function quoteCandidateLines(quotes: readonly PhilosophyQuote[]): string {
  if (!quotes.length) return "";
  return ["고를 수 있는 철학자의 말(<philosophy>대로 하나를 고르고, 이 장과 맞는 말이 없으면 쓰지 않습니다):", ...quotes.map(quote => `- ${quote.source}: "${quote.ko}"${quote.hint ? ` (${quote.hint})` : ""}`)].join("\n");
}

/** 기다리는 화면에 쓰는 이름 — "— 노자", 옛말은 "— 아리스토텔레스가 인용한 옛말" */
export const narrationAttribution = (quote: PhilosophyQuote) => (quote.proverb ? `${quote.author}가 인용한 옛말` : quote.author);
