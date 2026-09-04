import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "server_configuration_error" }, 500);
  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "missing_authorization" }, 401);

  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const token = auth.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: userError } = await db.auth.getUser(token);
  if (userError || !user) return json({ error: "invalid_authorization" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const action = String(body.action ?? "").trim();
  const actionId = String(body.action_id ?? "").trim();
  const organizationId = String(body.organization_id ?? "").trim();
  if (!action || !actionId || !organizationId) return json({ error: "action, action_id and organization_id are required" }, 400);

  const { data: actor, error: actorError } = await db
    .from("agba_users")
    .select("id,organization_id,active,full_name,agba_roles(code)")
    .eq("auth_user_id", user.id).eq("organization_id", organizationId).eq("active", true).maybeSingle();
  if (actorError || !actor) return json({ error: "actor_not_registered_for_organization" }, 403);
  const role = Array.isArray(actor.agba_roles) ? actor.agba_roles[0]?.code : actor.agba_roles?.code;
  if (role !== "ceo") return json({ error: "ceo_role_required" }, 403);

  const { data: row, error: rowError } = await db
    .from("agba_actions")
    .select("id,organization_id,description,status,priority,owner_name,deadline,metadata")
    .eq("id", actionId).eq("organization_id", organizationId).maybeSingle();
  if (rowError || !row) return json({ error: "action_not_found" }, 404);

  if (action === "complete") {
    if (["done", "cancelled"].includes(row.status)) return json({ action: row, message: "Action is already closed." });
    const now = new Date().toISOString();
    const metadata = { ...(row.metadata ?? {}), completed_via: "office", completed_at: now };
    const { data: updated, error } = await db.from("agba_actions").update({ status: "done", updated_at: now, metadata }).eq("id", actionId).eq("organization_id", organizationId).select("*").single();
    if (error) return json({ error: "action_update_failed", detail: error.message }, 400);
    await db.from("agba_audit_logs").insert({ organization_id: organizationId, actor_auth_user_id: user.id, actor_agba_user_id: actor.id, action: "office.action.completed", entity_type: "agba_actions", entity_id: actionId, metadata: { description: row.description } });
    return json({ ok: true, action: updated, result: { type: "completed", message: `Completed: ${row.description}` } });
  }

  if (action === "start") {
    if (row.status === "done") return json({ action: row, message: "Action is already complete." });
    const now = new Date().toISOString();
    const { data: updated, error } = await db.from("agba_actions").update({ status: "in_progress", updated_at: now }).eq("id", actionId).eq("organization_id", organizationId).select("*").single();
    if (error) return json({ error: "action_update_failed", detail: error.message }, 400);
    await db.from("agba_audit_logs").insert({ organization_id: organizationId, actor_auth_user_id: user.id, actor_agba_user_id: actor.id, action: "office.action.started", entity_type: "agba_actions", entity_id: actionId, metadata: { description: row.description } });
    return json({ ok: true, action: updated, result: { type: "started", message: `Started: ${row.description}` } });
  }

  if (action === "execute") {
    if (["done", "cancelled"].includes(row.status)) return json({ error: "action_not_executable", status: row.status }, 409);
    const tool = String(body.tool ?? "noop").trim() || "noop";
    const idem = String(body.idempotency_key ?? `office:${actionId}:${tool}`);
    const { data: existing } = await db.from("agba_action_executions").select("*").eq("organization_id", organizationId).eq("idempotency_key", idem).maybeSingle();
    if (existing) return json({ ok: true, replayed: true, action: row, execution: existing, result: { type: "replayed", message: "This command was already executed." } });

    const { data: execution, error: createError } = await db.from("agba_action_executions").insert({ organization_id: organizationId, action_id: actionId, tool_name: tool, status: "pending", idempotency_key: idem, input: body.input ?? {}, metadata: { dispatched_by: actor.id, channel: "office" } }).select("*").single();
    if (createError || !execution) return json({ error: "execution_create_failed", detail: createError?.message }, 400);
    const now = new Date().toISOString();
    const { data: running, error: runningError } = await db.from("agba_action_executions").update({ status: "running", started_at: now }).eq("id", execution.id).eq("status", "pending").select("*").single();
    if (runningError || !running) return json({ error: "execution_start_failed", detail: runningError?.message }, 400);

    await db.from("agba_actions").update({ status: "in_progress", updated_at: now }).eq("id", actionId).eq("organization_id", organizationId).in("status", ["open", "in_progress"]);
    if (tool !== "noop") {
      const message = `Tool '${tool}' is not registered in Action Executor V1.`;
      const { data: failed } = await db.from("agba_action_executions").update({ status: "failed", error: message, completed_at: new Date().toISOString() }).eq("id", execution.id).eq("status", "running").select("*").single();
      await db.from("agba_audit_logs").insert({ organization_id: organizationId, actor_auth_user_id: user.id, actor_agba_user_id: actor.id, action: "office.action.execution_failed", entity_type: "agba_action_executions", entity_id: execution.id, metadata: { action_id: actionId, tool } });
      return json({ error: "tool_not_allowed", detail: message, action: row, execution: failed }, 403);
    }

    const output = { ok: true, tool: "noop", message: String(body.input?.message ?? row.description), executed_at: new Date().toISOString(), channel: "office" };
    const { data: done, error: doneError } = await db.from("agba_action_executions").update({ status: "succeeded", output, completed_at: new Date().toISOString() }).eq("id", execution.id).eq("status", "running").select("*").single();
    if (doneError || !done) return json({ error: "execution_complete_failed", detail: doneError?.message }, 400);
    await db.from("agba_audit_logs").insert({ organization_id: organizationId, actor_auth_user_id: user.id, actor_agba_user_id: actor.id, action: "office.action.executed", entity_type: "agba_action_executions", entity_id: execution.id, metadata: { action_id: actionId, tool } });
    return json({ ok: true, action: { ...row, status: "in_progress" }, execution: done, result: { type: "executed", message: `Command dispatched: ${row.description}` } });
  }

  return json({ error: "unsupported_action" }, 400);
});
