import { withIeyo } from "../josa";

/**
 * '운영 순서는 ① … ② … ⑥ …이에요.'처럼 한 문단에 붙은 단계를 목록으로 나눈다(실제 생성 2026-10-22: 여섯 단계가 9줄 한 문단).
 * 단계가 둘 이상일 때만 나누고, 아니면 null.
 * 재검증(2026-10-22 2차): 마지막 단계 뒤에 붙은 조언('…기록이에요. 대표님 혼자, 주 10시간…')은 단계가 아니라 따로 문단(outro)으로,
 * '운영 순서는:'처럼 말이 끊긴 머리말은 '운영 순서예요.'로 맺는다.
 */
export function splitCircledSteps(text: string): { intro: string; steps: string[]; outro: string } | null {
  const parts = text.split(/\s*([①-⑳])\s*/);
  if (parts.length < 5) return null;
  const steps: string[] = [];
  for (let index = 1; index < parts.length; index += 2) {
    const step = (parts[index + 1] ?? "").trim().replace(/[,，]\s*$/, "");
    if (step) steps.push(`${parts[index]} ${step}`);
  }
  if (steps.length < 2) return null;
  // 마지막 단계: 첫 문장 끝까지만 단계, 그 뒤 문장은 따로 문단
  let last = steps[steps.length - 1];
  let outro = "";
  const stop = last.search(/[.!?](?=\s)/);
  if (stop >= 0) { outro = last.slice(stop + 1).trim(); last = last.slice(0, stop + 1); }
  // 문장 끝맺음('…등록이에요.')은 목록에서 뺀다
  steps[steps.length - 1] = last.replace(/\s*(?:이에요|예요|입니다)?[.!?]?$/, "");
  if (outro && !/[.!?)]$/.test(outro)) outro = `${outro}.`;
  return { intro: closeIntro(parts[0].trim()), steps, outro };
}

/** '운영 순서는' / '운영 순서는:' → '운영 순서예요.' — 목록 앞 머리말이 말이 끊긴 채 끝나지 않게 */
function closeIntro(intro: string): string {
  if (!intro) return intro;
  const bare = intro.replace(/\s*[:：]$/, "");
  if (/[.!?]$/.test(bare)) return bare;
  const topic = bare.match(/^(.*\S)(은|는)$/);
  if (topic && /(순서|단계|방법|과정|계획|흐름|일정|할 일|일)$/.test(topic[1])) return `${withIeyo(topic[1])}.`;
  return `${bare}.`;
}
