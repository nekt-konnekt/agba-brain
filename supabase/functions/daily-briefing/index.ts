import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: corsHeaders });

type Row = Record<string, any>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return json({ error: "server_configuration_error" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return json({ error: "invalid_authorization" }, 401);

  let body: { organization_id: string; department_id?: string | null; briefing_date?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.organization_id) return json({ error: "organization_id_required" }, 400);

  const { data: actor } = await admin
    .from("agba_users")
    .select("id, department_id, active, agba_roles(code)")
    .eq("auth_user_id", user.id)
    .eq("organization_id", body.organization_id)
    .eq("active", true)
    .maybeSingle();
  if (!actor) return json({ error: "actor_not_registered_for_organization" }, 403);

  const role = (actor.agba_roles as { code?: string } | null)?.code;
  if (role !== "ceo" && role !== "department_head") return json({ error: "insufficient_role" }, 403);

  const requestedDepartment = body.department_id ?? null;
  if (role === "department_head" && requestedDepartment !== actor.department_id) return json({ error: "department_scope_violation" }, 403);

  const audience = role === "ceo" && !requestedDepartment ? "ceo" : "department_head";
  const departmentId = audience === "ceo" ? null : requestedDepartment;
  const briefingDate = body.briefing_date ?? new Date().toISOString().slice(0, 10);
  const scope = <T extends Row>(rows: T[] | null) => (rows ?? []).filter((row) => role === "ceo" || row.department_id === departmentId || row.department_id == null);

  const [stateResult, actionsResult, decisionsResult, goalsResult, proposalsResult] = await Promise.all([
    admin.from("agba_state_items")
      .select("id,department_id,kind,title,summary,status,confidence,severity,recommended_action,last_seen_at,source_reasoning_item_id,source_report_id")
      .eq("organization_id", body.organization_id).in("status", ["active", "monitoring"])
      .order("last_seen_at", { ascending: false }).limit(30),
    admin.from("agba_actions")
      .select("id,department_id,owner_name,description,deadline,status,priority,source_ceo_query_id,source_state_item_id,created_at,updated_at")
      .eq("organization_id", body.organization_id).in("status", ["open", "in_progress"])
      .order("deadline", { ascending: true, nullsFirst: false }).limit(30),
    admin.from("agba_decisions")
      .select("id,department_id,title,decision_text,status,decided_at,created_at,updated_at")
      .eq("organization_id", body.organization_id).order("updated_at", { ascending: false }).limit(20),
    admin.from("agba_goals")
      .select("id,department_id,title,description,status,target_value,current_value,unit,target_date,created_at,updated_at")
      .eq("organization_id", body.organization_id).in("status", ["planned", "active", "at_risk"])
      .order("target_date", { ascending: true, nullsFirst: false }).limit(20),
    admin.from("agba_proposals")
      .select("id,watcher_id,reasoning_item_id,action_id,approval_id,kind,title,summary,recommendation,status,priority,expires_at,created_at,updated_at")
      .eq("organization_id", body.organization_id).in("status", ["proposed", "approved"])
      .order("priority", { ascending: true }).order("created_at", { ascending: false }).limit(20),
  ]);

  for (const result of [stateResult, actionsResult, decisionsResult, goalsResult, proposalsResult]) {
    if (result.error) return json({ error: "briefing_source_lookup_failed", detail: result.error.message }, 400);
  }

  const state = scope(stateResult.data);
  const actions = scope(actionsResult.data);
  const decisions = scope(decisionsResult.data);
  const goals = scope(goalsResult.data);
  const proposals = proposalsResult.data ?? [];
  const now = Date.now();
  const overdue = actions.filter((a) => a.deadline && new Date(a.deadline).getTime() < now);
  const criticalRisks = state.filter((s) => (s.kind === "risk" || s.kind === "issue") && ["high", "critical"].includes(s.severity));
  const atRiskGoals = goals.filter((g) => g.status === "at_risk");
  const pendingDecisions = decisions.filter((d) => d.status === "proposed");

  const items: Row[] = [];
  const add = (type: string, priority: number, title: string, content: string, source?: string | null) => {
    if (items.length < 8) items.push({ briefing_id: "", type, priority, title, content, source_reasoning_item_id: source ?? null });
  };

  for (const risk of criticalRisks.slice(0, 3)) {
    add("issue", risk.severity === "critical" ? 1 : 2, risk.title, `${risk.summary}${risk.recommended_action ? ` Recommendation: ${risk.recommended_action}` : ""}`, risk.source_reasoning_item_id);
  }
  for (const proposal of proposals.slice(0, 3)) {
    add("attention", proposal.priority, proposal.title, `${proposal.summary}${proposal.recommendation ? ` Recommendation: ${proposal.recommendation}` : ""}`, proposal.reasoning_item_id);
  }
  for (const action of overdue.slice(0, 3)) {
    add("task", 2, `Overdue: ${action.description}`, `Owner: ${action.owner_name ?? "unassigned"}. Deadline: ${action.deadline}.`, action.source_state_item_id ? state.find((s) => s.id === action.source_state_item_id)?.source_reasoning_item_id : null);
  }
  for (const decision of pendingDecisions.slice(0, 2)) add("decision", 2, decision.title, decision.decision_text);
  for (const goal of atRiskGoals.slice(0, 2)) add("watch", 3, goal.title, `Goal is at risk${goal.target_date ? ` with target date ${goal.target_date}` : ""}. ${goal.current_value != null && goal.target_value != null ? `Progress: ${goal.current_value}/${goal.target_value}${goal.unit ? ` ${goal.unit}` : ""}.` : ""}`);
  for (const change of state.filter((s) => s.kind === "observation" || s.kind === "opportunity").slice(0, 2)) add("change", 4, change.title, change.summary, change.source_reasoning_item_id);

  const attention = criticalRisks.length + proposals.length + overdue.length + pendingDecisions.length + atRiskGoals.length;
  const summary = attention === 0
    ? "No active risks, overdue actions, pending decisions, or at-risk goals were found in the current executive memory."
    : `${attention} item${attention === 1 ? "" : "s"} require executive attention. ${criticalRisks.length} critical/high risk${criticalRisks.length === 1 ? "" : "s"}, ${overdue.length} overdue action${overdue.length === 1 ? "" : "s"}, and ${pendingDecisions.length} pending decision${pendingDecisions.length === 1 ? "" : "s"} are currently recorded.`;

  const { data: briefing, error: briefingError } = await admin
    .from("agba_briefings")
    .upsert({ organization_id: body.organization_id, department_id: departmentId, audience, briefing_date: briefingDate, title: audience === "ceo" ? "Daily Company Briefing" : "Daily Department Briefing", summary, status: "validated" }, { onConflict: "organization_id,department_id,audience,briefing_date" })
    .select("*").single();
  if (briefingError || !briefing) return json({ error: "briefing_create_failed", detail: briefingError?.message }, 400);

  const { error: cleanupError } = await admin.from("agba_briefing_items").delete().eq("briefing_id", briefing.id);
  if (cleanupError) return json({ error: "briefing_items_cleanup_failed", detail: cleanupError.message }, 400);

  const rows = items.map((item) => ({ ...item, briefing_id: briefing.id }));
  if (rows.length) {
    const { data: inserted, error: itemError } = await admin.from("agba_briefing_items").insert(rows).select("*");
    if (itemError) return json({ error: "briefing_items_failed", detail: itemError.message }, 400);
    return json({ briefing, items: inserted ?? [], counts: { risks: criticalRisks.length, overdue_actions: overdue.length, pending_decisions: pendingDecisions.length, at_risk_goals: atRiskGoals.length, proposals: proposals.length }, generated_by: "evidence_compiler" }, 201);
  }

  return json({ briefing, items: [], counts: { risks: 0, overdue_actions: 0, pending_decisions: 0, at_risk_goals: 0, proposals: 0 }, generated_by: "evidence_compiler" }, 201);
});
