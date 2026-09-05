import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

  const { data: actor, error: actorError } = await admin
    .from("agba_users")
    .select("id, organization_id, active, full_name, email, agba_roles(code)")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .maybeSingle();
  if (actorError || !actor) return json({ error: "actor_not_registered" }, 403);
  const role = Array.isArray(actor.agba_roles) ? actor.agba_roles[0]?.code : actor.agba_roles?.code;
  if (role !== "ceo") return json({ error: "ceo_role_required" }, 403);

  const [usersQ, departmentsQ, bindingsQ] = await Promise.all([
    admin.from("agba_users")
      .select("id, full_name, email, active, department_id, created_at, updated_at, agba_roles(code, name), agba_departments(name)")
      .eq("organization_id", actor.organization_id)
      .order("created_at"),
    admin.from("agba_departments")
      .select("id, name, slug, active")
      .eq("organization_id", actor.organization_id)
      .eq("active", true)
      .order("name"),
    admin.from("agba_telegram_bindings")
      .select("chat_id, agba_user_id, telegram_username, role_code, created_at, updated_at")
      .eq("organization_id", actor.organization_id)
      .order("updated_at", { ascending: false }),
  ]);
  if (usersQ.error || departmentsQ.error || bindingsQ.error) {
    return json({ error: "team_read_failed", detail: usersQ.error?.message || departmentsQ.error?.message || bindingsQ.error?.message }, 400);
  }

  const bindings = bindingsQ.data ?? [];
  return json({
    users: (usersQ.data ?? []).map((u: any) => {
      const binding = bindings.find((b: any) => b.agba_user_id === u.id);
      const role = Array.isArray(u.agba_roles) ? u.agba_roles[0] : u.agba_roles;
      const department = Array.isArray(u.agba_departments) ? u.agba_departments[0] : u.agba_departments;
      return {
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        active: u.active,
        role_code: role?.code || null,
        role_name: role?.name || null,
        department_id: u.department_id,
        department_name: department?.name || null,
        telegram_connected: !!binding,
        telegram_username: binding?.telegram_username || null,
        telegram_updated_at: binding?.updated_at || null,
        created_at: u.created_at,
      };
    }),
    departments: departmentsQ.data ?? [],
  });
});
