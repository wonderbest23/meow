import assert from "node:assert/strict";
import { applyPhotoSet, PHOTO_SET_KEYS, photoSetFor } from "../lib/landing/photo-library";

// 업종 글 → 사진 한 벌. 겹치는 말은 더 구체적인 업종이 먼저(애견 미용 → 반려동물, 필라테스 스튜디오 → 운동)
const cases: Array<[string, string | null]> = [
  ["브런치 카페", "cafe"], ["동네 반찬가게", "food"], ["꽃집", "flower"],
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
];
for (const [text, key] of mixed) assert.equal(photoSetFor(text)?.key, key, text);

// 모든 한 벌: 무료 Unsplash 사진(images.unsplash.com), 한 벌 안에서 같은 사진이 두 번 나오지 않는다
assert.ok(PHOTO_SET_KEYS.length >= 15);
assert.equal(new Set(PHOTO_SET_KEYS).size, PHOTO_SET_KEYS.length);
for (const [text] of cases.filter(([, key]) => key)) {
  const set = photoSetFor(text)!;
  const urls = [set.hero, ...set.cards, set.band, set.closing];
  for (const url of urls) assert.match(url, /^https:\/\/images\.unsplash\.com\/photo-\d{10,13}-[0-9a-f]{12}\?/, `${set.key}: ${url}`);
  assert.equal(new Set(urls.map(url => url.split("?")[0])).size, urls.length, `${set.key}: photos repeat`);
}

// 동네 가게 템플릿에 한 벌을 나눠 넣는다(사장님 사진은 그대로)
const pet = photoSetFor("애견 미용")!;
const placed = applyPhotoSet({ "0:2362/0/0": "", "0:2329/0/0": "https://example.com/mine.jpg" }, "0-2226", pet);
assert.equal(placed["0:2362/0/0"], pet.hero);
assert.equal(placed["0:2329/0/0"], "https://example.com/mine.jpg");
assert.equal(placed["0:2317/0/0"], pet.band);

console.log(`landing-photo-library: ${PHOTO_SET_KEYS.length} sets, sector routing, free Unsplash photos, owner photos kept`);
