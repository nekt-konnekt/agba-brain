import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json" };
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers });
const supabaseUrl = () => Deno.env.get("SUPABASE_URL") || "";
const serviceKey = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MAX_ATTEMPTS = 5;

async function workerSecret(sb: any) {
  const { data, error } = await sb.rpc("agba_telegram_worker_secret");
  if (error) throw error;
  return String(data || "");
}

async function dispatch(update: any, secret: string) {
  const response = await fetch(`${supabaseUrl()}/functions/v1/telegram-gateway`, {
    method: "POST",
    headers: { ...headers, ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}) },
    body: JSON.stringify(update),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`gateway_http_${response.status}:${body.slice(0, 500)}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true, service: "agba-telegram-worker" });
  if (!supabaseUrl() || !serviceKey()) return json({ error: "worker_not_configured" }, 500);

  const sb = createClient(supabaseUrl(), serviceKey(), { auth: { autoRefreshToken: false, persistSession: false } });
  let body: any = {};
  try { body = await req.json(); } catch {}

  const expected = await workerSecret(sb).catch((error) => {
    console.error("telegram_worker_secret_lookup_failed", error);
    return "";
  });
  if (!expected || body?.secret !== expected) return json({ error: "forbidden" }, 403);

  await sb.from("agba_telegram_update_inbox").update({ status: "received", last_error: "worker_lease_expired" })
    .eq("status", "processing")
    .lt("locked_at", new Date(Date.now() - 2 * 60_000).toISOString());

  const { data: candidates, error: selectError } = await sb.from("agba_telegram_update_inbox")
    .select("id,telegram_update_id,payload,attempts")
    .in("status", ["received", "failed"])
    .order("received_at", { ascending: true })
    .limit(1);
  if (selectError) { console.error("telegram_worker_select_failed", selectError); return json({ error: "queue_select_failed" }, 500); }

  const item = candidates?.[0];
  if (!item) return json({ ok: true, processed: 0 });

  const currentAttempts = Number(item.attempts || 0);
  if (currentAttempts >= MAX_ATTEMPTS) {
    await sb.from("agba_telegram_update_inbox").update({ status: "dead_letter", locked_at: null, last_error: `max_attempts_exceeded:${MAX_ATTEMPTS}` }).eq("id", item.id);
    return json({ ok: true, processed: 0, dead_lettered: true, update_id: item.telegram_update_id, attempts: currentAttempts });
  }

  const nextAttempt = currentAttempts + 1;
  const { data: claimed, error: claimError } = await sb.from("agba_telegram_update_inbox").update({
    status: "processing",
    attempts: nextAttempt,
    locked_at: new Date().toISOString(),
    last_error: null,
  }).eq("id", item.id).in("status", ["received", "failed"])
    .select("id,attempts,payload").maybeSingle();

  if (claimError) { console.error("telegram_worker_claim_failed", claimError); return json({ error: "queue_claim_failed" }, 500); }
  if (!claimed) return json({ ok: true, processed: 0, raced: true });

  try {
    await dispatch(claimed.payload, Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "");
    await sb.from("agba_telegram_update_inbox").update({ status: "dispatched", dispatched_at: new Date().toISOString(), locked_at: null, last_error: null }).eq("id", claimed.id);
    return json({ ok: true, processed: 1, update_id: item.telegram_update_id, attempts: claimed.attempts });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const finalFailure = nextAttempt >= MAX_ATTEMPTS;
    await sb.from("agba_telegram_update_inbox").update({
      status: finalFailure ? "dead_letter" : "failed",
      locked_at: null,
      last_error: finalFailure ? `max_attempts_exceeded:${MAX_ATTEMPTS};${message}`.slice(0, 2000) : message.slice(0, 2000),
    }).eq("id", claimed.id);
    console.error("telegram_worker_dispatch_failed", { updateId: item.telegram_update_id, attempts: nextAttempt, deadLettered: finalFailure, message });
    return json({ ok: false, processed: 0, update_id: item.telegram_update_id, attempts: nextAttempt, dead_lettered: finalFailure, error: message }, 500);
  }
});
