import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL");
const anon = Deno.env.get("SUPABASE_ANON_KEY");
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const dashscopeKey = Deno.env.get("DASHSCOPE_API_KEY");
if (!url || !anon || !serviceRole || !dashscopeKey) throw new Error("Set SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY and DASHSCOPE_API_KEY");

const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
const email = `agba-alibaba-e2e-${Date.now()}@gmail.com`;
const password = `AgbaAlibabaE2E-${crypto.randomUUID()}-X9!`;
const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Agba Alibaba E2E CEO" } });
if (createError || !created.user) throw new Error(`CEO creation failed: ${createError?.message ?? "no user"}`);
let organizationId: string | null = null;
const cleanup = async () => { if (organizationId) await admin.from("agba_organizations").delete().eq("id", organizationId); await admin.auth.admin.deleteUser(created.user.id); };
const read = async (r: Response) => { const text = await r.text(); try { return JSON.parse(text); } catch { return { raw: text }; } };
const expect = async (label: string, r: Response, status: number) => { const body = await read(r); if (r.status !== status) throw new Error(`${label}: expected ${status}, got ${r.status}: ${JSON.stringify(body)}`); return body; };

async function alibabaPreflight() {
  const base = (Deno.env.get("DASHSCOPE_BASE_URL") ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/+$/, "");
  const model = Deno.env.get("DASHSCOPE_MODEL") ?? "qwen3.7-plus";
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${dashscopeKey}` },
    body: JSON.stringify({ model, temperature: 0, messages: [{ role: "user", content: "Reply with exactly OK" }] }),
  });
  const body = await read(response);
  console.log(`ALIBABA PREFLIGHT ${model}: HTTP ${response.status} ${JSON.stringify(body)}`);
  if (!response.ok) throw new Error(`Alibaba preflight failed: HTTP ${response.status} ${JSON.stringify(body)}`);
}

try {
  await alibabaPreflight();

  const supabase = createClient(url, anon);
  const { data: auth, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError || !auth.session) throw new Error(`Auth failed: ${signInError?.message ?? "no session"}`);
  const headers = { Authorization: `Bearer ${auth.session.access_token}`, apikey: anon, "Content-Type": "application/json" };
  const base = `${url}/functions/v1`;

  const setup = await expect("company setup", await fetch(`${base}/company-setup`, { method: "POST", headers, body: JSON.stringify({ company: { name: `Agba Alibaba E2E ${Date.now()}`, slug: `agba-alibaba-e2e-${Date.now()}`, timezone: "Africa/Lagos", currency_code: "NGN" }, ceo: { full_name: "Agba Alibaba E2E CEO" }, departments: [{ name: "Production", slug: "production", head: { full_name: "Production Head", email: `agba-alibaba-head-${Date.now()}@gmail.com` } }] }) }), 201);
  organizationId = setup.organization.id;
  const departmentId = setup.departments[0].id;
  console.log("PASS company setup");

  const report = await expect("report ingestion", await fetch(`${base}/report-ingestion`, { method: "POST", headers, body: JSON.stringify({ report_text: "120 orders received. 15 are blocked by transparent vinyl stockout. A confirmed corporate order worth ₦480,000 is due tomorrow. ₦95,000 was spent on emergency materials.", department_id: departmentId, source: "alibaba-e2e" }) }), 201);
  console.log("PASS report ingestion");

  const reasoning = await expect("Alibaba reasoning", await fetch(`${base}/agba-reasoning`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId, department_id: departmentId, question: "Identify the most important operational issue. Calculate the blocked-order percentage, identify the financial exposure, distinguish facts from uncertainty, and recommend one concrete action. Return evidence-grounded reasoning.", evidence: [{ report_id: report.report.id }] }) }), 201);
  if (reasoning.reasoning?.provider !== "alibaba") throw new Error(`Expected Alibaba provider, got ${reasoning.reasoning?.provider}`);
  if (!reasoning.reasoning?.model) throw new Error("Alibaba model missing from reasoning response");
  if (!reasoning.reasoning?.confidence_reason || !reasoning.reasoning?.severity_reason) throw new Error("Reasoning confidence/severity explanation missing");
  console.log(`PASS Alibaba reasoning (${reasoning.reasoning.model})`);

  const state = await expect("company state", await fetch(`${base}/company-state-v2`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId, reasoning_item_id: reasoning.item.id }) }), 201);
  if (state.state?.source_reasoning_item_id !== reasoning.item.id) throw new Error("Company state lost reasoning trace");
  console.log("PASS company state trace");

  const briefing = await expect("Alibaba briefing", await fetch(`${base}/daily-briefing-v2`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId }) }), 201);
  if (briefing.provider !== "alibaba") throw new Error(`Expected Alibaba briefing provider, got ${briefing.provider}`);
  if (!briefing.model || !briefing.briefing?.summary || !Array.isArray(briefing.items)) throw new Error("Invalid Alibaba briefing response");
  console.log(`PASS Alibaba CEO briefing (${briefing.model})`);

  console.log("AGBA ALIBABA E2E PASS");
} finally {
  await cleanup();
}
