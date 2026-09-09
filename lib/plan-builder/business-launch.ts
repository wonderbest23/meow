import { z } from "zod";
import { coachDocumentRevision, readCoach } from "./coach";
import type { Plan } from "./plan-store";

export const LAUNCH_KEY = "__business_launch";
const recordSchema = z.object({ status: z.enum(["done", "skipped", "pending"]), signature: z.string(), note: z.string().max(10000).default(""), material: z.string().max(20000).default(""), at: z.string() });
const quoteSchema = z.object({ name: z.string().max(100).default(""), monthly: z.string().max(20).default(""), deposit: z.string().max(20).default(""), initial: z.string().max(20).default("") });
export const launchSchema = z.object({
  purpose: z.enum(["ideas", "launch", "improve"]).default("launch"),
  workplace: z.enum(["unknown", "remote", "shared", "shop"]).default("unknown"),
  registered: z.enum(["unknown", "yes", "no"]).default("unknown"),
  region: z.string().max(100).default(""),
  configured: z.boolean().default(false),
  records: z.record(z.string(), recordSchema).default({}),
  quotes: z.array(quoteSchema).max(3).default([]),
});
export type LaunchState = z.infer<typeof launchSchema>;
export type LaunchStep = { id: string; title: string; task: string; materialTitle: string; material: string; prompt: string; caution?: string; links?: Array<{ title: string; url: string }>; service?: "website" | "marketing"; signature: string };
export function readLaunch(plan: Plan): LaunchState {
  const parsed = launchSchema.safeParse(plan.answers[LAUNCH_KEY]);
  return parsed.success ? parsed.data : launchSchema.parse({ purpose: readCoach(plan.answers)?.stage === "operating" ? "improve" : "launch" });
}
export const LAUNCH_SOURCES = {
  registration: { title: "국세청 · 사업자등록 제출서류", url: "https://www.nts.go.kr/nts/ad/cntnts/cntntsView.do?mi=2445" },
  tax: { title: "국세청 · 인터넷 세법상담", url: "https://b.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=109144&mi=13365" },
  lease: { title: "법무부 · 개정 상가 임대차 표준계약서 안내", url: "https://www.corrections.go.kr/bbs/moj/182/494574/download.do" },
};

export function launchSteps(plan: Plan, settings: LaunchState): LaunchStep[] {
  const coach = readCoach(plan.answers);
  const field = (key: string, fallback = "아직 정하지 않음") => coach?.fields.find(f => f.key === key)?.value ?? fallback;
  const business = field("business", plan.title), offer = field("offer"), customer = field("customer"), price = field("price"), channel = field("channel");
  const context = `사업: ${plan.title}\n소개: ${business}\n상품: ${offer}\n고객: ${customer}\n가격: ${price}`;
  const base = { signature: JSON.stringify([coach ? coachDocumentRevision(coach) : plan.title, settings.purpose, settings.workplace, settings.registered]) };
  const result: LaunchStep[] = [{ ...base, id: "offer", title: settings.purpose === "improve" ? "상품을 더 다듬어요" : "팔고 싶은 상품을 정해요", task: "정리된 상품 소개를 읽고 바꾸고 싶은 내용만 남겨주세요.", materialTitle: "상품 소개 초안", material: `${plan.title}\n\n${business}\n\n제공 내용: ${offer}\n이용 고객: ${customer}\n검토 중인 가격: ${price}\n문의·판매 경로: ${channel}`, prompt: "현재 상품 소개를 고객에게 바로 보여줄 수 있는 문장으로 다듬어 주세요. 정해지지 않은 구성과 가격은 제안으로 표시하고 효과나 실적은 만들지 마세요." }];
  if (settings.purpose === "ideas") return result;
  result.push({ ...base, id: "operations", title: "작게 시작할 범위를 정해요", task: "처음 제공할 범위와 감당할 수 있는 비용을 확인해요.", materialTitle: "운영 범위 메모", material: `${context}\n\n준비 예산: ${field("budget")}\n처음 드는 비용: ${field("setupCost")}\n매달 나가는 비용: ${field("cost")}\n운영 범위: ${field("capacity")}\n주당 가능한 시간: ${field("hoursPerWeek")}\n\n이번에 하지 않을 일:\n추가로 필요한 준비물:`, prompt: "현재 사업의 첫 운영 범위를 작게 정하고, 이미 알려준 예산과 시간으로 가능한 준비물·작업 순서·보류할 일을 구체적으로 제안해주세요. 모르는 비용을 0원이나 실제 견적으로 확정하지 마세요." });
  if (settings.workplace === "unknown") result.push({ ...base, id: "workspace-choice", title: "일할 공간이 필요한지 알아봐요", task: "사무실을 먼저 계약하지 않아도 돼요. 현재 사업에 필요한 공간부터 검토해요.", materialTitle: "작업 공간 검토 메모", material: `${context}\n\n고객이 직접 방문해야 하는지:\n장비·재고를 보관할 공간이 필요한지:\n집이나 온라인에서 할 수 있는 작업:\n별도 확인이 필요한 주소·시설 조건:`, prompt: "현재 사업에 사무실·점포가 실제로 필요한지 검토해 주세요. 온라인 운영, 집에서 작업, 소호·공유사무실, 점포 중 적용 가능한 선택지를 비교하고, 확인되지 않은 주소 사용·인허가 적합성을 확정하지 마세요." });
  if (settings.workplace === "shared" || settings.workplace === "shop") result.push({ ...base, id: "workplace", title: settings.workplace === "shared" ? "소호·공유사무실을 비교해요" : "사업장 계약 조건을 확인해요", task: "받은 견적과 이용 조건을 비교하고 계약 전 질문을 준비해요.", materialTitle: "사업장 문의 초안", material: `안녕하세요. ${business} 사업을 준비하고 있습니다.\n${settings.region ? `희망 지역은 ${settings.region}입니다.\n` : ""}다음 조건을 포함한 서면 견적을 받고 싶습니다.\n\n1. 상주 좌석 이용인지, 비상주 주소 이용인지\n2. 보증금·월 이용료·관리비·초기 비용 및 부가세 포함 여부\n3. 우편 수령·회의실·추가 인원 비용\n4. 제 업종의 사업자등록과 실제 영업에 적합한 공간인지\n5. 계약 당사자와 공간 제공 권한을 확인할 서류\n6. 이용 기간·중도 해지·자동 연장·보증금 반환 조건\n7. 주소 변경 및 폐업 시 필요한 절차\n\n계약서 초안과 전체 비용 내역을 함께 부탁드립니다.`, caution: "소호오피스도 상주형과 비상주형이 달라요. 저렴하다는 이유만으로 적합하다고 판단하지 않으며, 등록 가능 여부와 계약은 관할 기관·전문가에게 확인해야 해요. 아래는 문의 초안이지 계약서가 아니에요.", links: [LAUNCH_SOURCES.lease, LAUNCH_SOURCES.registration], prompt: "현재 사업의 사무실 견적과 계약 전 확인할 질문을 정리해 주세요. 법적 적합성·권리관계·등록 가능 여부를 확인했다고 단정하지 말고, 실제 견적이 없으면 임대료 시세를 만들지 마세요." });
  if (settings.registered !== "yes") result.push({ ...base, id: "registration", title: "사업자등록 준비를 확인해요", task: "실제로 판매를 시작할 시점에 맞춰 필요한 서류와 업종을 공식 안내에서 확인해요.", materialTitle: "등록 상담용 사업 설명", material: `${context}\n\n사업장 방식: ${settings.workplace === "remote" ? "별도 사무실 없이 운영 검토" : settings.workplace === "shared" ? "소호·공유사무실 검토" : settings.workplace === "shop" ? "점포·사업장 검토" : "미정"}\n\n확인하고 싶은 내용:\n- 사업 내용에 맞는 업종과 신청 서류\n- 주소 사용과 임차 관련 제출 자료\n- 해당 업종의 별도 인허가·신고 여부\n- 실제 개업 예정일에 맞는 신청 일정`, caution: "사업 아이디어를 확인하는 것과 실제 영업은 달라요. 여기서 준비 완료를 눌러도 사업자등록이 신청되지는 않아요.", links: [LAUNCH_SOURCES.registration], prompt: "현재 사업으로 관할 세무서에 물어볼 등록 상담 질문지를 작성해주세요. 업종코드·허가 여부·신청 완료를 임의로 확정하지 마세요." });
  result.push({ ...base, id: "tax", title: "세금 관리 방법을 정해요", task: "직접 관리할지 세무 상담을 받을지 결정할 수 있도록 사업 정보를 정리해요.", materialTitle: "세무 상담 요청 초안", material: `안녕하세요. 아래 사업의 세무 상담을 받고 싶습니다.\n\n${context}\n현재 매출(제공된 정보): ${field("sales")}\n월 비용: ${field("cost")}\n\n1. 제 사업에 필요한 신고 종류와 실제 신고 일정\n2. 직접 신고할 때 준비할 매출·매입·인건비 자료\n3. 기장료와 별도 신고 수수료, 포함 업무\n4. 증빙 전달 방식과 상담 범위\n5. 계약 해지와 자료 반환 조건\n\n상담 후 업무 범위와 비용을 서면으로 안내 부탁드립니다.`, caution: "세무사 자동 배정·예약은 아직 제공하지 않아요. 신고 종류와 일정은 사업 형태에 따라 확인해야 하며, 이 화면에서 신고가 처리되지는 않아요.", links: [LAUNCH_SOURCES.tax], prompt: "현재 사업의 세무 상담용 설명과 자료 준비 목록을 구체화해주세요. 세율·신고기한은 검증된 자료가 없으면 확정하지 말고, 현재 매출과 예상 매출을 구별해주세요." });
  result.push({ ...base, id: "website", title: "홈페이지를 준비해요", task: "사업계획서로 홈페이지를 만들거나 디자인·개발 상담을 요청할 수 있어요.", materialTitle: "홈페이지 제작 요청서", material: `${context}\n\n홈페이지의 목적: 상품 소개와 문의 접수\n필요한 내용: 상품 설명, 가격, 신청 방법, 운영자 정보\n추가로 원하는 기능:\n보유한 사진·로고:\n연결하려는 도메인:\n희망 일정:`, service: "website", caution: "디자인·개발 대행은 별도 견적과 동의 후 진행해요. 도메인 구매나 외부 서비스 개통은 자동 완료되지 않아요.", prompt: "현재 사업의 홈페이지에 넣을 제목, 상품 설명, 문의 유도 문구와 섹션 구성을 작성해주세요. 보유하지 않은 인증·후기·실적은 넣지 마세요." });
  result.push({ ...base, id: "payment", title: "주문·결제 흐름을 점검해요", task: "고객이 문의하고 결제한 뒤 상품을 받는 과정을 한 번 따라가 봐요.", materialTitle: "판매 준비 점검표", material: `판매할 상품: ${offer}\n검토 중인 가격: ${price}\n주문·문의 경로: ${channel}\n\n확인할 내용:\n- 신청 내용과 고객 연락 방법\n- 최종 금액과 추가 비용 표시\n- 제공 시점과 제공 범위\n- 취소·환불 안내와 문의 방법\n- 결제 승인·실패·중복 결제 처리\n- 필요한 사업자·판매자·개인정보 안내\n\n선택한 결제 제공사:\n심사·연결 상태:\n실제 테스트 결과:`, caution: "이 단계는 연결 준비예요. 결제사 심사·가맹점 등록·실제 결제 연동이 완료됐다는 뜻은 아니에요.", prompt: "현재 사업에서 고객 문의부터 주문, 결제, 제공, 사후 문의까지의 흐름과 테스트 시나리오를 작성해주세요. 실제로 연결되지 않은 결제 기능을 연결 완료라고 표현하지 마세요." });
  result.push({ ...base, id: "marketing", title: "첫 홍보를 준비해요", task: "고객이 있는 채널 하나를 정하고 첫 게시물을 다듬어요.", materialTitle: "첫 홍보 글 초안", material: `${plan.title}\n\n${business}\n\n제공하려는 내용은 ${offer}입니다.\n${customer === "아직 정하지 않음" ? "관심 있는 분" : customer}의 의견과 문의를 받고 있습니다.\n자세한 구성과 이용 조건은 문의 시 안내드리겠습니다.\n\n게시할 채널: ${channel}\n문의 받을 주소: [연락 방법 입력]\n게시 예정일: [날짜 입력]`, caution: "저장된 사업 정보로 구성한 초안이에요. 가격·효과·이미지 사용 권한을 확인한 뒤 공개해 주세요. 마케팅 대행 연결은 아직 제공하지 않아요.", prompt: "현재 고객과 상품에 맞는 1주일 마케팅 계획과 바로 쓸 게시물 3개를 작성해주세요. 채널별 작업시간, 적은 예산의 테스트 방법, 확인할 지표를 포함하고 성과를 보장하지 마세요." });
  result.push({ ...base, id: "review", title: "운영 결과로 개선해요", task: "알고 있는 실제 결과만 남기고 다음 개선안을 받아보세요.", materialTitle: "운영 기록", material: `기록 기간:\n실제 문의 수:\n실제 판매 건수:\n실제 매출:\n실제 지출:\n고객이 남긴 의견:\n계속할 일:\n바꿔볼 일:\n\n아직 모르는 항목은 비워두어도 됩니다.`, prompt: "제가 기록한 실제 운영 결과를 바탕으로 유지할 것과 바꿀 것, 다음 실험 하나를 정해주세요. 기록하지 않은 실적은 만들지 말고 원인 추정과 확인된 결과를 구분해주세요." });
  return result;
}

export function launchStatus(state: LaunchState, step: LaunchStep) {
  const record = state.records[step.id];
  if (!record) return "pending";
  if (record.signature !== step.signature) return "review";
  return record.status;
}

export function quoteTotals(quote: LaunchState["quotes"][number]) {
  const amount = (value: string) => /^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value) && Number.isSafeInteger(Number(value.replaceAll(",", ""))) && Number(value.replaceAll(",", "")) <= 1e12 ? Number(value.replaceAll(",", "")) : null;
  const monthly = amount(quote.monthly), initial = amount(quote.initial), deposit = amount(quote.deposit);
  if (monthly === null || initial === null || deposit === null) return null;
  return { outflow: deposit + initial + monthly * 12, fees: initial + monthly * 12, deposit };
}
