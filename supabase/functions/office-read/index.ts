import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "server_configuration_error" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return json({ error: "invalid_authorization" }, 401);

  const { data: actor, error: actorError } = await admin.from("agba_users").select("id, organization_id, department_id, active, full_name, agba_roles(code)").eq("auth_user_id", user.id).eq("active", true).maybeSingle();
  if (actorError || !actor) return json({ error: "actor_not_registered" }, 403);
  const role = Array.isArray(actor.agba_roles) ? actor.agba_roles[0]?.code : actor.agba_roles?.code;
  if (role !== "ceo") return json({ error: "ceo_role_required" }, 403);

  const orgId = actor.organization_id;
  const today = new Date().toISOString().slice(0, 10);
  const [orgQ, departmentsQ, reportsQ, stateQ, actionsQ, decisionsQ, metricsQ, queriesQ, telegramQ, inboundQ, outboundQ] = await Promise.all([
    admin.from("agba_organizations").select("id,name,timezone,currency_code").eq("id", orgId).single(),
    admin.from("agba_departments").select("id,name,slug,active").eq("organization_id", orgId).eq("active", true).order("name"),
    admin.from("agba_reports").select("id,department_id,submitted_by,report_date,raw_text,status,source,confirmation_status,confirmed_at,created_at,processed_at").eq("organization_id", orgId).eq("confirmation_status", "confirmed").order("created_at", { ascending: false }).limit(40),
    admin.from("agba_state_items").select("id,department_id,kind,state_key,title,summary,status,confidence,severity,recommended_action,first_seen_at,last_seen_at,source_report_id,metadata").eq("organization_id", orgId).in("status", ["active", "monitoring"]).order("last_seen_at", { ascending: false }).limit(40),
    admin.from("agba_actions").select("id,owner_name,description,deadline,status,priority,source_ceo_query_id,source_state_item_id,created_at,updated_at,metadata").eq("organization_id", orgId).in("status", ["open", "in_progress"]).order("created_at", { ascending: false }).limit(30),
    admin.from("agba_decisions").select("id,department_id,made_by_user_id,title,decision_text,status,decided_at,created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(10),
    admin.from("agba_metrics").select("name,key,unit,value_numeric,value_text,measured_on").eq("organization_id", orgId).order("measured_on", { ascending: false }).limit(50),
    admin.from("agba_ceo_queries").select("id,question,answer,confidence,confidence_reason,provenance,created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(12),
    admin.from("agba_telegram_bindings").select("chat_id,telegram_username,role_code,created_at,updated_at").eq("organization_id", orgId).order("updated_at", { ascending: false }).limit(10),
    admin.from("agba_telegram_update_inbox").select("id,message_id,payload,status,received_at,dispatched_at,completed_at,last_error").eq("organization_id", orgId).order("received_at", { ascending: false }).limit(12),
    admin.from("agba_telegram_delivery_outbox").select("id,inbox_id,payload,status,sent_at,created_at,updated_at,last_error").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(12),
  ]);
  for (const q of [orgQ, departmentsQ, reportsQ, stateQ, actionsQ, decisionsQ, metricsQ, queriesQ, telegramQ, inboundQ, outboundQ]) if (q.error) return json({ error: "office_read_failed", detail: q.error.message }, 400);

  const departments = departmentsQ.data ?? [], reports = reportsQ.data ?? [], state = stateQ.data ?? [], actions = actionsQ.data ?? [], decisions = decisionsQ.data ?? [], metrics = metricsQ.data ?? [], queries = queriesQ.data ?? [], telegramBindings = telegramQ.data ?? [], inbound = inboundQ.data ?? [], outbound = outboundQ.data ?? [];
  const operationalState = state.filter((s: any) => s.metadata?.memory_type !== "completed_management_action");
  const todayReports = reports.filter((r: any) => r.report_date === today);
  const reportsByDept = new Set(todayReports.map((r: any) => r.department_id).filter(Boolean));
  const health = departments.length ? Math.round((reportsByDept.size / departments.length) * 100) : 0;
  const openRisks = operationalState.filter((s: any) => ["risk", "issue"].includes(s.kind));
  const critical = openRisks.filter((s: any) => ["critical", "high"].includes(s.severity)).slice(0, 5);
  const changes = operationalState.filter((s: any) => s.kind === "observation" || s.kind === "opportunity").slice(0, 5);
  const metric = (keys: string[]) => metrics.find((m: any) => keys.some((k) => String(m.key ?? m.name).toLowerCase().includes(k)));
  const revenue = metric(["revenue", "sales"]), outstanding = metric(["outstanding", "receivable", "receivables", "unpaid"]);
  const departmentPulse = departments.map((d: any) => { const deptReports = todayReports.filter((r: any) => r.department_id === d.id); const deptState = operationalState.filter((s: any) => s.department_id === d.id); const risk = deptState.find((s: any) => ["risk", "issue"].includes(s.kind)); return { id: d.id, name: d.name, health: risk ? "warn" : deptReports.length ? "good" : "missing", text: risk ? risk.summary : deptReports.length ? `${deptReports.length} report${deptReports.length > 1 ? "s" : ""} received today` : "No confirmed report received today" }; });
  const attention = [...critical.map((s: any) => ({ icon: "!", title: s.title, text: s.summary, badge: String(s.kind).toUpperCase(), tone: ["critical", "high"].includes(s.severity) ? "danger" : "warn", source_state_item_id: s.id })), ...actions.slice(0, 4).map((a: any) => ({ icon: "✓", title: a.description, text: `${a.owner_name ?? "Unassigned"}${a.deadline ? ` · Due ${new Date(a.deadline).toLocaleDateString("en-NG")}` : ""}`, badge: String(a.priority).toUpperCase(), tone: ["critical", "high"].includes(a.priority) ? "danger" : "warn", source_action_id: a.id }))].slice(0, 6);
  const telegramMessages = inbound.map((item: any) => ({ direction: "inbound", text: item.payload?.message?.text ?? item.payload?.message?.caption ?? null, username: item.payload?.message?.from?.username ?? null, received_at: item.received_at, status: item.status, last_error: item.last_error })).filter((m: any) => m.text).slice(0, 8);
  const telegramReplies = outbound.map((item: any) => ({ direction: "outbound", text: item.payload?.text ?? item.payload?.message?.text ?? null, sent_at: item.sent_at ?? item.updated_at ?? item.created_at, status: item.status, last_error: item.last_error })).filter((m: any) => m.text).slice(0, 8);
  return json({ organization: orgQ.data, today, reporting_health: health, metrics: { revenue: revenue ? { value: revenue.value_numeric ?? revenue.value_text, unit: revenue.unit, measured_on: revenue.measured_on } : null, outstanding: outstanding ? { value: outstanding.value_numeric ?? outstanding.value_text, unit: outstanding.unit, measured_on: outstanding.measured_on } : null }, attention, changes: changes.map((s: any) => ({ icon: s.kind === "opportunity" ? "+" : "↑", title: s.title, text: s.summary, source_state_item_id: s.id })), departments: departmentPulse, decisions: decisions.map((d: any) => ({ date: d.decided_at ?? d.created_at, title: d.title, text: d.decision_text, status: d.status })), actions, state: operationalState.map((s: any) => ({ id: s.id, kind: s.kind, title: s.title, summary: s.summary, severity: s.severity, confidence: s.confidence, recommended_action: s.recommended_action, last_seen_at: s.last_seen_at })), reports: reports.slice(0, 12).map((r: any) => ({ id: r.id, department_id: r.department_id, report_date: r.report_date, raw_text: r.raw_text, status: r.status, source: r.source, confirmation_status: r.confirmation_status, confirmed_at: r.confirmed_at, created_at: r.created_at, processed_at: r.processed_at })), conversations: queries.map((q: any) => ({ id: q.id, question: q.question, answer: q.answer, confidence: q.confidence, confidence_reason: q.confidence_reason, created_at: q.created_at, provenance: q.provenance })), telegram: { connected: telegramBindings.length > 0, bindings: telegramBindings.map((b: any) => ({ telegram_username: b.telegram_username, role_code: b.role_code, created_at: b.created_at, updated_at: b.updated_at })), recent_messages: [...telegramMessages, ...telegramReplies].sort((a: any, b: any) => new Date(b.received_at ?? b.sent_at).getTime() - new Date(a.received_at ?? a.sent_at).getTime()).slice(0, 10) }, source_counts: { reports: reports.length, conversations: queries.length, active_state: operationalState.length, open_actions: actions.length, telegram_inbound: inbound.length, telegram_outbound: outbound.length } });
});
