import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "venture_guest";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function requireGuestIdentity() {
  const cookieStore = await cookies();
  let token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) {
    token = randomBytes(32).toString("base64url");
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return { token, hash: hashToken(token) };
}
