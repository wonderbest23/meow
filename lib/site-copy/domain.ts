import { z } from "zod";

/*
 * 메인 홈페이지 문구 관리(어드민).
 *
 * 홈의 첫 화면 문구를 어드민에서 고친다. 여기 등록된
 * 자리만 고칠 수 있다 — 코드의 기본 문구가 원본이고, 저장된 값은 덮어쓰기다.
 * 빈 값으로 저장하면 기본 문구로 돌아간다.
 *
 * 표기 규칙(어드민 화면에도 안내):
 *   \n(줄바꿈) → 제목의 <br/>
 */
export type SiteCopyField = {
  id: string;
  label: string;
  group: string;
  def: string;
  multiline?: boolean;
  hint?: string;
};

export const SITE_COPY_FIELDS: SiteCopyField[] = [
  { id: "chatHome.eyebrow", group: "첫 화면", label: "작은 머리글", def: "대화로 만드는 내 사업계획서" },
  { id: "chatHome.title", group: "첫 화면", label: "큰 제목", def: "오늘창업" },
  { id: "chatHome.subtitle", group: "첫 화면", label: "설명", def: "아이디어만 있어도, 이미 운영 중이어도 괜찮아요.\n대화로 정리하고, 내 사업에 맞는 계획으로 만드세요.", multiline: true },
];

/** 이용 조건과 기능 안내는 구현에 맞춰 코드에서 관리한다. */
export const HIDEABLE_SECTIONS: Array<{ id: string; label: string }> = [];

const FIELD_IDS = new Set(SITE_COPY_FIELDS.map((f) => f.id));
const SECTION_IDS = new Set(HIDEABLE_SECTIONS.map((s) => s.id));

/*
 * 화면에서 고를 수 있는 섹션 — 자리 id 의 앞부분("price.title" → "price")이 곧
 * 섹션이다. 어드민은 실제 홈 화면 위에서 이 단위로 고르고 숨긴다.
 * 히어로는 페이지의 뼈대라 글만 고칠 수 있고 숨기지 못한다.
 */
export const EDIT_SECTIONS: Array<{ id: string; label: string; hideable: boolean }> = (() => {
  const out = new Map<string, { id: string; label: string; hideable: boolean }>();
  for (const field of SITE_COPY_FIELDS) {
    const id = field.id.split(".")[0];
    if (!out.has(id)) out.set(id, { id, label: field.group, hideable: SECTION_IDS.has(id) });
  }
  return [...out.values()];
})();

/** 그 섹션에 속한 글 자리들 */
export function fieldsForSection(sectionId: string) {
  return SITE_COPY_FIELDS.filter((field) => field.id.startsWith(`${sectionId}.`));
}

/*
 * 숨긴 것 — 섹션 id("reviews")뿐 아니라 글 한 조각 id("reviews.notice")도 들어간다.
 * 문구를 비우면 기본값으로 돌아가는 규칙 때문에, '이 문장만 없애기'는 숨김으로만 된다.
 */
export const siteCopySchema = z.object({
  texts: z.record(z.string(), z.string().max(2000)).default({}),
  hidden: z.array(z.string()).max(64).default([]),
});
export type SiteCopy = z.infer<typeof siteCopySchema>;

export const emptySiteCopy: SiteCopy = { texts: {}, hidden: [] };

/** 등록된 자리만 남기고, 기본 문구와 같거나 빈 값은 버린다(덮어쓰기만 저장) */
export function sanitizeSiteCopy(input: SiteCopy): SiteCopy {
  const texts: Record<string, string> = {};
  for (const [id, value] of Object.entries(input.texts)) {
    if (!FIELD_IDS.has(id)) continue;
    const def = SITE_COPY_FIELDS.find((f) => f.id === id)!.def;
    const v = value.replace(/\r\n/g, "\n");
    if (v.trim() === "" || v === def) continue;
    texts[id] = v;
  }
  const hidden = [...new Set(input.hidden.filter((id) => SECTION_IDS.has(id) || FIELD_IDS.has(id)))];
  return { texts, hidden };
}
