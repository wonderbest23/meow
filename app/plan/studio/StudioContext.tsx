"use client";

import { createContext, useContext, useEffect } from "react";
import type { StudioTab } from "../../../lib/plan-builder/studio";

/*
 * 작업실 안의 칸들이 함께 쓰는 정보 — 작업실 밖(예전 화면)에서는 모두 null/아무 일 없음이라
 * 각 화면은 "작업실 안이면 이렇게, 아니면 예전처럼"만 갈라 쓰면 된다.
 */
export type StudioPane = {
  planId: string; tab: StudioTab; active: boolean;
  /**
   * 이 칸으로 오는 링크(작업실 안 이동)마다 1씩 오르는 번호 — 칸이 살아 있는 채로 주소만 바뀌므로,
   * 주소의 값(edit=facts · #sec- 등)을 읽는 칸은 이 번호가 바뀔 때 다시 읽는다. 처음 연 주소는 0.
   */
  nav: number;
};
export type StudioNav = {
  /** 작업실 탭으로 바꿀 수 있는 주소면 탭만 바꾸고, 아니면 실제로 이동한다 */
  push: (href: string) => void;
  replace: (href: string) => void;
  /** 저장 안 한 수정이 있는 칸이 알린다 — 작업실 밖으로 나갈 때 한 번만 묻는다 */
  setDirty: (id: string, dirty: boolean, message?: string) => void;
};

export const StudioPaneContext = createContext<StudioPane | null>(null);
export const StudioNavContext = createContext<StudioNav | null>(null);

/** 작업실 안이면 { planId, tab, active }, 밖이면 null */
export function useStudioPane(): StudioPane | null {
  return useContext(StudioPaneContext);
}

/** 작업실 안이면 탭 바꾸기 이동, 밖이면 null — 호출하는 쪽은 null 이면 router 를 그대로 쓴다 */
export function useStudioNav(): StudioNav | null {
  return useContext(StudioNavContext);
}

/** 저장 안 한 수정 보고 — 작업실 밖에서는 아무 일도 하지 않는다 */
export function useStudioDirty(id: string, dirty: boolean, message?: string) {
  const nav = useStudioNav();
  useEffect(() => {
    if (!nav) return;
    nav.setDirty(id, dirty, message);
    return () => nav.setDirty(id, false);
  }, [nav, id, dirty, message]);
}
