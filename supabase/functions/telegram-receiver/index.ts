import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json" };
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers });

const supabaseUrl = () => Deno.env.get("SUPABASE_URL") || "";
const serviceKey = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const gatewayUrl = () => `${supabaseUrl()}/functions/v1/telegram-gateway`;

async function dispatch(update: any, secret: string | null) {
  let lastError = "unknown";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const h: Record<string, string> = { ...headers };
      if (secret) h["x-telegram-bot-api-secret-token"] = secret;
      const response = await fetch(gatewayUrl(), {
        method: "POST",
        headers: h,
        body: JSON.stringify(update),
      });
      if (response.ok) return { ok: true, attempts: attempt };
      lastError = `gateway_http_${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
  }
  return { ok: false, attempts: 3, error: lastError };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true, service: "agba-telegram-receiver" });
  if (!supabaseUrl() || !serviceKey()) return json({ error: "receiver_not_configured" }, 500);

  const secret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || null;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return json({ error: "forbidden" }, 403);
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return json({ ok: true });
  }

  const updateId = Number(update?.update_id);
  if (!Number.isSafeInteger(updateId)) return json({ ok: true });

  const message = update?.message;
  const chatId = message?.chat?.id != null ? Number(message.chat.id) : null;
  const messageId = message?.message_id != null ? Number(message.message_id) : null;

  const sb = createClient(supabaseUrl(), serviceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: existing, error: lookupError } = await sb
    .from("agba_telegram_update_inbox")
    .select("id,status,attempts")
    .eq("telegram_update_id", updateId)
    .maybeSingle();

  if (lookupError) {
    console.error("telegram_receiver_lookup_failed", lookupError);
    return json({ error: "inbox_lookup_failed" }, 500);
  }

  if (existing?.status === "dispatched") {
    return json({ ok: true, duplicate: true });
  }

  let inboxId = existing?.id;
  if (!inboxId) {
    const { data: inserted, error: insertError } = await sb
      .from("agba_telegram_update_inbox")
      .insert({
        telegram_update_id: updateId,
        chat_id: chatId,
        message_id: messageId,
        payload: update,
        status: "received",
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const { data: race } = await sb
          .from("agba_telegram_update_inbox")
          .select("id,status")
          .eq("telegram_update_id", updateId)
          .maybeSingle();
        if (race?.status === "dispatched") return json({ ok: true, duplicate: true });
        inboxId = race?.id;
      } else {
        console.error("telegram_receiver_insert_failed", insertError);
        return json({ error: "inbox_insert_failed" }, 500);
      }
    } else {
      inboxId = inserted.id;
    }
  }

  const processUpdate = async () => {
    const result = await dispatch(update, secret);
    if (result.ok) {
      await sb.from("agba_telegram_update_inbox").update({
        status: "dispatched",
        attempts: result.attempts,
        dispatched_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", inboxId);
    } else {
      await sb.from("agba_telegram_update_inbox").update({
        status: "failed",
        attempts: result.attempts,
        last_error: result.error,
      }).eq("id", inboxId);
      console.error("telegram_receiver_dispatch_failed", { updateId, ...result });
    }
  };

  EdgeRuntime.waitUntil(processUpdate());

  return json({ ok: true, accepted: true, update_id: updateId });
});
