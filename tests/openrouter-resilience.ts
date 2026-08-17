import { callOpenRouterJson, FALLBACK_MODELS, PRIMARY_MODEL, OpenRouterError } from "../supabase/functions/_shared/openrouter.ts";

const ok = (value: unknown) => !!(value as any)?.ok;
const response = (body: unknown, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const fallbackModel = FALLBACK_MODELS[0];
const fallbackPayload = { choices: [{ message: { content: JSON.stringify({ ok: true }) } }], model: fallbackModel };

const run = async (label: string, mock: (model: string, attempt: number) => Response | Promise<Response> | never, expectedModel: string, expectedAttempts: number) => {
  let calls = 0;
  const fetchImpl = async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls++;
    return mock(body.model, calls);
  };
  const result = await callOpenRouterJson("test-key", "test", ok, { fetchImpl, timeoutMs: 25, maxRetriesPerModel: 1 });
  if (result.model !== expectedModel) throw new Error(`${label}: expected ${expectedModel}, got ${result.model}`);
  if (calls !== expectedAttempts) throw new Error(`${label}: expected ${expectedAttempts} calls, got ${calls}`);
  console.log(`PASS ${label}`);
};

// 429 is a quota/rate-limit signal. Do not waste the retry budget retrying the same model.
await run("429 immediately falls back", (model) => model === PRIMARY_MODEL ? response({ error: "rate limited" }, 429) : response(fallbackPayload), fallbackModel, 2);
await run("5xx retries then falls back", (model) => model === PRIMARY_MODEL ? response({ error: "upstream" }, 503) : response(fallbackPayload), fallbackModel, 3);
await run("timeout retries then falls back", (model) => model === PRIMARY_MODEL ? (() => { throw new DOMException("timed out", "AbortError"); })() : response(fallbackPayload), fallbackModel, 3);
await run("malformed provider JSON falls back", (model) => model === PRIMARY_MODEL ? response("not-json") : response(fallbackPayload), fallbackModel, 2);
await run("invalid model schema falls back", (model) => model === PRIMARY_MODEL ? response({ choices: [{ message: { content: JSON.stringify({ wrong: true }) } }] }) : response(fallbackPayload), fallbackModel, 2);

let allFailCalls = 0;
try {
  await callOpenRouterJson("test-key", "test", ok, { fetchImpl: async (_url, init) => {
    allFailCalls++;
    const model = JSON.parse(String(init.body)).model;
    return response({ error: `${model} unavailable` }, 429);
  }, timeoutMs: 25, maxRetriesPerModel: 1 });
  throw new Error("all-fail case unexpectedly succeeded");
} catch (error) {
  if (!(error instanceof OpenRouterError) || error.code !== "openrouter_unavailable") throw error;
  // 429 is never retried. Every configured model gets exactly one attempt.
  const expectedCalls = 1 + FALLBACK_MODELS.length;
  if (allFailCalls !== expectedCalls) throw new Error(`all-fail case expected ${expectedCalls} calls, got ${allFailCalls}`);
  console.log("PASS all providers exhausted returns controlled error");
}

console.log("OPENROUTER RESILIENCE UNIT PASS");
