import { coachDocumentRevision, readCoach } from "./coach";

/*
 * 예시 사업(퇴근길 반찬가게 둘)의 개업 준비 기록 — 결제한 사람이 두 달 쓴 모습(대표 요청 2026-11-14: 예시의 개업 준비 칸이 '시작 전'으로 비어 보였다).
 * 가게를 열고 홈페이지를 공개한 뒤라 앞 여섯 단계는 끝냈고, 세금 · 결제 점검 · 첫 홍보 · 운영 개선은 남아 있다. 메모는 지어낸 예시 값이다.
 * 기록의 signature 는 business-launch.ts launchSteps 와 같은 식이어야 '끝남'으로 보인다 — 그 모듈을 여기서 불러오면 사업 목록 묶음이 커져서
 * 식만 옮겼고, 어긋나면 scripts/sample-finished.test.ts 가 잡는다.
 */
const SETTINGS = { purpose: "launch", workplace: "shop", registered: "yes", region: "서울 마포구(예시)", configured: true } as const;
const DONE: Record<string, string> = {
  offer: "반찬 3~4가지 한 묶음으로 시작(예시)",
  operations: "평일 오후 4~8시, 대표 혼자(예시)",
  license: "영업 신고와 위생 교육을 마침(예시)",
  workplace: "상가 1층 10평, 2년 계약(예시)",
  website: "홈페이지 공개함(예시)",
};

export function sampleLaunchAnswers(planId: string, answers: Record<string, Record<string, unknown>>): Record<string, Record<string, unknown>> {
  if (planId !== "sample_banchan_easy" && planId !== "sample_banchan_expert") return answers;
  const coach = readCoach(answers);
  const signature = JSON.stringify([coach ? coachDocumentRevision(coach) : 0, SETTINGS.purpose, SETTINGS.workplace, SETTINGS.registered]);
  const records = Object.fromEntries(Object.entries(DONE).map(([id, note]) => [id, { status: "done", signature, note, material: "", at: "2026-08-20T09:00:00.000Z" }]));
  return { ...answers, __business_launch: { ...SETTINGS, records, quotes: [] } };
}
