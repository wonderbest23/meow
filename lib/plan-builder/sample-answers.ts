/*
 * 예시 문서의 답변.
 *
 * 완성본만 보여주면 "이 문서가 어떻게 만들어졌는지"를 알 수 없다.
 * 질문 화면에 이 답변을 채워 보여줘서, 무엇을 답하면 저런 글이 나오는지
 * 눈으로 확인하게 한다. 수정은 막는다(예시는 남의 사업이다).
 *
 * 숫자와 사실은 sample-plan.ts의 본문·재무 설정과 같아야 한다 —
 * 답변과 결과물이 어긋나면 예시로서 신뢰를 잃는다.
 * (객단가 4,900원 / 변동비 1,800원 / 고정비 400만원 / 월 1,400건 / 초기투자 2,600만원)
 */
export const SAMPLE_ANSWERS: Record<string, Record<string, unknown>> = {
  "overview/summary": {
    established: "yes",
    started_when: "2025년",
    revenue: "yes",
    revenue_scale: "1천만~1억원",
    buyer_type: ["개인 소비자 (B2C)"],
    structure: "개인사업자",
    city: "서울 마포구 합정동",
    reach: "동네·지역",
    has_products: "yes",
    product_groups: ["드립·아메리카노", "라떼·베리에이션", "원두 소매"],
    has_services: "no",
    value_prop: "앱으로 미리 주문하면 지정한 시각에 맞춰 준비해 두고, 매장에서는 이름만 확인하고 가져가는 구조입니다. 출근길에 줄을 서지 않아도 됩니다.",
  },

  "overview/problem": {
    problems: [
      "출근 시간대 카페마다 대기가 10분을 넘긴다",
      "편의점 커피는 빠르지만 품질이 아쉽다",
      "미리 주문해도 언제 받을지 알 수 없다",
    ],
    problem_freq: "매일·매주 반복",
    current_alt: "대기를 감수하고 기존 카페를 이용하거나, 편의점·자판기 커피로 대체합니다. 일부는 아예 포기하고 사무실 믹스커피를 마십니다.",
    solutions: [
      "역 앞에서 오전 6시부터 여는 픽업 전용 매장",
      "앱 사전 주문 — 원하는 시각을 분 단위로 지정",
      "픽업대에 이름표로 올려 두어 대기 0분",
    ],
    why_better: "출근 동선에서 벗어나지 않고 3분 안에 받을 수 있으면서, 품질은 스페셜티 등급을 유지합니다",
  },

  "overview/mission": {
    has_story: "yes",
    story: "대표가 합정역으로 5년간 출근하며 매일 아침 커피 줄에 10분씩 썼습니다. 그 10분이 아까워서 '미리 주문해 두고 지나가며 받는' 방식을 직접 만들어 보기로 했습니다.",
    purpose: "바쁜 아침에도 제대로 된 커피 한 잔을 포기하지 않아도 되게 합니다.",
    values: ["속도", "품질", "신뢰"],
    vision: "출근길 생활권마다 '줄 서지 않는 스페셜티'를 하나씩 둡니다. 3년 안에 마포·서대문 생활권에 3개 거점을 만듭니다.",
  },

  "overview/ip": {
    has_ip: "yes",
    ip_types: ["상표(브랜드명·로고)", "영업비밀·노하우"],
    ip_status: "출원 완료",
    ip_moat: "사전 주문 시각에 맞춰 추출 순서를 배치하는 운영 규칙이 핵심입니다. 같은 장비로도 대기 시간이 달라집니다.",
    ip_plan: "상표는 등록까지 진행하고, 운영 매뉴얼은 문서로 정리해 2호점 교육에 씁니다.",
  },

  "overview/achievements": {
    has_traction: "yes",
    traction_types: ["실제 판매·매출 발생", "고객 확보"],
    traction_detail: "2025년 3월 개업 후 월 1,400건 내외를 판매하고 있습니다. 재구매 고객이 주문의 절반을 넘습니다.",
  },

  "overview/structure": {
    team_size: "2~3명",
    has_cofounder: "no",
    roles: "대표가 추출과 매장 운영을 맡고, 오전 피크 시간대에 파트타임 1명이 픽업대를 담당합니다.",
    will_hire: "yes",
    hire_roles: "2호점을 열면 매장을 맡을 정직원 1명이 필요합니다.",
  },

  "market/products": {
    offer_type: ["상품(물건)"],
    main_offer: "테이크아웃 드립커피",
    offer_detail: "원두 2종(고소·산미) 중 선택, 텀블러 지참 시 500원 할인. 시럽·우유 변경 포함, 디저트는 취급하지 않습니다.",
    has_price: "yes",
    price_value: "4,900원",
    price_basis: "경쟁 가격 참고",
  },

  "market/segments": {
    seg_basis: ["지역(생활권·도시)", "이용 목적·상황", "구매 빈도"],
    segments: ["합정·상수 출근 직장인", "인근 사무실 단체 주문", "주말 산책 방문객"],
    first_target: "합정·상수 출근 직장인",
    why_first: "오전 8시 30분~9시에 수요가 몰려 있고, 역에서 사무실까지의 동선이 매장 앞을 지납니다",
    market_size_known: "yes",
    market_size: "합정역 일평균 승하차 약 5만 명(서울교통공사 2025). 이 중 출근 시간대 비중은 별도 확인이 필요합니다.",
  },

  "market/personas": {
    age: ["30대", "40대"],
    situation: "8시 40분쯤 합정역에서 내려 사무실까지 7분을 걷습니다. 커피는 마시고 싶지만 줄을 설 여유는 없습니다.",
    budget: "보통",
    motivation: "아침을 제대로 시작하고 싶다는 기분, 그리고 사무실 믹스커피는 마시기 싫다는 마음",
    fear: ["주문해 둔 게 제때 안 나올까 봐", "결국 줄을 서게 될까 봐"],
    channel: ["인스타그램", "지역 커뮤니티·맘카페", "오프라인 간판·전단"],
  },

  "market/competitors": {
    comp_types: ["역 앞 프랜차이즈 카페", "편의점 커피", "사무실 탕비실 커피"],
    knows_competitors: "yes",
    competitor_notes: "반경 300m에 프랜차이즈 3곳. 가격은 비슷하지만 오전 대기가 10분 이상이고, 사전 주문은 시각 지정이 안 됩니다.",
    differentiator: "받는 시각을 분 단위로 정할 수 있다는 점",
    gap: "아무도 '대기 시간 0분'을 약속하지 않습니다. 사전 주문은 있어도 언제 나오는지는 알려주지 않습니다.",
  },

  "market/swot": {
    strengths: ["출근 동선 위 입지", "시각 지정 사전 주문", "스페셜티 등급 원두"],
    weaknesses: ["좌석이 없어 체류 수요를 못 받음", "오전에 매출이 몰려 시간대 편차가 큼"],
    opportunities: ["인근 사무실 단체 주문", "원두 소매 판매 확대"],
    threats: ["프랜차이즈의 사전 주문 기능 강화", "임대료 상승"],
    swot_action: "오후 유휴 시간을 원두 소매와 단체 주문 준비에 씁니다. 좌석이 없는 약점은 '빨리 받는 곳'이라는 정체성으로 바꿉니다.",
  },

  "objectives/corporate": {
    horizon: "1년",
    main_goals: ["월 2,000건 판매", "2호점 입지 확정"],
    measure: ["주문 건수", "재구매율", "손익분기 도달"],
    target_number: "월 주문 2,000건, 재구매율 55%",
    sub_goals: ["단체 주문 월 20건", "원두 소매 월 300만원"],
    constraint: "자금 부족",
  },

  "strategy/product": {
    uvp: "지정한 시각에, 줄 서지 않고, 스페셜티 한 잔",
    improve_plan: "주문 데이터를 보고 시간대별 추출 순서를 계속 조정합니다. 대기 시간이 3분을 넘긴 주문은 따로 기록해 원인을 봅니다.",
    expand: "yes",
    expand_what: "원두 소매와 사무실 단체 배송",
  },

  "strategy/distribution": {
    channels: ["오프라인 매장", "자체 웹사이트·앱"],
    main_channel: "앱 사전 주문 후 매장 픽업",
    delivery: "픽업이 기본입니다. 단체 주문만 반경 500m 이내 직접 배달합니다.",
    coverage: "동네·생활권",
  },

  "strategy/price": {
    pricing_method: "경쟁사 기준",
    cost_known: "yes",
    unit_cost: "1,800원 (원두·우유·컵·부자재 포함)",
    discount: "yes",
    discount_plan: "텀블러 지참 500원 할인, 10잔 적립 시 1잔 무료",
  },

  "strategy/promotion": {
    promo_channels: ["인스타그램", "지역 커뮤니티·맘카페", "오프라인 전단·간판"],
    message: "출근길 3분, 줄 서지 않는 스페셜티",
    has_promo_budget: "yes",
    promo_budget: "월 30만원",
    promo_measure: "앱 신규 가입 수와 첫 주문 전환율로 확인합니다.",
  },

  "strategy/people": {
    who_works: ["대표자 직접", "아르바이트·파트타임"],
    need_hire: "yes",
    hire_when: "월 주문 1,800건을 넘으면 오전 파트타임을 1명 더 늘립니다.",
    how_manage: "오전 피크 2시간은 역할을 고정합니다 — 추출 1명, 픽업대 1명. 교대 전 5분 인수인계.",
    pay_structure: "시급·일급",
  },

  "strategy/exit": {
    exit_goal: "오래 직접 운영",
    exit_when: "정하지 않음",
    exit_prep: "2~3개 거점까지는 직접 운영하며 현금흐름으로 확장합니다. 매각은 거점 3개·연 매출 5억원 이상에서 검토합니다.",
  },

  "funding/requirements": {
    needs_funding: "yes",
    amount: "3천만~1억원",
    use_of_funds: ["시설·인테리어", "장비·비품", "운영 예비자금"],
    self_fund: "자기자본 2,000만원",
    sources: ["자기자본", "정책자금·대출"],
    gov_program: "yes",
    gov_detail: "소상공인 정책자금을 검토 중이며, 요건과 한도는 공고 원문 확인이 필요합니다.",
  },

  "financials/revenue": {
    revenue_streams: ["1회성 판매"],
    unit_price: "4,900원",
    monthly_volume: "1,400건",
    growth: "천천히 안정 성장",
    growth_ceiling: "오전 피크 설비 기준 월 2,600건이 한계입니다",
  },

  "financials/staffing": {
    has_staff_cost: "yes",
    staff_monthly: "1,600,000원",
    staff_type: ["시급·일급"],
    owner_pay: "no",
  },

  "financials/expenses": {
    fixed_items: ["임대료", "관리비·공과금", "통신비", "세무·회계"],
    // 인건비 160만원을 더해 월 고정비 400만원 — 본문 재무표와 같은 값
    fixed_total: "2,400,000원",
    variable_items: ["재료·원가", "포장·배송비", "결제 수수료"],
    variable_per_unit: "1,800원",
  },

  "financials/assets": {
    needs_assets: "yes",
    asset_items: ["인테리어", "주방·생산 장비"],
    asset_cost: "26,000,000원",
    asset_own: "에스프레소 머신과 그라인더는 직접 구입, 매장은 임차입니다.",
  },

  "financials/financing": {
    knows_breakeven: "yes",
    breakeven_value: "월 1,300건",
    // 월 1,400건으로 이미 손익분기(1,290건)를 넘겼다
    breakeven_when: "3개월 내",
    runway: "6~12개월",
    risk_plan: "3개월 연속 손익분기 미달이면 영업시간을 오전으로 줄이고 고정비를 먼저 낮춥니다.",
  },

  "summary/executive": {
    elevator: "출근길 직장인에게 앱으로 미리 주문받아 지정한 시각에 3분 안에 건네는 스페셜티 커피 픽업 매장입니다.",
    why_now: "사전 주문은 일반화됐지만 '언제 받을지'를 약속하는 곳은 없습니다. 출근 시간대는 그 약속이 곧 구매 이유가 됩니다.",
    why_us: "합정역으로 5년간 출근하며 문제를 직접 겪었고, 개업 후 1년간 실제 주문 데이터로 운영 규칙을 다듬었습니다.",
    next_actions: ["2호점 입지 3곳 조사", "단체 주문 응대 절차 정리", "정책자금 공고 요건 확인"],
    ask: "정부지원사업 신청",
  },
};
