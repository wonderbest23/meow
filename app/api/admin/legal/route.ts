import { NextResponse } from "next/server";
import { paymentsEnabled } from "../../../../lib/payments/config";
import { manualTransferPaymentConfigured } from "../../../../lib/payments/manual-transfer";
import {
  evaluatePlatformLaunchReadiness,
  platformLegalSettingsSchema,
} from "../../../../lib/platform-legal/domain";
import {
  getPlatformLegalSettings,
  savePlatformLegalSettings,
} from "../../../../lib/platform-legal/repository";
import { hasAdminSession } from "../../../../lib/support-chat/admin-auth";

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

async function authorized() {
  if (await hasAdminSession()) return null;
  return privateJson({ error: { code: "ADMIN_AUTH_REQUIRED", message: "관리자 로그인이 필요합니다." } }, { status: 401 });
}

function readiness(settings: Awaited<ReturnType<typeof getPlatformLegalSettings>>) {
  return evaluatePlatformLaunchReadiness(settings, {
    authConfigured: Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    paymentsConfigured: paymentsEnabled() && manualTransferPaymentConfigured(),
  });
}

export async function GET() {
  const unauthorized = await authorized();
  if (unauthorized) return unauthorized;
  try {
    const settings = await getPlatformLegalSettings();
    return privateJson({ settings, readiness: readiness(settings) });
  } catch (error) {
    return privateJson({ error: { code: "LEGAL_SETTINGS_LOAD_FAILED", message: error instanceof Error ? error.message : "운영 설정을 불러오지 못했습니다." } }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const unauthorized = await authorized();
  if (unauthorized) return unauthorized;
  try {
    const settings = await savePlatformLegalSettings(platformLegalSettingsSchema.parse(await request.json()));
    return privateJson({ settings, readiness: readiness(settings) });
  } catch (error) {
    return privateJson({ error: { code: "LEGAL_SETTINGS_SAVE_FAILED", message: error instanceof Error ? error.message : "운영 설정을 저장하지 못했습니다." } }, { status: 400 });
  }
}
