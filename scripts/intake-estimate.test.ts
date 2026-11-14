import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/**
 * 한 문장 → 바로 초안: 사업 문장 하나로 창업 핵심 질문이 모두 채워지는지 본다(AI·네트워크 0).
 * 기준표는 업종마다 '감당하는 양으로 본전을 넘길 수 있는' 숫자여야 한다 — 첫 초안이 적자 계획으로 시작하지 않게.
 */
async function main() {
  Object.assign(process.env, {
    NODE_ENV: "test", PERSISTENCE_MODE: "demo-memory", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "",
    NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: "", RATE_LIMIT_BACKEND: "memory",
    PLAN_ACCOUNT_LINKING_ENABLED: "false", NEXT_PUBLIC_BUSINESS_INTAKE_V2: "1", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "", INTAKE_ESTIMATE: "1",
  });
  const network: string[] = [];
  globalThis.fetch = async url => { network.push(String(url)); throw new Error(`network blocked: ${String(url)}`); };
  const { saveIntakeCommand } = await import("../lib/plan-builder/intake-service");
  const { readCoach } = await import("../lib/plan-builder/coach");
  const { loadPlanState } = await import("../lib/plan-builder/plan-server-store");
  const { SECTOR_BASELINES, estimateIntake } = await import("../lib/plan-builder/intake-estimate");
  const { BUSINESS_KINDS } = await import("../lib/plan-builder/business-kinds");
  const { monthlyVolumeFromCapacity } = await import("../lib/plan-builder/coach-feasibility");
  const off = { aiAvailable: false, aiAllowed: false };

  for (const [sector, base] of Object.entries(SECTOR_BASELINES)) {
    const volume = monthlyVolumeFromCapacity(base.capacity)?.volume ?? 0;
    assert.ok(volume * (base.price - base.unitCost) > base.cost, `${sector}: 감당하는 양으로 월 고정비를 넘긴다`);
  }
  for (const [test, kind] of BUSINESS_KINDS) {
    const volume = monthlyVolumeFromCapacity(kind.capacity)?.volume ?? 0;
    assert.ok(volume * (kind.price - kind.unitCost) > kind.cost, `${test}: 감당하는 양으로 월 고정비를 넘긴다`);
  }
  assert.deepEqual(estimateIntake("동네 네일샵을 열려고 해요"), estimateIntake("동네 네일샵을 열려고 해요"), "같은 문장이면 같은 짐작");

  // 낱말 규칙(수만 개): 모든 줄이 분류에 묶여 있고, 실제 계산 함수로 감당하는 양에서 본전을 넘긴다
  const { ruleKind, KIND_RULE_ROWS } = await import("../lib/plan-builder/kind-rules");
  const { sectorForKsic } = await import("../lib/plan-builder/ksic");
  for (const [ksic, offer, , , , price, unitCost, cost, capacity] of KIND_RULE_ROWS) {
    const volume = monthlyVolumeFromCapacity(capacity)?.volume ?? 0;
    assert.ok(sectorForKsic(ksic) && volume * (price - unitCost) > cost, `${ksic} ${offer}: 감당하는 양으로 월 고정비를 넘긴다`);
  }

  // 세부 업종 사전: 흔한 창업 문장이 '범용'으로 떨어지지 않고 그 종류의 답을 받는다
  const kinds: [string, string, RegExp][] = [
    ["배달 전문 치킨집을 하려고 해요", "food_beverage", /치킨/], ["필라테스 스튜디오를 열고 싶어요", "local_service", /필라테스 수업/], ["꽃집을 열고 싶어요", "local_service", /꽃다발/],
    ["동네 빵집을 하고 싶어요", "food_beverage", /베이커리/], ["수제 캔들을 만들어 온라인으로 팔고 싶어요", "retail_commerce", /캔들/], ["요리 유튜브 채널을 키워서 수익을 내고 싶어요", "content_media", /채널/],
    ["키즈카페를 하고 싶어요", "space_hospitality", /키즈카페/], ["해외 구매대행을 하려고 해요", "retail_commerce", /구매대행/], ["한복 대여점을 하고 싶어요", "general", /한복 대여/],
    ["제주에서 게스트하우스를 운영하고 싶어요", "space_hospitality", /숙박/], ["코딩 학원을 열고 싶어요", "education", /그룹 수업/], ["수제 맥주 양조장을 만들고 싶어요", "manufacturing", /주류/],
  ];
  for (const [text, sector, offer] of kinds) {
    const guess = estimateIntake(text);
    assert.equal(guess.sector, sector, `${text}: 업종`);
    assert.match(guess.answers.offer, offer, `${text}: 파는 것`);
  }
  // 업종 규칙이 이미 가른 것은 뒤집지 않는다(카페용 앱은 카페가 아니다), 가게라고 적으면 온라인 장터에 올리지 않는다
  const cafeApp = estimateIntake("카페 사장님을 위한 예약 관리 앱을 만들고 있어요");
  assert.equal(cafeApp.sector, "software");
  assert.doesNotMatch(`${cafeApp.answers.customer} ${cafeApp.answers.offer} ${cafeApp.answers.channel}`, /커피|손님|네이버 예약/);
  assert.equal(estimateIntake("옷가게를 하고 싶어요").answers.channel, "매장 방문");

  // 낱말 규칙: 사전에 없는 업종은 규칙 줄로, 사전 낱말을 품은 더 긴 낱말(청소 → 입주청소)은 더 구체적인 규칙 줄로, 그 밖에는 사전 그대로
  const ruled = (text: string) => estimateIntake(text, undefined, ruleKind);
  assert.deepEqual([ruled("양봉 시작하려고요").ksic, ruled("동네 퀵 배송 대행").ksic, ruled("심리 카운셀러").ksic], ["01299", "49402", "86909"]);
  assert.match(ruled("입주 청소 서비스를 시작하려고 해요").answers.offer, /입주·이사 청소/);
  assert.equal(ruled("굿즈 스마트스토어를 운영하려고 해요").ksic, null);
  assert.doesNotMatch(ruled("라이프 스타일 편집숍").answers.offer, /타일 작업/);
  // 떨어진 낱말도 잇고(매트리스 … 청소), 낱말 경계를 한 글자만 걸친 것(찜닭 가게의 닭가게)은 버리고, 손님 업종 낱말은 종류로 읽지 않는다
  assert.deepEqual(["매트리스 소파 방문 청소", "찜닭 가게", "손두부 제조"].map((text) => ruleKind(text)?.word), ["매트리스청소", "찜닭", "두부제조"]);
  assert.equal(ruled("식당 사장님들에게 식자재 납품").ksic, "46329");
  // 같은 줄의 낱말이 여럿 맞으면 낱말 하나만 맞은 줄보다 먼저다(참기름·들기름 방앗간은 떡집이 아니다). 긴 낱말 하나(식자재마트)는 짧은 낱말 둘에 지지 않는다
  // 문장에 적은 파는 곳이 그 종류의 채널을 이긴다(물건·음식만). 매장 손님 문구는 지우고 묻는다. 대행업은 건드리지 않는다
  assert.deepEqual(["스마트스토어로 여성 의류 판매", "온라인으로만 파는 반찬 가게", "배달 전문 치킨집", "쿠팡에서 생활잡화 위탁판매"].map((text) => ruled(text).answers.channel), ["스마트스토어", "스마트스토어·자사몰", "배달앱", "쿠팡"]);
  assert.equal(ruled("스마트스토어로 여성 의류 판매").answers.customer, undefined);
  assert.ok(ruled("배달 전문 치킨집").answers.customer);
  assert.notEqual(ruled("스마트스토어 운영 대행 해주는 회사").answers.channel, "스마트스토어");
  // 납품·도매·OEM은 소매 채널이 아니라 거래처 영업이다. 도매시장에서 떼다 파는 가게는 그대로다
  assert.deepEqual(["김치 제조 공장, 식당 납품용", "커피 원두 로스팅해서 도매 납품", "향초 디퓨저 OEM 제조"].map((text) => ruled(text).answers.channel), Array(3).fill("직접 영업·기존 거래처"));
  assert.notEqual(ruled("도매시장에서 과일 떼다 파는 과일가게").answers.channel, "직접 영업·기존 거래처");
  // 문장에 적은 전문 분야는 파는 것 뒤에 남긴다. 이미 든 말(전기 자전거)·파는 방식(배달 전문)은 붙이지 않는다
  assert.deepEqual(["독립서점, 그림책 전문", "PT 전문 소규모 헬스장", "소형견 전문 애견 미용실"].map((text) => ruled(text).answers.offer.split(" · ")[1]), ["그림책 전문", "PT 전문", "소형견 전문"]);
  for (const text of ["전기자전거 전문 자전거 판매점", "배달 전문 치킨집", "돈까스 전문점 창업", "중고등 수학 전문 보습학원"]) assert.ok(!ruled(text).answers.offer.includes(" · "), text);
  // 공장·제조라고 적으면 만드는 줄이 먼저다(공장이 손님인 문장은 아니다). 소프트웨어 채널은 지도 검색이 아니다. 기업 납품·출강·시장 안 장사
  assert.equal(ruled("냉동 만두 만드는 식품 공장").ksic, "10709");
  assert.notEqual(ruled("공장 자동화 설비 유지보수").ksic?.slice(0, 2), "29");
  assert.deepEqual(["인테리어 견적 비교 플랫폼", "동네 헬스장 회원 관리 앱"].map((text) => ruled(text).answers.channel), ["검색·블로그 콘텐츠", "직접 영업·업종 커뮤니티"]);
  assert.deepEqual(["판촉물 기념품 기업 납품", "젓갈 제조해서 재래시장에 도매", "기업 출강 엑셀 강의합니다"].map((text) => ruled(text).answers.customer), ["납품받는 기업", "재래시장 상인", "직원 교육을 맡은 기업 인사·교육 담당자"]);
  assert.deepEqual(["전통시장 안에서 족발 장사", "비건 디저트 카페를 열고 싶어요"].map((text) => ruled(text).answers.channel), ["매장 방문", "매장 방문"]);
  // 뒤에 값을 붙여도 프로그램은 소프트웨어다(값은 파는 것에 넣지 않는다). 넓은 '개인 사용자'는 채우지 않고 묻는다. 수출은 해외 바이어, 하청·임가공은 맞은 줄의 고객
  assert.deepEqual([ruled("식당 원가 계산 프로그램, 월 1만원").sector, ruled("식당 원가 계산 프로그램, 월 1만원").answers.offer], ["software", "식당 원가 계산 프로그램"]);
  assert.equal(ruled("화물 배차 앱").answers.customer, undefined);
  assert.match(ruled("일본으로 김 수출").answers.customer, /해외 바이어/);
  assert.equal(ruled("수출 중소기업 대상 해외 마케팅 대행").answers.customer, "수출 중소기업");
  // 짧은 명사구에서 파는 것에 안 담긴 품목 낱말은 뒤에 남긴다. 어디에나 붙는 말·가게 이름·조사가 붙은 문장은 그대로 둔다
  assert.deepEqual(["특허 상표 출원 대행", "속눈썹 연장 왁싱", "치킨집 창업 준비", "대학가 앞에서 컵밥 장사"].map(text => ruled(text).answers.offer.split(" · ")[1]), ["특허", "왁싱", undefined, undefined]);
  assert.match(ruled("도배 장판").answers.offer, /도배.*장판|장판.*도배/);
  assert.match(ruled("도배·장판 시공").answers.offer, /도배.*장판|장판.*도배/);
  // 전문 분야가 파는 것과 일부만 겹치면 남는 말만 붙인다. '겸'·'및'으로 이은 품목도 남긴다. 체험장은 월 회비가 아니라 1회 값이다
  assert.match(ruled("피부관리실, 여드름 관리 전문").answers.offer, / · 여드름 전문$/);
  assert.match(ruled("강아지 유치원 겸 호텔").answers.offer, / · 호텔$/);
  assert.deepEqual([ruled("승마 체험장").answers.offer, ruled("승마 체험장").answers.price], ["승마 체험 1회", "75000원"]);
  // 고른 업종 안에 그 종류가 없으면 전체 표에서 찾는다(업종은 고른 대로). 소프트웨어를 골랐으면 찾지 않는다
  assert.deepEqual(["general", "local_service"].map(chip => estimateIntake("맞춤 정장 테일러숍", chip as never, ruleKind).answers.offer), ["맞춤 정장 한 벌", "맞춤 정장 한 벌"]);
  assert.doesNotMatch(estimateIntake("동네 카페 예약 관리", "software", ruleKind).answers.offer ?? "", /아메리카노|라테/);
  // 공장이라고 적었는데 작은 규모 줄이 맞았으면 처리량 5배·직원 3명 이상으로 본다(이미 공장 규모인 줄은 그대로). 납품이면 값을 납품가(70%)로 낮춘다
  assert.equal(ruled("어묵 공장").answers.capacity, "직원 3명 이상 / 하루 200팩");
  assert.equal(ruled("양말 공장").answers.capacity, ruled("양말 편직").answers.capacity.replace(/^[^/]+/, "직원·아르바이트 1~2명 "));
  assert.equal(ruled("수제 쿠키 만들어 카페에 납품").answers.price, "15000원");
  // 'X도 같이'로 곁들인 것은 본업이 아니다 — 앞쪽 본업의 줄을 쓰고 곁들인 품목은 뒤에 남긴다. 지명의 '도'(제주도)는 건드리지 않는다
  assert.match(ruled("네일샵, 속눈썹도 같이").answers.offer, /네일.* · 속눈썹$/);
  assert.equal(ruled("제주도 감귤 농장").answers.offer, ruled("제주 감귤 농장").answers.offer);
  // 'X 전용'의 X 가 종류 이름의 일부면 떼지 않는다(배드민턴 전용 체육관은 다목적 체육관이 아니다). 표에 없던 업종 줄: 내수면 양식·환자 유치·설치 대행
  assert.match(ruled("배드민턴 전용 체육관, 대관이랑 레슨").answers.offer, /배드민턴/);
  assert.deepEqual(["민물장어 양식장", "외국인 환자 유치업, 의료 관광", "TV 벽걸이 커튼 액자 설치 대행"].map(text => ruled(text).ksic), ["03212", "75290", "95399"]);
  assert.doesNotMatch(ruled("CNC 금속 임가공").answers.customer, /자기 상표/);
  assert.equal(ruled("흰다리새우 양식장").ksic, "03211");
  // 가게·병원·학원 운영자가 쓰는 프로그램은 개인용 앱 값이 아니다. 개인용 앱은 그대로다
  assert.deepEqual(["병원 EMR 프로그램 개발", "동네 헬스장 회원 관리 앱", "가계부 앱"].map((text) => ruled(text).answers.price), ["33000원", "33000원", "4900원"]);
  assert.equal(ruled("미용실 예약 관리 서비스").sector, "software");
  assert.deepEqual(["참기름 들기름 짜는 방앗간", "식자재 마트 창업"].map((text) => ruleKind(text)?.offer), ["국산 참기름 300ml 한 병", "식자재 마트"]);
  // 문장의 낱말이 파는 것에 그대로 든 줄(빙수 → 빙수 한 그릇)이 넓은 낱말의 줄(디저트가게 → 마카롱)보다 먼저다. 어절 토막('판매점'의 매점)은 치지 않는다
  assert.deepEqual(["빙수 전문 디저트 가게", "베이글 전문 베이커리 오픈 예정"].map((text) => ruled(text).answers.offer), ["빙수 한 그릇", "베이글 한 개"]);
  assert.doesNotMatch(ruled("무인 반려동물 간식 판매점").answers.offer, /매점/);
  assert.equal(ruled("학원 전용 출결 관리 앱").sector, "software");
  // 나이대 낱말 하나('유아용품'의 유아)는 종류의 고객(부모)을 덮지 않는다. 짚어 말한 고객('외국인 대상')은 그대로 둔다
  assert.doesNotMatch(ruled("유아용품 온라인몰").answers.customer, /^유아$/);
  assert.equal(ruled("외국인 대상 게스트하우스").answers.customer, "외국인");
  // 사업체를 상대로 하는 일은 앞의 업종이 고객이고, 납품은 받는 곳이 고객이다
  assert.deepEqual(["병원 마케팅 대행사", "카페 창업 컨설팅", "반찬 공장 차려서 마트에 납품"].map((text) => ruled(text).answers.customer), ["병원 운영자", "카페 창업을 준비하는 사람", "납품받는 마트"]);
  assert.notEqual(ruled("동네 카페 창업").answers.customer, "카페 운영자");
  // 소프트웨어는 적은 말이 곧 파는 것이다. 납품·주문자 상표는 받는 업체가 고객이다
  assert.equal(ruled("공유 주차장 예약 플랫폼").answers.offer, "공유 주차장 예약 플랫폼");
  assert.deepEqual(["김치 제조 공장, 식당 납품용", "향초 디퓨저 OEM 제조"].map((text) => ruled(text).answers.customer), ["납품받는 식당", "자기 상표로 팔 제품을 맡기는 판매 업체"]);
  assert.equal(ruled("포장이사 업체, 직원 4명").answers.capacity.split(" / ")[0], "직원 3명 이상");
  // 교육: 문장에 적은 나이대가 종류의 고객 문구 속 나이대를 바꾼다
  assert.match(ruled("초등 수학 학원 차리려고요").answers.customer, /초등학생/);
  // 혼자서는 못 하는 종류는 인원을 그 종류 값으로 잡는다 — 문장에 혼자 한다고 적었으면 그 말이 먼저다
  assert.deepEqual(["요양원 창업", "돼지국밥집", "동네 꽃집", "혼자 하는 1인 국밥집", "김치 제조 공장", "김치 담가서 온라인 판매"].map((text) => ruled(text).answers.capacity.split(" / ")[0]), ["직원 3명 이상", "직원·아르바이트 1~2명", "대표자 혼자", "대표자 혼자", "직원 3명 이상", "대표자 혼자"]);

  // 문장 읽기: 사용자가 이미 적은 고객·가격·자금·시간·목표·양·인원은 짐작하지 않고 그대로 읽는다
  const { readSentence } = await import("../lib/plan-builder/intake-sentence");
  const together = "동업자·가족과 함께";
  const reads: [string, Record<string, unknown>][] = [
    ["20~30대 여성 직장인을 위한 샐러드 가게를 열고 싶어요", { customer: "20~30대 여성 직장인" }], ["초등학생 영어 과외를 하려고 해요", { customer: "초등학생" }],
    ["자본금 3천만원으로 동네 카페를 차리고 싶어요", { budget: 30_000_000 }], ["퇴직금 1억으로 편의점을 하려고 해요", { budget: 100_000_000 }],
    ["월 매출 1,000만원 목표로 네일샵을 열려고 해요", { goal: "6개월 안에 월 매출 1,000만원" }], ["1년 안에 월 500만원 버는 스마트스토어를 하고 싶어요", { goal: "1년 안에 월 순수익 500만원" }],
    ["5만원짜리 원데이 클래스를 일주일에 10명 받으려고 해요", { price: 50_000, capacity: { period: "일주일", count: 10 } }], ["회당 8만원 1:1 PT를 주 20시간만 하려고 해요", { price: 80_000, hours: 20 }],
    ["월 15만원 회원권 필라테스 스튜디오를 열고 싶어요", { price: 150_000, priceMonthly: true }], ["직원 2명 두고 미용실을 열려고 해요", { people: "직원·아르바이트 1~2명" }],
    ["부부가 함께 국밥집을 차리려고 해요", { people: together }], ["친구랑 같이 수제 버거집을 열려고 해요", { people: together }],
    // 읽으면 안 되는 것: 월세·월급·구독자 수·연 매출은 가격·자금·목표가 아니고, 창업자 자신과 함께 놀러 오는 친구는 고객·동업자가 아니다
    ["월세 200만원 상가에서 꽃집을 하려고 해요", {}], ["월급 300만원 받던 직장인인데 빵집을 하고 싶어요", {}], ["구독자 1만 명 유튜브 채널로 수익을 내고 싶어요", {}],
    ["연 매출 1억 목표로 온라인 쇼핑몰을 하려고 해요", {}], ["친구와 함께 놀러 갈 수 있는 보드게임카페를 하고 싶어요", {}], ["어린이집을 하려고 해요", {}],
  ];
  for (const [text, facts] of reads) assert.deepEqual(JSON.parse(JSON.stringify(readSentence(text))), facts, `${text}: 문장에서 읽은 것`);
  // 읽은 가격에는 건당 비용이 같은 비율로 따라가고, 한 달 값으로 적은 가격은 한 달 회원 수로 센다(건당 자리에 두면 매출이 몇십 배로 부푼다)
  const coffee = estimateIntake("한 잔 3,500원 테이크아웃 커피 전문점을 하려고 해요").answers;
  assert.deepEqual([coffee.price, coffee["structure.unitCost"]], ["3500원", "1200원"]);
  const pilates = estimateIntake("월 15만원 회원권 필라테스 스튜디오를 열고 싶어요").answers;
  assert.deepEqual([pilates.price, pilates["structure.unitCost"], pilates.capacity], ["150000원", "15000원", "대표자 혼자 / 한 달 36명"]);
  assert.equal(estimateIntake("5만원짜리 원데이 클래스를 일주일에 10명 받으려고 해요").answers.capacity, "대표자 혼자 / 일주일 10명");
  const lesson = estimateIntake("회당 4만원 초등학생 영어 과외를 하려고 해요").answers;
  assert.deepEqual([lesson.price, lesson["structure.unitCost"], lesson.capacity], ["40000원", "2000원", "대표자 혼자 / 한 달 60회"]);
  assert.equal(estimateIntake("소상공인에게 세무 기장 대행을 월 10만원에 하려고 해요").answers.customer, "소상공인");
  // 표에 없던 흔한 종류도 '범용'으로 떨어지지 않는다
  for (const [text, sector] of [["편의점을 하려고 해요", "retail_commerce"], ["태권도장을 열고 싶어요", "education"], ["스크린골프장을 하고 싶어요", "space_hospitality"], ["번역 프리랜서로 일하려고 해요", "b2b_service"], ["동네 약국을 열려고 해요", "retail_commerce"], ["신혼부부 대상 집 정리 서비스를 하려고 해요", "local_service"], ["배달 대행을 하려고 해요", "logistics"]]) {
    assert.equal(estimateIntake(text).sector, sector, `${text}: 업종`);
  }

  // 종류를 못 찾은 문장은 짐작으로 채우지 않는다 — 업종부터 묻는다
  {
    const { snapshot } = await saveIntakeCommand(`intake-estimate-${randomUUID()}`, { action: "start", mode: "startup", questionId: "business", value: "무언가 새로 해 보려고 해요", revision: 0, requestId: randomUUID() }, off);
    assert.equal(snapshot.coreComplete, false, "모르는 사업은 묻는다");
    assert.equal(estimateIntake("무언가 새로 해 보려고 해요").matched, false);
  }
  for (const text of ["동네 네일샵을 열려고 해요", "반찬가게를 열고 싶어요", "굿즈 스마트스토어를 운영하려고 해요", "소규모 팀용 예약 관리 SaaS를 만들고 있어요", "배달 전문 치킨집을 하려고 해요", "한복 대여점을 하고 싶어요", "요리 유튜브 채널을 키워서 수익을 내고 싶어요"]) {
    const ownerHash = `intake-estimate-${randomUUID()}`;
    const { plan, snapshot } = await saveIntakeCommand(ownerHash, { action: "start", mode: "startup", questionId: "business", value: text, revision: 0, requestId: randomUUID() }, off);
    // 한 문장으로 나머지는 채워지고, 준비 예산·일할 시간 두 가지만 남아 그대로 묻는다(짐작도 '모름'도 아니다)
    assert.deepEqual([snapshot.coreComplete, snapshot.coreTotal - snapshot.coreAnswered, snapshot.nextQuestion?.id], [false, 2, "budget"], `${text}: 예산·시간만 남는다`);
    const coach = readCoach(plan.answers)!;
    assert.equal(coach.fields.find(field => field.key === "business")?.basis, "user");
    for (const key of ["customer", "problem", "offer", "channel", "price", "unitCost", "cost", "capacity", "goal"]) assert.equal(coach.fields.find(field => field.key === key)?.basis, "proposal", `${text}: ${key} 는 제안으로 표시된다`);
    assert.ok(!coach.fields.some(field => field.key === "budget" || field.key === "hoursPerWeek"), "예산·시간은 짐작하지 않는다");
    assert.equal(coach.messages.filter(message => message.role === "user").length, 1, "짐작을 사용자가 말한 것처럼 대화에 넣지 않는다");

    // 사용자가 답하면 그 답이 짐작을 이긴다
    const send = async (command: Record<string, unknown>) => {
      const current = (await loadPlanState(ownerHash)).plans.find(item => item.id === plan.id)!;
      return saveIntakeCommand(ownerHash, { ...command, planId: plan.id, revision: readCoach(current.answers)!.revision, requestId: randomUUID() } as never, off);
    };
    const priced = await send({ action: "answer", questionId: "price", value: "9,900원" });
    const price = readCoach(priced.plan.answers)!.fields.find(field => field.key === "price")!;
    assert.deepEqual([price.basis, price.value], ["user", "9900원"]);
  }
  // 업종을 '잘 모르겠어요'로 넘긴 뒤 적은 문장도 표에서 종류를 찾는다(넓은 업종으로 거르지 않는다)
  {
    const ownerHash = `intake-estimate-${randomUUID()}`;
    const { plan } = await saveIntakeCommand(ownerHash, { action: "start", mode: "startup", questionId: "business", value: "무언가 새로 해 보려고 해요", revision: 0, requestId: randomUUID() }, off);
    const send = async (command: Record<string, unknown>) => saveIntakeCommand(ownerHash, { ...command, planId: plan.id, revision: readCoach((await loadPlanState(ownerHash)).plans.find(item => item.id === plan.id)!.answers)!.revision, requestId: randomUUID() } as never, off);
    await send({ action: "answer", questionId: "industry", value: null, unknown: true });
    const riding = await send({ action: "answer", questionId: "business", value: "승마 체험장" });
    assert.match(readCoach(riding.plan.answers)!.fields.find(field => field.key === "offer")?.value ?? "", /승마/);
  }
  // 문장에 적은 자금·시간은 초안에 들어간다(적지 않았으면 위처럼 비워 둔다)
  // 길게 적은 문장이 제목이 되지 않는다 — 기준표가 찾은 이름(적은 띄어쓰기대로), 못 찾으면 첫 구절만
  {
    const long = "강아지 수제 간식을 만들어서 스마트스토어랑 인스타에서 팔고 싶어요. 한 봉지에 8천원 정도 생각해요";
    const named = await saveIntakeCommand(`intake-estimate-${randomUUID()}`, { action: "start", mode: "startup", questionId: "business", value: long, revision: 0, requestId: randomUUID() }, off);
    assert.equal(named.plan.title, "강아지 수제 간식");
    assert.equal(readCoach(named.plan.answers)!.business.description, long, "적은 문장은 그대로 남는다");
    const vague = await saveIntakeCommand(`intake-estimate-${randomUUID()}`, { action: "start", mode: "startup", questionId: "business", value: "뭔가 사람들한테 도움되는 걸 하고 싶어요. 아직 잘 모르겠지만 천천히 정해 보려고 합니다", revision: 0, requestId: randomUUID() }, off);
    assert.equal(vague.plan.title, "뭔가 사람들한테 도움되는 걸 하고 싶어요");
    // 'X에서 팔아요'의 X(플리마켓)는 파는 곳이라 제목이 되지 않는다
    const place = await saveIntakeCommand(`intake-estimate-${randomUUID()}`, { action: "start", mode: "startup", questionId: "business", value: "손뜨개 인형을 인스타, 플리마켓, 아이디어스에서 팔 거예요. 하나에 2만원", revision: 0, requestId: randomUUID() }, off);
    assert.equal(place.plan.title, "손뜨개 인형을 인스타, 플리마켓…");
    // 전문가 모드도 제목은 찾은 이름으로
    const pro = await saveIntakeCommand(`intake-estimate-${randomUUID()}`, { action: "start", mode: "startup", depth: "expert", questionId: "business", value: "퇴근길 직장인을 상대로 동네에서 반찬가게를 열고 싶어요. 혼자서 하루 30묶음 정도 만들어 팔 생각입니다", revision: 0, requestId: randomUUID() }, off);
    assert.equal(pro.plan.title, "반찬가게");
  }
  const stated = await saveIntakeCommand(`intake-estimate-${randomUUID()}`, { action: "start", mode: "startup", questionId: "business", value: "자본금 3천만원으로 주 20시간만 하는 네일샵을 열려고 해요", revision: 0, requestId: randomUUID() }, off);
  const statedFields = readCoach(stated.plan.answers)!.fields;
  assert.deepEqual(["budget", "hoursPerWeek"].map(key => statedFields.find(field => field.key === key)?.value), ["30000000원", "20시간"]);
  // 대화 방식(2026-11-13): 전문가로 시작하면 채우지 않고 하나씩 묻는다. 중간에 일반으로 바꾸면 채우고, 다시 전문가로 바꾸면 채운 것만 걷는다(직접 답한 것은 남는다)
  {
    const owner = `intake-estimate-${randomUUID()}`;
    const expert = await saveIntakeCommand(owner, { action: "start", mode: "startup", depth: "expert", questionId: "business", value: "동네 네일샵을 열려고 해요", revision: 0, requestId: randomUUID() }, off);
    assert.equal(expert.snapshot.coreAnswered, 1, "전문가: 사업 문장만 답한 상태");
    const next = async (command: Record<string, unknown>) => { const current = (await loadPlanState(owner)).plans.find(item => item.id === expert.plan.id)!; return saveIntakeCommand(owner, { ...command, planId: expert.plan.id, revision: readCoach(current.answers)!.revision, requestId: randomUUID() } as never, off); };
    const easy = await next({ action: "depth", depth: "easy" });
    assert.ok(easy.snapshot.coreAnswered > 5 && easy.snapshot.intake.depth === undefined, "일반으로 바꾸면 기준값으로 채운다");
    const priced = await next({ action: "answer", questionId: "price", value: 33000 });
    const back = await next({ action: "depth", depth: "expert" });
    assert.ok(back.snapshot.coreAnswered < priced.snapshot.coreAnswered && back.snapshot.intake.depth === "expert", "전문가로 바꾸면 채운 답을 걷는다");
    assert.match(String(back.snapshot.intake.answers.price?.value), /^33000/, "직접 답한 가격은 남는다");
    // 전문가 방식에서 한 개 비용이 가격보다 크면 한 번 되묻고, [맞아요](confirmed)면 받는다
    const unitCostId = back.snapshot.questions.find(question => question.fieldKey === "unitCost")?.id;
    if (unitCostId) {
      await assert.rejects(() => next({ action: "answer", questionId: unitCostId, value: 50000 }), /팔수록 손해/);
      const confirmed = await next({ action: "answer", questionId: unitCostId, value: 50000, confirmed: true });
      assert.match(String(confirmed.snapshot.intake.answers[unitCostId]?.value), /^50000/);
    } else assert.fail("전문가 방식 질문에 한 개 비용이 있어야 한다");
  }
  // 일반 모드 '문장에서 읽은 답'(understand): 기준값으로 채운 답만 바꾸고(근거는 사용자), 사용자가 직접 답한 것은 건드리지 않는다. 사업마다 한 번 표시
  {
    const owner = `intake-estimate-${randomUUID()}`;
    const made = await saveIntakeCommand(owner, { action: "start", mode: "startup", questionId: "business", value: "동네 네일샵을 열려고 해요", revision: 0, requestId: randomUUID() }, off);
    const next = async (command: Record<string, unknown>) => { const current = (await loadPlanState(owner)).plans.find(item => item.id === made.plan.id)!; return saveIntakeCommand(owner, { ...command, planId: made.plan.id, revision: readCoach(current.answers)!.revision, requestId: randomUUID() } as never, off); };
    await next({ action: "answer", questionId: "budget", value: 30000000 });
    const priceId = made.snapshot.questions.find(question => question.fieldKey === "price")!.id;
    const said = await next({ action: "understand", understood: [{ questionId: priceId, value: 45000 }, { questionId: "budget", value: 10000000 }, { questionId: "no-such-question", value: "x" }] });
    assert.match(said.snapshot.intake.answers[priceId]!.messageId, /:said$/);
    assert.equal(readCoach(said.plan.answers)!.fields.find(field => field.key === "price")?.basis, "user", "읽은 값은 사용자가 말한 값이다");
    assert.match(String(said.snapshot.intake.answers.budget?.value), /^30000000/, "직접 답한 준비금은 읽은 값으로 덮지 않는다");
    assert.equal(said.snapshot.intake.understood, true);
  }
  assert.deepEqual(network, [], "네트워크 호출 0");
  console.log("intake-estimate: 8 businesses drafted from one sentence (AI 0회)");
}

main().catch(error => { console.error(error); process.exit(1); });
