import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function actor(req: Request, admin: any) {
  const auth = req.headers.get("Authorization");
  if (!auth) return { error: json({ error: "missing_authorization" }, 401) };
  const token = auth.replace(/^Bearer\s+/i, "");
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return { error: json({ error: "invalid_authorization" }, 401) };
  const { data: platformAdmin, error: adminError } = await admin.from("agba_platform_admins").select("id,active,email").eq("auth_user_id", user.id).eq("active", true).maybeSingle();
  if (adminError) return { error: json({ error: "platform_admin_lookup_failed", detail: adminError.message }, 500) };
  if (!platformAdmin) return { error: json({ error: "platform_admin_required" }, 403) };
  return { user, platformAdmin };
}

async function overview(admin: any) {
  const [components, incidents, recoveries, inbox, delivery, audit] = await Promise.all([
    admin.from("agba_system_components").select("id,key,name,category,status,last_heartbeat_at,last_success_at,last_failure_at,failure_count,metadata,updated_at").order("category").order("name"),
    admin.from("agba_system_incidents").select("id,component_id,severity,status,title,description,detected_at,resolved_at,metadata,created_at,updated_at,agba_system_components(key,name)").order("detected_at", { ascending: false }).limit(30),
    admin.from("agba_recovery_actions").select("id,key,name,description,risk_level,requires_confirmation,enabled,created_at").eq("enabled", true).order("name"),
    admin.from("agba_telegram_update_inbox").select("id,organization_id,status,attempts,max_attempts,last_error,received_at,next_attempt_at,locked_at,worker_id").order("received_at", { ascending: false }).limit(25),
    admin.from("agba_telegram_delivery_outbox").select("id,organization_id,status,attempts,max_attempts,last_error,created_at,next_attempt_at,locked_at,worker_id").order("created_at", { ascending: false }).limit(25),
    admin.from("agba_audit_logs").select("id,organization_id,actor_auth_user_id,action,entity_type,entity_id,metadata,created_at").order("created_at", { ascending: false }).limit(30),
  ]);
  for (const q of [components, incidents, recoveries, inbox, delivery, audit]) if (q.error) return { error: q.error.message };
  const failedInbox = (inbox.data ?? []).filter((x: any) => ["failed", "dead"].includes(x.status));
  const failedDelivery = (delivery.data ?? []).filter((x: any) => ["failed", "dead"].includes(x.status));
  return { components: components.data ?? [], incidents: incidents.data ?? [], recovery_actions: recoveries.data ?? [], telegram: { inbox: inbox.data ?? [], delivery: delivery.data ?? [], failed_inbox: failedInbox.length, failed_delivery: failedDelivery.length }, audit: audit.data ?? [] };
}

async function recover(admin: any, user: any, key: string, input: any) {
  const { data: action, error: actionError } = await admin.from("agba_recovery_actions").select("id,key,name,risk_level,requires_confirmation,enabled").eq("key", key).eq("enabled", true).maybeSingle();
  if (actionError) throw actionError;
  if (!action) throw new Error("recovery_action_not_found");
  if (action.requires_confirmation && input?.confirmed !== true) throw new Error("confirmation_required");

  let output: any = {};
  let status = "completed";
  try {
    if (key === "retry_telegram_inbox") {
      const id = String(input?.id || "");
      if (!id) throw new Error("inbox_id_required");
      const { data: row, error } = await admin.from("agba_telegram_update_inbox").update({ status: "queued", locked_at: null, worker_id: null, next_attempt_at: new Date().toISOString(), last_error: null }).eq("id", id).select("id,status,attempts,next_attempt_at").maybeSingle();
      if (error) throw error;
      if (!row) throw new Error("inbox_item_not_found");
      output = row;
    } else if (key === "retry_telegram_delivery") {
      const id = String(input?.id || "");
      if (!id) throw new Error("delivery_id_required");
      const { data: row, error } = await admin.from("agba_telegram_delivery_outbox").update({ status: "pending", locked_at: null, worker_id: null, next_attempt_at: new Date().toISOString(), last_error: null }).eq("id", id).select("id,status,attempts,next_attempt_at").maybeSingle();
      if (error) throw error;
      if (!row) throw new Error("delivery_item_not_found");
      output = row;
    } else if (key === "run_component_health_check") {
      const componentKey = String(input?.component_key || "");
      if (!componentKey) throw new Error("component_key_required");
      const { data: component, error } = await admin.from("agba_system_components").select("id,key,name,status,last_heartbeat_at,last_success_at,last_failure_at,failure_count,metadata").eq("key", componentKey).maybeSingle();
      if (error) throw error;
      if (!component) throw new Error("component_not_found");
      output = { component, checked_at: new Date().toISOString(), note: "Registry health check completed; live provider probing is component-specific." };
    } else if (key === "replay_webhook") {
      throw new Error("webhook_replay_requires_explicit_event_id_and_is_not_enabled_yet");
    } else {
      throw new Error("unsupported_recovery_action");
    }
  } catch (e) {
    status = "failed";
    throw e;
  } finally {
    await admin.from("agba_audit_logs").insert({ organization_id: null, actor_auth_user_id: user.id, action: `superadmin.recovery.${status}`, entity_type: "recovery_action", entity_id: action.id, metadata: { key, input: { ...input, confirmed: undefined }, output } });
  }

  const { data: execution, error: execError } = await admin.from("agba_recovery_executions").insert({ recovery_action_id: action.id, actor_auth_user_id: user.id, status, input: input ?? {}, output }).select("id,recovery_action_id,status,input,output,started_at,completed_at").maybeSingle();
  if (execError) throw execError;
  return execution;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "server_configuration_error" }, 500);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const a = await actor(req, admin);
  if (a.error) return a.error;
  try {
    if (req.method === "GET") return json(await overview(admin));
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const body = await req.json();
    if (body?.operation === "overview") return json(await overview(admin));
    if (body?.operation === "recover") return json({ execution: await recover(admin, a.user, String(body.key || ""), body.input || {}) });
    return json({ error: "unsupported_operation" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "superadmin_operation_failed" }, 400);
  }
});
