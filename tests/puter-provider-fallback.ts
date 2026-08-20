import { callPuterJson, PuterAIError } from "../supabase/functions/_shared/puter.ts";

Deno.env.set("PUTER_AUTH_TOKEN", "test-token");
Deno.env.set("PUTER_BASE_URL", "https://puter.test/v1");
Deno.env.set("PUTER_MODELS", "primary-model,fallback-model");

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const valid = (value: unknown): value is { ok: boolean } =>
  !!value && typeof value === "object" && (value as { ok?: unknown }).ok === true;

const calls: string[] = [];
let first = true;
const result = await callPuterJson(
  "test fallback",
  valid,
  {
    maxRetries: 0,
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      calls.push(body.model);
      if (first) {
        first = false;
        return response({ choices: [{ message: { content: "not-json-for-agba" } }] });
      }
      return response({ model: "fallback-model", choices: [{ message: { content: JSON.stringify({ ok: true }) } }] });
    },
  },
);

if (result.model !== "fallback-model") throw new Error(`Expected fallback model, got ${result.model}`);
if (calls.join(",") !== "primary-model,fallback-model") throw new Error(`Unexpected model sequence: ${calls.join(",")}`);
if (result.attempts.length !== 1 || result.attempts[0].reason !== "invalid_model_json") throw new Error("Primary invalid-output attempt was not recorded");
console.log("PASS invalid model output falls through to fallback model");

const retryCalls: string[] = [];
let attempts = 0;
const retryResult = await callPuterJson(
  "test retry",
  valid,
  {
    maxRetries: 1,
    fetchImpl: async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      retryCalls.push(body.model);
      attempts++;
      if (attempts === 1) return response({ error: "rate limited" }, 429);
      return response({ model: "primary-model", choices: [{ message: { content: JSON.stringify({ ok: true }) } }] });
    },
  },
);

if (retryResult.model !== "primary-model") throw new Error("Retry did not recover on the same model");
if (retryCalls.join(",") !== "primary-model,primary-model") throw new Error(`Unexpected retry sequence: ${retryCalls.join(",")}`);
if (retryResult.attempts.length !== 1 || retryResult.attempts[0].status !== 429) throw new Error("429 attempt was not recorded");
console.log("PASS retryable 429 is retried before model fallback");

let unavailableCalls = 0;
try {
  await callPuterJson(
    "test unavailable",
    valid,
    {
      maxRetries: 0,
      fetchImpl: async () => {
        unavailableCalls++;
        return response({ error: "bad request" }, 400);
      },
    },
  );
  throw new Error("Expected PuterAIError");
} catch (error) {
  if (!(error instanceof PuterAIError)) throw error;
  if (unavailableCalls !== 2) throw new Error(`Expected both configured models to be attempted, got ${unavailableCalls}`);
  if (error.attempts.length !== 2) throw new Error(`Expected 2 attempts, got ${error.attempts.length}`);
  if (!error.attempts.every((attempt) => attempt.reason === "http_400")) throw new Error("Non-retryable HTTP failures were not recorded correctly");
}
console.log("PASS model-specific 4xx failure falls through to the next model");
console.log("AGBA PUTER PROVIDER FALLBACK TEST PASS");
