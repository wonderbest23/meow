import { NextResponse } from "next/server";
import { z } from "zod";
import { searchWork24Careers } from "../../../../lib/careers/work24";

const querySchema = z.string().trim().min(1).max(50);

export async function GET(request: Request) {
  try {
    const query = querySchema.parse(new URL(request.url).searchParams.get("q") ?? "");
    return NextResponse.json(await searchWork24Careers(query));
  } catch (error) {
    const message = error instanceof Error ? error.message : "직업 검색어가 올바르지 않습니다.";
    return NextResponse.json({ error: { code: "CAREER_SEARCH_INVALID", message } }, { status: 400 });
  }
}
