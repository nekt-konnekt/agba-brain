import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "server_configuration_error" }, 500);
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json({ error: "authorization_required" }, 401);
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const token = auth.slice("Bearer ".length);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "invalid_authorization" }, 401);
  const { data: actor, error: actorError } = await admin.from("agba_users").select("id,organization_id,department_id,full_name,email,active,agba_roles(code,name)").eq("auth_user_id", authData.user.id).eq("active", true).maybeSingle();
  if (actorError || !actor) return json({ error: "actor_not_registered" }, 403);
  const actorRole = Array.isArray(actor.agba_roles) ? actor.agba_roles[0]?.code : actor.agba_roles?.code;
  if (actorRole !== "ceo") return json({ error: "ceo_role_required" }, 403);
  const orgId = actor.organization_id;
  const [orgQ, deptQ, usersQ, bindingsQ, invitesQ, actionQ, reportQ] = await Promise.all([
    admin.from("agba_organizations").select("id,name,timezone,currency_code").eq("id", orgId).single(),
    admin.from("agba_departments").select("id,name,active").eq("organization_id", orgId).order("name"),
    admin.from("agba_users").select("id,full_name,email,active,department_id,created_at,updated_at,agba_roles(code,name)").eq("organization_id", orgId).order("created_at"),
    admin.from("agba_telegram_bindings").select("agba_user_id,chat_id,telegram_username,role_code,created_at,updated_at").eq("organization_id", orgId),
    admin.from("agba_telegram_invitations").select("id,target_agba_user_id,target_department_id,role_code,expires_at,used_at,created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(100),
    admin.from("agba_actions").select("id,owner_name,status,priority,deadline").eq("organization_id", orgId).in("status", ["open", "in_progress"]).limit(200),
    admin.from("agba_reports").select("submitted_by,report_date,created_at").eq("organization_id", orgId).eq("confirmation_status", "confirmed").order("created_at", { ascending: false }).limit(200),
  ]);
  for (const q of [orgQ, deptQ, usersQ, bindingsQ, invitesQ, actionQ, reportQ]) if (q.error) return json({ error: "team_read_failed", detail: q.error.message }, 400);
  const users = usersQ.data ?? [], bindings = bindingsQ.data ?? [], invitations = invitesQ.data ?? [], actions = actionQ.data ?? [], reports = reportQ.data ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const people = users.map((u: any) => {
    const role = Array.isArray(u.agba_roles) ? u.agba_roles[0] : u.agba_roles;
    const binding = bindings.find((b: any) => b.agba_user_id === u.id);
    const latestInvite = invitations.find((i: any) => i.target_agba_user_id === u.id && !i.used_at && new Date(i.expires_at).getTime() > Date.now());
    const report = reports.find((r: any) => r.submitted_by === u.id);
    const openActions = actions.filter((a: any) => a.owner_name && String(a.owner_name).trim().toLowerCase() === String(u.full_name).trim().toLowerCase()).length;
    return {id:u.id,full_name:u.full_name,email:u.email,active:u.active,role_code:role?.code,role_name:role?.name,department_id:u.department_id,department_name:(deptQ.data??[]).find((d:any)=>d.id===u.department_id)?.name??null,connection:binding?"connected":latestInvite?"invited":"not_connected",telegram_username:binding?.telegram_username??null,invited_expires_at:latestInvite?.expires_at??null,last_report_at:report?.created_at??null,reported_today:report?.report_date===today,open_actions:openActions,created_at:u.created_at,updated_at:u.updated_at};
  });
  return json({ organization: orgQ.data, people, departments: deptQ.data ?? [], invitations, current_user_id: actor.id });
});