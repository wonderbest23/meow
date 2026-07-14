import type { ProjectRecord } from "../service-domain";

export type TaxCalendarItem = {
  cycle: string;
  title: string;
  appliesWhen: string;
  prepare: string;
  officialUrl: string;
};

const officialUrls = {
  homeTax: "https://www.hometax.go.kr/",
  vat: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7694&mi=2402",
  income: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7664&mi=2224",
  withholding: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7701&mi=2289",
  corporation: "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7970&mi=6544",
};

export function buildTaxCalendar(project: ProjectRecord): TaxCalendarItem[] {
  const setup = project.businessSetup;
  const items: TaxCalendarItem[] = [
    {
      cycle: "매주 또는 매월",
      title: "매출·매입·사업용 지출 증빙 정리",
      appliesWhen: "모든 사업자",
      prepare: "사업용 계좌·카드, 세금계산서, 현금영수증, 계약서, 환불 내역을 개인 지출과 분리합니다.",
      officialUrl: officialUrls.homeTax,
    },
    {
      cycle: "1월·7월 중심",
      title: "부가가치세 확정신고 대상 확인",
      appliesWhen: "과세사업자. 일반과세자는 통상 반기별, 법인은 예정신고를 포함할 수 있으며 간이·면세 여부에 따라 달라집니다.",
      prepare: "매출·매입 세금계산서, 카드·현금영수증, 공제 제외 매입, 예정고지·조기환급 여부를 확인합니다.",
      officialUrl: officialUrls.vat,
    },
  ];

  if (setup?.legalForm === "corporation") {
    items.push({
      cycle: "사업연도 종료 후",
      title: "법인세 신고 준비",
      appliesWhen: "법인사업자",
      prepare: "결산서, 재무제표, 계정별 증빙, 가지급금·대표자 거래, 공제·감면 자료를 정리하고 홈택스 신고도움자료를 확인합니다.",
      officialUrl: officialUrls.corporation,
    });
  } else {
    items.push({
      cycle: "다음 해 5월",
      title: "종합소득세 신고 준비",
      appliesWhen: "개인사업자. 성실신고확인대상 등은 기한과 준비서류가 달라질 수 있습니다.",
      prepare: "사업소득 장부, 다른 소득, 인적·보험료·연금·기부금 공제 자료와 기납부세액을 확인합니다.",
      officialUrl: officialUrls.income,
    });
  }

  if ((setup?.employeeCount ?? 0) > 0) {
    items.push({
      cycle: "급여 지급 다음 달",
      title: "원천세 신고·납부와 급여 기록",
      appliesWhen: "직원·프리랜서 등 원천징수 대상 소득을 지급한 사업자",
      prepare: "지급대상, 소득 구분, 지급액, 원천징수액, 원천징수이행상황신고서와 지급명세서 일정을 확인합니다.",
      officialUrl: officialUrls.withholding,
    });
  } else {
    items.push({
      cycle: "사람에게 비용을 지급할 때",
      title: "원천징수 대상인지 먼저 확인",
      appliesWhen: "직원은 없지만 프리랜서·강사·작가 등에게 비용을 지급할 수 있는 사업자",
      prepare: "계약 형태만으로 판단하지 말고 실제 소득 종류와 원천징수·지급명세서 의무를 확인합니다.",
      officialUrl: officialUrls.withholding,
    });
  }

  items.push({
    cycle: "매 분기 말",
    title: "세금·현금 잔액 자체 점검",
    appliesWhen: "모든 사업자. 법정 신고를 새로 만드는 항목이 아니라 누락을 줄이기 위한 내부 점검입니다.",
    prepare: "누적 매출, 미수금, 부가세 예수금, 원천세, 카드대금, 대출 상환, 다음 3개월 고정비를 함께 확인합니다.",
    officialUrl: officialUrls.homeTax,
  });
  return items;
}

export function taxCalendarMarkdown(items: TaxCalendarItem[]) {
  return [
    "## 세금·증빙 일정표",
    "",
    "> 아래 일정은 누락 방지를 위한 안내입니다. 실제 적용 여부와 신고기한은 과세유형·사업연도·소득 지급 형태에 따라 달라지므로 홈택스 안내에서 최종 확인합니다.",
    "",
    "| 확인 시기 | 할 일 | 적용되는 경우 | 미리 준비할 자료 | 공식 확인 |",
    "| --- | --- | --- | --- | --- |",
    ...items.map((item) => `| ${item.cycle} | ${item.title} | ${item.appliesWhen} | ${item.prepare} | [국세청·홈택스](${item.officialUrl}) |`),
  ].join("\n");
}
