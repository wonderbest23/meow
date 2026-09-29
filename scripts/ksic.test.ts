import assert from "node:assert/strict";
import { KSIC_DIVISION_STRUCTURES, KSIC_STRUCTURE_OVERRIDES, KSIC_SYNONYMS, SECTOR_DIVISIONS, capacityUnitOrder, ksicAncestors, ksicByCode, ksicChildren, ksicDivision, ksicEntries, ksicPath, ksicStructure, licenseHint, isFinanceKsic, FINANCE_LICENSE_HINT, revenueBasis, searchKsic, structureFieldLabels, structureSummary } from "../lib/plan-builder/ksic";
import { STRUCTURE_LABELS } from "../lib/plan-builder/business-structure";

// 1) 색인 무결성 — KSIC 11차 공표 개수
assert.deepEqual([1, 2, 3, 4, 5].map(l => ksicEntries(l as 1 | 2 | 3 | 4 | 5).length), [21, 77, 234, 501, 1205], "대/중/소/세/세세 개수");
for (const e of ksicEntries()) {
  if (e.level === 1) { assert.equal(e.parent, null); continue; }
  const parent = ksicByCode(e.parent!);
  assert.ok(parent && parent.level === e.level - 1, `${e.code} parent ${e.parent}`);
  if (e.level >= 3) assert.equal(e.parent, e.code.slice(0, -1));
}
assert.equal(ksicChildren("56").length, 2, "56 음식점 및 주점업의 소분류 2개");
assert.equal(ksicPath("56221"), "숙박 및 음식점업 › 음식점 및 주점업 › 주점 및 비알코올 음료점업 › 비알코올 음료점업 › 커피 전문점");
assert.equal(ksicDivision("56221")?.code, "56");
assert.equal(ksicAncestors("56221").map(a => a.code).join(">"), "I>56>562>5622");

// 2) 구조 기본값 — 중분류 77개 전부, 남는 키 없음
const divisions = ksicEntries(2).map(e => e.code);
assert.deepEqual(Object.keys(KSIC_DIVISION_STRUCTURES).sort(), [...divisions].sort(), "중분류마다 구조 기본값 1개");
for (const code of Object.keys(KSIC_STRUCTURE_OVERRIDES)) assert.ok(ksicByCode(code), `override code exists: ${code}`);
for (const [code, patch] of Object.entries(KSIC_STRUCTURE_OVERRIDES)) for (const [axis, value] of Object.entries(patch)) {
  if (axis === "smallBusiness") assert.equal(typeof value, "boolean", `override ${code}.smallBusiness is boolean`);
  else if (axis === "sector") assert.ok(String(value) in SECTOR_DIVISIONS, `override ${code}.sector=${value} is a known sector`);
  else assert.ok(String(value) in STRUCTURE_LABELS[axis as keyof typeof STRUCTURE_LABELS], `override ${code}.${axis}=${value} is a known value`);
}
// 2026-09-16 소분류 검수: 중분류 기본값의 잘못된 상속이 세세분류에서 바로잡히는지
assert.equal(ksicStructure("56213")?.license, "registration", "호프·생맥주집은 일반음식점 신고");
assert.equal(ksicStructure("56211")?.license, "permit", "유흥주점은 허가");
assert.equal(ksicStructure("95213")?.license, "registration", "세차시설은 폐수배출시설 설치신고(물환경보전법 제33조)");
// 2026-09-17 법령 검수 반영 표본(근거: docs/ksic-license-review-2026-09-17.md)
assert.equal(ksicStructure("96119")?.license, "professional", "미용·네일은 면허가 전제(공중위생관리법 제8조)");
assert.equal(ksicStructure("96122")?.license, "professional", "안마는 안마사 자격(의료법 제82조)");
assert.equal(ksicStructure("91139")?.license, "none", "요가·필라테스는 자유업");
assert.equal(ksicStructure("91134")?.license, "none", "볼링장은 신고 체육시설업이 아님");
assert.equal(ksicStructure("91135")?.license, "registration", "당구장은 신고 체육시설업");
assert.equal(ksicStructure("45")?.license, "none", "신차·부품 판매는 등록 제도 없음");
assert.equal(ksicStructure("4512")?.license, "registration", "중고차 매매업 등록(자동차관리법 제53조)");
assert.equal(ksicStructure("857")?.license, "varies", "입시컨설팅은 학원 등록 대상, 유학원은 자유업");
assert.equal(ksicStructure("61")?.license, "registration", "기간통신사업은 등록제");
assert.equal(ksicStructure("271")?.license, "permit", "의료기기 제조업 허가"); assert.equal(ksicStructure("27")?.license, "varies");
assert.equal(ksicStructure("49401")?.license, "permit", "택배는 화물자동차 운송사업 허가가 전제"); assert.equal(ksicStructure("49402")?.license, "none");
assert.equal(ksicStructure("63992")?.smallBusiness, false); assert.equal(ksicStructure("35114")?.smallBusiness, true);
assert.equal(ksicStructure("95211")?.license, "registration", "자동차 정비는 등록");
assert.equal(ksicStructure("91135")?.revenue, "per_hour", "당구장은 시간당");
assert.equal(ksicStructure("91131")?.revenue, "subscription", "체력단련장은 월 회비");
assert.equal(ksicStructure("47419")?.license, "none", "옷가게는 인허가 없음");
assert.equal(ksicStructure("47212")?.license, "registration", "정육점은 식육판매업 신고");
assert.equal(ksicStructure("73100")?.capital, "storefront", "동물병원은 진료 공간 필요");
assert.equal(ksicStructure("41")?.license, "registration", "종합건설업은 등록");
assert.ok(["25924", "25929"].includes(searchKsic("산업용 부품을 소량 가공해 납품하려고 해요", { limit: 1, minLevel: 5 })[0]?.entry.code ?? ""), "부품 가공은 금속 가공업으로");
for (const [sector, codes] of Object.entries(SECTOR_DIVISIONS)) for (const code of codes) assert.ok(ksicByCode(code), `${sector} division ${code}`);
assert.equal(ksicStructure("56221")?.sector, "food_beverage");
assert.equal(ksicStructure("56221")?.license, "registration", "일반 음식점·카페는 영업신고");
assert.equal(ksicStructure("56211")?.license, "permit", "유흥주점은 허가");
assert.equal(ksicStructure("58222")?.sector, "software", "응용 소프트웨어는 출판업 아래지만 소프트웨어 구조");
assert.equal(ksicStructure("58222")?.license, "none");
assert.equal(ksicStructure("68221")?.license, "professional", "부동산 중개는 자격 필요");
assert.equal(ksicStructure("68112")?.offering, "space", "건물 임대는 공간 제공");
assert.equal(ksicStructure("47912")?.delivery, "online", "전자상거래 소매는 온라인 전달");
assert.equal(ksicStructure("47912")?.license, "registration", "통신판매업 신고");
assert.equal(ksicStructure("96119")?.sector, "local_service");
assert.equal(ksicStructure("49402")?.capital, "vehicle");
assert.equal(ksicStructure("73301")?.sector, "content_media");
assert.equal(ksicStructure("A"), undefined, "대분류에는 구조 없음");

// 2b) 구조 → 질문·요약 파생값
assert.deepEqual(structureSummary(ksicStructure("56221")!), ["개인 고객", "실물 상품", "매장 방문", "건당 결제", "신고·등록 필요"]);
assert.equal(revenueBasis(ksicStructure("58222")!), "월 구독 1건", "소프트웨어는 월 구독 기준");
assert.equal(revenueBasis(ksicStructure("56221")!), null, "건당 결제는 업종 기본 기준 유지");
assert.equal(revenueBasis(ksicStructure("71531")!), "프로젝트 1건");
assert.equal(capacityUnitOrder(ksicStructure("68112")!)?.[0], "좌석·룸", "공간 제공은 좌석·룸 단위 우선");
assert.equal(capacityUnitOrder(ksicStructure("10602")!)?.[0], "개", "실물 상품은 개 단위 우선");
assert.match(licenseHint(ksicStructure("56221")!) ?? "", /신고/);
assert.match(licenseHint(ksicStructure("56211")!) ?? "", /허가/);
assert.equal(licenseHint(ksicStructure("58222")!), null, "소프트웨어 개발은 인허가 안내 없음");
assert.match(licenseHint(ksicStructure("68221")!) ?? "", /자격·면허/);
// 2026-09-28 금융·보험(64·65·66)은 구청·세무서가 아니라 금융위원회·금융감독원 안내. 인허가 등급(분류)은 그대로다.
assert.equal(ksicStructure("66199")?.license, "registration", "분류는 법령 검수(자본시장법 제18조 등록) 그대로");
assert.equal(licenseHint(ksicStructure("66199")!, "66199"), FINANCE_LICENSE_HINT);
assert.ok(!licenseHint(ksicStructure("66199")!, "66199")!.includes("구청"), "금융업 안내에 구청·세무서가 나오지 않는다");
assert.equal(licenseHint(ksicStructure("64201")!, "64201"), FINANCE_LICENSE_HINT);
assert.match(licenseHint(ksicStructure("56221")!, "56221") ?? "", /관할 구청·세무서/, "다른 업종 문구는 그대로");
assert.match(licenseHint(ksicStructure("66199")!) ?? "", /관할 구청·세무서/, "코드를 모르면 기존 등급 문구");
assert.ok(isFinanceKsic("66202") && isFinanceKsic("65") && !isFinanceKsic("68222") && !isFinanceKsic(null));
for (const code of Object.keys(KSIC_DIVISION_STRUCTURES)) assert.equal(structureSummary(KSIC_DIVISION_STRUCTURES[code]).length, 5, `labels for division ${code}`);
assert.equal(structureFieldLabels(ksicStructure("58222")!).price, "월 구독 가격");
assert.equal(structureFieldLabels(ksicStructure("58222")!).volume, "월 구독자 수");
assert.deepEqual(structureFieldLabels(ksicStructure("56221")!), {}, "건당 결제는 기본 라벨 유지");

// 3) 동의어 사전의 코드는 전부 실제 코드
for (const [word, codes] of Object.entries(KSIC_SYNONYMS)) for (const code of codes) assert.ok(ksicByCode(code), `synonym ${word} → ${code}`);

// 4) 표본 사업 — 구어 문장에서 후보 1위(또는 상위 3)
const top = (text: string) => searchKsic(text, { limit: 3 }).map(m => m.entry.code);
const first = (text: string) => top(text)[0];
assert.equal(first("동네에서 작은 카페를 하고 싶어요"), "56221");
assert.equal(first("네일샵을 열려고 해요"), "96119");
assert.equal(first("반찬가게 창업"), "47223");
assert.equal(first("굿즈 스마트스토어를 운영하고 싶어요"), "47912");
assert.equal(first("소규모 SaaS를 만들고 있어요"), "58222");
assert.equal(first("촬영 스튜디오"), "73301");
assert.equal(first("공유오피스"), "68112");
assert.equal(first("퀵배송 대행"), "49402");
assert.ok(top("온라인 영어과외").includes("85631") || top("온라인 영어과외").includes("85503"), `온라인 영어과외 → ${top("온라인 영어과외")}`);
assert.ok(top("반도체 부품 제조").some(code => code.startsWith("26")), `반도체 부품 제조 → ${top("반도체 부품 제조")}`);
assert.ok(top("50만원으로 SNS컨설팅").some(code => ["75995", "71531", "71310"].includes(code)), `SNS컨설팅 → ${top("50만원으로 SNS컨설팅")}`);
assert.ok(["96999", "75999"].includes(first("심부름 대행을 하고 싶어요")), `심부름 → ${top("심부름 대행을 하고 싶어요")}`);
assert.ok(!top("반려동물 산책 대행").includes("58113") && top("반려동물 산책 대행").includes("96995"), "짧은 동의어(책)는 토큰 전체 일치만 허용");
assert.equal(first("캠핑장 운영"), "55105");
assert.equal(first("1인 출판사"), "58113", "짧은 동의어 키는 토큰 앞부분 일치 허용");
assert.equal(first("무인 아이스크림 가게"), "47229");
assert.equal(first("요가 스튜디오"), "91139");
assert.equal(first("온라인 쇼핑몰 운영"), "47912");
assert.equal(first("중고 명품 판매"), "47869", `중고 명품 1위는 기타 중고 상품 소매업: ${top("중고 명품 판매")}`);
// 2026-09-27 업종 오분류: 물건 이름(건물·자동차·옷)이 활동 없이 제조·건설·도매 이름에 걸리지 않는다
const all = (text: string) => searchKsic(text, { limit: 4, minLevel: 5 }).map(m => m.entry.code);
const building = all("사람들이 돈을 모아서 건물을 사는 사이트 만들고 싶어");
assert.ok(!building.some(code => code.startsWith("41") || code.startsWith("42")), `건물을 사는 사이트는 건설업이 아니다: ${building}`);
assert.ok(building.includes("63120") && building.includes("66199"), `인터넷 매개·금융 지원 후보: ${building}`);
assert.ok(!all("자동차 정비 예약 사이트").some(code => code.startsWith("30")), "자동차 정비는 자동차 제조업이 아니다");
assert.ok(all("자동차 정비 예약 사이트").includes("95211"));
assert.ok(!all("건물 관리 회사").some(code => code.startsWith("41")) && all("건물 관리 회사")[0] === "68212", `건물 관리 → 부동산 관리: ${all("건물 관리 회사")}`);
assert.ok(!all("땅을 사서 캠핑장").includes("75330"), "'사서'가 '조사 서비스업'에 걸리지 않는다(낱말 단위 대조)");
assert.ok(!all("집 구하는 사람을 위한 앱").includes("37021"), "'사람'은 업종 단서가 아니다");
assert.ok(!all("옷 만드는 공장").includes("74212"), "'공장'이 '공공장소'에 걸리지 않는다");
assert.ok(all("집을 짓는 건축 회사").some(code => code.startsWith("41")), "짓는·건축이 있으면 건설업 허용");
assert.ok(top("반도체 부품 제조").some(code => code.startsWith("26")), "제조가 있으면 제조업 허용");
for (const [text, code] of [["중고차를 사고파는 앱", "45120"], ["옷을 수선해주는 가게", "95391"], ["휴대폰 수리점", "95120"], ["차를 빌려주는 서비스", "76110"], ["강아지 산책을 대신해주는 앱", "96995"], ["와인 수입", "46331"], ["옷 대여 서비스", "76292"], ["노인 방문 요양", "87293"], ["보험 비교 사이트", "63120"], ["여행 가이드 앱", "75290"]] as const) assert.equal(all(text)[0], code, `${text} → ${all(text)}`);
assert.deepEqual(searchKsic(""), []);
assert.deepEqual(searchKsic("ㅋㅋㅋ"), [], "무의미 입력은 후보 없음");
const cafe = searchKsic("카페");
assert.equal(cafe[0].via, "synonym");
// "OO을 위한 …" 앞부분은 고객이다 — 고객 낱말(카페)이 업종(커피 전문점)을 정하지 않는다(운영 테스트 2026-09-29)
{
  const agency = searchKsic("동네 소규모 카페 사장님을 위한 인스타그램 콘텐츠 대행 서비스", { limit: 3, minLevel: 5 }).map(m => m.entry.code);
  assert.ok(["71310", "75995"].includes(agency[0]), `marketing agency first: ${agency.join(",")}`);
  assert.ok(agency.indexOf("56221") !== 0, "coffee shop is not the first candidate");
  assert.equal(searchKsic("우리 동네 맞벌이 가정을 위한 반찬 정기배송 서비스", { limit: 1, minLevel: 5 })[0]?.entry.code, "47223", "the business part still decides");
  assert.equal(searchKsic("카페를 운영하고 싶어요", { limit: 1, minLevel: 5 })[0]?.entry.code, "56221", "without a customer phrase nothing changes");
  assert.ok(searchKsic("카페 사장님 대상으로 SNS 대행", { limit: 2, minLevel: 5 }).some(m => m.entry.code === "75995"));
}
console.log(`ksic: ${ksicEntries().length} entries, ${Object.keys(KSIC_DIVISION_STRUCTURES).length} division structures, ${Object.keys(KSIC_SYNONYMS).length} synonyms, sample searches passed`);
