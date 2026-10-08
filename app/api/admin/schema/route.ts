import { getServerSupabase } from "../../../../lib/persistence";
import { checkSchemaReadiness } from "../../../../lib/schema-readiness";
import { hasAdminSession } from "../../../../lib/support-chat/admin-auth";

/*
 * DB 준비 상태 — 운영 DB에 빠진 마이그레이션을 파일 이름으로 알려 준다(lib/schema-readiness.ts).
 * 읽기만 한다. 관리자만 본다(테이블 이름이 밖으로 나가지 않게).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET() {
  if (!(await hasAdminSession("support"))) return json({ error: { code: "ADMIN_AUTH_REQUIRED", message: "관리자 로그인이 필요합니다." } }, 401);
  let db: ReturnType<typeof getServerSupabase>;
  try { db = getServerSupabase(); } catch { return json({ error: { code: "DB_MISCONFIGURED", message: "DB 연결 설정을 확인해 주세요." } }, 503); }
  return json(await checkSchemaReadiness(db));
}
