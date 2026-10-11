import assert from "node:assert/strict";
import { INDUSTRY_PLAYBOOKS, playbookChecklist, playbookContext, playbookForKsic, playbookForText } from "../lib/plan-builder/industry-playbooks";
import { ksicByCode } from "../lib/plan-builder/ksic";
import { launchSteps, launchSchema } from "../lib/plan-builder/business-launch";
import type { Plan } from "../lib/plan-builder/plan-store";
import { INTAKE_VERSION } from "../lib/plan-builder/intake-types";

/*
 * 업종 가이드: 맞는 업종에만 붙고(더 구체적인 코드 우선), 다른 법을 따르는 비슷한 업종에는 붙지 않으며,
 * 순서에는 개정되기 쉬운 숫자(면적·시간·수수료)를 넣지 않고, 마지막 단계는 가게를 온라인에 여는 것이다.
 */
const expect: Array<[string, string | null]> = [
  ["56150", "bakery"], ["56221", "cafe"], ["56111", "restaurant"], ["56191", "snack"], ["47223", "side-dish"],
  ["96112", "beauty"], ["85501", "academy"], ["85632", "academy"], ["47912", "online-store"], ["91132", "gym"], ["55104", "lodging"],
  // 다른 법을 따르거나 운영 형태가 다른 업종에는 붙이지 않는다
  ["96111", null], ["85661", null], ["85503", null], ["47911", null], ["55101", null], ["85611", null], [null as unknown as string, null],
];
for (const [code, id] of expect) assert.equal(playbookForKsic(code)?.id ?? null, id, `${code} → ${id}`);

// 업종 코드가 없는 사업(상담으로 시작한 사업 대부분)은 사업 설명으로 찾는다. 매장 업종이 온라인 판매보다 먼저,
// '네이버 카페' 같은 홍보 채널은 카페 업종이 아니다(2026-10-11 빵집 시험: 코드가 없어 위생교육·건강진단이 계획서에서 빠짐)
const described: Array<[string, string | null]> = [
  ["아파트 상가 아침 빵집", "bakery"], ["동네 베이커리 카페", "bakery"], ["빵집인데 스마트스토어로도 팔아요", "bakery"],
  ["역 앞 커피 전문점", "cafe"], ["네이버 카페로 홍보하는 꽃집", null], ["동네 반찬 가게", "side-dish"], ["떡볶이 포장 전문", "snack"],
  ["주택가 한식 식당", "restaurant"], ["1인 네일숍", "beauty"], ["초등 영어 공부방", "academy"], ["24시간 헬스장", "gym"],
  ["농촌 민박", "lodging"], ["핸드메이드 액세서리 스마트스토어", "online-store"], ["꽃집", null], ["필라테스 스튜디오", null], ["", null],
  // 2026-10-11 공식 원문 확인 뒤 추가: 온라인 중개, 공간 시간 대여
  ["반려견 보호자와 동네 펫시터를 연결해 주는 예약 서비스", "brokerage"], ["혼자 지내는 어르신을 서로 소개해 주는 소개팅 서비스", "brokerage"],
  ["홍대 근처 댄스·보컬 연습실 시간 대여", "rental-room"],
];
for (const [text, id] of described) assert.equal(playbookForText(text)?.id ?? null, id, `${text} → ${id}`);
// 사전 점검(2026-10-11, 시험 사업 22개): 그 업종 사장님을 상대로 하는 서비스에는 매장 업종 가이드를 붙이지 않고, 펜션은 민박 가이드
assert.equal(playbookForText("동네 음식점 메뉴 사진을 찍어 주는 출장 사진 서비스", { customer: "배달앱에 입점한 동네 음식점 사장님" }), null);
assert.equal(playbookForText("동네 미용실 예약을 대신 받아 주는 월 구독 서비스", { customer: "1인 미용실 사장님" }), null);
assert.equal(playbookForText("아파트 상가 아침 빵집", { customer: "출근 전 30~40대 직장인" })?.id, "bakery");
assert.equal(playbookForText("제주 서귀포에서 독채 펜션 2동 운영")?.id, "lodging");
// 사전 점검 2차(공식 원문 확인): 반려동물 간식은 사료, 용달·이사는 화물 운송 허가, 세탁 수거는 세탁업
assert.equal(playbookForText("반려견 수제간식을 만들어 온라인으로 판매")?.id, "pet-treat");
assert.equal(playbookForText("원룸 1인 소형 이사 전문 용달")?.id, "moving-truck");
assert.equal(playbookForText("아파트 단지 세탁물 수거·배달 서비스")?.id, "laundry");
assert.equal(playbookForText("천연 세탁 세제를 스마트스토어로 판매")?.id, "online-store", "selling detergent is not a laundry business");
assert.equal(playbookForKsic("10901")?.id, "pet-treat"); assert.equal(playbookForKsic("49302")?.id, "moving-truck"); assert.equal(playbookForKsic("96912")?.id, "laundry");
assert.ok(INDUSTRY_PLAYBOOKS.find(item => item.id === "moving-truck")!.steps.some(step => /새 허가는 원칙적으로 나오지 않아/.test(step.detail)));
assert.ok(INDUSTRY_PLAYBOOKS.find(item => item.id === "pet-treat")!.steps.some(step => /사람 음식이 아니라 사료/.test(step.detail)));

for (const playbook of INDUSTRY_PLAYBOOKS) {
  for (const prefix of playbook.ksic) assert.ok(ksicByCode(prefix), `${playbook.id}: KSIC ${prefix} exists`);
  assert.ok(playbook.needs.length >= 3 && playbook.steps.length >= 4 && playbook.pitfalls.length >= 2, playbook.id);
  // '제1종·제2종 근린생활시설'은 바뀌는 기준값이 아니라 건축물 용도 분류 이름이라 허용한다
  for (const step of playbook.steps) assert.ok(!/\d/.test(`${step.title}${step.detail}`.replace(/제\d종 근린생활시설|제\d종 또는 제\d종 근린생활시설/g, "")), `${playbook.id}: no amendable numbers in steps — ${step.title}`);
  assert.ok(playbook.steps.at(-1)!.where.includes("오늘창업 홈페이지"), `${playbook.id}: ends at opening the business online`);
  assert.ok(playbook.steps.some(step => step.title.includes("사업자등록")), `${playbook.id}: includes business registration`);
  for (const link of playbook.links) assert.ok(link.url.startsWith("https://"), link.url);
  const checklist = playbookChecklist(playbook);
  assert.ok(checklist.includes("관할 기관 확인 필요") && checklist.includes("- [ ]"), playbook.id);
}

// 사업 관리: 업종 가이드가 있는 업종은 인허가 단계가 체크리스트로 바뀐다
const plan = {
  id: "p1", title: "동네빵집", planType: "일반 사업계획서", createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z", sections: {},
  answers: { __business_intake: { state: { version: 1, ksic: "56150", sector: "food_beverage", answers: {}, notes: [], candidates: [] } } },
} as unknown as Plan;
(plan.answers.__business_intake as { state: { version: number } }).state.version = INTAKE_VERSION;
const steps = launchSteps(plan, launchSchema.parse({ purpose: "launch" }));
const license = steps.find(step => step.id === "license");
assert.ok(license?.title.startsWith("빵집(제과점) 시작 준비"), String(license?.title));
assert.ok(license?.material.includes("식품위생교육") && license.material.includes("제과점 영업 신고"), String(license?.material));
assert.ok(steps.findIndex(step => step.id === "license") < steps.findIndex(step => step.id === "website"), "license comes before the website step");
// 캔들·디퓨저는 팔기 전 안전확인 신고(화학제품안전법), 중개는 거래 당사자가 아님을 알림(전자상거래법), 연습실은 반주기·볼룸댄스 구분
const online = INDUSTRY_PLAYBOOKS.find(item => item.id === "online-store")!;
assert.match(online.steps[0].detail, /캔들·디퓨저·방향제 같은 생활화학제품은 팔기 전에 지정 시험기관에서 안전기준 검사를 받고 한국환경산업기술원에 신고/);
assert.ok(INDUSTRY_PLAYBOOKS.find(item => item.id === "brokerage")!.steps.some(step => /거래 당사자가 아니라 중개자/.test(step.detail)));
assert.ok(INDUSTRY_PLAYBOOKS.find(item => item.id === "rental-room")!.steps.some(step => /노래연습장업 등록/.test(step.detail)));
// 설명으로 찾은 가이드는 그렇다고 밝혀, 사업과 다르면 쓰지 않게 한다
assert.match(playbookContext(playbookForText("빵집")!, "description").matchedBy ?? "", /사업 설명으로 찾은 업종/);
assert.equal(playbookContext(playbookForText("빵집")!).matchedBy, undefined);
console.log(`industry-playbooks: ${INDUSTRY_PLAYBOOKS.length} guides, ${expect.length} code mappings, ${described.length} descriptions, launch checklist passed`);
