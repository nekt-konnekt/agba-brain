import { callOpenRouterJson, FALLBACK_MODEL, PRIMARY_MODEL, OpenRouterError } from "../supabase/functions/_shared/openrouter.ts";

const ok = (value: unknown) => !!(value as any)?.ok;
const response = (body: unknown, status = 200) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const validPayload = { choices: [{ message: { content: JSON.stringify({ ok: true }) } }], model: PRIMARY_MODEL };
const fallbackPayload = { choices: [{ message: { content: JSON.stringify({ ok: true }) } }], model: FALLBACK_MODEL };
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

await run("429 retries then falls back", (model, attempt) => {
  if (model === PRIMARY_MODEL) return response({ error: "rate limited" }, 429);
  return response(fallbackPayload);
}, FALLBACK_MODEL, 3);

await run("5xx retries then falls back", (model) => {
  if (model === PRIMARY_MODEL) return response({ error: "upstream" }, 503);
  return response(fallbackPayload);
}, FALLBACK_MODEL, 3);

await run("timeout retries then falls back", (model) => {
  if (model === PRIMARY_MODEL) throw new DOMException("timed out", "AbortError");
  return response(fallbackPayload);
}, FALLBACK_MODEL, 3);

await run("malformed provider JSON falls back", (model) => {
  if (model === PRIMARY_MODEL) return response("not-json");
  return response(fallbackPayload);
}, FALLBACK_MODEL, 2);

await run("invalid model schema falls back", (model) => {
  if (model === PRIMARY_MODEL) return response({ choices: [{ message: { content: JSON.stringify({ wrong: true }) } }], model: PRIMARY_MODEL });
  return response(fallbackPayload);
}, FALLBACK_MODEL, 2);

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
  if (allFailCalls !== 4) throw new Error(`all-fail case expected 4 calls, got ${allFailCalls}`);
  console.log("PASS all providers exhausted returns controlled error");
}

console.log("OPENROUTER RESILIENCE UNIT PASS");
