// Shared synthetic source for paid generation and offline account/download verification.
export const syntheticDescription = "가상 검증용 사업안. 마포구 작은 카페에 메뉴 소개글 3개를 5만원에 제공하고 수정 1회, 월 최대 2건으로 제한하는 1인 글쓰기 서비스. 주 5시간, 시작 예산 20만원. 고객과 매출은 없으며 실제 고객 연락이나 결제는 하지 않습니다.";

export const syntheticDeckInput = {
  businessName: "QA 메뉴 소개글 서비스", planType: "일반 사업계획서", businessDescription: syntheticDescription,
  allAnswers: {}, businessContext: syntheticDescription,
  sections: [
    { chapterTitle: "사업 개요", sectionTitle: "한눈에 보기", markdown: syntheticDescription },
    { chapterTitle: "고객과 시장", sectionTitle: "고객 문제", markdown: "AI 제안: 메뉴의 특징은 알고 있지만 글로 정리할 시간이 부족한 카페 운영자를 대상으로 합니다. 수요는 미검증입니다. 메뉴 정보와 게시 용도를 받아 초안을 작성하고 일괄 수정 1회를 거쳐 텍스트로 납품합니다. 사진·광고 대행은 제외합니다." },
    { chapterTitle: "사업 전략", sectionTitle: "상품 구성", markdown: "사용자 선택 조건: 소개글 3개, 시범 가격 5만원, 수정 1회. 메뉴명·재료·맛·게시 용도를 확인합니다. AI 제안: 공통 견본과 의뢰 양식으로 작업 범위를 고정합니다. 주문·방문 증가를 보장하지 않습니다." },
    { chapterTitle: "재무 계획", sectionTitle: "비용과 운영", markdown: "예산 20만원, 주 5시간, 월 최대 2건. 이는 판매 목표가 아니라 수용 상한입니다. 현재 고객과 매출은 없고 비용은 미확인입니다. 매출이나 이익을 확정하지 않습니다. 최초 도구 비용과 수수료를 확인한 뒤 예산을 배분합니다." },
    { chapterTitle: "요약·다음 단계", sectionTitle: "첫 실행", markdown: "AI 제안: 가상 메뉴 하나의 소개글 견본을 만들고 작성 시간과 수정 횟수를 기록합니다. 이번 QA는 실제 연락·판매·결제 없이 진행합니다. 수행 시간과 비용을 확인한 뒤 범위 또는 가격을 검토합니다." },
  ],
};
