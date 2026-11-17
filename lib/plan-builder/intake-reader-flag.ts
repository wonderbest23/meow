/* AI 읽기 스위치 — 기본은 꺼짐. INTAKE_AI_READER=1 일 때만 읽는다(INTAKE_BETA_SAFETY=1 이면 늘 꺼짐). 화면 묶음에도 실리는 파일이라 AI 호출 코드를 끌어오지 않게 따로 둔다 */
export const intakeReaderEnabled = (env: Record<string, string | undefined> = process.env) => env.INTAKE_AI_READER === "1" && env.INTAKE_BETA_SAFETY !== "1";
