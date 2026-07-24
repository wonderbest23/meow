"use client";

import { createUsePuck, Puck, type Data } from "@puckeditor/core";
import { Save, X } from "lucide-react";
import type { LandingPageData } from "../lib/landing/page-data";
import { landingBlockConfig, type LandingBlockProps } from "./landing-blocks";

const useLandingPuck = createUsePuck();

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
        viewports={[
          { width: 390, height: "auto", icon: "Smartphone", label: "휴대전화" },
          { width: 768, height: "auto", icon: "Tablet", label: "태블릿" },
          { width: 1280, height: "auto", icon: "Monitor", label: "PC" },
        ]}
        overrides={{
          headerActions: () => <BuilderActions onClose={onClose} onSave={onSave} />,
        }}
      />
    </div>
  );
}
