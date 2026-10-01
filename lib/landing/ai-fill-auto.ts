/*
 * 처음 열 때 자동으로 채울지 — 새로 만든 홈페이지만이 아니라, 만든 뒤 한 번도 채우지도
 * 고치지도 않은 홈페이지도 채운다. 첫 화면이 계획서를 불러오는 동안(10초 남짓) 새로고침하거나
 * 나가면 '방금 만듦' 신호를 놓쳐, 빈 카드·기본 문구 그대로 남는 일이 있었다(운영 점검).
 * 만든 뒤 저장한 적이 있으면(사장님 손이 닿았으면) 저절로 채우지 않는다.
 */
export function needsAutoAiFill(site: { createdAt: string; updatedAt: string; versions: unknown[]; draft: { pageData?: { brainwave?: unknown; aiFill?: unknown } | null } }): boolean {
  const data = site.draft.pageData;
  if (!data?.brainwave || data.aiFill || site.versions.length > 0) return false;
  const created = Date.parse(site.createdAt), updated = Date.parse(site.updatedAt);
  return Number.isFinite(created) && Number.isFinite(updated) && updated - created < 2000;
}

type FillMark = { draft: { pageData?: { aiFill?: { at?: string } | null } | null } };

/** 채우기 기록 시각(없으면 "") — 요청 전후를 견줘 새로 채워졌는지 본다 */
export function aiFillMark(site: FillMark | null | undefined): string {
  return site?.draft.pageData?.aiFill?.at ?? "";
}

/*
 * 채우기 답을 못 받았을 때(연결이 30초 남짓에서 끊김 등) 서버에는 이미 저장됐을 수 있다 — 운영 점검에서
 * 화면은 '하지 못했어요'인데 초안은 채워져 있었다. 요청 전과 채우기 기록이 달라졌으면 채워진 것으로 본다.
 */
export function aiFillLanded(before: string, site: FillMark | null | undefined): boolean {
  const after = aiFillMark(site);
  return Boolean(after) && after !== before;
}
