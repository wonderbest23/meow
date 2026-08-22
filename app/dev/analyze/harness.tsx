"use client";

import { useEffect, useState } from "react";
import AnalyzeFlow from "../../plan/analyze/AnalyzeFlow";
import { normalizeAnalysis } from "../../../lib/plan-builder/analyzer/domain";
import { analyzeGaps, pickRoundSlots } from "../../../lib/plan-builder/analyzer/gap";
import { defaultQuestions } from "../../../lib/plan-builder/analyzer/question-generator";

const MOCK = {
  primary: { value: "교육·강의", status: "inferred", confidence: 0.9 },
  modelTags: { value: ["class"], status: "confirmed" },
  operationTags: { value: ["offline", "b2c", "reservation", "pet", "content_led"], status: "inferred" },
  customer: { value: "반려견 보호자", status: "inferred" },
  problem: { value: null, status: "unknown" },
  solution: { value: "반려견 케이크 원데이 클래스", status: "confirmed" },
  revenueModel: { value: "수강료", status: "inferred" },
  deliveryModel: { value: "오프라인 대면 · 예약제", status: "inferred" },
  acquisitionChannels: { value: ["인스타그램", "유튜브 숏폼"], status: "confirmed" },
  keyCosts: { value: ["공간 대관", "재료비", "광고비"], status: "inferred" },
  stage: { value: "아이디어 단계", status: "inferred" },
  region: { value: null, status: "unknown" },
  gapHints: [{ slot: "classPrice", why: "수강료가 없으면 매출과 손익분기를 계산할 수 없어요" }],
  summaryForUser: "반려견 보호자를 대상으로, SNS 영상으로 모객해 오프라인 원데이 클래스를 운영하는 사업으로 이해했어요.",
};

export default function DevAnalyzeHarness() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // 로컬 플랜 심기 (로그인 없이)
    const now = new Date().toISOString();
    const plan = { id: "plan_dev_analyze", title: "멍케이크 클래스", planType: "창업 초기 · 사업계획서", createdAt: now, updatedAt: now, sections: {}, answers: {} };
    localStorage.setItem("oneul-plan-demo-v1", JSON.stringify({
      business: { name: "멍케이크 클래스", description: "강아지 케이크 만드는 과정을 SNS 영상으로 홍보하고 사람들을 모집해 원데이 클래스를 운영하려고 합니다.", role: "", industry: "", region: "", stage: "" },
      plans: [plan], activePlanId: plan.id,
    }));
    const real = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
      if (url.includes("/api/plan/analyze")) return json({ ok: true, analysis: normalizeAnalysis(MOCK) });
      if (url.includes("/api/plan/questions/next")) {
        const b = JSON.parse(String(init?.body ?? "{}"));
        const rep = analyzeGaps({ analysis: normalizeAnalysis(b.analysis)!, slots: b.slots ?? {} }, b.answers ?? {});
        return json({ ok: true, round: b.round, intro: "", questions: defaultQuestions(pickRoundSlots(rep)), source: "fallback", completeness: Math.round(rep.completeness * 100), canFinish: rep.canFinish, pack: rep.pack.id, remaining: rep.gaps.length });
      }
      if (url.includes("/api/plan/state")) return json({ business: null, plans: [] });
      return real(input, init);
    };
    setReady(true);
  }, []);
  return ready ? <div className="plan-ui"><AnalyzeFlow /></div> : null;
}
