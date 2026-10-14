// 안전 미리보기 복사본 전용 — 합성 로그인 쿠키(syn_uid)를 심고 이동한다. 쿠키를 직접 넣기 어려운 앱(아이폰 시뮬레이터) 화면 점검용
export async function GET(request: Request) {
  if (process.env.SYNTHETIC_AUTH !== "1" || process.env.PERSISTENCE_MODE !== "demo-memory") return new Response(null, { status: 404 });
  const url = new URL(request.url);
  const uid = /^syn-\d{1,3}$/.test(url.searchParams.get("uid") ?? "") ? url.searchParams.get("uid")! : "syn-1";
  const next = (url.searchParams.get("next") ?? "/plan").startsWith("/") ? url.searchParams.get("next") ?? "/plan" : "/plan";
  // 상대 주소로 보낸다 — 개발 서버가 주소를 localhost 로 바꿔 앱이 바깥 주소로 여는 일을 막는다
  return new Response(null, { status: 307, headers: { Location: next, "Set-Cookie": `syn_uid=${uid}; Path=/; HttpOnly; SameSite=Lax` } });
}
