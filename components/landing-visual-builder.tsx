"use client";

import { blocksPlugin, createUsePuck, fieldsPlugin, outlinePlugin, Puck, type Data } from "@puckeditor/core";
import { MousePointerClick, Save, X } from "lucide-react";
import type { LandingPageData } from "../lib/landing/page-data";
import { landingBlockConfig, type LandingBlockProps } from "./landing-blocks";

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
const KOREAN_PLUGINS = [
  { ...blocksPlugin(), label: "블록 넣기" },
  { ...outlinePlugin(), label: "페이지 구성" },
  { ...fieldsPlugin(), label: "고치기" },
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

function BuilderActions({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (data: LandingPageData) => void;
}) {
  const data = useLandingPuck((state) => state.appState.data);
  return (
    <div className="landing-builder-header-actions">
      <button type="button" onClick={onClose}><X /> 닫기</button>
      <button type="button" className="save" onClick={() => onSave(data as LandingPageData)}><Save /> 편집 내용 적용</button>
    </div>
  );
}

export function LandingVisualBuilder({
  data,
  businessName,
  onClose,
  onSave,
}: {
  data: LandingPageData;
  businessName: string;
  onClose: () => void;
  onSave: (data: LandingPageData) => void;
}) {
  return (
    <div className="landing-visual-builder" role="dialog" aria-modal="true" aria-label="판매 페이지 자유 편집">
      <BuilderHint />
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
          headerActions: () => <BuilderActions onClose={onClose} onSave={onSave} />,
        }}
      />
    </div>
  );
}
