import { callPuterJson, puterConfigured } from "./puter.ts";

type Validator = (value: unknown) => boolean;
type FetchLike = typeof fetch;
type Attempt = { provider: string; model: string; status?: number; reason: string };

export class AIGatewayError extends Error {
  code: string;
  attempts: Attempt[];
  constructor(code: string, message: string, attempts: Attempt[] = []) {
    super(message);
    this.name = "AIGatewayError";
    this.code = code;
    this.attempts = attempts;
  }
}

export function aiConfigured(): boolean {
  return !!Deno.env.get("DASHSCOPE_API_KEY") || !!Deno.env.get("OPENAI_API_KEY") || puterConfigured();
}

function parseJsonString(text: string): unknown {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {}

  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fenced) {
    try { return JSON.parse(fenced.trim()); } catch {}
  }

  const firstObject = cleaned.indexOf("{");
  const lastObject = cleaned.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    try { return JSON.parse(cleaned.slice(firstObject, lastObject + 1)); } catch {}
  }
  const firstArray = cleaned.indexOf("[");
  const lastArray = cleaned.lastIndexOf("]");
  if (firstArray >= 0 && lastArray > firstArray) {
    try { return JSON.parse(cleaned.slice(firstArray, lastArray + 1)); } catch {}
  }
  return undefined;
}

function parseJsonContent(payload: any): unknown {
  const content = payload?.choices?.[0]?.message?.content ?? payload?.output ?? payload?.result;
  if (typeof content === "string") return parseJsonString(content);
  if (Array.isArray(content)) {
    const text = content
      .map((part: any) => typeof part === "string" ? part : part?.text ?? part?.content ?? "")
      .join("\n");
    return parseJsonString(text);
  }
  if (content && typeof content === "object") return content;
  return content;
}

function normalizeModelJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    const candidate = value.find((item) => item && typeof item === "object" && !Array.isArray(item));
    return candidate ? normalizeModelJson(candidate) : value;
  }
  if (!value || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const directSchemaKeys = ["type", "kind", "category", "classification", "finding_type", "title", "summary", "description", "details"];
  const hasDirectSchemaKey = directSchemaKeys.some((key) => source[key] != null);
  if (!hasDirectSchemaKey) {
    for (const key of ["result", "output", "answer", "response", "reasoning", "observation", "finding", "data", "content"]) {
      const nested = source[key];
      if (nested && typeof nested === "object") return normalizeModelJson(nested);
      if (typeof nested === "string") {
        const parsed = parseJsonString(nested);
        if (parsed && typeof parsed === "object") return normalizeModelJson(parsed);
      }
    }
  }

  const v = { ...source };
  const aliases: Record<string, string> = {
    kind: "type",
    category: "type",
    classification: "type",
    finding_type: "type",
    description: "summary",
    details: "summary",
    explanation: "confidence_reason",
    reason: "confidence_reason",
    rationale: "confidence_reason",
    confidence_explanation: "confidence_reason",
    severity_explanation: "severity_reason",
    severity_rationale: "severity_reason",
    action: "recommended_action",
    next_action: "recommended_action",
    recommendation: "recommended_action",
    recommended_next_action: "recommended_action",
  };
  for (const [from, to] of Object.entries(aliases)) {
    if (v[to] == null && v[from] != null) v[to] = v[from];
  }

  for (const key of ["type", "confidence", "severity"]) {
    if (typeof v[key] === "string") v[key] = v[key].trim().toLowerCase();
  }

  if (v.type === "insight" || v.type === "fact" || v.type === "finding" || v.type === "fact_observation") v.type = "observation";
  if (v.type === "risk" || v.type === "problem" || v.type === "alert" || v.type === "warning") v.type = "issue";
  if (v.type === "action" || v.type === "next_step" || v.type === "next_action") v.type = "recommendation";
  if (v.type === "choice" || v.type === "management_decision") v.type = "decision";

  if (v.confidence === "moderate") v.confidence = "medium";
  if (v.confidence === "certain") v.confidence = "high";
  if (v.confidence === "uncertain") v.confidence = "low";
  if (v.severity === "null" || v.severity === "none" || v.severity === "n/a" || v.severity === "") v.severity = null;
  if (v.severity === "moderate") v.severity = "medium";
  if (v.severity === "urgent" || v.severity === "severe") v.severity = "high";

  if (v.title == null && typeof v.summary === "string") v.title = v.summary.slice(0, 100);
  if (v.summary == null && typeof v.title === "string") v.summary = v.title;
  if (v.confidence == null) v.confidence = "medium";
  if (v.confidence_reason == null) v.confidence_reason = "Confidence is based on the supplied company evidence.";
  if (v.severity_reason == null) v.severity_reason = "Severity is based on the supplied company evidence.";
  if (v.recommended_action == null) v.recommended_action = null;

  for (const key of ["title", "summary", "confidence_reason", "severity_reason", "recommended_action"]) {
    if (typeof v[key] === "string") v[key] = v[key].trim();
  }
  return v;
}

async function callOpenAICompatible(params: {
  provider: string; apiKey: string; baseUrl: string; model: string; prompt: string;
  validator: Validator; fetchImpl: FetchLike; timeoutMs: number; attempts: Attempt[];
  extraBody?: Record<string, unknown>;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const response = await params.fetchImpl(`${params.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${params.apiKey}` },
      body: JSON.stringify({
        model: params.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        ...(params.extraBody ?? {}),
        messages: [
          { role: "system", content: "You are Agba, a company's operating brain. Reason only from supplied evidence. Do not invent facts. Return exactly one valid JSON object matching the requested schema. No markdown, no prose outside JSON, no <think> tags." },
          { role: "user", content: `${params.prompt}\n\nReturn exactly one valid JSON object.` },
        ],
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      params.attempts.push({ provider: params.provider, model: params.model, status: response.status, reason: `http_${response.status}` });
      return null;
    }
    let payload: any;
    try { payload = JSON.parse(text); } catch {
      params.attempts.push({ provider: params.provider, model: params.model, reason: "invalid_provider_response_json" });
      return null;
    }
    const parsed = parseJsonContent(payload);
    const value = normalizeModelJson(parsed);
    if (!params.validator(value)) {
      const keys = value && typeof value === "object" ? Object.keys(value as Record<string, unknown>).slice(0, 12).join(",") : typeof value;
      params.attempts.push({ provider: params.provider, model: params.model, reason: `invalid_model_json:${keys}` });
      return null;
    }
    return { value, payload, model: payload?.model ?? params.model, provider: params.provider, attempts: params.attempts };
  } catch (error) {
    params.attempts.push({ provider: params.provider, model: params.model, reason: error instanceof DOMException && error.name === "AbortError" ? "timeout" : "network_error" });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function configuredDashscopeModels(): string[] {
  const configured = Deno.env.get("DASHSCOPE_MODELS")?.split(",").map((m) => m.trim()).filter(Boolean) ?? [];
  const primary = Deno.env.get("DASHSCOPE_MODEL")?.trim() || "qwen3.7-flash";
  return [...new Set(configured.length ? configured : [primary, "qwen3.7-flash", "qwen-plus"] )];
}

export async function callAgbaJson(prompt: string, validator: Validator, options: { fetchImpl?: FetchLike; timeoutMs?: number } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? Number(Deno.env.get("AI_TIMEOUT_MS") ?? "45000");
  const attempts: Attempt[] = [];

  const dashscopeKey = Deno.env.get("DASHSCOPE_API_KEY");
  if (dashscopeKey) {
    for (const model of configuredDashscopeModels()) {
      const result = await callOpenAICompatible({
        provider: "alibaba",
        apiKey: dashscopeKey,
        baseUrl: Deno.env.get("DASHSCOPE_BASE_URL") || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
        model,
        prompt, validator, fetchImpl, timeoutMs, attempts,
        extraBody: { enable_thinking: false },
      });
      if (result) return result;
    }
  }

  const openAIKey = Deno.env.get("OPENAI_API_KEY");
  if (openAIKey) {
    const result = await callOpenAICompatible({
      provider: "openai",
      apiKey: openAIKey,
      baseUrl: Deno.env.get("OPENAI_BASE_URL") || "https://api.openai.com/v1",
      model: Deno.env.get("OPENAI_MODEL") || "gpt-5.4-nano",
      prompt, validator, fetchImpl, timeoutMs, attempts,
    });
    if (result) return result;
  }

  if (puterConfigured()) {
    try {
      const result = await callPuterJson(prompt, validator, { fetchImpl, timeoutMs });
      return result;
    } catch (error) {
      const puterError = error as { attempts?: Attempt[] };
      if (Array.isArray(puterError.attempts)) attempts.push(...puterError.attempts.map((a) => ({ provider: "puter", ...a })));
    }
  }

  throw new AIGatewayError("ai_gateway_unavailable", "No configured AI provider returned valid Agba output", attempts);
}
