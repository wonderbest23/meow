import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getAuthenticatedUser } from "./account-auth";
import { GUEST_COOKIE, hashIdentityToken, userProjectToken } from "./identity-tokens";

export async function requireGuestIdentity() {
  const user = await getAuthenticatedUser();
  if (user) {
    const token = userProjectToken(user.id);
    return { token, hash: hashIdentityToken(token), userId: user.id, email: user.email ?? null };
  }
  const cookieStore = await cookies();
  let token = cookieStore.get(GUEST_COOKIE)?.value;
  if (!token) {
    token = randomBytes(32).toString("base64url");
    cookieStore.set(GUEST_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return { token, hash: hashIdentityToken(token), userId: null, email: null };
}

export async function requireAuthenticatedIdentity() {
  const user = await getAuthenticatedUser();
  if (!user) throw new Error("ACCOUNT_LOGIN_REQUIRED");
  const token = userProjectToken(user.id);
  return { token, hash: hashIdentityToken(token), userId: user.id, email: user.email ?? null };
}
