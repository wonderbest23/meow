import type { MailOrderStatus, PlatformLegalSettings } from "./domain";

/*
 * 첫 화면 바닥글의 사업자 정보 — 서버(app/page.tsx)가 운영 설정에서 이 항목만 골라 화면에 넘긴다.
 * 바닥글은 처음 HTML 에 바로 그려져야 해서(늦게 불러오면 '불러오고 있어요'만 보인다) 화면이 따로 묻지 않는다.
 */
export type HomeFooterBusiness = {
  operatorName: string;
  representativeName: string;
  businessRegistrationNumber: string;
  mailOrderSalesNumber: string;
  mailOrderStatus: MailOrderStatus;
  internetDomainName: string;
  businessAddress: string;
  supportEmail: string;
  supportPhone: string;
  hostingProvider: string;
};

export function homeFooterBusiness(settings: PlatformLegalSettings): HomeFooterBusiness {
  return {
    operatorName: settings.operatorName,
    representativeName: settings.representativeName,
    businessRegistrationNumber: settings.businessRegistrationNumber,
    mailOrderSalesNumber: settings.mailOrderSalesNumber,
    mailOrderStatus: settings.mailOrderStatus,
    internetDomainName: settings.internetDomainName,
    businessAddress: settings.businessAddress,
    supportEmail: settings.supportEmail,
    supportPhone: settings.supportPhone,
    hostingProvider: settings.hostingProvider,
  };
}

/** 공정거래위원회 '사업자정보 확인' 창 — 사업자등록번호 숫자 10자리일 때만 주소를 만든다 */
export function ftcBusinessCheckUrl(businessRegistrationNumber: string): string | null {
  const digits = businessRegistrationNumber.replace(/\D/g, "");
  return digits.length === 10 ? `https://www.ftc.go.kr/bizCommPop.do?wrkr_no=${digits}` : null;
}
