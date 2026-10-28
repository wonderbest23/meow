/*
 * 사업계획서 AI 채점 — 코드로 잴 수 없는 항목(최종본 1장 1·2·3·5·7·8·10·12번)을 1~5점으로.
 *
 * Anthropic 'Develop tests' 원문을 따른다:
 * - 상세하고 분명한 채점표, 결과는 점수만(1~5) — 순수한 서술 평가는 빠르게 모으기 어렵다.
 * - 채점 모델은 생각하게 한다(effort high + Sonnet 5.5 원문의 'Think the problem through before you answer.') — 판단이 복잡한 채점에서 정확도가 오른다.
 * - JSON 은 마지막 완전한 값을 읽고, 필드가 틀리면 한 번 다시 시도한다(Prompting Claude Sonnet 5.5).
 * - 생성한 모델과 다른 모델로 채점한다(계획서는 Opus 5.5, 채점은 Sonnet 5.5).
 * - AI 채점은 먼저 믿을 만한지 확인한 뒤 늘린다 — 전문가 채점(expert-sheet)과 비교해 맞춘다.
 * 'Prompting best practices' 원문: 긴 자료는 위, 지시는 아래 / XML 태그로 자료·지시 구분 / 지시에 이유를 붙인다.
 */
import type { LLMConfig } from "../../lib/llm/complete";

export const GRADER_MODEL = "claude-sonnet-5-5";
export const AI_ITEMS = [1, 2, 3, 5, 7, 8, 10, 12] as const;
export type AiItem = typeof AI_ITEMS[number];

/**
 * 항목별 채점표 — 1·3·5점의 모습을 확인할 수 있는 조건으로 적는다(원문: "자세하고 분명한 채점표").
 * 2026-10-10: 첫 채점표는 문장이 짧아 기존·v2·v3 빵집 계획서가 눈에 띄게 달라도 점수가 거의 같았다 → 조건을 구체화.
 */
export const RUBRIC: Record<AiItem, { name: string; why: string; anchors: [string, string, string] }> = {
  1: { name: "고객이 구체적인가", why: "구체적이어야 어디서 누구를 만날지 정해진다",
    anchors: ["'특정 연령대'처럼 막연하거나 고객을 다루지 않는다", "나이·지역·상황(언제·왜 사는지) 중 하나만 구체적이거나, 그 고객을 어디서 만날지가 없다", "나이·지역(동네·단지·역세권 단위)·상황 중 둘 이상이 구체적이고, 그 고객을 어디서 어떻게 만나 첫 판매를 할지 적혀 있다"] },
  2: { name: "팔 것과 손님이 얻는 것", why: "한 문장으로 말할 수 있어야 홍보 문구와 가격 설명이 나온다",
    anchors: ["무엇을 파는지 흐리다", "무엇을 파는지는 분명하지만 구성·가격·손님이 얻는 결과 중 일부가 막연하다", "팔 것의 구성과 가격, 손님이 얻는 결과가 한 문장으로 분명하다"] },
  3: { name: "주변 대안과 고를 이유", why: "손님은 늘 다른 선택지가 있다 — 동네 가게, 배달앱, 스마트스토어, 지인",
    anchors: ["손님이 지금 쓰는 대안을 다루지 않는다", "대안을 나열만 하거나, 우리를 고를 이유가 '품질이 좋다'처럼 막연하다", "손님이 지금 쓰는 대안 둘 이상을 구체적으로 적고, 대안마다 우리를 고를 구체적인 이유가 있다"] },
  5: { name: "시작 자금", why: "무엇에 얼마 드는지 알아야 모자랄 때 줄일 곳을 안다",
    anchors: ["시작에 드는 돈을 다루지 않는다", "총액이나 일부 항목만 있고, 금액을 어떻게 채울지가 없다", "보증금·인테리어·설비·재고·인허가·홍보·예비비 중 이 사업에 맞는 항목이 나뉘어 있고, 항목마다 금액이나 금액을 정할 방법(견적 등)이 있으며, 준비 예산과 비교된다"] },
  7: { name: "본전과 대표 몫", why: "본전은 사업 비용만 메운 상태라 대표가 가져가는 돈은 0원이다 — 이걸 모르면 본전을 넘기면 먹고살 수 있다고 착각한다(대표 개인 생활비는 이 계획서가 맡지 않는다, 2026-10-28 결정)",
    anchors: ["본전이 무엇을 메우는지, 대표가 가져갈 돈이 있는지 다루지 않는다", "본전은 있지만 본전에서 대표 몫이 0원이라는 점이나 본전을 넘긴 뒤 대표 몫이 흐리거나, 본전의 뜻이 장마다 다르다", "본전이 사업 비용만 메우는 판매량이고 그때 대표 몫이 0원이라는 점, 본전을 넘겨 1개 더 팔 때마다 대표 몫이 얼마인지가 숫자로 있고, 매출이 없을 때 버티는 기간이 있다"] },
  8: { name: "먼저 작게 팔아 보기와 확인할 가정", why: "큰돈을 쓰기 전에 가장 틀리기 쉬운 가정을 싸게 확인해야 한다",
    anchors: ["확인할 가정이나 시험 판매가 없다", "가정은 있지만 확인 방법이나 판단 기준이 막연하다", "틀리기 쉬운 가정 3개 정도와, 가정마다 사전 예약·시범 판매처럼 싸게 확인하는 방법과 '이 숫자면 바꾼다'는 기준이 있다"] },
  10: { name: "매달 볼 숫자와 다시 보기", why: "계획은 틀리기 마련이라 매달 숫자를 보고 고쳐야 한다",
    anchors: ["매달 확인할 숫자가 없다", "볼 숫자는 있지만 목표치나 다시 보는 때가 없다", "매달 볼 숫자 3개 정도와 각각의 목표치, 계획서를 다시 보는 때가 있다"] },
  12: { name: "짧고 읽기 쉬움", why: "대표가 바쁜 중에 읽고 바로 움직일 수 있어야 한다",
    anchors: ["길고 같은 숫자·문장이 여러 번 반복되어 핵심을 찾기 어렵다", "읽을 만하지만 군더더기, 반복, 어려운 말, 문장마다 붙은 표시가 있다", "장마다 첫 소제목과 첫 문단에서 결론을 알 수 있고, 짧고 쉬운 말이며 반복이 없다"] },
};

export function graderPrompt(input: { caseLabel: string; facts: string; sections: Record<string, string> }) {
  const documents = Object.entries(input.sections).map(([key, markdown], index) => `<section index="${index + 1}" key="${key}">\n${markdown}\n</section>`).join("\n");
  const rubric = AI_ITEMS.map(item => {
    const r = RUBRIC[item];
    return `<item id="${item}" name="${r.name}">\n왜 보는가: ${r.why}\n1점: ${r.anchors[0]}\n3점: ${r.anchors[1]}\n5점: ${r.anchors[2]}\n</item>`;
  }).join("\n");
  // 마지막 문장은 Prompting Claude Sonnet 5.5 'Reasoning tasks with JSON output' 원문 그대로 — 채점 정확도를 높인다
  const system = "당신은 한국 소상공인·예비 창업자의 사업계획서를 검토하는 창업 실무 전문가입니다. 이 계획서는 정부 지원사업 제출용이 아니라, 창업자 본인이 보고 바로 실행하려고 돈을 내고 산 문서입니다. 그래서 심사용 설득보다 '내일부터 무엇을 할지 알 수 있는가'를 봅니다.\n\nThink the problem through before you answer.";
  // 긴 자료(입력·계획서)를 위에, 채점 지시를 맨 아래에 둔다
  const user = `<inputs>\n<business>${input.caseLabel}</business>\n<founder_answers>\n${input.facts}\n</founder_answers>\n</inputs>\n<plan>\n${documents}\n</plan>\n<rubric>\n${rubric}\n</rubric>\n<instructions>\n위 계획서를 채점표의 각 항목에 대해 1~5점으로 매기세요. 2점과 4점은 그 사이입니다. 계획서에 실제로 적힌 내용만 보고, 창업자 답변에 있어도 계획서에 없으면 없는 것으로 봅니다. 결과는 다음 JSON 하나만 출력하세요. reasons에는 항목마다 점수를 정한 근거를 계획서 내용을 짚어 한 문장으로 씁니다(사람 채점과 맞춰 볼 때 씁니다): {"scores":{"1":n,"2":n,"3":n,"5":n,"7":n,"8":n,"10":n,"12":n},"reasons":{"1":"…","2":"…","3":"…","5":"…","7":"…","8":"…","10":"…","12":"…"}}\n</instructions>`;
  return { system, user };
}

export function parseScores(value: Record<string, unknown> | null): Record<AiItem, number> | null {
  const scores = value?.scores as Record<string, unknown> | undefined;
  if (!scores) return null;
  const out = {} as Record<AiItem, number>;
  for (const item of AI_ITEMS) {
    const score = Number(scores[String(item)]);
    if (!Number.isInteger(score) || score < 1 || score > 5) return null;
    out[item] = score;
  }
  return out;
}

export function parseReasons(value: Record<string, unknown> | null): Partial<Record<AiItem, string>> {
  const reasons = value?.reasons as Record<string, unknown> | undefined;
  return Object.fromEntries(AI_ITEMS.flatMap(item => typeof reasons?.[String(item)] === "string" ? [[item, String(reasons[String(item)]).slice(0, 300)]] : []));
}

/*
 * 원문 "Encourage reasoning": 채점 모델이 생각한 뒤 점수를 내야 판단이 복잡한 채점에서 정확해진다.
 * effort medium 에서는 Sonnet 5.5 가 생각을 건너뛰었다(출력 49토큰, 2026-10-10) → high 로 둔다.
 */
/** 답에서 마지막 JSON 객체를 읽는다(원문: 처음 '{'부터 마지막 '}'까지가 아니라 마지막 완전한 JSON 값을 읽는다) */
export function lastJsonObject(text: string): Record<string, unknown> | null {
  const end = text.lastIndexOf("}");
  for (let start = text.lastIndexOf("{", end); start >= 0; start = text.lastIndexOf("{", start - 1)) {
    try {
      const value = JSON.parse(text.slice(start, end + 1)) as unknown;
      if (value && typeof value === "object" && !Array.isArray(value) && "scores" in value) return value as Record<string, unknown>;
    } catch { /* 더 앞의 '{'에서 다시 */ }
  }
  return null;
}

export async function gradeByAi(config: LLMConfig, input: Parameters<typeof graderPrompt>[0]): Promise<{ scores: Record<AiItem, number>; reasons: Partial<Record<AiItem, string>> } | null> {
  const { completeText } = await import("../../lib/llm/complete");
  const { system, user } = graderPrompt(input);
  // 원문: 필드를 확인하고 실패하면 한 번 다시 시도한다(출력이 한도에서 끊기면 complete.ts 가 실패로 돌려준다)
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await completeText({ ...config, model: GRADER_MODEL }, { kind: "plan-eval-grade", system, user, maxOutputTokens: 4000, effort: "high", timeoutMs: 240_000, allowFallback: false, jsonObject: true });
    const result = text ? lastJsonObject(text) : null;
    const scores = parseScores(result);
    if (scores) return { scores, reasons: parseReasons(result) };
  }
  return null;
}
