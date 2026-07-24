import { NextResponse } from "next/server";
import { paymentsEnabled } from "../../../../lib/payments/config";
import { manualTransferPaymentConfigured } from "../../../../lib/payments/manual-transfer";
import { evaluatePlatformLaunchReadiness } from "../../../../lib/platform-legal/domain";
import { getPlatformLegalSettings } from "../../../../lib/platform-legal/repository";

export async function GET() {
  try {
    const settings = await getPlatformLegalSettings();
    const paymentsRequired = paymentsEnabled();
    const readiness = evaluatePlatformLaunchReadiness(settings, {
      authConfigured: Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      paymentsConfigured: paymentsRequired && manualTransferPaymentConfigured(),
    });
    return NextResponse.json({
      readiness,
      paymentsRequired,
      business: {
        operatorName: settings.operatorName,
        representativeName: settings.representativeName,
        businessRegistrationNumber: settings.businessRegistrationNumber,
        mailOrderStatus: settings.mailOrderStatus,
        mailOrderSalesNumber: settings.mailOrderSalesNumber,
        mailOrderExemptionReason: settings.mailOrderExemptionReason,
        internetDomainName: settings.internetDomainName,
        hostServerLocation: settings.hostServerLocation,
        businessAddress: settings.businessAddress,
        supportEmail: settings.supportEmail,
        supportPhone: settings.supportPhone,
        hostingProvider: settings.hostingProvider,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ readiness: { siteOpen: false, commerceReportReady: false, ready: false, paymentAllowed: false, missing: ["운영 설정 확인"], warnings: [] } }, { status: 503 });
  }
}
