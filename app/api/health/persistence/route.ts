import { NextResponse } from "next/server";
import { checkPersistenceHealth } from "../../../../lib/persistence";

export async function GET() {
  const health = await checkPersistenceHealth();
  return NextResponse.json(health, {
    status: health.status === "ready" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
