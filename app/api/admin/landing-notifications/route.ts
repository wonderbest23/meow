import { NextResponse } from "next/server";
import { hasAdminSession } from "../../../../lib/support-chat/admin-auth";
import { drainLandingLeadNotifications } from "../../../../lib/landing/lead-notifications";

export async function POST() {
  if (!await hasAdminSession("support")) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    return NextResponse.json(await drainLandingLeadNotifications(10), { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "LANDING_NOTIFICATIONS_UNAVAILABLE" }, { status: 503 });
  }
}
