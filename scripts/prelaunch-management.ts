import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { PRELAUNCH_REF } from "./prelaunch-db-safety";

export function prelaunchManagement() {
  // Match Supabase CLI's named macOS credential, never enumerate the keychain.
  let token = process.env.SUPABASE_ACCESS_TOKEN?.trim() ?? "";
  if (!token) {
    try {
      token = execFileSync("/usr/bin/security", ["find-generic-password", "-s", "Supabase CLI", "-a", "supabase", "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch { throw new Error("Supabase CLI login is required"); }
    for (const [prefix, encoding] of [["go-keyring-base64:", "base64"], ["go-keyring-encoded:", "hex"]] as const) {
      if (token.startsWith(prefix)) { token = Buffer.from(token.slice(prefix.length), encoding).toString("utf8"); break; }
    }
  }
  assert(/^sbp_(oauth_)?[a-f0-9]{40}$/.test(token), "Unsupported Supabase CLI credential format");
  let requests = 0;
  return async function query(sql: string, readOnly = true): Promise<Array<Record<string, any>>> {
    assert(++requests <= 24, "Management request limit exceeded");
    const response = await fetch(`https://api.supabase.com/v1/projects/${PRELAUNCH_REF}/database/query`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql, read_only: readOnly }), redirect: "error", signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const message = (await response.text()).replaceAll(token, "[redacted]").slice(0, 1000);
      throw new Error(`Management SQL HTTP ${response.status}: ${message}`);
    }
    return response.json();
  };
}
