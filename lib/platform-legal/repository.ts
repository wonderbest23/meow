import { getServerSupabase } from "../persistence";
import {
  defaultPlatformLegalSettings,
  platformLegalSettingsSchema,
  type PlatformLegalSettings,
} from "./domain";

declare global {
  var __venturePlatformLegalSettings: PlatformLegalSettings | undefined;
}

function envSettings(): PlatformLegalSettings {
  const base = { ...defaultPlatformLegalSettings };
  const values: Partial<Record<keyof PlatformLegalSettings, string>> = {
    operatorName: process.env.PLATFORM_OPERATOR_NAME,
    representativeName: process.env.PLATFORM_REPRESENTATIVE_NAME,
    businessRegistrationNumber: process.env.PLATFORM_BUSINESS_NUMBER,
    mailOrderSalesNumber: process.env.PLATFORM_MAIL_ORDER_NUMBER,
    businessAddress: process.env.PLATFORM_BUSINESS_ADDRESS,
    supportEmail: process.env.PLATFORM_SUPPORT_EMAIL,
    supportPhone: process.env.PLATFORM_SUPPORT_PHONE,
    privacyOfficer: process.env.PLATFORM_PRIVACY_OFFICER,
    privacyEmail: process.env.PLATFORM_PRIVACY_EMAIL,
    infrastructureCountries: process.env.INFRASTRUCTURE_PROCESSING_COUNTRIES,
    overseasCountries: process.env.OPENAI_PROCESSING_COUNTRIES,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value?.trim()) (base as Record<string, unknown>)[key] = value.trim();
  }
  return base;
}

function isMissingTable(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || error?.message?.includes("platform_legal_settings");
}

export async function getPlatformLegalSettings(): Promise<PlatformLegalSettings> {
  const supabase = getServerSupabase();
  if (!supabase) return globalThis.__venturePlatformLegalSettings ?? envSettings();
  const { data, error } = await supabase
    .from("platform_legal_settings")
    .select("settings")
    .eq("id", "primary")
    .maybeSingle();
  if (isMissingTable(error)) return envSettings();
  if (error) throw error;
  if (!data?.settings) return envSettings();
  return platformLegalSettingsSchema.parse({ ...envSettings(), ...(data.settings as Record<string, unknown>) });
}

export async function savePlatformLegalSettings(settings: PlatformLegalSettings): Promise<PlatformLegalSettings> {
  const parsed = platformLegalSettingsSchema.parse(settings);
  const supabase = getServerSupabase();
  if (!supabase) {
    globalThis.__venturePlatformLegalSettings = structuredClone(parsed);
    return structuredClone(parsed);
  }
  const { error } = await supabase.from("platform_legal_settings").upsert({
    id: "primary",
    settings: parsed,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return parsed;
}
