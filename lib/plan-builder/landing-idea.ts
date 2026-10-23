/*
 * 첫 화면(랜딩)에서 적은 사업 아이디어를 새 대화로 넘겨받는다.
 * 랜딩은 `/plan/chat?new=1&idea=<글>`로 보내고, 같은 글을 sessionStorage에도 잠깐(5분) 맡겨 둔다 —
 * 로그인을 거치며 주소의 idea가 빠져도 이어 받게. 읽은 뒤에는 주소와 보관본을 지워 새로고침·뒤로 가기로 다시 보내지 않는다.
 * 글은 입력창에 평범한 글자로만 넣는다(HTML로 그리지 않는다). 제어 문자는 지우고 1,200자(처음 사업 설명 한도)로 자른다.
 */

export const LANDING_IDEA_KEY = "oneul-landing-idea";
export const LANDING_IDEA_PARAM = "idea";
export const LANDING_IDEA_TTL_MS = 5 * 60 * 1000;
export const LANDING_IDEA_MAX = 1200;

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem" | "removeItem">;

export type LandingIdea = { text: string; source: "query" | "storage" };

/** 입력창에 넣을 수 있는 글로 다듬는다. 줄바꿈·탭은 두고 나머지 제어 문자와 폭 없는 공백은 지운다. 비면 "". */
export function normalizeLandingIdea(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const cleaned = raw
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex -- 제어 문자를 지우는 게 목적이다
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .replace(/[​-‍⁠﻿]/g, "")
    .trim();
  if (!cleaned) return "";
  let capped = cleaned.slice(0, LANDING_IDEA_MAX);
  // 이모지처럼 두 칸짜리 글자가 한도에서 반으로 잘리면 깨진 글자가 남는다 — 앞 반쪽은 버린다
  if (capped.length && /[\uD800-\uDBFF]$/.test(capped)) capped = capped.slice(0, -1);
  return capped.trim();
}

/** 보관본({text, at})이 유효하면(5분 이내) 글을 돌려준다. 시계가 조금 어긋난 경우(1분)까지는 받는다. */
function readStash(storage: ReadableStorage | null | undefined, now: number): string {
  if (!storage) return "";
  try {
    const value: unknown = JSON.parse(storage.getItem(LANDING_IDEA_KEY) ?? "null");
    if (!value || typeof value !== "object") return "";
    const { text, at } = value as { text?: unknown; at?: unknown };
    if (typeof at !== "number" || !Number.isFinite(at) || now - at > LANDING_IDEA_TTL_MS || at - now > 60_000) return "";
    return normalizeLandingIdea(text);
  } catch { return ""; }
}

/** 넘겨받을 아이디어 — 주소의 idea가 우선이고, 없으면 5분 안의 보관본. 지우지는 않는다(지우는 건 consume 쪽에서). */
export function readLandingIdea(search: string | URLSearchParams, storage: ReadableStorage | null | undefined, now: number): LandingIdea | null {
  const query = typeof search === "string" ? new URLSearchParams(search) : search;
  const fromQuery = normalizeLandingIdea(query.get(LANDING_IDEA_PARAM));
  if (fromQuery) return { text: fromQuery, source: "query" };
  const fromStorage = readStash(storage, now);
  return fromStorage ? { text: fromStorage, source: "storage" } : null;
}

/** idea만 뺀 검색 문자열("a=1&b=2" — 앞의 ? 없이). 다른 값(new, planId 등)은 그대로 둔다. */
export function withoutLandingIdea(search: string | URLSearchParams): string {
  const query = new URLSearchParams(search);
  query.delete(LANDING_IDEA_PARAM);
  return query.toString();
}

/** 보관본을 지운다(저장소를 못 써도 조용히 넘어간다). */
export function clearLandingIdea(storage: WritableStorage | null | undefined) {
  try { storage?.removeItem(LANDING_IDEA_KEY); } catch { /* 저장소가 막혀 있으면 지울 것도 없다 */ }
}

/** 로그인을 기다리는 동안 보관본을 새로 맡긴다 — 로그인하고 돌아올 때 주소의 idea가 빠져도 이어 받게. */
export function stashLandingIdea(storage: WritableStorage | null | undefined, text: string, now: number) {
  const value = normalizeLandingIdea(text);
  if (!value) return;
  try { storage?.setItem(LANDING_IDEA_KEY, JSON.stringify({ text: value, at: now })); } catch { /* 주소의 idea만으로도 이어진다 */ }
}
