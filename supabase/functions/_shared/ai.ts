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

function contentToText(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return undefined;
  const parts = content
    .map((part: any) => typeof part === "string" ? part : typeof part?.text === "string" ? part.text : "")
    .filter(Boolean);
  return parts.length ? parts.join("\n") : undefined;
}

function parseJsonText(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  for (const candidate of [cleaned, cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")]) {
    try { return JSON.parse(candidate); } catch {}
  }

  // Some Qwen responses contain a short explanation around the JSON object.
  // Extract the first balanced JSON object instead of requiring the whole content to be JSON.
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      if (depth > 0) depth--;
      if (depth === 0 && start >= 0) {
        try { return JSON.parse(cleaned.slice(start, i + 1)); } catch { start = -1; }
      }
    }
  }
  return undefined;
}

function parseJsonContent(payload: any): unknown {
  const content = contentToText(payload?.choices?.[0]?.message?.content);
  if (!content) return payload?.choices?.[0]?.message?.content;
  return parseJsonText(content);
}

function normalizeModelJson(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const v = { ...(value as Record<string, unknown>) };

  // Accept common provider/model aliases while keeping Agba's storage contract canonical.
  if (v.type == null && typeof v.kind === "string") v.type = v.kind;
  if (v.type == null && typeof v.category === "string") v.type = v.category;
  if (v.title == null && typeof v.name === "string") v.title = v.name;
  if (v.summary == null && typeof v.description === "string") v.summary = v.description;
  if (v.confidence_reason == null && typeof v.rationale === "string") v.confidence_reason = v.rationale;
  if (v.severity_reason == null && typeof v.severity_rationale === "string") v.severity_reason = v.severity_rationale;
  if (v.recommended_action == null && typeof v.recommendation === "string") v.recommended_action = v.recommendation;
  if (v.recommended_action == null && typeof v.action === "string") v.recommended_action = v.action;

  for (const key of ["type", "confidence", "severity"]) {
    if (typeof v[key] === "string") v[key] = v[key].trim().toLowerCase().replace(/[\s-]+/g, "_");
  }

  // Alibaba/Qwen can use semantically equivalent labels outside our storage enums.
  if (v.type === "insight" || v.type === "fact" || v.type === "finding") v.type = "observation";
  if (v.type === "risk" || v.type === "problem" || v.type === "alert") v.type = "issue";
  if (v.type === "action" || v.type === "next_step" || v.type === "next_action") v.type = "recommendation";
  if (v.type === "choice" || v.type === "management_decision") v.type = "decision";

  if (v.confidence === "moderate") v.confidence = "medium";
  if (v.confidence === "certain") v.confidence = "high";
  if (v.confidence === "uncertain") v.confidence = "low";

  if (v.severity === "null" || v.severity === "none" || v.severity === "n_a" || v.severity === "") v.severity = null;
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
