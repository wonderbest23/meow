import { createServerAuthClient } from "./account-auth";
import { hashIdentityToken, userProjectToken } from "./identity-tokens";
import { getServerSupabase } from "./persistence";

/**
 * 회원 탈퇴 — 개인정보처리방침의 기준을 그대로 따른다.
 *
 * 지우는 것: 로그인 계정, 플랜(답변·본문), 프로젝트, 상담 내역, 추천 선호.
 * 남기는 것: 결제·환불 기록 — 전자상거래법상 보존 의무가 있어 삭제할 수 없다.
 *   대신 계정 식별자(owner_id)를 끊어 사람과 연결되지 않게 분리한다.
 */
export interface AccountDeleteResult {
  deleted: { plans: number; projects: number; conversations: number; preferences: number };
  keptForLegalRetention: { paymentOrders: number; refundRequests: number };
}

export async function deleteAccount(userId: string): Promise<AccountDeleteResult> {
  const supabase = getServerSupabase();
  const ownerHash = hashIdentityToken(userProjectToken(userId));

  const result: AccountDeleteResult = {
    deleted: { plans: 0, projects: 0, conversations: 0, preferences: 0 },
    keptForLegalRetention: { paymentOrders: 0, refundRequests: 0 },
  };

  if (supabase) {
    // 1) 플랜 빌더 데이터
    const plans = await supabase.from("plan_states").delete({ count: "exact" }).eq("owner_hash", ownerHash);
    result.deleted.plans = plans.count ?? 0;

    // 2) 프로젝트(옛 서비스 산출물 포함)
    const projects = await supabase.from("projects").delete({ count: "exact" }).eq("owner_id", userId);
    result.deleted.projects = projects.count ?? 0;

    // 3) 1:1 상담 — 메시지는 대화 삭제 시 함께 정리된다(FK cascade). 아니면 먼저 지운다.
    const convos = await supabase.from("support_conversations").select("id").eq("guest_token_hash", ownerHash);
    const convoIds = (convos.data ?? []).map((row) => (row as { id: string }).id);
    if (convoIds.length) {
      await supabase.from("support_messages").delete().in("conversation_id", convoIds);
      const removed = await supabase.from("support_conversations").delete({ count: "exact" }).in("id", convoIds);
      result.deleted.conversations = removed.count ?? 0;
    }

    // 4) 추천 선호
    const prefs = await supabase.from("opportunity_preferences").delete({ count: "exact" }).eq("owner_id", userId);
    result.deleted.preferences = prefs.count ?? 0;

    /*
     * 5) 결제·환불 — 법정 보존 대상이라 지우지 않는다.
     *    소유자 연결만 끊어 남은 기록에서 사람을 식별할 수 없게 한다.
     */
    const orders = await supabase
      .from("payment_orders")
      .update({ owner_id: null, guest_token_hash: null }, { count: "exact" })
      .eq("owner_id", userId);
    result.keptForLegalRetention.paymentOrders = orders.count ?? 0;

    const refunds = await supabase
      .from("refund_requests")
      .update({ owner_id: "deleted", customer_email: "" }, { count: "exact" })
      .eq("owner_id", userId);
    result.keptForLegalRetention.refundRequests = refunds.count ?? 0;
  }

  // 6) 마지막으로 로그인 계정 자체를 삭제한다 — 실패하면 탈퇴가 완료된 게 아니다
  await createServerAuthClient().auth.admin.deleteUser(userId);

  return result;
}
