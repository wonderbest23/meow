import { z } from "zod";

/*
 * 메인 홈페이지 문구 관리(어드민).
 *
 * 홈의 큰 글들을 어드민에서 고치고, 섹션을 통째로 숨길 수 있다. 여기 등록된
 * 자리만 고칠 수 있다 — 코드의 기본 문구가 원본이고, 저장된 값은 덮어쓰기다.
 * 빈 값으로 저장하면 기본 문구로 돌아간다.
 *
 * 표기 규칙(어드민 화면에도 안내):
 *   \n(줄바꿈) → 제목의 <br/>
 *   제목의 "|"  → 앞부분만 굵게 (히어로 제목)
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
  { id: "hero.eyebrow", group: "히어로(첫 화면)", label: "작은 머리글", def: "창업 10만원대로 시작하세요" },
  { id: "hero.title", group: "히어로(첫 화면)", label: "큰 제목", def: "사업,|오늘 하루면 충분합니다", hint: "| 앞부분이 굵게 표시됩니다" },
  { id: "hero.subtitle", group: "히어로(첫 화면)", label: "설명", def: "사업에 최적화된 질문에 클릭과 답변만 하면 됩니다.\n복잡한 사업계획서, 이제 쉽게 시작하세요.", multiline: true },
  { id: "hero.search", group: "히어로(첫 화면)", label: "검색창 안내 문구", def: "궁금한 창업, 무엇이든 물어보세요" },
  { id: "reviews.notice", group: "후기", label: "안내 문구", def: "디자인 확인용 예시입니다. 실제 후기가 아닙니다.", multiline: true, hint: "실제 후기가 쌓이기 전까지 표시되는 고지입니다" },
  { id: "peek.caption", group: "홈페이지 미리보기 띠", label: "출처 표기", def: "디자인 Brainwave.io UI Kit · CC BY 4.0", hint: "이 킷은 CC BY 4.0 — 출처 표기가 이용 조건입니다" },
  { id: "stats.title", group: "숫자 요약", label: "제목", def: "숫자로 먼저 확인하세요" },
  { id: "method.eyebrow", group: "진행 방식", label: "눈썹", def: "진행 방식" },
  { id: "method.title", group: "진행 방식", label: "제목", def: "질문에 답하기만 하면\n문서가 순서대로 완성됩니다", multiline: true },
  { id: "method.subtitle", group: "진행 방식", label: "설명", def: "글쓰기는 인공지능이 맡습니다. 사용자는 사업에 대한 사실만 답하면 됩니다.", multiline: true },
  { id: "deliverables.eyebrow", group: "문서 유형", label: "눈썹", def: "문서 유형" },
  { id: "deliverables.title", group: "문서 유형", label: "제목", def: "목적에 맞는 문서를\n골라서 만드세요", multiline: true },
  { id: "deliverables.subtitle", group: "문서 유형", label: "설명", def: "한 번 입력한 답변은 다른 유형에 그대로 이어집니다. 문서는 PDF와 수정 가능한 Word로, 발표자료는 PPT로 받을 수 있습니다.", multiline: true },
  { id: "evidence.title", group: "근거 확인", label: "제목", def: "인공지능의 답을\n그대로 믿게 하지 않습니다", multiline: true },
  { id: "price.eyebrow", group: "가격", label: "눈썹", def: "이용 안내" },
  { id: "price.title", group: "가격", label: "제목", def: "무료로 품질을 확인한 뒤,\n필요한 문서만 결제합니다", multiline: true },
  { id: "price.subtitle", group: "가격", label: "설명", def: "완성 샘플 3부를 로그인 없이 전체 열람할 수 있고, 어떤 문서든 앞 2개 섹션은 무료로 만들어 볼 수 있습니다. 결제는 문서 1부 단위입니다.", multiline: true },
  { id: "trial.title", group: "마지막 권유", label: "제목", def: "먼저 만들어 보고\n결정하세요", multiline: true },
  { id: "faq.title", group: "자주 묻는 질문", label: "제목", def: "궁금한 점을 미리 확인해 보세요" },
  { id: "faq.subtitle", group: "자주 묻는 질문", label: "설명", def: "더 궁금한 것은 화면 오른쪽 아래 상담 창에 물어보세요.", multiline: true },
];

/** 홈에서 통째로 숨길 수 있는 섹션 — 히어로는 페이지의 뼈대라 제외 */
export const HIDEABLE_SECTIONS: Array<{ id: string; label: string }> = [
  { id: "reviews", label: "후기 (첫 화면 아래 별점·후기 카드)" },
  { id: "peek", label: "홈페이지 미리보기 띠 (킷 랜딩 10종)" },
  { id: "stats", label: "숫자 요약 (숫자로 먼저 확인하세요)" },
  { id: "method", label: "진행 방식 (4단계)" },
  { id: "deliverables", label: "문서 유형" },
  { id: "evidence", label: "근거 확인 방식" },
  { id: "price", label: "가격" },
  { id: "trial", label: "마지막 권유 (먼저 만들어 보고 결정하세요)" },
  { id: "faq", label: "자주 묻는 질문" },
];

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
