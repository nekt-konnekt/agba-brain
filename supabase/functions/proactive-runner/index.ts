import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json" },
});

function authOk(req: Request): boolean {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supplied = req.headers.get("x-agba-worker-secret");
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(
    serviceRoleKey &&
    ((supplied && supplied === serviceRoleKey) || (bearer && bearer === serviceRoleKey))
  );
}

function fingerprint(parts: string[]): string {
  return parts.map((v) => v.trim().toLowerCase()).join("|");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!authOk(req)) return json({ error: "unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return json({ error: "server_configuration_error" }, 500);

  const admin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: { organization_id?: string; watcher_key?: string; limit?: number } = {};
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const orgId = body.organization_id;
  if (!orgId) return json({ error: "organization_id_required" }, 400);
  const limit = Math.min(Math.max(body.limit ?? 25, 1), 100);

  const { data: watchers, error: watcherError } = await admin
    .from("agba_proactive_watchers")
    .select("*")
    .eq("organization_id", orgId)
    .eq("enabled", true)
    .or("next_run_at.is.null,next_run_at.lte." + new Date().toISOString())
    .order("next_run_at", { ascending: true, nullsFirst: true });

  if (watcherError) return json({ error: "watcher_load_failed", detail: watcherError.message }, 500);

  const selected = (watchers ?? []).filter((w) => !body.watcher_key || w.key === body.watcher_key);
  const created: unknown[] = [];
  const skipped: unknown[] = [];
  const errors: unknown[] = [];

  for (const watcher of selected) {
    try {
      let candidates: Array<Record<string, unknown>> = [];

      if (watcher.key === "overdue_actions") {
        const { data, error } = await admin
          .from("agba_actions")
          .select("id,description,owner_name,deadline,priority,status")
          .eq("organization_id", orgId)
          .not("deadline", "is", null)
          .lt("deadline", new Date().toISOString())
          .in("status", ["pending", "assigned", "in_progress"])
          .order("deadline", { ascending: true })
          .limit(limit);
        if (error) throw error;
        candidates = (data ?? []).map((a) => ({
          fingerprint: fingerprint([watcher.key, String(a.id), String(a.deadline)]),
          kind: "task",
          title: `Overdue action: ${a.description}`,
          summary: `${a.owner_name ? `Owner: ${a.owner_name}. ` : ""}Deadline was ${a.deadline}.`,
          recommendation: "Review the action, reassign it, update the deadline, or complete it.",
          priority: a.priority === "high" ? 1 : a.priority === "medium" ? 2 : 3,
          action_id: a.id,
          metadata: { source: "agba_actions", status: a.status, deadline: a.deadline },
        }));
      } else if (watcher.key === "unresolved_risks") {
        const { data, error } = await admin
          .from("agba_state_items")
          .select("id,state_key,kind,title,summary,status,severity,recommended_action,last_seen_at,source_reasoning_item_id,source_report_id")
          .eq("organization_id", orgId)
          .eq("status", "active")
          .in("kind", ["risk", "issue"])
          .in("severity", ["high", "critical"])
          .order("last_seen_at", { ascending: true })
          .limit(limit);
        if (error) throw error;
        candidates = (data ?? []).map((s) => ({
          fingerprint: fingerprint([watcher.key, String(s.id), String(s.last_seen_at)]),
          kind: s.kind,
          title: s.title,
          summary: s.summary,
          recommendation: s.recommended_action ?? "Review this unresolved risk and decide the next governed move.",
          priority: s.severity === "critical" ? 1 : 2,
          reasoning_item_id: s.source_reasoning_item_id,
          metadata: { source: "agba_state_items", state_key: s.state_key, severity: s.severity, source_report_id: s.source_report_id },
        }));
      }

      for (const candidate of candidates) {
        const { data: proposal, error } = await admin
          .from("agba_proposals")
          .upsert({
            organization_id: orgId,
            watcher_id: watcher.id,
            fingerprint: candidate.fingerprint,
            kind: candidate.kind,
            title: candidate.title,
            summary: candidate.summary,
            recommendation: candidate.recommendation,
            priority: candidate.priority,
            action_id: candidate.action_id ?? null,
            reasoning_item_id: candidate.reasoning_item_id ?? null,
            metadata: candidate.metadata ?? {},
            status: "proposed",
          }, { onConflict: "organization_id,fingerprint", ignoreDuplicates: true })
          .select("*")
          .maybeSingle();

        if (error) throw error;
        if (proposal) created.push(proposal);
        else skipped.push({ watcher: watcher.key, fingerprint: candidate.fingerprint, reason: "deduplicated" });
      }

      await admin.from("agba_proactive_watchers").update({
        last_run_at: new Date().toISOString(),
        next_run_at: new Date(Date.now() + watcher.interval_seconds * 1000).toISOString(),
        last_error: null,
        consecutive_failures: 0,
      }).eq("id", watcher.id);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      errors.push({ watcher: watcher.key, detail });
      await admin.from("agba_proactive_watchers").update({
        last_run_at: new Date().toISOString(),
        next_run_at: new Date(Date.now() + watcher.interval_seconds * 1000).toISOString(),
        last_error: detail,
        consecutive_failures: (watcher.consecutive_failures ?? 0) + 1,
      }).eq("id", watcher.id);
    }
  }

  return json({
    ok: errors.length === 0,
    organization_id: orgId,
    watchers_checked: selected.length,
    proposals_created: created.length,
    proposals_deduplicated: skipped.length,
    errors,
    proposals: created,
  });
});
