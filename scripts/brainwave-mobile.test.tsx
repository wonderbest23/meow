import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { renderBrainwaveMobile, BRAINWAVE_MOBILE } from "../components/brainwave-mobile";
import { loadBrainwavePageServer } from "../lib/landing/brainwave/load";
import { KO_0_2226 } from "../lib/landing/brainwave/ko/0-2226";
import { KO_0_1102 } from "../lib/landing/brainwave/ko/0-1102";

/*
 * 손으로 짠 킷 모바일판이 실제 한글 문구·킷 자산으로 온전히 그려지는가.
 *
 * 원칙 검증: 문구는 하드코딩이 아니라 노드 id 로 읽는다 — 오버라이드를 바꾸면
 * 화면도 바뀌어야 하고, 오버라이드가 없으면 킷 원문(영문)이 나와야 한다.
 */
async function main() {
  const cases = [
    { id: "0-2226", ko: KO_0_2226(), musts: ["새벽커피", "매장 고르기", "자리 예약", "자주 앉는 자리", "단골이 늘어나는 이유", "새 메뉴 소식 받기", "영업시간이 어떻게 되나요?", "© 2026"] },
    { id: "0-1102", ko: KO_0_1102(), musts: ["무인꽃집", "밤에도 꽃을 살 수 있는", "오늘의 꽃다발", "계절 꽃다발 M", "25,000원", "32,000원", "김민서", "© 2026"] },
    /* 0-290 은 ko/ 매핑이 없다 — 사용자 초안 오버라이드만 얹은 상태를 흉내 낸다 */
    { id: "0-290", ko: { "0:414": "테스트싱크 — 오늘 안에 뚫어 드립니다", "0:397": "제공 서비스" }, musts: ["테스트싱크", "제공 서비스", "Get Free Consultancy", "1M+", "93%", "Easy Booking", "bwmob-step-num", "bwmob-form"] },
  ] as const;

  for (const c of cases) {
    const page = await loadBrainwavePageServer(c.id);
    assert.ok(page, `${c.id} 페이지 로드`);
    const html = renderToStaticMarkup(<>{renderBrainwaveMobile(page!, { texts: c.ko as Record<string, string> }, undefined)}</>);
    for (const m of c.musts) assert.ok(html.includes(m), `${c.id}: "${m}" 이 화면에 있어야 한다`);
    /* 자산 경로가 페이지 폴더를 가리킨다 */
    assert.ok(html.includes(`/brainwave/${c.id}/`), `${c.id}: 킷 자산 경로`);
    /* 버튼은 링크 키(버튼 노드 id)를 단 채 그려진다 — 에디터의 버튼 판이 이 키로 저장한다 */
    assert.ok(html.includes("data-bw-btn"), `${c.id}: 버튼에 data-bw-btn`);
    /* 데스크톱 메뉴 줄(넓은 공백 벌림)은 모바일에 없어야 한다 */
    assert.ok(!/메뉴\s{4,}공간|꽃 고르기\s{4,}정기 구독/.test(html), `${c.id}: 가로 메뉴 줄 없음`);

    /* 오버라이드가 실제로 반영된다 — 하드코딩이면 여기서 걸린다 */
    const firstId = Object.keys(c.ko)[0];
    const edited = renderToStaticMarkup(<>{renderBrainwaveMobile(page!, { texts: { ...c.ko, [firstId]: "편집된상호999" } as Record<string, string> }, undefined)}</>);
    assert.ok(edited.includes("편집된상호999"), `${c.id}: 오버라이드 반영`);

    /* 오버라이드가 없으면 킷 원문으로 폴백 — 빈 화면이 되지 않는다 */
    const raw = renderToStaticMarkup(<>{renderBrainwaveMobile(page!, {}, undefined)}</>);
    assert.ok(raw.length > 3000, `${c.id}: 원문 폴백 렌더`);
  }

  assert.equal(Object.keys(BRAINWAVE_MOBILE).length, 3, "등록된 수제판 3장");
  console.log("brainwave-mobile: 세 페이지 렌더·오버라이드 반영·원문 폴백·메뉴 제거 확인");
}

main().catch((e) => { console.error(e); process.exit(1); });
