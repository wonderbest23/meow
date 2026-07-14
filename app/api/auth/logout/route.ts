import { NextResponse } from "next/server";
import { clearAccountSession } from "../../../../lib/account-auth";

export async function POST() {
  await clearAccountSession();
  return NextResponse.json({ authenticated: false });
}
