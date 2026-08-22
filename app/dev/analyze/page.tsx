import { notFound } from "next/navigation";
import DevAnalyzeHarness from "./harness";

/* 동적 역질문 화면을 로그인·LLM 없이 보는 개발용 — 운영에서는 404. fetch 를 가짜 응답으로 바꾼다. */
export default function DevAnalyze() {
  if (process.env.NODE_ENV === "production") notFound();
  return <DevAnalyzeHarness />;
}
