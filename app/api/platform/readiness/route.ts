import { NextResponse } from "next/server";
import { paymentsEnabled } from "../../../../lib/payments/config";
import { tossConfigured } from "../../../../lib/payments/toss-client";
import { evaluatePlatformLaunchReadiness } from "../../../../lib/platform-legal/domain";
import { getPlatformLegalSettings } from "../../../../lib/platform-legal/repository";

export async function GET() {
  try {
    const settings = await getPlatformLegalSettings();
    const readiness = evaluatePlatformLaunchReadiness(settings, {
      authConfigured: Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      paymentsConfigured: paymentsEnabled() && tossConfigured(),
    });
    return NextResponse.json({
      readiness,
      business: {
        operatorName: settings.operatorName,
        representativeName: settings.representativeName,
        businessRegistrationNumber: settings.businessRegistrationNumber,
        mailOrderSalesNumber: settings.mailOrderSalesNumber,
        businessAddress: settings.businessAddress,
        supportEmail: settings.supportEmail,
        supportPhone: settings.supportPhone,
        hostingProvider: settings.hostingProvider,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ readiness: { ready: false, paymentAllowed: false, missing: ["운영 설정 확인"], warnings: [] } }, { status: 503 });
  }
}
