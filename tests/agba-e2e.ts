import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL");
const anon = Deno.env.get("SUPABASE_ANON_KEY");
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !anon || !serviceRole) throw new Error("Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY");

const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
const testEmail = `agba-e2e-ceo-${Date.now()}@gmail.com`;
const testPassword = `AgbaE2E-${crypto.randomUUID()}-X9!`;

const { data: createdAuth, error: createAuthError } = await admin.auth.admin.createUser({ email: testEmail, password: testPassword, email_confirm: true, user_metadata: { full_name: "Agba E2E CEO" } });
if (createAuthError || !createdAuth.user) throw new Error(`E2E CEO creation failed: ${createAuthError?.message ?? "no user"}`);
let organizationId: string | null = null;
const cleanup = async () => { if (organizationId) await admin.from("agba_organizations").delete().eq("id", organizationId); await admin.auth.admin.deleteUser(createdAuth.user.id); };
try {
  const supabase = createClient(url, anon);
  const { data: auth, error: signInError } = await supabase.auth.signInWithPassword({ email: testEmail, password: testPassword });
  if (signInError || !auth.session) throw new Error(`AUTH FAIL: ${signInError?.message ?? "no session"}`);
  const headers = { Authorization: `Bearer ${auth.session.access_token}`, apikey: anon, "Content-Type": "application/json" };
  const base = `${url}/functions/v1`;
  const fail = (label: string, value: unknown): never => { console.error(`FAIL ${label}`, value); Deno.exit(1); };
  const pass = (label: string) => console.log(`PASS ${label}`);

  const who = await fetch(`${base}/agba-reasoning`, { method: "POST", headers, body: JSON.stringify({ organization_id: "00000000-0000-0000-0000-000000000000", evidence: [{ report_id: "00000000-0000-0000-0000-000000000000" }] }) });
  if (who.status !== 403) fail("authorization boundary", await who.text()); pass("authorization rejects unregistered organization");

  const setup = await fetch(`${base}/company-setup`, { method: "POST", headers, body: JSON.stringify({ company: { name: `Agba E2E ${Date.now()}`, slug: `agba-e2e-${Date.now()}`, timezone: "Africa/Lagos", currency_code: "NGN" }, ceo: { full_name: "Agba E2E CEO" }, departments: [{ name: "Production", slug: "production", head: { full_name: "Production Head", email: `agba-e2e-head-${Date.now()}@gmail.com` } }] }) });
  const setupText = await setup.text(); if (setup.status !== 201) fail("company setup", setupText); const setupData = JSON.parse(setupText); organizationId = setupData.organization.id; const departmentId = setupData.departments[0].id; pass("company setup");

  const reportText = "We received 120 sticker orders today. 85 orders were completed. 20 are waiting for customer artwork approval. 15 are blocked because transparent vinyl is out of stock. A corporate order worth ₦480,000 is due tomorrow. ₦95,000 was spent today on emergency materials.";
  const ingestion = await fetch(`${base}/report-ingestion`, { method: "POST", headers: { ...headers, "Idempotency-Key": `agba-e2e-${Date.now()}` }, body: JSON.stringify({ report_text: reportText, department_id: departmentId, source: "e2e-test" }) });
  const ingestionText = await ingestion.text(); if (ingestion.status !== 201) fail("report ingestion", ingestionText); const reportId = JSON.parse(ingestionText).report.id; pass("report ingestion");

  const reasoning = await fetch(`${base}/agba-reasoning`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId, department_id: departmentId, question: "Identify the most important operational issue, explain confidence and severity briefly, and recommend an action.", evidence: [{ report_id: reportId }] }) });
  const reasoningText = await reasoning.text(); if (reasoning.status !== 201) fail("reasoning", reasoningText); const result = JSON.parse(reasoningText); if (!result.reasoning?.confidence_reason || !result.reasoning?.severity_reason) fail("reasoning explanations", result); if (!Array.isArray(result.evidence) || result.evidence.length < 1) fail("evidence links", result); if (result.reasoning?.provider !== "openrouter") fail("reasoning provider", result); if (!result.reasoning?.model) fail("reasoning model", result); pass(`OpenRouter reasoning (${result.reasoning.model}) with confidence/severity explanations`);

  const state = await fetch(`${base}/company-state-v2`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId, reasoning_item_id: result.item.id }) });
  const stateText = await state.text(); if (state.status !== 201) fail("company state", stateText); const stateData = JSON.parse(stateText); if (!stateData.state?.source_reasoning_item_id) fail("company state evidence", stateData); pass("company state materialization");

  const briefing = await fetch(`${base}/daily-briefing-v2`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId }) });
  const briefingText = await briefing.text(); if (briefing.status !== 201) fail("CEO briefing", briefingText); const briefingData = JSON.parse(briefingText); if (!briefingData.briefing?.summary || !Array.isArray(briefingData.items)) fail("CEO briefing output", briefingData); pass("CEO briefing generation");

  const db = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } } });
  const { data: audit, error: auditError } = await db.from("agba_audit_logs").select("id,action,entity_id").eq("entity_id", result.item.id).eq("action", "reasoning.generated").maybeSingle(); if (auditError || !audit) fail("audit trail", auditError ?? "missing audit row"); pass("audit trail");
  console.log("AGBA E2E PASS"); console.log(JSON.stringify({ organization_id: organizationId, department_id: departmentId, report_id: reportId, reasoning: result.reasoning, state: stateData.state, briefing: briefingData.briefing }, null, 2));
} finally { await cleanup(); }
