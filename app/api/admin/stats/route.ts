import { NextResponse } from "next/server";
import { getServerSupabase } from "../../../../lib/persistence";
import { countPendingRefundRequests } from "../../../../lib/payments/refund-requests";
import { loadRevenueSummary, type RevenueSummary } from "../../../../lib/payments/revenue-stats";
import { listAdminConversationRecords } from "../../../../lib/support-chat/repository";
import { resolveSupportCustomers } from "../../../../lib/support-chat/admin-customers";
import { hasAdminSession } from "../../../../lib/support-chat/admin-auth";

export const runtime = "nodejs";

// 어드민 대시보드 지표 — 이용자·결제·환불·문의·API 사용량을 한 번에 내려준다.

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// '오늘'은 한국 시간 0시부터 — 서버(Cloudflare)는 UTC라 setHours(0)이면 오전 9시가 경계가 된다.
// ai-cost 라우트와 같은 방식으로 KST 자정을 구한다.
function todayStartIso() {
  const kst = new Date(Date.now() + 9 * 60 * 60_000);
  kst.setUTCHours(0, 0, 0, 0);
  return new Date(kst.getTime() - 9 * 60 * 60_000).toISOString();
}

export async function GET() {
  if (!(await hasAdminSession("support"))) {
    return privateJson({ error: { code: "ADMIN_AUTH_REQUIRED", message: "관리자 로그인이 필요해요." } }, { status: 401 });
  }

  const supabase = getServerSupabase();
  const todayStart = todayStartIso();
  const weekAgo = daysAgoIso(7);

  // 이용자 — 플랜 데이터를 가진 계정 수 (plan_states 1행 = 계정 1개)
  let usersTotal: number | null = null;
  let usersActive7d: number | null = null;
  if (supabase) {
    const total = await supabase.from("plan_states").select("owner_hash", { count: "exact", head: true });
    usersTotal = total.count ?? null;
    const active = await supabase
      .from("plan_states")
      .select("owner_hash", { count: "exact", head: true })
      .gte("updated_at", weekAgo);
    usersActive7d = active.count ?? null;
  }

  // 결제 — 완료(done) 주문 수, 순매출(환불을 뺀 금액)과 매출·환불 나눠 보기, 환불 완료 수
  let paidCount: number | null = null;
  let paidAmount: number | null = null;
  let paid7d: number | null = null;
  let refundCount: number | null = null;
  let revenue: RevenueSummary | null = null;
  let recentOrders: Array<{ orderId: string; orderName: string; amount: number; status: string; method: string; createdAt: string }> | null = [];
  if (supabase) {
    const paid = await supabase
      .from("payment_orders")
      .select("order_id", { count: "exact", head: true })
      .eq("status", "done");
    paidCount = paid.count ?? null;
    // 매출·환불·순매출 — 웹 결제 환불(요청 처리 메모 금액)과 앱 결제 환불(스토어 알림으로 refunded)을 모두 뺀다(lib/payments/revenue-stats.ts)
    revenue = await loadRevenueSummary(supabase).catch(() => null);
    paidAmount = revenue?.net ?? null;
    const paidRecent = await supabase
      .from("payment_orders")
      .select("order_id", { count: "exact", head: true })
      .eq("status", "done")
      .gte("created_at", weekAgo);
    paid7d = paidRecent.count ?? null;
    const refunded = await supabase
      .from("payment_orders")
      .select("order_id", { count: "exact", head: true })
      .eq("status", "refunded");
    refundCount = refunded.count ?? null;
    const recent = await supabase
      .from("payment_orders")
      .select("order_id, order_name, amount, status, method, created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    // 못 읽었으면 '주문 없음'이 아니라 모름(null)
    recentOrders = recent.error ? null : (recent.data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        orderId: String(r.order_id ?? ""),
        orderName: String(r.order_name ?? ""),
        amount: Number(r.amount ?? 0),
        status: String(r.status ?? ""),
        method: String(r.method ?? ""),
        createdAt: String(r.created_at ?? ""),
      };
    });
  }

  // 문의 — 실제 메시지가 있는 대화만 (repository가 이미 걸러준다)
  // 못 읽었으면 '문의 0건'이 아니라 모름(null) — 안 읽은 고객 메시지를 놓치지 않게
  const conversations = await listAdminConversationRecords().catch(() => null);
  const recentConversations = conversations?.slice(0, 5) ?? [];
  const recentCustomers = await resolveSupportCustomers(recentConversations.map((c) => c.ownerHash));
  const inquiries = conversations === null ? null : {
    open: conversations.filter((c) => c.status === "open").length,
    unread: conversations.reduce((sum, c) => sum + (c.unreadByAdmin ?? 0), 0),
    total: conversations.length,
    recent: recentConversations.map((c) => ({
      id: c.id,
      // 손님이 마지막으로 한 말 — 관리자 답장으로 미리보기가 덮이면 무엇을 물었는지 안 보였다
      preview: c.lastCustomerPreview || c.lastMessagePreview,
      customer: recentCustomers.get(c.ownerHash) ?? { kind: "unknown" },
      status: c.status,
      updatedAt: c.updatedAt,
      unread: c.unreadByAdmin,
    })),
  };

  /*
   * API 사용량 — llm_usage 테이블(마이그레이션 0020). 아직 없으면 null로 안내.
   *
   * 7일 누적만으로는 '지금 고장났는지'를 알 수 없다. 크레딧이 방금
   * 떨어졌어도 7일 숫자에 묻힌다 — 최근 1시간·24시간과 실패율,
   * 마지막 실패 시각을 함께 준다.
   */
  let llm: {
    today: number;
    last7d: number;
    total: number;
    failed7d: number;
    last24h: number;
    failed24h: number;
    failed1h: number;
    lastFailureAt: string | null;
  } | null = null;
  if (supabase) {
    try {
      const total = await supabase.from("llm_usage").select("id", { count: "exact", head: true });
      // 테이블이 없으면 error 없이 count만 null로 오는 경우가 있다 — 둘 다 미생성으로 본다
      if (total.error || total.count === null) throw total.error ?? new Error("llm_usage missing");
      const today = await supabase.from("llm_usage").select("id", { count: "exact", head: true }).gte("created_at", todayStart);
      const week = await supabase.from("llm_usage").select("id", { count: "exact", head: true }).gte("created_at", weekAgo);
      const failed = await supabase
        .from("llm_usage")
        .select("id", { count: "exact", head: true })
        .eq("ok", false)
        .gte("created_at", weekAgo);
      const dayAgo = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
      const day = await supabase.from("llm_usage").select("id", { count: "exact", head: true }).gte("created_at", dayAgo);
      const failedDay = await supabase
        .from("llm_usage")
        .select("id", { count: "exact", head: true })
        .eq("ok", false)
        .gte("created_at", dayAgo);
      const failedHour = await supabase
        .from("llm_usage")
        .select("id", { count: "exact", head: true })
        .eq("ok", false)
        .gte("created_at", hourAgo);
      const lastFail = await supabase
        .from("llm_usage")
        .select("created_at")
        .eq("ok", false)
        .order("created_at", { ascending: false })
        .limit(1);

      llm = {
        total: total.count ?? 0,
        today: today.count ?? 0,
        last7d: week.count ?? 0,
        failed7d: failed.count ?? 0,
        last24h: day.count ?? 0,
        failed24h: failedDay.count ?? 0,
        failed1h: failedHour.count ?? 0,
        lastFailureAt: (lastFail.data?.[0] as { created_at?: string } | undefined)?.created_at ?? null,
      };
    } catch {
      llm = null; // 테이블 미생성 — 대시보드가 마이그레이션 안내를 띄운다
    }
  }

  // 환불 접수함 대기 건수 (테이블 미생성이면 null)
  const refundPending = await countPendingRefundRequests().catch(() => null);

  return privateJson({
    users: { total: usersTotal, active7d: usersActive7d },
    payments: { paidCount, paidAmount, grossAmount: revenue?.gross ?? null, refundedAmount: revenue?.refunded ?? null, storeRefundedAmount: revenue?.storeRefunded ?? null, paid7d, refundCount, refundPending, recentOrders },
    inquiries,
    llm,
  });
}
