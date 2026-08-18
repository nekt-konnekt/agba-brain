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

function parseJsonContent(payload: any): unknown {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return content;
  try { return JSON.parse(content); } catch {}
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (!fenced) return undefined;
  try { return JSON.parse(fenced); } catch { return undefined; }
}

function normalizeModelJson(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const v = { ...(value as Record<string, unknown>) };

  for (const key of ["type", "confidence", "severity"]) {
    if (typeof v[key] === "string") v[key] = v[key].trim().toLowerCase();
  }

  // Alibaba/Qwen can use semantically equivalent labels outside our storage enums.
  if (v.type === "insight" || v.type === "fact" || v.type === "finding") v.type = "observation";
  if (v.type === "risk" || v.type === "problem" || v.type === "alert") v.type = "issue";
  if (v.type === "action" || v.type === "next_step") v.type = "recommendation";
  if (v.type === "choice" || v.type === "management_decision") v.type = "decision";

  if (v.confidence === "moderate") v.confidence = "medium";
  if (v.confidence === "certain") v.confidence = "high";
  if (v.confidence === "uncertain") v.confidence = "low";

  if (v.severity === "null" || v.severity === "none" || v.severity === "n/a" || v.severity === "") v.severity = null;
  if (v.severity === "moderate") v.severity = "medium";
  if (v.severity === "urgent") v.severity = "high";

  for (const key of ["title", "summary", "confidence_reason", "severity_reason", "recommended_action"]) {
    if (typeof v[key] === "string") v[key] = v[key].trim();
  }

  return v;
}

async function callOpenAICompatible(params: {
  provider: string; apiKey: string; baseUrl: string; model: string; prompt: string;
  validator: Validator; fetchImpl: FetchLike; timeoutMs: number; attempts: Attempt[];
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
        messages: [
          { role: "system", content: "You are Agba, a company's operating brain. Reason only from supplied evidence. Do not invent facts. Return only valid JSON matching the requested schema. Do not wrap JSON in markdown fences." },
          { role: "user", content: `${params.prompt}\n\nReturn the answer as valid JSON.` },
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
      params.attempts.push({ provider: params.provider, model: params.model, reason: "invalid_model_json" });
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

export async function callAgbaJson(prompt: string, validator: Validator, options: { fetchImpl?: FetchLike; timeoutMs?: number } = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? Number(Deno.env.get("AI_TIMEOUT_MS") ?? "45000");
  const attempts: Attempt[] = [];

  const dashscopeKey = Deno.env.get("DASHSCOPE_API_KEY");
  if (dashscopeKey) {
    const result = await callOpenAICompatible({
      provider: "alibaba",
      apiKey: dashscopeKey,
      baseUrl: Deno.env.get("DASHSCOPE_BASE_URL") || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      model: Deno.env.get("DASHSCOPE_MODEL") || "qwen-plus",
      prompt, validator, fetchImpl, timeoutMs, attempts,
    });
    if (result) return result;
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
