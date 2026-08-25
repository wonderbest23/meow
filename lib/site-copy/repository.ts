import { getServerSupabase } from "../persistence";
import { emptySiteCopy, sanitizeSiteCopy, siteCopySchema, type SiteCopy } from "./domain";

/*
 * 저장 구조는 운영 설정(platform_legal_settings)과 같다 — 단일 행 jsonb.
 * 표가 아직 없으면(마이그레이션 전) 조용히 기본값으로 돌아간다. 개발 환경에서는
 * 전역 메모리에 들고 있어 표 없이도 어드민 화면을 시험할 수 있다.
 */
declare global {
  var __ventureSiteCopy: SiteCopy | undefined;
}

function isMissingTable(error: { code?: string; message?: string } | null) {
  return error?.code === "42P01" || error?.code === "PGRST205" || Boolean(error?.message?.includes("site_copy"));
}

export async function getSiteCopy(): Promise<SiteCopy> {
  const supabase = getServerSupabase();
  if (!supabase) return globalThis.__ventureSiteCopy ?? emptySiteCopy;
  const { data, error } = await supabase.from("site_copy").select("data").eq("id", "home").maybeSingle();
  if (isMissingTable(error)) return globalThis.__ventureSiteCopy ?? emptySiteCopy;
  if (error) throw error;
  if (!data?.data) return emptySiteCopy;
  return sanitizeSiteCopy(siteCopySchema.parse(data.data));
}

export async function saveSiteCopy(input: SiteCopy): Promise<SiteCopy> {
  const parsed = sanitizeSiteCopy(siteCopySchema.parse(input));
  const supabase = getServerSupabase();
  if (!supabase) {
    globalThis.__ventureSiteCopy = structuredClone(parsed);
    return structuredClone(parsed);
  }
  const { error } = await supabase.from("site_copy").upsert({ id: "home", data: parsed, updated_at: new Date().toISOString() });
  if (isMissingTable(error)) {
    /* 표가 없으면: 개발은 메모리로 굴러가게(지원 채팅과 같은 규칙), 운영은 마이그레이션을 알려준다 */
    if (process.env.NODE_ENV !== "production") {
      globalThis.__ventureSiteCopy = structuredClone(parsed);
      return structuredClone(parsed);
    }
    throw new Error("site_copy 표가 아직 없습니다. supabase/migrations/0025_site_copy.sql 을 적용해 주세요.");
  }
  if (error) throw error;
  return parsed;
}
