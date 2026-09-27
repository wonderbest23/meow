import { z } from "zod";

export const inquiryCategories = [
  { value: "account", label: "로그인·계정" },
  { value: "plan", label: "대화·사업계획서·저장" },
  { value: "website", label: "홈페이지 제작" },
  { value: "other", label: "기타 문의" },
] as const;
export type InquiryCategory = typeof inquiryCategories[number]["value"];
export type InquiryDraft = { category: InquiryCategory; subject: string; message: string; requestId: string };

export const inquirySchema = z.object({
  category: z.enum(["account", "plan", "website", "other"]),
  subject: z.string().trim().min(1, "제목을 입력해주세요.").max(80, "제목은 80자까지 입력할 수 있어요.").refine(value => !/[\r\n]/.test(value), "제목은 한 줄로 입력해주세요."),
  message: z.string().trim().min(1, "문의 내용을 입력해주세요.").max(1800, "문의 내용은 1,800자까지 입력할 수 있어요."),
  requestId: z.uuid(),
}).strict();

export const inquiryDraftSchema = inquirySchema.extend({ subject: z.string().max(80), message: z.string().max(1800) });

export function inquiryCategory(value: string | null): InquiryCategory {
  return inquiryCategories.find(category => category.value === value)?.value ?? "other";
}

export function inquiryBody(input: InquiryDraft): string {
  const label = inquiryCategories.find(category => category.value === input.category)!.label;
  return `[고객센터 · ${label}]\n제목: ${input.subject}\n\n${input.message}`;
}

export function inquiryPreview(body: string): { subject: string; category: string; message: string } {
  const match = /^\[고객센터 · ([^\n]+)\]\n제목: ([^\n]+)\n\n([\s\S]*)$/.exec(body);
  return match ? { category: match[1], subject: match[2], message: match[3] }
    : { category: "이전 문의", subject: body.split("\n")[0].slice(0, 80), message: body };
}

export async function inquiryMessageId(owner: string, requestId: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`support-inquiry:v1:${owner}:${requestId}`));
  const hex = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
