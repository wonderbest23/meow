/** 맞춤 추천을 만드는 질문. 화면(대기 표시)과 서버(생성)가 함께 쓴다. */
export const SUGGESTION_FIELDS = ["customer", "problem", "offer", "channel"] as const;
export type SuggestionField = typeof SUGGESTION_FIELDS[number];
export const isSuggestionField = (id: string | undefined): id is SuggestionField => !!id && (SUGGESTION_FIELDS as readonly string[]).includes(id);
