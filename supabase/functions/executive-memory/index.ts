import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
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

  let body: { organization_id: string; department_id?: string | null; limit?: number };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.organization_id) return json({ error: "organization_id_required" }, 400);

  const { data: actor, error: actorError } = await admin
    .from("agba_users")
    .select("id, department_id, active, agba_roles(code)")
    .eq("auth_user_id", user.id)
    .eq("organization_id", body.organization_id)
    .eq("active", true)
    .maybeSingle();
  if (actorError || !actor) return json({ error: "actor_not_registered_for_organization" }, 403);

  const role = (actor.agba_roles as { code?: string } | null)?.code;
  if (role !== "ceo" && role !== "department_head") return json({ error: "insufficient_role" }, 403);

  const departmentId = role === "department_head" ? (body.department_id ?? actor.department_id) : (body.department_id ?? null);
  if (role === "department_head" && departmentId !== actor.department_id) return json({ error: "department_scope_violation" }, 403);

  const limit = Math.min(Math.max(Number(body.limit ?? 20), 1), 50);
  const scoped = <T extends { department_id?: string | null }>(rows: T[] | null) =>
    (rows ?? []).filter((row) => role === "ceo" || row.department_id === departmentId || row.department_id == null);

  const [stateResult, actionsResult, decisionsResult, goalsResult, proposalsResult] = await Promise.all([
    admin.from("agba_state_items")
      .select("id,department_id,state_key,kind,title,summary,status,confidence,severity,recommended_action,first_seen_at,last_seen_at,source_reasoning_item_id,source_report_id,metadata")
      .eq("organization_id", body.organization_id).in("status", ["active", "monitoring"])
      .order("last_seen_at", { ascending: false }).limit(limit),
    admin.from("agba_actions")
      .select("id,department_id,owner_name,description,deadline,status,priority,source_ceo_query_id,source_state_item_id,metadata,created_at,updated_at")
      .eq("organization_id", body.organization_id).in("status", ["pending", "assigned", "in_progress"])
      .order("deadline", { ascending: true, nullsFirst: false }).limit(limit),
    admin.from("agba_decisions")
      .select("id,department_id,title,decision_text,status,decided_at,created_at,updated_at")
      .eq("organization_id", body.organization_id).order("updated_at", { ascending: false }).limit(limit),
    admin.from("agba_goals")
      .select("id,department_id,title,description,status,target_value,current_value,unit,starts_on,target_date,created_at,updated_at")
      .eq("organization_id", body.organization_id).in("status", ["planned", "active", "at_risk"])
      .order("target_date", { ascending: true, nullsFirst: false }).limit(limit),
    admin.from("agba_proposals")
      .select("id,watcher_id,reasoning_item_id,action_id,approval_id,kind,title,summary,recommendation,status,priority,metadata,expires_at,created_at,updated_at")
      .eq("organization_id", body.organization_id).in("status", ["proposed", "approved"])
      .order("priority", { ascending: true }).order("created_at", { ascending: false }).limit(limit),
  ]);

  for (const result of [stateResult, actionsResult, decisionsResult, goalsResult, proposalsResult]) {
    if (result.error) return json({ error: "memory_lookup_failed", detail: result.error.message }, 400);
  }

  const state = scoped(stateResult.data);
  const actions = scoped(actionsResult.data);
  const decisions = scoped(decisionsResult.data);
  const goals = scoped(goalsResult.data);
  const proposals = proposalsResult.data ?? [];

  const now = Date.now();
  const overdueActions = actions.filter((a: any) => a.deadline && new Date(a.deadline).getTime() < now);
  const criticalRisks = state.filter((s: any) => (s.kind === "risk" || s.kind === "issue") && ["high", "critical"].includes(s.severity));
  const atRiskGoals = goals.filter((g: any) => g.status === "at_risk");

  return json({
    organization_id: body.organization_id,
    scope: role === "ceo" && !departmentId ? "company" : "department",
    department_id: departmentId,
    generated_at: new Date().toISOString(),
    memory: {
      active_state: state,
      open_actions: actions,
      overdue_actions: overdueActions,
      decisions: decisions,
      active_goals: goals,
      at_risk_goals: atRiskGoals,
      proposals: proposals,
      critical_risks: criticalRisks,
    },
    counts: {
      active_state: state.length,
      open_actions: actions.length,
      overdue_actions: overdueActions.length,
      decisions: decisions.length,
      active_goals: goals.length,
      at_risk_goals: atRiskGoals.length,
      proposals: proposals.length,
      critical_risks: criticalRisks.length,
    },
  });
});
