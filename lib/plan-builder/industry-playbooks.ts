/*
 * 업종별 시작 가이드 — 그 업종을 모르는 사람이 "무엇이 필요하고, 어떤 순서로 신고·등록하고, 무엇을 자주 놓치는지"를
 * 사이트를 열기 전까지 한 번에 볼 수 있게 한다. 사업 관리의 인허가 단계와 계획서 작성 맥락에 같이 들어간다.
 *
 * 원칙
 * - 순서와 담당 기관, 공식 안내 창구만 쓴다. 조문 번호·면적·교육 시간·수수료처럼 개정되거나 지역마다 다른 값은 넣지 않는다.
 * - 법적 판단이 아니라 출발점이다. 모든 단계는 관할 기관 확인을 전제로 하고, 화면에도 그렇게 표시한다.
 * - 표준산업분류(KSIC) 코드 앞자리로 고른다. 더 긴(구체적인) 코드가 우선한다.
 * 검토일: 2026-10-03(공식 창구: 정부24·식품안전나라·국세청·교육청·법령정보센터 안내 기준). 바뀌면 이 날짜와 내용을 함께 고친다.
 */
export type IndustryPlaybook = {
  id: string;
  name: string;
  /** KSIC 코드 앞자리 — 가장 길게 맞는 가이드를 쓴다 */
  ksic: string[];
  /** 문을 열기 전에 갖출 것(금액은 쓰지 않는다 — 실제 견적으로) */
  needs: string[];
  /** 영업 시작까지의 순서. 앞 단계 서류가 뒤 단계에 들어가는 순서로 둔다 */
  steps: Array<{ title: string; where: string; detail: string }>;
  /** 처음 하는 사람이 자주 놓치는 것 */
  pitfalls: string[];
  links: Array<{ title: string; url: string }>;
};

export const PLAYBOOK_REVIEWED_AT = "2026-10-03";

const LINK = {
  gov24: { title: "정부24 · 민원 신청과 안내", url: "https://www.gov.kr" },
  foodsafety: { title: "식품안전나라 · 식품 영업 안내", url: "https://www.foodsafetykorea.go.kr" },
  nts: { title: "국세청 · 사업자등록 안내", url: "https://www.nts.go.kr/nts/ad/cntnts/cntntsView.do?mi=2445" },
  hometax: { title: "홈택스 · 사업자등록 신청", url: "https://www.hometax.go.kr" },
  building: { title: "정부24 · 건축물대장 열람", url: "https://www.gov.kr/mw/AA020InfoCappView.do?CappBizCD=15000000098&Mcode=10205&tp_seq=01" },
  law: { title: "국가법령정보센터 · 법령 원문", url: "https://www.law.go.kr" },
  hakwon: { title: "나이스 학원민원서비스(교육청)", url: "https://www.neis.go.kr" },
  ftc: { title: "공정거래위원회 · 통신판매사업자 안내", url: "https://www.ftc.go.kr" },
  kc: { title: "제품안전정보센터 · KC 인증 대상 확인", url: "https://www.safetykorea.kr" },
} as const;

/* 음식점·카페·제과점이 같이 쓰는 식품접객업 공통 순서 */
const FOOD_SERVICE_STEPS = (kind: string, education: string): IndustryPlaybook["steps"] => [
  { title: "상가 계약 전에 건축물 용도 확인", where: "정부24 건축물대장", detail: `그 점포에서 ${kind} 영업을 할 수 있는 건축물 용도(근린생활시설 등)인지, 불법 증축은 없는지 계약 전에 확인해요. 용도가 안 맞으면 신고가 반려될 수 있어요.` },
  { title: "식품위생교육 받기", where: education, detail: "신규 영업자는 영업 신고 전에 위생교육을 받아야 해요. 온라인으로 받을 수 있는 경우가 많고, 수료증이 신고 서류에 들어가요." },
  { title: "건강진단결과서(보건증) 받기", where: "보건소 또는 지정 의료기관", detail: "본인과 조리·판매를 하는 직원 모두 필요해요. 결과가 나오기까지 며칠 걸릴 수 있어 미리 받아 두세요." },
  { title: "시설 갖추기와 필요한 검사", where: "시공 업체 · 가스·소방 담당 기관", detail: "조리장·손 씻는 시설 등 업종 시설기준을 맞추고, 가스를 쓰면 가스시설 완성검사, 면적·층에 따라 소방시설 완비증명이 필요할 수 있어요." },
  { title: `${kind} 영업 신고`, where: "관할 시·군·구청 위생 담당 부서 (정부24로도 신청)", detail: "신고서와 위생교육 수료증, 건강진단결과서, 임대차계약서 등을 내면 영업신고증을 받아요." },
  { title: "사업자등록", where: "관할 세무서 또는 홈택스", detail: "영업신고증을 첨부해 사업자등록을 해요. 일반·간이과세자 선택은 예상 매출로 정해요." },
  { title: "온라인에 가게 열기", where: "오늘창업 홈페이지 · 지도 서비스 업체 등록", detail: "가게 소개·메뉴·가격·영업시간·오시는 길을 한곳에 정리하고, 지도 서비스에 업체를 등록해 찾아올 수 있게 해요." },
];

export const INDUSTRY_PLAYBOOKS: IndustryPlaybook[] = [
  {
    id: "bakery", name: "빵집(제과점)", ksic: ["5615"],
    needs: ["오븐·발효기·반죽기·작업대·냉장·냉동 설비", "판매 진열대와 포장재", "밀가루·버터 등 원재료 거래처", "위생교육 수료증과 건강진단결과서", "메뉴별 원가표(재료비·포장비)"],
    steps: FOOD_SERVICE_STEPS("제과점", "업종 단체 지정 교육기관(제과·휴게음식 관련 협회 등)"),
    pitfalls: ["매장에서 먹고 갈 자리를 두거나 음료를 함께 팔면 신고 업종이 달라질 수 있어요(휴게음식점 등). 판매 방식부터 정하세요.", "택배·온라인으로 빵을 팔려면 제과점 영업만으로 안 될 수 있어요. 별도 제조·판매 신고가 필요한지 확인하세요.", "남는 빵 폐기량이 이익을 크게 깎아요. 첫 달은 품목 수를 줄이고 매일 폐기량을 기록하세요.", "알레르기 유발 성분 표시 기준을 확인하세요."],
    links: [LINK.foodsafety, LINK.gov24, LINK.building, LINK.nts],
  },
  {
    id: "cafe", name: "카페(휴게음식점)", ksic: ["5622"],
    needs: ["커피 머신·그라인더·제빙기·냉장 설비", "좌석·테이블과 포장 용기", "원두·우유 등 원재료 거래처", "위생교육 수료증과 건강진단결과서", "메뉴별 원가표"],
    steps: FOOD_SERVICE_STEPS("휴게음식점", "업종 단체 지정 교육기관(휴게음식업 관련 협회 등)"),
    pitfalls: ["술을 팔면 휴게음식점이 아니라 일반음식점 신고 대상이에요.", "직접 만든 디저트를 포장해 다른 곳에 납품하면 별도 제조 신고가 필요할 수 있어요.", "피크 시간 1시간에 몇 잔을 만들 수 있는지 먼저 재 보세요. 판매량 계산의 상한이 돼요."],
    links: [LINK.foodsafety, LINK.gov24, LINK.building, LINK.nts],
  },
  {
    id: "restaurant", name: "음식점(일반음식점)", ksic: ["5611", "5612"],
    needs: ["조리 설비·환기 설비·냉장·냉동 설비", "식기·테이블·포장 용기", "식재료 거래처", "위생교육 수료증과 건강진단결과서", "메뉴별 원가표"],
    steps: FOOD_SERVICE_STEPS("일반음식점", "업종 단체 지정 교육기관(외식업 관련 협회 등)"),
    pitfalls: ["원산지 표시 대상 메뉴가 많아요. 메뉴판에 원산지를 적는 기준을 확인하세요.", "배달 수수료·배달비를 원가에 넣지 않으면 배달 주문이 늘수록 손해가 날 수 있어요.", "주방 환기·배수 공사는 계약 전에 가능한지 확인하세요."],
    links: [LINK.foodsafety, LINK.gov24, LINK.building, LINK.nts],
  },
  {
    id: "snack", name: "분식·간이음식점", ksic: ["5619"],
    needs: ["조리 설비·냉장 설비", "포장 용기", "식재료 거래처", "위생교육 수료증과 건강진단결과서", "메뉴별 원가표"],
    steps: FOOD_SERVICE_STEPS("휴게음식점(술을 팔면 일반음식점)", "업종 단체 지정 교육기관(휴게음식업·외식업 관련 협회 등)"),
    pitfalls: ["술 판매 여부에 따라 신고 업종이 달라져요.", "포장·배달 위주라면 매장 면적보다 조리 동선과 포장 시간이 처리량을 정해요."],
    links: [LINK.foodsafety, LINK.gov24, LINK.building, LINK.nts],
  },
  {
    id: "side-dish", name: "반찬·도시락 가게", ksic: ["47223", "10701"],
    needs: ["조리 설비·냉장 설비·포장 설비", "용기와 라벨(제품명·제조일·소비기한)", "식재료 거래처", "위생교육 수료증과 건강진단결과서"],
    steps: [
      { title: "판매 방식부터 정하기", where: "식품안전나라 영업 안내", detail: "가게에서 직접 만들어 그 자리에서 파는지(즉석판매제조·가공업), 공장처럼 만들어 다른 곳에 납품·택배하는지(식품제조·가공업)에 따라 신고·등록이 달라요." },
      { title: "건축물 용도 확인", where: "정부24 건축물대장", detail: "선택한 영업을 할 수 있는 용도인지 계약 전에 확인해요." },
      { title: "식품위생교육과 건강진단결과서", where: "지정 교육기관 · 보건소", detail: "영업 신고·등록 전에 준비해요." },
      { title: "영업 신고 또는 등록", where: "관할 시·군·구청 위생 담당 부서", detail: "즉석판매제조·가공업은 신고, 식품제조·가공업은 등록 대상인 경우가 많아요. 시설기준을 맞춘 뒤 신청해요." },
      { title: "사업자등록", where: "관할 세무서 또는 홈택스", detail: "영업신고증(등록증)을 첨부해요." },
      { title: "온라인에 가게 열기", where: "오늘창업 홈페이지 · 지도 서비스", detail: "메뉴·가격·주문 방법·픽업 시간을 정리해요. 택배 판매를 하려면 통신판매업 신고도 확인해요." },
    ],
    pitfalls: ["택배 판매는 보관 온도와 소비기한 표시가 중요해요. 즉석판매제조 신고만으로 택배 판매가 되는지 꼭 확인하세요.", "정기 배송은 미리 주문받아 만드는 양만큼만 준비하면 폐기를 줄일 수 있어요."],
    links: [LINK.foodsafety, LINK.gov24, LINK.building, LINK.nts],
  },
  {
    id: "beauty", name: "미용실·네일·피부관리", ksic: ["96112", "96113", "96119"],
    needs: ["해당 분야 미용사 면허(일반·피부·네일·메이크업)", "시술 의자·기구·소독 설비", "요금표", "위생교육 수료증"],
    steps: [
      { title: "면허 확인", where: "국가자격 취득 후 시·군·구청에서 면허 발급", detail: "미용업은 세부 업종(헤어·피부·네일·메이크업 등)에 맞는 미용사 면허가 있어야 신고할 수 있어요. 면허 종류와 할 시술이 맞는지 먼저 확인해요." },
      { title: "건축물 용도 확인", where: "정부24 건축물대장", detail: "미용업을 할 수 있는 용도인지 계약 전에 확인해요." },
      { title: "위생교육 받기", where: "업종 단체 지정 교육기관", detail: "영업 신고 전에 받는 경우가 많아요." },
      { title: "미용업 영업 신고", where: "관할 시·군·구청 위생 담당 부서 (정부24로도 신청)", detail: "면허증·위생교육 수료증·임대차계약서 등을 내고 영업신고증을 받아요." },
      { title: "사업자등록", where: "관할 세무서 또는 홈택스", detail: "영업신고증을 첨부해요." },
      { title: "예약 받을 곳 열기", where: "오늘창업 홈페이지 · 예약·지도 서비스", detail: "시술 메뉴·가격·소요 시간·예약 취소 규정을 한곳에 정리해요." },
    ],
    pitfalls: ["면허 범위를 넘는 시술(예: 의료기기 사용, 문신 등)은 할 수 없어요. 메뉴를 정하기 전에 확인하세요.", "노쇼·취소 규정을 미리 공지하지 않으면 분쟁이 생겨요.", "시술 1건 소요 시간과 정리 시간을 합쳐야 하루 예약 상한이 나와요."],
    links: [LINK.gov24, LINK.building, LINK.law, LINK.nts],
  },
  {
    id: "academy", name: "학원·교습소·과외", ksic: ["85501", "85502", "8562", "8563", "85691"],
    needs: ["가르칠 과목과 커리큘럼", "강의 공간과 수강생 안전 설비", "수강료 기준표와 환불 규정"],
    steps: [
      { title: "운영 형태 정하기", where: "관할 교육지원청", detail: "여러 명의 강사·일정 면적 이상이면 학원(등록), 혼자 한 과목을 가르치면 교습소(신고), 자기 집이나 학습자 집에서 가르치면 개인과외교습자(신고)인 경우가 많아요. 형태에 따라 시설·절차가 달라요." },
      { title: "건축물 용도 확인", where: "정부24 건축물대장", detail: "학원·교습소를 할 수 있는 용도와 층인지 계약 전에 확인해요." },
      { title: "학원 등록 또는 교습소·과외 신고", where: "관할 교육지원청 (나이스 학원민원서비스)", detail: "시설·강사 요건을 갖춰 신청해요. 수강료도 함께 신고하는 경우가 많아요." },
      { title: "사업자등록", where: "관할 세무서 또는 홈택스", detail: "등록증·신고증을 첨부해요." },
      { title: "수강 신청 받을 곳 열기", where: "오늘창업 홈페이지", detail: "과목·대상·시간표·수강료·환불 규정을 공개해요." },
    ],
    pitfalls: ["신고한 수강료보다 많이 받거나 게시하지 않으면 문제가 될 수 있어요.", "강사를 채용하면 신고·자격 확인이 필요할 수 있어요.", "환불 기준을 미리 정해 두지 않으면 분쟁이 생겨요."],
    links: [LINK.hakwon, LINK.building, LINK.law, LINK.nts],
  },
  {
    id: "online-store", name: "온라인 쇼핑몰·스마트스토어", ksic: ["47912", "47919"],
    needs: ["팔 상품과 공급처(직접 제작·사입·위탁)", "상품 사진과 상세 설명", "택배 계약과 포장재", "교환·반품 기준"],
    steps: [
      { title: "판매 상품의 별도 인증·신고 확인", where: "제품안전정보센터 · 식품안전나라 등", detail: "어린이 제품·전기용품은 KC 인증, 식품·건강기능식품·화장품은 별도 신고가 필요할 수 있어요. 상품부터 확인해요." },
      { title: "사업자등록", where: "관할 세무서 또는 홈택스", detail: "업종에 전자상거래 소매업을 넣어요. 집 주소로도 등록할 수 있는지 확인해요." },
      { title: "구매안전서비스 이용확인증 받기", where: "판매 플랫폼 또는 결제·에스크로 업체", detail: "오픈마켓·스마트스토어에서 팔면 플랫폼에서 발급받을 수 있는 경우가 많아요. 통신판매업 신고에 필요해요." },
      { title: "통신판매업 신고", where: "관할 시·군·구청 (정부24로도 신청)", detail: "규모가 아주 작거나 간이과세자면 면제될 수 있어 대상인지 먼저 확인해요." },
      { title: "판매 페이지 열기", where: "판매 플랫폼 · 오늘창업 홈페이지", detail: "사업자 정보·교환·반품 기준을 페이지에 표시해요." },
    ],
    pitfalls: ["플랫폼 수수료·배송비·반품비를 원가에 넣지 않으면 팔수록 손해일 수 있어요.", "다른 사람이 찍은 사진·브랜드 로고를 쓰면 권리 침해가 될 수 있어요.", "단순 변심 반품을 거절할 수 없는 경우가 많아요. 반품 기준을 미리 정하세요."],
    links: [LINK.ftc, LINK.kc, LINK.gov24, LINK.nts],
  },
  {
    id: "gym", name: "헬스장(체력단련장)", ksic: ["91132"],
    needs: ["운동 기구와 안전 설비", "샤워·탈의 시설", "이용 약관과 환불 규정", "배상책임보험 등 보험 가입 검토"],
    steps: [
      { title: "건축물 용도 확인", where: "정부24 건축물대장", detail: "체육시설을 할 수 있는 용도인지 계약 전에 확인해요." },
      { title: "시설·인력 기준 갖추기", where: "관할 시·군·구청 체육 담당 부서", detail: "체육시설업 시설기준과 체육지도자 배치 기준(규모별)을 확인해요." },
      { title: "보험 가입", where: "보험사", detail: "체육시설업은 이용자 사고에 대비한 보험 가입 대상인 경우가 많아요." },
      { title: "체육시설업(체력단련장업) 신고", where: "관할 시·군·구청 체육 담당 부서", detail: "시설을 갖춘 뒤 신고해요." },
      { title: "사업자등록", where: "관할 세무서 또는 홈택스", detail: "신고증을 첨부해요." },
      { title: "회원 모집 페이지 열기", where: "오늘창업 홈페이지", detail: "이용권 종류·가격·환불 기준을 공개해요." },
    ],
    pitfalls: ["장기 이용권 환불 분쟁이 많아요. 환불 기준을 약관과 페이지에 명확히 쓰세요.", "필라테스·요가 등은 체육시설업 신고 대상이 아닐 수 있어요. 운영 형태를 먼저 확인하세요."],
    links: [LINK.gov24, LINK.building, LINK.law, LINK.nts],
  },
  {
    id: "lodging", name: "민박", ksic: ["55104"],
    needs: ["객실·침구·청소 설비", "소방·안전 설비", "예약·결제 수단과 환불 규정"],
    steps: [
      { title: "운영 형태와 지역 확인", where: "관할 시·군·구청", detail: "농어촌 지역 주택에서 직접 살며 운영하면 농어촌민박, 도시에서 외국인 관광객 대상이면 외국인관광 도시민박업 등 형태에 따라 법과 절차가 달라요. 도시 주택·아파트에서 내국인 대상 숙박 영업은 제한될 수 있어 꼭 먼저 확인해요." },
      { title: "건축물 용도·소방 기준 확인", where: "정부24 건축물대장 · 소방서", detail: "선택한 형태가 가능한 건물인지, 소방시설 기준을 맞출 수 있는지 확인해요." },
      { title: "신고·지정·등록", where: "관할 시·군·구청", detail: "형태별로 신고(농어촌민박), 지정(외국인관광 도시민박), 숙박업 신고 등 절차가 달라요." },
      { title: "사업자등록", where: "관할 세무서 또는 홈택스", detail: "신고증·지정증을 첨부해요." },
      { title: "예약 받을 곳 열기", where: "오늘창업 홈페이지 · 숙박 예약 플랫폼", detail: "객실·가격·체크인 규칙·환불 규정을 공개해요." },
    ],
    pitfalls: ["신고 없이 공유숙박 플랫폼에 올리면 불법 영업이 될 수 있어요.", "비수기 가동률을 낮게 잡고 손익을 계산하세요."],
    links: [LINK.gov24, LINK.building, LINK.law, LINK.nts],
  },
];

/** KSIC 코드에 맞는 가이드. 앞자리가 가장 길게 맞는 것을 고른다 */
export function playbookForKsic(code: string | null | undefined): IndustryPlaybook | null {
  if (!code) return null;
  let best: { playbook: IndustryPlaybook; length: number } | null = null;
  for (const playbook of INDUSTRY_PLAYBOOKS) for (const prefix of playbook.ksic) {
    if (code.startsWith(prefix) && (!best || prefix.length > best.length)) best = { playbook, length: prefix.length };
  }
  return best?.playbook ?? null;
}

/** 사업 관리 단계 자료로 쓰는 글 — 그대로 복사해 체크리스트로 쓸 수 있게 */
export function playbookChecklist(playbook: IndustryPlaybook): string {
  return [
    `${playbook.name} 시작 준비 (오늘창업 정리 ${PLAYBOOK_REVIEWED_AT} · 관할 기관 확인 필요)`,
    "",
    "■ 준비할 것",
    ...playbook.needs.map(item => `- [ ] ${item}`),
    "",
    "■ 순서",
    ...playbook.steps.map((step, index) => `${index + 1}. ${step.title} — ${step.where}\n   ${step.detail}\n   확인한 날짜·담당자:`),
    "",
    "■ 자주 놓치는 것",
    ...playbook.pitfalls.map(item => `- ${item}`),
  ].join("\n");
}

/** 계획서 작성 맥락용 짧은 요약 — 길이를 아끼려고 세부 설명은 뺀다 */
export function playbookContext(playbook: IndustryPlaybook) {
  return {
    name: playbook.name,
    reviewedAt: PLAYBOOK_REVIEWED_AT,
    rule: "오늘창업이 공식 기관 안내를 바탕으로 정리한 일반적인 순서입니다. 지역·규모·세부 업태에 따라 다르므로 계획서에는 '관할 기관 확인'을 붙여 쓰고, 여기에 없는 기한·수수료·면적 기준은 만들지 않습니다.",
    needs: playbook.needs,
    steps: playbook.steps.map(step => `${step.title} (${step.where})`),
    pitfalls: playbook.pitfalls,
  };
}
