export type SupportFaqItem = {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  /** 답변 아래에 붙는 이동 버튼 — 누르면 해당 화면으로 간다 */
  link?: { href: string; label: string };
};

export type SupportFaqCategory = {
  id: "start" | "write" | "payment" | "files" | "sample" | "account" | "error";
  label: string;
  description: string;
  items: SupportFaqItem[];
};

export const supportFaqCategories: SupportFaqCategory[] = [
  {
    id: "start",
    label: "시작·문서 유형",
    description: "어떤 문서를 골라야 할지",
    items: [
      { id: "start-how", question: "사업계획서는 어떻게 만드나요?", answer: "‘새 문서 시작’에서 문서 유형을 고르고 사업에 대한 질문에 답하면, 인공지능이 답변을 근거로 섹션별 문서를 작성합니다. 답을 저장할 때마다 이어서 진행되고, 완성 문서는 ‘문서 보기’에서 확인합니다.", keywords: ["어떻게 만들", "시작 방법", "사업계획서 만들", "뭐부터"], link: { href: "/plan/start", label: "새 문서 시작하기" } },
      { id: "start-types", question: "문서 유형은 무엇이 있나요?", answer: "간단 사업계획서, 내부용 사업계획서, 창업 초기 사업계획서, 성장·확장 사업계획서, 정부지원 PSST 사업계획서, 창업 초기 재무 예측, 정밀 재무 모델 — 총 7가지입니다. 유형마다 질문 수, 구성과 문체가 다릅니다.", keywords: ["유형", "종류", "7가지", "어떤 문서", "PSST가 뭐"], link: { href: "/plan/start", label: "유형 살펴보기" } },
      { id: "start-which", question: "어떤 유형을 골라야 할지 모르겠어요.", answer: "정부지원사업에 내면 ‘정부지원 PSST’, 대출·투자 검토용이면 ‘창업 초기’ 또는 ‘성장·확장’, 팀 내부 실행용이면 ‘내부용’, 숫자 계획만 필요하면 ‘재무 예측’이나 ‘정밀 재무 모델’, 짧게 훑을 용도면 ‘간단’을 고르세요. 시작 화면에 유형별 설명과 예상 소요 시간이 함께 표시됩니다.", keywords: ["뭘 골라", "추천", "어떤 유형", "고민"], link: { href: "/plan/start", label: "유형 고르러 가기" } },
      { id: "start-psst", question: "정부지원 PSST 유형은 무엇이 다른가요?", answer: "예비창업패키지 같은 정부지원사업 심사 기준에 맞춰, 완성 문서가 문제인식·실현가능성·성장전략·팀구성 4부로 재배치됩니다. 작성은 다른 유형과 같은 방식으로 진행하면 됩니다.", keywords: ["PSST", "정부지원", "예비창업", "심사"], link: { href: "/plan/start", label: "PSST로 시작하기" } },
      { id: "start-time", question: "작성에 시간이 얼마나 걸리나요?", answer: "유형마다 질문 수가 달라 간단 유형은 20분 안팎, 정밀 유형은 1시간 이상 걸릴 수 있습니다. 시작 화면의 유형 카드에 예상 시간이 표시되며, 중간에 저장하고 나중에 이어서 작성할 수 있습니다.", keywords: ["시간", "얼마나 걸", "소요", "오래"] },
    ],
  },
  {
    id: "write",
    label: "작성 진행",
    description: "질문 답변과 문서 생성",
    items: [
      { id: "write-flow", question: "작성은 어떤 순서로 진행되나요?", answer: "섹션마다 필요한 질문에 답하고 ‘이 섹션 만들기’를 누르면 인공지능이 해당 섹션 글을 작성합니다. 마음에 들지 않으면 답을 고쳐 다시 만들 수 있고, 모든 섹션이 완성되면 ‘문서 보기’에서 전체 문서로 확인합니다.", keywords: ["순서", "진행", "섹션", "다시 만들"], link: { href: "/plan", label: "내 문서로 가기" } },
      { id: "write-reuse", question: "같은 사업으로 다른 유형도 만들 수 있나요?", answer: "네. 새 문서를 만들면 가장 최근에 작성한 문서의 답변이 그대로 이어져, 겹치는 질문은 다시 입력할 필요가 없습니다. 유형별 결제는 문서 1부 단위로 각각 진행됩니다.", keywords: ["다른 유형", "답변 재사용", "또 만들", "여러 개"], link: { href: "/plan/start", label: "새 문서 시작하기" } },
      { id: "write-finance", question: "재무 숫자도 계산해주나요?", answer: "가격, 원가, 고정비 같은 답변을 근거로 12개월 손익표를 자동으로 계산해 문서에 넣습니다. 정밀 재무 모델은 3년 추정까지 제공하며, 월 처리 가능량을 적으면 그 한계를 넘지 않게 계산합니다.", keywords: ["재무", "손익", "숫자 계산", "3년", "매출 추정"] },
      { id: "write-facts", question: "인공지능이 없는 실적을 지어내지 않나요?", answer: "확인되지 않은 매출·고객·제휴를 완료 사실처럼 쓰지 않고, 근거가 부족한 부분은 ‘추가 정의 필요’로 표시해 확인할 곳(상권정보시스템, 통계청 등)을 안내합니다. 입력한 답변이 구체적일수록 문서도 정확해집니다.", keywords: ["지어내", "허구", "가짜", "정확", "사실"] },
      { id: "write-continue", question: "중간에 나가면 작성 내용이 사라지나요?", answer: "아니요. 답변과 완성된 섹션은 자동 저장됩니다. 로그인 상태라면 서버에도 보관되어 다른 기기에서 이어서 작성할 수 있습니다.", keywords: ["중간에 나가", "사라지", "저장되", "이어서"], link: { href: "/plan", label: "이어서 작성하기" } },
    ],
  },
  {
    id: "payment",
    label: "가격·결제",
    description: "유형별 가격과 결제 방식",
    items: [
      { id: "pay-price", question: "가격은 얼마인가요?", answer: "문서 유형별로 다릅니다. 간단 사업계획서 29,000원, 내부용·창업 초기 재무 예측 49,000원, 창업 초기·성장 확장·정밀 재무 모델 89,000원, 정부지원 PSST 99,000원입니다. 문서 1부당 1회 결제이며 구독이 아닙니다.", keywords: ["가격", "얼마", "비용", "요금"], link: { href: "/plan/start", label: "유형별 가격 보기" } },
      { id: "pay-scope", question: "결제하면 무엇이 열리나요?", answer: "결제한 문서의 모든 섹션 생성과 PDF·Word 내려받기, 발표자료(PPT) 만들기가 열립니다. 결제는 해당 문서 1부에 적용되며, 같은 사업으로 다른 유형을 만들 땐 답변이 이어지고 결제는 따로 진행합니다.", keywords: ["결제하면", "뭐가 열려", "포함", "범위"] },
      { id: "pay-method", question: "결제 수단은 무엇인가요?", answer: "신용·체크카드로 결제할 수 있으며 나이스페이 결제창에서 안전하게 진행됩니다. 결제 완료 즉시 문서가 열립니다.", keywords: ["결제 수단", "카드", "계좌이체", "카카오페이", "토스"] },
      { id: "pay-multi", question: "한 계정으로 여러 번 결제할 수 있나요?", answer: "네. 문서마다 따로 결제하는 방식이라 한 계정에서 여러 문서를 각각 결제할 수 있습니다. 결제 내역과 열린 문서는 마이페이지에서 확인합니다.", keywords: ["여러 번", "여러 문서", "추가 결제", "또 결제"], link: { href: "/plan/me", label: "마이페이지 열기" } },
      { id: "pay-refund", question: "환불은 어떻게 되나요?", answer: "인공지능 생성이 시작되기 전에는 전액 환불을 요청할 수 있습니다. 결제 후 유료 섹션 생성이 시작되면 생성 비용이 발생해 단순 변심 환불이 제한되며, 결과물 미제공이나 중대한 하자 등 법정 예외는 재제작·환급을 요청할 수 있습니다. 자세한 기준은 취소·환불 안내에서 확인하세요.", keywords: ["환불", "취소", "환급", "변심"], link: { href: "/plan/info?doc=refund", label: "취소·환불 기준 보기" } },
    ],
  },
  {
    id: "files",
    label: "문서·내려받기",
    description: "완성 문서 확인과 파일",
    items: [
      { id: "files-view", question: "완성된 문서는 어디서 보나요?", answer: "내 문서 목록에서 문서를 고른 뒤 ‘문서 보기’를 누르면 전체 문서를 화면에서 읽을 수 있습니다. 모바일에서는 ‘전체 모드’로 종이 문서처럼 넘겨볼 수 있습니다.", keywords: ["어디서 보", "문서 보기", "완성 문서", "열람"], link: { href: "/plan/document", label: "문서 보기 열기" } },
      { id: "files-download", question: "어떤 파일로 받을 수 있나요?", answer: "PDF와 수정 가능한 Word 파일로 내려받을 수 있고, 발표용 슬라이드는 PPTX로 따로 만들 수 있습니다. 내려받기는 해당 문서 결제 후 열립니다.", keywords: ["PDF", "워드", "PPT", "파일", "내려받"], link: { href: "/plan/document", label: "문서 보기에서 내려받기" } },
      { id: "files-edit", question: "완성 문서를 수정할 수 있나요?", answer: "질문 답변을 고친 뒤 해당 섹션을 다시 만들면 문서에 반영됩니다. 세부 문구를 직접 다듬고 싶다면 Word로 내려받아 자유롭게 편집하세요.", keywords: ["수정", "고치", "편집", "문구 변경"] },
      { id: "files-ppt", question: "발표자료(PPT)도 만들어주나요?", answer: "네. 완성 문서를 근거로 발표용 슬라이드를 자동 구성해 PPTX로 내려받을 수 있습니다. ‘문서 보기’ 상단의 발표자료 버튼에서 만듭니다.", keywords: ["발표자료", "PPT", "슬라이드", "피칭"], link: { href: "/plan/document", label: "발표자료 만들기" } },
    ],
  },
  {
    id: "sample",
    label: "샘플·무료 범위",
    description: "결제 전에 확인할 수 있는 것",
    items: [
      { id: "sample-free", question: "결제 전에는 어디까지 무료인가요?", answer: "로그인 없이도 내 문서 목록에서 완성 샘플 3부를 전체 열람할 수 있고, 로그인하면 각 문서의 앞 2개 섹션을 무료로 생성해 품질을 직접 확인할 수 있습니다. 나머지 섹션 생성과 파일 내려받기는 결제 후 열립니다.", keywords: ["어디까지 무료", "무료 범위", "결제 전", "체험"], link: { href: "/plan/start", label: "무료로 시작하기" } },
      { id: "sample-docs", question: "완성본 샘플을 미리 볼 수 있나요?", answer: "네. 내 문서 목록 아래에 실제 인공지능으로 만든 샘플 문서 3부(창업 초기 카페, 정부지원 PSST 무인꽃집, 정밀 재무 모델 무인꽃집)가 있습니다. 전체 내용을 읽어볼 수 있는 읽기 전용 문서입니다.", keywords: ["샘플", "미리 보", "예시", "완성본"], link: { href: "/plan", label: "샘플 문서 보기" } },
      { id: "sample-quality", question: "샘플과 내 문서 품질이 같은가요?", answer: "네. 샘플은 별도 손질 없이 실제 서비스와 같은 인공지능·같은 과정으로 만든 문서입니다. 입력한 답변이 구체적일수록 결과도 더 구체적으로 나옵니다.", keywords: ["품질", "샘플과 같", "진짜로 이렇게"] },
    ],
  },
  {
    id: "account",
    label: "계정·저장",
    description: "로그인과 기기 간 이어보기",
    items: [
      { id: "account-save", question: "작업 내용은 자동으로 저장되나요?", answer: "네. 답변과 생성된 섹션은 자동 저장됩니다. 로그인하면 서버에도 보관되어 다른 기기에서 같은 계정으로 이어서 볼 수 있습니다.", keywords: ["자동 저장", "저장되", "보관"] },
      { id: "account-device", question: "휴대전화와 PC에서 같은 문서를 볼 수 있나요?", answer: "같은 계정으로 로그인하면 두 기기의 작업이 자동으로 합쳐져 어느 쪽에서든 이어서 작성할 수 있습니다. 로그인하지 않은 작업은 사용한 브라우저에만 남습니다.", keywords: ["다른 기기", "휴대폰 PC", "모바일 PC", "같은 문서", "동기화"] },
      { id: "account-guest", question: "로그인하지 않아도 쓸 수 있나요?", answer: "샘플 열람은 로그인 없이 가능하지만, 문서 작성과 무료 섹션 생성은 작성 내용을 계정에 저장하기 위해 로그인이 필요합니다.", keywords: ["비로그인", "로그인 안", "게스트", "가입 없이"] },
      { id: "account-mypage", question: "결제 내역은 어디서 확인하나요?", answer: "마이페이지에서 계정 정보, 결제 내역과 열린 문서를 확인할 수 있습니다.", keywords: ["결제 내역", "마이페이지", "구매 내역", "영수증"], link: { href: "/plan/me", label: "마이페이지 열기" } },
      { id: "account-recover", question: "비밀번호를 잊어버렸어요.", answer: "로그인 화면의 ‘계정 복구’에서 가입한 이메일을 입력하세요. 복구 메일이 오지 않으면 스팸함을 확인한 뒤 운영자에게 문의해주세요.", keywords: ["비밀번호", "계정 복구", "복구 메일", "메일 안 와"] },
    ],
  },
  {
    id: "error",
    label: "오류·기타",
    description: "화면이 작동하지 않을 때",
    items: [
      { id: "error-generate", question: "섹션 생성이 실패하거나 멈춰요.", answer: "네트워크가 잠시 끊겼을 수 있습니다. 페이지를 새로고침한 뒤 같은 섹션에서 ‘다시 만들기’를 눌러주세요. 반복되면 문서 유형과 섹션 이름을 적어 운영자에게 문의해주세요.", keywords: ["생성 실패", "멈춰", "안 만들어", "오류", "에러"] },
      { id: "error-load", question: "화면이나 문서가 불러와지지 않아요.", answer: "페이지를 한 번 새로고침한 뒤 내 문서 목록에서 문서를 다시 열어보세요. 같은 문제가 반복되면 현재 화면 주소와 발생한 행동을 운영자 문의에 적어주세요.", keywords: ["불러오지", "로딩", "화면 오류", "안 열려"], link: { href: "/plan", label: "내 문서로 가기" } },
      { id: "error-quality", question: "생성된 내용이 사업과 맞지 않아요.", answer: "해당 섹션의 답변이 구체적으로 입력됐는지 먼저 확인하고, 답을 보완한 뒤 다시 만들어보세요. 여전히 다른 업종 내용이 섞이면 문서 유형과 섹션 이름을 운영자에게 알려주세요.", keywords: ["안 맞", "다른 업종", "내용 이상", "이상하게 나와"] },
      { id: "error-human", question: "운영자에게 직접 문의하고 싶어요.", answer: "아래 ‘운영자에게 문의’를 누르면 개별 메시지를 남길 수 있습니다. 서비스 이용과 결제 문의에 답변드리며 세무·법률·투자 상담은 제공하지 않습니다.", keywords: ["운영자", "직접 문의", "사람 상담", "상담원"] },
      { id: "error-scope", question: "세무·법률·투자 상담도 해주나요?", answer: "오늘창업은 사업계획서·재무 문서 작성과 서비스 이용 문의를 지원합니다. 세금 신고 대행, 세무사·변호사 연결, 법률 자문과 투자 중개는 제공하지 않습니다. 관련 판단은 국세청·관할 기관 또는 자격을 갖춘 전문가에게 확인해주세요.", keywords: ["세금 신고", "세무사", "세무", "법률", "변호사", "투자 연결", "투자 중개"] },
    ],
  },
];

export const supportPlatformFacts = [
  "오늘창업의 플랜 빌더는 문서 유형을 고르고 사업 질문에 답하면 인공지능이 섹션별로 사업계획서를 작성하는 서비스입니다. 시작은 ‘새 문서 시작’(/plan/start), 작성 중 문서는 ‘내 문서’(/plan), 완성 문서는 ‘문서 보기’(/plan/document)에서 확인합니다.",
  "문서 유형은 7가지입니다. 간단 사업계획서, 내부용 사업계획서, 창업 초기 사업계획서, 성장·확장 사업계획서, 정부지원 PSST 사업계획서, 창업 초기 재무 예측, 정밀 재무 모델. 유형마다 질문 수, 문서 구성과 문체가 다릅니다.",
  "정부지원 PSST 유형의 완성 문서는 문제인식·실현가능성·성장전략·팀구성 4부로 재배치되어 정부지원사업 심사 기준에 맞습니다.",
  "가격은 문서 1부당 1회 결제입니다. 간단 사업계획서 29,000원, 내부용 사업계획서 49,000원, 창업 초기 재무 예측 49,000원, 창업 초기 사업계획서 89,000원, 성장·확장 사업계획서 89,000원, 정밀 재무 모델 89,000원, 정부지원 PSST 사업계획서 99,000원. 구독이 아니며 한 계정에서 문서마다 따로 결제할 수 있습니다.",
  "결제 수단은 신용·체크카드이며 나이스페이 결제창에서 진행됩니다. 결제 완료 즉시 해당 문서의 전체 섹션 생성과 내려받기가 열립니다.",
  "결제 전 무료 범위: 로그인 없이 완성 샘플 3부 전체 열람이 가능하고, 로그인하면 각 문서의 앞 2개 섹션이 무료로 생성됩니다. 나머지 섹션 생성과 PDF·Word·PPT 내려받기는 해당 문서 결제 후 열립니다.",
  "내 문서 목록(/plan) 아래에 실제 인공지능으로 만든 샘플 문서 3부가 있습니다. 창업 초기 카페, 정부지원 PSST 무인꽃집, 정밀 재무 모델 무인꽃집이며 전체를 읽을 수 있는 읽기 전용 문서입니다. 샘플은 내려받을 수 없습니다.",
  "완성 문서는 PDF와 수정 가능한 Word로 내려받고, 발표용 슬라이드는 문서 보기에서 PPTX로 만들 수 있습니다.",
  "재무 숫자는 답변(가격·원가·고정비 등)을 근거로 12개월 손익표를 자동 계산해 문서에 넣습니다. 정밀 재무 모델은 3년 추정을 포함하며, 월 처리 가능량을 적으면 그 한계를 넘지 않게 계산합니다.",
  "인공지능은 확인되지 않은 매출·고객·제휴를 완료 사실처럼 쓰지 않으며, 근거가 부족한 부분은 ‘추가 정의 필요’로 표시하고 확인할 곳을 안내합니다.",
  "같은 사업으로 다른 유형의 문서를 만들면 이전 답변이 그대로 이어져 겹치는 질문을 다시 입력하지 않습니다. 결제는 문서마다 따로 합니다.",
  "답변과 생성된 섹션은 자동 저장됩니다. 로그인하면 서버에 보관되어 휴대전화와 PC에서 같은 계정으로 이어서 작성할 수 있고, 로그인하지 않은 작업은 사용한 브라우저에만 남습니다.",
  "마이페이지(/plan/me)에서 계정 정보, 결제 내역과 열린 문서를 확인합니다. 계정 복구는 로그인 화면에서 가입 이메일로 진행합니다.",
  "환불: 인공지능 생성이 시작되기 전에는 전액 환불을 요청할 수 있습니다. 결제 후 유료 섹션 생성이 시작되면 생성 비용이 발생해 단순 변심 환불이 제한됩니다. 결과물 미제공, 계약 불일치, 중대한 하자 등 법정 예외는 재제작이나 환급을 요청할 수 있으며, 자세한 기준은 취소·환불 안내(/plan/info?doc=refund)를 우선합니다.",
  "섹션 생성이 실패하면 새로고침 후 같은 섹션에서 다시 만들기를 누릅니다. 반복되면 문서 유형과 섹션 이름을 운영자에게 문의합니다.",
  "오늘창업 운영자는 서비스 이용과 결제 문의를 받습니다. 세무 신고 대행, 법률 자문, 투자 중개와 사업 성공 보장은 제공하지 않습니다.",
] as const;

export function supportKnowledgeText(query = "") {
  const relevantFaq = query
    ? findSupportFaqCandidates(query, 6)
    : supportFaqCategories.flatMap((category) => category.items);
  const faqText = relevantFaq.map((item) => `${item.question} ${item.answer}`);
  return [...supportPlatformFacts, ...faqText].join("\n");
}

function queryTokens(value: string) {
  return value
    .toLowerCase()
    .replace(/[^0-9a-z가-힣\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

export function findSupportFaqCandidates(query: string, limit = 3) {
  const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
  const tokens = queryTokens(normalized);
  return supportFaqCategories
    .flatMap((category) => category.items.map((item) => {
      const target = `${item.question} ${item.answer} ${item.keywords.join(" ")}`.toLowerCase();
      const keywordScore = item.keywords.reduce(
        (total, keyword) => {
          const keywordParts = keyword.toLowerCase().split(/\s+/).filter(Boolean);
          const allPartsMatched = keywordParts.every((part) => normalized.includes(part));
          return total + (allPartsMatched ? Math.max(3, keyword.length) : 0);
        },
        0,
      );
      const tokenScore = tokens.reduce((total, token) => total + (target.includes(token) ? 1 : 0), 0);
      return { item, score: keywordScore + tokenScore };
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, limit))
    .map((candidate) => candidate.item);
}

export function findSupportFaqKeywordMatches(query: string, limit = 3) {
  const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
  const scored = supportFaqCategories
    .flatMap((category) => category.items.map((item) => {
      const score = item.keywords.reduce((total, keyword) => {
        const parts = keyword.toLowerCase().split(/\s+/).filter(Boolean);
        return total + (parts.every((part) => normalized.includes(part)) ? Math.max(3, keyword.length) : 0);
      }, 0);
      return { item, score };
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score);
  const highestScore = scored[0]?.score ?? 0;
  return scored
    .filter((candidate) => candidate.score >= Math.max(3, highestScore * 0.55))
    .slice(0, Math.max(1, limit))
    .map((candidate) => candidate.item);
}

export function findSupportFaq(query: string): SupportFaqItem | null {
  const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalized) return null;
  let best: { item: SupportFaqItem; score: number } | null = null;
  for (const category of supportFaqCategories) {
    for (const item of category.items) {
      const score = item.keywords.reduce(
        (total, keyword) => total + (normalized.includes(keyword.toLowerCase()) ? Math.max(2, keyword.length) : 0),
        0,
      );
      if (score > (best?.score ?? 0)) best = { item, score };
    }
  }
  return best?.score ? best.item : null;
}
