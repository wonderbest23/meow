/*
 * 업종별 사진 모음 — 계획서로 만든 홈페이지에 까는 사진.
 *
 * 사진이 없으면 디자인이 아무리 좋아도 빈 페이지로 보이고(사용자: "허접하다"),
 * 업종과 상관없는 사진(노트북 앞 외국인, 손목시계)을 깔면 남의 가게처럼 보인다.
 * 그래서 업종마다 사람이 직접 보고 고른 사진 한 벌(첫 화면·카드 셋·띠·마무리)을 둔다.
 *
 * 전부 Unsplash 사진이다(무료, 상업적 사용 가능, 출처 표기 의무 없음 — unsplash.com/license).
 * 얼굴이 크게 나오는 사진보다 음식·손·매장·물건 위주로 골랐다 — 한국 가게에 붙여도 어색하지 않게.
 * 업종을 못 알아보면 사진을 깔지 않는다(사장님이 편집 화면의 '사진 넣기'로 채운다).
 */

import { isPlaceholderPhoto } from "./domain";

export type PhotoSet = {
  key: string;
  hero: string;
  cards: [string, string, string];
  band: string;
  closing: string;
};

const photo = (id: string, width = 1800) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${width}&q=80`;
const set = (key: string, hero: string, cards: [string, string, string], band: string, closing: string): PhotoSet => ({
  key,
  hero: photo(hero),
  cards: cards.map((id) => photo(id, 900)) as [string, string, string],
  band: photo(band, 1200),
  closing: photo(closing),
});

/* 위에서부터 먼저 맞는 것 — '브런치 카페'는 카페, '반찬'은 음식 */
const LIBRARY: Array<{ test: RegExp; set: PhotoSet }> = [
  {
    test: /(카페|커피|로스터|베이커리|빵집|제과|디저트|케이크|브런치)/,
    set: set("cafe", "1648462908676-8305f0eff8e0", ["1579265898841-79c7890d69cf", "1511920170033-f8396924c348", "1621135177072-57c9b6242e7a"], "1601065700897-d9fa1c093f3e", "1544031064-9de80864ade5"),
  },
  {
    test: /(반찬|도시락|밀키트|식당|음식|요리|한식|분식|국밥|찌개|김치|집밥|배달 ?음식|케이터링)/,
    set: set("food", "1498654896293-37aacf113fd9", ["1590301157890-4810ed352733", "1562571708-527276a391ac", "1683225757624-86943fb48966"], "1661366394743-fe30fe478ef7", "1718777791262-c66d11baaa3b"),
  },
  {
    test: /(꽃|플라워|화훼|부케|화분)/,
    set: set("flower", "1587317997383-2e6c1b24040f", ["1642751652611-bb9a7cad58a3", "1491994336086-44f5d76dd8f2", "1435783459217-ee7fe5414abe"], "1487070183336-b863922373d4", "1608656218680-e8be81ce71d7"),
  },
  {
    // '애견 미용'·'동물병원'은 미용·병원보다 먼저 반려동물로
    test: /(반려|애견|애완|펫|강아지|고양이|동물병원|펫호텔|훈련소)/,
    set: set("pet", "1548199973-03cce0bbc87b", ["1516734212186-a967f81ad0d7", "1450778869180-41d0601e046e", "1596492784531-6e6eb5ea9993"], "1576201836106-db1758fd1c97", "1587300003388-59208cc962cb"),
  },
  {
    // '피부과'는 미용보다 먼저 병원으로(피부관리실은 미용)
    test: /(병원|의원|치과|한의원|진료|의료|약국|물리치료|재활|검진|피부과|안과|소아과|정형외과|내과|요양)/,
    set: set("medical", "1629909614456-6b1c5c94cecc", ["1588776814546-1ffcf47267a5", "1631217868264-e5b90bb7e133", "1643660526741-094639fbe53a"], "1519494026892-80bbd2d6fd0d", "1584515933487-779824d29309"),
  },
  {
    test: /(미용|헤어|네일|피부|뷰티|왁싱|속눈썹|두피|에스테틱|살롱)/,
    set: set("beauty", "1633681926022-84c23e8cb2d6", ["1580618672591-eb180b1a973f", "1731514771613-991a02407132", "1659391542239-9648f307c0b1"], "1600948836101-f9ffda59d250", "1634449571010-02389ed0f9b0"),
  },
  {
    test: /(필라테스|요가|피트니스|헬스|운동|PT|스트레칭|체형)/i,
    set: set("fitness", "1761971975962-9cc397e2ba2a", ["1754257320311-04f65229a132", "1763403921315-f2ef8697199f", "1771270786606-f5a0e57db762"], "1754258166816-0075fe0132ce", "1767611094402-2b28863b834f"),
  },
  {
    test: /(교육|학원|과외|클래스|수업|코칭|강의|공부|스터디|독서)/,
    set: set("education", "1635424239131-32dc44986b56", ["1633940907831-945322bc60f3", "1764096534686-68091ce5ab45", "1639548538099-6f7f9aec3b92"], "1654356709115-3f68998bead4", "1580582932707-520aed937b7b"),
  },
  {
    test: /(인테리어|리모델링|부동산|공인중개|건축|가구|시공|홈스타일링)/,
    set: set("interior", "1618221195710-dd6b41faaea6", ["1586023492125-27b2c045efd7", "1600607687939-ce8a6c25118c", "1484154218962-a197022b5858"], "1616486338812-3dadae4b4ace", "1600585154340-be6161a56a0c"),
  },
  {
    test: /(수리|설비|전기|배관|보일러|철물|목공|용접|방수|도배|타일|공사)/,
    set: set("repair", "1621905252507-b35492cc74b4", ["1504148455328-c376907d081c", "1581244277943-fe4a9c777189", "1558618666-fcd25c85cd64"], "1584820927498-cfe5211fd8bf", "1600585152220-90363fe7e115"),
  },
  {
    test: /(청소|세탁|빨래|방역|이사|정리수납|클리닝)/,
    set: set("cleaning", "1600585152220-90363fe7e115", ["1581578731548-c64695cc6952", "1527515637462-cff94eecc1ac", "1628177142898-93e36e4e3a50"], "1585421514738-01798e348b17", "1556911220-bff31c812dba"),
  },
  {
    test: /(자동차|정비|세차|카센터|중고차|렌터카|렌트카|타이어|튜닝)/,
    set: set("auto", "1486006920555-c77dcf18193c", ["1625047509248-ec889cbff17f", "1487754180451-c456f719a1fc", "1607860108855-64acf2078ed9"], "1520340356584-f9917d1eea6f", "1619642751034-765dfdf7c58e"),
  },
  {
    // 필라테스·요가 '스튜디오'는 위의 운동으로 먼저 잡힌다
    test: /(사진|스튜디오|촬영|웨딩|포토|프로필|영상)/,
    set: set("photo", "1471341971476-ae15ff5dd4ea", ["1606216794074-735e91aa2c92", "1537633552985-df8429e8048b", "1516035069371-29a1b244cc32"], "1500051638674-ff996a0ec29e", "1554048612-b6a482bc67e5"),
  },
  {
    test: /(숙박|펜션|호텔|게스트하우스|민박|캠핑|글램핑|리조트|숙소|스테이)/,
    set: set("stay", "1596394516093-501ba68a0ba6", ["1587061949409-02df41d5e562", "1582719478250-c89cae4dc85b", "1510798831971-661eb04b3739"], "1520250497591-112f2f40a3f4", "1504280390367-361c6d9f38f4"),
  },
  {
    test: /(세무|회계|법률|법무|변호|노무|행정사|컨설팅|대행|마케팅|소프트웨어|개발|플랫폼|솔루션)/,
    set: set("office", "1600880292203-757bb62b4baf", ["1450101499163-c8848c66ca85", "1554224155-6726b3ff858f", "1552664730-d307ca884978"], "1497366216548-37526070297c", "1486312338219-ce68d2c6f44d"),
  },
];

/** 업종·상호·대표 상품 글을 합쳐 넣으면 맞는 사진 한 벌을 돌려준다. 못 알아보면 null */
export function photoSetFor(text: string): PhotoSet | null {
  const value = text.replace(/\s+/g, " ");
  return LIBRARY.find((entry) => entry.test.test(value))?.set ?? null;
}

export const PHOTO_SET_KEYS = LIBRARY.map((entry) => entry.set.key);

/*
 * 사진 자리 — 디자인을 옮긴 템플릿마다 첫 화면·카드·띠·마무리가 어느 노드인지.
 * 흐름 화면 템플릿은 첫 화면 사진(모든 자리에 같은 사진)만 쓴다.
 */
export const PHOTO_SLOTS: Record<string, { hero: string; cards: string[]; band?: string; closing?: string }> = {
  "0-1102": { hero: "0:1325/0/0", cards: ["0:1332/0/0", "0:1337/0/0", "0:1342/0/0"], band: "0:1146/0/0", closing: "0:1108/0/0" },
  "0-290": { hero: "0:411/0", cards: ["0:372/0", "0:379/0", "0:386/0", "0:393/0"], band: "0:357/0/0" },
  // 동네 가게: 메뉴 카드 사진 셋, 이용 순서 옆 사진 둘(띠·마무리 사진)
  "0-2226": { hero: "0:2362/0/0", cards: ["0:2329/0/0", "0:2336/0/0", "0:2343/0/0"], band: "0:2317/0/0", closing: "0:2321/0/0" },
  // 병원: 병원 소개 사진 넷(카드 셋 + 띠 사진), 진료 순서 옆 사진. 의료진 사진은 사장님만 넣는다
  "0-2385": { hero: "0:2550/0/0", cards: ["0:2515/0/0", "0:2516/0/0", "0:2517/0/0", "0:2518/0/0"], closing: "0:2491/0/0" },
  // 갤러리형: 작업 사례 넷(카드 셋 + 마무리 사진), 공간 안내 사진(띠). 후기 사진은 사장님만
  "0-421": { hero: "0:1082/0/0", cards: ["0:875/0", "0:876/0", "0:877/0"], band: "0:958/0/0", closing: "0:878/0" },
};

/** 사진 한 벌을 템플릿의 사진 자리에 나눠 넣는다(빈 자리·첫 화면 사진과 같은 자리만 — 사장님 사진은 그대로) */
export function applyPhotoSet(images: Record<string, string>, page: string, photos: PhotoSet): Record<string, string> {
  const slots = PHOTO_SLOTS[page];
  if (!slots) return images;
  const next = { ...images };
  const hero = images[slots.hero] ?? "";
  // 비었거나, 첫 화면과 같은 사진이 복사돼 있거나, 템플릿 기본·견본 사진이면 바꾼다
  const replaceable = (id: string) => !next[id] || next[id] === hero || isPlaceholderPhoto(next[id]);
  const cardPhotos = [...photos.cards, photos.band];
  slots.cards.forEach((id, index) => { if (replaceable(id)) next[id] = cardPhotos[index % cardPhotos.length]; });
  if (slots.band && replaceable(slots.band)) next[slots.band] = photos.band;
  if (slots.closing && replaceable(slots.closing)) next[slots.closing] = photos.closing;
  if (!hero || isPlaceholderPhoto(hero)) next[slots.hero] = photos.hero;
  return next;
}
