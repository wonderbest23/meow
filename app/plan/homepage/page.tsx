"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutTemplate, Maximize2, ArrowRight } from "lucide-react";
import dynamic from "next/dynamic";
import { LandingQuickEditor } from "../../../components/landing-quick-editor";
import { LandingBlocksRenderer } from "../../../components/landing-blocks";
import { createLandingPageData } from "../../../lib/landing/page-data";
import { landingDraftFromPlan } from "../../../lib/landing/from-plan";
import { SAMPLE_DOCS } from "../../../lib/plan-builder/samples";
import { koTextsFor } from "../../../lib/landing/brainwave/ko";
import type { LandingDraft, LandingSiteRecord } from "../../../lib/landing/domain";
import { hydrateFromServer, activePlan, loadState, isSamplePlan } from "../../../lib/plan-builder/plan-store";
import styles from "./page.module.css";

/*
 * 섹션을 넣고 빼고 끌어서 순서를 바꾸는 편집기.
 * 이미 만들어져 있었는데 어디에도 붙어 있지 않았다 — 결제한 사람이 쓸 수 있게
 * 여기에 단다. 글자만 고치는 폼(LandingQuickEditor)은 그대로 두고 함께 쓴다:
 * 문구만 손볼 때 굳이 배치 편집기를 열 필요는 없다.
 */
const LandingVisualBuilder = dynamic(
  () => import("../../../components/landing-visual-builder").then((m) => m.LandingVisualBuilder),
  { ssr: false },
);

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
  /** 앱 껍데기를 걷어내고 홈페이지만 화면 가득 — 실제로 어떻게 보이는지 확인용 */
  const [fullscreen, setFullscreen] = useState(false);
  /** 섹션 배치 편집기 — 결제한 사람만 연다 */
  const [builderOpen, setBuilderOpen] = useState(false);
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
        /*
         * 예시에는 사업 정보가 없다. 업종을 안 넘기면 기본 템플릿(일반 서비스)이
         * 잡혀 커피집에 낯선 사진과 색이 붙는다 — 예시의 업종을 함께 넘긴다.
         */
        const doc = SAMPLE_DOCS.find((item) => item.id === plan.id);
        /*
         * 플랜 이름은 목록에서 구분하려고 "샘플 · 새벽커피 (창업 초기)"처럼
         * 붙여 뒀는데, 그게 홈페이지 상호명 자리에 그대로 들어가
         * "샘플 · 새벽커피 (창업 초기)에 문의해 보세요"가 손님 화면에 섰다.
         * 가게 이름만 남긴다.
         */
        const shopName = plan.title.replace(/^샘플\s*·\s*/, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
        const draft = landingDraftFromPlan({
          planTitle: shopName || plan.title,
          /*
           * 예시는 남의 가게 이야기다. 여기에 로그인한 사람의 사업 정보를 섞으면
           * 안 된다.
           *
           * 실제로 그렇게 나갔다 — 사업 정보에 "한빛싱크"를 적어 둔 계정에서는
           * 무인꽃집 예시가 "한빛싱크"라는 제목으로, "한빛싱크 가격 안내" 밑에
           * 중형 꽃다발 25,000원을 파는 화면으로 보였다. 결제 전에 물건을 보러 온
           * 사람에게 보여주는 화면이 이러면 안 된다.
           *
           * 예시 자신의 업종만 쓰고, 상호·지역은 비워 예시의 계획서 답변에서
           * 채우게 한다.
           */
          business: { ...state.business, name: "", region: "", industry: doc?.industry ?? "" },
          answers: plan.answers,
        });
        /*
         * 예시마다 업종에 맞는 킷 페이지를 고른다 — 업종 추정만 믿으면 커피집도
         * 꽃집도 똑같이 '매장'으로 잡혀 같은 페이지가 나온다.
         *   새벽커피(카페) → 03 Coworking(공간·매장)
         *   무인꽃집(소매) → 06 ECommerce(온라인 상점)
         */
        const samplePage: Record<string, string> = {
          sample_coffee: "0-2226",
          sample_flower_psst: "0-1102",
          sample_flower_fm: "0-1102",
        };
        const page = samplePage[plan.id];
        /* 예시는 한글로 — 가게 이름을 넣은 문구 세트(디자인은 그대로, 글만) */
        setDraft(page && draft.pageData?.brainwave
          ? { ...draft, pageData: { ...draft.pageData, brainwave: { ...draft.pageData.brainwave, page, texts: koTextsFor(page, shopName || plan.title) } } }
          : draft);
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
        /*
         * 고칠 수 있는 사람에게는 자유 편집을 바로 연다.
         *
         * 그 앞에 있던 화면은 제목·처음 설정·전체화면·저장하고 공개·결제 안내·
         * 주소·디자인 고르기가 한 줄로 쌓여 있어, 무엇부터 할지 읽히지 않았다.
         * 이 화면에서 할 일은 결국 홈페이지를 고치는 것 하나다.
         *
         * 닫으면 그 화면으로 돌아간다 — 주소 확인이나 공개는 거기서 한다.
         */
        if (data.editable) setBuilderOpen(true);
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
      {/* 전체 화면 — 방문자가 보는 그대로 */}
      {fullscreen && draft && (
        <div className={styles.fullscreen} role="dialog" aria-label="홈페이지 전체 화면">
          <button type="button" className={styles.fullscreenClose} onClick={() => setFullscreen(false)}>
            닫기 ✕
          </button>
          <div className={styles.fullscreenBody}>
            <LandingBlocksRenderer data={draft.pageData ?? createLandingPageData(draft, draft.templateId)} />
          </div>
        </div>
      )}
      {phase === "loading" && (
        <div className={styles.center}>
          <span className={styles.dot} />
          <p className={styles.centerTitle}>홈페이지 틀을 불러오고 있어요</p>
          <p className={styles.centerNote}>Brainwave.io 킷 페이지를 그대로 가져옵니다. 글과 사진은 편집에서 바꿉니다.</p>
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
              <strong className={styles.payTitle}>킷 페이지로 만든 홈페이지</strong>
              <p className={styles.payNote}>
                {sample
                  ? "예시 홈페이지입니다. 내 사업으로 만들면 이 페이지의 글과 사진을 바꿔 쓰게 됩니다."
                  : `사진·글·버튼을 직접 고치고 인터넷에 공개하려면 홈페이지 에디터가 필요합니다. ${price.toLocaleString("ko-KR")}원.`}
              </p>
            </div>
            <div className={styles.payActions}>
              {sample ? (
                <a className={styles.cta} href="/plan/start">내 플랜 만들기 →</a>
              ) : (
                <button type="button" className={styles.cta} onClick={() => router.push(blockedHref("pay"))}>
                  홈페이지 에디터 →
                </button>
              )}
            </div>
          </div>
          {/*
            전체 화면은 문서 화면과 같은 방식 — 미리보기 위에 떠 있는 버튼 하나.
            안내 줄에 나란히 두면 '수정하러 가기'와 무게가 같아 보여, 정작 눌러야
            할 것이 뭔지 흐려진다.
          */}
          <div className={styles.preview} aria-label="홈페이지 미리보기">
            <button type="button" className={styles.fsFloat} onClick={() => setFullscreen(true)} title="홈페이지만 화면 가득 보기">
              <Maximize2 size={14} /> 전체 화면
            </button>
            <LandingBlocksRenderer data={draft.pageData ?? createLandingPageData(draft, draft.templateId)} />
          </div>
        </div>
      )}

      {/* 섹션 배치 편집기 — 화면을 덮고 열린다. 저장하면 초안의 pageData가 바뀐다 */}
      {builderOpen && draft && editable && (
        <LandingVisualBuilder
          data={draft.pageData ?? createLandingPageData(draft, draft.templateId)}
          businessName={draft.businessName}
          projectId={projectId}
          businessSummary={draft.subheadline || draft.offerDescription}
          onClose={() => setBuilderOpen(false)}
          onSave={(pageData) => {
            setDraft({ ...draft, pageData });
            setBuilderOpen(false);
          }}
        />
      )}

      {/*
        * 자유 편집이 이 화면의 주된 행동이다.
        *
        * 예전에는 "섹션 넣고 빼고 순서 바꾸기"라는 이름으로 제목보다 위, 테두리만
        * 있는 작은 단추로 놓여 있었다. 무엇을 여는 단추인지 읽히지 않아 그 아래
        * 설정들과 같은 무게로 보였다.
        *
        * 이름을 하는 일로 바꾸고, 무슨 화면이 열리는지 한 줄 붙여 맨 위에 크게 둔다.
        */}
      {phase === "ready" && draft && editable && (
        <button type="button" className={styles.builderOpen} onClick={() => setBuilderOpen(true)}>
          <span className={styles.builderOpenIcon}><LayoutTemplate size={18} /></span>
          <span className={styles.builderOpenText}>
            <strong>자유 편집 열기</strong>
            <small>글을 누르면 그 자리에서 고치고, 사진을 누르면 바꿉니다. 26가지 페이지 중 고를 수 있어요</small>
          </span>
          <ArrowRight size={16} />
        </button>
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
