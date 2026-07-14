export type SupportFaqItem = {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
};

export type SupportFaqCategory = {
  id: "start" | "project" | "files" | "landing" | "account" | "payment" | "error";
  label: string;
  description: string;
  items: SupportFaqItem[];
};

export const supportFaqCategories: SupportFaqCategory[] = [
  {
    id: "start",
    label: "시작 방법",
    description: "어떤 방법을 골라야 할지",
    items: [
      { id: "start-easy", question: "가장 쉬운 시작 방법은 무엇인가요?", answer: "처음이라면 ‘질문으로 찾기’를 선택하세요. 두 가지 중 하나씩 고르면 성향과 시작 조건을 바탕으로 사업 후보를 추천합니다.", keywords: ["가장 쉬운", "처음", "시작 방법", "뭐부터"] },
      { id: "start-idea", question: "이미 하고 싶은 사업이 있어요.", answer: "‘내 아이디어로 바로 기획’을 선택하세요. 아이디어, 시작 예산, 주당 시간만 입력하면 고객·상품·가격·이름·소개 문구의 초안을 자동으로 만듭니다.", keywords: ["아이디어", "하고 싶은 사업", "바로 기획"] },
      { id: "start-unknown", question: "질문에 답을 모르겠어요.", answer: "‘모르겠음’을 눌러도 다음으로 갈 수 있습니다. 필요한 숫자는 안전한 추천값으로 임시 계산하며, 프로젝트에서 언제든 다시 바꿀 수 있습니다.", keywords: ["모르겠음", "답을 몰라", "잘 모르", "추천값"] },
    ],
  },
  {
    id: "project",
    label: "프로젝트 진행",
    description: "단계와 다음 버튼이 헷갈릴 때",
    items: [
      { id: "project-next", question: "다음 단계로 어떻게 넘어가나요?", answer: "현재 화면의 초안을 만든 뒤 ‘이 초안 사용’을 한 번 확인하세요. 그러면 하단 버튼이 ‘사용하고 다음’으로 바뀌고 다음 단계가 열립니다.", keywords: ["다음 단계", "넘어가", "진행 안", "버튼"] },
      { id: "project-today", question: "오늘 할 일을 전부 해야 하나요?", answer: "오늘 할 일은 사업 실행을 돕는 선택형 안내입니다. 하지 않아도 이미 완성된 문서의 미리보기와 다운로드가 막히지는 않습니다.", keywords: ["오늘 할 일", "전부", "꼭 해야", "안 해도"] },
      { id: "project-reflect", question: "수정한 내용이 다음 단계에도 반영되나요?", answer: "저장한 사업 조건과 ‘이 초안 사용’으로 확정한 최신 내용이 다음 단계의 기본 정보로 이어집니다. 단순히 펼쳐보기만 한 수정 전 초안은 확정 정보로 사용하지 않습니다.", keywords: ["반영", "수정한 내용", "다음에도", "저장"] },
    ],
  },
  {
    id: "files",
    label: "결과물·파일",
    description: "문서 확인과 내려받기",
    items: [
      { id: "files-types", question: "어떤 파일을 받을 수 있나요?", answer: "최종 결과에서 사업 실행 보고서, 사업계획서, 사업소개서, 고객·시장 자료 등을 PDF·Word·PPTX 형식으로 확인하고 내려받을 수 있습니다. 판매 페이지는 웹 미리보기로 제공합니다.", keywords: ["파일", "PDF", "워드", "PPT", "결과물"] },
      { id: "files-preview", question: "내려받지 않고 전체 내용을 볼 수 있나요?", answer: "가능합니다. 최종 결과에서 문서를 선택한 뒤 ‘전체 화면 미리보기’를 누르면 브라우저에서 먼저 확인할 수 있습니다.", keywords: ["미리보기", "전체 내용", "내려받지", "다운로드 없이"] },
      { id: "files-final", question: "언제 최종 결과물이 완성되나요?", answer: "6단계 ‘첫 공개’까지 사용하면 최종 결과 화면이 열립니다. 각 단계에서 만든 초안은 중간에도 확인할 수 있고, 최종 화면에서 파일별로 정리됩니다.", keywords: ["최종 결과", "언제 완성", "6단계", "완료"] },
    ],
  },
  {
    id: "landing",
    label: "판매 페이지",
    description: "디자인·공개·도메인",
    items: [
      { id: "landing-create", question: "판매 페이지도 만들어주나요?", answer: "네. 사업 정보로 제목, 소개, 상품, 가격, 문의 버튼과 사업자 정보 영역이 포함된 판매 페이지 초안을 자동으로 만듭니다. 프로젝트에서 문구와 이미지를 수정할 수 있습니다.", keywords: ["판매 페이지", "홈페이지", "만들어", "랜딩"] },
      { id: "landing-domain", question: "도메인 비용도 포함되나요?", answer: "페이지 제작과 미리보기는 서비스에 포함되지만 개인 도메인 구매 비용은 별도입니다. 도메인을 준비한 뒤 연결이 필요한 경우 운영자 문의로 주소를 보내주세요.", keywords: ["도메인", "주소", "비용 포함", "연결"] },
      { id: "landing-expert", question: "전문가에게 디자인 제작을 맡기고 싶어요.", answer: "맞춤 디자인 제작은 별도 상담으로 진행합니다. 아래 ‘운영자에게 문의’를 누르고 업종, 원하는 분위기, 참고 사이트와 희망 공개일을 적어주세요.", keywords: ["전문가", "맞춤 디자인", "제작 맡기", "외주"] },
    ],
  },
  {
    id: "account",
    label: "계정·저장",
    description: "로그인과 작업 불러오기",
    items: [
      { id: "account-save", question: "작업 내용은 자동으로 저장되나요?", answer: "프로젝트에서 저장하거나 초안을 확정한 내용은 자동으로 보관됩니다. 다른 기기에서도 이어서 보려면 마이페이지에서 같은 계정으로 로그인하세요.", keywords: ["자동 저장", "저장되", "작업 내용", "보관"] },
      { id: "account-login", question: "기존 작업을 어디서 불러오나요?", answer: "상단 사람 모양 마이페이지 아이콘을 누른 뒤 로그인하면 저장된 작업을 불러올 수 있습니다.", keywords: ["기존 작업", "불러오", "마이페이지", "로그인"] },
      { id: "account-recover", question: "비밀번호를 잊어버렸어요.", answer: "마이페이지의 ‘계정 복구’에서 가입한 이메일을 입력하세요. 복구 메일이 오지 않으면 스팸함을 확인한 뒤 운영자에게 문의해주세요.", keywords: ["비밀번호", "계정 복구", "로그인 안", "메일"] },
    ],
  },
  {
    id: "payment",
    label: "결제·환불",
    description: "베타 이용과 향후 결제",
    items: [
      { id: "payment-beta", question: "지금은 결제해야 하나요?", answer: "현재 공개 베타는 결제 없이 전체 흐름을 시험할 수 있습니다. 정식 결제를 열기 전에는 결제 화면에서 비용이 청구되지 않습니다.", keywords: ["결제", "무료", "베타", "돈 내"] },
      { id: "payment-future", question: "정식 가격은 얼마인가요?", answer: "정식 상품 가격과 제공 범위는 아직 확정 전입니다. 가격이 확정되면 결제 전에 총액, 포함 결과물, 제작 기간과 환불 기준을 먼저 표시합니다.", keywords: ["정식 가격", "얼마", "상품 가격", "비용"] },
      { id: "payment-refund", question: "환불 기준은 어디서 확인하나요?", answer: "사이트 하단 ‘취소·환불 기준’에서 확인할 수 있습니다. 현재 베타는 실제 결제가 없어 환불할 결제 금액도 발생하지 않습니다.", keywords: ["환불", "취소", "환불 기준"] },
    ],
  },
  {
    id: "error",
    label: "오류·기타",
    description: "버튼이나 화면이 작동하지 않을 때",
    items: [
      { id: "error-disabled", question: "다음 버튼이 눌리지 않아요.", answer: "현재 질문의 선택이나 필수 입력이 비어 있으면 다음 버튼이 연하게 표시됩니다. 내용을 입력하거나 ‘모르겠음’을 누른 뒤 다시 확인해주세요.", keywords: ["다음 버튼", "안 눌", "비활성", "회색"] },
      { id: "error-load", question: "화면이나 결과가 불러와지지 않아요.", answer: "페이지를 한 번 새로고침한 뒤 마이페이지에서 프로젝트를 다시 열어보세요. 같은 문제가 반복되면 운영자 문의에 현재 화면 주소와 발생한 행동을 적어주세요.", keywords: ["불러오지", "로딩", "화면 오류", "결과 안"] },
      { id: "error-human", question: "운영자에게 직접 문의하고 싶어요.", answer: "아래 ‘운영자에게 문의’를 누르면 개별 메시지를 남길 수 있습니다. 홈페이지 제작과 서비스 이용 문의에 답변드리며 세무·법률·투자 연결 상담은 제공하지 않습니다.", keywords: ["운영자", "직접 문의", "사람 상담", "상담원"] },
    ],
  },
];

export function findSupportFaq(query: string): SupportFaqItem | null {
  const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return null;
  let best: { item: SupportFaqItem; score: number } | null = null;
  for (const category of supportFaqCategories) {
    for (const item of category.items) {
      const score = item.keywords.reduce((total, keyword) => total + (normalized.includes(keyword.toLowerCase()) ? Math.max(2, keyword.length) : 0), 0);
      if (score > (best?.score ?? 0)) best = { item, score };
    }
  }
  return best?.score ? best.item : null;
}
