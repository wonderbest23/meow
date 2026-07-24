import { syncGeneratedLanding } from "../lib/draft-package/runner";
import { getLandingForProject } from "../lib/landing/repository";
import { getServerSupabase } from "../lib/persistence";
import type { ProjectRefinementVersion } from "../lib/draft-package/domain";

async function main() {
  const supabase = getServerSupabase();
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");

  const { data: row, error } = await supabase
    .from("projects")
    .select("id, guest_token_hash, metadata")
    .eq("title", "소규모 매장 예약 확인 도우미")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;

  const metadata = (row.metadata ?? {}) as { refinementHistory?: ProjectRefinementVersion[] };
  const latest = metadata.refinementHistory?.at(-1);
  if (!latest) throw new Error("REFINEMENT_HISTORY_NOT_FOUND");

  const sync = await syncGeneratedLanding({
    projectId: row.id,
    guestTokenHash: row.guest_token_hash,
    runId: "landing-fix-verification",
    force: true,
    refinement: latest.input,
  });
  const site = await getLandingForProject(row.id, row.guest_token_hash);
  const passed = site?.draft.businessName === latest.input.brandName;
  console.log(JSON.stringify({
    passed,
    projectId: row.id,
    expected: latest.input.brandName,
    actual: site?.draft.businessName,
    syncStatus: sync.status,
    landingVersion: site?.publishedVersion,
  }, null, 2));
  if (!passed) process.exitCode = 1;
}

void main();
