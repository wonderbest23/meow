import type { Opportunity } from "../data/opportunities";
import type { FounderAxis, RiasecAxis } from "./assessment";

export type ManualPreferences = {
  budget: "제한 없음" | "100만원 이하" | "100~1,000만원" | "1,000만원 이상";
  time: "제한 없음" | "주말·저녁" | "부업" | "전업";
  channel: "제한 없음" | "온라인" | "오프라인" | "혼합";
  customer: "제한 없음" | "개인" | "기업" | "공공·지역";
};

type Domain = {
  sector: string;
  subject: string;
  titleBase: string;
  problem: string;
  outcome: string;
  customers: ManualPreferences["customer"][];
  riasec: RiasecAxis[];
  founder: FounderAxis[];
  regulation: number;
};

type Mechanism = {
  name: string;
  plainName: string;
  phrase: string;
  model: string;
  channel: ManualPreferences["channel"];
  capital: Opportunity["capital"];
  times: ManualPreferences["time"][];
  revenue: string;
  skills: string[];
  stage: string;
};

const domains: Domain[] = [
  { sector: "공장·기술", subject: "영세 제조사의 숙련 기술", titleBase: "공장 현장 기술", problem: "퇴직과 함께 사라지는 현장 기술을", outcome: "현장 교육 자료로 전환", customers: ["기업"], riasec: ["R", "I", "C"], founder: ["execution", "scale"], regulation: 18 },
  { sector: "야간근무·건강", subject: "야간 근무자의 회복", titleBase: "야간 근무자 건강", problem: "교대 근무자의 불규칙한 수면과 식사를", outcome: "근무표에 맞는 건강 습관으로 개선", customers: ["개인", "기업"], riasec: ["S", "I"], founder: ["customer", "creation"], regulation: 54 },
  { sector: "이사·정착", subject: "지역 이주민의 첫 90일", titleBase: "이주민 정착", problem: "행정·주거·의료 정보를 찾기 어려운 문제를", outcome: "지역 생활에 빠르게 적응하도록 지원", customers: ["개인", "공공·지역"], riasec: ["S", "C", "E"], founder: ["customer", "execution"], regulation: 32 },
  { sector: "건축자재·재사용", subject: "리모델링 잔여 자재", titleBase: "남은 건축 자재", problem: "소량이라 버려지는 좋은 건축 자재를", outcome: "지역에서 다시 판매하고 사용", customers: ["기업", "개인"], riasec: ["R", "A", "I"], founder: ["opportunity", "creation"], regulation: 46 },
  { sector: "아파트·절약", subject: "오래된 공동주택의 에너지", titleBase: "아파트 에너지 절약", problem: "오래된 아파트에서 새는 전기와 난방비를", outcome: "작은 개선으로 함께 절약", customers: ["개인", "공공·지역"], riasec: ["I", "R", "C"], founder: ["scale", "execution"], regulation: 30 },
  { sector: "옷·생활편의", subject: "감각·신체 다양성의 옷 선택", titleBase: "입기 편한 옷", problem: "소리·촉감·움직임 때문에 생기는 옷 선택의 불편을", outcome: "실패 없는 구매 기준으로 정리", customers: ["개인", "기업"], riasec: ["A", "S", "I"], founder: ["customer", "creation"], regulation: 14 },
  { sector: "지역·이동", subject: "소도시 이동 약자의 외출", titleBase: "이동이 불편한 주민 외출", problem: "교통이 불편해 포기하는 장보기와 병원 방문을", outcome: "이웃 자원과 생활 이동으로 연결", customers: ["개인", "공공·지역"], riasec: ["S", "E", "C"], founder: ["customer", "opportunity"], regulation: 62 },
  { sector: "프리랜서·돈관리", subject: "프리랜서의 불규칙한 현금흐름", titleBase: "프리랜서 돈 관리", problem: "늦은 입금과 세금 때문에 생기는 돈 걱정을", outcome: "예측 가능한 월간 돈 관리로 개선", customers: ["개인"], riasec: ["C", "I", "E"], founder: ["execution", "scale"], regulation: 58 },
  { sector: "농촌·공간", subject: "농촌의 유휴 작업 공간", titleBase: "농촌 빈 작업실", problem: "쓰이지 않는 농촌의 창고와 작업장을", outcome: "도시 창작자가 일할 수 있는 공간으로 전환", customers: ["개인", "공공·지역"], riasec: ["R", "A", "E"], founder: ["opportunity", "creation"], regulation: 38 },
  { sector: "시장·관광", subject: "전통시장의 외국인 경험", titleBase: "외국인 전통시장 이용", problem: "언어와 결제가 어려워 놓치는 전통시장 경험을", outcome: "상인과 여행자의 실제 구매로 연결", customers: ["개인", "기업", "공공·지역"], riasec: ["E", "S", "A"], founder: ["customer", "opportunity"], regulation: 24 },
  { sector: "청소년·진로", subject: "청소년의 진로 불확실성", titleBase: "청소년 진로", problem: "직업 이름만 배우는 어려운 진로 교육을", outcome: "직접 해보는 진로 체험으로 전환", customers: ["개인", "공공·지역"], riasec: ["S", "A", "I"], founder: ["creation", "customer"], regulation: 27 },
  { sector: "반려동물·돌봄", subject: "1인 가구의 반려동물 응급 공백", titleBase: "반려동물 긴급 돌봄", problem: "보호자가 갑자기 자리를 비울 때 생기는 돌봄 공백을", outcome: "확인된 이웃 돌봄으로 해결", customers: ["개인"], riasec: ["S", "C", "R"], founder: ["customer", "execution"], regulation: 42 },
  { sector: "학원·소통", subject: "작은 학원의 학부모 소통", titleBase: "학원 학부모 소통", problem: "반복되지만 기록되지 않는 상담과 성장 소식을", outcome: "짧고 이해하기 쉬운 보고서로 정리", customers: ["기업"], riasec: ["S", "C", "I"], founder: ["customer", "scale"], regulation: 36 },
  { sector: "축제·재사용", subject: "지역 축제의 일회용 폐기물", titleBase: "축제용품 재사용", problem: "행사마다 새로 사고 버리는 축제용품을", outcome: "지역에서 빌리고 다시 쓰도록 전환", customers: ["기업", "공공·지역"], riasec: ["R", "E", "C"], founder: ["execution", "scale"], regulation: 34 },
  { sector: "약국·건강", subject: "독립 약국의 복약 이후 경험", titleBase: "동네 약국 약 복용 관리", problem: "약을 받은 뒤 끊기는 복용 확인과 생활 관리를", outcome: "동네 약국의 꾸준한 약 복용 지원으로 연결", customers: ["개인", "기업"], riasec: ["S", "I", "C"], founder: ["customer", "execution"], regulation: 78 },
  { sector: "가게·폭염", subject: "폭염 취약 상점의 영업 손실", titleBase: "가게 폭염 대비", problem: "폭염 때문에 작은 가게가 혼자 감당하는 냉방비와 영업 손실을", outcome: "동네 가게가 함께 대비하도록 전환", customers: ["기업", "공공·지역"], riasec: ["I", "S", "E"], founder: ["opportunity", "scale"], regulation: 33 },
  { sector: "가족·기록", subject: "사라지는 가족의 생활 기술", titleBase: "가족 요리·수선 기록", problem: "세대가 바뀌며 사라지는 요리와 수선 방법을", outcome: "다시 찾아 쓸 수 있는 기록으로 보존", customers: ["개인"], riasec: ["A", "S", "R"], founder: ["creation", "customer"], regulation: 12 },
  { sector: "중고·취미", subject: "전문 취미 장비의 중고 거래", titleBase: "중고 취미 장비", problem: "상태를 판단하기 어려운 비싼 취미 장비를", outcome: "믿고 다시 살 수 있도록 확인", customers: ["개인", "기업"], riasec: ["R", "I", "E"], founder: ["opportunity", "execution"], regulation: 22 },
];

const mechanisms: Mechanism[] = [
  { name: "현장 진단 작업실", plainName: "방문 진단", phrase: "직접 찾아가 문제를 확인하고 고쳐주는", model: "방문형 서비스", channel: "오프라인", capital: "소액", times: ["부업", "전업"], revenue: "진단비 + 실행 수수료", skills: ["현장 관찰", "고객 상담", "협력자 운영"], stage: "시험 운영" },
  { name: "인공지능 기록 도우미", plainName: "자동 기록 정리", phrase: "흩어진 기록을 인공지능으로 정리하고 다음 할 일을 알려주는", model: "온라인 구독 서비스", channel: "온라인", capital: "중간", times: ["부업", "전업"], revenue: "월 구독료", skills: ["업무 분석", "자료 구조화", "서비스 기획"], stage: "기술 확인" },
  { name: "공동구매 연결망", plainName: "공동구매", phrase: "같은 물건이나 서비스가 필요한 사람을 모아 비용을 낮추는", model: "공동구매 서비스", channel: "혼합", capital: "중간", times: ["주말·저녁", "부업", "전업"], revenue: "거래 수수료 + 회원비", skills: ["공급자 발굴", "고객 모임 운영", "운영"], stage: "수동 연결" },
  { name: "신뢰 인증 표시", plainName: "품질 확인", phrase: "품질을 같은 기준으로 확인하고 결과를 쉽게 보여주는", model: "품질 평가", channel: "혼합", capital: "중간", times: ["부업", "전업"], revenue: "평가비 + 기업 사용료", skills: ["평가 기준", "사용자 조사", "기업 영업"], stage: "기준 확인" },
  { name: "생활 선택 도우미", plainName: "맞춤 선택 도움", phrase: "여러 선택지 중 맞는 것을 찾아 예약까지 도와주는", model: "생활 지원 구독", channel: "혼합", capital: "소액", times: ["주말·저녁", "부업", "전업"], revenue: "월 구독료 + 제휴 수익", skills: ["상담", "정보 탐색", "일정 운영"], stage: "고객 인터뷰" },
  { name: "이동형 체험 도구", plainName: "체험 도구 대여", phrase: "필요한 도구와 쉬운 안내서를 빌려주는", model: "도구 대여", channel: "오프라인", capital: "중간", times: ["주말·저녁", "부업", "전업"], revenue: "대여료 + 소모품 판매", skills: ["제품 설계", "물류", "안내 자료 제작"], stage: "시제품 확인" },
  { name: "문제 해결 연결소", plainName: "전문가 연결", phrase: "도움이 필요한 사람과 경험 있는 전문가를 연결하는", model: "전문가 연결 서비스", channel: "온라인", capital: "소액", times: ["주말·저녁", "부업", "전업"], revenue: "거래 수수료", skills: ["연결", "품질 관리", "고객 모임 운영"], stage: "수동 연결" },
  { name: "주말 하루학교", plainName: "하루 체험 수업", phrase: "하루 동안 직접 해보며 배우게 하는", model: "체험 교육", channel: "오프라인", capital: "소액", times: ["주말·저녁", "부업"], revenue: "참가비 + 기관 후원", skills: ["교육 설계", "모임 진행", "협력기관 관리"], stage: "첫 수업" },
  { name: "생활정보 구독", plainName: "정보 알림", phrase: "꼭 알아야 할 변화와 위험을 정기적으로 알려주는", model: "정보 구독", channel: "온라인", capital: "소액", times: ["주말·저녁", "부업", "전업"], revenue: "월 구독료 + 유료 보고서", skills: ["자료 해석", "안내 자료 제작", "회원 운영"], stage: "정보 가치 확인" },
  { name: "지역 임시매장 실험실", plainName: "체험 판매", phrase: "빈 공간에서 상품을 직접 보여주고 판매해보는", model: "단기 매장 판매", channel: "오프라인", capital: "중간", times: ["주말·저녁", "부업", "전업"], revenue: "제품 판매 + 공간 제휴", skills: ["공간 기획", "제품 선정", "현장 운영"], stage: "단기 매장 시험" },
  { name: "지역 운영 가맹모델", plainName: "지역 운영점", phrase: "검증된 운영 방법을 지역 운영자에게 제공하는", model: "지역 운영점", channel: "혼합", capital: "높음", times: ["전업"], revenue: "가입비 + 매출 수수료", skills: ["업무 안내서", "협력자 교육", "품질 관리"], stage: "직영점 먼저 운영" },
  { name: "성과 연동 협력사업", plainName: "먼저 개선하고 나중에 결제", phrase: "먼저 개선해준 뒤 실제 성과에 따라 비용을 받는", model: "성과 기반 서비스", channel: "혼합", capital: "중간", times: ["부업", "전업"], revenue: "기본료 + 성과 수수료", skills: ["성과 측정", "영업", "일정 관리"], stage: "계약 시험" },
];

// Avoid combinations that produce understandable words but an unrealistic business idea.
const compatibleMechanisms: number[][] = [
  [0, 1, 6, 7, 8, 10, 11],
  [0, 1, 2, 3, 4, 5, 8, 11],
  [0, 1, 4, 6, 7, 8, 9, 10, 11],
  [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11],
  [0, 1, 2, 3, 4, 5, 8, 10, 11],
  [0, 1, 2, 3, 4, 5, 6, 8, 9],
  [0, 1, 4, 5, 6, 8, 10, 11],
  [0, 1, 2, 4, 6, 7, 8, 11],
  [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11],
  [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11],
  [1, 2, 4, 5, 6, 7, 8, 9, 10],
  [0, 1, 2, 3, 4, 6, 8, 10],
  [0, 1, 3, 4, 6, 8, 10, 11],
  [0, 1, 2, 3, 5, 6, 8, 9, 10, 11],
  [0, 1, 3, 4, 6, 8, 10],
  [0, 1, 2, 3, 4, 5, 6, 8, 10, 11],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
];

const plainTitleOverrides: Record<string, string> = {
  "0-0": "공장 현장 기술 방문 상담",
  "0-1": "공장 기술 자동 기록",
  "0-6": "퇴직 기술자와 작은 공장 연결",
  "0-7": "공장 현장 기술 하루 수업",
  "0-11": "작은 공장 현장 개선 서비스",
  "1-2": "야간 근무자 건강용품 공동구매",
  "1-0": "야간 근무자 건강 방문 상담",
  "1-1": "야간 근무 건강 기록 알림",
  "1-3": "야간 근무자 휴식 환경 점검",
  "1-11": "야간 근무자 건강 개선 서비스",
  "2-0": "이주민 생활 불편 방문 상담",
  "2-1": "이주민 생활정보 자동 정리",
  "2-4": "이주민 정착 도우미",
  "2-6": "이주민과 생활 전문가 연결",
  "2-9": "이주민 동네 생활 체험",
  "2-11": "이주민 정착 지원 서비스",
  "3-0": "남은 건축 자재 현장 확인",
  "3-1": "남은 건축 자재 자동 등록",
  "3-5": "건축 공구·자재 체험 대여",
  "3-11": "건축 자재 재사용 지원 서비스",
  "4-3": "아파트 에너지 절약 상태 점검",
  "4-1": "아파트 전기 사용 자동 기록",
  "4-4": "아파트 절약 방법 맞춤 추천",
  "4-5": "아파트 전기 절약 기기 대여",
  "4-11": "아파트 에너지 절약 서비스",
  "5-0": "입기 편한 옷 방문 상담",
  "5-1": "편한 옷 정보 자동 정리",
  "5-5": "입기 편한 옷 체험·대여",
  "6-0": "이동이 불편한 주민 외출 상담",
  "6-1": "이동 요청 자동 정리",
  "6-4": "이동이 불편한 주민 교통편 찾기",
  "6-5": "이동이 불편한 주민 보조기기 대여",
  "6-6": "이동이 불편한 주민과 도우미 연결",
  "6-8": "이동이 불편한 주민 교통 알림",
  "6-11": "이동이 불편한 주민 이동 지원",
  "7-0": "프리랜서 돈 관리 상담",
  "7-1": "프리랜서 입금·세금 자동 정리",
  "7-2": "프리랜서 고정비 절약 공동구매",
  "7-4": "프리랜서 돈 관리 맞춤 상담",
  "7-11": "프리랜서 돈 관리 서비스",
  "8-2": "농촌 작업실 공동 이용",
  "8-1": "농촌 작업실 예약 자동 정리",
  "8-3": "농촌 작업실 상태 확인",
  "8-4": "농촌 작업실 맞춤 찾기",
  "8-5": "농촌 작업실·도구 대여",
  "8-9": "농촌 작업실 주말 체험",
  "8-11": "농촌 빈 공간 활용 서비스",
  "9-0": "전통시장 외국인 이용 현장 점검",
  "9-1": "전통시장 외국인 안내 자동 정리",
  "9-2": "외국인 전통시장 장보기",
  "9-3": "전통시장 외국인 이용 편의 확인",
  "9-4": "외국인 전통시장 이용 도우미",
  "9-9": "외국인 전통시장 체험 행사",
  "9-11": "전통시장 외국인 손님 늘리기",
  "10-2": "청소년 진로 체험 공동구매",
  "10-1": "청소년 진로 기록 자동 정리",
  "10-4": "청소년 진로 맞춤 찾기",
  "10-9": "청소년 진로 체험 행사",
  "11-0": "반려동물 긴급 돌봄 방문 점검",
  "11-1": "반려동물 긴급 돌봄 요청 정리",
  "11-2": "반려동물 돌봄 공동구매",
  "11-3": "반려동물 돌봄 업체 확인",
  "11-4": "반려동물 긴급 돌봄 찾기",
  "12-0": "학원 학부모 소통 방문 상담",
  "12-1": "학원 상담·소식 자동 정리",
  "12-3": "학원 상담·소식 점검",
  "12-4": "학원 학부모 상담 도우미",
  "12-11": "학원 학부모 소통 개선 서비스",
  "13-0": "축제용품 재사용 현장 점검",
  "13-1": "축제용품 대여 기록 자동 정리",
  "13-2": "축제용품 공동구매·재사용",
  "13-5": "재사용 축제용품 대여",
  "13-11": "축제용품 재사용 운영 서비스",
  "14-0": "약국 약 복용 관리 방문 상담",
  "14-1": "약 복용 기록 자동 정리",
  "14-3": "약국 약 복용 안내 점검",
  "14-4": "약 복용 생활 관리 도우미",
  "14-6": "약 복용 전문가 상담 연결",
  "15-2": "가게 냉방용품 공동구매",
  "15-1": "가게 폭염 비용 자동 기록",
  "15-3": "가게 폭염 대비 상태 점검",
  "15-4": "가게 폭염 대비 맞춤 상담",
  "15-5": "가게 냉방기기 체험 대여",
  "15-11": "가게 폭염 대비 비용 절약",
  "16-0": "가족 요리·수선 영상 제작",
  "16-1": "가족 요리·수선 기록 정리",
  "16-2": "가족 기록책 공동 제작",
  "16-3": "가족 기록 내용 확인",
  "16-4": "가족 기록 제작 도우미",
  "16-5": "가족 요리·수선 도구 대여",
  "16-7": "가족 요리·수선 하루 수업",
  "16-9": "가족 요리·수선 체험 행사",
  "17-2": "취미 장비 공동구매",
  "17-0": "중고 취미 장비 방문 점검",
  "17-1": "중고 취미 장비 정보 정리",
};

const plainOneLinerOverrides: Record<string, string> = {
  "1-2": "야간 근무자가 자주 쓰는 회복·건강용품을 함께 사서 가격을 낮추는 공동구매 사업입니다.",
  "7-2": "프리랜서가 자주 쓰는 세무·업무 도구를 함께 계약해 매달 나가는 비용을 낮추는 공동구매 사업입니다.",
  "8-2": "농촌의 빈 작업실을 여러 창작자가 함께 빌려 사용료를 낮추는 공간 공동 이용 사업입니다.",
  "9-2": "외국인 여행자가 전통시장 상품을 쉽게 고르고 함께 주문하도록 돕는 장보기 사업입니다.",
  "10-2": "학교와 학부모가 진로 체험 프로그램을 함께 신청해 참가비를 낮추는 사업입니다.",
  "11-2": "반려인이 돌봄 이용권을 함께 구매해 필요할 때 저렴하게 쓰도록 돕는 사업입니다.",
  "11-0": "보호자가 갑자기 자리를 비우는 상황에 대비해 돌봄 계획과 집 환경을 찾아가 점검하는 사업입니다.",
  "13-2": "지역 축제가 천막·식기·안내용품을 함께 구매하고 돌려 써서 비용과 쓰레기를 줄이는 사업입니다.",
  "15-2": "작은 가게가 냉방용품을 함께 구매해 여름 준비 비용을 낮추는 사업입니다.",
  "16-2": "여러 가족의 요리와 수선 방법을 한 번에 책으로 제작해 인쇄비를 낮추는 사업입니다.",
  "16-0": "가족을 직접 찾아가 요리와 수선 방법을 촬영하고 따라 하기 쉬운 영상으로 만드는 사업입니다.",
  "17-2": "같은 취미를 가진 사람이 장비를 함께 주문해 구매 가격을 낮추는 사업입니다.",
};

function buildPlainTitle(domainIndex: number, mechanismIndex: number) {
  const domain = domains[domainIndex];
  const mechanism = mechanisms[mechanismIndex];
  if (!domain || !mechanism) return "쉬운 사업 아이디어";
  return plainTitleOverrides[`${domainIndex}-${mechanismIndex}`] ?? `${domain.titleBase} ${mechanism.plainName}`;
}

function buildPlainOneLiner(domainIndex: number, mechanismIndex: number) {
  const domain = domains[domainIndex];
  const mechanism = mechanisms[mechanismIndex];
  if (!domain || !mechanism) return "고객의 문제를 쉽게 해결하는 사업입니다.";
  const override = plainOneLinerOverrides[`${domainIndex}-${mechanismIndex}`];
  if (override) return override;
  return `${domain.problem} ${mechanism.phrase} 사업입니다. 이를 통해 ${domain.outcome}합니다.`;
}

function withAndParticle(value: string) {
  const last = value.charCodeAt(value.length - 1);
  const hasBatchim = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return `${value}${hasBatchim ? "과" : "와"}`;
}

export function normalizeGeneratedOpportunity<T extends Opportunity>(opportunity: T): T {
  const match = /^generated-(\d+)-(\d+)$/.exec(opportunity.id);
  if (!match) return opportunity;
  const domainIndex = Number(match[1]);
  const mechanismIndex = Number(match[2]);
  if (!domains[domainIndex] || !mechanisms[mechanismIndex]) return opportunity;
  return {
    ...opportunity,
    title: buildPlainTitle(domainIndex, mechanismIndex),
    oneLiner: buildPlainOneLiner(domainIndex, mechanismIndex),
    sector: domains[domainIndex].sector,
  };
}

function seededRandom(seed: number) {
  let value = seed || 1;
  return () => {
    value = (value * 9301 + 49297) % 233280;
    return value / 233280;
  };
}

function matchesPreferences(mechanism: Mechanism, domain: Domain, preferences?: ManualPreferences) {
  if (!preferences) return true;
  const allowedCapital: Record<ManualPreferences["budget"], Opportunity["capital"][]> = {
    "제한 없음": ["소액", "중간", "높음"],
    "100만원 이하": ["소액"],
    "100~1,000만원": ["소액", "중간"],
    "1,000만원 이상": ["소액", "중간", "높음"],
  };
  return (
    allowedCapital[preferences.budget].includes(mechanism.capital) &&
    (preferences.time === "제한 없음" || mechanism.times.includes(preferences.time)) &&
    (preferences.channel === "제한 없음" || mechanism.channel === preferences.channel || mechanism.channel === "혼합") &&
    (preferences.customer === "제한 없음" || domain.customers.includes(preferences.customer))
  );
}

export function generateOpportunityPool(
  seed: number,
  preferences?: ManualPreferences,
  count = 24,
): Opportunity[] {
  const random = seededRandom(seed);
  const combinations = domains.flatMap((domain, domainIndex) =>
    mechanisms
      .map((mechanism, mechanismIndex) => ({ domain, mechanism, domainIndex, mechanismIndex }))
      .filter(({ mechanismIndex }) => compatibleMechanisms[domainIndex]?.includes(mechanismIndex))
      .filter(({ domain: candidateDomain, mechanism: candidateMechanism }) =>
        matchesPreferences(candidateMechanism, candidateDomain, preferences),
      ),
  );

  for (let index = combinations.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [combinations[index], combinations[swap]] = [combinations[swap], combinations[index]];
  }

  const selected: typeof combinations = [];
  const usedDomains = new Set<number>();
  for (const combination of combinations) {
    if (!usedDomains.has(combination.domainIndex) || selected.length >= domains.length) {
      selected.push(combination);
      usedDomains.add(combination.domainIndex);
    }
    if (selected.length >= count) break;
  }

  return selected.map(({ domain, mechanism, domainIndex, mechanismIndex }, index) => {
    const feasibilityBase = mechanism.capital === "소액" ? 80 : mechanism.capital === "중간" ? 68 : 50;
    const feasibility = Math.max(30, Math.min(90, feasibilityBase - Math.round(domain.regulation * 0.25)));
    const launchTime =
      mechanism.capital === "소액" ? "2~6주" : mechanism.capital === "중간" ? "6~12주" : "12~24주";

    return {
      id: `generated-${domainIndex}-${mechanismIndex}`,
      title: buildPlainTitle(domainIndex, mechanismIndex),
      oneLiner: buildPlainOneLiner(domainIndex, mechanismIndex),
      sector: domain.sector,
      model: mechanism.model,
      customer: domain.customers.join("·"),
      capital: mechanism.capital,
      launchTime,
      revenue: mechanism.revenue,
      stage: mechanism.stage,
      riasec: domain.riasec,
      founder: [...new Set([...domain.founder, ...(mechanism.model.includes("플랫폼") || mechanism.model.includes("라이선스") ? ["scale" as FounderAxis] : ["execution" as FounderAxis])])],
      market: 0,
      novelty: 0,
      feasibility,
      evidenceStatus: "hypothesis",
      evidenceSources: [],
      regulation: domain.regulation,
      skills: mechanism.skills,
      risk:
        domain.regulation >= 65
          ? "전문가 검토와 관련 법령·자격 범위를 먼저 확인해야 합니다."
          : mechanism.capital === "높음"
            ? "고정비 투자 전에 선주문 또는 수동 운영으로 반복 수요를 검증해야 합니다."
            : "아이디어 조합은 가설이므로 실제 고객의 지불 의사를 확인해야 합니다.",
      firstTest: `${withAndParticle(domain.titleBase)} 관련된 잠재 고객 10명을 만나 현재 해결 방식과 최근 지출을 확인한 뒤, ${mechanism.plainName}의 핵심 기능 하나만 직접 제공하세요.`,
      color: ["sage", "steel", "apricot", "moss", "violet", "rose", "lime", "sky", "navy", "sand", "amber", "peach"][index % 12],
    };
  });
}

// 하이브리드 제안 엔진이 LLM을 현실·규제에 붙들어 두기 위한 참고 지식(216 라이브러리에서 추출).
// LLM은 이 목록을 "영감·현실성 앵커"로만 쓰고 새로운 도메인·조합을 만들 수 있다.
export const ideaDomainReference = domains.map((domain) => ({
  sector: domain.sector,
  subject: domain.subject,
  regulation: domain.regulation,
  customers: domain.customers,
}));

export const ideaMechanismReference = mechanisms.map((mechanism) => ({
  model: mechanism.model,
  channel: mechanism.channel,
  capital: mechanism.capital,
  revenue: mechanism.revenue,
}));

export const opportunityColors = [
  "sage", "steel", "apricot", "moss", "violet", "rose", "lime", "sky", "navy", "sand", "amber", "peach",
] as const;
