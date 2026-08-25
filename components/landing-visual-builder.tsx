"use client";

import { blocksPlugin, createUsePuck, fieldsPlugin, outlinePlugin, Puck, useGetPuck, type Data } from "@puckeditor/core";
import { MousePointerClick, Redo2, Save, Sparkles, Undo2, X } from "lucide-react";
import type { LandingPageData } from "../lib/landing/page-data";
import { landingBlockConfig, type LandingBlockProps } from "./landing-blocks";
import { useState } from "react";
import { BrainwaveEditor } from "./brainwave-editor";
import { BRAINWAVE_DEFAULT_FOR_TEMPLATE } from "../lib/landing/brainwave/catalog";

const useLandingPuck = createUsePuck();

/*
 * 맨 앞이 편집기를 열었을 때의 기본 폭이다.
 *
 * 휴대전화가 앞에 있어서, 넓은 화면에서 열어도 가운데 좁은 칸에만 페이지가
 * 보였다. 고칠 자리를 찾기 전에 "왜 이렇게 좁지"부터 묻게 된다. PC 를 앞에
 * 둔다 — 넓게 보면서 고치고, 폰은 눌러서 확인한다.
 *
 * 태블릿은 뺐다. 이 홈페이지는 640px 을 경계로 폰과 PC 두 벌만 그린다.
 * 768 을 보여주면 제품에 없는 세 번째 모습을 보여주는 셈이다.
 */
const VIEWPORTS = [
  { width: 1280, height: "auto" as const, icon: "Monitor" as const, label: "PC" },
  { width: 390, height: "auto" as const, icon: "Smartphone" as const, label: "휴대전화" },
];

/*
 * 왼쪽 도구 이름을 한국어로.
 *
 * Puck 은 왼쪽 칸을 플러그인으로 그리고, 기본값 둘이 "Blocks"·"Outline"이라는
 * 영어 이름을 달고 있었다. 한국어 화면에서 이 둘만 영어라 남의 도구를 붙여놓은
 * 것처럼 보였다.
 *
 * CSS 로 글자를 덮지 않는다 — 그건 화면만 가리는 것이고, 도구 이름이 바뀌면
 * 조용히 어긋난다. Puck 이 같은 name 의 플러그인을 덮어쓰므로, 원본을 그대로
 * 펼치고 label 만 바꿔 넘긴다. 그리는 방식과 아이콘은 원본 그대로다.
 *
 * 오른쪽 속성 칸(fields)도 같은 방식이다. 이걸 넘기면 Puck 이 자기 것을 붙이지
 * 않으므로, 원본을 펼쳐 이름만 바꾼다.
 */
/*
 * 등장 효과 고르는 칸.
 *
 * 효과는 블록마다 오른쪽 '고치기' 칸 맨 아래에 있어서, 열세 칸을 지나야 닿았다.
 * 여기서는 블록을 고르고 원하는 움직임을 한 번 눌러 정한다.
 *
 * 값은 블록의 motion 속성 하나뿐이다 — 따로 저장하지 않는다.
 */
const MOTION_TEMPLATES = [
  { value: "none", label: "없음", detail: "움직이지 않습니다" },
  { value: "fade", label: "서서히", detail: "옅게 있다가 또렷해집니다" },
  { value: "up", label: "아래에서 위로", detail: "살짝 올라오며 나타납니다" },
  { value: "side", label: "좌우에서", detail: "옆에서 밀려 들어옵니다" },
];

/*
 * 고른 효과를 그 자리에서 한 번 보여준다.
 *
 * 실제 효과는 스크롤에 맞춰 도는 것이라, 이미 화면에 떠 있는 칸은 눌러도 아무
 * 일이 없어 보인다. 고르자마자 어떻게 나타나는지 봐야 고를 수 있다.
 *
 * 미리보기용 클래스를 잠깐 붙였다 뗀다. 저장되는 값은 건드리지 않는다.
 */
function playMotionPreview(id: string, motion: string) {
  if (!id || motion === "none") return;
  const frame = document.querySelector<HTMLIFrameElement>(".landing-visual-builder iframe");
  const el = frame?.contentDocument?.querySelector(`[data-puck-dnd="${CSS.escape(id)}"] .landing-block`);
  if (!(el instanceof HTMLElement)) return;
  const cls = `motion-preview-${motion}`;
  el.classList.remove(cls);
  /*
   * 값을 바꾸면 그 칸이 다시 그려진다. 바로 클래스를 붙이면 다시 그려질 때
   * 지워져 아무 일도 일어나지 않는다 — 다시 그린 뒤에 붙인다.
   */
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const target = frame?.contentDocument?.querySelector(`[data-puck-dnd="${CSS.escape(id)}"] .landing-block`);
    if (!(target instanceof HTMLElement)) return;
    target.classList.add(cls);
    target.addEventListener("animationend", () => target.classList.remove(cls), { once: true });
  }));
}

function MotionPanel() {
  const getPuck = useGetPuck();
  const selected = useLandingPuck((state) => state.selectedItem);
  if (!selected) {
    return <p className="landing-motion-empty">먼저 화면에서 칸을 하나 누르세요. 그 칸이 어떻게 나타날지 여기서 정합니다.</p>;
  }
  const current = (selected.props as { motion?: string }).motion ?? "none";
  return (
    <div className="landing-motion-panel">
      <small>고른 칸의 등장 방식</small>
      {MOTION_TEMPLATES.map((item) => (
        <button
          key={item.value}
          type="button"
          className={current === item.value ? "on" : ""}
          onClick={() => {
            const puck = getPuck();
            const item2 = puck.selectedItem;
            if (!item2) return;
            puck.dispatch({
              type: "replace",
              destinationIndex: puck.appState.ui.itemSelector?.index ?? 0,
              destinationZone: puck.appState.ui.itemSelector?.zone ?? "default-zone",
              data: { ...item2, props: { ...item2.props, motion: item.value } },
            });
            playMotionPreview(String(item2.props.id ?? ""), item.value);
          }}
        >
          <strong>{item.label}</strong>
          <span>{item.detail}</span>
        </button>
      ))}
    </div>
  );
}

const KOREAN_PLUGINS = [
  { ...blocksPlugin(), label: "블록 넣기" },
  { ...outlinePlugin(), label: "페이지 구성" },
  { ...fieldsPlugin(), label: "고치기" },
  { name: "motion", label: "등장 효과", icon: <Sparkles />, render: () => <MotionPanel /> },
];

/*
 * 처음 여는 사람은 무엇부터 눌러야 할지 모른다.
 *
 * Puck 안에 끼워 넣으면 편집기 구조를 건드리게 되므로, 편집기 위에 우리 줄을
 * 하나 얹는다. 여기서 깨져도 편집기는 멀쩡하다.
 */
function BuilderHint() {
  return (
    <p className="landing-builder-hint">
      <MousePointerClick />
      <span>
        왼쪽 <b>블록 넣기</b>에서 원하는 칸을 끌어다 놓으세요. 칸을 누르면 오른쪽에서 글과 사진을 고칩니다.
      </span>
    </p>
  );
}

/*
 * 항상 보이는 도구줄.
 *
 * Puck 은 좁은 화면에서 머리말을 접는다. 그러면 닫기·편집 내용 적용·되돌리기가
 * 전부 크기 0 이 되어, 화살표를 찾아 펼치기 전에는 닫지도 저장하지도 못한다.
 * 폰에서 이건 막다른 길이다.
 *
 * Puck 의 접기 규칙과 싸우지 않고, 편집기 위에 우리 줄을 하나 둔다. 되돌리기는
 * Puck 의 history 를 그대로 쓴다 — 우리가 따로 기억하지 않는다.
 */
function BuilderBar({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (data: LandingPageData) => void;
}) {
  const data = useLandingPuck((state) => state.appState.data);
  const history = useLandingPuck((state) => state.history);
  return (
    <div className="landing-builder-bar">
      <div className="landing-builder-bar-history">
        <button type="button" onClick={() => history.back()} disabled={!history.hasPast} title="되돌리기">
          <Undo2 /> 되돌리기
        </button>
        <button type="button" onClick={() => history.forward()} disabled={!history.hasFuture} title="앞으로">
          <Redo2 /> 앞으로
        </button>
      </div>
      <div className="landing-builder-bar-main">
        <button type="button" onClick={onClose}><X /> 닫기</button>
        <button type="button" className="save" onClick={() => onSave(data as LandingPageData)}><Save /> 편집 내용 적용</button>
      </div>
    </div>
  );
}

export function LandingVisualBuilder({
  data,
  businessName,
  projectId,
  businessSummary,
  onClose,
  onSave,
}: {
  data: LandingPageData;
  businessName: string;
  /** AI 수정(토큰)에 쓴다 — 없으면 AI 단추가 숨는다 */
  projectId?: string | null;
  businessSummary?: string;
  onClose: () => void;
  onSave: (data: LandingPageData) => void;
}) {
  /*
   * 옛 블록 페이지에서 킷 페이지로 갈아타기.
   * 킷으로 바꾸면 블록 편집 내용은 사라진다 — 물어본 뒤 바꾸고, 저장은 손님이 누른다.
   */
  const [switched, setSwitched] = useState<LandingPageData | null>(null);
  const current = switched ?? data;
  /* Brainwave.io 킷 페이지는 블록 편집기(Puck)가 아니라 자리 편집기로 고친다 */
  if (current.brainwave) {
    return <BrainwaveEditor data={current} onClose={onClose} onSave={onSave} projectId={projectId ?? null} business={{ name: businessName, summary: businessSummary ?? "" }} />;
  }
  const switchToKit = () => {
    if (!window.confirm("새 킷 페이지(26가지 디자인)로 바꿉니다. 지금 블록으로 꾸민 내용은 사라지고, 글과 사진만 다시 넣게 됩니다. 바꿀까요?")) return;
    setSwitched({ brainwave: { page: BRAINWAVE_DEFAULT_FOR_TEMPLATE.service, texts: {}, images: {}, links: {} }, root: { props: { title: businessName } }, content: [] });
  };
  return (
    <div className="landing-visual-builder" role="dialog" aria-modal="true" aria-label="판매 페이지 자유 편집">
      <BuilderHint />
      <button type="button" className="builder-switch-kit" onClick={switchToKit}>
        <Sparkles size={15} /> 새 킷 페이지로 바꾸기 — 26가지 완성 디자인에 글·사진만 넣기
      </button>
      <Puck
        config={landingBlockConfig}
        data={data as Data<LandingBlockProps>}
        headerTitle="판매 페이지 자유 편집"
        headerPath={businessName}
        /* 안내줄이 위를 차지한다 — 남은 높이만 편집기가 쓴다 */
        height="calc(100dvh - var(--builder-hint-h, 44px))"
        plugins={KOREAN_PLUGINS}
        viewports={VIEWPORTS}
        overrides={{
          /*
           * 머리말을 통째로 우리 것으로 바꾼다.
           *
           * headerActions 만 바꾸면 Puck 의 접는 규칙이 그대로라, 좁은 화면에서
           * 우리 단추까지 같이 숨는다. 접지 않는 머리말을 직접 그린다.
           */
          header: () => (
            <div className="landing-builder-head">
              <strong>{businessName || "판매 페이지"}</strong>
              <BuilderBar onClose={onClose} onSave={onSave} />
            </div>
          ),
        }}
      />
    </div>
  );
}
