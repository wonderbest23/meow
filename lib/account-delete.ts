import { createServerAuthClient } from "./account-auth";
import { hashIdentityToken, userProjectToken } from "./identity-tokens";
import { getServerSupabase } from "./persistence";
import { disconnectProjectDomains } from "./plan-builder/plan-homepage-cleanup";

/**
 * 회원 탈퇴 — 개인정보처리방침의 기준을 그대로 따른다.
 *
 * 지우는 것: 로그인 계정, 플랜(답변·본문), 프로젝트, 상담 내역, 추천 선호.
 * 남기는 것: 결제·환불 기록 — 전자상거래법상 보존 의무가 있어 삭제할 수 없다.
 *   대신 계정 식별자(owner_id)를 끊어 사람과 연결되지 않게 분리한다.
 */
export interface AccountDeleteResult {
  deleted: { plans: number; projects: number; conversations: number; preferences: number; consultSessions?: number; serviceRequests?: number; businessChecks?: number };
  keptForLegalRetention: { paymentOrders: number; refundRequests: number };
}

/** 표가 없다는 오류 코드 — 그 표에는 지울 것이 없다 */
const MISSING_TABLE = new Set(["PGRST205", "42P01"]);

export async function deleteAccount(userId: string): Promise<AccountDeleteResult> {
  const supabase = getServerSupabase();
  const ownerHash = hashIdentityToken(userProjectToken(userId));

  const result: AccountDeleteResult = {
    deleted: { plans: 0, projects: 0, conversations: 0, preferences: 0 },
    keptForLegalRetention: { paymentOrders: 0, refundRequests: 0 },
  };

  /*
   * 지우다 실패하면 던진다 — 예전엔 오류를 보지 않고 count ?? 0 으로 넘어가 사업·홈페이지(손님 연락처)가 남았는데도
   * '탈퇴 완료'라고 답했다. 표 자체가 없을 때(아직 적용 안 한 마이그레이션)만 지울 것이 없는 것으로 본다.
   */
  const checked = <T extends { error: { code?: string; message?: string } | null; count?: number | null }>(response: T, table: string): T => {
    if (response.error && !MISSING_TABLE.has(response.error.code ?? "")) {
      throw Object.assign(new Error(`ACCOUNT_DELETE_FAILED:${table}`), { cause: response.error });
    }
    return response;
  };

  if (supabase) {
    // 1) 플랜 빌더 데이터
    const plans = checked(await supabase.from("plan_states").delete({ count: "exact" }).eq("owner_hash", ownerHash), "plan_states");
    result.deleted.plans = plans.count ?? 0;

    // 2) 프로젝트(옛 서비스 산출물 포함) — 연결한 내 도메인은 Cloudflare 쪽부터 끊는다(행을 지우면 주소를 모른다)
    const owned = checked(await supabase.from("projects").select("id").eq("owner_id", userId), "projects");
    await disconnectProjectDomains((owned.data ?? []).map((row) => (row as { id: string }).id)).catch((error) => console.error("[account-delete] domain disconnect failed", error));
    const projects = checked(await supabase.from("projects").delete({ count: "exact" }).eq("owner_id", userId), "projects");
    result.deleted.projects = projects.count ?? 0;

    // 3) 1:1 상담 — 메시지는 대화 삭제 시 함께 정리된다(FK cascade). 아니면 먼저 지운다.
    const convos = checked(await supabase.from("support_conversations").select("id").eq("guest_token_hash", ownerHash), "support_conversations");
    const convoIds = (convos.data ?? []).map((row) => (row as { id: string }).id);
    if (convoIds.length) {
      checked(await supabase.from("support_messages").delete().in("conversation_id", convoIds), "support_messages");
      const removed = checked(await supabase.from("support_conversations").delete({ count: "exact" }).in("id", convoIds), "support_conversations");
      result.deleted.conversations = removed.count ?? 0;
    }

    // 3-2) 무료 상담 대화·'다음 단계' 서비스 신청(전화·메모)·사업자 확인 — 예전엔 남았다(표가 없으면 건너뜀)
    const optionalDelete = async (table: string, column: string, value: string) =>
      checked(await supabase.from(table).delete({ count: "exact" }).eq(column, value), table).count ?? 0;
    result.deleted.consultSessions = await optionalDelete("consult_sessions", "owner_hash", ownerHash);
    result.deleted.serviceRequests = await optionalDelete("service_requests", "owner_id", userId);
    result.deleted.businessChecks = await optionalDelete("business_checks", "owner_id", userId);

    // 4) 추천 선호
    const prefs = checked(await supabase.from("opportunity_preferences").delete({ count: "exact" }).eq("owner_id", userId), "opportunity_preferences");
    result.deleted.preferences = prefs.count ?? 0;

    /*
     * 5) 결제·환불 — 법정 보존 대상이라 지우지 않는다.
     *    소유자 연결만 끊어 남은 기록에서 사람을 식별할 수 없게 한다.
     */
    /*
     *    guest_token_hash 는 not null 이라 null 로 바꾸면 update 가 통째로 실패했다(에러를 안 봐서 몰랐다) —
     *    'deleted' 로 바꾸고, 보존 대상이 아닌 개인 정보(결제 안내 휴대폰·도메인 명의자·이메일)는 지운다.
     *    금액·상품·일시·주문번호는 남는다(전자상거래법 대금결제 기록).
     */
    const paidOrders = await supabase.from("payment_orders").select("order_id, opportunity").eq("owner_id", userId);
    if (paidOrders.error) throw paidOrders.error;
    let kept = 0;
    for (const row of paidOrders.data ?? []) {
      const opportunity = { ...((row.opportunity ?? {}) as Record<string, unknown>) };
      delete opportunity.noticePhone;
      if (opportunity.domainRequest && typeof opportunity.domainRequest === "object") {
        const { registrant: _registrant, ...rest } = opportunity.domainRequest as Record<string, unknown>;
        opportunity.domainRequest = rest;
      }
      const updated = await supabase.from("payment_orders")
        .update({ owner_id: null, guest_token_hash: "deleted", customer_email: null, opportunity })
        .eq("order_id", row.order_id as string);
      if (updated.error) throw updated.error;
      kept++;
    }
    result.keptForLegalRetention.paymentOrders = kept;

    const refunds = checked(await supabase
      .from("refund_requests")
      .update({ owner_id: "deleted", customer_email: "" }, { count: "exact" })
      .eq("owner_id", userId), "refund_requests");
    result.keptForLegalRetention.refundRequests = refunds.count ?? 0;
  }

  // 6) 마지막으로 로그인 계정 자체를 삭제한다 — 실패하면 탈퇴가 완료된 게 아니다(오류를 돌려줄 뿐 던지지 않으므로 직접 본다).
  //    이미 지워진 계정(다시 시도)은 완료로 본다.
  const removedUser = await createServerAuthClient().auth.admin.deleteUser(userId);
  if (removedUser.error && removedUser.error.status !== 404) {
    throw Object.assign(new Error("ACCOUNT_DELETE_FAILED:auth_user"), { cause: removedUser.error });
  }

  return result;
}
