import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import JSZip from "jszip";
import { buildTwelveMonthForecast } from "../lib/delivery/financial-model";
import { buildFinancialWorkbook } from "../lib/delivery/financial-workbook";

const input = {
  brandName: "동네돌봄",
  businessTitle: "맞벌이 가정 긴급 돌봄 연결 서비스",
  priceWon: 110_000,
  variableCostPerUnit: 30_000,
  monthlyFixedCostWon: 700_000,
  targetMonthlyUnits: 30,
  initialInvestmentWon: 1_550_000,
  totalFundingNeedWon: 3_650_000,
  fundingUses: [
    { label: "초기 장비와 안전용품", amountWon: 450_000 },
    { label: "등록·보험 준비", amountWon: 250_000 },
    { label: "초기 홍보", amountWon: 350_000 },
  ],
  evidenceSources: [{
    title: "서울 열린데이터광장 공식 자료",
    status: "추가 확인 필요",
    url: "https://data.seoul.go.kr/",
    observedAt: "2026-07-15",
  }],
  startDate: "2026-08-01",
};

async function main() {
  const forecast = buildTwelveMonthForecast(input);
  assert.equal(forecast.months.length, 12);
  assert.equal(forecast.months[0].month, "2026년 8월");
  assert.equal(forecast.months[0].units, 11);
  assert.equal(forecast.months[0].netUnitPriceWon, 100_000);
  assert.equal(forecast.months[0].operatingProfitBeforeTaxWon, 70_000);
  assert.equal(forecast.annualGrossRevenueWon, 33_990_000);
  assert.equal(forecast.annualNetRevenueWon, 30_900_000);
  assert.equal(forecast.annualOperatingProfitBeforeTaxWon, 13_230_000);

  const workbook = await buildFinancialWorkbook(input);
  assert.ok(workbook.byteLength > 10_000, "엑셀 파일 크기가 지나치게 작습니다.");
  await writeFile("/tmp/today-startup-financial-test.xlsx", workbook);
  const zip = await JSZip.loadAsync(workbook);
  for (let index = 1; index <= 5; index += 1) {
    assert.ok(zip.file(`xl/worksheets/sheet${index}.xml`), `${index}번 시트가 없습니다.`);
  }
  const workbookXml = await zip.file("xl/workbook.xml")!.async("string");
  for (const sheetName of ["요약", "12개월 손익", "시나리오", "자금계획", "근거와 가정"]) {
    assert.ok(workbookXml.includes(`name="${sheetName}"`), `${sheetName} 시트명이 없습니다.`);
  }
  assert.ok(workbookXml.includes('fullCalcOnLoad="1"'));
  const monthlyXml = await zip.file("xl/worksheets/sheet2.xml")!.async("string");
  assert.ok(monthlyXml.includes("2026년 8월"));
  assert.ok(monthlyXml.includes("2027년 7월"));
  assert.ok(monthlyXml.includes("ROUND(&apos;요약&apos;!$B$8*0.35,0)"));
  assert.ok(monthlyXml.includes("SUM(J5:J16)"));
  const evidenceXml = await zip.file("xl/worksheets/sheet5.xml")!.async("string");
  assert.ok(evidenceXml.includes("서울 열린데이터광장 공식 자료"));
  const evidenceRels = await zip.file("xl/worksheets/_rels/sheet5.xml.rels")!.async("string");
  assert.ok(evidenceRels.includes("https://data.seoul.go.kr/"));

  console.log(JSON.stringify({
    ok: true,
    file: "/tmp/today-startup-financial-test.xlsx",
    sheets: 5,
    months: forecast.months.length,
    annualGrossRevenueWon: forecast.annualGrossRevenueWon,
    annualOperatingProfitBeforeTaxWon: forecast.annualOperatingProfitBeforeTaxWon,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
