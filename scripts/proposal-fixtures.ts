import { createProposalBlueprint, SECTOR_PROFILES, type ProposalSector, type ProposalPurpose, type ProposalStage, type ProposalRole } from "../lib/plan-builder/proposal-blueprint";
import type { DeckPlan, DeckSlide } from "../lib/plan-builder/deck-plan";
import type { ProposalSource } from "../lib/plan-builder/proposal-revision";

const CASES: Record<ProposalSector, { name: string; customer: string; offer: string; price: string; unit: string; problem: [string, string, string]; response: [string, string, string]; scope: [string, string, string] }> = {
  b2b_service: { name: "온결 스튜디오", customer: "제품은 있지만 영업 자료가 흩어진 소규모 제조사", offer: "영업 담당자가 바로 활용하는 제품 소개 자료", price: "150만원", unit: "제품군 1개 기준", problem: ["제품 설명이 담당자마다 달라요", "자료를 찾는 데 시간이 들어요", "검수 기준이 정해져 있지 않아요"], response: ["핵심 주장과 사양을 하나의 원문으로 정리", "제품 소개서와 상세 자료를 함께 구성", "초안 합의와 최종 검수 기준을 먼저 확정"], scope: ["제품 소개서 12쪽과 편집 원본", "인터뷰 1회 및 내용 수정 2회", "촬영·인쇄·번역은 별도 협의"] },
  software: { name: "오더데스크", customer: "메신저로 주문을 받는 소규모 도매업체", offer: "주문부터 출고 확인까지 한곳에서 관리하는 소프트웨어", price: "월 9만원", unit: "사업장 1곳 기준", problem: ["주문 정보가 대화에 묻혀요", "출고 여부를 다시 확인해요", "담당자 교체 때 기록이 끊겨요"], response: ["상품과 수량을 주문 항목으로 수집", "처리 상태를 주문별로 기록", "사업장 단위로 이력을 함께 보관"], scope: ["주문 접수와 처리 상태 관리", "사용자 초대 및 CSV 내보내기", "회계 연동과 자동 배차는 제외"] },
  food_beverage: { name: "새벽커피", customer: "출근 전에 기다리지 않고 커피를 찾는 직장인", offer: "출근 시간에 맞춰 준비하는 사전 주문 픽업 커피", price: "4,500원", unit: "대표 메뉴 1잔 기준", problem: ["출근 시간에는 대기가 부담돼요", "주문이 몰리면 제조가 밀려요", "준비량을 감으로 정하고 있어요"], response: ["시간대별 픽업 주문을 나누어 접수", "대표 메뉴 중심으로 제조 동선을 정리", "요일별 판매와 폐기를 함께 기록"], scope: ["아침 픽업 메뉴 3종으로 시작", "픽업 시간대별 주문 수량 관리", "배달과 식사 메뉴는 이번 범위에서 제외"] },
  retail_commerce: { name: "루틴상점", customer: "주방 소모품을 한 번에 준비하려는 1~2인 가구", offer: "사용 장면에 맞춰 구성한 주방 관리용품 묶음", price: "2만 4천원", unit: "기본 구성 1세트", problem: ["상품별 용도를 비교하기 어려워요", "필요한 것을 여러 번 주문해요", "교환 조건을 찾기 어려워요"], response: ["사용 장면을 기준으로 구성품 설명", "기본 묶음과 추가 품목을 분리", "배송 및 교환 조건을 구매 전에 안내"], scope: ["행주·수세미 등 기본 구성품", "자사몰 주문과 묶음 배송", "정기 배송은 별도 검증 후 검토"] },
  manufacturing: { name: "리필랩", customer: "리필 제품의 포장 규격을 찾는 생활용품 브랜드", offer: "소량 검증을 위한 재사용 용기 시제품", price: "견적 협의", unit: "규격과 수량 확인 후", problem: ["제품과 맞는 용기 규격이 없어요", "시험 없이 대량 발주하기 어려워요", "납품 검수 기준이 모호해요"], response: ["내용물과 사용 조건부터 설계에 반영", "시제품 시험을 먼저 진행", "외관·누수·치수의 검수 기준 합의"], scope: ["용기 1종 시제품 설계", "샘플 제작과 시험 항목 정리", "인증·금형·양산은 별도 단계"] },
  education: { name: "월요일 클래스", customer: "반복 보고 업무를 줄이고 싶은 소규모 팀", offer: "자기 업무 파일로 실습하는 문서 자동화 교육", price: "60만원", unit: "팀 1개 · 4회 과정", problem: ["교육 내용이 실제 업무와 달라요", "예제만 따라 하고 끝나요", "배운 것을 유지하기 어려워요"], response: ["교육 전 반복 업무 파일을 확인", "자기 업무 한 가지를 개선하는 과제", "완성 파일과 운영 방법을 함께 인계"], scope: ["회당 90분의 실습 4회", "업무 파일 1종과 피드백", "전사 시스템 구축은 제외"] },
  local_service: { name: "정돈생활", customer: "청소 전담 인력이 없는 소규모 사무실", offer: "업무 시간을 피해 방문하는 정기 청소 서비스", price: "8만원", unit: "기본 방문 1회", problem: ["방문 시간이 일정하지 않아요", "작업한 범위가 잘 보이지 않아요", "추가 요청 비용이 불명확해요"], response: ["반복 방문 시간을 먼저 합의", "작업 체크리스트로 범위 확인", "기본 작업과 추가 작업 구분"], scope: ["바닥·공용 공간 기본 청소", "방문 후 완료 항목 전달", "고소·외벽·특수 세척은 제외"] },
  space_hospitality: { name: "모임창고", customer: "소규모 워크숍 공간을 찾는 팀 운영자", offer: "준비 시간을 포함해 예약하는 워크숍 공간", price: "시간당 5만원", unit: "공간 1개 · 최대 12명", problem: ["사진만으로 공간을 판단해요", "행사 준비 시간이 부족해요", "현장에서 필요한 물품이 달라요"], response: ["배치도와 실제 구비 물품을 공개", "입장과 정리 시간을 예약에 반영", "예약 전 행사 조건을 확인"], scope: ["테이블·의자·화면 기본 제공", "예약 시간 내 단독 사용", "음식 제공과 행사 진행은 제외"] },
  logistics: { name: "동네루트", customer: "근거리 거래처에 반복 배송하는 지역 사업자", offer: "정해진 구간을 묶어서 처리하는 배송 서비스", price: "계약 협의", unit: "구간과 물량 기준", problem: ["건별 배송 비용이 불규칙해요", "수령 여부를 개별 확인해요", "예외 물량에 대응하기 어려워요"], response: ["반복 구간의 묶음 운송 조건 합의", "인수 확인 정보를 배송별로 보관", "정규 물량과 추가 물량을 분리"], scope: ["합의된 구간과 시간대 배송", "수령 확인 및 정산 기록", "위험물·냉장 운송은 제외"] },
  content_media: { name: "매장한컷", customer: "새 메뉴를 소개할 사진이 필요한 동네 음식점", offer: "메뉴 사진과 게시용 소개 문구를 함께 제작", price: "18만원", unit: "메뉴 3종 촬영 기준", problem: ["메뉴의 특징이 사진에 안 보여요", "촬영 후 게시를 미루게 돼요", "추가 수정의 범위가 불명확해요"], response: ["메뉴별 강조할 장면을 사전에 합의", "게시용 규격과 짧은 문구를 함께 납품", "수정 횟수와 원본 인계 여부를 정리"], scope: ["메뉴 3종의 보정 사진", "게시용 소개 문구와 규격", "모델 섭외·영상 제작은 제외"] },
  general: { name: "작은실험", customer: "아직 고객과 제공 범위를 정하지 않은 사업", offer: "관심과 가능한 자원에서 시작안을 찾는 단계", price: "미정", unit: "제공 단위 확인 필요", problem: ["누가 필요로 하는지 미정이에요", "어디까지 할 수 있는지 몰라요", "처음 무엇을 확인할지 어려워요"], response: ["필요한 상황을 하나 선택", "가능한 시간과 자원을 정리", "작은 확인 방법을 먼저 설계"], scope: ["첫 고객 가설 정리", "최소 제공안 비교", "확정 가격과 실적은 없음"] },
};

const WORKFLOW_OUTPUTS: Record<ProposalSector, string[]> = {
  b2b_service: ["제품 담당자 인터뷰와 기존 자료 확인", "페이지별 목차와 납품물 및 검수 항목 합의", "원문과 사양을 대조하며 초안 제작", "수정 반영 후 PDF와 편집 원본 인계"],
  software: ["사업장과 상품 및 담당자 설정", "주문 항목을 입력하고 처리 담당 지정", "접수·출고 상태와 예외 주문 확인", "주문 이력을 조회하고 CSV로 내보내기"],
  food_beverage: ["메뉴별 레시피와 당일 준비 수량 확인", "픽업 시간대별 수량과 결제 상태 확인", "픽업 시간에 맞춰 제조하고 주문자 대조", "요일별 판매·대기·폐기를 다음 준비에 반영"],
  retail_commerce: ["구성품의 규격과 수량 및 검수 기록", "용도·구성·배송 조건을 상품 페이지에 반영", "묶음 구성과 송장 및 출고 수량 확인", "반품 사유를 기록하고 구성 또는 안내 수정"],
  manufacturing: ["내용물과 치수 및 사용 환경을 설계에 반영", "누수·치수·외관 시험 후 보완 항목 결정", "합의된 규격으로 생산하고 검사 이력 기록", "수량과 규격을 대조한 뒤 사용 조건 인계"],
  education: ["참여자가 실제 쓰는 반복 업무 파일 확인", "업무 한 가지를 고르는 실습과 단계별 과제", "실행 결과를 검토하고 오류를 함께 수정", "완성 파일과 유지 관리 방법을 팀에 인계"],
  local_service: ["공간과 방문 시간 및 기본 작업 범위 확인", "출입 조건과 현장 특이 사항 확인", "합의한 체크리스트 순서로 작업", "완료 항목과 추가 요청을 나누어 전달"],
  space_hospitality: ["인원과 행사 형식 및 구비 물품 확인", "준비 시간을 포함해 시설 상태 확인", "예약 범위에 따라 공간과 물품 이용", "정리 항목과 파손 여부 확인 후 다음 예약 준비"],
  logistics: ["구간·물량·마감 시간에 따라 운송 조건 확인", "수량과 수령 정보를 대조한 뒤 분류", "정해진 구간 운송 및 지연·파손 기록", "인수 내역을 확인하고 예외 비용 구분"],
  content_media: ["메뉴별 강조할 장면과 납품 규격 합의", "합의한 구도와 배경으로 촬영", "대표 컷을 선정하고 약속한 수정 반영", "보정 파일과 게시 문구 및 사용 범위 전달"],
  general: ["필요한 상황과 고객 후보를 한 가지 선택", "가능한 시간과 예산 안에서 최소 제공안 준비", "아직 가정인 조건을 표시하고 작은 반응 확인", "확인한 것과 남은 가정을 나누어 다음 실행 결정"],
};
const RISK_RESPONSES: Partial<Record<ProposalSector, string[]>> = {
  b2b_service: ["합의 범위 밖의 요청은 별도 견적", "페이지별 검수 항목 합의 후 착수", "원인과 변경 일정을 담당자와 재협의"],
  food_beverage: ["접수 가능량에 맞춰 픽업 시간 분산", "판매와 폐기를 기록하고 준비량 조정", "관할 기관 확인 후 영업 범위 확정"],
  software: ["보관 범위와 접근 권한을 먼저 확정", "연동 실패 시 수동 처리 경로 확보", "구현 완료·개발 예정 기능 분리"],
  manufacturing: ["시험 항목과 비용을 확인 후 다음 단계", "수량과 생산 조건 확인 후 발주", "검수 항목과 예외 대응을 사전 합의"],
};

export function proposalFixture(sector: ProposalSector = "b2b_service", purpose: ProposalPurpose = "sales", stage: ProposalStage = "prelaunch"): { source: ProposalSource; deck: DeckPlan } {
  const sample = CASES[sector], profile = SECTOR_PROFILES[sector];
  const blueprint = createProposalBlueprint({ businessName: sample.name, options: { sector, purpose, stage, evidence: { pricing: sector !== "general", schedule: true } } });
  const sectionRoles: ProposalRole[] = ["summary", "problem", "solution", "offering", "workflow", "commercial", "evidence", "economics", "roadmap", "risks", "team", "ask"];
  const source: ProposalSource = { businessName: sample.name, businessDescription: sample.offer, sections: sectionRoles.map(role => ({ chapterTitle: "가상 사업", sectionTitle: role, markdown: `${sample.name} / ${role}\n${sample.offer}\n${sample.price} (${sample.unit})\n가상 검증 자료이며 실제 실적이 아닙니다` })) };
  const notes = "제품 검증용 가상 사례입니다. 가격과 일정은 설명을 위한 제안이며 실제 업체의 실적이나 계약 조건이 아닙니다.";
  const content: Record<ProposalRole, Partial<DeckSlide>> = {
    cover: { title: `${sample.name}\n${purpose === "sales" ? "고객 제안서" : purpose === "operating_plan" ? "운영 개선 기획서" : purpose === "investment" ? "사업 검토 자료" : purpose === "grant" ? "사업 실행 계획" : "사업소개서"}`, lead: sample.offer },
    summary: { title: "무엇을 누구에게 제공하는가", lead: sample.offer, points: [{ label: "고객", detail: sample.customer }, { label: "제공 단위", detail: sample.unit }, { label: "제안 가격", detail: sample.price }] },
    problem: { title: "고객이 겪는 세 가지 불편", lead: "아직 검증이 필요한 고객 문제 가설입니다", points: sample.problem.map((detail, i) => ({ label: ["선택과 이해", "이용과 실행", "확인과 관리"][i], detail })) },
    solution: { title: "문제와 같은 순서로 답합니다", lead: "이번 제안에 포함한 해결 방식입니다", points: sample.response.map((detail, i) => ({ label: ["선택과 이해", "이용과 실행", "확인과 관리"][i], detail })) },
    offering: { title: "먼저 제공할 범위를 명확하게", lead: ["manufacturing", "logistics", "general"].includes(sector) ? "제공 단위와 수량을 협의한 뒤 범위를 확정합니다" : `${sample.unit}으로 시작하는 제안`, table: { headers: ["구분", "제공 내용", "조건"], rows: [["핵심 제공", sample.scope[0], "제안 범위"], ["함께 제공", sample.scope[1], "제안 범위"], ["이번에 제외", sample.scope[2], "추가 협의"], ["가격", sample.price, sample.unit]] } },
    workflow: { title: "시작부터 결과 확인까지", lead: "각 단계의 결과를 확인하고 다음 단계로 넘어갑니다", points: profile.workflow.map((label, index) => ({ label, detail: WORKFLOW_OUTPUTS[sector][index] })) },
    commercial: { title: "가격보다 먼저 거래 단위를 정합니다", lead: "확정 계약이 아닌 협의용 가격 제안입니다", table: { headers: ["항목", "제안", "확인할 조건"], rows: [["기본 가격", sample.price, sample.unit], ["포함 범위", sample.scope[0], "추가 범위 별도 협의"], ["지급과 취소", "협의 후 확정", "시점과 책임 범위 명시"]] } },
    evidence: { title: stage === "operating" ? "운영 기록부터 같은 기준으로" : "없는 실적 대신 검증할 것을 정합니다", lead: "가상 사례에는 실제 고객 실적이 포함되어 있지 않습니다", table: { headers: ["확인 대상", "필요한 자료", "확인 방법"], rows: profile.evidence.map((label, index) => [label, ["사용 권한과 원본", "기간과 집계 기준", "조건과 피드백 원문"][index], ["현재 자료 확인", "동일 기준으로 기록", "결과와 가정 구분"][index]]) } },
    economics: { title: "수익 계산의 빈칸을 드러냅니다", lead: "미입력 비용은 0원이 아니며 실적으로 대체하지 않습니다", table: { headers: ["입력 항목", "현재 상태", "사용 기준"], rows: profile.economics.map((label, index) => [sector === "food_beverage" && index === 0 ? "대표 메뉴 가격" : label, index === 0 ? sample.price : "추가 확인 필요", index === 0 ? "제안 가격" : "자료 확보 후 계산"]) } },
    roadmap: { title: stage === "operating" ? "기존 운영을 유지하며 작게 바꿉니다" : "작게 시작하고 확인한 뒤 넓힙니다", lead: "아래 기간은 가상 사례의 협의용 실행 일정입니다", table: { headers: ["기간", "진행 내용", "완료 기준", "담당"], rows: [["1주차", "현황과 조건 확인", "제공 범위 합의", "사업 담당자"], ["2주차", "첫 제공안 준비", "샘플 검토", "수행 담당자"], ["3주차", "작은 실행", "반응 기록", "공동 확인"], ["4주차", "결과 정리", "유지·수정 결정", "사업 담당자"]] } },
    risks: { title: "불확실한 조건은 먼저 합의합니다", lead: "예외가 생겼을 때의 대응까지 범위에 포함합니다", table: { headers: ["확인 항목", "현재 상태", "대응 기준"], rows: profile.risks.map((label, index) => [label, "협의 또는 확인 필요", RISK_RESPONSES[sector]?.[index] ?? "조건 확정 전 확대 보류"]) } },
    team: { title: "담당 역할과 필요한 역량", lead: "인원과 이력이 확정되지 않은 역할 설계안입니다", points: [{ label: "사업 담당", detail: "고객 요구와 예산 범위를 정하고 의사결정" }, { label: "수행 담당", detail: "합의한 범위를 수행하고 변경 사항 공유" }, { label: "결과 확인", detail: "완료 기준을 점검하고 다음 실행 결정" }] },
    ask: { title: "요청 규모는 근거를 갖춘 뒤", lead: "요청 금액과 외부 자격을 확정하지 않은 검토 단계입니다", table: { headers: ["확인할 항목", "필요한 근거", "현재 상태"], rows: [["자금 사용 범위", "실행 범위와 견적", "미확정"], ["기간별 필요 자금", "비용과 집행 일정", "미확정"], ["외부 조건", "공식 공고 또는 협의 조건", "별도 확인"]] } },
    close: { title: "함께 정할 다음 단계", lead: "작은 실행 범위를 합의한 뒤 시작합니다", points: [{ label: "범위 확인", detail: sample.scope[0] }, { label: "조건 합의", detail: "가격과 일정 및 제외 범위를 확인" }, { label: "시작 결정", detail: "담당과 완료 기준을 확정" }] },
  };
  return { source, deck: { blueprint, brandName: sample.name, slogan: sample.offer, slides: blueprint.slots.map(slot => ({
    id: slot.id, composition: { role: slot.role, layout: slot.layout, treatment: slot.treatment, missingEvidence: slot.missingEvidence },
    eyebrow: slot.title, title: slot.title, ...content[slot.role], note: notes,
    sourceSections: [`가상 사업 · ${slot.role === "cover" || slot.role === "close" ? "summary" : slot.role}`, ...(["summary", "offering", "economics"].includes(slot.role) ? ["가상 사업 · commercial"] : [])],
  })) } };
}
