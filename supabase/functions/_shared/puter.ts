export const DEFAULT_PUTER_MODEL = "qwen/qwen3.7-flash";

type Validator = (value: unknown) => boolean;
type FetchLike = typeof fetch;

export class PuterAIError extends Error {
  status: number;
  code: string;
  attempts: Array<{ model: string; status?: number; reason: string }>;

  constructor(
    code: string,
    message: string,
    status = 502,
    attempts: Array<{ model: string; status?: number; reason: string }> = [],
  ) {
    super(message);
    this.name = "PuterAIError";
    this.status = status;
    this.code = code;
    this.attempts = attempts;
  }
}

export function puterConfigured(): boolean {
  return !!Deno.env.get("PUTER_AUTH_TOKEN");
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function extractJsonContent(payload: any): unknown {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string") return content;
  try {
    return JSON.parse(content);
  } catch {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
    if (!fenced) return undefined;
    try {
      return JSON.parse(fenced);
    } catch {
      return undefined;
    }
  }
}

export async function callPuterJson(
  prompt: string,
  validator: Validator,
  options: {
    fetchImpl?: FetchLike;
    timeoutMs?: number;
    maxRetries?: number;
    model?: string;
  } = {},
) {
  const token = Deno.env.get("PUTER_AUTH_TOKEN");
  if (!token) throw new PuterAIError("puter_not_configured", "PUTER_AUTH_TOKEN is not configured", 500);

  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20000;
  const maxRetries = options.maxRetries ?? 1;
  const model = options.model ?? Deno.env.get("PUTER_MODEL") ?? DEFAULT_PUTER_MODEL;
  const baseUrl = normalizeBaseUrl(
    Deno.env.get("PUTER_BASE_URL") ?? "https://api.puter.com/puterai/openai/v1",
  );
  const attempts: Array<{ model: string; status?: number; reason: string }> = [];

  for (let retry = 0; retry <= maxRetries; retry++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          messages: [
            {
              role: "system",
              content:
                "You are Agba, a company's operating brain. Reason only from supplied evidence. Do not invent facts. Return only valid JSON matching the requested schema. Do not wrap JSON in markdown fences.",
            },
            { role: "user", content: prompt },
          ],
        }),
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        attempts.push({ model: `puter/${model}`, status: response.status, reason: `http_${response.status}` });
        if (retry < maxRetries && response.status >= 500) {
          await new Promise((resolve) => setTimeout(resolve, 250 * (retry + 1)));
          continue;
        }
        break;
      }

      let payload: any;
      try {
        payload = JSON.parse(text);
      } catch {
        attempts.push({ model: `puter/${model}`, reason: "invalid_provider_response_json" });
        break;
      }

      const value = extractJsonContent(payload);
      if (!validator(value)) {
        attempts.push({ model: `puter/${model}`, reason: "invalid_model_json" });
        break;
      }

      return {
        value,
        payload,
        model: payload?.model ?? model,
        provider: "puter",
        attempts,
      };
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === "AbortError";
      attempts.push({ model: `puter/${model}`, reason: timedOut ? "timeout" : "network_error" });
      if (retry < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (retry + 1)));
        continue;
      }
      break;
    } finally {
      clearTimeout(timeout);
    }
  }

  const last = attempts[attempts.length - 1];
  throw new PuterAIError(
    last?.reason === "invalid_model_json" ? "puter_invalid_output" : "puter_unavailable",
    "Puter AI gateway failed to return valid Agba output",
    502,
    attempts,
  );
}
