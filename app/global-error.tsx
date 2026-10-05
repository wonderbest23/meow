"use client";

/* 바깥 틀(layout)까지 깨졌을 때 — 스타일 없이도 읽히는 최소 한국어 화면 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, 'Apple SD Gothic Neo', sans-serif", background: "#f6f7fb", color: "#191f28" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <section style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 22 }}>화면을 불러오지 못했어요</h1>
            <p style={{ color: "#4e5968", lineHeight: 1.7 }}>저장한 내용은 그대로 있어요. 잠시 후 다시 시도해 주세요.</p>
            <button type="button" onClick={() => reset()} style={{ marginTop: 12, padding: "12px 20px", border: 0, borderRadius: 10, background: "#3272db", color: "#fff", fontSize: 15, cursor: "pointer" }}>다시 시도</button>
            <p style={{ marginTop: 16 }}><a href="/plan" style={{ color: "#3272db" }}>내 사업 보기</a></p>
          </section>
        </main>
      </body>
    </html>
  );
}
