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
  const configuredBase = Deno.env.get("DASHSCOPE_BASE_URL")?.trim();
  const base = (configuredBase || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/+$/, "");
  const configuredModel = Deno.env.get("DASHSCOPE_MODEL")?.trim();
  const model = configuredModel || "qwen-plus";
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

  const setup = await expect("company setup", await fetch(`${base}/company-setup`, { method: "POST", headers, body: JSON.stringify({
    company: { name: `Agba Business Intelligence E2E ${Date.now()}`, slug: `agba-business-intel-e2e-${Date.now()}`, timezone: "Africa/Lagos", currency_code: "NGN" },
    ceo: { full_name: "Agba Alibaba E2E CEO" },
    departments: [
      { name: "Sales", slug: "sales", head: { full_name: "Sales Head", email: `agba-sales-${Date.now()}@gmail.com` } },
      { name: "Production", slug: "production", head: { full_name: "Production Head", email: `agba-production-${Date.now()}@gmail.com` } },
      { name: "Finance", slug: "finance", head: { full_name: "Finance Head", email: `agba-finance-${Date.now()}@gmail.com` } },
      { name: "Marketing", slug: "marketing", head: { full_name: "Marketing Head", email: `agba-marketing-${Date.now()}@gmail.com` } },
      { name: "Operations", slug: "operations", head: { full_name: "Operations Head", email: `agba-operations-${Date.now()}@gmail.com` } },
    ]
  }) }), 201);
  organizationId = setup.organization.id;
  const departments = Object.fromEntries(setup.departments.map((d: any) => [d.slug, d.id]));
  console.log("PASS company setup: 5 departments");

  const reports = [
    ["sales", "Sales closed ₦1,850,000 today across 37 orders. A corporate customer confirmed a ₦480,000 order for delivery tomorrow, but final artwork approval is still pending and no payment has been received. Two customers asked to move delivery dates."],
    ["production", "Production received 120 orders today and completed 85. 20 orders are waiting for customer artwork approval. 15 orders are blocked because transparent vinyl is out of stock. The ₦480,000 corporate order is scheduled for tomorrow. Emergency materials cost ₦95,000 today."],
    ["finance", "Cash received today was ₦1,020,000. Payments to suppliers were ₦620,000, payroll provision was ₦300,000, and emergency production materials accounted for ₦95,000. Outstanding customer receivables increased by ₦480,000 because the corporate order has not been paid. Cash runway is estimated at 19 days if the current burn rate continues."],
    ["marketing", "The latest Instagram campaign generated 41 qualified enquiries and 9 purchases attributed to the campaign. Ad spend was ₦72,000. Cost per qualified enquiry was approximately ₦1,756. The campaign is outperforming the previous campaign, but most enquiries are from low-margin custom orders."],
    ["operations", "Courier delays affected 11 deliveries today. Average dispatch time increased from 6 hours to 10 hours. One courier partner had a vehicle breakdown. Customer complaints increased from 4 yesterday to 9 today. No permanent courier replacement has been approved yet."],
  ] as const;

  const reportIds: string[] = [];
  for (const [slug, reportText] of reports) {
    const key = `agba-business-intel-${slug}-${Date.now()}-${crypto.randomUUID()}`;
    const report = await expect(`${slug} report ingestion`, await fetch(`${base}/report-ingestion`, { method: "POST", headers: { ...headers, "Idempotency-Key": key }, body: JSON.stringify({ report_text: reportText, department_id: departments[slug], source: "agba-business-intelligence-e2e" }) }), 201);
    reportIds.push(report.report.id);
    console.log(`PASS ${slug} report`);
  }

  const reasoningQuestion = `Act as the company's operating brain. Analyze all supplied department reports together, not independently. Identify the 3 most important issues requiring CEO attention today. Reconcile cross-department relationships and contradictions. Calculate the production blocked-order percentage from 15 blocked out of 120 received. Identify the financial exposure around the ₦480,000 corporate order, distinguish revenue from cash received, assess the courier problem, and evaluate whether the marketing campaign's apparent performance may be misleading because of low-margin orders. Separate confirmed facts from uncertainty. Give severity, confidence, evidence, and one concrete recommended action for each issue. Do not invent facts.`;
  const reasoning = await expect("Alibaba reasoning", await fetch(`${base}/agba-reasoning`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId, question: reasoningQuestion, evidence: reportIds.map((report_id) => ({ report_id })) }) }), 201);
  if (reasoning.reasoning?.provider !== "alibaba") throw new Error(`Expected Alibaba provider, got ${reasoning.reasoning?.provider}`);
  if (!reasoning.reasoning?.model) throw new Error("Alibaba model missing from reasoning response");
  if (!reasoning.reasoning?.confidence_reason || !reasoning.reasoning?.severity_reason) throw new Error("Reasoning confidence/severity explanation missing");
  if (!Array.isArray(reasoning.evidence) || reasoning.evidence.length !== reportIds.length) throw new Error(`Expected ${reportIds.length} evidence links, got ${reasoning.evidence?.length ?? 0}`);
  console.log(`PASS Alibaba reasoning (${reasoning.reasoning.model}) across ${reportIds.length} department reports`);

  const state = await expect("company state", await fetch(`${base}/company-state-v2`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId, reasoning_item_id: reasoning.item.id }) }), 201);
  if (state.state?.source_reasoning_item_id !== reasoning.item.id) throw new Error("Company state lost reasoning trace");
  console.log("PASS company state trace");

  const briefing = await expect("Alibaba briefing", await fetch(`${base}/daily-briefing-v2`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId }) }), 201);
  if (briefing.provider !== "alibaba") throw new Error(`Expected Alibaba briefing provider, got ${briefing.provider}`);
  if (!briefing.model || !briefing.briefing?.summary || !Array.isArray(briefing.items)) throw new Error("Invalid Alibaba briefing response");
  if (briefing.items.length < 3) throw new Error(`Expected at least 3 CEO briefing items, got ${briefing.items.length}`);
  console.log(`PASS Alibaba CEO briefing (${briefing.model}) with ${briefing.items.length} items`);

  const briefingText = JSON.stringify(briefing);
  const businessSignals = ["480", "120", "15", "courier", "cash", "margin", "vinyl", "complaint"];
  const signalHits = businessSignals.filter((signal) => briefingText.toLowerCase().includes(signal.toLowerCase()));
  console.log(`CEO briefing business-signal coverage: ${signalHits.length}/${businessSignals.length} (${signalHits.join(", ") || "none"})`);

  console.log("AGBA REAL BUSINESS INTELLIGENCE E2E PASS");
} finally {
  await cleanup();
}
