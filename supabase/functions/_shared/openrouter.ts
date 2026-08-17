export const PRIMARY_MODEL = "poolside/laguna-xs-2.1:free";

// Keep the pool deliberately diverse. A failure or quota limit at one upstream
// provider must not immediately become an Agba-wide outage.
export const FALLBACK_MODELS = [
  "nvidia/nemotron-3.5-lightning:free",
  "liquid/lfm-2.5-2.6b:free",
  "dots-studio/dots-3-note-preview:free",
  "openai/gpt-oss-20b:free",
  "openrouter/free",
];

export class OpenRouterError extends Error {
  status: number;
  code: string;
  attempts: Array<{ model: string; status?: number; reason: string }>;
  constructor(code: string, message: string, status = 502, attempts: Array<{ model: string; status?: number; reason: string }> = []) {
    super(message);
    this.name = "OpenRouterError";
    this.status = status;
    this.code = code;
    this.attempts = attempts;
  }
}

type Validator = (value: unknown) => boolean;
type FetchLike = typeof fetch;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function retryDelay(response: Response, retry: number): number {
  const retryAfter = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 2000);
  return Math.min(150 * (2 ** retry), 1000);
}

export async function callOpenRouterJson(
  apiKey: string,
  prompt: string,
  validator: Validator,
  options: { fetchImpl?: FetchLike; timeoutMs?: number; maxRetriesPerModel?: number; models?: string[] } = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15000;
  const maxRetriesPerModel = options.maxRetriesPerModel ?? 1;
  const models = options.models ?? [PRIMARY_MODEL, ...FALLBACK_MODELS];
  const attempts: Array<{ model: string; status?: number; reason: string }> = [];

  for (const model of models) {
    for (let retry = 0; retry <= maxRetriesPerModel; retry++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
            "HTTP-Referer": "https://agba-brain.vercel.app",
            "X-Title": "Agba",
          },
          body: JSON.stringify({
            model,
            temperature: 0.1,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: "You are Agba, a company's operating brain. Reason only from supplied evidence. Do not invent facts. Return only valid JSON." },
              { role: "user", content: prompt },
            ],
          }),
          signal: controller.signal,
        });
        const text = await response.text();

        if (!response.ok) {
          attempts.push({ model, status: response.status, reason: `http_${response.status}` });

          // 429 is a model/provider quota signal. Retrying the same model just
          // burns latency and often produces another 429. Move to the next
          // independent model immediately. 5xx is transient, so retry once.
          if (response.status >= 500 && retry < maxRetriesPerModel) {
            await sleep(retryDelay(response, retry));
            continue;
          }
          break;
        }

        let payload: any;
        try {
          payload = JSON.parse(text);
        } catch {
          attempts.push({ model, reason: "invalid_provider_response_json" });
          break;
        }

        const content = payload?.choices?.[0]?.message?.content;
        let value: unknown;
        try {
          value = typeof content === "string" ? JSON.parse(content) : content;
        } catch {
          attempts.push({ model, reason: "invalid_model_json" });
          break;
        }

        if (!validator(value)) {
          attempts.push({ model, reason: "invalid_schema" });
          break;
        }

        return { value, payload, model, attempts };
      } catch (error) {
        const timedOut = error instanceof DOMException && error.name === "AbortError";
        attempts.push({ model, reason: timedOut ? "timeout" : "network_error" });
        if (retry < maxRetriesPerModel) {
          await sleep(150 * (2 ** retry));
          continue;
        }
        break;
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  const last = attempts[attempts.length - 1];
  throw new OpenRouterError(
    ["invalid_schema", "invalid_model_json", "invalid_provider_response_json"].includes(last?.reason ?? "")
      ? "openrouter_invalid_output"
      : "openrouter_unavailable",
    "All configured OpenRouter attempts failed",
    502,
    attempts,
  );
}
