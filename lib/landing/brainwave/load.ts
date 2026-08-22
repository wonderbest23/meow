import type { BrainwavePageData } from "../../../components/brainwave-page";
import { brainwavePage } from "./catalog";

/*
 * 서버에서 킷 페이지 트리를 읽는다 — 공개 페이지는 첫 HTML 에 글이 다 들어
 * 있어야 한다(검색·미리보기 카드). 클라이언트 쪽 loadBrainwavePage 와 같은 파일.
 */
export async function loadBrainwavePageServer(id: string): Promise<BrainwavePageData | null> {
  if (!brainwavePage(id)) return null;
  try {
    const m = await import(`./pages/${id}.json`);
    return (m.default ?? m) as BrainwavePageData;
  } catch {
    return null;
  }
}
