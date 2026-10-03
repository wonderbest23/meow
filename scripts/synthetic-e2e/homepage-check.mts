// 홈페이지 초안 → 공개 → 알림 설정 → 손님 문의 → 주간 리포트 발송기 — 안전 미리보기 전용
import { readFileSync, writeFileSync } from "node:fs";
const origin = readFileSync(new URL("./origin.txt", import.meta.url), "utf8").trim();
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("synthetic preview only");
const results = JSON.parse(readFileSync(new URL("./results.json", import.meta.url), "utf8")) as Array<{ biz: string; planId: string; ok: boolean }>;
const ids = ["bakery","cafe","sidedish","nail","academy","online","pt","photo","stay","app"];
const report: any[] = [];
for (const r of results) {
  if (!r.ok) continue;
  const cookie = `syn_uid=syn-${ids.indexOf(r.biz) + 1}`;
  const call = async (method: string, path: string, body?: unknown, withCookie = true) => {
    const res = await fetch(origin + path, { method, headers: { "content-type": "application/json", origin, ...(withCookie ? { cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text(); let json: any = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  };
  const row: any = { biz: r.biz };
  const draft = await call("POST", "/api/plan/landing", { planId: r.planId });
  row.draft = `${draft.status}${draft.json?.error ? " " + draft.json.error + (draft.json.missing ? ":" + draft.json.missing.join(",") : "") : ""} editable=${draft.json?.editable}`;
  const site = draft.json?.site, projectId = draft.json?.projectId;
  if (site && projectId) {
    const pub = await call("POST", `/api/projects/${projectId}/landing/publish`, { expectedUpdatedAt: site.updatedAt ?? null });
    row.publish = `${pub.status}${pub.json?.error ? " " + (pub.json.error.code ?? pub.json.error) + " " + (pub.json.error.message ?? "") : ""}`;
    const alerts = await call("PUT", `/api/projects/${projectId}/landing/alerts`, { phone: "01000000000", agreed: true, weeklyEnabled: true });
    row.alerts = alerts.status === 200 ? { phone: !!alerts.json?.phone, weekly: alerts.json?.weeklyEnabled, smsReady: alerts.json?.smsReady, emailReady: alerts.json?.emailReady, published: alerts.json?.published } : `${alerts.status} ${alerts.text.slice(0, 120)}`;
    const slug = pub.json?.site?.slug ?? site.slug;
    const config = pub.json?.site?.draft ?? site.draft ?? {};
    const lead = await call("POST", `/api/public/landing/${encodeURIComponent(slug)}/lead`, { name: "합성 손님", phone: config.collectPhone ? "01000000000" : "", email: config.collectEmail ? "guest@synthetic.invalid" : "", message: config.collectMessage ? "합성 문의입니다" : "", privacyAgreed: true, marketingAgreed: false, website: "" }, false);
    row.lead = `${lead.status}${lead.json?.error ? " " + JSON.stringify(lead.json.error).slice(0, 120) : ""}`;
    row.siteKeys = Object.keys(pub.json?.site ?? {}).join(",").slice(0, 200); row.collect = [config.collectPhone && "phone", config.collectEmail && "email", config.collectMessage && "message"].filter(Boolean).join("+");
  }
  report.push(row); console.log(JSON.stringify(row));
}
const weekly = await fetch(origin + "/api/dev/synthetic-weekly", { method: "POST", headers: { origin } });
console.log("weekly:", weekly.status, (await weekly.text()).slice(0, 400));
writeFileSync(new URL("./homepage-report.json", import.meta.url), JSON.stringify(report, null, 1));
