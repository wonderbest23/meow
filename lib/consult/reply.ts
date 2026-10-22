import { CONSULT_META_SEP, consultPickSchema, PROFILE_LABELS, type ConsultPick, type ConsultProfile, type ConsultReply } from "./domain";

/*
 * 상담 답 읽기 — 모델이 쓴 글에서 손님에게 보일 말과 카드·보기·추천을 꺼낸다.
 *
 * 예전엔 끝의 JSON 한 칸이라도 형식(보기 30자·추천 이유 4개·적합도 정수 …)을 넘으면 답 전체를 버리고
 * "지금은 상담을 이어가지 못했어요"를 보였다. 실제 AI 시험(2026-10-22)에서 1,561토큰을 쓰고도 손님은 그 문장만 봤다.
 * 이제 손님에게 보일 말이 있으면 그것을 먼저 살리고, 넘친 글은 자르고, 고칠 수 없는 칸만 버린다.
 * 버린 것은 이유 코드로만 남긴다(대화 내용은 로그에 남기지 않는다).
 */

export const CONSULT_MESSAGE_MAX = 2000;

export type ConsultParseResult =
  | { ok: true; reply: Omit<ConsultReply, "sources">; dropped: string[] }
  | { ok: false; reason: "empty_text" | "no_message"; dropped: string[] };

const clip = (value: unknown, max: number): string => {
  const text = typeof value === "number" || typeof value === "boolean" ? String(value) : typeof value === "string" ? value : "";
  const one = text.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`;
};

/*
 * 손님에게 보이면 안 되는 내부 메모 — 계획서 검토 지적(“재무 숫자 오류 … 수정 필요”), 섹션·검토 점수 같은 말.
 * 상담 카드(지금까지 파악한 내용)는 손님이 말한 조건만 담는다.
 */
export function isInternalNote(line: string): boolean {
  return /수정\s*필요|보완\s*필요|고쳐야|오류|검토\s*(지적|결과)|AI\s*검토|완성도\s*\d|섹션|\[(높음|중간|낮음|치명|주의)\]/.test(line);
}

/** 잘린 JSON 을 닫아 본다 — 끝에서부터 값이 끝난 자리를 찾아 열린 괄호를 닫는다 */
export function parseLooseJsonObject(raw: string): Record<string, unknown> | null {
  let text = raw.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*(?:```)?\s*$/);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf("{");
  if (start < 0) return null;
  text = text.slice(start);
  const tryParse = (value: string) => {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
    } catch { return null; }
  };
  const whole = tryParse(text);
  if (whole) return whole;
  /* 완전한 객체 뒤에 군말이 붙은 경우 — 첫 객체가 닫히는 자리까지 */
  const closers = (prefix: string): string | null => {
    const stack: string[] = [];
    let inString = false;
    let escaped = false;
    for (const ch of prefix) {
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === "\"") inString = false;
        continue;
      }
      if (ch === "\"") inString = true;
      else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
      else if (ch === "}" || ch === "]") { if (stack.pop() !== ch) return null; }
    }
    if (inString) return null;
    return stack.reverse().join("");
  };
  /* 뒤에서부터 값이 끝난 자리(닫는 괄호·따옴표·숫자·true/false/null)를 골라 닫아 본다 */
  for (let end = text.length, tries = 0; end > 1 && tries < 400; end--) {
    const ch = text[end - 1];
    if (!/[}\]"\deul]/.test(ch)) continue;
    tries++;
    const prefix = text.slice(0, end).replace(/,\s*$/, "");
    const close = closers(prefix);
    if (close === null) continue;
    const parsed = tryParse(prefix + close);
    if (parsed) return parsed;
  }
  return null;
}

function salvageProfile(raw: unknown, dropped: string[]): ConsultProfile {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) { if (raw !== undefined) dropped.push("profile"); return {}; }
  const out: Record<string, string> = {};
  const limits: Record<string, number> = { job: 60, region: 60, budget: 60, targetIncome: 60, interest: 80, experience: 120 };
  for (const key of Object.keys(PROFILE_LABELS)) {
    const value = (raw as Record<string, unknown>)[key];
    if (value === undefined || value === null || value === "") continue;
    const text = Array.isArray(value) ? clip(value.map((item) => clip(item, 60)).join(", "), limits[key] ?? 40) : clip(value, limits[key] ?? 40);
    if (text) out[key] = text; else dropped.push(`profile.${key}`);
  }
  return out as ConsultProfile;
}

/*
 * 목록 칸 — 모델은 배열 대신 한 줄 글('주말만 써도 돼요. 장비가 있으면 …')이나 {text: …} 객체로 쓰기도 한다.
 * 재검증(2026-10-22 2차): 추천 카드의 why·watch 가 글로 와서 통째로 버려져(reply_salvaged dropped picks.why/watch) 이유 없는 카드만 남았다.
 * 이제 글은 줄·글머리표로 나눠 받고, 넘친 개수·길이는 잘라서 남긴다.
 */
function listItems(raw: unknown): unknown[] | null {
  if (Array.isArray(raw)) return raw.map((item) => item && typeof item === "object" && !Array.isArray(item) ? Object.values(item as Record<string, unknown>).find((value) => typeof value === "string") ?? "" : item);
  if (typeof raw === "string") return raw.split(/\n+|\s*[•▪︎◦]\s*|\s+-\s+|;\s*/).map((item) => item.replace(/^\s*(?:[-*]|\d+[.)])\s*/, ""));
  return null;
}

function salvageList(raw: unknown, max: number, count: number, name: string, dropped: string[]): string[] {
  if (raw === undefined || raw === null) return [];
  const list = listItems(raw);
  if (!list) { dropped.push(name); return []; }
  const items = list.map((item) => clip(item, max)).filter(Boolean);
  const kept = items.filter((item) => !isInternalNote(item));
  if (kept.length < items.length) dropped.push(`${name}.internal`);
  if (kept.length > count) dropped.push(`${name}.count`);
  return [...new Set(kept)].slice(0, count);
}

/** 적합도 — 4.5, "4", "4/5", "80%", 0.8, "★★★★☆", "높음" 모두 1~5 로. 모르면 3 */
export function pickFit(value: unknown): number {
  const clamp = (n: number) => Math.min(5, Math.max(1, Math.round(n)));
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value > 0 && value < 1) return clamp(value * 5);
    if (value > 5 && value <= 100) return clamp(value / 20);
    return clamp(value);
  }
  if (typeof value !== "string") return 3;
  const text = value.trim();
  const stars = (text.match(/★/g) ?? []).length;
  if (stars) return clamp(stars);
  const ratio = text.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
  if (ratio && Number(ratio[2]) > 0) return clamp(Number(ratio[1]) / Number(ratio[2]) * 5);
  const percent = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (percent) return clamp(Number(percent[1]) / 20);
  const number = text.match(/\d+(?:\.\d+)?/);
  if (number) return pickFit(Number(number[0]));
  if (/매우\s*높|아주\s*높|최상/.test(text)) return 5;
  if (/높|상/.test(text)) return 4;
  if (/매우\s*낮|아주\s*낮/.test(text)) return 1;
  if (/낮|하/.test(text)) return 2;
  return 3;
}

export const PICK_REASON_MAX = 200;
export const PICK_REASON_COUNT = 6;

function salvagePicks(raw: unknown, dropped: string[]): ConsultPick[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) { dropped.push("picks"); return []; }
  const out: ConsultPick[] = [];
  for (const item of raw) {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const first = (...keys: string[]) => keys.map((key) => record[key]).find((value) => value !== undefined && value !== null);
    const candidate = {
      name: clip(first("name", "title", "item"), 40),
      fit: pickFit(first("fit", "score", "match")),
      why: salvageList(first("why", "reasons", "reason", "pros"), PICK_REASON_MAX, PICK_REASON_COUNT, "picks.why", dropped),
      watch: salvageList(first("watch", "cautions", "caution", "risks", "cons"), PICK_REASON_MAX, PICK_REASON_COUNT, "picks.watch", dropped),
    };
    const parsed = consultPickSchema.safeParse(candidate);
    if (parsed.success) out.push(parsed.data); else dropped.push("picks.item");
  }
  if (out.length > 3) dropped.push("picks.count");
  return out.slice(0, 3);
}

/**
 * 모델이 쓴 글 전체 → 답. 평문 + '===' + JSON 이 정해진 모양이고, 옛 형식(JSON 하나에 message)도 받는다.
 * 손님에게 보일 말이 없을 때만 실패다.
 */
export function parseConsultText(text: string | null | undefined): ConsultParseResult {
  const dropped: string[] = [];
  const full = (text ?? "").replace(/^﻿/, "");
  if (!full.trim()) return { ok: false, reason: "empty_text", dropped };
  const head = full.trimStart();
  let message = "";
  let meta: Record<string, unknown> | null = null;
  if (head.startsWith("{") || head.startsWith("```")) {
    meta = parseLooseJsonObject(head);
    if (!meta) dropped.push("json_invalid");
    message = typeof meta?.message === "string" ? meta.message : "";
  } else {
    const sepIndex = full.startsWith(CONSULT_META_SEP) ? 0 : full.indexOf(`\n${CONSULT_META_SEP}`);
    if (sepIndex >= 0) {
      message = full.slice(0, sepIndex);
      const rest = full.slice(sepIndex + (sepIndex === 0 ? 0 : 1) + CONSULT_META_SEP.length);
      if (rest.trim()) { meta = parseLooseJsonObject(rest); if (!meta) dropped.push("meta_invalid"); }
      else dropped.push("meta_missing");
    } else {
      /* 구분선을 빼먹고 끝에 JSON 을 붙인 경우 — 마지막 '{"profile"…' 부터 떼어 낸다 */
      const tail = full.search(/\n\s*\{\s*"(profile|choices|summary|picks|ready)"/);
      if (tail >= 0) { message = full.slice(0, tail); meta = parseLooseJsonObject(full.slice(tail)); if (!meta) dropped.push("meta_invalid"); }
      else { message = full; dropped.push("meta_missing"); }
    }
  }
  message = message.trim();
  if (!message) return { ok: false, reason: "no_message", dropped };
  if (message.length > CONSULT_MESSAGE_MAX) { message = `${message.slice(0, CONSULT_MESSAGE_MAX - 1).trimEnd()}…`; dropped.push("message.long"); }
  const m = meta ?? {};
  const ready = m.ready === true || m.ready === "true";
  return {
    ok: true,
    dropped,
    reply: {
      message,
      profile: salvageProfile(m.profile, dropped),
      choices: salvageList(m.choices, 30, 6, "choices", dropped),
      summary: salvageList(m.summary, 90, 6, "summary", dropped),
      picks: salvagePicks(m.picks, dropped),
      ready,
    },
  };
}

/*
 * 계획서를 상담에 실을지 — 손님이 이번에(또는 바로 앞에서) 그 계획서·사업을 가리켰을 때만.
 * 예전엔 계획서가 있으면 늘 실어서 "주말 부업 창업이 있을까요?"에 "계획서 속 빵집은…"으로 답했다.
 * 상담사의 말은 보지 않는다 — 계획서를 실은 답이 '계획서'를 말하면 다음 턴도 계속 끌려간다.
 */
export function consultRefersToPlan(message: string, recentUserTurns: string[], plan: { title?: string; industry?: string; name?: string }): boolean {
  const own = /(계획서|사업\s*계획|내\s*사업|제\s*사업|저희\s*(가게|사업|매장)|우리\s*(가게|사업|매장)|내\s*가게|제\s*가게|지금\s*(준비|쓰|하)는|재무|섹션|매출\s*계획|이\s*사업|그\s*사업|이\s*아이템|그\s*아이템)/;
  const words = [plan.title, plan.industry, plan.name]
    .flatMap((value) => (value ?? "").split(/[\s·,/()]+/))
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !/^(아파트|상가|동네|작은|아침|저녁|온라인|오프라인|매장|가게|사업|창업)$/.test(word));
  /* '빵집 말고 사진으로…'처럼 밀어낸 말은 가리킨 것이 아니다 */
  const mentions = (raw: string) => {
    const text = raw.replace(/\S+\s*(말고|빼고|대신|아니고|아닌|말구)/g, " ");
    return own.test(text) || words.some((word) => text.includes(word));
  };
  return mentions(message) || recentUserTurns.slice(-1).some(mentions);
}
