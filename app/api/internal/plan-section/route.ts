import "server-only";
import { handlePlanSectionServiceRequest } from "../../../../lib/plan-builder/section-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return await handlePlanSectionServiceRequest(request, {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  }) ?? Response.json({ error: "NOT_FOUND" }, { status: 404 });
}
