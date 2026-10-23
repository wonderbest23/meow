"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
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
  /**
   * 이 칸에 새 소식이 있다고 알릴 때마다(탭 보여 주기 showTab · markActivity) 1씩 오르는 번호 — 칸이 이미 보이고 있어도
   * 다시 읽게 한다(예: 계획서 작성이 시작되면 계획서 칸이 진행을 다시 묻고 문서를 다시 받는다). 처음은 0.
   */
  refresh: number;
};
export type StudioNav = {
  /** 작업실 탭으로 바꿀 수 있는 주소면 탭만 바꾸고, 아니면 실제로 이동한다 */
  push: (href: string) => void;
  replace: (href: string) => void;
  /** 저장 안 한 수정이 있는 칸이 알린다 — 작업실 밖으로 나갈 때 한 번만 묻는다 */
  setDirty: (id: string, dirty: boolean, message?: string) => void;
  /**
   * 2단계: 칸이 자기 단추(저장·공개하기 등)를 작업실 머리줄 오른쪽에 올린다 — 그 칸이 보일 때만 머리줄에 나온다.
   * node 를 null 로 주면 내린다. 작업실 밖에서는 이 함수가 없다(예전처럼 BusinessAppChrome actions 를 쓴다).
   */
  setHeaderActions?: (tab: StudioTab, node: ReactNode | null) => void;
  /** 2단계: 숨겨진 칸에 새 소식이 생겼다(대화 새 답변, 계획서 작성 진행) — 휴대폰 탭에 점을 찍는다 */
  markActivity?: (tab: StudioTab) => void;
  /** 2단계: 칸이 다른 탭을 보여 달라고 한다(예: 계획서 작성이 시작되면 계획서 탭으로) — 주소의 값은 건드리지 않는다 */
  showTab?: (tab: StudioTab) => void;
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

/** 2단계: 칸의 머리줄 단추 등록 — 작업실 밖에서는 아무 일도 하지 않는다(그때는 예전처럼 actions 로 넘긴다) */
export function useStudioHeaderActions(node: ReactNode | null) {
  const nav = useStudioNav();
  const pane = useStudioPane();
  const tab = pane?.tab;
  useEffect(() => {
    if (!nav?.setHeaderActions || !tab) return;
    nav.setHeaderActions(tab, node);
  }, [nav, tab, node]);
  useEffect(() => () => { if (nav?.setHeaderActions && tab) nav.setHeaderActions(tab, null); }, [nav, tab]);
}
