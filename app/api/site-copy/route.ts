import { NextResponse } from "next/server";
import { getSiteCopy } from "../../../lib/site-copy/repository";

export const runtime = "nodejs";

/** 홈이 읽는 공개 문구 오버라이드 — 실패해도 홈은 기본 문구로 뜬다 */
export async function GET() {
  try {
    const copy = await getSiteCopy();
    const response = NextResponse.json(copy);
    response.headers.set("Cache-Control", "public, max-age=60");
    return response;
  } catch {
    return NextResponse.json({ texts: {}, hidden: [] });
  }
}
