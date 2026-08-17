import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ReasoningRequest = {
  organization_id: string;
  department_id?: string | null;
  type: "observation" | "issue" | "recommendation" | "decision";
  title: string;
  summary: string;
  confidence?: "high" | "medium" | "low";
  severity?: "low" | "medium" | "high" | "critical" | null;
  recommended_action?: string | null;
  evidence: Array<{
    report_id?: string;
    report_entry_id?: string;
    observation_id?: string;
    issue_id?: string;
    decision_id?: string;
    evidence_note?: string;
  }>;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
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

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return json({ error: "invalid_authorization" }, 401);

  let body: ReasoningRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!body.organization_id || !body.type || !body.title || !body.summary) {
    return json({ error: "organization_id, type, title and summary are required" }, 400);
  }
  if (!Array.isArray(body.evidence) || body.evidence.length === 0) {
    return json({ error: "at_least_one_evidence_link_is_required" }, 400);
  }

  const { data: actor, error: actorError } = await admin
    .from("agba_users")
    .select("id, organization_id, department_id, active, role_id, agba_roles(code)")
    .eq("auth_user_id", user.id)
    .eq("organization_id", body.organization_id)
    .eq("active", true)
    .maybeSingle();

  if (actorError || !actor) return json({ error: "actor_not_registered_for_organization" }, 403);

  const role = (actor.agba_roles as { code?: string } | null)?.code;
  if (role !== "ceo" && role !== "department_head") return json({ error: "insufficient_role" }, 403);

  if (role === "department_head") {
    if (!actor.department_id || body.department_id !== actor.department_id) {
      return json({ error: "department_scope_violation" }, 403);
    }
  }

  const { data: item, error: itemError } = await admin
    .from("agba_reasoning_items")
    .insert({
      organization_id: body.organization_id,
      department_id: body.department_id ?? null,
      type: body.type,
      title: body.title.trim(),
      summary: body.summary.trim(),
      confidence: body.confidence ?? "medium",
      severity: body.severity ?? null,
      recommended_action: body.recommended_action ?? null,
      created_by: actor.id,
    })
    .select("*")
    .single();

  if (itemError || !item) return json({ error: "reasoning_item_create_failed", detail: itemError?.message }, 400);

  const evidenceRows = body.evidence.map((e) => ({
    reasoning_item_id: item.id,
    report_id: e.report_id ?? null,
    report_entry_id: e.report_entry_id ?? null,
    observation_id: e.observation_id ?? null,
    issue_id: e.issue_id ?? null,
    decision_id: e.decision_id ?? null,
    evidence_note: e.evidence_note ?? null,
  }));

  const { data: evidence, error: evidenceError } = await admin
    .from("agba_reasoning_evidence")
    .insert(evidenceRows)
    .select("*");

  if (evidenceError) {
    await admin.from("agba_reasoning_items").delete().eq("id", item.id);
    return json({ error: "evidence_create_failed", detail: evidenceError.message }, 400);
  }

  return json({ item, evidence }, 201);
});
