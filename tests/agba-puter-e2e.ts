import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL");
const anon = Deno.env.get("SUPABASE_ANON_KEY");
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const puterToken = Deno.env.get("PUTER_AUTH_TOKEN");
if (!url || !anon || !serviceRole || !puterToken) throw new Error("Set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and PUTER_AUTH_TOKEN");

const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
const email = `agba-puter-e2e-${Date.now()}@gmail.com`;
const password = `AgbaPuterE2E-${crypto.randomUUID()}-X9!`;
const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Agba Puter E2E CEO" } });
if (createError || !created.user) throw new Error(`CEO creation failed: ${createError?.message ?? "no user"}`);
let organizationId: string | null = null;
const cleanup = async () => { if (organizationId) await admin.from("agba_organizations").delete().eq("id", organizationId); await admin.auth.admin.deleteUser(created.user.id); };
const read = async (r: Response) => { const text = await r.text(); try { return JSON.parse(text); } catch { return { raw: text }; } };
const expect = async (label: string, r: Response, status: number) => { const body = await read(r); if (r.status !== status) throw new Error(`${label}: expected ${status}, got ${r.status}: ${JSON.stringify(body)}`); return body; };

async function puterPreflight() {
  const base = (Deno.env.get("PUTER_BASE_URL") ?? "https://api.puter.com/puterai/openai/v1").replace(/\/+$/, "");
  const models = [Deno.env.get("PUTER_MODEL") ?? "gpt-5.4-nano", "gemini-3.1-flash-lite"];
  for (const model of models) {
    const response = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${puterToken}` },
      body: JSON.stringify({ model, temperature: 0, messages: [{ role: "user", content: "Reply with OK" }] }),
    });
    const body = await read(response);
    console.log(`PUTER PREFLIGHT ${model}: HTTP ${response.status} ${JSON.stringify(body)}`);
  }
}

try {
  await puterPreflight();

  const supabase = createClient(url, anon);
  const { data: auth, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError || !auth.session) throw new Error(`Auth failed: ${signInError?.message ?? "no session"}`);
  const headers = { Authorization: `Bearer ${auth.session.access_token}`, apikey: anon, "Content-Type": "application/json" };
  const base = `${url}/functions/v1`;

  const setup = await expect("company setup", await fetch(`${base}/company-setup`, { method: "POST", headers, body: JSON.stringify({ company: { name: `Agba Puter E2E ${Date.now()}`, slug: `agba-puter-e2e-${Date.now()}`, timezone: "Africa/Lagos", currency_code: "NGN" }, ceo: { full_name: "Agba Puter E2E CEO" }, departments: [{ name: "Production", slug: "production", head: { full_name: "Production Head", email: `agba-puter-head-${Date.now()}@gmail.com` } }] }) }), 201);
  organizationId = setup.organization.id;
  const departmentId = setup.departments[0].id;
  console.log("PASS company setup");

  const report = await expect("report ingestion", await fetch(`${base}/report-ingestion`, { method: "POST", headers, body: JSON.stringify({ report_text: "120 orders received. 15 are blocked by transparent vinyl stockout. A confirmed corporate order worth ₦480,000 is due tomorrow. ₦95,000 was spent on emergency materials.", department_id: departmentId, source: "puter-e2e" }) }), 201);
  console.log("PASS report ingestion");

  const reasoning = await expect("Puter reasoning", await fetch(`${base}/agba-reasoning`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId, department_id: departmentId, question: "Identify the most important operational issue. Calculate the blocked-order percentage, identify the financial exposure, distinguish facts from uncertainty, and recommend one concrete action. Return evidence-grounded reasoning.", evidence: [{ report_id: report.report.id }] }) }), 201);
  if (reasoning.reasoning?.provider !== "puter") throw new Error(`Expected Puter provider, got ${reasoning.reasoning?.provider}`);
  if (!reasoning.reasoning?.model) throw new Error("Puter model missing from reasoning response");
  if (!reasoning.reasoning?.confidence_reason || !reasoning.reasoning?.severity_reason) throw new Error("Reasoning confidence/severity explanation missing");
  console.log(`PASS Puter reasoning (${reasoning.reasoning.model})`);

  const state = await expect("company state", await fetch(`${base}/company-state-v2`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId, reasoning_item_id: reasoning.item.id }) }), 201);
  if (state.state?.source_reasoning_item_id !== reasoning.item.id) throw new Error("Company state lost reasoning trace");
  console.log("PASS company state trace");

  const briefing = await expect("Puter briefing", await fetch(`${base}/daily-briefing-v2`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId }) }), 201);
  if (briefing.provider !== "puter") throw new Error(`Expected Puter briefing provider, got ${briefing.provider}`);
  if (!briefing.model || !briefing.briefing?.summary || !Array.isArray(briefing.items)) throw new Error("Invalid Puter briefing response");
  console.log(`PASS Puter CEO briefing (${briefing.model})`);

  console.log("AGBA PUTER E2E PASS");
} finally {
  await cleanup();
}
