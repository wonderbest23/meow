import { NextResponse } from "next/server";
import { z } from "zod";
import { buildFinancialWorkbook } from "../../../../lib/delivery/financial-workbook";
import { enforceRateLimit } from "../../../../lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  brandName: z.string().trim().min(1).max(80),
  businessTitle: z.string().trim().min(1).max(160),
  priceWon: z.number().min(0).max(10_000_000_000),
  variableCostPerUnit: z.number().min(0).max(100_000_000_000).nullable().default(null),
  monthlyFixedCostWon: z.number().min(0).max(100_000_000_000).nullable().default(null),
  targetMonthlyUnits: z.number().min(0).max(100_000_000).nullable().default(null),
  initialInvestmentWon: z.number().min(0).max(100_000_000_000_000).nullable().default(null),
  totalFundingNeedWon: z.number().min(0).max(100_000_000_000_000).nullable().default(null),
  fundingUses: z.array(z.object({
    label: z.string().trim().min(1).max(100),
    amountWon: z.number().min(0).max(100_000_000_000_000),
  })).max(30).default([]),
  evidenceSources: z.array(z.object({
    title: z.string().trim().min(1).max(180),
    status: z.string().trim().max(80).default("확인 필요"),
    url: z.string().url().optional(),
    observedAt: z.string().max(40).optional(),
  })).max(30).default([]),
  startDate: z.string().date().optional(),
});

function fileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-").slice(0, 70) || "오늘창업";
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit("delivery-financial-workbook", request, {
    limit: 20,
    windowMs: 5 * 60_000,
    message: "손익 엑셀 생성 요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.",
  });
  if (limited) return limited;
  try {
    const input = requestSchema.parse(await request.json());
    const workbook = await buildFinancialWorkbook(input);
    const name = `${fileName(input.brandName)}-12개월-손익계획.xlsx`;
    return new NextResponse(Uint8Array.from(workbook).buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store, max-age=0",
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "손익 엑셀을 만들지 못했습니다.";
    return NextResponse.json(
      { error: { code: "FINANCIAL_WORKBOOK_FAILED", message: "12개월 손익 엑셀을 만들지 못했습니다.", detail } },
      { status: 400 },
    );
  }
}
