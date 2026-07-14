import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const writer = createClient(url, key, options);
const reader = createClient(url, key, options);
const marker = `persistence-smoke-${Date.now()}`;
const guestTokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
let projectId;

try {
  const { data: created, error: createError } = await writer
    .from("projects")
    .insert({
      title: marker,
      opportunity: { title: marker, problem: "persistence verification" },
      founder_profile: { source: "persistence-smoke" },
      payment_status: "test_paid",
      guest_token_hash: guestTokenHash,
      status: "active",
    })
    .select("id, title, guest_token_hash")
    .single();
  if (createError) throw createError;
  projectId = created.id;

  const { data: recovered, error: readError } = await reader
    .from("projects")
    .select("id, title, guest_token_hash")
    .eq("id", projectId)
    .eq("guest_token_hash", guestTokenHash)
    .single();
  if (readError) throw readError;
  if (recovered.title !== marker) throw new Error("Recovered project did not match the write marker.");

  console.log(JSON.stringify({ passed: true, mode: "supabase", recovered: true }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (projectId) {
    const { error: cleanupError } = await writer.from("projects").delete().eq("id", projectId);
    if (cleanupError) {
      console.error(`Cleanup failed for ${projectId}: ${cleanupError.message}`);
      process.exitCode = 1;
    }
  }
}
