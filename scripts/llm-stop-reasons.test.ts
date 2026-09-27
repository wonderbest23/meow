import assert from "node:assert/strict";
import {completeJson,type LLMFailure} from "../lib/llm/complete";
Object.assign(process.env,{NODE_ENV:"test",PERSISTENCE_MODE:"demo-memory",SUPABASE_URL:"",SUPABASE_SERVICE_ROLE_KEY:"",OPENAI_API_KEY:"synthetic",ANTHROPIC_API_KEY:"synthetic"});
const params={system:"JSON only",user:"synthetic",maxOutputTokens:50,validateJson:(v:Record<string,unknown>)=>v.ok===true};
const cases:Array<{provider:"openai"|"anthropic";name:string;payload:object;code:LLMFailure["code"]}>=[];
for(const [reason,code]of [["max_tokens","output_limit"],["model_context_window_exceeded","output_limit"],["tool_use","invalid_response"],["pause_turn","invalid_response"],["unknown_stop","invalid_response"],["refusal","refusal"]] as const)cases.push({provider:"anthropic",name:reason,payload:{content:[{type:"text",text:'{"ok":true}'}],stop_reason:reason},code});
for(const [reason,code]of [["max_output_tokens","output_limit"],["content_filter","refusal"],["unknown","invalid_response"]] as const)cases.push({provider:"openai",name:reason,payload:{status:"incomplete",incomplete_details:{reason},output_text:'{"ok":true}'},code});
for(const status of ["failed","queued","in_progress","unknown"])cases.push({provider:"openai",name:status,payload:{status,output_text:'{"ok":true}'},code:"invalid_response"});
cases.push({provider:"openai",name:"cancelled",payload:{status:"cancelled",output_text:'{"ok":true}'},code:"cancelled"});
for(const [code,expected]of [["insufficient_quota","quota_exhausted"],["context_length_exceeded","output_limit"],["unknown_error","invalid_response"]] as const)cases.push({provider:"openai",name:code,payload:{status:"completed",error:{code},output_text:'{"ok":true}'},code:expected});
async function main(){let failures=0;for(const c of cases){let calls=0,reason="";globalThis.fetch=async()=>{calls++;return Response.json(calls===1?c.payload:c.provider==="openai"?{stop_reason:"end_turn",content:[{type:"text",text:'{"ok":true}'}]}:{status:"completed",output_text:'{"ok":true}'});};try{assert.equal(await completeJson({provider:c.provider,model:"synthetic",apiKey:"synthetic"},{...params,onFailure:e=>reason=e.code}),null);assert.equal(calls,1);assert.equal(reason,c.code);console.log(`PASS ${c.provider} ${c.name}: terminal ${c.code}, calls=1`);}catch(e){failures++;console.error(`FAIL ${c.provider} ${c.name} calls=${calls} reason=${reason}`,e);}}
console.log(JSON.stringify({failures,cases:cases.length,realExternalCalls:0}));process.exitCode=failures?1:0;}
main().catch(e=>{console.error(e);process.exitCode=1;});
