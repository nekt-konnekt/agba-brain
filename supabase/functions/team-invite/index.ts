import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function bytesToHex(bytes: Uint8Array) { return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(""); }
async function hashToken(token: string) { return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)))); }
function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const botUsername = Deno.env.get("TELEGRAM_BOT_USERNAME") || "agba_brain_bot";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "server_configuration_error" }, 500);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "authorization_required" }, 401);
  const token = authHeader.slice("Bearer ".length);
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  try {
    const { data: authData, error: authError } = await callerClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "invalid_authorization" }, 401);
    const { data: caller, error: callerError } = await admin
      .from("agba_users")
      .select("id, organization_id, active, agba_roles(code)")
      .eq("auth_user_id", authData.user.id)
      .eq("active", true)
      .maybeSingle();
    if (callerError || !caller) return json({ error: "actor_not_registered" }, 403);
    const callerRole = Array.isArray(caller.agba_roles) ? caller.agba_roles[0]?.code : caller.agba_roles?.code;
    if (callerRole !== "ceo") return json({ error: "ceo_role_required" }, 403);

    const body = await req.json().catch(() => ({}));
    const fullName = String(body?.full_name || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const departmentId = String(body?.department_id || "").trim();
    const roleCode = String(body?.role_code || "department_head").trim().toLowerCase();
    if (!['department_head', 'employee'].includes(roleCode)) return json({ error: "invalid_role" }, 400);
    if (!fullName || fullName.length < 2) return json({ error: "full_name_required" }, 400);
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: "valid_email_required" }, 400);
    if (!departmentId) return json({ error: "department_required" }, 400);

    const { data: department, error: departmentError } = await admin
      .from("agba_departments")
      .select("id, organization_id, name, active")
      .eq("id", departmentId)
      .eq("organization_id", caller.organization_id)
      .eq("active", true)
      .maybeSingle();
    if (departmentError) throw departmentError;
    if (!department) return json({ error: "department_not_found" }, 400);

    let staff: any = null;
    let emailSent = false;
    const { data: existing } = await admin
      .from("agba_users")
      .select("id, organization_id, auth_user_id, full_name, email, active, department_id, agba_roles(code)")
      .ilike("email", email)
      .maybeSingle();
    if (existing) {
      if (existing.organization_id !== caller.organization_id) return json({ error: "email_belongs_to_another_company" }, 409);
      const existingRole = Array.isArray(existing.agba_roles) ? existing.agba_roles[0]?.code : existing.agba_roles?.code;
      if (existingRole === "ceo") return json({ error: "email_is_already_the_company_owner" }, 409);
      if (existingRole !== roleCode) return json({ error: "email_has_another_company_role" }, 409);
      const { data: updated, error: updateError } = await admin.from("agba_users").update({ full_name: fullName, department_id: departmentId, active: true, updated_at: new Date().toISOString() }).eq("id", existing.id).select("id, full_name, email, department_id").single();
      if (updateError) throw updateError;
      staff = updated;
    } else {
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName, agba_role: roleCode } });
      if (inviteError || !invited?.user) return json({ error: inviteError?.message || "could_not_send_email_invitation" }, 400);
      emailSent = true;
      const { data: roleRow, error: roleError } = await admin.from("agba_roles").select("id").eq("code", roleCode).single();
      if (roleError) { await admin.auth.admin.deleteUser(invited.user.id); throw roleError; }
      const { data: created, error: userError } = await admin.from("agba_users").insert({ organization_id: caller.organization_id, auth_user_id: invited.user.id, role_id: roleRow.id, department_id: departmentId, full_name: fullName, email, active: true }).select("id, full_name, email, department_id").single();
      if (userError) { await admin.auth.admin.deleteUser(invited.user.id); throw userError; }
      staff = created;
    }

    const rawToken = randomToken();
    const tokenHash = await hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: telegramInviteError } = await admin.from("agba_telegram_invitations").insert({
      organization_id: caller.organization_id,
      role_code: roleCode,
      target_agba_user_id: staff.id,
      target_department_id: departmentId,
      token_hash: tokenHash,
      created_by: caller.id,
      expires_at: expiresAt,
    });
    if (telegramInviteError) throw telegramInviteError;

    await admin.from("agba_audit_logs").insert({
      organization_id: caller.organization_id,
      actor_auth_user_id: authData.user.id,
      actor_agba_user_id: caller.id,
      action: "team.invite_created",
      entity_type: "agba_user",
      entity_id: staff.id,
      metadata: { role_code: roleCode, department_id: departmentId, email, email_sent: emailSent, telegram_invite_expires_at: expiresAt },
    });

    return json({
      staff,
      role_code: roleCode,
      department: { id: department.id, name: department.name },
      email_sent: emailSent,
      telegram: { deep_link: `https://t.me/${botUsername}?start=${rawToken}`, expires_at: expiresAt },
    }, 201);
  } catch (error) {
    console.error("team-invite failed", error);
    return json({ error: error instanceof Error ? error.message : "Could not invite staff member" }, 400);
  }
});