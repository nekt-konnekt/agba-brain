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

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return json({ error: "server_configuration_error" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return json({ error: "invalid_authorization" }, 401);

  let body: { organization_id: string; department_id?: string | null; briefing_date?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!body.organization_id) return json({ error: "organization_id_required" }, 400);

  const { data: actor } = await admin
    .from("agba_users")
    .select("id, organization_id, department_id, active, agba_roles(code)")
    .eq("auth_user_id", user.id)
    .eq("organization_id", body.organization_id)
    .eq("active", true)
    .maybeSingle();

  if (!actor) return json({ error: "actor_not_registered_for_organization" }, 403);

  const role = (actor.agba_roles as { code?: string } | null)?.code;
  if (role !== "ceo" && role !== "department_head") return json({ error: "insufficient_role" }, 403);

  const requestedDepartment = body.department_id ?? null;
  if (role === "department_head" && requestedDepartment !== actor.department_id) {
    return json({ error: "department_scope_violation" }, 403);
  }

  const audience = role === "ceo" && !requestedDepartment ? "ceo" : "department_head";
  const departmentId = audience === "ceo" ? null : requestedDepartment;
  const briefingDate = body.briefing_date ?? new Date().toISOString().slice(0, 10);

  const { data: briefing, error: briefingError } = await admin
    .from("agba_briefings")
    .upsert({
      organization_id: body.organization_id,
      department_id: departmentId,
      audience,
      briefing_date: briefingDate,
      title: audience === "ceo" ? "Daily Company Briefing" : "Daily Department Briefing",
      status: "draft",
    }, { onConflict: "organization_id,department_id,audience,briefing_date" })
    .select("*")
    .single();

  if (briefingError || !briefing) return json({ error: "briefing_create_failed", detail: briefingError?.message }, 400);

  // V1 intentionally does not invent a narrative here. This endpoint creates
  // the auditable briefing container. A later reasoning/generation worker fills
  // items only from validated evidence.
  return json({
    briefing,
    message: "Briefing container created. Narrative generation requires validated evidence.",
  }, 201);
});
