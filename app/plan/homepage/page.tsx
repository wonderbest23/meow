"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LandingQuickEditor } from "../../../components/landing-quick-editor";
import { LandingBlocksRenderer } from "../../../components/landing-blocks";
import { createLandingPageData } from "../../../lib/landing/page-data";
import { landingDraftFromPlan } from "../../../lib/landing/from-plan";
import type { LandingDraft, LandingSiteRecord } from "../../../lib/landing/domain";
import { hydrateFromServer, activePlan, loadState, isSamplePlan } from "../../../lib/plan-builder/plan-store";
import styles from "./page.module.css";

/*
 * 사업계획서로 만드는 홈페이지.
 *
 * 계획서를 다 쓰면 홈페이지에 실을 말은 이미 다 답해 둔 상태다.
 * 이 화면은 그 답변으로 만든 초안을 보여주고, 다듬어서 공개하는 곳이다.
 */

type Phase = "loading" | "ready" | "blocked";
type Action = "idle" | "saving" | "saved" | "publishing";

export default function PlanHomepagePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [blocked, setBlocked] = useState<{ title: string; detail: string; missing: string[]; cta: "pay" | "plan" | "login" }>({
    title: "",
    detail: "",
    missing: [],
    cta: "plan",
  });
  const [projectId, setProjectId] = useState<string | null>(null);
  const [site, setSite] = useState<LandingSiteRecord | null>(null);
  const [draft, setDraft] = useState<LandingDraft | null>(null);
  const [editable, setEditable] = useState(false);
  const [sample, setSample] = useState(false);
  const [price, setPrice] = useState(149000);
  const [action, setAction] = useState<Action>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const state = await hydrateFromServer();
      const plan = activePlan(state);
      if (!alive) return;
      if (!plan) {
        setBlocked({ title: "먼저 사업계획서를 만들어주세요", detail: "홈페이지는 계획서에 답한 내용으로 만듭니다.", missing: [], cta: "plan" });
        setPhase("blocked");
        return;
      }
      /*
       * 예시 문서 — 서버를 거치지 않고 그 자리에서 만들어 보여준다.
       * 답변이 이미 들어 있고 변환은 순수 계산이라 AI도 저장도 필요 없다.
       * 결과물이 어떻게 생겼는지 보여주는 게 목적이므로 열람만 가능하다.
       */
      if (isSamplePlan(plan.id)) {
        const draft = landingDraftFromPlan({
          planTitle: plan.title,
          business: state.business,
          answers: plan.answers,
        });
        setDraft(draft);
        setEditable(false);
        setSample(true);
        setPhase("ready");
        return;
      }
      const res = await fetch("/api/plan/landing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId: plan.id }),
      });
      if (!alive) return;

      if (res.ok) {
        const data = (await res.json()) as { site: LandingSiteRecord; projectId: string; editable?: boolean; price?: number };
        setSite(data.site);
        setProjectId(data.projectId);
        setDraft(data.site.draft);
        setEditable(Boolean(data.editable));
        if (typeof data.price === "number") setPrice(data.price);
        setPhase("ready");
        return;
      }

      const error = (await res.json().catch(() => ({}))) as { error?: string; message?: string; missing?: string[] };
      if (res.status === 401) {
        setBlocked({ title: "로그인이 필요합니다", detail: "홈페이지는 내 계정에 저장됩니다.", missing: [], cta: "login" });
      } else if (res.status === 402) {
        setBlocked({ title: "결제 후 이용할 수 있습니다", detail: "홈페이지 만들기는 완성한 계획서에 포함된 기능입니다.", missing: [], cta: "pay" });
      } else if (error.error === "plan_incomplete") {
        setBlocked({
          title: "홈페이지에 실을 내용이 조금 부족해요",
          detail: "아래 질문에 답하면 그 내용으로 홈페이지를 만들어 드립니다.",
          missing: error.missing ?? [],
          cta: "plan",
        });
      } else if (res.status === 404) {
        // 서버에 이 플랜이 없다 — 로그인 전이라 아직 계정에 저장되지 않은 경우가 대부분이다
        setBlocked({
          title: "이 계획서가 아직 계정에 저장되지 않았어요",
          detail: "로그인하면 지금까지 쓴 내용이 저장되고, 그 내용으로 홈페이지를 만들 수 있습니다.",
          missing: [],
          cta: "login",
        });
      } else {
        setBlocked({ title: "홈페이지를 준비하지 못했습니다", detail: error.message ?? "잠시 후 다시 시도해주세요.", missing: [], cta: "plan" });
      }
      setPhase("blocked");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const save = useCallback(async () => {
    if (!projectId || !draft) return;
    setAction("saving");
    setMessage("");
    const res = await fetch(`/api/projects/${projectId}/landing`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (res.ok) {
      const data = (await res.json()) as { site: LandingSiteRecord };
      setSite(data.site);
      setAction("saved");
      setMessage("저장했습니다.");
      return;
    }
    const error = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    setAction("idle");
    setMessage(error.error?.message ?? "저장하지 못했습니다.");
  }, [projectId, draft]);

  const publish = useCallback(async () => {
    if (!projectId || !draft) return;
    setAction("publishing");
    setMessage("");
    // 공개 전에 지금 편집 중인 내용을 먼저 저장한다 — 저장 안 한 수정이 빠지면 안 된다
    const saved = await fetch(`/api/projects/${projectId}/landing`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    if (!saved.ok) {
      const error = (await saved.json().catch(() => ({}))) as { error?: { message?: string } };
      setAction("idle");
      setMessage(error.error?.message ?? "저장하지 못해 공개를 멈췄습니다.");
      return;
    }
    const res = await fetch(`/api/projects/${projectId}/landing/publish`, { method: "POST" });
    if (res.ok) {
      const data = (await res.json()) as { site: LandingSiteRecord };
      setSite(data.site);
      setAction("idle");
      setMessage("홈페이지를 공개했습니다.");
      return;
    }
    const error = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    setAction("idle");
    setMessage(error.error?.message ?? "공개하지 못했습니다.");
  }, [projectId, draft]);

  const publicPath = site ? `/launch/${site.slug}` : "";

  /** 막힌 이유마다 다음 행동이 다르다 — 결제·로그인·계획서 이어쓰기 */
  function blockedHref(cta: "pay" | "plan" | "login"): string {
    if (cta === "login") return `/account?next=${encodeURIComponent("/plan/homepage")}`;
    if (cta !== "pay") return "/plan/overview";
    const plan = activePlan(loadState());
    const query = plan
      ? `?planId=${encodeURIComponent(plan.id)}&planType=${encodeURIComponent(plan.planType)}&product=homepage`
      : "?product=homepage";
    return `/plan/pay${query}`;
  }

  return (
    <>
      {phase === "loading" && (
        <div className={styles.center}>
          <span className={styles.dot} />
          <p className={styles.centerTitle}>계획서 내용으로 홈페이지를 만들고 있어요</p>
          <p className={styles.centerNote}>대표 상품, 첫 고객, 문제와 해결을 그대로 옮깁니다.</p>
        </div>
      )}

      {phase === "blocked" && (
        <div className={styles.center}>
          <p className={styles.centerTitle}>{blocked.title}</p>
          <p className={styles.centerNote}>{blocked.detail}</p>
          {blocked.missing.length > 0 && (
            <ul className={styles.missing}>
              {blocked.missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          <button type="button" className={styles.cta} onClick={() => router.push(blockedHref(blocked.cta))}>
            {blocked.cta === "pay" ? "결제하러 가기 →" : blocked.cta === "login" ? "로그인하기 →" : "계획서 이어 쓰기 →"}
          </button>
        </div>
      )}

      {/*
        결제 전에는 만들어진 홈페이지를 보여만 준다.
        사기 전에 자기 사업이 어떻게 보이는지 확인할 수 있어야 한다.
      */}
      {phase === "ready" && draft && !editable && (
        <div className={styles.previewWrap}>
          <div className={styles.payBar}>
            <div>
              <strong className={styles.payTitle}>
                {sample ? "계획서 내용으로 만든 홈페이지예요" : "계획서 내용으로 홈페이지를 만들었어요"}
              </strong>
              <p className={styles.payNote}>
                {sample
                  ? "예시 계획서의 답변으로 만든 결과입니다. 내 계획서로도 이렇게 만들어집니다."
                  : "지금은 미리보기입니다. 내용을 고치고 인터넷에 공개하려면 결제가 필요합니다."}
              </p>
            </div>
            {sample ? (
              <a className={styles.cta} href="/plan/start">내 플랜 만들기 →</a>
            ) : (
              <button type="button" className={styles.cta} onClick={() => router.push(blockedHref("pay"))}>
                {price.toLocaleString("ko-KR")}원 · 수정하고 공개하기 →
              </button>
            )}
          </div>
          <div className={styles.preview} aria-label="홈페이지 미리보기">
            <LandingBlocksRenderer data={draft.pageData ?? createLandingPageData(draft, draft.templateId)} />
          </div>
        </div>
      )}

      {phase === "ready" && draft && editable && (
        <LandingQuickEditor
          draft={draft}
          action={action}
          message={message}
          published={site?.status === "published"}
          publicPath={publicPath}
          projectId={projectId}
          customDomain={site?.customDomain ?? ""}
          demo={false}
          onChange={setDraft}
          onReset={() => site && setDraft(site.draft)}
          onSave={save}
          onPublish={publish}
          onPreview={() => publicPath && window.open(publicPath, "_blank", "noopener")}
          onSiteUpdated={(next) => setSite(next)}
        />
      )}
    </>
  );
}
