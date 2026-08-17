import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ReportInput = {
  report_text: string;
  report_date?: string;
  source?: string;
  department_id?: string | null;
  idempotency_key?: string;
  supersedes_report_id?: string | null;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server configuration incomplete" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Authorization required" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: { user }, error: userError } = await admin.auth.getUser();
  if (userError || !user) return json({ error: "Invalid authentication" }, 401);

  let input: ReportInput;
  try {
    input = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const reportText = input.report_text?.trim();
  if (!reportText) return json({ error: "report_text is required" }, 400);
  if (reportText.length > 20000) return json({ error: "report_text exceeds 20,000 characters" }, 400);

  const idempotencyKey = input.idempotency_key ?? req.headers.get("Idempotency-Key");

  const { data: actor, error: actorError } = await admin
    .from("agba_users")
    .select("id, organization_id, department_id, active, role_id, agba_roles(code)")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .single();

  if (actorError || !actor) return json({ error: "Agba user profile not found" }, 403);

  const roleCode = Array.isArray(actor.agba_roles) ? actor.agba_roles[0]?.code : actor.agba_roles?.code;
  const requestedDepartment = input.department_id ?? null;

  if (roleCode === "department_head" && requestedDepartment !== actor.department_id) {
    return json({ error: "Department Heads may only submit reports for their own department" }, 403);
  }

  if (idempotencyKey) {
    const { data: existing } = await admin
      .from("agba_reports")
      .select("id, organization_id, department_id, report_date, status, created_at")
      .eq("organization_id", actor.organization_id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existing) return json({ report: existing, replayed: true }, 200);
  }

  const { data: report, error: insertError } = await admin
    .from("agba_reports")
    .insert({
      organization_id: actor.organization_id,
      department_id: requestedDepartment,
      submitted_by: actor.id,
      report_date: input.report_date ?? new Date().toISOString().slice(0, 10),
      raw_text: reportText,
      source: input.source ?? "conversation",
      idempotency_key: idempotencyKey ?? null,
      supersedes_report_id: input.supersedes_report_id ?? null,
      status: "received",
    })
    .select("id, organization_id, department_id, submitted_by, report_date, raw_text, source, status, created_at")
    .single();

  if (insertError) {
    if (insertError.code === "23505" && idempotencyKey) {
      const { data: replay } = await admin
        .from("agba_reports")
        .select("id, organization_id, department_id, report_date, status, created_at")
        .eq("organization_id", actor.organization_id)
        .eq("idempotency_key", idempotencyKey)
        .single();
      return json({ report: replay, replayed: true }, 200);
    }
    return json({ error: insertError.message }, 400);
  }

  return json({
    report,
    replayed: false,
    next: "classification",
  }, 201);
});
