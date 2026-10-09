/*
 * 사업계획서 AI 채점 — 코드로 잴 수 없는 항목(최종본 1장 1·2·3·5·7·8·10·12번)을 1~5점으로.
 *
 * Anthropic 'Develop tests' 원문을 따른다:
 * - 상세하고 분명한 채점표, 결과는 점수만(1~5) — 순수한 서술 평가는 빠르게 모으기 어렵다.
 * - 채점 모델은 생각하게 한다(effort) — 판단이 복잡한 채점에서 정확도가 오른다.
 * - 생성한 모델과 다른 모델로 채점한다(계획서는 Opus 5.5, 채점은 Sonnet 5.5).
 * - AI 채점은 먼저 믿을 만한지 확인한 뒤 늘린다 — 전문가 채점(expert-sheet)과 비교해 맞춘다.
 * 'Prompting best practices' 원문: 긴 자료는 위, 지시는 아래 / XML 태그로 자료·지시 구분 / 지시에 이유를 붙인다.
 */
import type { LLMConfig } from "../../lib/llm/complete";

export const GRADER_MODEL = "claude-sonnet-5-5";
export const AI_ITEMS = [1, 2, 3, 5, 7, 8, 10, 12] as const;
export type AiItem = typeof AI_ITEMS[number];

/** 항목별 채점표 — 1·3·5점의 모습을 구체적으로 적는다(채점 일관성) */
export const RUBRIC: Record<AiItem, { name: string; why: string; anchors: [string, string, string] }> = {
  1: { name: "고객이 구체적인가", why: "구체적이어야 어디서 누구를 만날지 정해진다",
    anchors: ["'특정 연령대'처럼 막연하거나 고객이 없다", "나이·지역·상황 중 하나만 구체적이다", "나이·지역·상황 중 둘 이상이 구체적이고, 그 고객을 실제로 어디서 만날지 떠올릴 수 있다"] },
  2: { name: "팔 것과 손님이 얻는 것", why: "한 문장으로 말할 수 있어야 홍보 문구와 가격 설명이 나온다",
    anchors: ["무엇을 파는지 흐리다", "무엇을 파는지는 분명하지만 손님이 얻는 것이 막연하다", "무엇을 팔고 손님이 무엇을 얻는지 한 문장으로 분명하다"] },
  3: { name: "주변 대안과 고를 이유", why: "손님은 늘 다른 선택지가 있다 — 동네 가게, 배달앱, 스마트스토어, 지인",
    anchors: ["대안을 다루지 않는다", "대안을 나열만 하고 우리를 고를 이유가 약하다", "손님이 지금 쓰는 대안과 우리를 고를 구체적인 이유가 있다"] },
  5: { name: "시작 자금", why: "무엇에 얼마 드는지 알아야 모자랄 때 줄일 곳을 안다",
    anchors: ["시작에 드는 돈을 다루지 않는다", "총액이나 일부 항목만 있다", "보증금·인테리어·설비·재고·인허가·홍보·예비비 등 항목별로 있고 어디서 마련하는지 있다"] },
  7: { name: "내 생활비와 내 월급", why: "소상공인은 사업이 사장님 생활비까지 감당해야 하는 경우가 많다",
    anchors: ["사장님 생활비·월급을 다루지 않는다", "언급만 있고 금액이나 버틸 기간이 없다", "생활비, 가져갈 월급, 모자랄 때 버틸 기간이 숫자로 있다"] },
  8: { name: "먼저 작게 팔아 보기와 확인할 가정", why: "큰돈을 쓰기 전에 가장 틀리기 쉬운 가정을 싸게 확인해야 한다",
    anchors: ["확인할 가정이나 시험 판매가 없다", "가정은 있지만 확인 방법이 막연하다", "틀리기 쉬운 가정 3개 정도와, 사전 예약·팝업·소량 판매처럼 싸게 확인하는 방법과 기준이 있다"] },
  10: { name: "매달 볼 숫자와 다시 보기", why: "계획은 틀리기 마련이라 매달 숫자를 보고 고쳐야 한다",
    anchors: ["매달 확인할 숫자가 없다", "볼 숫자는 있지만 언제 다시 볼지 없다", "매달 볼 숫자 3개 정도와 계획서를 다시 보는 때가 있다"] },
  12: { name: "짧고 읽기 쉬움", why: "창업자가 바쁜 중에 읽고 바로 움직일 수 있어야 한다",
    anchors: ["길고 반복이 많아 핵심을 찾기 어렵다", "읽을 만하지만 군더더기나 반복이 있다", "맨 앞에서 핵심을 알 수 있고, 장마다 짧고 반복이 없다"] },
};

export function graderPrompt(input: { caseLabel: string; facts: string; sections: Record<string, string> }) {
  const documents = Object.entries(input.sections).map(([key, markdown], index) => `<section index="${index + 1}" key="${key}">\n${markdown}\n</section>`).join("\n");
  const rubric = AI_ITEMS.map(item => {
    const r = RUBRIC[item];
    return `<item id="${item}" name="${r.name}">\n왜 보는가: ${r.why}\n1점: ${r.anchors[0]}\n3점: ${r.anchors[1]}\n5점: ${r.anchors[2]}\n</item>`;
  }).join("\n");
  const system = "당신은 한국 소상공인·예비 창업자의 사업계획서를 검토하는 창업 실무 전문가입니다. 이 계획서는 정부 지원사업 제출용이 아니라, 창업자 본인이 보고 바로 실행하려고 돈을 내고 산 문서입니다. 그래서 심사용 설득보다 '내일부터 무엇을 할지 알 수 있는가'를 봅니다.";
  // 긴 자료(입력·계획서)를 위에, 채점 지시를 맨 아래에 둔다
  const user = `<inputs>\n<business>${input.caseLabel}</business>\n<founder_answers>\n${input.facts}\n</founder_answers>\n</inputs>\n<plan>\n${documents}\n</plan>\n<rubric>\n${rubric}\n</rubric>\n<instructions>\n위 계획서를 채점표의 각 항목에 대해 1~5점으로 매기세요. 2점과 4점은 그 사이입니다. 계획서에 실제로 적힌 내용만 보고, 창업자 답변에 있어도 계획서에 없으면 없는 것으로 봅니다. 결과는 다음 JSON 하나만 출력하세요: {"scores":{"1":n,"2":n,"3":n,"5":n,"7":n,"8":n,"10":n,"12":n}}\n</instructions>`;
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

export async function gradeByAi(config: LLMConfig, input: Parameters<typeof graderPrompt>[0]): Promise<Record<AiItem, number> | null> {
  const { completeJson } = await import("../../lib/llm/complete");
  const { system, user } = graderPrompt(input);
  const result = await completeJson({ ...config, model: GRADER_MODEL }, { kind: "plan-eval-grade", system, user, maxOutputTokens: 4000, effort: "medium", timeoutMs: 180_000, allowFallback: false });
  return parseScores(result);
}
