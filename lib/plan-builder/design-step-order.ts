import type { BusinessDesign } from "./coach-design";
import type { IndustryPlaybook } from "./industry-playbooks";

/*
 * 사업 설계(AI 사업안)의 신고·등록 순서를 업종 가이드 순서와 맞춰 본다(규칙, AI 0회).
 * 2026-10-22 캔들 스토어: 사업안 요약은 '④ 신고번호를 받은 뒤 사업자등록·통신판매업 신고'였는데,
 * 업종 가이드는 안전확인 신고 서류에 사업자등록증 사본이 들어가 사업자등록을 먼저 하라고 했다.
 * 글을 다시 쓰지는 않는다 — 어긋난 칸 끝에 바른 순서를 한 문장으로 붙인다(사장님이 읽는 글이라 해요체).
 */
type Key = "registration" | "safety" | "mailorder";
const LABEL: Record<Key, string> = { registration: "사업자등록", safety: "안전확인 신고", mailorder: "통신판매업 신고" };
/* 가이드 단계 제목에서 그 일을 찾는 말 */
const STEP_TITLE: Record<Key, RegExp> = {
  registration: /사업자\s*등록/,
  safety: /안전기준\s*확인|신고번호|시험기관/,
  mailorder: /통신판매업/,
};
/* 사업안 글에서 그 일을 '한다'는 말 — '대상인지 확인·문의'처럼 묻기만 하는 말은 뺀다 */
const DOES: Record<Exclude<Key, "registration">, RegExp> = {
  safety: /(신고번호|안전기준\s*확인|안전확인\s*신고|안전\s*확인(?:을|를)?\s*(?:받|마치|끝))(?![^.\n]{0,10}(?:대상|여부|인지|문의|물어|필요한지))/,
  mailorder: /통신판매업(?:\s*신고)?(?![^.\n]{0,10}(?:대상|여부|인지|문의|물어|필요한지))/,
};
const REGISTRATION = /사업자\s*등록/;
/* 'B를 받은 뒤(후·다음) 사업자등록' — 한 문장 안의 명시적인 앞뒤 */
const AFTER = (b: RegExp) => new RegExp(`${b.source}[^.\\n]{0,40}?(?:받은|마친|끝낸|끝난|한|된|나온)\\s*(?:뒤|후|다음)[^.\\n]{0,30}?사업자\\s*등록`);

/** 가이드에서 각 일의 순서(단계 번호). 제목에 없으면 설명에서 찾는다 */
function guideRank(playbook: IndustryPlaybook, key: Key): number {
  const byTitle = playbook.steps.findIndex(step => STEP_TITLE[key].test(step.title));
  if (byTitle >= 0) return byTitle;
  return key === "mailorder" ? playbook.steps.findIndex(step => /통신판매업\s*신고/.test(step.detail)) : -1;
}

/** 번호(①, 1., →)로 나눈 순서 조각 */
function ordered(text: string): string[] {
  const parts = text.split(/(?=[①-⑳])|(?:^|\s)(?=\d{1,2}[.)]\s)|\s*→\s*/).map(part => part.trim()).filter(Boolean);
  return parts.length >= 2 ? parts : [];
}

/** 이 글이 가이드 순서와 어긋나게 '사업자등록'을 뒤에 두었는지. 어긋난 일 이름을 돌려준다 */
export function registrationOrderConflict(text: string, playbook: IndustryPlaybook): Key | null {
  const registration = guideRank(playbook, "registration");
  if (registration < 0 || !REGISTRATION.test(text)) return null;
  for (const key of ["safety", "mailorder"] as const) {
    const rank = guideRank(playbook, key);
    if (rank < 0 || rank < registration) continue;
    if (AFTER(DOES[key]).test(text)) return key;
    const parts = ordered(text);
    const regAt = parts.findIndex(part => REGISTRATION.test(part));
    const laterAt = parts.findIndex(part => DOES[key].test(part) && !REGISTRATION.test(part));
    if (regAt >= 0 && laterAt >= 0 && laterAt < regAt) return key;
  }
  return null;
}

/** 바른 순서 한 문장 — 가이드의 등록 단계 설명에 이유('…서류에 사업자등록증 사본이 들어가니')가 있으면 함께 */
export function registrationOrderNote(playbook: IndustryPlaybook): string {
  const keys = (["registration", "safety", "mailorder"] as const).filter(key => guideRank(playbook, key) >= 0).sort((a, b) => guideRank(playbook, a) - guideRank(playbook, b));
  const reason = playbook.steps[guideRank(playbook, "registration")]?.detail.match(/[^.]*(?:사업자등록증|먼저)[^.]*\./)?.[0]?.trim();
  return `순서 바로잡기: 업종 안내 순서는 ${keys.map(key => LABEL[key]).join(" → ")}예요. 사업자등록을 먼저 해요.${reason ? ` ${reason.replace(/니 먼저 등록해요\.$/, "요.")}` : ""}`;
}

/**
 * 사업안의 글 칸마다 순서를 보고, 어긋난 칸 끝에 바른 순서를 붙인다. 고친 칸 수를 함께 돌려준다.
 * 칸 길이 한도(600자)를 넘지 않게 원래 글을 줄여서라도 바로잡는 문장은 남긴다.
 */
export function enforceDesignStepOrder(design: BusinessDesign, playbook: IndustryPlaybook | null): { design: BusinessDesign; fixed: number } {
  if (!playbook) return { design, fixed: 0 };
  const note = registrationOrderNote(playbook);
  let fixed = 0;
  const fix = (value: string, max = 600) => {
    if (!registrationOrderConflict(value, playbook) || value.includes("순서 바로잡기")) return value;
    fixed++;
    const room = max - note.length - 1;
    const kept = value.length <= room ? value : `${value.slice(0, Math.max(0, room - 1)).trimEnd()}…`;
    return `${kept} ${note}`.trim();
  };
  const next: BusinessDesign = {
    ...design,
    startingPlan: { ...design.startingPlan, scope: fix(design.startingPlan.scope), connectionToVision: fix(design.startingPlan.connectionToVision), whyThis: fix(design.startingPlan.whyThis), notIncluded: design.startingPlan.notIncluded },
    alternatives: design.alternatives.map(item => ({ ...item, scope: fix(item.scope) })),
    assumptions: design.assumptions.map(item => ({ ...item, howToCheck: fix(item.howToCheck) })),
    nextAction: { ...design.nextAction, action: fix(design.nextAction.action), doneWhen: fix(design.nextAction.doneWhen) },
  };
  return { design: next, fixed };
}

/** 사업 설계 프롬프트에 넣을 업종 단계 순서(제목만) */
export function playbookStepOrder(playbook: IndustryPlaybook): string[] {
  return playbook.steps.map((step, index) => `${index + 1}. ${step.title} (${step.where})`);
}
