"use client";

import { createUsePuck, Puck, type Data } from "@puckeditor/core";
import { Save, X } from "lucide-react";
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
      <Puck
        config={landingBlockConfig}
        data={data as Data<LandingBlockProps>}
        headerTitle="판매 페이지 자유 편집"
        headerPath={businessName}
        height="100dvh"
        viewports={VIEWPORTS}
        overrides={{
          headerActions: () => <BuilderActions onClose={onClose} onSave={onSave} />,
        }}
      />
    </div>
  );
}
