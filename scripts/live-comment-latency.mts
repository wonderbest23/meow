// AI 참고 의견의 실제 속도 측정(운영·미리보기 서버용). 실제 AI 호출 비용이 든다.
// 사용법: node scripts/live-comment-latency.mts https://oneulstart.com [횟수=5]
// 서버에 INTAKE_LIVE_COMMENT=1 이 켜져 있어야 한다(꺼져 있으면 204).
const base = process.argv[2]?.replace(/\/+$/, "");
const runs = Math.min(10, Math.max(1, Number(process.argv[3] ?? 5)));
if (!base) { console.error("서버 주소를 넣어 주세요. 예: node scripts/live-comment-latency.mts https://oneulstart.com 5"); process.exit(2); }

const ideas = [
  "사람들이 돈을 모아서 건물을 사는 사이트 만들고 싶어",
  "동네에서 반찬 가게를 하고 싶어요",
  "강아지 산책을 대신해주는 앱을 만들고 싶어요",
  "중소기업 세무 서류를 대신 정리해주는 서비스",
  "주말에만 여는 원데이 도자기 클래스",
];

type Row = { idea: string; status: number; clientFirstMs: number | null; clientTotalMs: number; serverFirstMs: number | null; serverTotalMs: number | null; model: string; chars: number };
const rows: Row[] = [];
for (let i = 0; i < runs; i += 1) {
  const idea = ideas[i % ideas.length];
  const started = performance.now();
  const response = await fetch(`${base}/api/plan/chat/comment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: idea }) });
  let clientFirstMs: number | null = null, text = "", done: Record<string, unknown> = {};
  if (response.status === 200 && response.body) {
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done: finished, value } = await reader.read();
      if (finished) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
      for (const line of lines.filter(Boolean)) {
        const event = JSON.parse(line) as Record<string, unknown>;
        if (event.type === "delta") { clientFirstMs ??= Math.round(performance.now() - started); text += String(event.text); }
        if (event.type === "done") done = event;
      }
    }
  }
  rows.push({ idea, status: response.status, clientFirstMs, clientTotalMs: Math.round(performance.now() - started), serverFirstMs: (done.firstTokenMs as number) ?? null, serverTotalMs: (done.totalMs as number) ?? null, model: String(done.model ?? "-"), chars: text.length });
  console.log(`#${i + 1} ${response.status} 첫 글자 ${clientFirstMs ?? "-"}ms · 전체 ${rows.at(-1)!.clientTotalMs}ms · ${done.model ?? "-"} · "${text.slice(0, 60)}${text.length > 60 ? "…" : ""}"`);
}
const ok = rows.filter(row => row.clientFirstMs !== null);
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };
console.log(JSON.stringify({
  base, runs, succeeded: ok.length,
  medianFirstTokenMs: median(ok.map(row => row.clientFirstMs!)),
  medianTotalMs: median(ok.map(row => row.clientTotalMs)),
  medianServerFirstTokenMs: median(ok.flatMap(row => row.serverFirstMs === null ? [] : [row.serverFirstMs])),
  model: ok[0]?.model ?? null,
}, null, 2));
