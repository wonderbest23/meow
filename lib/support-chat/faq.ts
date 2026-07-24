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
      { id: "start-modes", question: "세 가지 시작 방법은 무엇이 다른가요?", answer: "‘질문으로 찾기’는 선택형 질문 8개로 성향을 찾고, ‘내 아이디어로 바로 기획’은 이미 정한 아이디어를 예산·시간과 함께 기획합니다. ‘내 경험을 적으며 찾기’는 경험과 관심 문제를 문장으로 적어 추천을 받는 방식입니다.", keywords: ["세 가지", "3가지", "차이", "질문으로 찾기", "경험을 적으며"] },
      { id: "start-preview", question: "결제 전에 무엇까지 볼 수 있나요?", answer: "추천 사업을 고르면 맞춤 사업 초안과 발표자료·판매 페이지의 제공 형태를 먼저 확인할 수 있습니다. 전체 문서 다운로드, 전체 발표자료와 홈페이지 공개는 유료 제작 신청 뒤 열립니다.", keywords: ["결제 전", "무료 초안", "미리 보기", "미리보기", "어디까지 무료"] },
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
      { id: "project-background", question: "자료 제작 중에 화면을 나가도 되나요?", answer: "네. 전체 자료 제작은 서버 작업으로 이어집니다. 창을 닫아도 작업이 취소되지 않습니다. 비로그인 상태라면 같은 브라우저에서 프로젝트 주소를 다시 열고, 로그인했다면 마이페이지의 내 작업에서 진행률이나 완료 결과를 확인할 수 있습니다.", keywords: ["자료 제작 중", "화면 나가", "창 닫", "백그라운드", "서버에서", "다시 들어"] },
      { id: "project-autodraft", question: "상품명과 가격도 직접 입력해야 하나요?", answer: "아니요. 아이디어·예산·시간처럼 꼭 필요한 조건을 먼저 받으면 상품명, 소개 문구, 첫 가격과 실행 범위를 초안으로 제안합니다. 사용자는 결과를 본 뒤 필요한 부분만 수정하면 됩니다.", keywords: ["상품명", "가격 직접", "모든 걸 입력", "자동 초안", "알아서"] },
      { id: "project-missions", question: "실행 도우미를 완료해야 결과물을 받을 수 있나요?", answer: "아닙니다. 실행 도우미는 사업을 실제로 진행할 때 사용하는 선택 기능입니다. 완료하지 않아도 결제 후 제작된 문서와 발표자료의 확인·다운로드에는 영향을 주지 않습니다.", keywords: ["실행 도우미", "미션", "완료해야", "결과물 영향"] },
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
      { id: "files-decks", question: "사업소개서와 투자제안서도 만들어주나요?", answer: "네. 고객·협력사 설명용 사업소개서와 투자자·지원기관 검토용 투자제안서(IR)를 서로 다른 구성으로 제작합니다. 화면에서 전체 슬라이드를 미리 보고 PPTX로 내려받을 수 있습니다.", keywords: ["사업소개서", "투자제안서", "IR", "PPTX", "발표자료"] },
      { id: "files-edit", question: "발표자료와 문서 내용을 수정할 수 있나요?", answer: "발표자료의 주요 문구는 사이트에서 수정하고 저장할 수 있으며 맞춤법 검사와 문장 개선을 요청할 수 있습니다. 문서는 워드 파일로 내려받아 추가 편집할 수 있고, 판매 페이지는 사이트에서 직접 수정합니다.", keywords: ["PPT 수정", "문서 수정", "맞춤법", "문장 개선", "편집"] },
      { id: "files-facts", question: "확인되지 않은 실적이나 숫자도 들어가나요?", answer: "확인되지 않은 매출·고객 수·제휴·투자·인허가를 완료 사실처럼 쓰지 않습니다. 입력이나 증빙이 없는 내용은 ‘가정’ 또는 ‘확인 필요’로 표시하고, 공식 자료와 실제 기록이 있을 때만 확정 정보로 반영합니다.", keywords: ["허구", "가짜 실적", "없는 실적", "확인 필요", "사실성", "숫자 만들어"] },
    ],
  },
  {
    id: "landing",
    label: "판매 페이지",
    description: "디자인·공개·도메인",
    items: [
      { id: "landing-create", question: "판매 페이지도 만들어주나요?", answer: "네. 사업 정보와 업종에 맞춰 첫 화면, 장점, 이용 과정, 사진, 상품, 문의와 사업자 정보가 포함된 판매 페이지 초안을 자동으로 만듭니다. 8가지 디자인 중에서 고르거나 섹션을 직접 추가하고 순서를 바꿀 수 있습니다.", keywords: ["판매 페이지", "홈페이지", "만들어", "랜딩"] },
      { id: "landing-domain", question: "도메인 비용도 포함되나요?", answer: "페이지 제작과 미리보기는 서비스에 포함되지만 개인 도메인 구매 비용은 별도입니다. 도메인을 준비한 뒤 연결이 필요한 경우 운영자 문의로 주소를 보내주세요.", keywords: ["도메인", "주소", "비용 포함", "연결"] },
      { id: "landing-expert", question: "전문가에게 디자인 제작을 맡기고 싶어요.", answer: "맞춤 디자인 제작은 별도 상담으로 진행합니다. 아래 ‘운영자에게 문의’를 누르고 업종, 원하는 분위기, 참고 사이트와 희망 공개일을 적어주세요.", keywords: ["전문가", "맞춤 디자인", "제작 맡기", "외주"] },
      { id: "landing-edit", question: "로고·이미지·문구·섹션을 바꿀 수 있나요?", answer: "네. 간편 편집에서는 사업명, 소개, 가격, 대표 이미지, 로고와 하단 정보를 바꿀 수 있습니다. ‘자유 편집’을 열면 첫 화면, 장점, 사진, 이용 과정, 숫자, 상품과 신청 안내 섹션을 추가·삭제하고 끌어서 순서를 바꿀 수 있습니다.", keywords: ["로고 수정", "이미지 수정", "푸터", "하단 정보", "템플릿", "문구 변경", "섹션 추가", "순서 변경"] },
      { id: "landing-publish", question: "판매 페이지를 바로 공개할 수 있나요?", answer: "전체 제작이 완료되면 기본 주소로 판매 페이지를 공개할 수 있습니다. 개인 도메인은 별도 구매 후 DNS 확인과 연결 절차가 필요하며, 연결 상태는 프로젝트에서 확인합니다.", keywords: ["바로 공개", "사이트 오픈", "홈페이지 공개", "기본 주소", "DNS"] },
    ],
  },
  {
    id: "account",
    label: "계정·저장",
    description: "로그인과 작업 불러오기",
    items: [
      { id: "account-save", question: "작업 내용은 자동으로 저장되나요?", answer: "프로젝트에서 저장하거나 초안을 확정한 내용은 자동으로 보관됩니다. 다른 기기에서도 이어서 보려면 마이페이지에서 같은 계정으로 로그인하세요.", keywords: ["자동 저장", "저장되", "작업 내용", "보관"] },
      { id: "account-login", question: "기존 작업을 어디서 불러오나요?", answer: "상단 사람 모양 마이페이지 아이콘을 누른 뒤 로그인하면 저장된 작업을 불러올 수 있습니다.", keywords: ["기존 작업", "불러오", "마이페이지", "로그인"] },
      { id: "account-recover", question: "비밀번호를 잊어버렸어요.", answer: "마이페이지의 ‘계정 복구’에서 가입한 이메일을 입력하세요. 복구 메일이 오지 않으면 스팸함을 확인한 뒤 운영자에게 문의해주세요.", keywords: ["비밀번호", "계정 복구", "복구 메일", "메일 안 와"] },
      { id: "account-guest", question: "로그인하지 않아도 저장되나요?", answer: "같은 브라우저에서는 게스트 식별 정보로 진행 내용이 이어질 수 있습니다. 브라우저 데이터 삭제, 시크릿 모드 또는 다른 기기에서는 찾기 어려우므로 유료 제작이나 장기 보관이 필요하면 로그인하는 것이 안전합니다.", keywords: ["비로그인", "로그인 안", "게스트", "시크릿", "브라우저 삭제"] },
      { id: "account-other-device", question: "휴대전화와 PC에서 같은 작업을 볼 수 있나요?", answer: "같은 계정으로 로그인해 저장된 프로젝트를 열면 다른 기기에서도 이어서 확인할 수 있습니다. 로그인하지 않은 게스트 작업은 사용한 브라우저에 묶일 수 있습니다.", keywords: ["다른 기기", "휴대폰 PC", "모바일 PC", "같은 작업"] },
    ],
  },
  {
    id: "payment",
    label: "결제·환불",
    description: "무료 이용과 계좌이체",
    items: [
      { id: "payment-free", question: "아이디어만 찾을 때도 사업자등록이나 결제가 필요한가요?", answer: "아니요. 질문으로 사업 아이디어를 찾고 무료 체험을 하는 데에는 사업자등록이 필요하지 않습니다. 유료 결과물 제작을 신청할 때만 로그인과 결제 절차가 열립니다.", keywords: ["사업자등록", "아이디어만", "무료", "결제 없이", "체험"] },
      { id: "payment-transfer", question: "유료 신청은 어떻게 결제하나요?", answer: "현재는 계좌이체만 받습니다. 주문 후 표시되는 카카오뱅크 계좌로 24시간 안에 입금하고 ‘입금했어요’를 누르면, 운영자가 실제 거래내역을 확인한 뒤 제작을 시작합니다. 카드와 토스 결제는 아직 연결하지 않았습니다.", keywords: ["계좌이체", "계좌이체하면 바로", "입금", "카드", "카카오뱅크", "결제 방법", "토스"] },
      { id: "payment-receipt", question: "사업자가 없어도 현금영수증을 받을 수 있나요?", answer: "네. 개인은 휴대전화 번호로 소득공제용 현금영수증을 신청할 수 있습니다. 번호를 남기지 않는 경우에도 입금 확인 후 구매자 번호 없이 발급 상태를 관리합니다.", keywords: ["현금영수증", "소득공제", "사업자 없어", "지출증빙"] },
      { id: "payment-refund", question: "취소와 환급은 어떻게 처리되나요?", answer: "관리자 입금 확인 전 또는 입금했지만 제작 시작 전에는 취소와 전액 환불을 요청할 수 있습니다. 관리자가 입금을 확인해 인공지능 생성과 맞춤 자료 제작이 시작된 뒤에는 생성 비용이 발생하므로 단순 변심 환불이 제한됩니다. 다만 결과물 미제공, 계약과 다른 제공 또는 중대한 하자 등 법정 예외는 재제작이나 환급을 요청할 수 있습니다. 자세한 기준은 사이트 하단 ‘취소·환불 기준’에서 확인해주세요.", keywords: ["환불", "환급", "취소", "환불 기준", "제작 후 환불", "AI 토큰", "단순 변심"] },
      { id: "payment-unlock", question: "입금하면 결과물이 바로 열리나요?", answer: "계좌이체는 운영자가 실제 입금자명과 금액을 확인한 뒤 결제 완료로 바뀝니다. 확인 전에는 신청 상태로 표시되며, 확인이 끝나면 전체 제작과 다운로드 기능이 열립니다.", keywords: ["입금하면 바로", "결제 확인", "언제 열려", "입금 확인 중", "결과물 열기"] },
      { id: "payment-price", question: "현재 전체 결과물 가격은 얼마인가요?", answer: "현재 화면에 표시되는 맞춤 사업 실행 파일의 베타 가격은 149,000원입니다. 맞춤 홈페이지 디자인, 도메인 구매와 별도 개발은 기본 상품에 포함되지 않으며 상담 후 별도 금액이 안내됩니다.", keywords: ["가격", "얼마", "149000", "149,000", "추가 비용"] },
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
      { id: "error-scope", question: "세무·법률·투자 상담도 해주나요?", answer: "오늘창업은 사업 아이디어와 실행 자료 제작, 서비스 이용과 홈페이지 제작 문의를 지원합니다. 세금 신고 대행, 세무사·변호사 연결, 법률 자문과 투자 중개는 제공하지 않습니다. 관련 판단은 국세청·관할 기관 또는 자격을 갖춘 전문가에게 확인해주세요.", keywords: ["세금 신고", "세무사", "세무", "법률", "변호사", "투자 연결", "투자 중개"] },
      { id: "error-generation", question: "자료 제작이 멈췄다고 나와요.", answer: "프로젝트를 새로고침한 뒤 같은 프로젝트를 다시 열면 서버 작업 상태를 다시 연결합니다. 그래도 멈춤 상태가 계속되면 ‘다시 연결’ 또는 재시도 버튼을 누르고, 반복되면 프로젝트 주소와 표시된 오류 문구를 운영자에게 보내주세요.", keywords: ["제작 멈춤", "잠시 멈췄", "다시 연결", "생성 중 멈", "workflow"] },
      { id: "error-quality", question: "결과 내용이 너무 짧거나 사업과 맞지 않아요.", answer: "아이디어·예산·시간이 프로젝트에 정확히 반영됐는지 먼저 확인한 뒤 다시 만들기나 수정 요청을 사용하세요. 여전히 다른 업종 내용이 섞이거나 핵심 문서가 비어 있으면 프로젝트 주소와 잘못된 문서명을 운영자에게 알려주세요.", keywords: ["내용 짧", "허접", "사업과 안 맞", "다른 업종", "결과 이상", "문서 비어"] },
    ],
  },
];

export const supportPlatformFacts = [
  "오늘창업의 시작 방법은 세 가지입니다. ‘질문으로 찾기’는 선택형 질문 8개와 예산·가능 시간을 바탕으로 사업 후보를 추천합니다. ‘내 아이디어로 바로 기획’은 아이디어·예산·주당 시간을 받아 사업 초안을 만듭니다. ‘내 경험을 적으며 찾기’는 경험과 관심 문제를 문장으로 받아 사업 후보를 추천합니다.",
  "사업 아이디어 탐색과 무료 미리보기에는 사업자등록이나 결제 정보가 필요하지 않습니다.",
  "추천 사업을 선택하면 맞춤 사업 초안, 발표자료 일부와 판매 페이지 예시를 결제 전에 확인할 수 있습니다. 전체 파일 다운로드, 전체 발표자료와 홈페이지 공개는 유료 제작 범위입니다.",
  "현재 맞춤 사업 실행 파일의 베타 가격은 149,000원이며 결제 수단은 계좌이체입니다. 카드와 토스페이먼츠 결제는 아직 제공하지 않습니다.",
  "계좌이체 주문의 입금 기한은 24시간입니다. 운영자가 실제 입금자명과 금액을 확인한 뒤 결제 완료로 바꾸면 전체 제작과 다운로드가 열립니다.",
  "유료 결과물은 실행 문서 10종, 발표자료 2종, 12개월 손익 엑셀과 판매 페이지로 구성됩니다. 문서는 PDF와 수정 가능한 워드, 발표자료는 PPTX로 받을 수 있습니다.",
  "사업소개서는 고객·협력사 설명용 12장이고 투자제안서(IR)는 투자자·지원기관 검토용 16장입니다. 두 자료는 서로 다른 구성으로 제작되며 전체 슬라이드를 화면에서 미리 볼 수 있습니다.",
  "발표자료의 주요 문구는 사이트에서 수정·저장할 수 있고 맞춤법 검사, 문장 개선, 저장된 시장 근거를 이용한 문장 보강 기능이 있습니다. 저장한 내용은 내려받는 PPTX에도 반영됩니다.",
  "문서 내용은 사이트에서 수정할 수 있고 저장하면 PDF, 워드와 전체 묶음에 반영됩니다.",
  "판매 페이지는 업종에 맞는 8가지 디자인을 제공하며 제목, 소개, 장점, 사진, 이용 과정, 상품, 가격, 문의 버튼과 사업자 하단 정보를 포함합니다. 간편 편집에서 문구와 이미지를 바꾸거나 자유 편집에서 섹션을 추가·삭제하고 순서를 바꿀 수 있습니다.",
  "결제 금액에는 판매 페이지 제작과 무료 공개 주소가 포함됩니다. 개인 도메인의 구매 비용은 별도이며, 홈페이지 공개 후 로그인한 사용자가 구매한 www 주소를 연결할 수 있습니다.",
  "개인 도메인 연결에는 도메인 구매처의 DNS 설정이 필요합니다. 연결 상태는 프로젝트의 도메인 연결 화면에서 확인합니다.",
  "전체 자료 제작은 서버의 백그라운드 작업으로 진행됩니다. 창을 닫아도 작업은 취소되지 않습니다. 비로그인 사용자는 같은 브라우저에서 프로젝트 주소를 다시 열고, 로그인 사용자는 마이페이지의 내 작업에서 진행률이나 완료 결과를 확인합니다.",
  "자료 제작이 멈췄다고 표시되면 페이지를 새로고침하고 같은 프로젝트를 다시 열어 상태를 연결합니다. 다시 연결 또는 재시도 후에도 반복되면 프로젝트 주소와 오류 문구를 운영자에게 보냅니다.",
  "아이디어·예산·시간처럼 꼭 필요한 정보가 있으면 상품명, 소개 문구, 첫 가격과 실행 범위는 인공지능이 초안으로 제안합니다. 사용자는 결과를 본 뒤 필요한 부분만 고칩니다.",
  "실행 도우미와 오늘 할 일은 실제 사업 진행을 돕는 선택 기능입니다. 완료하지 않아도 이미 제작된 결과물의 확인과 다운로드가 막히지 않습니다.",
  "확인되지 않은 매출, 고객 수, 제휴, 투자, 인허가와 시장 수치를 완료된 사실처럼 작성하지 않습니다. 증빙이 없는 내용은 가정 또는 확인 필요로 표시합니다.",
  "같은 브라우저의 게스트 작업은 이어질 수 있지만 브라우저 데이터 삭제, 시크릿 모드 또는 다른 기기에서는 찾기 어려울 수 있습니다. 로그인하면 저장한 프로젝트를 다른 기기에서도 이어서 확인할 수 있습니다.",
  "계정 복구는 마이페이지에서 가입 이메일로 진행합니다. 복구 메일이 오지 않으면 스팸함을 확인한 뒤 운영자에게 문의합니다.",
  "오늘창업 운영자는 서비스 이용과 별도 홈페이지 디자인 제작 문의를 받습니다. 세무 신고 대행, 법률 자문, 투자 중개와 사업 성공 보장은 제공하지 않습니다.",
  "관리자 입금 확인 전 또는 맞춤 제작 시작 전에는 취소와 전액 환불을 요청할 수 있습니다. 입금 확인 후 인공지능 생성과 맞춤 자료 제작이 시작되면 생성 비용이 발생하므로 단순 변심 환불이 제한됩니다. 결과물 미제공, 계약 불일치, 중대한 하자 등 법정 예외는 재제작이나 환급을 요청할 수 있으며 사이트 하단의 취소·환불 기준을 우선합니다.",
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
