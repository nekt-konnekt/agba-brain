import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!supabaseUrl || !serviceRoleKey || !geminiKey) return json({ error: "server_configuration_error" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "missing_authorization" }, 401);
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) return json({ error: "invalid_authorization" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  if (!body.organization_id) return json({ error: "organization_id is required" }, 400);
  if (!Array.isArray(body.evidence) || body.evidence.length === 0) return json({ error: "at_least_one_evidence_link_is_required" }, 400);

  const { data: actor, error: actorError } = await admin.from("agba_users")
    .select("id, organization_id, department_id, active, role_id, agba_roles(code)")
    .eq("auth_user_id", user.id).eq("organization_id", body.organization_id).eq("active", true).maybeSingle();
  if (actorError || !actor) return json({ error: "actor_not_registered_for_organization" }, 403);
  const role = (actor.agba_roles as { code?: string } | null)?.code;
  if (role !== "ceo" && role !== "department_head") return json({ error: "insufficient_role" }, 403);
  if (role === "department_head" && (!actor.department_id || body.department_id !== actor.department_id)) return json({ error: "department_scope_violation" }, 403);

  const reportIds = body.evidence.map((e: any) => e.report_id).filter(Boolean);
  let reportContext = "";
  if (reportIds.length) {
    const { data: reports, error: reportsError } = await admin.from("agba_reports")
      .select("id, raw_text, department_id, created_at").in("id", reportIds).eq("organization_id", body.organization_id);
    if (reportsError) return json({ error: "evidence_lookup_failed", detail: reportsError.message }, 400);
    if (!reports || reports.length !== reportIds.length) return json({ error: "evidence_not_found" }, 400);
    reportContext = reports.map((r: any) => `REPORT ${r.id}\n${r.raw_text}`).join("\n\n");
  }

  const question = body.question ?? "Identify the most important operational issue, explain confidence and severity, and recommend an action.";
  const prompt = `You are Agba, a company's operating brain. Reason only from the supplied evidence. Do not invent facts.\n\nTask: ${question}\n\nEvidence:\n${reportContext}\n\nReturn ONLY valid JSON with exactly these fields: {"type":"observation|issue|recommendation|decision","title":"short title","summary":"concise evidence-grounded summary","confidence":"high|medium|low","confidence_reason":"why the evidence supports this confidence","severity":"low|medium|high|critical|null","severity_reason":"why this severity is justified","recommended_action":"specific practical action or null"}.`;

  const geminiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } }),
  });
  const geminiText = await geminiResponse.text();
  if (!geminiResponse.ok) return json({ error: "gemini_request_failed", status: geminiResponse.status, detail: geminiText }, 502);

  let reasoning: any;
  try { reasoning = JSON.parse(JSON.parse(geminiText).candidates?.[0]?.content?.parts?.[0]?.text ?? ""); }
  catch { return json({ error: "gemini_invalid_json", detail: geminiText }, 502); }
  if (!reasoning?.type || !reasoning?.title || !reasoning?.summary || !reasoning?.confidence_reason || !reasoning?.severity_reason) return json({ error: "gemini_invalid_reasoning", detail: reasoning }, 502);

  const { data: item, error: itemError } = await admin.from("agba_reasoning_items").insert({ organization_id: body.organization_id, department_id: body.department_id ?? null, type: reasoning.type, title: reasoning.title.trim(), summary: reasoning.summary.trim(), confidence: reasoning.confidence ?? "medium", severity: reasoning.severity ?? null, recommended_action: reasoning.recommended_action ?? null, created_by: actor.id }).select("*").single();
  if (itemError || !item) return json({ error: "reasoning_item_create_failed", detail: itemError?.message }, 400);

  const evidenceRows = body.evidence.map((e: any) => ({ reasoning_item_id: item.id, report_id: e.report_id ?? null, report_entry_id: e.report_entry_id ?? null, observation_id: e.observation_id ?? null, issue_id: e.issue_id ?? null, decision_id: e.decision_id ?? null, evidence_note: e.evidence_note ?? null }));
  const { data: evidence, error: evidenceError } = await admin.from("agba_reasoning_evidence").insert(evidenceRows).select("*");
  if (evidenceError) { await admin.from("agba_reasoning_items").delete().eq("id", item.id); return json({ error: "evidence_create_failed", detail: evidenceError.message }, 400); }

  await admin.from("agba_audit_logs").insert({ action: "reasoning.generated", entity_id: item.id, organization_id: body.organization_id, actor_agba_user_id: actor.id });
  return json({ item, evidence, reasoning: { ...reasoning, provider: "gemini" } }, 201);
});
