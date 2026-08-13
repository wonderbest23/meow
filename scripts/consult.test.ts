/*
 * 창업 상담 규칙 검사.
 *
 * AI 를 부르지 않는다. 규칙 문서와 응답 형식이 우리가 정한 대로인지만 본다 —
 * 실제 대화 품질은 사람이 봐야 하고, 여기서 막고 싶은 것은 '규칙이 조용히
 * 빠지는 것'이다. 예전에 프롬프트에서 한 줄이 사라져도 아무도 몰랐다.
 */
import {
  CONSULT_SYSTEM,
  CONSULT_STARTERS,
  CONSULT_OPENING,
  consultReplySchema,
  profileLines,
  PROFILE_LABELS,
} from "../lib/consult/domain";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ✓ ${name}`);
    return;
  }
  failed += 1;
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

console.log("상담 규칙");

/* 요구사항 3·4 — 되묻고, 한 번에 하나씩 */
check("답만 하지 말고 되물으라는 규칙이 있다", CONSULT_SYSTEM.includes("다음 질문을 이어가세요"));
check("한 번에 질문 1개 규칙이 있다", /한 번에 질문 1개/.test(CONSULT_SYSTEM));
check("설문지처럼 나열하지 말라는 규칙이 있다", CONSULT_SYSTEM.includes("설문지처럼"));
check("이미 답한 것을 다시 묻지 말라는 규칙이 있다", CONSULT_SYSTEM.includes("다시 묻지 마세요"));

/* 요구사항 6 — 유형별로 다르게 */
check("은퇴·직장인·기존 아이템 유형이 규칙에 있다",
  CONSULT_SYSTEM.includes("은퇴") && CONSULT_SYSTEM.includes("직장인") && CONSULT_SYSTEM.includes("이미 아이템이 있는"));

/* 요구사항 7 — 중간 분석 */
check("중간 정리 규칙이 있다", CONSULT_SYSTEM.includes("중간 정리"));

/* 요구사항 8 — 추천은 이유와 주의점까지 */
check("업종 이름만 나열하지 말라는 규칙이 있다", CONSULT_SYSTEM.includes("업종 이름만 나열하지 말고"));

/* 요구사항 9 — 무조건 긍정 금지 */
check("맞지 않으면 맞다고 하지 말라는 규칙이 있다", CONSULT_SYSTEM.includes("맞다고 하지 마세요"));
check("수치를 지어내지 말라는 규칙이 있다", CONSULT_SYSTEM.includes("지어내지 마세요"));

/* 요구사항 10 — 돈 이야기는 나중 */
check("먼저 가격을 꺼내지 말라는 규칙이 있다", CONSULT_SYSTEM.includes("먼저 가격이나 결제를 꺼내지 마세요"));

/* 요구사항 13 — 말투 */
check("답변 길이 상한이 규칙에 있다", /3~5문장/.test(CONSULT_SYSTEM));

/* 실제 대화에서 profile 이 비고 같은 질문이 반복됐다 — 항목 이름을 알려주고 나서 고쳐졌다 */
check("채울 항목 이름이 규칙에 들어 있다",
  CONSULT_SYSTEM.includes("budget: 투자 가능 금액") && CONSULT_SYSTEM.includes("region: 희망 지역"));
check("profile 에 남기지 않으면 잊는다고 경고한다", CONSULT_SYSTEM.includes("다음 턴에 잊고"));

console.log("첫 화면");
check("빠른 선택이 6개다", CONSULT_STARTERS.length === 6, `${CONSULT_STARTERS.length}개`);
check("아이템 없는 사람용 보기가 있다", CONSULT_STARTERS.some((s) => s.includes("없어요")));
check("첫 인사가 가볍다(정해진 게 없어도 괜찮다고 말한다)", CONSULT_OPENING.includes("정해진 게 없어도"));

console.log("응답 형식");
const good = consultReplySchema.safeParse({ message: "안녕하세요" });
check("message 만 있어도 통과하고 나머지는 기본값이 채워진다",
  good.success && good.data.picks.length === 0 && good.data.ready === false);

const withPicks = consultReplySchema.safeParse({
  message: "추천드려요",
  picks: [{ name: "관리형 스터디카페", fit: 5, why: ["상시 직원이 필요 없음"], watch: ["입지 영향이 큼"] }],
});
check("추천은 이름·적합도·이유·주의점을 담는다", withPicks.success);

const tooMany = consultReplySchema.safeParse({
  message: "많이",
  picks: Array.from({ length: 4 }, () => ({ name: "가", fit: 3, why: [], watch: [] })),
});
check("추천은 3개를 넘지 못한다", !tooMany.success);

const badFit = consultReplySchema.safeParse({
  message: "이상한 적합도",
  picks: [{ name: "가", fit: 9, why: [], watch: [] }],
});
check("적합도는 1~5 밖을 못 쓴다", !badFit.success);

console.log("상담 카드");
check("모든 항목에 사람이 읽는 이름이 있다",
  Object.values(PROFILE_LABELS).every((label) => label.length > 0));
check("빈 항목은 줄로 만들지 않는다", profileLines({}).length === 0);
check("채운 것만 줄이 된다",
  profileLines({ budget: "5천만원", region: "경기" }).join("|") === "경기|5천만원"
  || profileLines({ budget: "5천만원", region: "경기" }).length === 2);

console.log(failed === 0 ? "\n전부 통과" : `\n${failed}개 실패`);
process.exit(failed === 0 ? 0 : 1);
