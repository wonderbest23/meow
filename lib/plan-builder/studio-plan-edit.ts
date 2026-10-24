/*
 * 작업실(/plan/studio) 3단계 — 계획서 칸의 '이 장을 대화로 고치기'.
 * 계획서 칸은 장 머리의 단추로 대화 칸에 "이 장 고치기" 입력창을 열어 달라고만 한다(nav.composeInChat).
 * 고치기 자체는 원래 있던 채팅 수정(action "edit" → 바꿀 사실 카드 → "edit-apply"/"edit-dismiss")을 그대로 쓴다 —
 * 그 길은 장을 고르는 값이 없고 사업 사실(답변)만 바꾸므로, 장 이름은 손님 말 앞에 붙는 짧은 안내 글로만 넘긴다(AI 지시문은 그대로).
 * 화면 코드에 기대지 않는 순수 함수만 둔다 — 테스트: scripts/studio-plan-edit.test.ts
 */
import { classifyEditRequest } from "./intake-edit-filter";

/** 채팅 수정 한 번에 보낼 수 있는 글자 수 — 서버(intake-service 의 edit_too_long)와 같다 */
export const PLAN_EDIT_MAX_LENGTH = 1200;

/** 입력창 위에 보일 이름 — 예: "3장 시장과 고객 고치기" */
export function planChapterEditLabel(number: number, title: string): string {
  return `${number}장 ${title.replace(/\s+/g, " ").trim()} 고치기`;
}

/**
 * 계획서 칸이 대화 칸에 보내는 요청(StudioComposeRequest 와 같은 모양).
 * sectionId 는 그 장의 첫 항목 열쇠(예: "market/size") — 문서 안 자리(#sec-market-size)도 이 값으로 찾는다.
 */
export function planChapterComposeRequest(number: number, title: string, sectionKeys: readonly string[]): { target: "plan-section"; label: string; sectionId?: string } {
  const sectionId = sectionKeys.find(key => key.trim());
  return { target: "plan-section", label: planChapterEditLabel(number, title), ...(sectionId ? { sectionId } : {}) };
}

/**
 * 대화 칸이 '이 장 고치기'로 보낼 글 — 손님 말 앞에 "[3장 시장과 고객]"을 붙인다.
 * 서버의 규칙 거르기(classifyEditRequest)는 붙인 글 전체를 보므로, 붙여서 갈래가 달라지면(장 이름의 숫자·'톤' 같은 낱말 때문에
 * 말투 요청이 AI 로 넘어가는 등) 붙이지 않고 손님 말만 보낸다. 빈 말·너무 긴 말도 손님 말 그대로(서버가 정해진 답·오류로 끝낸다).
 */
export function planSectionEditMessage(label: string, text: string, maxLength = PLAN_EDIT_MAX_LENGTH): string {
  const body = text.trim();
  const hint = label.replace(/\s+/g, " ").replace(/\s*고치기$/, "").trim();
  if (!body || !hint) return body;
  const prefixed = `[${hint}] ${body}`;
  if (prefixed.length > maxLength) return body;
  return classifyEditRequest(prefixed) === classifyEditRequest(body) ? prefixed : body;
}

/**
 * 저장된 고치기 말을 화면에 나눠 보인다 — "[3장 시장과 고객] 가격을 올려 줘" → { tag: "3장 시장과 고객", body: "가격을 올려 줘" }.
 * 저장 형식(planSectionEditMessage 가 붙인 머리표)은 그대로 두고, 말풍선에는 본문만 · 장 이름은 작은 꼬리표로(PC 점검 2026-10-24).
 * 머리표가 없거나 본문이 비면 tag 없이 글 그대로.
 */
export function splitSectionEditMessage(text: string): { tag: string | null; body: string } {
  const match = /^\[(\d+장 [^\]\n]{1,60})\] ([\s\S]+)$/.exec(text);
  return match && match[2].trim() ? { tag: match[1], body: match[2] } : { tag: null, body: text };
}
