import PptxGenJS from "pptxgenjs";
import { NextResponse } from "next/server";
import { z } from "zod";

const deckRequestSchema = z.object({
  brandName: z.string().trim().min(1).max(80),
  slogan: z.string().trim().max(120),
  title: z.string().trim().min(1).max(160),
  oneLiner: z.string().trim().min(1).max(500),
  customer: z.string().trim().min(1).max(300),
  model: z.string().trim().min(1).max(300),
  revenue: z.string().trim().min(1).max(300),
  priceWon: z.number().int().min(0).max(10_000_000_000),
  risk: z.string().trim().max(500),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

const INK = "16231D";
const MUTED = "627168";
const PALE = "F1F5F2";
const WHITE = "FFFFFF";

function cleanHex(value: string) {
  return value.replace("#", "").toUpperCase();
}

function addFooter(slide: PptxGenJS.Slide, brandName: string, page: number) {
  slide.addText(brandName, { x: 0.72, y: 7.1, w: 4, h: 0.2, fontFace: "Aptos", fontSize: 8, color: MUTED });
  slide.addText(String(page).padStart(2, "0"), { x: 12, y: 7.1, w: 0.6, h: 0.2, fontFace: "Aptos", fontSize: 8, color: MUTED, align: "right" });
}

function addContentSlide(
  pptx: PptxGenJS,
  brandName: string,
  page: number,
  eyebrow: string,
  title: string,
  lead: string,
  bullets: string[],
  accent: string,
) {
  const slide = pptx.addSlide();
  slide.background = { color: WHITE };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.16, h: 7.5, fill: { color: accent }, line: { color: accent } });
  slide.addText(eyebrow, { x: 0.74, y: 0.6, w: 3.8, h: 0.3, fontFace: "Aptos", fontSize: 10, bold: true, color: accent, charSpacing: 1.2 });
  slide.addText(title, { x: 0.72, y: 1.03, w: 8.5, h: 1.05, fontFace: "Aptos Display", fontSize: 27, bold: true, color: INK, breakLine: false, margin: 0 });
  slide.addText(lead, { x: 0.75, y: 2.15, w: 8.3, h: 0.72, fontFace: "Aptos", fontSize: 13, color: MUTED, breakLine: false, margin: 0.02, valign: "middle" });
  slide.addShape(pptx.ShapeType.roundRect, { x: 9.55, y: 0.58, w: 3.02, h: 2.35, rectRadius: 0.05, fill: { color: PALE }, line: { color: "DDE6E0", width: 1 } });
  slide.addText(brandName.slice(0, 1), { x: 10.25, y: 0.92, w: 1.6, h: 1.12, fontFace: "Aptos Display", fontSize: 46, bold: true, color: accent, align: "center", valign: "middle", margin: 0 });
  bullets.slice(0, 4).forEach((bullet, index) => {
    const y = 3.27 + index * 0.77;
    slide.addShape(pptx.ShapeType.ellipse, { x: 0.76, y: y + 0.06, w: 0.22, h: 0.22, fill: { color: accent }, line: { color: accent } });
    slide.addText(bullet, { x: 1.16, y, w: 10.8, h: 0.5, fontFace: "Aptos", fontSize: 15, color: INK, margin: 0, valign: "middle", breakLine: false });
  });
  addFooter(slide, brandName, page);
}

export async function POST(request: Request) {
  try {
    const input = deckRequestSchema.parse(await request.json());
    const accent = cleanHex(input.accentColor);
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = input.brandName;
    pptx.company = input.brandName;
    pptx.subject = `${input.title} 사업소개서`;
    pptx.title = `${input.brandName} 사업소개서`;
    pptx.theme = {
      headFontFace: "Aptos Display",
      bodyFontFace: "Aptos",
    };

    const cover = pptx.addSlide();
    cover.background = { color: INK };
    cover.addShape(pptx.ShapeType.rect, { x: 0.7, y: 0.7, w: 0.14, h: 5.95, fill: { color: accent }, line: { color: accent } });
    cover.addText("BUSINESS INTRODUCTION", { x: 1.2, y: 1.22, w: 4.8, h: 0.34, fontFace: "Aptos", fontSize: 11, bold: true, color: accent, charSpacing: 1.5 });
    cover.addText(input.brandName, { x: 1.18, y: 1.85, w: 10.6, h: 1.2, fontFace: "Aptos Display", fontSize: 43, bold: true, color: WHITE, margin: 0, breakLine: false });
    cover.addText(input.slogan || input.oneLiner, { x: 1.22, y: 3.15, w: 8.8, h: 0.92, fontFace: "Aptos", fontSize: 19, color: "C8D3CD", margin: 0, breakLine: false });
    cover.addText(`${new Date().toLocaleDateString("ko-KR")} · 자동 생성 초안`, { x: 1.22, y: 6.32, w: 4.8, h: 0.24, fontFace: "Aptos", fontSize: 9, color: "829189" });

    addContentSlide(pptx, input.brandName, 2, "01 · 고객 문제", "고객이 지금 겪는 문제", input.oneLiner, [
      `핵심 고객: ${input.customer}`,
      "최근 행동·현재 대안·실제 지출을 인터뷰 원문으로 보완",
      "문제 빈도와 해결 지연이 만드는 비용을 숫자로 검증",
      "미확인 시장 수치는 제출 전 공식 출처와 기준일 표시",
    ], accent);
    addContentSlide(pptx, input.brandName, 3, "02 · 해결 방식", "우리가 제안하는 해결 방식", input.oneLiner, [
      `제공 방식: ${input.model}`,
      "처음에는 수동 운영으로 고객 결과와 실패 지점을 측정",
      "제공 범위·완료 기준·불포함 항목을 계약 전 공개",
      "앱 개발보다 실제 유료 주문 3건 검증을 우선",
    ], accent);
    addContentSlide(pptx, input.brandName, 4, "03 · 첫 상품", "첫 판매 상품", `검증 가능한 최소 단위 상품을 ${input.priceWon.toLocaleString("ko-KR")}원 기준으로 제안합니다.`, [
      `권장 첫 가격: ${input.priceWon.toLocaleString("ko-KR")}원`,
      "고객이 받는 결과와 제공 기한을 한 문장으로 고정",
      "취소·환불·지연 대응을 결제 전에 확인",
      "첫 3건의 시간·변동비·공헌이익을 실제 기록",
    ], accent);
    addContentSlide(pptx, input.brandName, 5, "04 · 시장", "시장과 경쟁 대안", "전체 시장 규모보다 고객이 지금 쓰는 대안과 전환 이유를 먼저 검증합니다.", [
      "고객 인터뷰 5건의 최근 행동과 지불 근거 첨부",
      "경쟁사·지인·직접 해결 등 현재 대안 3개 비교",
      "지역·채널별 첫 고객 접근 가능성을 확인",
      "시장 수치에는 출처 인터넷 주소·기준일·정의를 함께 표시",
    ], accent);
    addContentSlide(pptx, input.brandName, 6, "05 · 수익 구조", "수익 구조와 비용", input.revenue, [
      `수익 모델: ${input.revenue}`,
      "판매가에서 부가세·결제수수료·변동비를 차감",
      "임대료·인건비·마케팅비를 월 고정비로 분리",
      "손익분기 고객 수는 실제 첫 주문 원가로 다시 계산",
    ], accent);
    addContentSlide(pptx, input.brandName, 7, "06 · 첫 판매", "첫 30일 실행", "한 판매 경로, 한 고객군, 한 상품으로 유료 주문을 만듭니다.", [
      "1주차: 고객 5명 인터뷰와 첫 상품 확정",
      "2주차: 사업장·등록·세무·위험 조건 확인",
      "3주차: 판매 페이지·로고·운영 연습 완료",
      "4주차: 제안 20건, 유료 주문 3건, 거절 10건 기록",
    ], accent);
    addContentSlide(pptx, input.brandName, 8, "07 · 운영", "사업을 안전하게 운영하는 법", "신청부터 완료·환불·세무증빙까지 한 건을 끝까지 추적합니다.", [
      "사업자등록·인허가·주소 적합성 증빙 보관",
      "문의-계약-결제-제공-환불 업무 절차 연습",
      "개인정보 최소수집·보유기간·삭제 테스트",
      "매월 마감과 분기별 신고일 공식 캘린더 확인",
    ], accent);
    addContentSlide(pptx, input.brandName, 9, "08 · 위험", "핵심 위험과 통제", input.risk || "계약·인허가·고객 피해 가능성을 영업 시작 전에 점검합니다.", [
      "인허가 답변 전 계약금·인테리어·광고 집행 중지",
      "사고·분쟁 시 제공 중단, 기록, 신고, 고객안내 순서 확정",
      "보험 보장행위·면책·자기부담·한도 비교",
      "미확인 사실은 확정 표현 대신 검증 필요로 표시",
    ], accent);
    addContentSlide(pptx, input.brandName, 10, "09 · 협력 요청", "지금 필요한 협력", "소개 목적에 맞게 요청사항과 다음 행동을 구체적으로 바꾸세요.", [
      "고객: 첫 유료 테스트 참여와 사용 후 인터뷰",
      "파트너: 제공 범위·책임·정산이 적힌 협력 테스트",
      "전문가: 세무·인허가·보험의 고위험 항목 확인",
      "지원기관: 자격이 맞는 공고의 제출 서류와 일정 확인",
    ], accent);

    const output = await pptx.write({ outputType: "nodebuffer", compression: true });
    const body = output instanceof Uint8Array ? output : new Uint8Array(output as ArrayBuffer);
    const responseBody = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
    const filename = encodeURIComponent(`${input.brandName}-사업소개서-초안.pptx`);
    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "DECK_GENERATION_FAILED",
          message: error instanceof Error ? error.message : "사업소개서 파워포인트 파일(PPTX)을 만들지 못했습니다.",
        },
      },
      { status: 400 },
    );
  }
}
