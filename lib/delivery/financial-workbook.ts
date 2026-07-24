import JSZip from "jszip";
import { buildFinancialScenarioRows, buildTwelveMonthForecast, monthlyRampFactors } from "./financial-model";

export type FinancialWorkbookSource = {
  title: string;
  status: string;
  url?: string;
  observedAt?: string;
};

export type FinancialWorkbookInput = {
  brandName: string;
  businessTitle: string;
  priceWon: number;
  variableCostPerUnit: number | null;
  monthlyFixedCostWon: number | null;
  targetMonthlyUnits: number | null;
  initialInvestmentWon: number | null;
  totalFundingNeedWon: number | null;
  fundingUses: Array<{ label: string; amountWon: number }>;
  evidenceSources: FinancialWorkbookSource[];
  startDate?: string;
};

const xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

function escapeXml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function inlineCell(reference: string, value: unknown, style = 0) {
  return `<c r="${reference}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function numberCell(reference: string, value: number, style = 0) {
  return `<c r="${reference}" s="${style}"><v>${Number.isFinite(value) ? value : 0}</v></c>`;
}

function formulaCell(reference: string, formula: string, cachedValue: number, style = 8) {
  return `<c r="${reference}" s="${style}"><f>${escapeXml(formula)}</f><v>${Number.isFinite(cachedValue) ? cachedValue : 0}</v></c>`;
}

function row(index: number, cells: string[], height?: number) {
  return `<row r="${index}"${height ? ` ht="${height}" customHeight="1"` : ""}>${cells.join("")}</row>`;
}

function sheetXml(options: {
  rows: string[];
  columns: Array<{ min: number; max?: number; width: number }>;
  mergeCells?: string[];
  autoFilter?: string;
  frozenRows?: number;
  hyperlinks?: Array<{ ref: string; relationshipId: string }>;
}) {
  const frozen = options.frozenRows
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${options.frozenRows}" topLeftCell="A${options.frozenRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const merges = options.mergeCells?.length
    ? `<mergeCells count="${options.mergeCells.length}">${options.mergeCells.map((ref) => `<mergeCell ref="${ref}"/>`).join("")}</mergeCells>`
    : "";
  const hyperlinks = options.hyperlinks?.length
    ? `<hyperlinks>${options.hyperlinks.map((link) => `<hyperlink ref="${link.ref}" r:id="${link.relationshipId}"/>`).join("")}</hyperlinks>`
    : "";
  return `${xmlHeader}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${frozen}<sheetFormatPr defaultRowHeight="18"/><cols>${options.columns.map((column) => `<col min="${column.min}" max="${column.max ?? column.min}" width="${column.width}" customWidth="1"/>`).join("")}</cols><sheetData>${options.rows.join("")}</sheetData>${options.autoFilter ? `<autoFilter ref="${options.autoFilter}"/>` : ""}${merges}${hyperlinks}<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.2" footer="0.2"/></worksheet>`;
}

function stylesXml() {
  return `${xmlHeader}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2"><numFmt numFmtId="164" formatCode="#\,##0\&quot;원\&quot;"/><numFmt numFmtId="165" formatCode="0%"/></numFmts>
  <fonts count="4"><font><sz val="10"/><name val="맑은 고딕"/></font><font><b/><sz val="20"/><color rgb="FF102E26"/><name val="맑은 고딕"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/></font><font><u/><sz val="10"/><color rgb="FF0563C1"/><name val="맑은 고딕"/></font></fonts>
  <fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0A8F6A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF6F1"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F5F4"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFD8E2DD"/></left><right style="thin"><color rgb="FFD8E2DD"/></right><top style="thin"><color rgb="FFD8E2DD"/></top><bottom style="thin"><color rgb="FFD8E2DD"/></bottom><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="11">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function summarySheet(input: FinancialWorkbookInput, forecast: ReturnType<typeof buildTwelveMonthForecast>) {
  const rows = [
    row(1, [inlineCell("A1", `${input.brandName} 12개월 손익 계획`, 1)], 34),
    row(2, [inlineCell("A2", `${input.businessTitle} · 입력값을 바꾸면 월별 손익이 자동 계산됩니다.`)]),
    row(4, [inlineCell("A4", "직접 바꿀 입력값", 2)]),
    row(5, [inlineCell("A5", "고객 판매가(부가세 포함)", 3), numberCell("B5", input.priceWon, 4), inlineCell("C5", "판매 1건의 고객 결제금액", 9)]),
    row(6, [inlineCell("A6", "건당 변동비", 3), numberCell("B6", input.variableCostPerUnit ?? 0, 4), inlineCell("C6", "재료·외주·결제수수료 등 판매할 때마다 드는 비용", 9)]),
    row(7, [inlineCell("A7", "월 고정비", 3), numberCell("B7", input.monthlyFixedCostWon ?? 0, 4), inlineCell("C7", "임차료·급여·소프트웨어 등 판매량과 무관한 월 비용", 9)]),
    row(8, [inlineCell("A8", "목표 월 판매량", 3), numberCell("B8", input.targetMonthlyUnits ?? 0, 7), inlineCell("C8", "안정화 이후 한 달 판매 목표", 9)]),
    row(9, [inlineCell("A9", "초기 투자비", 3), numberCell("B9", input.initialInvestmentWon ?? 0, 4), inlineCell("C9", "사업 시작 전 한 번 필요한 비용", 9)]),
    row(11, [inlineCell("A11", "12개월 계산 결과", 2)]),
    row(12, [inlineCell("A12", "연 매출(부가세 포함)", 3), formulaCell("B12", "SUM('12개월 손익'!E5:E16)", forecast.annualGrossRevenueWon)]),
    row(13, [inlineCell("A13", "연 순매출(부가세 제외)", 3), formulaCell("B13", "SUM('12개월 손익'!F5:F16)", forecast.annualNetRevenueWon)]),
    row(14, [inlineCell("A14", "연 영업손익(세전)", 3), formulaCell("B14", "SUM('12개월 손익'!J5:J16)", forecast.annualOperatingProfitBeforeTaxWon)]),
    row(15, [inlineCell("A15", "월 손익분기 시점", 3), inlineCell("B15", forecast.operatingBreakEvenMonth ?? "12개월 안에 미도달", 9)]),
    row(16, [inlineCell("A16", "초기비 회수 시점", 3), inlineCell("B16", forecast.capitalRecoveryMonth ?? "12개월 안에 미도달", 9)]),
    row(18, [inlineCell("A18", "사용 전 확인", 2)]),
    row(19, [inlineCell("A19", "이 파일은 입력값 기반 초안입니다. 실제 견적, 세금, 환불, 광고비와 인건비를 확인한 뒤 제출용 숫자를 확정하세요.", 9)]),
  ];
  return sheetXml({ rows, columns: [{ min: 1, width: 28 }, { min: 2, width: 22 }, { min: 3, width: 54 }], mergeCells: ["A1:C1", "A2:C2", "A4:C4", "A11:C11", "A18:C18", "A19:C19"] });
}

function monthlySheet(forecast: ReturnType<typeof buildTwelveMonthForecast>) {
  const rows = [
    row(1, [inlineCell("A1", "12개월 손익", 1)], 34),
    row(2, [inlineCell("A2", "초록색 입력 셀은 요약 시트에서 수정할 수 있습니다. 아래 계산식은 자동 반영됩니다.")]),
    row(4, ["월", "목표 판매량", "고객 판매가", "부가세 제외 단가", "매출", "순매출", "변동비", "공헌이익", "고정비", "영업손익(세전)", "누적 영업손익", "초기비 차감 누적"].map((title, index) => inlineCell(`${String.fromCharCode(65 + index)}4`, title, 6)), 28),
  ];
  forecast.months.forEach((month, index) => {
    const r = index + 5;
    const factor = monthlyRampFactors[index];
    rows.push(row(r, [
      inlineCell(`A${r}`, month.month, 3),
      formulaCell(`B${r}`, `ROUND('요약'!$B$8*${factor},0)`, month.units, 7),
      formulaCell(`C${r}`, "'요약'!$B$5", month.grossUnitPriceWon, 8),
      formulaCell(`D${r}`, `ROUND(C${r}/1.1,0)`, month.netUnitPriceWon, 8),
      formulaCell(`E${r}`, `B${r}*C${r}`, month.grossRevenueWon),
      formulaCell(`F${r}`, `B${r}*D${r}`, month.netRevenueWon),
      formulaCell(`G${r}`, `B${r}*'요약'!$B$6`, month.variableCostsWon),
      formulaCell(`H${r}`, `F${r}-G${r}`, month.contributionWon),
      formulaCell(`I${r}`, "'요약'!$B$7", month.fixedCostsWon),
      formulaCell(`J${r}`, `H${r}-I${r}`, month.operatingProfitBeforeTaxWon),
      formulaCell(`K${r}`, index === 0 ? `J${r}` : `K${r - 1}+J${r}`, month.cumulativeOperatingProfitWon),
      formulaCell(`L${r}`, `K${r}-'요약'!$B$9`, month.cumulativeCashAfterInitialInvestmentWon),
    ]));
  });
  rows.push(row(17, [inlineCell("A17", "합계", 2), formulaCell("E17", "SUM(E5:E16)", forecast.annualGrossRevenueWon), formulaCell("F17", "SUM(F5:F16)", forecast.annualNetRevenueWon), formulaCell("G17", "SUM(G5:G16)", forecast.months.reduce((sum, item) => sum + item.variableCostsWon, 0)), formulaCell("H17", "SUM(H5:H16)", forecast.months.reduce((sum, item) => sum + item.contributionWon, 0)), formulaCell("I17", "SUM(I5:I16)", forecast.months.reduce((sum, item) => sum + item.fixedCostsWon, 0)), formulaCell("J17", "SUM(J5:J16)", forecast.annualOperatingProfitBeforeTaxWon)]));
  return sheetXml({ rows, columns: [{ min: 1, width: 15 }, { min: 2, width: 14 }, { min: 3, max: 12, width: 17 }], mergeCells: ["A1:L1", "A2:L2"], autoFilter: "A4:L16", frozenRows: 4 });
}

function scenarioSheet(input: FinancialWorkbookInput) {
  const scenarios = buildFinancialScenarioRows(input);
  const rows = [
    row(1, [inlineCell("A1", "판매량별 시나리오", 1)], 34),
    row(2, [inlineCell("A2", "기준 판매량을 중심으로 보수적·기준·도전적 경우를 비교합니다.")]),
    row(4, ["구분", "기준 대비", "월 판매량", "월 순매출", "월 영업손익(세전)", "연환산 영업손익"].map((title, index) => inlineCell(`${String.fromCharCode(65 + index)}4`, title, 6)), 28),
    ...scenarios.map((scenario, index) => {
      const r = index + 5;
      return row(r, [
        inlineCell(`A${r}`, scenario.name, index === 1 ? 3 : 0),
        numberCell(`B${r}`, scenario.factor, 7),
        formulaCell(`C${r}`, `ROUND('요약'!$B$8*B${r},0)`, scenario.monthlyUnits, 7),
        formulaCell(`D${r}`, `C${r}*ROUND('요약'!$B$5/1.1,0)`, scenario.monthlyNetRevenueWon),
        formulaCell(`E${r}`, `D${r}-C${r}*'요약'!$B$6-'요약'!$B$7`, scenario.monthlyOperatingProfitBeforeTaxWon),
        formulaCell(`F${r}`, `E${r}*12`, scenario.monthlyOperatingProfitBeforeTaxWon * 12),
      ]);
    }),
    row(10, [inlineCell("A10", "주의", 2), inlineCell("B10", "판매량만 바꾼 단순 비교입니다. 가격, 광고비, 인력과 환불률이 달라지면 별도 시나리오를 추가하세요.", 9)]),
  ];
  return sheetXml({ rows, columns: [{ min: 1, width: 16 }, { min: 2, max: 3, width: 14 }, { min: 4, max: 6, width: 21 }], mergeCells: ["A1:F1", "A2:F2", "B10:F10"], frozenRows: 4 });
}

function fundingSheet(input: FinancialWorkbookInput) {
  const uses = input.fundingUses.filter((item) => item.amountWon > 0);
  const rows = [
    row(1, [inlineCell("A1", "자금 계획", 1)], 34),
    row(2, [inlineCell("A2", "초기비와 운전자금을 나누어 실제 견적에 맞게 수정하세요.")]),
    row(4, [inlineCell("A4", "자금 사용처", 6), inlineCell("B4", "금액", 6), inlineCell("C4", "확인 상태", 6)], 28),
    ...(uses.length ? uses : [{ label: "세부 사용처 입력 필요", amountWon: 0 }]).map((item, index) => row(index + 5, [inlineCell(`A${index + 5}`, item.label, 3), numberCell(`B${index + 5}`, item.amountWon, 5), inlineCell(`C${index + 5}`, "견적 확인 필요", 9)])),
  ];
  const totalRow = 5 + Math.max(uses.length, 1);
  rows.push(row(totalRow, [inlineCell(`A${totalRow}`, "사용처 합계", 2), formulaCell(`B${totalRow}`, `SUM(B5:B${totalRow - 1})`, uses.reduce((sum, item) => sum + item.amountWon, 0))]));
  rows.push(row(totalRow + 2, [inlineCell(`A${totalRow + 2}`, "전체 필요자금", 3), numberCell(`B${totalRow + 2}`, input.totalFundingNeedWon ?? 0, 5), inlineCell(`C${totalRow + 2}`, "초기비 + 운전자금", 9)]));
  return sheetXml({ rows, columns: [{ min: 1, width: 34 }, { min: 2, width: 22 }, { min: 3, width: 30 }], mergeCells: ["A1:C1", "A2:C2"], frozenRows: 4 });
}

function evidenceSheet(input: FinancialWorkbookInput) {
  const sources = input.evidenceSources.length ? input.evidenceSources : [{ title: "연결된 공식 시장 근거 없음", status: "추가 확인 필요", url: "", observedAt: "" }];
  const hyperlinks: Array<{ ref: string; relationshipId: string }> = [];
  const relationships: Array<{ id: string; url: string }> = [];
  const rows = [
    row(1, [inlineCell("A1", "근거와 가정", 1)], 34),
    row(2, [inlineCell("A2", "출처가 있는 숫자와 사용자 입력·계산값을 구분해 확인하세요.")]),
    row(4, ["자료", "상태", "기준일", "원문 주소"].map((title, index) => inlineCell(`${String.fromCharCode(65 + index)}4`, title, 6)), 28),
    ...sources.map((source, index) => {
      const r = index + 5;
      if (source.url) {
        const relationshipId = `rId${relationships.length + 1}`;
        hyperlinks.push({ ref: `D${r}`, relationshipId });
        relationships.push({ id: relationshipId, url: source.url });
      }
      return row(r, [inlineCell(`A${r}`, source.title, 3), inlineCell(`B${r}`, source.status, 9), inlineCell(`C${r}`, source.observedAt ?? "확인 필요", 9), inlineCell(`D${r}`, source.url || "원문 연결 필요", source.url ? 10 : 9)]);
    }),
    row(sources.length + 7, [inlineCell(`A${sources.length + 7}`, "공통 가정", 2)]),
    row(sources.length + 8, [inlineCell(`A${sources.length + 8}`, "판매가는 부가세 포함, 순매출은 판매가 ÷ 1.1로 계산했습니다. 법인세·소득세, 대출 원금, 대표자 인출금은 영업손익에 포함하지 않았습니다.", 9)]),
  ];
  const xml = sheetXml({ rows, columns: [{ min: 1, width: 44 }, { min: 2, width: 22 }, { min: 3, width: 16 }, { min: 4, width: 58 }], mergeCells: ["A1:D1", "A2:D2", `A${sources.length + 7}:D${sources.length + 7}`, `A${sources.length + 8}:D${sources.length + 8}`], autoFilter: `A4:D${sources.length + 4}`, frozenRows: 4, hyperlinks });
  const rels = relationships.length ? `${xmlHeader}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.map((item) => `<Relationship Id="${item.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(item.url)}" TargetMode="External"/>`).join("")}</Relationships>` : null;
  return { xml, rels };
}

export async function buildFinancialWorkbook(input: FinancialWorkbookInput) {
  const forecast = buildTwelveMonthForecast({
    priceWon: input.priceWon,
    variableCostPerUnit: input.variableCostPerUnit,
    monthlyFixedCostWon: input.monthlyFixedCostWon,
    targetMonthlyUnits: input.targetMonthlyUnits,
    initialInvestmentWon: input.initialInvestmentWon,
    startDate: input.startDate,
  });
  const evidence = evidenceSheet(input);
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `${xmlHeader}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${[1, 2, 3, 4, 5].map((index) => `<Override PartName="/xl/worksheets/sheet${index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file("_rels/.rels", `${xmlHeader}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file("docProps/core.xml", `${xmlHeader}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${escapeXml(input.brandName)} 12개월 손익 계획</dc:title><dc:creator>오늘창업</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`);
  zip.file("docProps/app.xml", `${xmlHeader}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>오늘창업</Application><TitlesOfParts><vt:vector size="5" baseType="lpstr">${["요약", "12개월 손익", "시나리오", "자금계획", "근거와 가정"].map((name) => `<vt:lpstr>${name}</vt:lpstr>`).join("")}</vt:vector></TitlesOfParts></Properties>`);
  zip.file("xl/workbook.xml", `${xmlHeader}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${["요약", "12개월 손익", "시나리오", "자금계획", "근거와 가정"].map((name, index) => `<sheet name="${name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets><calcPr calcId="191029" calcMode="auto" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `${xmlHeader}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${[1, 2, 3, 4, 5].map((index) => `<Relationship Id="rId${index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index}.xml"/>`).join("")}<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml", stylesXml());
  zip.file("xl/worksheets/sheet1.xml", summarySheet(input, forecast));
  zip.file("xl/worksheets/sheet2.xml", monthlySheet(forecast));
  zip.file("xl/worksheets/sheet3.xml", scenarioSheet(input));
  zip.file("xl/worksheets/sheet4.xml", fundingSheet(input));
  zip.file("xl/worksheets/sheet5.xml", evidence.xml);
  if (evidence.rels) zip.file("xl/worksheets/_rels/sheet5.xml.rels", evidence.rels);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
