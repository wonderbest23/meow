import type { BrainwaveNode, BrainwavePageData } from "../../components/brainwave-page";
import { BUSINESS_TEMPLATE_PROFILES } from "./brainwave/business-content";
import { sectionNameKo } from "./brainwave/section-names";
import { mergeEditorAsyncPatch, type EditorOverrides } from "./editor-async";

/*
 * 작업실 '대화로 홈페이지 고치기'의 순수 계산 — 화면(HomepageScreen)은 요청·저장만 하고, 무엇이 어떻게 바뀌는지는 여기서 정한다.
 *
 *   AI 수정(POST …/landing/ai-edit)이 돌려준 { 노드id: 새 글 } →
 *   · 사장님이 읽는 이름('첫 화면 제목', '첫 화면 버튼 글' …)과 지금 글 · 바꿀 글의 목록
 *   · 적용: 편집기가 AI 결과를 받을 때와 같은 규칙(mergeEditorAsyncPatch) — 요청 뒤에 사장님이 고친 자리는 덮지 않는다
 *   · 되돌리기: 적용 전 값 묶음(스냅숏)으로 — 적용 뒤에 또 고친 자리는 건드리지 않는다
 * AI 지시문(프롬프트)은 서버 라우트에만 있다. 여기서는 손대지 않는다.
 */

/** 킷 정보의 필드 이름 → 사장님이 읽는 이름 */
const FIELD_LABELS: Record<string, string> = {
  businessName: "가게 이름", headline: "첫 화면 제목", description: "첫 화면 설명", cta: "버튼 글",
  offer: "상품·서비스 소개", customer: "손님 소개", price: "가격", image: "사진",
  offerLabel: "상품·서비스 소개 제목", customerLabel: "손님 소개 제목", priceLabel: "가격 제목",
  detailsTitle: "이용 안내 제목", contactTitle: "문의 제목", contactInvite: "문의 안내 글", contactDescription: "문의 설명",
  one: "이용 순서 1", two: "이용 순서 2", three: "이용 순서 3",
  visitTitle: "오시는 길 제목", address: "주소", addressLabel: "주소 제목", hoursLabel: "영업시간 제목", hours: "영업시간",
  worksTitle: "작업 사례 제목", servicesTitle: "서비스 소개 제목",
};

/* 최상위 구역 안쪽에서도 따로 부르는 게 나은 묶음(첫 화면 안의 맨 위 메뉴, 소개 글 안의 자주 묻는 질문 등) */
const INNER_SECTIONS: Array<[RegExp, string]> = [[/^header/i, "맨 위 메뉴"], [/faq/i, "자주 묻는 질문"], [/testimonial/i, "손님 후기"], [/pricing/i, "가격"]];

const pxTop = (value: string | undefined) => (value && /^-?[\d.]+px$/.test(value) ? parseFloat(value) : null);

/** 구역의 위쪽 끝(px) — 디자인 파일은 아래 구역부터 적혀 있어, 바뀐 곳을 위→아래로 늘어놓으려고 쓴다 */
function sectionTop(node: BrainwaveNode): number {
  let top = Infinity;
  const visit = (m: BrainwaveNode) => {
    if (m.tag === "#" || m.tag === "br") return;
    const y = pxTop(m.st?.top);
    if (y !== null) top = Math.min(top, y);
    if (m.st?.display === "contents" || y === null) m.ch?.forEach(visit);
  };
  visit(node);
  return top === Infinity ? Number.MAX_SAFE_INTEGER : top;
}

export type AiEditSlotInfo = { label: string; order: number };

/**
 * 글 자리마다 이름과 위→아래 순서. 킷 정보(BUSINESS_TEMPLATE_PROFILES)에 이름이 있으면 그것,
 * 없으면 들어 있는 구역 이름 + 버튼·입력칸·제목·글. 트리에서 못 찾은 자리는 목록에 없다(부르는 쪽이 '글 n').
 */
export function aiEditSlotInfo(page: BrainwavePageData, pageId: string = page.id): Record<string, AiEditSlotInfo> {
  const textIds = new Set(page.slots.text.map(slot => slot.id));
  const fields = BUSINESS_TEMPLATE_PROFILES[pageId]?.fields ?? {};
  const info: Record<string, AiEditSlotInfo> = {};
  let walk = 0;
  const sections = (page.root.ch ?? []).filter(node => node.tag !== "#" && node.tag !== "br");
  for (const section of sections) {
    const top = sectionTop(section);
    const sectionLabel = sectionNameKo(section.name);
    const visit = (node: BrainwaveNode, ancestors: string[]) => {
      walk++;
      if (node.id && textIds.has(node.id) && !info[node.id]) {
        const inner = ancestors.map(name => INNER_SECTIONS.find(([test]) => test.test(name))?.[1]).filter(Boolean).at(-1);
        const where = inner ?? sectionLabel;
        const field = fields[node.id] ? FIELD_LABELS[fields[node.id]] : undefined;
        const names = [...ancestors, node.name ?? ""];
        const kind = names.some(name => /button/i.test(name)) ? "버튼 글"
          : names.some(name => /input/i.test(name)) ? "입력칸 안내"
          : names.slice(-2).some(name => /title/i.test(name)) ? "제목" : "내용";
        /* 버튼 글은 어느 구역의 버튼인지 붙인다 — 첫 화면 버튼과 문의 양식 버튼이 같은 이름이 되지 않게 */
        const label = field ? (fields[node.id] === "cta" ? `${where === "구역" ? "" : `${where} `}버튼 글` : field) : `${where === "구역" ? "" : `${where} `}${kind}`;
        info[node.id] = { label, order: top * 100_000 + walk };
      }
      for (const child of node.ch ?? []) visit(child, node === section ? ancestors : [...ancestors, node.name ?? ""]);
    };
    visit(section, []);
  }
  return info;
}

/** 지금 보이는 글 — 고친 값이 있으면 그것, 없으면 킷 원문(서버 ai-edit 라우트와 같은 규칙) */
export function currentSlotText(id: string, texts: Record<string, string>, page: BrainwavePageData | null): string {
  return texts[id] ?? page?.slots.text.find(slot => slot.id === id)?.text ?? "";
}

export type AiEditChange = { id: string; label: string; before: string; after: string };

/**
 * AI 결과 → 바뀌는 곳 목록(위→아래). 지금 글과 같은 값·빈 값은 뺀다.
 * 이름이 겹치면 '상품·서비스 소개 1', '상품·서비스 소개 2'처럼 번호를 붙이고, 이름을 모르는 자리는 '글 n'.
 */
export function aiEditChanges(input: { patch: Record<string, string>; texts: Record<string, string>; page: BrainwavePageData | null; info?: Record<string, AiEditSlotInfo> }): AiEditChange[] {
  const info = input.info ?? (input.page ? aiEditSlotInfo(input.page) : {});
  const slotIndex = new Map((input.page?.slots.text ?? []).map((slot, index) => [slot.id, index]));
  const rows = Object.entries(input.patch)
    .filter(([, after]) => typeof after === "string" && after.trim())
    .map(([id, after]) => ({ id, after, before: currentSlotText(id, input.texts, input.page) }))
    .filter(row => row.before !== row.after)
    .map((row, index) => ({ ...row, base: info[row.id]?.label ?? "", order: info[row.id]?.order ?? Number.MAX_SAFE_INTEGER - 1000 + (slotIndex.get(row.id) ?? index) }))
    .sort((a, b) => a.order - b.order);
  const counts = new Map<string, number>();
  for (const row of rows) if (row.base) counts.set(row.base, (counts.get(row.base) ?? 0) + 1);
  const seen = new Map<string, number>();
  let unnamed = 0;
  return rows.map(row => {
    let label: string;
    if (!row.base) label = `글 ${++unnamed}`;
    else if ((counts.get(row.base) ?? 0) > 1) { const n = (seen.get(row.base) ?? 0) + 1; seen.set(row.base, n); label = `${row.base} ${n}`; }
    else label = row.base;
    return { id: row.id, label, before: row.before, after: row.after };
  });
}

/** 카드 맨 위 한 줄 — "첫 화면 제목과 버튼 글을 바꿔요", "첫 화면 제목 외 3곳을 바꿔요" */
export function aiEditSummary(changes: Array<{ label: string }>): string {
  if (!changes.length) return "바꿀 곳이 없어요";
  if (changes.length === 1) return `${changes[0].label}${hasBatchim(changes[0].label) ? "을" : "를"} 바꿔요`;
  if (changes.length === 2) return `${changes[0].label}${hasBatchim(changes[0].label) ? "과" : "와"} ${changes[1].label}${hasBatchim(changes[1].label) ? "을" : "를"} 바꿔요`;
  return `${changes[0].label} 외 ${changes.length - 1}곳을 바꿔요`;
}

function hasBatchim(word: string): boolean {
  const last = word.trim().at(-1) ?? "";
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  /* 숫자로 끝나면(이용 순서 1) 읽는 소리로 — 1·3·6·7·8·0 은 받침이 있다 */
  if (/\d/.test(last)) return "013678".includes(last);
  return false;
}

/** 비용 안내 — "AI 수정 토큰 1,240개 사용 · 남은 토큰 198,760개". 잔액을 못 읽었으면 사용량만 */
export function aiEditCostLine(usage?: { inputTokens?: number; outputTokens?: number } | null, balance?: { remaining?: number } | null): string | undefined {
  const used = Math.max(0, Math.round((Number(usage?.inputTokens) || 0) + (Number(usage?.outputTokens) || 0)));
  const remaining = typeof balance?.remaining === "number" && Number.isFinite(balance.remaining) ? Math.max(0, Math.round(balance.remaining)) : null;
  if (!used && remaining === null) return undefined;
  const parts = [used ? `AI 수정 토큰 ${used.toLocaleString("ko-KR")}개 사용` : "", remaining !== null ? `남은 토큰 ${remaining.toLocaleString("ko-KR")}개` : ""].filter(Boolean);
  return parts.join(" · ");
}

/**
 * AI 수정 요청이 실패했을 때 손님에게 보일 문장 — 다음에 할 일을 함께 말한다.
 * code·message 는 서버 응답({ error: { code, message } }). 한국어가 아닌 원문은 보이지 않는다.
 */
export function aiEditErrorMessage(status: number, code?: string | null, message?: string | null): string {
  const korean = typeof message === "string" && /[가-힣]/.test(message) && message.length <= 300 ? message.trim() : "";
  if (code === "TOKENS_REQUIRED") return "AI 수정 토큰이 부족해요 — 홈페이지 화면의 [토큰 충전하기]로 충전한 뒤 다시 말씀해 주세요.";
  if (code === "HOMEPAGE_PAYMENT_REQUIRED" || (status === 402 && !code)) return "홈페이지 결제 후 쓸 수 있어요 — 홈페이지 화면의 [결제하고 홈페이지 고치기]를 눌러 주세요.";
  if (code === "LOGIN_REQUIRED" || status === 401) return "로그인이 풀렸어요. 다시 로그인한 뒤 말씀해 주세요.";
  if (code === "PLAN_REQUIRED") return "계획서에서 만든 홈페이지만 대화로 고칠 수 있어요. 먼저 대화로 사업계획서를 만들어 주세요.";
  if (code === "BAD_REQUEST") return "무엇을 어떻게 바꿀지 조금 더 적어 주세요(2~1,000자).";
  /* 운영에서 아직 열지 않은 기능이면 미들웨어가 '없는 주소'(NOT_FOUND)로 답한다 */
  if (code === "NOT_FOUND") return "대화로 홈페이지 고치기는 아직 준비 중이에요. 지금은 홈페이지 화면의 미리보기에서 글을 눌러 직접 고쳐 주세요.";
  if (code === "PROJECT_NOT_FOUND") return "홈페이지를 찾지 못했어요. 홈페이지 화면을 새로 고친 뒤 다시 말씀해 주세요.";
  if (code === "PAGE_NOT_FOUND") return "이 디자인은 대화로 고칠 수 없어요. 홈페이지 화면의 편집기에서 직접 고쳐 주세요.";
  if (status === 429) return korean || "요청이 너무 많아요. 잠시 후 다시 말씀해 주세요.";
  if (code === "AI_FAILED") return korean || "AI 가 답을 만들지 못했어요. 토큰은 차감되지 않았어요. 다시 말씀해 주세요.";
  return korean || "홈페이지를 고치지 못했어요. 잠시 후 다시 말씀해 주세요.";
}

export type AiEditApplyResult = {
  /** 적용한 뒤의 글 묶음(저장할 것) */
  texts: Record<string, string>;
  applied: string[];
  /** 제안을 만든 뒤 사장님이 직접 고친 자리 — 덮지 않았다 */
  conflicts: string[];
  /** 되돌리기용 — 적용한 자리의 적용 전 값(없던 자리는 null = 킷 원문으로) */
  snapshot: Record<string, string | null>;
};

/**
 * 제안 적용 — 편집기가 AI 결과를 받을 때와 같은 규칙(mergeEditorAsyncPatch).
 * before 는 제안을 만들 때 보낸 글 묶음: 그 뒤로 값이 바뀐 자리는 덮지 않고 conflicts 로 돌려준다.
 */
export function applyAiEditPatch(current: Record<string, string>, before: Record<string, string>, patch: Record<string, string>): AiEditApplyResult {
  const shell: EditorOverrides = { texts: current, images: {}, links: {}, sizes: {}, hidden: [], order: [] };
  const merged = mergeEditorAsyncPatch(shell, 0, { session: 0, kind: "texts", before, changes: patch });
  const snapshot: Record<string, string | null> = {};
  for (const id of merged.applied) snapshot[id] = Object.prototype.hasOwnProperty.call(current, id) ? current[id] : null;
  return { texts: merged.state.texts, applied: merged.applied, conflicts: merged.conflicts, snapshot };
}

/**
 * 되돌리기 — 스냅숏 값으로. 적용한 값이 그대로 남은 자리만 되돌리고, 적용 뒤에 또 고친 자리는 그대로 둔다(kept).
 * 스냅숏이 null 인 자리는 고친 값을 지워 킷 원문으로 돌아간다.
 */
export function undoAiEditPatch(current: Record<string, string>, snapshot: Record<string, string | null>, appliedValues: Record<string, string>) {
  const texts = { ...current };
  const restored: string[] = [], kept: string[] = [];
  for (const [id, previous] of Object.entries(snapshot)) {
    if (texts[id] !== appliedValues[id]) { kept.push(id); continue; }
    if (previous === null) delete texts[id]; else texts[id] = previous;
    restored.push(id);
  }
  return { texts, restored, kept };
}
