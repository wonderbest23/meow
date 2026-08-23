import assert from "node:assert/strict";

/*
 * 공식 시장근거가 '실제로 검색된 원문'에만 근거하는지.
 *
 * 이 조사는 운영에서 100% 실패하고 있었다(Web Search cannot be used with JSON mode).
 * 고치면서 가장 위험한 것은 성공률을 올리려고 검증을 무르게 만드는 것이다 —
 * 모델이 그럴듯한 정부 주소를 지어내면 사업계획서에 가짜 출처가 박힌다.
 *
 * 그래서 여기서는 '통과하는 경우'보다 '버려야 하는 경우'를 더 많이 검사한다.
 */

type Src = { url: string; title?: string };

/** web_search 응답 모양 — action.sources 와 url_citation 두 경로 모두 */
function payloadOf(sources: Src[], text: string, annotations: Src[] = []) {
  return {
    output: [
      { type: "web_search_call", action: { sources } },
      {
        type: "message",
        content: [{
          type: "output_text",
          text,
          annotations: annotations.map((a) => ({ type: "url_citation", url: a.url, title: a.title ?? "원문" })),
        }],
      },
    ],
  };
}

const KOSIS = "https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1B040A3";
const MOIS = "https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000014";
const FAKE = "https://kosis.kr/statHtml/statHtml.do?orgId=999&tblId=DT_FAKE0000";
const BLOG = "https://blog.naver.com/some-marketer/223456789";

const ev = (url: string, metric = "총인구") =>
  ({ title: "주민등록 인구현황", metric, value: "51,217,221명", numericValue: 51217221, unit: "명", region: "대한민국", sourceName: "행정안전부", sourceUrl: url, observedAt: "2026-07-31", note: "참고지표", sourceExcerpt: "주민등록 기준 총인구" });

const body = (items: unknown[]) => JSON.stringify({ evidence: items });

async function main() {
  const { normalizeUrl, extractActualSearchSources, extractJsonObject } = await import("../lib/market/openai-research");
  const { isOfficialEvidenceUrl } = await import("../lib/market/domain");

  /* 운영 코드와 같은 순서로 거른다: 실제 검색 출처 → 공식 도메인 */
  function verify(sources: Src[], text: string, annotations: Src[] = []) {
    const cited = extractActualSearchSources(payloadOf(sources, text, annotations) as never);
    if (!cited.size) return { code: "WEB_SEARCH_NO_SOURCES" as const, kept: [] as string[] };
    const parsed = extractJsonObject(text) as { evidence?: Array<{ sourceUrl: string }> } | null;
    if (!parsed || !Array.isArray(parsed.evidence)) return { code: "WEB_SEARCH_PARSE_FAILED" as const, kept: [] };
    const kept = parsed.evidence.flatMap((item) => {
      const citation = cited.get(normalizeUrl(item.sourceUrl));
      if (!citation || !isOfficialEvidenceUrl(citation.url)) return [];
      return [citation.url]; // 저장되는 것은 모델이 쓴 주소가 아니라 검색이 돌려준 주소
    });
    if (!kept.length) return { code: "WEB_SEARCH_NO_CITED_EVIDENCE" as const, kept: [] };
    return { code: "OK" as const, kept };
  }

  // ── A. 실제 출처 2개 + 후보 2개 일치 → 2개 통과
  {
    const r = verify([{ url: KOSIS }, { url: MOIS }], body([ev(KOSIS), ev(MOIS, "세대수")]));
    assert.equal(r.code, "OK");
    assert.deepEqual(r.kept.sort(), [KOSIS, MOIS].sort(), "A: 인용된 공식 원문 2개가 통과해야 한다");
  }

  // ── B. 후보 주소가 검색 출처에 없음 → 폐기
  {
    const r = verify([{ url: KOSIS }], body([ev(MOIS)]));
    assert.equal(r.code, "WEB_SEARCH_NO_CITED_EVIDENCE", "B: 검색되지 않은 주소는 버려야 한다");
  }

  // ── C. 실제 검색 출처지만 공식 화이트리스트 밖 → 폐기
  {
    const r = verify([{ url: BLOG }], body([ev(BLOG)]));
    assert.equal(r.code, "WEB_SEARCH_NO_CITED_EVIDENCE", "C: 블로그는 실제로 검색됐어도 근거가 될 수 없다");
    assert.equal(isOfficialEvidenceUrl(BLOG), false, "C: 블로그는 공식 도메인이 아니다");
  }

  // ── D. 모델이 존재하지 않는 정부 주소를 지어냄 → 폐기 (가장 위험한 경우)
  {
    const r = verify([{ url: KOSIS }], body([ev(FAKE)]));
    assert.equal(r.code, "WEB_SEARCH_NO_CITED_EVIDENCE", "D: 공식 도메인이어도 검색에 없으면 버려야 한다");
    assert.equal(isOfficialEvidenceUrl(FAKE), true, "D: 도메인 검사만으로는 못 막는다 — 인용 검증이 필요한 이유");
  }

  // ── E. 검색 출처 0건 → NO_SOURCES
  {
    const r = verify([], body([ev(KOSIS)]));
    assert.equal(r.code, "WEB_SEARCH_NO_SOURCES", "E: 검색이 돌지 않았으면 그 사실이 드러나야 한다");
  }

  // ── F. 본문이 JSON이 아님 → 저장 없음
  {
    const r = verify([{ url: KOSIS }], "죄송합니다. 관련 통계를 찾지 못했습니다.");
    assert.equal(r.code, "WEB_SEARCH_PARSE_FAILED", "F: 평문 응답은 근거가 되지 않는다");
  }

  // ── G. 부분적으로 깨진 JSON → 복원하지 않는다
  {
    assert.equal(extractJsonObject('{"evidence":[{"title":"인구", "value":'), null, "G: 닫히지 않은 JSON은 복원하지 않는다");
    assert.equal(extractJsonObject('{"evidence":[{"title":}]}'), null, "G: 문법이 깨지면 null");
    const r = verify([{ url: KOSIS }], '{"evidence":[{"sourceUrl":"' + KOSIS + '"');
    assert.equal(r.code, "WEB_SEARCH_PARSE_FAILED", "G: 깨진 근거를 억지로 살리지 않는다");
  }

  // ── G2. 코드펜스·앞뒤 설명은 받아준다(모델이 흔히 덧붙이는 형태)
  {
    const r = verify([{ url: KOSIS }], "찾았습니다.\n```json\n" + body([ev(KOSIS)]) + "\n```\n확인해 주세요.");
    assert.equal(r.code, "OK", "G2: 코드펜스와 앞뒤 문장은 벗겨낼 수 있어야 한다");
    assert.deepEqual(r.kept, [KOSIS]);
  }

  // ── G3. 문자열 안의 중괄호가 파싱을 깨뜨리지 않는다
  {
    const withBrace = { ...ev(KOSIS), note: "표기 {주의} 필요" };
    const r = verify([{ url: KOSIS }], body([withBrace]));
    assert.equal(r.code, "OK", "G3: 문자열 내부 중괄호를 세면 안 된다");
  }

  // ── H. 같은 원문+지표 중복 → 저장 열쇠가 같아야 한다(route 의 merge 규칙)
  {
    const key = (e: { sourceUrl: string; metric: string }) => `${e.sourceUrl}|${e.metric}`;
    assert.equal(key(ev(KOSIS)), key(ev(KOSIS)), "H: 같은 원문·같은 지표는 같은 열쇠");
    assert.notEqual(key(ev(KOSIS)), key(ev(KOSIS, "세대수")), "H: 지표가 다르면 다른 열쇠");
  }

  // ── I. 기존 근거와 병합해도 기존 것이 사라지지 않는다
  {
    const existing = [ev(MOIS, "세대수")];
    const incoming = [ev(KOSIS, "총인구")];
    const unique = new Map(existing.map((e) => [`${e.sourceUrl}|${e.metric}`, e]));
    for (const e of incoming) unique.set(`${e.sourceUrl}|${e.metric}`, e);
    assert.deepEqual([...unique.values()].map((e) => e.sourceUrl).sort(), [KOSIS, MOIS].sort(), "I: 기존 근거가 남아야 한다");
  }

  // ── J. 저장되는 URL이 검색이 돌려준 그 주소와 정확히 같다
  {
    // 모델은 www·끝슬래시·추적파라미터가 붙은 형태로 적어 왔지만 같은 문서다
    const modelWrote = "http://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?utm_source=chatgpt&bbsId=BBSMSTR_000000000014#top";
    const r = verify([{ url: MOIS }], body([ev(modelWrote)]));
    assert.equal(r.code, "OK", "J: 표기 차이 때문에 멀쩡한 공식 자료를 버리면 안 된다");
    assert.deepEqual(r.kept, [MOIS], "J: 저장되는 주소는 검색이 돌려준 원본이어야 한다");
  }

  // ── J2. 정규화가 서로 다른 문서를 합치지 않는다
  {
    const a = "https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1B040A3";
    const b = "https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId=DT_1B040B5";
    assert.notEqual(normalizeUrl(a), normalizeUrl(b), "J2: 통계표를 구분하는 질의는 살려야 한다");
    assert.equal(normalizeUrl(a), normalizeUrl(a.replace("https://", "http://www.")), "J2: 프로토콜·www 는 같게");
    const plain = "https://kostat.go.kr/board.es";
    assert.equal(normalizeUrl(plain), normalizeUrl(plain + "/"), "J2: 경로 끝 슬래시는 같게");
    assert.equal(normalizeUrl(plain), normalizeUrl(plain + "#section2"), "J2: 조각(#)은 무시");
    assert.equal(normalizeUrl("javascript:alert(1)"), "", "J2: http/https 가 아니면 버린다");
    assert.equal(normalizeUrl("헛소리"), "", "J2: 주소가 아니면 버린다");
  }

  // ── K. url_citation annotation 경로도 실제 출처로 인정된다
  {
    const r = verify([], body([ev(KOSIS)]), [{ url: KOSIS }]);
    assert.equal(r.code, "OK", "K: annotation 만 있어도 실제 인용이다");
  }

  console.log("market-citation-guard: A~K 통과 — 지어낸 주소·비공식 출처·깨진 응답을 전부 차단");
}

main().catch((e) => { console.error(e); process.exit(1); });
