const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CEO_QUERY_URL = `${SUPABASE_URL}/functions/v1/ceo-query`;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) { console.log("AI GATEWAY PRODUCTION CONTRACT: SKIP (missing test credentials)"); Deno.exit(0); }
const response = await fetch(CEO_QUERY_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE_KEY}` }, body: JSON.stringify({ organization_id: "00000000-0000-0000-0000-000000000000", question: "production AI gateway contract test" }) });
const body = await response.json().catch(() => ({}));
if (![401, 403].includes(response.status)) throw new Error(`Expected protected rejection from production ceo-query probe, got ${response.status}: ${JSON.stringify(body)}`);
console.log("AI GATEWAY PRODUCTION CONTRACT: PASS");
console.log("- deployed ceo-query endpoint reachable: PASS");
console.log("- protected tenant boundary: PASS");
