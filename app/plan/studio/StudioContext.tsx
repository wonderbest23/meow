"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
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
  /**
   * PC 만 — 계획서 칸이 대화 칸의 '이렇게 바꿀게요'(채팅 수정 제안)가 닿는 장 이름('1장 사업 개요' 등)을 올린다. 제안이 없으면 null.
   * 계획서 칸이 이미 본문에서 바뀔 글을 찾고 있어(대화로 고치는 중 미리보기) 그 결과를 대화 칸 카드의 작은 칩으로도 보여 준다.
   * 계획서 칸이 한 번도 열리지 않았으면 아무도 올리지 않아 칩이 없다. 휴대폰과 작업실 밖에서는 이 함수들이 없다.
   */
  setEditPreviewChapters?: (preview: StudioEditPreviewChapters | null) => void;
  /** 대화 칸이 읽는다 — 올린 값이 바뀌면 listener 를 부른다. 돌려준 함수로 내린다(useStudioEditPreviewChapters 가 쓴다) */
  subscribeEditPreviewChapters?: (listener: () => void) => () => void;
  editPreviewChapters?: () => StudioEditPreviewChapters | null;
  /**
   * PC 만 — 계획서 칸이 대화로 고칠 수 있는 장 목록(장마다 '대화로 고치기'와 같은 요청)을 올린다. 대화 칸 입력창 왼쪽 아래
   * '고칠 곳 고르기'가 이 목록을 열어 장을 고르면 입력창을 그 장 고치기로 연다. 계획서 칸이 없거나 고칠 수 없으면 null.
   */
  setEditChapterList?: (list: StudioComposeRequest[] | null) => void;
  subscribeEditChapterList?: (listener: () => void) => () => void;
  editChapterList?: () => StudioComposeRequest[] | null;
  /**
   * lovable 구조 2단계 — 미리보기 판 위 막대(PC)와 휴대폰 아래 막대가 내려받기·한 장 요약 같은 도구를 대신 그린다.
   * true 면 칸은 같은 도구(계획서 머리줄의 '내려받기')를 머리줄에 또 올리지 않는다. 기능은 칸이 그대로 맡는다(useStudioCommand).
   */
  toolbarTools?: boolean;
  /** 이 칸의 가운데 알약을 위 막대에 올릴지 — false 면 칸이 자기 맨 위 줄에 그린다(계획서 장 고르기). 없으면 올린다 */
  headerCenterFor?: (tab: StudioTab) => boolean;
};

/*
 * 위 막대 · 아래 막대의 도구 단추 → 칸 — 칸의 기능(내려받기 창 · 한 장 요약 · 공개하기 · 다음 단계)은 칸 안에 그대로 있고,
 * 막대는 명령만 보낸다. 칸이 아직 없으면(처음 여는 칸) 명령을 잠깐(10초) 맡겨 두었다가 칸이 생기는 순간 넘긴다.
 */
export type StudioCommand = "plan-download" | "plan-summary" | "homepage-publish" | "launch-next" | "operations-add" | "chat-dictate" | "chat-summary" | "homepage-save";
const STUDIO_COMMAND_EVENT = "oneulstart:studio-command";
const COMMAND_TTL_MS = 10_000;
let queuedCommand: { command: StudioCommand; at: number } | null = null;
export function sendStudioCommand(command: StudioCommand) {
  queuedCommand = { command, at: Date.now() };
  window.dispatchEvent(new CustomEvent(STUDIO_COMMAND_EVENT, { detail: command }));
}
/** 칸이 명령을 받는다 — enabled 가 꺼져 있는 동안 온 명령은 맡겨 두었다가 켜지면 받는다 */
export function useStudioCommand(command: StudioCommand, handler: () => void, enabled = true) {
  const ref = useRef(handler);
  useEffect(() => { ref.current = handler; });
  useEffect(() => {
    if (!enabled) return;
    const take = () => { queuedCommand = null; ref.current(); };
    if (queuedCommand?.command === command && Date.now() - queuedCommand.at < COMMAND_TTL_MS) take();
    const listen = (event: Event) => { if ((event as CustomEvent<StudioCommand>).detail === command) take(); };
    window.addEventListener(STUDIO_COMMAND_EVENT, listen);
    return () => window.removeEventListener(STUDIO_COMMAND_EVENT, listen);
  }, [command, enabled]);
}

/** 채팅 수정 제안(작업 id)이 계획서에서 닿는 장 이름 — 대화 칸은 지금 카드의 작업 id 와 같을 때만 쓴다(앞 제안의 장이 남아 보이지 않게) */
export type StudioEditPreviewChapters = { jobId: string; chapters: string[] };

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

/**
 * 대화 칸의 '이렇게 바꿀게요' 카드가 쓰는 장 이름 — 계획서 칸이 올린 값이 이 작업(jobId)의 것일 때만 돌려준다.
 * 작업실 밖 · 휴대폰 · 계획서 칸이 아직 계산하지 않았으면 빈 목록이다.
 */
const NO_CHAPTERS: string[] = [];
const NO_SUBSCRIBE = () => () => {};
/** 대화 칸이 읽는다 — 계획서 칸이 올린 '대화로 고칠 수 있는 장' 목록(PC). 없으면 빈 배열 */
export function useStudioEditChapterList(): StudioComposeRequest[] {
  const nav = useStudioNav();
  const subscribe = nav?.subscribeEditChapterList ?? NO_SUBSCRIBE;
  const read = nav?.editChapterList;
  const snapshot = useCallback(() => read?.() ?? null, [read]);
  return useSyncExternalStore(subscribe, snapshot, () => null) ?? NO_COMPOSE;
}
const NO_COMPOSE: StudioComposeRequest[] = [];

export function useStudioEditPreviewChapters(jobId: string | null | undefined): string[] {
  const nav = useStudioNav();
  const subscribe = nav?.subscribeEditPreviewChapters ?? NO_SUBSCRIBE;
  const read = nav?.editPreviewChapters;
  const snapshot = useCallback(() => read?.() ?? null, [read]);
  const preview = useSyncExternalStore(subscribe, snapshot, () => null);
  return jobId && preview?.jobId === jobId ? preview.chapters : NO_CHAPTERS;
}
