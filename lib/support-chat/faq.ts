import { BUNDLE_PRODUCT_AMOUNT, DOMAIN_PRODUCT_AMOUNT, DOMAIN_PURCHASE_PRODUCT_AMOUNT, HOMEPAGE_PRODUCT_AMOUNT, LAUNCH_PRICE_LABEL, PACKAGE_AMOUNT, REGEN_INCLUDED, REGEN_PACK_AMOUNT, REGEN_PACK_COUNT } from "../payments/domain";
import { PPT_GENERATION_VERIFIED } from "../plan-builder/deck-availability";
import { journeyStepsText } from "../plan-builder/journey-steps";

const won = (amount: number) => `${amount.toLocaleString("ko-KR")}원`;
/*
 * 안내 문구는 지금 서비스 흐름(대화 → 사업계획서 → 홈페이지 → 유지보수)과 실제 상수에서 만든다.
 * 예전 문구는 '새 문서 시작에서 유형 고르기', '이 섹션 만들기', /plan/start, 샘플 3부, 늘 되는 PPT 를 안내해
 * 상담 도우미(AI)까지 없는 기능을 약속했다.
 */
/* 무료 체험은 없다(소유자 결정 2026-10-09) — 사업계획서 본문은 결제 후에만 쓴다 */
const FREE_RULE = "사업계획서 문서 작성과 파일 내려받기는 결제한 뒤에 시작해요(문서를 무료로 써 보는 체험은 없어요). 결제 전에는 완성 예시로 결과물을 미리 볼 수 있어요";
const FILES = PPT_GENERATION_VERIFIED ? "PDF·Word·발표용 PPT" : "PDF·Word";
/* 앱 안 결제 안내 — 카드·웹 결제는 말하지 않는다(App Store 3.1.1) */
const APP_PAY_METHOD = "앱에서는 스토어 결제로 결제해요. 아이폰은 App Store(Apple), 안드로이드는 Google Play 결제창이 열리고, 결제가 확인되면 바로 열려요.";
const APP_REFUND = "앱에서 결제한 주문의 환불은 결제한 스토어(아이폰은 Apple App Store, 안드로이드는 Google Play)에 신청해요. 아이폰은 Apple 문제 신고 페이지(reportaproblem.apple.com), 안드로이드는 Google Play 주문 내역에서 신청하고, 환불 여부는 스토어가 정해요. 상품별 기준은 취소·환불 안내에서 볼 수 있어요.";
const PPT_NOTE = PPT_GENERATION_VERIFIED
  ? "완성한 계획서로 발표용 슬라이드(PPTX)도 만들 수 있어요."
  : "발표용 PPT 자동 생성은 아직 준비 중이라 현재 결제 범위에 포함되지 않아요.";
export type SupportFaqItem = {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  /** 답변 아래에 붙는 이동 버튼 — 누르면 해당 화면으로 간다 */
  link?: { href: string; label: string };
  /**
   * 앱(아이폰·안드로이드) 안에서 보여 줄 답 — 앱 안에서는 스토어 결제(인앱결제)로만 판다.
   * 앱 안에서 카드 결제나 웹 결제를 안내하면 스토어 규칙(App Store 3.1.1)에 어긋나므로, 결제 이야기가 있는 답은 앱용을 따로 둔다.
   */
  appAnswer?: string;
};

/** 지금 화면(앱/웹)에 맞는 답 */
export function faqAnswer(item: SupportFaqItem, inApp: boolean): string {
  return inApp && item.appAnswer ? item.appAnswer : item.answer;
}

export type SupportFaqCategory = {
  id: "start" | "write" | "payment" | "files" | "sample" | "account" | "error";
  label: string;
  description: string;
  items: SupportFaqItem[];
};

export const supportFaqCategories: SupportFaqCategory[] = [
  {
    id: "start",
    label: "시작하기",
    description: "대화로 사업을 시작하는 방법",
    items: [
      { id: "start-how", question: "사업계획서는 어떻게 만드나요?", answer: "‘새 대화’에서 하려는 사업을 편하게 이야기하면, 대화가 필요한 내용을 하나씩 물어보며 사업안을 정리해요. 사업안이 정해지면 그 내용으로 사업계획서를 만들고, 이어서 홈페이지 만들기와 유지보수까지 같은 사업에서 이어가요.", keywords: ["어떻게 만들", "시작 방법", "사업계획서 만들", "뭐부터"], link: { href: "/plan/chat?new=1", label: "새 대화 시작하기" } },
      { id: "start-types", question: "어떤 결과물을 받을 수 있나요?", answer: "대화로 정리한 사업안을 바탕으로 사업계획서를 만들고, 그 계획서로 홈페이지를 만들 수 있어요. 홈페이지를 공개한 뒤에는 ‘유지보수’에서 홈페이지를 고치고 문의와 실적을 관리해요.", keywords: ["유형", "종류", "어떤 문서", "결과물", "뭘 받"], link: { href: "/plan/chat?new=1", label: "새 대화 시작하기" } },
      { id: "start-which", question: "무슨 사업을 할지 아직 모르겠어요.", answer: "괜찮아요. 상담 창의 ‘AI 창업 상담’에서 나이·예산·관심 업종 같은 조건을 이야기하면 맞는 아이템을 함께 찾아 드려요. 마음에 드는 추천이 나오면 그 내용 그대로 사업계획서 대화를 시작할 수 있어요.", keywords: ["뭘 골라", "추천", "모르겠", "고민", "아이템"] },
      { id: "start-psst", question: "정부지원사업(예비창업패키지 등) 제출용으로도 쓸 수 있나요?", answer: "오늘창업 사업계획서는 실제로 사업을 시작하고 운영하기 위한 실무용 계획서예요. 정부지원사업(예비창업패키지 등)은 공고마다 정해진 양식과 심사 항목이 있어서 그대로 제출하기보다는, 계획서 내용을 공고 양식에 맞게 옮겨 담고 직접 확인해 주세요. Word로 내려받으면 옮겨 쓰기 쉬워요.", keywords: ["PSST", "정부지원", "예비창업", "심사"] },
      { id: "start-time", question: "만드는 데 시간이 얼마나 걸리나요?", answer: "대화는 10~20분 안팎이면 사업안이 정리되고, 계획서 작성은 그 뒤 몇 분 정도 걸려요. 중간에 나가도 대화와 작성 내용은 저장되어 나중에 이어서 할 수 있어요.", keywords: ["시간", "얼마나 걸", "소요", "오래"] },
    ],
  },
  {
    id: "write",
    label: "작성·수정",
    description: "대화와 계획서 작성",
    items: [
      { id: "write-flow", question: "작성은 어떤 순서로 진행되나요?", answer: `${journeyStepsText()} 순서예요. 홈페이지는 건너뛰고 사업 시작하기부터 해도 돼요. 왼쪽 메뉴의 ‘내 사업’에서 사업을 누르면 지금 몇 단계인지 보이고, 계획서 화면 아래 ‘다음 단계’ 버튼 하나로 이어갈 수 있어요.`, keywords: ["순서", "진행", "단계", "다음 단계"], link: { href: "/plan", label: "내 사업으로 가기" } },
      { id: "write-reuse", question: "완성한 계획서를 대화로 고칠 수 있나요?", answer: `네. 같은 사업의 대화에서 바꿀 내용을 말하면 사업안이 고쳐지고, 바뀐 내용에 맞춰 계획서 항목을 다시 써요. 다시 생성은 사업계획서마다 ${REGEN_INCLUDED}회까지 포함되어 있고, 더 필요하면 ${REGEN_PACK_COUNT}회를 ${won(REGEN_PACK_AMOUNT)}에 추가할 수 있어요. 대화 자체와 계획서 글을 직접 고치는 것은 무료예요.`, keywords: ["다시 쓰기", "수정 요청", "대화로 고치", "다시 생성", "토큰 결제"] },
      { id: "write-finance", question: "재무 숫자도 계산해주나요?", answer: "가격, 원가, 고정비처럼 대화에서 알려 주신 숫자를 근거로 12개월 손익표를 계산해 계획서에 넣어요. 알려 주지 않은 숫자는 지어내지 않고 ‘추가 정의 필요’로 표시해요.", keywords: ["재무", "손익", "숫자 계산", "매출 추정"] },
      { id: "write-facts", question: "인공지능이 없는 실적을 지어내지 않나요?", answer: "확인되지 않은 매출·고객·제휴를 완료 사실처럼 쓰지 않고, 근거가 부족한 부분은 ‘추가 정의 필요’로 표시해 확인할 곳(상권정보시스템, 통계청 등)을 안내해요. 대화에서 구체적으로 알려 주실수록 계획서도 정확해져요.", keywords: ["지어내", "허구", "가짜", "정확", "사실"] },
      { id: "write-continue", question: "중간에 나가면 작성 내용이 사라지나요?", answer: "아니요. 대화와 계획서는 자동 저장돼요. 로그인 상태라면 서버에도 보관되어 다른 기기에서 ‘내 사업’을 열어 이어서 할 수 있어요.", keywords: ["중간에 나가", "사라지", "저장되", "이어서"], link: { href: "/plan", label: "이어서 하기" } },
    ],
  },
  {
    id: "payment",
    label: "가격·결제",
    description: "상품별 가격과 결제 방식",
    items: [
      { id: "pay-price", question: "가격은 얼마인가요?", answer: `사업계획서는 사업 하나당 ${won(PACKAGE_AMOUNT)}(${LAUNCH_PRICE_LABEL}), 사업계획서와 그 계획서로 만든 홈페이지(고치기·공개)를 함께 열면 ${won(BUNDLE_PRODUCT_AMOUNT)}, 사업계획서를 먼저 결제했다면 홈페이지만 ${won(HOMEPAGE_PRODUCT_AMOUNT)}이에요. 계획서 다시 생성 ${REGEN_PACK_COUNT}회 추가는 ${won(REGEN_PACK_AMOUNT)}, 내 도메인 연결(1년)은 ${won(DOMAIN_PRODUCT_AMOUNT)}이에요. 모두 1회 결제이며 구독이 아니에요.`, keywords: ["가격", "얼마", "비용", "요금"] },
      { id: "pay-scope", question: "결제하면 무엇이 열리나요?", answer: `사업계획서를 결제하면 그 사업의 계획서 전체 항목 작성과 ${FILES} 내려받기가 열려요. ${PPT_NOTE} 홈페이지 편집·공개는 사업계획서 + 홈페이지 묶음으로 함께 열거나, 계획서를 결제한 뒤 홈페이지 상품으로 열어요.`, keywords: ["결제하면", "뭐가 열려", "포함", "범위"] },
      { id: "pay-method", question: "결제 수단은 무엇인가요?", answer: "신용·체크카드로 결제할 수 있으며 나이스페이 결제창에서 안전하게 진행돼요. 결제가 승인되면 바로 열려요.", appAnswer: APP_PAY_METHOD, keywords: ["결제 수단", "카드", "계좌이체", "카카오페이", "토스"] },
      { id: "pay-multi", question: "한 계정으로 여러 사업을 결제할 수 있나요?", answer: "네. 사업마다 따로 결제하는 방식이라 한 계정에서 여러 사업을 각각 결제할 수 있어요. 결제 내역은 메뉴의 ‘내 계정’에서 확인해요.", keywords: ["여러 번", "여러 사업", "여러 문서", "추가 결제", "또 결제"], link: { href: "/plan/me", label: "마이페이지 열기" } },
      { id: "pay-refund", question: "환불은 어떻게 되나요?", answer: "인공지능 작성이 시작되기 전에는 전액 환불을 요청할 수 있어요. 결제 후 유료 항목 작성이 시작되면 작성 비용이 발생해 단순 변심 환불이 제한되며, 결과물 미제공이나 중대한 하자 등 법정 예외는 재제작·환급을 요청할 수 있어요. 아이폰 앱 안에서 결제했다면 Apple 문제 신고 페이지(reportaproblem.apple.com)에서, 안드로이드 앱이면 Google Play 주문 내역에서 환불을 신청해요. 도메인·토큰 등 상품별 기준은 취소·환불 안내에서 확인하세요.", appAnswer: APP_REFUND, keywords: ["환불", "취소", "환급", "변심"], link: { href: "/plan/info?doc=refund", label: "취소·환불 기준 보기" } },
    ],
  },
  {
    id: "files",
    label: "계획서·홈페이지",
    description: "완성 문서와 홈페이지",
    items: [
      { id: "files-view", question: "완성된 계획서는 어디서 보나요?", answer: "왼쪽 메뉴의 ‘내 사업’에서 사업을 누르면 사업계획서가 바로 열려요. 왼쪽 목차에서 장을 골라 읽을 수 있어요.", keywords: ["어디서 보", "문서 보기", "완성 문서", "열람"], link: { href: "/plan", label: "내 사업 열기" } },
      { id: "files-download", question: "어떤 파일로 받을 수 있나요?", answer: `${FILES} 파일로 내려받을 수 있어요. 내려받기는 계획서 맨 위 ‘작성 완료’ 옆 ‘내려받기’에서 하고, 그 사업을 결제한 뒤 열려요.`, keywords: ["PDF", "워드", "PPT", "파일", "내려받"] },
      { id: "files-edit", question: "완성 문서를 수정할 수 있나요?", answer: "계획서 화면에서 글을 직접 고칠 수 있고, 사업 내용 자체를 바꾸려면 같은 사업의 대화에서 말하면 돼요. 세부 서식은 Word로 내려받아 자유롭게 편집하세요.", keywords: ["수정", "고치", "편집", "문구 변경"] },
      { id: "files-ppt", question: "발표자료(PPT)도 만들어주나요?", answer: PPT_NOTE, keywords: ["발표자료", "PPT", "슬라이드", "피칭"] },
      { id: "files-homepage", question: "홈페이지는 어떻게 만들고 공개하나요?", answer: `사업계획서가 완성되면 계획서 화면 아래 ‘다음 단계 · 홈페이지 만들기’를 누르세요. 계획서 내용으로 초안이 바로 만들어지고, 미리 볼 수 있어요. 고치고 인터넷에 공개하려면 홈페이지 상품(계획서와 함께 ${won(BUNDLE_PRODUCT_AMOUNT)}, 계획서를 이미 결제했다면 ${won(HOMEPAGE_PRODUCT_AMOUNT)})이 필요하며, 무료 주소로 공개돼요. 내 도메인을 쓰려면 도메인 연결(${won(DOMAIN_PRODUCT_AMOUNT)}/1년)을 따로 신청해요.`, keywords: ["홈페이지", "공개", "도메인", "사이트"] },
      { id: "files-inquiries", question: "홈페이지로 들어온 손님 문의는 어디서 보나요?", answer: "왼쪽 메뉴 ‘손님 문의’에서 모든 사업의 홈페이지 문의를 최신순으로 봐요. 문의를 누르면 손님 메시지와 연락처가 보이고, 전화·문자·메일로 바로 연락하거나 ‘처리 완료’로 표시할 수 있어요. 새 문의를 문자로 받을 휴대폰은 홈페이지 화면 5번 ‘문의 알림’에서 정해요.", keywords: ["문의 확인", "손님 문의", "들어온 문의", "내 문의", "문의 어디", "신청 확인"], link: { href: "/plan/inquiries", label: "손님 문의 열기" } },
    ],
  },
  {
    id: "sample",
    label: "예시·결제 전 범위",
    description: "결제 전에 확인할 수 있는 것",
    items: [
      { id: "sample-free", question: "결제 전에는 어디까지 무료인가요?", answer: `사업 이야기를 나누고 사업 방향을 한 장으로 정리하는 데까지는 무료예요. ${FREE_RULE}.`, keywords: ["어디까지 무료", "무료 범위", "결제 전", "체험", "무료 체험"], link: { href: "/plan/chat?new=1", label: "사업 이야기 시작하기" } },
      { id: "sample-docs", question: "완성본 예시를 미리 볼 수 있나요?", answer: "네. ‘내 사업’ 화면 아래 ‘완성 예시 보기’를 펼치면 실제 인공지능으로 만든 완성 예시(소그룹 필라테스 ‘퇴근필라’)를 처음부터 끝까지 읽어볼 수 있어요. 첫 화면에서는 다른 예시의 PDF도 받아볼 수 있어요.", keywords: ["샘플", "미리 보", "예시", "완성본"], link: { href: "/plan", label: "완성 예시 보기" } },
      { id: "sample-quality", question: "예시와 내 계획서 품질이 같은가요?", answer: "네. 예시는 별도 손질 없이 실제 서비스와 같은 인공지능·같은 과정으로 만든 문서예요. 대화에서 구체적으로 알려 주실수록 결과도 더 구체적으로 나와요.", keywords: ["품질", "샘플과 같", "예시와 같", "진짜로 이렇게"] },
    ],
  },
  {
    id: "account",
    label: "계정·저장",
    description: "로그인과 기기 간 이어보기",
    items: [
      { id: "account-save", question: "작업 내용은 자동으로 저장되나요?", answer: "네. 대화와 계획서는 자동 저장돼요. 로그인하면 서버에도 보관되어 다른 기기에서 같은 계정으로 이어서 볼 수 있어요.", keywords: ["자동 저장", "저장되", "보관"] },
      { id: "account-device", question: "휴대전화와 PC에서 같은 문서를 볼 수 있나요?", answer: "같은 계정으로 로그인하면 어느 기기에서든 ‘내 사업’에서 같은 사업을 이어서 볼 수 있어요. 로그인하지 않은 작업은 사용한 브라우저에만 남아요.", keywords: ["다른 기기", "휴대폰 PC", "모바일 PC", "같은 문서", "동기화"] },
      { id: "account-guest", question: "로그인하지 않아도 쓸 수 있나요?", answer: "완성 예시 보기와 AI 창업 상담은 로그인 없이 가능해요. 사업계획서 작성은 내용을 계정에 저장하기 위해 로그인이 필요해요.", keywords: ["비로그인", "로그인 안", "게스트", "가입 없이"] },
      { id: "account-mypage", question: "결제 내역은 어디서 확인하나요?", answer: "메뉴 아래쪽 ‘내 계정’에서 계정 정보, 내 사업 목록과 결제 내역을 확인하고 카드 결제 환불을 요청할 수 있어요. 앱 안에서 결제한 주문은 Apple·Google Play에 환불을 신청해요.", appAnswer: "메뉴 아래쪽 ‘내 계정’에서 계정 정보, 내 사업 목록과 결제 내역을 확인할 수 있어요. 앱에서 결제한 주문의 환불은 Apple(App Store)이나 Google Play에 신청해요.", keywords: ["결제 내역", "마이페이지", "구매 내역", "영수증"], link: { href: "/plan/me", label: "마이페이지 열기" } },
      { id: "account-delete", question: "회원 탈퇴하면 제 정보가 지워지나요?", answer: "메뉴의 ‘내 계정’ 맨 아래 ‘회원 탈퇴’에서 탈퇴할 수 있어요. 탈퇴하면 계정과 작성한 사업·문서가 모두 삭제되고 되돌릴 수 없어요. 결제·환불 기록만 법령상 보존 의무가 있어 사람과 연결되지 않는 형태로 남아요.", keywords: ["탈퇴", "회원 탈퇴", "계정 삭제", "개인정보 삭제", "정보 삭제"] },
      { id: "account-recover", question: "비밀번호를 잊어버렸어요.", answer: "로그인 화면의 ‘비밀번호 재설정’에서 가입한 이메일을 입력하세요. 복구 메일이 오지 않으면 스팸함을 확인한 뒤 고객센터에 문의해 주세요.", keywords: ["비밀번호", "계정 복구", "복구 메일", "메일 안 와"] },
    ],
  },
  {
    id: "error",
    label: "오류·기타",
    description: "화면이 작동하지 않을 때",
    items: [
      { id: "error-generate", question: "계획서 작성이 실패하거나 멈춰요.", answer: "네트워크가 잠시 끊겼을 수 있어요. 페이지를 새로고침하면 멈춘 곳부터 다시 이어서 작성해요. 반복되면 사업 이름과 멈춘 화면을 적어 고객센터에 문의해 주세요.", keywords: ["생성 실패", "작성 실패", "멈춰", "안 만들어", "오류", "에러"] },
      { id: "error-load", question: "화면이나 문서가 불러와지지 않아요.", answer: "페이지를 한 번 새로고침한 뒤 ‘내 사업’에서 사업을 다시 열어보세요. 같은 문제가 반복되면 현재 화면 주소와 발생한 행동을 고객센터 문의에 적어 주세요.", keywords: ["불러오지", "로딩", "화면 오류", "안 열려"], link: { href: "/plan", label: "내 사업으로 가기" } },
      { id: "error-quality", question: "작성된 내용이 사업과 맞지 않아요.", answer: "같은 사업의 대화에서 맞지 않는 부분을 구체적으로 말해 주세요. 사업안이 고쳐지고 그에 맞춰 계획서를 다시 써요. 여전히 다른 업종 내용이 섞이면 사업 이름과 해당 장을 고객센터에 알려주세요.", keywords: ["안 맞", "다른 업종", "내용 이상", "이상하게 나와"] },
      { id: "error-human", question: "고객센터에 직접 문의하고 싶어요.", answer: "아래 ‘고객센터에 직접 문의할게요’를 누르면 개별 메시지를 남길 수 있어요. 서비스 이용과 결제 문의에 답변드리며 세무·법률·투자 상담은 제공하지 않아요.", keywords: ["운영자", "직접 문의", "사람 상담", "상담원"] },
      { id: "error-scope", question: "세무·법률·투자 상담도 해주나요?", answer: "오늘창업은 사업계획서·홈페이지 작성과 서비스 이용 문의를 지원해요. 세금 신고 대행, 세무사·변호사 연결, 법률 자문과 투자 중개는 제공하지 않아요. 관련 판단은 국세청·관할 기관 또는 자격을 갖춘 전문가에게 확인해 주세요.", keywords: ["세금 신고", "세무사", "세무", "법률", "변호사", "투자 연결", "투자 중개"] },
    ],
  },
];

const WEB_PAY_FACT = "결제 수단은 신용·체크카드이며 나이스페이 결제창에서 진행돼요. 결제가 승인되면 바로 열려요.";
const WEB_ACCOUNT_FACT_HEAD = "메뉴의 ‘내 계정’(/plan/me)에서 계정 정보, 내 사업 목록, 결제 내역을 확인하고 카드 결제 환불을 요청해요.";
const WEB_ACCOUNT_FACT = `${WEB_ACCOUNT_FACT_HEAD} 앱 안 결제(App Store·Google Play)의 환불은 결제한 스토어에 신청해요(아이폰: reportaproblem.apple.com). 회원 탈퇴는 ‘내 계정’ 맨 아래에서 하고, 계정과 작성한 사업·문서가 모두 삭제되며 결제·환불 기록만 법령상 보존 의무로 사람과 연결되지 않는 형태로 남아요. 비밀번호를 잊었으면 로그인 화면의 ‘비밀번호 재설정’에서 가입 이메일로 다시 정해요.`;
const WEB_REFUND_FACT = "환불: 인공지능 작성이 시작되기 전에는 전액 환불을 요청할 수 있어요. 결제 후 유료 항목 작성이 시작되면 단순 변심 환불이 제한돼요. 결과물 미제공, 계약 불일치, 중대한 하자 등 법정 예외는 재제작이나 환급을 요청할 수 있으며, 도메인·토큰 등 상품별 기준은 취소·환불 안내(/plan/info?doc=refund)를 우선해요.";
/*
 * 앱 안에서 묻는 사람에게는 카드·웹 결제를 근거로 주지 않는다(App Store 3.1.1) — 같은 자리를 앱용 사실로 바꾼다.
 * 도메인·AI 수정 토큰은 앱에서 팔지 않지만, 어디서 사라고 안내하지 않는다.
 */
const APP_FACT_SWAPS = new Map<string, string>([
  [WEB_PAY_FACT, `이 질문은 앱 안에서 왔어요. ${APP_PAY_METHOD} 앱 안에서는 카드 결제·웹사이트 결제를 안내하지 않아요. 도메인 연결과 AI 수정 토큰은 앱에서 결제할 수 없는 상품이에요(다른 곳에서 사라고 안내하지 않아요).`],
  [WEB_ACCOUNT_FACT, "메뉴의 ‘내 계정’(/plan/me)에서 계정 정보, 내 사업 목록, 결제 내역을 확인해요. 회원 탈퇴는 ‘내 계정’ 맨 아래에서 하고, 계정과 작성한 사업·문서가 모두 삭제되며 결제·환불 기록만 법령상 보존 의무로 사람과 연결되지 않는 형태로 남아요. 비밀번호를 잊었으면 로그인 화면의 ‘비밀번호 재설정’에서 가입 이메일로 다시 정해요."],
  [WEB_REFUND_FACT, APP_REFUND],
]);

export const supportPlatformFacts = [
  "오늘창업은 대화로 사업안을 정리하고(‘새 대화’, /plan/chat?new=1), 그 내용으로 사업계획서를 만들고(/plan/document), 계획서로 홈페이지를 만들고(/plan/homepage), 공개 후 유지보수(홈페이지 고치기·실적 관리)까지 한 사업 안에서 이어가는 서비스예요. 만든 사업은 왼쪽 메뉴 ‘내 사업’(/plan)에, 홈페이지로 들어온 손님 문의는 모든 사업 것이 왼쪽 메뉴 ‘손님 문의’(/plan/inquiries, 예전 이름 ‘내 문의’)에 모여요. 문서 유형을 고르는 화면이나 섹션마다 누르는 ‘이 섹션 만들기’ 버튼은 없어요.",
  `가격: 사업계획서 사업 하나당 ${won(PACKAGE_AMOUNT)}(${LAUNCH_PRICE_LABEL}), 계획서+홈페이지 묶음 ${won(BUNDLE_PRODUCT_AMOUNT)}, 계획서를 결제한 사업의 홈페이지 편집·공개 ${won(HOMEPAGE_PRODUCT_AMOUNT)}(계획서 없이 홈페이지만은 살 수 없음), 내 도메인 연결 1년 ${won(DOMAIN_PRODUCT_AMOUNT)}, 이미 산 도메인의 갱신 ${won(DOMAIN_PURCHASE_PRODUCT_AMOUNT)}, 계획서 다시 생성 ${REGEN_PACK_COUNT}회 추가 ${won(REGEN_PACK_AMOUNT)}. 모두 1회 결제이며 구독이 아니에요.`,
  WEB_PAY_FACT,
  `무료 범위: 대화, 무료 창업 상담, 사업 방향 정리는 무료예요. ${FREE_RULE}.`,
  `사업계획서를 결제하면 그 사업의 전체 항목 작성과 ${FILES} 내려받기가 열려요. ${PPT_NOTE}`,
  `완성한 계획서는 같은 사업의 대화에서 고칠 수 있어요. 바뀐 내용에 맞춰 항목을 다시 쓰는 것은 사업계획서마다 ${REGEN_INCLUDED}회 포함, 더 필요하면 ${REGEN_PACK_COUNT}회를 ${won(REGEN_PACK_AMOUNT)}에 추가해요. 대화와 직접 글 고치기는 무료예요.`,
  "완성 예시는 ‘내 사업’ 화면 아래 ‘완성 예시 보기’에 있는 소그룹 필라테스 ‘퇴근필라’ 사업계획서예요. 로그인 없이 전체를 읽을 수 있어요.",
  `홈페이지는 완성한 계획서 화면의 ‘다음 단계 · 홈페이지 만들기’에서 초안을 만들고 미리 봐요. 편집과 공개는 홈페이지 상품(계획서와 함께 ${won(BUNDLE_PRODUCT_AMOUNT)}, 계획서 결제 후 ${won(HOMEPAGE_PRODUCT_AMOUNT)}) 결제 후 열리며 무료 주소로 공개돼요. 내 도메인 연결은 별도 상품(${won(DOMAIN_PRODUCT_AMOUNT)}/1년)이에요.`,
  "재무 숫자는 대화에서 알려 준 가격·원가·고정비 등을 근거로 12개월 손익표를 계산해 넣어요. 확인되지 않은 매출·고객·제휴를 완료 사실처럼 쓰지 않으며, 근거가 부족한 부분은 ‘추가 정의 필요’로 표시해요.",
  "대화와 계획서는 자동 저장돼요. 로그인하면 서버에 보관되어 휴대전화와 PC에서 같은 계정으로 이어서 할 수 있고, 로그인하지 않은 작업은 사용한 브라우저에만 남아요.",
  WEB_ACCOUNT_FACT,
  WEB_REFUND_FACT,
  "계획서 작성이 멈추면 새로고침하면 멈춘 곳부터 이어서 작성해요. 반복되면 사업 이름과 화면을 적어 고객센터에 문의해요.",
  "오늘창업 고객센터는 서비스 이용과 결제 문의를 받아요. 세무 신고 대행, 법률 자문, 투자 중개와 사업 성공 보장은 제공하지 않아요.",
] as const;

/** 상담 도우미(AI)에게 주는 근거 — 앱 안 질문이면 결제·환불을 앱 기준으로 바꿔 준다 */
export function supportKnowledgeText(query = "", options: { inApp?: boolean } = {}) {
  const inApp = options.inApp === true;
  const relevantFaq = query
    ? findSupportFaqCandidates(query, 6)
    : supportFaqCategories.flatMap((category) => category.items);
  const facts = supportPlatformFacts.map((fact) => (inApp ? APP_FACT_SWAPS.get(fact) : undefined) ?? fact);
  const faqText = relevantFaq.map((item) => `${item.question} ${faqAnswer(item, inApp)}`);
  return [...facts, ...faqText].join("\n");
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
