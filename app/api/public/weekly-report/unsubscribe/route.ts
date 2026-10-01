import { enforceRateLimit } from "../../../../../lib/rate-limit";
import { setWeeklyReportEnabled } from "../../../../../lib/landing/repository";
import { verifyWeeklyReportUnsubscribe, weeklyReportSecret } from "../../../../../lib/landing/weekly-report";

export const runtime = "nodejs";

/*
 * 주간 리포트 수신 거부 — 메일의 링크(로그인 없이)와 메일 앱의 '구독 취소' 버튼(RFC 8058 원클릭 POST).
 * GET 은 확인 버튼만 보여 준다(메일 보안 검사기가 링크를 미리 열어도 꺼지지 않게). 끄는 것은 POST.
 */
const page = (title: string, body: string, form = "") => new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head>
<body style="margin:0;background:#f6f7fb;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#191f28;">
<main style="max-width:420px;margin:15vh auto 0;padding:28px 20px;background:#fff;border-radius:16px;"><h1 style="margin:0 0 10px;font-size:20px;">${title}</h1><p style="margin:0 0 18px;color:#4e5968;line-height:1.6;font-size:15px;">${body}</p>${form}
<a href="https://oneulstart.com/plan/homepage" style="color:#3272db;font-size:14px;">오늘창업 홈페이지 화면으로</a></main></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

async function verified(request: Request) {
  const query = new URL(request.url).searchParams;
  const site = query.get("site") ?? "";
  const token = query.get("token") ?? "";
  return /^[0-9a-f-]{36}$/i.test(site) && await verifyWeeklyReportUnsubscribe(site, token, weeklyReportSecret()) ? site : null;
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit("weekly-report-unsubscribe", request, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  if (!(await verified(request))) return page("링크를 확인하지 못했어요", "메일에 있는 링크를 그대로 열어 주세요. 홈페이지 화면의 '접수된 문의'에서도 주간 리포트를 끌 수 있어요.");
  const action = new URL(request.url);
  return page("주간 리포트를 그만 받을까요?", "매주 월요일 아침 지난주 문의·방문 수를 알려 드리는 메일이에요. 끄더라도 홈페이지 문의 알림은 그대로 받습니다.",
    `<form method="post" action="${action.pathname}${action.search.replace(/"/g, "&quot;")}"><button type="submit" style="width:100%;min-height:48px;margin-bottom:16px;border:0;border-radius:10px;background:#3272db;color:#fff;font-size:15px;font-weight:700;">주간 리포트 끄기</button></form>`);
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit("weekly-report-unsubscribe", request, { limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const site = await verified(request);
  if (!site) return page("링크를 확인하지 못했어요", "메일에 있는 링크를 그대로 열어 주세요.");
  if (!(await setWeeklyReportEnabled(site, false))) return page("지금은 끄지 못했어요", "잠시 후 다시 눌러 주세요. 홈페이지 화면의 '접수된 문의'에서도 끌 수 있어요.");
  return page("주간 리포트를 껐어요", "다시 받고 싶으면 홈페이지 화면의 '접수된 문의'에서 켤 수 있어요.");
}
