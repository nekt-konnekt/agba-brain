import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL");
const anon = Deno.env.get("SUPABASE_ANON_KEY");
const email = Deno.env.get("AGBA_TEST_EMAIL");
const password = Deno.env.get("AGBA_TEST_PASSWORD");
if (!url || !anon || !email || !password) throw new Error("Set SUPABASE_URL, SUPABASE_ANON_KEY, AGBA_TEST_EMAIL and AGBA_TEST_PASSWORD");

const supabase = createClient(url, anon);
const { data: auth, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
if (signInError || !auth.session) throw new Error(`AUTH FAIL: ${signInError?.message ?? "no session"}`);

const headers = { Authorization: `Bearer ${auth.session.access_token}`, apikey: anon, "Content-Type": "application/json" };
const base = `${url}/functions/v1`;

const fail = (label: string, value: unknown): never => { console.error(`FAIL ${label}`, value); Deno.exit(1); };
const pass = (label: string) => console.log(`PASS ${label}`);

const who = await fetch(`${base}/agba-reasoning`, { method: "POST", headers: { ...headers }, body: JSON.stringify({ organization_id: "00000000-0000-0000-0000-000000000000", evidence: [{ report_id: "00000000-0000-0000-0000-000000000000" }] }) });
if (who.status !== 403) fail("authorization boundary", await who.text());
pass("authorization rejects unregistered organization");

const setup = await fetch(`${base}/company-setup`, { method: "POST", headers, body: JSON.stringify({ company: { name: `Agba E2E ${Date.now()}`, slug: `agba-e2e-${Date.now()}`, timezone: "Africa/Lagos", currency_code: "NGN" }, ceo: { full_name: "Agba E2E CEO" }, departments: [{ name: "Production", slug: "production", head: { full_name: "Production Head", email: `agba-e2e-head-${Date.now()}@agba.work` } }] }) });
const setupText = await setup.text();
if (setup.status !== 201) fail("company setup", setupText);
const setupData = JSON.parse(setupText);
const organizationId = setupData.organization.id;
const departmentId = setupData.departments[0].id;
pass("company setup");

const reportText = "We received 120 sticker orders today. 85 orders were completed. 20 are waiting for customer artwork approval. 15 are blocked because transparent vinyl is out of stock. A corporate order worth ₦480,000 is due tomorrow. ₦95,000 was spent today on emergency materials.";
const ingestion = await fetch(`${base}/report-ingestion`, { method: "POST", headers: { ...headers, "Idempotency-Key": `agba-e2e-${Date.now()}` }, body: JSON.stringify({ report_text: reportText, department_id: departmentId, source: "e2e-test" }) });
const ingestionText = await ingestion.text();
if (ingestion.status !== 201) fail("report ingestion", ingestionText);
const reportId = JSON.parse(ingestionText).report.id;
pass("report ingestion");

const reasoning = await fetch(`${base}/agba-reasoning`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId, department_id: departmentId, question: "Identify the most important operational issue, explain confidence and severity briefly, and recommend an action.", evidence: [{ report_id: reportId }] }) });
const reasoningText = await reasoning.text();
if (reasoning.status !== 201) fail("reasoning", reasoningText);
const result = JSON.parse(reasoningText);
if (!result.reasoning?.confidence_reason || !result.reasoning?.severity_reason) fail("reasoning explanations", result);
if (!Array.isArray(result.evidence) || result.evidence.length < 1) fail("evidence links", result);
pass("OpenAI reasoning with confidence/severity explanations");

const db = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } } });
const { data: audit, error: auditError } = await db.from("agba_audit_logs").select("id,action,entity_id").eq("entity_id", result.item.id).eq("action", "reasoning.generated").maybeSingle();
if (auditError || !audit) fail("audit trail", auditError ?? "missing audit row");
pass("audit trail");

console.log("AGBA E2E PASS");
console.log(JSON.stringify({ organization_id: organizationId, department_id: departmentId, report_id: reportId, reasoning: result.reasoning }, null, 2));
