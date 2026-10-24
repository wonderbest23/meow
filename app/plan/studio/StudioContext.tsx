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
  /**
   * 새 작업실 머리줄(PC) 가운데 알약 — 칸이 자기 맥락을 올린다(계획서: 장 고르기 '1장 사업 개요 1/5 ⌄', 홈페이지: 페이지 주소 + 휴대폰/컴퓨터).
   * 그 칸이 보일 때만 머리줄 가운데에 나온다. node 를 null 로 주면 내린다. 휴대폰과 작업실 밖에서는 없다.
   */
  setHeaderCenter?: (tab: StudioTab, node: ReactNode | null) => void;
  /** 2단계: 숨겨진 칸에 새 소식이 생겼다(대화 새 답변, 계획서 작성 진행) — 휴대폰 탭에 점을 찍는다 */
  markActivity?: (tab: StudioTab) => void;
  /** 2단계: 칸이 다른 탭을 보여 달라고 한다(예: 계획서 작성이 시작되면 계획서 탭으로) — 주소의 값은 건드리지 않는다 */
  showTab?: (tab: StudioTab) => void;
  /**
   * 대화 칸만 쓴다 — 사업 방향 정리(사업안 만들기)를 시작하거나 끝내는 순간 바로 알린다. 머리줄은 질문 수를 15초마다 묻는데
   * 정리는 30~40초라, 그 사이 부제는 '대화 중 · 마무리'·칩은 '대화 ✓'로 대화 칸의 '정리하고 있어요'와 어긋났다.
   */
  setDesignRunning?: (running: boolean) => void;
  /**
   * 3단계: 대화로 고치기 — 오른쪽 칸(홈페이지 등)이 "대화로 받은 지시를 이렇게 바꿀게요"를 만들고 적용·되돌리는 일을 맡는다.
   * 칸이 처음 열릴 때 registerEditHandler 로 등록하고, 대화 칸은 editHandler(target) 로 찾아 쓴다.
   */
  registerEditHandler?: (target: StudioEditTarget, handler: StudioEditHandler) => () => void;
  editHandler?: (target: StudioEditTarget) => StudioEditHandler | null;
  /** 3단계: 다른 칸이 대화 입력창을 특정 대상 고치기로 열어 달라고 한다(예: 계획서 장 머리의 '대화로 고치기') */
  composeInChat?: (request: StudioComposeRequest) => void;
  /**
   * 3단계: 대화 칸만 쓴다 — composeInChat 요청을 받을 곳을 등록한다(대화 칸은 하나). 등록 전에 온 요청은 하나만 보관했다가
   * 등록하는 순간 넘긴다. 돌려준 함수로 내린다.
   */
  onComposeRequest?: (listener: (request: StudioComposeRequest) => void) => () => void;
};

/** 대화로 고칠 수 있는 대상 — plan-section 은 계획서의 한 장, homepage 는 홈페이지 글 */
export type StudioEditTarget = "homepage" | "plan-section";

/** 대화 입력창을 특정 대상 고치기로 여는 요청 */
export type StudioComposeRequest = { target: StudioEditTarget; label: string; sectionId?: string; text?: string };

/** "이렇게 바꿀게요" 카드 한 장 — 대화 칸이 그대로 그린다 */
export type StudioEditProposal = {
  id: string;
  target: StudioEditTarget;
  /** 한 줄 요약(예: "첫 화면 제목과 버튼 글을 바꿔요") */
  summary: string;
  /** 바뀌는 곳마다 이름 · 지금 · 바꿀 글 */
  changes: { label: string; before: string; after: string }[];
  /** 비용 안내(예: "AI 수정 토큰 1,240개 사용") — 없으면 숨긴다 */
  cost?: string;
};

/** 오른쪽 칸이 맡는 고치기 — 실패하면 throw new Error("손님에게 보여 줄 한국어 문장") */
export type StudioEditHandler = {
  /** 바꿀 내용을 만들되 아직 적용하지 않는다 */
  propose: (instruction: string, context?: { sectionId?: string }) => Promise<StudioEditProposal>;
  /** 카드의 [바꾸기] — 적용하고 저장한다 */
  apply: (proposalId: string) => Promise<void>;
  /** 카드의 [그대로 두기] */
  dismiss: (proposalId: string) => void;
  /** 적용한 뒤 [되돌리기] — 바꾸기 전으로 돌리고 저장한다 */
  undo: (proposalId: string) => Promise<void>;
  /** 지금 대화로 고칠 수 있는지(결제 전·로그인 전 등이면 false) — 대화 칸이 "대화로 고치기" 권유를 띄울지 정한다 */
  available?: () => boolean;
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

/** 새 작업실 머리줄 가운데 알약 등록 — 작업실 밖·휴대폰에서는 아무 일도 하지 않는다(그때는 칸 안에 예전처럼 그린다) */
export function useStudioHeaderCenter(node: ReactNode | null) {
  const nav = useStudioNav();
  const pane = useStudioPane();
  const tab = pane?.tab;
  useEffect(() => {
    if (!nav?.setHeaderCenter || !tab) return;
    nav.setHeaderCenter(tab, node);
  }, [nav, tab, node]);
  useEffect(() => () => { if (nav?.setHeaderCenter && tab) nav.setHeaderCenter(tab, null); }, [nav, tab]);
}
