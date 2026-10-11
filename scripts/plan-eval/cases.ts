/*
 * 사업계획서 품질 시험 사업 20개(docs/사업계획서-품질기준-최종본-2026-10-09.md 1단계).
 *
 * 실제 손님과 비슷하게 섞는다: 업종을 알아보는 사업 / 못 알아보는 사업(미분류), 창업 / 운영 중,
 * 값이 다 있는 경우 / 판매량·비용이 빠진 경우 / 극단적인 값. 적지 않은 질문은 '잘 모르겠어요'로 답한다.
 * 답은 상담 화면에서 손님이 실제로 칠 만한 말로 적는다(질문 id: lib/plan-builder/intake-questions.ts).
 */
export type EvalCase = {
  id: string;
  label: string;
  mode: "startup" | "operating";
  /** 업종(섹터). 없으면 상담이 제시하는 첫 업종 후보, 그것도 없으면 '위에 없으면 여기(general)' */
  sector?: string;
  /** 질문 id → 답. 적지 않은 질문은 '잘 모르겠어요'(unknown) */
  answers: Record<string, string | number>;
  /** 무엇을 시험하는 사업인지 */
  tags: string[];
};

// livingCost: 대표 한 달 생활비(돈 장 시험판의 생활비 질문). 0은 "고정비에 이미 넣음", 없으면 "모름"
export const EVAL_CASES: EvalCase[] = [
  { id: "bakery", label: "아파트 상가 아침 빵집", mode: "startup", sector: "food_beverage", tags: ["업종 인식", "값 모두"],
    answers: { business: "아파트 상가에서 아침 식빵과 소금빵을 굽는 작은 빵집", customer: "출근 전 30~40대 직장인, 단지 내 아이 키우는 가족", problem: "아침에 갓 구운 빵을 살 곳이 없음", offer: "식빵·소금빵 아침 세트", channel: "당근마켓 동네생활, 네이버 플레이스", price: 4500, "structure.unitCost": 1600, "structure.cost": 3800000, budget: 60000000, livingCost: 2000000, hoursPerWeek: 60, capacity: "대표자 혼자 / 하루 120개", goal: "6개월 안에 월 매출 1,200만원" } },
  { id: "cafe", label: "대학가 테이크아웃 카페", mode: "startup", sector: "food_beverage", tags: ["업종 인식", "값 모두"],
    answers: { business: "대학가 정문 앞 테이크아웃 커피 전문점", customer: "20대 대학생", problem: "수업 사이 10분 안에 커피를 사기 어려움", offer: "아메리카노·라떼", channel: "인스타그램, 학교 커뮤니티", price: 3000, "structure.unitCost": 900, "structure.cost": 4500000, budget: 45000000, livingCost: 2200000, hoursPerWeek: 55, capacity: "대표자와 아르바이트 1명 / 하루 200잔", goal: "3개월 안에 하루 150잔" } },
  { id: "sidedish", label: "맞벌이 반찬 정기배송", mode: "startup", sector: "food_beverage", tags: ["업종 인식", "판매량 없음"],
    answers: { business: "맞벌이 가정에 주 2회 반찬을 정기배송하는 반찬 가게", customer: "서울 마포구 맞벌이 30대 부부", problem: "퇴근 후 반찬 만들 시간이 없음", offer: "반찬 4종 주 2회 정기배송", channel: "맘카페, 당근마켓", price: 59000, "structure.unitCost": 26000, "structure.cost": 2500000, budget: 20000000, livingCost: 0, hoursPerWeek: 45, goal: "1년 안에 정기 구독 80가구" } },
  { id: "nail", label: "1인 예약제 네일샵", mode: "startup", sector: "local_service", tags: ["업종 인식", "값 모두"],
    answers: { business: "역세권 오피스텔에서 1인 예약제 네일샵", customer: "20~30대 직장인 여성", problem: "퇴근 후 예약 가능한 곳이 적음", offer: "젤네일 원컬러·아트", channel: "인스타그램, 네이버 예약", price: 45000, "structure.unitCost": 6000, "structure.cost": 1800000, budget: 15000000, livingCost: 1800000, hoursPerWeek: 50, capacity: "대표자 혼자 / 하루 6건", goal: "6개월 안에 재방문 고객 100명" } },
  { id: "coding", label: "초등 코딩 소그룹 학원", mode: "startup", sector: "education", tags: ["업종 인식", "값 모두"],
    answers: { business: "초등학생 대상 4명 소그룹 코딩 학원", customer: "초등 3~6학년 자녀를 둔 학부모", problem: "아이 수준에 맞는 코딩 수업이 없음", offer: "주 2회 코딩 수업", channel: "맘카페, 학교 앞 전단", price: 220000, "structure.unitCost": 15000, "structure.cost": 3500000, budget: 30000000, livingCost: 2500000, hoursPerWeek: 40, capacity: "대표자 혼자 / 월 40명", goal: "1년 안에 원생 40명" } },
  { id: "candle", label: "수제 캔들 스마트스토어", mode: "startup", sector: "retail_commerce", tags: ["업종 인식", "온라인"],
    answers: { business: "수제 캔들을 스마트스토어로 파는 온라인 가게", customer: "선물을 찾는 20대 여성", problem: "흔하지 않은 선물을 찾기 어려움", offer: "수제 소이캔들 선물 세트", channel: "스마트스토어, 인스타그램", price: 25000, "structure.unitCost": 9000, "structure.cost": 400000, budget: 3000000, hoursPerWeek: 20, capacity: "대표자 혼자 / 주 40개", goal: "6개월 안에 월 200개 판매" } },
  { id: "pt", label: "1:1 PT 스튜디오", mode: "startup", sector: "local_service", tags: ["업종 인식", "고정비 큼"],
    answers: { business: "동네 상가 2층 1:1 퍼스널 트레이닝 스튜디오", customer: "다이어트 하려는 30대 직장인", problem: "큰 헬스장은 부담스럽고 관리가 안 됨", offer: "1:1 PT 50분", channel: "네이버 플레이스, 당근마켓", price: 70000, "structure.unitCost": 3000, "structure.cost": 5500000, budget: 40000000, livingCost: 2500000, hoursPerWeek: 55, capacity: "대표자와 트레이너 1명 / 하루 16건", goal: "6개월 안에 월 매출 1,500만원" } },
  { id: "photo", label: "출장 메뉴 사진 촬영", mode: "startup", sector: "content_media", tags: ["업종 인식", "B2B"],
    answers: { business: "동네 음식점 메뉴 사진을 찍어 주는 출장 사진 서비스", customer: "배달앱에 입점한 동네 음식점 사장님", problem: "배달앱 메뉴 사진이 맛없어 보임", offer: "메뉴 사진 10컷 촬영·보정", channel: "직접 방문 영업, 배달앱 사장님 카페", price: 150000, "structure.unitCost": 20000, "structure.cost": 600000, budget: 5000000, livingCost: 1500000, hoursPerWeek: 30, capacity: "대표자 혼자 / 주 8건", goal: "3개월 안에 단골 가게 20곳" } },
  { id: "pension", label: "제주 독채 펜션", mode: "startup", sector: "space_hospitality", tags: ["업종 인식", "큰 자금"],
    answers: { business: "제주 서귀포에서 독채 펜션 2동 운영", customer: "아이와 함께 오는 가족 여행객", problem: "아이와 편하게 머물 독채가 부족함", offer: "독채 1박", channel: "에어비앤비, 네이버 예약", price: 180000, "structure.unitCost": 30000, "structure.cost": 3000000, budget: 150000000, livingCost: 2500000, hoursPerWeek: 35, capacity: "대표자 부부 / 월 50박", goal: "1년 안에 예약률 60%" } },
  { id: "booking", label: "소상공인 예약 대행 구독", mode: "startup", sector: "software", tags: ["업종 인식", "구독"],
    answers: { business: "동네 미용실 예약을 대신 받아 주는 월 구독 서비스", customer: "1인 미용실 사장님", problem: "시술 중 전화 예약을 못 받음", offer: "월 예약 관리 구독", channel: "직접 영업, 미용 재료상 소개", price: 30000, "structure.unitCost": 3000, "structure.cost": 1200000, budget: 8000000, hoursPerWeek: 40, goal: "1년 안에 구독 매장 100곳" } },
  { id: "senior-match", label: "노인 소개팅(미분류)", mode: "startup", sector: "general", tags: ["업종 미분류", "막연한 고객"],
    answers: { business: "혼자 지내는 어르신을 서로 소개해 주는 소개팅 서비스", customer: "특정 연령대", problem: "필요한데 해주는 곳이 없음", offer: "1:1 소개와 첫 만남 주선", channel: "지인 소개", price: 50000, budget: 5000000, hoursPerWeek: 20, goal: "6개월 안에 회원 50명" } },
  { id: "dog-treat", label: "반려견 수제간식(비용 모름)", mode: "startup", sector: "retail_commerce", tags: ["업종 인식", "비용 없음"],
    answers: { business: "반려견 수제간식을 만들어 온라인으로 판매", customer: "소형견을 키우는 1인 가구", problem: "성분을 믿을 수 있는 간식이 적음", offer: "닭가슴살 육포 세트", channel: "스마트스토어", price: 18000, budget: 2000000, hoursPerWeek: 15, goal: "월 매출 300만원" } },
  { id: "laundry", label: "세탁 픽업(극단값)", mode: "startup", sector: "local_service", tags: ["업종 인식", "극단값: 싼 가격·큰 고정비"],
    answers: { business: "아파트 단지 세탁물 수거·배달 서비스", customer: "맞벌이 가구", problem: "세탁소 갈 시간이 없음", offer: "와이셔츠 세탁 픽업", channel: "아파트 커뮤니티", price: 3000, "structure.unitCost": 1500, "structure.cost": 8000000, budget: 10000000, livingCost: 2000000, hoursPerWeek: 50, capacity: "대표자와 기사 2명 / 하루 300벌", goal: "3개월 안에 흑자" } },
  { id: "practice-room", label: "공유 연습실 시간 대여", mode: "startup", sector: "space_hospitality", tags: ["업종 인식", "대여"],
    answers: { business: "홍대 근처 댄스·보컬 연습실 시간 대여", customer: "취미로 춤추는 20대, 오디션 준비생", problem: "저렴하게 쓸 연습 공간이 없음", offer: "연습실 1시간 대여", channel: "스페이스클라우드, 인스타그램", price: 12000, "structure.unitCost": 500, "structure.cost": 2800000, budget: 25000000, hoursPerWeek: 25, capacity: "방 3개 / 하루 30시간", goal: "6개월 안에 가동률 50%" } },
  { id: "korean-tutor", label: "외국인 한국어 과외", mode: "startup", sector: "education", tags: ["업종 인식", "시간 청구"],
    answers: { business: "국내 거주 외국인 대상 1:1 한국어 회화 과외", customer: "서울 거주 외국인 직장인", problem: "회사 생활에 필요한 한국어를 배울 곳이 없음", offer: "1:1 회화 60분", channel: "외국인 커뮤니티, 링크드인", price: 40000, "structure.unitCost": 0, "structure.cost": 200000, budget: 1000000, hoursPerWeek: 15, goal: "3개월 안에 정기 학생 10명" } },
  { id: "moving", label: "1인 소형 이사·용달", mode: "startup", sector: "logistics", tags: ["업종 인식", "차량"],
    answers: { business: "원룸 1인 소형 이사 전문 용달", customer: "원룸에 사는 20~30대 1인 가구", problem: "작은 짐도 비싼 이사업체를 불러야 함", offer: "원룸 반포장 이사", channel: "당근마켓, 숨고", price: 150000, "structure.unitCost": 40000, "structure.cost": 2200000, budget: 18000000, livingCost: 2000000, hoursPerWeek: 50, capacity: "대표자 혼자 / 하루 2건", goal: "6개월 안에 월 40건" } },
  { id: "sns-agency", label: "소상공인 SNS 대행", mode: "startup", sector: "content_media", tags: ["업종 인식", "B2B 구독"],
    answers: { business: "동네 가게 인스타그램 운영 대행", customer: "SNS를 못 하는 동네 음식점 사장님", problem: "홍보할 시간과 방법을 모름", offer: "월 12회 게시물 제작·업로드", channel: "직접 방문 영업", price: 300000, "structure.unitCost": 30000, "structure.cost": 500000, budget: 3000000, livingCost: 1500000, hoursPerWeek: 35, capacity: "대표자 혼자 / 월 12곳", goal: "6개월 안에 고객 가게 10곳" } },
  { id: "plant-care", label: "반려식물 방문 돌봄(미분류·소자본)", mode: "startup", sector: "general", tags: ["업종 미분류", "적은 자금", "막연한 고객"],
    answers: { business: "출장 가는 사람의 반려식물을 방문해서 돌봐 주는 서비스", customer: "특정 지역 주민", problem: "집을 비우면 식물이 죽음", offer: "방문 물주기·관리 1회", channel: "당근마켓", price: 20000, "structure.unitCost": 2000, budget: 1000000, hoursPerWeek: 10, goal: "3개월 안에 단골 20명" } },
  { id: "gimbap-op", label: "운영 중: 동네 김밥집 매출 정체", mode: "operating", sector: "food_beverage", tags: ["운영 중", "매출 정체"],
    answers: { business: "주택가에서 3년째 운영 중인 김밥집", customer: "주변 직장인과 주민", problem: "매출이 정체·감소하고 있다", offer: "김밥·라면·분식", channel: "배달앱, 포장", price: 4500, "structure.unitCost": 2000, cost: 6000000, period: "2026-06-01 / 2026-08-31", sales: 54000000, budget: 5000000, hoursPerWeek: 70, capacity: "대표자 부부와 아르바이트 1명 / 하루 250줄", goal: "6개월 안에 월 매출 2,200만원 회복" } },
  { id: "fashion-op", label: "운영 중: 온라인 의류몰 재구매 낮음", mode: "operating", sector: "retail_commerce", tags: ["운영 중", "재구매 낮음"],
    answers: { business: "20대 여성 의류를 파는 온라인 쇼핑몰", customer: "20대 직장인 여성", problem: "재방문·재구매가 낮다", offer: "데일리 원피스·블라우스", channel: "자사몰, 인스타그램 광고", price: 39000, "structure.unitCost": 17000, cost: 4000000, period: "2026-05-01 / 2026-08-31", sales: 120000000, budget: 10000000, hoursPerWeek: 60, goal: "6개월 안에 재구매율 30%" } },
];
