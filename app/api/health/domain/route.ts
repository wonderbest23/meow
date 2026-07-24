import { NextResponse } from "next/server";
import { checkCloudflareSaasHealth } from "../../../../lib/landing/custom-domain";

export async function GET() {
  const health = await checkCloudflareSaasHealth();
  const response = NextResponse.json(health, { status: health.reachable ? 200 : 503 });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
