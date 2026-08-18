import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL");
const anon = Deno.env.get("SUPABASE_ANON_KEY");
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const dashscopeKey = Deno.env.get("DASHSCOPE_API_KEY");
if (!url || !anon || !serviceRole || !dashscopeKey) throw new Error("Set Supabase and DashScope environment variables");

const admin = createClient(url, serviceRole, { auth: { autoRefreshToken: false, persistSession: false } });
const email = `agba-memory-e2e-${Date.now()}@gmail.com`;
const password = `AgbaMemoryE2E-${crypto.randomUUID()}-X9!`;
const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "Agba Memory E2E CEO" } });
if (createError || !created.user) throw new Error(`CEO creation failed: ${createError?.message ?? "no user"}`);
let organizationId: string | null = null;
const cleanup = async () => {
  if (organizationId) await admin.from("agba_organizations").delete().eq("id", organizationId);
  await admin.auth.admin.deleteUser(created.user.id);
};
const read = async (r: Response) => { const text = await r.text(); try { return JSON.parse(text); } catch { return { raw: text }; } };
const expect = async (label: string, r: Response, status: number) => { const body = await read(r); if (r.status !== status) throw new Error(`${label}: expected ${status}, got ${r.status}: ${JSON.stringify(body)}`); return body; };

try {
  const configuredBase = Deno.env.get("DASHSCOPE_BASE_URL")?.trim();
  const baseAi = (configuredBase || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/+$/, "");
  const model = Deno.env.get("DASHSCOPE_MODEL")?.trim() || "qwen-plus";
  const preflight = await fetch(`${baseAi}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${dashscopeKey}` }, body: JSON.stringify({ model, temperature: 0, messages: [{ role: "user", content: "Reply with exactly OK" }] }) });
  const preflightBody = await read(preflight);
  if (!preflight.ok) throw new Error(`Alibaba preflight failed: HTTP ${preflight.status} ${JSON.stringify(preflightBody)}`);
  console.log(`ALIBABA MEMORY PREFLIGHT ${model}: HTTP ${preflight.status}`);

  const supabase = createClient(url, anon);
  const { data: auth, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError || !auth.session) throw new Error(`Auth failed: ${signInError?.message ?? "no session"}`);
  const headers = { Authorization: `Bearer ${auth.session.access_token}`, apikey: anon, "Content-Type": "application/json" };
  const base = `${url}/functions/v1`;

  const setup = await expect("company setup", await fetch(`${base}/company-setup`, { method: "POST", headers, body: JSON.stringify({
    company: { name: `Agba Longitudinal Memory E2E ${Date.now()}`, slug: `agba-longitudinal-memory-e2e-${Date.now()}`, timezone: "Africa/Lagos", currency_code: "NGN" },
    ceo: { full_name: "Agba Memory E2E CEO" },
    departments: [
      { name: "Sales", slug: "sales", head: { full_name: "Sales Head", email: `memory-sales-${Date.now()}@gmail.com` } },
      { name: "Production", slug: "production", head: { full_name: "Production Head", email: `memory-production-${Date.now()}@gmail.com` } },
      { name: "Finance", slug: "finance", head: { full_name: "Finance Head", email: `memory-finance-${Date.now()}@gmail.com` } },
      { name: "Operations", slug: "operations", head: { full_name: "Operations Head", email: `memory-operations-${Date.now()}@gmail.com` } },
    ]
  }) }), 201);
  organizationId = setup.organization.id;
  const departments = Object.fromEntries(setup.departments.map((d: any) => [d.slug, d.id]));
  console.log("PASS company setup: longitudinal-memory company");

  const days = [
    ["Day 1 baseline", "sales", "Baseline: sales closed ₦480,000 from 20 orders. Gross margin is 32%. Production capacity is 100 orders per day and current backlog is 10. Average courier delivery time is 24 hours. Customer complaints were 4 today."],
    ["Day 2 growth", "sales", "Sales increased to ₦550,000 from 24 orders. Three large orders are waiting for production. Gross margin remains about 32%. Customer complaints rose to 5."],
    ["Day 3 pressure", "production", "Production received 38 orders and completed 30. Backlog is now 18 orders. Transparent vinyl stock is low and emergency material purchases cost ₦60,000. Courier delivery time is now 30 hours."],
    ["Day 4 cash squeeze", "finance", "Cash received was ₦410,000 while supplier payments were ₦390,000. A ₦120,000 customer invoice remains unpaid. Gross margin fell to 27% because material costs increased."],
    ["Day 5 intervention", "operations", "Management approved an additional production shift and a second courier partner. The extra shift starts today. Courier average delivery time improved to 22 hours. Backlog is still 18 orders because the intervention is new."],
    ["Day 6 recovery", "production", "After the additional shift, production completed 42 orders against 35 received. Backlog fell from 18 to 11. Transparent vinyl was replenished. Material emergency purchases fell to ₦10,000."],
    ["Day 7 outcome", "sales", "Sales reached ₦620,000 from 29 orders. Gross margin recovered to 30%. Customer complaints fell to 3. The second courier partner handled 12 deliveries with no reported delay. The ₦120,000 invoice is still unpaid."],
  ] as const;

  const reportIds: string[] = [];
  const briefingSnapshots: string[] = [];

  for (const [label, slug, reportText] of days) {
    const report = await expect(`${label} report`, await fetch(`${base}/report-ingestion`, { method: "POST", headers: { ...headers, "Idempotency-Key": `memory-${crypto.randomUUID()}` }, body: JSON.stringify({ report_text: reportText, department_id: departments[slug], source: "agba-longitudinal-memory-e2e" }) }), 201);
    reportIds.push(report.report.id);

    const reasoningQuestion = `Record the important business fact from this reporting period as a durable company-state observation. Preserve the exact numeric values and distinguish current facts from assumptions. Do not invent facts. The company will receive more reports later, so make the observation useful for longitudinal comparison.`;
    const reasoning = await expect(`${label} reasoning`, await fetch(`${base}/agba-reasoning`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId, question: reasoningQuestion, evidence: [{ report_id: report.report.id }] }) }), 201);
    if (reasoning.reasoning?.provider !== "alibaba") throw new Error(`${label}: expected Alibaba reasoning provider`);

    await expect(`${label} state update`, await fetch(`${base}/company-state-v2`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId, reasoning_item_id: reasoning.item.id }) }), 201);

    const briefing = await expect(`${label} briefing`, await fetch(`${base}/daily-briefing-v2`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId, briefing_date: `2026-08-${String(10 + days.indexOf(days.find((d) => d[0] === label)!)).padStart(2, "0")}` }) }), 201);
    briefingSnapshots.push(JSON.stringify(briefing));
    console.log(`PASS ${label}: report -> reasoning -> persistent state -> briefing`);
  }

  const finalBriefing = JSON.parse(briefingSnapshots.at(-1)!);
  const finalText = JSON.stringify(finalBriefing).toLowerCase();

  const requiredHistoricalSignals = [
    "480",
    "32",
    "18",
    "60",
    "120",
    "22",
    "620",
    "30",
    "3",
  ];
  const historicalHits = requiredHistoricalSignals.filter((signal) => finalText.includes(signal));
  console.log(`LONGITUDINAL MEMORY SIGNALS: ${historicalHits.length}/${requiredHistoricalSignals.length} (${historicalHits.join(", ") || "none"})`);
  if (historicalHits.length < 6) throw new Error(`Final briefing did not retain enough historical business signals: ${historicalHits.length}/${requiredHistoricalSignals.length}`);

  const finalReasoningQuestion = `Using the company's accumulated state and recent reports, explain what materially changed from the Day 1 baseline to Day 7. Identify: (1) sales change from ₦480,000 to ₦620,000, (2) gross-margin movement from 32% to 30% after falling to 27%, (3) production backlog movement from 10 to 18 and then 11, (4) the production-shift intervention and its observed result, (5) courier improvement from 30 hours to 22 hours, and (6) the still-unpaid ₦120,000 invoice. Separate confirmed facts from causal inference. State whether the interventions appear effective and why. Do not invent facts.`;
  const finalReasoning = await expect("longitudinal memory reasoning", await fetch(`${base}/agba-reasoning`, { method: "POST", headers, body: JSON.stringify({ organization_id: organizationId, question: finalReasoningQuestion, evidence: [{ report_id: reportIds.at(-1) }] }) }), 201);
  if (finalReasoning.reasoning?.provider !== "alibaba") throw new Error("Longitudinal reasoning did not use Alibaba");

  const finalReasoningText = JSON.stringify(finalReasoning).toLowerCase();
  const reasoningSignals = ["480", "620", "32", "27", "30", "18", "11", "120"];
  const reasoningHits = reasoningSignals.filter((signal) => finalReasoningText.includes(signal));
  console.log(`LONGITUDINAL REASONING SIGNALS: ${reasoningHits.length}/${reasoningSignals.length} (${reasoningHits.join(", ") || "none"})`);
  if (reasoningHits.length < 5) throw new Error(`Longitudinal reasoning failed to demonstrate sufficient historical recall: ${reasoningHits.length}/${reasoningSignals.length}`);

  console.log("AGBA LONGITUDINAL MEMORY E2E PASS");
} finally {
  await cleanup();
}
