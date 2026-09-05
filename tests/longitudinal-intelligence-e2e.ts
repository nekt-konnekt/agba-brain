import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL");
const anon = Deno.env.get("SUPABASE_ANON_KEY");
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !anon || !serviceRole) throw new Error("Set required Supabase test environment variables");

const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
const email = `agba-longitudinal-${Date.now()}@gmail.com`;
const password = `AgbaLong-${crypto.randomUUID()}-X9!`;
let organizationId: string | null = null;
let authUserId: string | null = null;

const parse = async (r: Response) => { const text = await r.text(); try { return JSON.parse(text); } catch { return { text }; } };
const cleanup = async () => {
  if (organizationId) await admin.from("agba_organizations").delete().eq("id", organizationId);
  if (authUserId) await admin.auth.admin.deleteUser(authUserId);
};

try {
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Agba Longitudinal CEO" } });
  if (created.error || !created.data.user) throw new Error(`CEO creation failed: ${created.error?.message ?? "no user"}`);
  authUserId = created.data.user.id;

  const supabase = createClient(url, anon);
  const signedIn = await supabase.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw new Error(`CEO sign-in failed: ${signedIn.error?.message ?? "no session"}`);
  const headers = { Authorization: `Bearer ${signedIn.data.session.access_token}`, apikey: anon, "Content-Type": "application/json" };
  const base = `${url}/functions/v1`;

  const setupResponse = await fetch(`${base}/company-setup`, { method: "POST", headers, body: JSON.stringify({ company: { name: `Agba Longitudinal ${Date.now()}`, slug: `agba-long-${Date.now()}`, timezone: "Africa/Lagos", currency_code: "NGN" }, ceo: { full_name: "Agba Longitudinal CEO" }, departments: [{ name: "Finance", slug: "finance", head: { full_name: "Finance Head", email: `agba-long-finance-${Date.now()}@gmail.com` } }] }) });
  const setup = await parse(setupResponse);
  if (setupResponse.status !== 201) throw new Error(`Company setup failed: ${JSON.stringify(setup)}`);
  organizationId = setup.organization.id;

  const periods = [
    ["2026-08-29", "Customer receivables outstanding were ₦80,000 at period end."],
    ["2026-09-01", "Customer receivables outstanding were ₦120,000 at period end."],
    ["2026-09-04", "Customer receivables outstanding were ₦185,000 at period end."],
  ];
  const reports: string[] = [];
  for (const [date, text] of periods) {
    const response = await fetch(`${base}/report-ingestion`, { method: "POST", headers, body: JSON.stringify({ report_text: text, report_date: date, source: "longitudinal-e2e", idempotency_key: `longitudinal-${date}` }) });
    const data = await parse(response);
    if (response.status !== 201) throw new Error(`Report ingestion failed for ${date}: ${JSON.stringify(data)}`);
    reports.push(data.report.id);
  }

  const { error: confirmError } = await admin.from("agba_reports").update({ confirmation_status: "confirmed", confirmed_at: new Date().toISOString() }).in("id", reports);
  if (confirmError) throw new Error(`Report confirmation failed: ${confirmError.message}`);

  const queryResponse = await fetch(`${base}/ceo-query`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId, question: "What changed in customer receivables outstanding across the last three confirmed reporting periods? Compare the latest period with the previous period and recent baseline. Identify the direction of the material change and provide report-level evidence." }) });
  const query = await parse(queryResponse);
  if (queryResponse.status !== 200) throw new Error(`CEO query failed: ${JSON.stringify(query)}`);
  const changes = query.answer?.changes;
  if (!Array.isArray(changes) || changes.length === 0) throw new Error(`Longitudinal changes missing: ${JSON.stringify(query.answer)}`);

  const relevant = changes.find((c: any) => /receivable|outstanding|payment|customer/i.test(String(c.topic ?? "")) && c.direction === "up");
  if (!relevant) throw new Error(`No upward receivables change found: ${JSON.stringify(changes)}`);
  const evidence = new Set(relevant.evidence_report_ids ?? []);
  for (const id of reports) if (!evidence.has(id)) throw new Error(`Longitudinal change missing report evidence ${id}: ${JSON.stringify(relevant)}`);

  const { data: persisted, error: persistedError } = await admin.from("agba_ceo_queries").select("provenance").eq("id", query.query.id).single();
  if (persistedError || !persisted) throw new Error(`Persisted CEO query missing: ${persistedError?.message ?? "no row"}`);
  const persistedChanges = persisted.provenance?.changes ?? [];
  if (!Array.isArray(persistedChanges) || persistedChanges.length === 0) throw new Error("Longitudinal changes were not persisted in query provenance");

  console.log("LONGITUDINAL INTELLIGENCE E2E PASS");
  console.log(JSON.stringify({ reports, change: relevant, persisted_changes: persistedChanges }, null, 2));
} finally {
  await cleanup();
}
