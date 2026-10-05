/*
 * 시장 조사 버튼을 보여 줄 항목 — 화면 코드도 가져다 쓴다.
 * market-research.ts 는 project-bridge → persistence(Supabase 관리자 연결)를 불러오므로,
 * 화면이 그 파일에서 상수를 가져오면 서버 코드가 브라우저 번들에 딸려 들어간다(배포 실패 위험).
 */
export const RESEARCH_BUTTON_SECTIONS = ["overview/problem", "market/segments", "market/competitors"] as const;
