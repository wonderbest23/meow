// 안전 미리보기 전용 가짜 Anthropic — api.anthropic.com 으로 가는 요청만 가로채 스키마에 맞는 합성 답을 돌려준다(실제 호출 0)
const real = globalThis.fetch;
const KO = ["동네 직장인", "작은 규모로 시작", "첫 달 시범 운영", "단골 고객", "주 2회 제공", "직접 확인 필요"];
let n = 0;
function str(key = "", schema = {}) {
  n++;
  const k = key.toLowerCase();
  if (k === "day") return ["월요일", "수요일", "금요일"][n % 3];
  if (k === "format") return ["사진", "짧은 영상", "글"][n % 3];
  if (k === "channel") return "인스타그램";
  let s = /name|title|headline/.test(k) ? `테스트 ${KO[n % KO.length]}` : /url|href|link/.test(k) ? "https://example.com" : /date|at$/.test(k) ? "2026-10-03" : `${KO[n % KO.length]} 기준의 합성 설명입니다.`;
  if (schema.enum) return schema.enum[0];
  if (schema.const !== undefined) return schema.const;
  if (schema.maxLength) s = s.slice(0, schema.maxLength);
  if (schema.minLength && s.length < schema.minLength) s = s.padEnd(schema.minLength, "가");
  return s;
}
function gen(schema, key = "", depth = 0) {
  if (!schema || depth > 12) return null;
  if (schema.anyOf || schema.oneOf) return gen((schema.anyOf || schema.oneOf).find(x => x.type !== "null") || (schema.anyOf || schema.oneOf)[0], key, depth + 1);
  const type = Array.isArray(schema.type) ? schema.type.find(t => t !== "null") : schema.type;
  if (schema.enum) return schema.enum[0];
  if (schema.const !== undefined) return schema.const;
  if (type === "object" || schema.properties) {
    const o = {};
    for (const [k, v] of Object.entries(schema.properties || {})) o[k] = gen(v, k, depth + 1);
    return o;
  }
  /* 검수·수정 목록은 비워 보낸다(합성 문서에 지적할 실제 문장이 없다) */
  if (type === "array" && /issue|problem|edit|finding|violation|correction|fix|warning/i.test(key)) return [];
  /* 홍보 키트의 4주 운영표처럼 개수가 정해진 목록 */
  if (type === "array" && key === "calendar") return [1, 2, 3, 4].map(week => ({ ...gen(schema.items, "week", depth + 1), week }));
  if (type === "array") { const count = Math.max(schema.minItems ?? 1, Math.min(schema.maxItems ?? 3, 3)); return Array.from({ length: count }, (_, i) => gen(schema.items, key + i, depth + 1)); }
  if (type === "integer" || type === "number") { const lo = schema.minimum ?? schema.exclusiveMinimum ?? 1; const hi = schema.maximum ?? lo + 10; return Math.max(lo, Math.min(hi, type === "integer" ? Math.ceil(lo) + 1 : lo + 1)); }
  if (type === "boolean") return false;
  return str(key, schema);
}
const TOPICS = ["고객", "상품", "가격", "판매 채널", "운영 시간", "비용", "첫 달 목표", "홍보", "위험", "다음 단계", "공간", "재료", "인력", "예약", "후기"];
function markdown() {
  n++;
  const a = TOPICS[n % TOPICS.length], b = TOPICS[(n * 7 + 3) % TOPICS.length], c = TOPICS[(n * 11 + 5) % TOPICS.length];
  return `## ${a} 중심으로 정리한 합성 문단 ${n}\n\n이 장은 ${a}을(를) 기준으로 ${b}와(과) ${c}의 관계를 짧게 정리합니다(합성 ${n}). 실제 사업 정보가 아니므로 확인 필요로 남깁니다.\n\n| 항목 | 내용 |\n| --- | --- |\n| ${a} | 합성 값 ${n}-A (확인 필요) |\n| ${b} | 합성 값 ${n}-B (확인 필요) |\n\n- ${c}은(는) 첫 달에 작게 시험합니다(합성 ${n}).\n- 결과를 기록해 ${b} 기준을 조정합니다.\n`;
}
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input?.url ?? String(input);
  if (!url.startsWith("https://api.anthropic.com/")) return real(input, init);
  let body = {}; try { body = JSON.parse(init?.body ?? "{}"); } catch {}
  let schema = body.output_config?.format?.schema;
  const system = Array.isArray(body.system) ? body.system.map(b => b.text).join("\n") : String(body.system ?? "");
  if (!schema) { const m = system.match(/출력 스키마: (\{[\s\S]*\})\s*$/); if (m) { try { schema = JSON.parse(m[1]); } catch {} } }
  const wantsJson = !!schema || /유효한 JSON 객체 하나만/.test(system);
  const text = schema ? JSON.stringify(gen(schema)) : wantsJson ? "{}" : markdown(body.messages?.[0]?.content);
  console.log(`[fake-anthropic] ${schema ? "json" : wantsJson ? "json-noschema" : "text"} ${text.length}b`);
  // Optional pause so waiting screens (typing bubble, "정리 중") stay visible long enough to check.
  const delay = Number(process.env.SYNTHETIC_AI_DELAY_MS) || 0;
  if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
  return new Response(JSON.stringify({ id: "msg_synthetic", type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text }], usage: { input_tokens: 0, output_tokens: 0 } }), { status: 200, headers: { "content-type": "application/json" } });
};
