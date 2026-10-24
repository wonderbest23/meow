// 합성 미리보기 전용(lib/synthetic-preview.ts) — 합성 로그인 쿠키(syn_uid)를 심고 이동한다.
// 쿠키를 직접 넣기 어려운 곳(아이폰 시뮬레이터·클라우드 세션의 브라우저) 화면 점검용. 운영에서는 404(미들웨어·이 조건 둘 다).
import { SYNTHETIC_UID_COOKIE, SYNTHETIC_UID_PATTERN, syntheticPreviewEnabled, syntheticPreviewNotFound } from "../../../../lib/synthetic-preview";

export async function GET(request: Request) {
  if (!syntheticPreviewEnabled()) return syntheticPreviewNotFound();
  const url = new URL(request.url);
  const asked = url.searchParams.get("uid") ?? "";
  const uid = SYNTHETIC_UID_PATTERN.test(asked) ? asked : "syn-1";
  const nextParam = url.searchParams.get("next") ?? "/plan";
  // 같은 사이트 안 주소만(//다른-사이트 로 빠지지 않게)
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") && !nextParam.startsWith("/\\") ? nextParam : "/plan";
  // 상대 주소로 보낸다 — 개발 서버가 주소를 localhost 로 바꿔 앱이 바깥 주소로 여는 일을 막는다
  return new Response(null, { status: 307, headers: { Location: next, "Set-Cookie": `${SYNTHETIC_UID_COOKIE}=${uid}; Path=/; HttpOnly; SameSite=Lax`, "Cache-Control": "no-store" } });
}
