import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/support-chat/admin-auth";
import { siteCopySchema } from "../../../../lib/site-copy/domain";
import { getSiteCopy, saveSiteCopy } from "../../../../lib/site-copy/repository";

export const runtime = "nodejs";

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

async function guard() {
  if (await hasAdminSession("support")) return null;
  return privateJson({ error: { code: "ADMIN_AUTH_REQUIRED", message: "관리자 로그인이 필요합니다." } }, { status: 401 });
}

export async function GET() {
  const denied = await guard();
  if (denied) return denied;
  try {
    return privateJson({ copy: await getSiteCopy() });
  } catch (error) {
    return privateJson({ error: { code: "SITE_COPY_LOAD_FAILED", message: error instanceof Error ? error.message : "불러오지 못했습니다." } }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const denied = await guard();
  if (denied) return denied;
  try {
    const copy = await saveSiteCopy(siteCopySchema.parse(await request.json()));
    return privateJson({ copy });
  } catch (error) {
    return privateJson({ error: { code: "SITE_COPY_SAVE_FAILED", message: error instanceof Error ? error.message : "저장하지 못했습니다." } }, { status: 400 });
  }
}
