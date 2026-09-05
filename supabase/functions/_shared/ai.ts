import { callPuterJson, puterConfigured } from "./puter.ts";

type Validator = (value: unknown) => boolean;
type FetchLike = typeof fetch;
type Attempt = { provider: string; model: string; status?: number; reason: string };

export class AIGatewayError extends Error {
  code: string;
  attempts: Attempt[];
  constructor(code: string, message: string, attempts: Attempt[] = []) { super(message); this.name = "AIGatewayError"; this.code = code; this.attempts = attempts; }
}

export function aiConfigured(): boolean {
  return !!Deno.env.get("GEMINI_API_KEY") || !!Deno.env.get("GROQ_API_KEY") || !!Deno.env.get("DASHSCOPE_API_KEY") || !!Deno.env.get("OPENAI_API_KEY") || puterConfigured();
}

function parseJsonString(text: string): unknown {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const first = cleaned.indexOf("{"); const last = cleaned.lastIndexOf("}");
  if (first >= 0 && last > first) { try { return JSON.parse(cleaned.slice(first, last + 1)); } catch {} }
  const firstArray = cleaned.indexOf("["); const lastArray = cleaned.lastIndexOf("]");
  if (firstArray >= 0 && lastArray > firstArray) { try { return JSON.parse(cleaned.slice(firstArray, lastArray + 1)); } catch {} }
  return undefined;
}

function parseJsonContent(payload: any): unknown {
  const content = payload?.choices?.[0]?.message?.content ?? payload?.output ?? payload?.result;
  if (typeof content === "string") return parseJsonString(content) ?? content;
  if (Array.isArray(content)) return parseJsonString(content.map((p: any) => typeof p === "string" ? p : p?.text ?? p?.content ?? "").join("\n")) ?? content;
  if (content && typeof content === "object") return content;
  return content;
}

function normalizeModelJson(value: unknown): unknown {
  if (typeof value === "string") { const parsed = parseJsonString(value); if (parsed !== undefined) return normalizeModelJson(parsed); const text = value.trim(); return { type: "observation", title: text.slice(0, 100) || "Agba observation", summary: text, confidence: "medium", confidence_reason: "The model returned text rather than the requested JSON structure.", severity: null, severity_reason: "No explicit severity was supplied.", recommended_action: null }; }
  if (Array.isArray(value)) { const candidate = value.find((x) => x && typeof x === "object" && !Array.isArray(x)); return candidate ? normalizeModelJson(candidate) : value; }
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>; const v = { ...source };
  const aliases: Record<string,string> = { kind:"type", category:"type", classification:"type", name:"title", headline:"title", subject:"title", issue:"title", message:"summary", text:"summary", content:"summary", description:"summary", details:"summary", explanation:"confidence_reason", reason:"confidence_reason", rationale:"confidence_reason", action:"recommended_action", next_action:"recommended_action", recommendation:"recommended_action" };
  for (const [from,to] of Object.entries(aliases)) if (v[to] == null && v[from] != null) v[to] = v[from];
  for (const key of ["type","confidence","severity"]) if (typeof v[key] === "string") v[key] = (v[key] as string).trim().toLowerCase();
  if (["risk","problem","alert","warning","failure"].includes(v.type as string)) v.type = "issue";
  if (["action","next_step","next_action","task"].includes(v.type as string)) v.type = "recommendation";
  if (v.confidence === "moderate") v.confidence = "medium"; if (v.confidence === "certain") v.confidence = "high"; if (v.confidence === "uncertain") v.confidence = "low";
  if (["null","none","n/a",""] .includes(v.severity as string)) v.severity = null; if (v.severity === "moderate") v.severity = "medium"; if (["urgent","severe"].includes(v.severity as string)) v.severity = "high";
  if (v.title == null && typeof v.summary === "string") v.title = (v.summary as string).slice(0,100); if (v.summary == null && typeof v.title === "string") v.summary = v.title;
  if (v.confidence == null) v.confidence = "medium"; if (v.confidence_reason == null) v.confidence_reason = "Confidence is based on supplied company evidence."; if (v.severity_reason == null) v.severity_reason = "Severity is based on supplied company evidence."; if (v.recommended_action == null) v.recommended_action = null;
  return v;
}

async function callOpenAICompatible(p:{provider:string;apiKey:string;baseUrl:string;model:string;prompt:string;validator:Validator;fetchImpl:FetchLike;timeoutMs:number;attempts:Attempt[];extraBody?:Record<string,unknown>}) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), p.timeoutMs);
  try {
    const response = await p.fetchImpl(`${p.baseUrl.replace(/\/+$/, "")}/chat/completions`, { method:"POST", headers:{"Content-Type":"application/json",Authorization:`Bearer ${p.apiKey}`}, body:JSON.stringify({model:p.model,temperature:0.1,response_format:{type:"json_object"},...(p.extraBody??{}),messages:[{role:"system",content:"You are Agba, a company's operating brain. Reason only from supplied evidence. Do not invent facts. Return exactly one valid JSON object matching the requested schema. No markdown, no prose outside JSON, no <think> tags."},{role:"user",content:`${p.prompt}\n\nReturn exactly one valid JSON object.`}]}), signal:controller.signal });
    const text = await response.text(); if (!response.ok) { p.attempts.push({provider:p.provider,model:p.model,status:response.status,reason:`http_${response.status}`}); return null; }
    let payload:any; try { payload=JSON.parse(text); } catch { p.attempts.push({provider:p.provider,model:p.model,reason:"invalid_provider_response_json"}); return null; }
    const value=normalizeModelJson(parseJsonContent(payload)); if (!p.validator(value)) { p.attempts.push({provider:p.provider,model:p.model,reason:"invalid_model_json"}); return null; }
    return {value,payload,model:payload?.model??p.model,provider:p.provider,attempts:p.attempts};
  } catch(error) { p.attempts.push({provider:p.provider,model:p.model,reason:error instanceof DOMException&&error.name==="AbortError"?"timeout":"network_error"}); return null; } finally { clearTimeout(timeout); }
}

async function callGemini(params:{apiKey:string;model:string;prompt:string;validator:Validator;fetchImpl:FetchLike;timeoutMs:number;attempts:Attempt[]}) {
  const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),params.timeoutMs);
  try {
    const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`;
    const response=await params.fetchImpl(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({systemInstruction:{parts:[{text:"You are Agba, a company's operating brain. Reason only from supplied evidence. Do not invent facts. Return exactly one valid JSON object matching the requested schema. No markdown or commentary."}]},contents:[{role:"user",parts:[{text:`${params.prompt}\n\nReturn exactly one valid JSON object.`}]}],generationConfig:{temperature:0.1,responseMimeType:"application/json"}}),signal:controller.signal});
    const text=await response.text(); if(!response.ok){params.attempts.push({provider:"gemini",model:params.model,status:response.status,reason:`http_${response.status}`});return null;}
    let payload:any;try{payload=JSON.parse(text);}catch{params.attempts.push({provider:"gemini",model:params.model,reason:"invalid_provider_response_json"});return null;}
    const modelText=payload?.candidates?.[0]?.content?.parts?.map((p:any)=>p?.text??"").join("\n")??"";
    const value=normalizeModelJson(parseJsonString(modelText)||modelText);if(!params.validator(value)){params.attempts.push({provider:"gemini",model:params.model,reason:"invalid_model_json"});return null;}
    return {value,payload,model:payload?.modelVersion??params.model,provider:"gemini",attempts:params.attempts};
  }catch(error){params.attempts.push({provider:"gemini",model:params.model,reason:error instanceof DOMException&&error.name==="AbortError"?"timeout":"network_error"});return null;}finally{clearTimeout(timeout);}
}

function configuredDashscopeModels(){const configured=Deno.env.get("DASHSCOPE_MODELS")?.split(",").map(m=>m.trim()).filter(Boolean)??[];const primary=Deno.env.get("DASHSCOPE_MODEL")?.trim()||"qwen3.7-flash";return [...new Set(configured.length?configured:[primary,"qwen3.7-flash","qwen-plus"])]}

export async function callAgbaJson(prompt:string,validator:Validator,options:{fetchImpl?:FetchLike;timeoutMs?:number}={}) {
  const fetchImpl=options.fetchImpl??fetch; const timeoutMs=options.timeoutMs??Number(Deno.env.get("AI_TIMEOUT_MS")??"45000"); const attempts:Attempt[]=[];
  const geminiKey=Deno.env.get("GEMINI_API_KEY"); if(geminiKey){const models=(Deno.env.get("GEMINI_MODELS")?.split(",").map(m=>m.trim()).filter(Boolean)??[Deno.env.get("GEMINI_MODEL")?.trim()||"gemini-2.5-flash"]);for(const model of [...new Set(models)]){const result=await callGemini({apiKey:geminiKey,model,prompt,validator,fetchImpl,timeoutMs,attempts});if(result)return result;}}
  const groqKey=Deno.env.get("GROQ_API_KEY"); if(groqKey){const models=(Deno.env.get("GROQ_MODELS")?.split(",").map(m=>m.trim()).filter(Boolean)??[Deno.env.get("GROQ_MODEL")?.trim()||"openai/gpt-oss-120b"]);for(const model of [...new Set(models)]){const result=await callOpenAICompatible({provider:"groq",apiKey:groqKey,baseUrl:Deno.env.get("GROQ_BASE_URL")||"https://api.groq.com/openai/v1",model,prompt,validator,fetchImpl,timeoutMs,attempts});if(result)return result;}}
  const dashscopeKey=Deno.env.get("DASHSCOPE_API_KEY"); if(dashscopeKey){for(const model of configuredDashscopeModels()){const result=await callOpenAICompatible({provider:"alibaba",apiKey:dashscopeKey,baseUrl:Deno.env.get("DASHSCOPE_BASE_URL")||"https://dashscope-intl.aliyuncs.com/compatible-mode/v1",model,prompt,validator,fetchImpl,timeoutMs,attempts,extraBody:{enable_thinking:false}});if(result)return result;}}
  const openAIKey=Deno.env.get("OPENAI_API_KEY"); if(openAIKey){const result=await callOpenAICompatible({provider:"openai",apiKey:openAIKey,baseUrl:Deno.env.get("OPENAI_BASE_URL")||"https://api.openai.com/v1",model:Deno.env.get("OPENAI_MODEL")||"gpt-5.4-nano",prompt,validator,fetchImpl,timeoutMs,attempts});if(result)return result;}
  if(puterConfigured()){try{return await callPuterJson(prompt,validator,{fetchImpl,timeoutMs});}catch(error){const pe=error as {attempts?:Attempt[]};if(Array.isArray(pe.attempts))attempts.push(...pe.attempts.map(a=>({provider:"puter",...a})));}}
  throw new AIGatewayError("ai_gateway_unavailable","No configured AI provider returned valid Agba output",attempts);
}
