import { getServerSupabase } from "../persistence";
import { cloudflareSaasConfigured, deleteLandingDomainConnection } from "../landing/custom-domain";

/*
 * 사업을 지우면 그 사업으로 만든 홈페이지도 지운다.
 *
 * 화면은 "대화와 작성한 자료도 함께 삭제됩니다"라고 묻는데, 예전엔 계획서(plan_states)만 지워
 * 홈페이지는 공개된 채 남아 손님 연락처를 계속 받고 주간 리포트도 나갔다.
 * 홈페이지는 계획서와 따로 projects 행(opportunity.planId)에 붙어 있고, 사이트·버전·문의는
 * projects 삭제에 함께 지워진다(on delete cascade). 연결한 도메인은 Cloudflare 쪽도 먼저 끊는다.
 *
 * 결제 기록은 지우지 않는다(법정 보존) — payment_orders 는 planId 로만 이어져 있어 영향이 없다.
 */
export async function deletePlanHomepage(ownerHash: string, planId: string): Promise<void> {
  const supabase = getServerSupabase();
  if (!supabase) return;
  const projects = await supabase.from("projects").select("id").eq("guest_token_hash", ownerHash).eq("opportunity->>planId", planId);
  if (projects.error) throw projects.error;
  const ids = (projects.data ?? []).map(row => row.id as string);
  if (!ids.length) return;
  await disconnectProjectDomains(ids);
  const removed = await supabase.from("projects").delete().in("id", ids);
  if (!removed.error) return;
  // 지울 수 없으면(다른 기록이 참조 등) 적어도 손님에게서 내린다
  console.error("[plan-delete] project delete failed, unpublishing instead", removed.error);
  const hidden = await supabase.from("landing_sites").update({ status: "unpublished", custom_domain: null }).in("project_id", ids);
  if (hidden.error) throw hidden.error;
}

/** 프로젝트들의 사이트에 연결된 내 도메인을 Cloudflare 에서 끊는다 — 행을 지우기 전에(지우면 주소를 모른다) */
export async function disconnectProjectDomains(projectIds: string[]): Promise<void> {
  const supabase = getServerSupabase();
  if (!supabase || !projectIds.length || !cloudflareSaasConfigured()) return;
  const sites = await supabase.from("landing_sites").select("custom_domain").in("project_id", projectIds).not("custom_domain", "is", null);
  if (sites.error) throw sites.error;
  for (const site of sites.data ?? []) {
    const hostname = site.custom_domain as string | null;
    if (hostname) await deleteLandingDomainConnection(hostname).catch(error => console.error("[plan-delete] domain disconnect failed", hostname, error));
  }
}
