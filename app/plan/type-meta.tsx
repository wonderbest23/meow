import { Rocket, TrendingUp, Landmark, ClipboardList, Users, Calculator, BarChart3, FileText } from "lucide-react";

/**
 * 플랜 유형별 대표 색·아이콘 — 목록·시작 화면이 같은 정의를 쓴다.
 * 화면마다 따로 정의하면 같은 유형이 다른 얼굴로 보인다(실제로 그랬다).
 */
export const TYPE_META: Record<string, { accent: string; Icon: typeof FileText; short: string }> = {
  "창업 초기 · 사업계획서": { accent: "#3358f4", Icon: Rocket, short: "창업 초기" },
  "성장·확장 · 사업계획서": { accent: "#12a58a", Icon: TrendingUp, short: "성장·확장" },
  "정부지원 · PSST 사업계획서": { accent: "#2f80d6", Icon: Landmark, short: "정부지원 PSST" },
  "간단 · 사업계획서": { accent: "#de5f7d", Icon: ClipboardList, short: "간단 요약" },
  "내부용 · 사업계획서": { accent: "#6b5bdd", Icon: Users, short: "내부 전략" },
  "창업 초기 · 재무 예측": { accent: "#0e7490", Icon: Calculator, short: "재무 예측" },
  "정밀 · 재무 모델": { accent: "#334155", Icon: BarChart3, short: "재무 모델" },
};

export const DEFAULT_META = { accent: "#3358f4", Icon: FileText, short: "사업계획서" };
