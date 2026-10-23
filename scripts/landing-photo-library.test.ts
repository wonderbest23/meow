import assert from "node:assert/strict";
import { applyPhotoSet, businessPhotoSet, PHOTO_SET_KEYS, photoSetFor } from "../lib/landing/photo-library";

// 업종 글 → 사진 한 벌. 겹치는 말은 더 구체적인 업종이 먼저(애견 미용 → 반려동물, 필라테스 스튜디오 → 운동)
const cases: Array<[string, string | null]> = [
  ["브런치 카페", "cafe"], ["커피 로스터리", "cafe"], ["동네 반찬가게", "food"], ["꽃집", "flower"],
  // 빵집·디저트 가게는 커피 사진이 아니라 빵·케이크 사진(예전엔 카페 한 벌이라 커피 사진이 나왔다)
  ["동네 빵집", "bakery"], ["베이커리 카페", "bakery"], ["수제 케이크 주문 제작", "bakery"], ["디저트 카페", "bakery"],
  ["제과점", "bakery"], ["마카롱 가게", "bakery"], ["소금빵 전문점", "bakery"],
  ["애견 미용", "pet"], ["동물병원", "pet"], ["고양이 호텔", "pet"],
  ["치과", "medical"], ["한의원", "medical"], ["피부과 의원", "medical"],
  ["헤어 살롱", "beauty"], ["피부관리실", "beauty"], ["네일", "beauty"],
  ["필라테스 스튜디오", "fitness"], ["요가", "fitness"],
  ["영어 학원", "education"],
  ["인테리어 리모델링", "interior"], ["공인중개사 사무소", "interior"],
  ["보일러 수리", "repair"], ["전기 설비", "repair"],
  ["입주 청소", "cleaning"], ["세탁소", "cleaning"],
  ["자동차 정비", "auto"], ["손세차", "auto"],
  ["웨딩 촬영", "photo"], ["프로필 사진 스튜디오", "photo"],
  ["감성 펜션", "stay"], ["글램핑", "stay"],
  ["세무 회계 사무소", "office"], ["마케팅 대행", "office"],
  ["알 수 없는 사업", null],
];
for (const [text, key] of cases) assert.equal(photoSetFor(text)?.key ?? null, key, text);

// 상호·대표 상품에 다른 업종 말이 섞여도 먼저 나온 업종(그 사업 자신)을 따른다 — 카페 규칙이 맨 앞이라 다 카페 사진이 되던 문제
const mixed: Array<[string, string]> = [
  [" 플로라 꽃집 카페·식당에 납품하는 꽃 장식", "flower"],
  [" 헤어온 미용실 카페 같은 분위기의 헤어 컷", "beauty"],
  [" 엄마손 반찬 도시락과 커피 세트", "food"],
  [" 멍스타일 애견미용 강아지 미용과 펫카페 이용권", "pet"],
  [" 수학공방 학원 중학생 수학 과외와 스터디카페", "education"],
  [" 냥이호텔 고양이 호텔", "pet"],
  ["모던스타일 헤어", "beauty"],
  [" 새벽빵집 바게트와 아메리카노", "bakery"],
  [" 새벽커피 아메리카노와 크루아상", "cafe"],
];
for (const [text, key] of mixed) assert.equal(photoSetFor(text)?.key, key, text);

// 업종 코드 이름(표준산업분류)도 알아본다 — 업종을 확정한 사업은 이 이름이 사진 글 맨 앞에 온다
const ksicNames: Array<[string, string]> = [
  ["조리 반찬류 소매업", "food"], ["김밥 및 기타 간이 음식점업", "food"], ["한식 일반 음식점업", "food"], ["치킨 전문점", "food"], ["중식 음식점업", "food"],
  ["간이 음식 포장 판매 전문점", "food"], ["커피 전문점", "cafe"], ["기타 비알코올 음료점업", "cafe"], ["제과점업", "bakery"],
  ["반찬·도시락 가게", "food"], ["분식·간이음식점", "food"], ["카페(휴게음식점)", "cafe"], ["빵집(제과점)", "bakery"], ["음식점(일반음식점)", "food"],
];
for (const [text, key] of ksicNames) assert.equal(photoSetFor(text)?.key, key, text);
// 그 사업을 가리키는 글이 먼저, 넓은 업종 이름은 못 알아볼 때만 — 넓은 '카페 · 음식점'의 '카페'는 보지 않는다(망원 골목반찬이 카페 사진을 받던 문제)
assert.equal(businessPhotoSet("망원 골목반찬 매일 무치는 나물", "카페 · 음식점")?.key, "food");
assert.equal(businessPhotoSet("망원 김밥 참치김밥과 라면", "카페 · 음식점")?.key, "food");
assert.equal(businessPhotoSet("새벽 베이커리 소금빵", "카페 · 음식점")?.key, "bakery");
assert.equal(businessPhotoSet("망원 한잔 핸드드립 커피", "카페 · 음식점")?.key, "cafe");
assert.equal(businessPhotoSet("골목 브런치 카페", "카페 · 음식점")?.key, "cafe");
assert.equal(businessPhotoSet("망원 골목 주 2회 정기배송", "카페 · 음식점")?.key, "food", "broad label alone: food, not cafe");
assert.equal(businessPhotoSet("플로라 마포", "꽃집")?.key, "flower", "broad text still used when the detail says nothing");
assert.equal(businessPhotoSet("알 수 없는 사업", "유통 · 온라인 판매"), null);
// '문의 양식'의 '양식'은 음식 말이 아니다
assert.equal(photoSetFor("세무 사무소 문의 양식"), photoSetFor("세무 사무소"));

// 모든 한 벌: 무료 Unsplash 사진(images.unsplash.com), 한 벌 안에서 같은 사진이 두 번 나오지 않는다
assert.ok(PHOTO_SET_KEYS.length >= 15);
assert.equal(new Set(PHOTO_SET_KEYS).size, PHOTO_SET_KEYS.length);
for (const [text] of cases.filter(([, key]) => key)) {
  const set = photoSetFor(text)!;
  const urls = [set.hero, ...set.cards, set.band, set.closing];
  for (const url of urls) assert.match(url, /^https:\/\/images\.unsplash\.com\/photo-\d{10,13}-[0-9a-f]{12}\?/, `${set.key}: ${url}`);
  assert.equal(new Set(urls.map(url => url.split("?")[0])).size, urls.length, `${set.key}: photos repeat`);
}

// 빵집 첫 화면 사진은 외국 가격표(€)가 보이지 않는 것, 메뉴 카드는 특정 빵(크루아상·티라미수)이 아닌 식사빵(실제 AI 점검 2026-10-22)
const bakerySet = photoSetFor("동네 빵집")!;
assert.ok(!bakerySet.hero.includes("1517433670267"));
assert.ok(!bakerySet.cards.some(url => /1555507036|1571115177098/.test(url)));

// 동네 가게 템플릿에 한 벌을 나눠 넣는다(사장님 사진은 그대로)
const pet = photoSetFor("애견 미용")!;
const placed = applyPhotoSet({ "0:2362/0/0": "", "0:2329/0/0": "https://example.com/mine.jpg" }, "0-2226", pet);
assert.equal(placed["0:2362/0/0"], pet.hero);
assert.equal(placed["0:2329/0/0"], "https://example.com/mine.jpg");
assert.equal(placed["0:2317/0/0"], pet.band);

console.log(`landing-photo-library: ${PHOTO_SET_KEYS.length} sets, sector routing, free Unsplash photos, owner photos kept`);
