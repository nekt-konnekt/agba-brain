import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json" };
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers });

const supabaseUrl = () => Deno.env.get("SUPABASE_URL") || "";
const serviceKey = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true, service: "agba-telegram-receiver" });
  if (!supabaseUrl() || !serviceKey()) return json({ error: "receiver_not_configured" }, 500);

  const secret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";
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
    .select("id,status")
    .eq("telegram_update_id", updateId)
    .maybeSingle();

  if (lookupError) {
    console.error("telegram_receiver_lookup_failed", lookupError);
    return json({ error: "inbox_lookup_failed" }, 500);
  }

  if (existing) return json({ ok: true, duplicate: true, update_id: updateId });

  const { error: insertError } = await sb
    .from("agba_telegram_update_inbox")
    .insert({
      telegram_update_id: updateId,
      chat_id: chatId,
      message_id: messageId,
      payload: update,
      status: "received",
    });

  if (insertError) {
    if (insertError.code === "23505") return json({ ok: true, duplicate: true, update_id: updateId });
    console.error("telegram_receiver_insert_failed", insertError);
    return json({ error: "inbox_insert_failed" }, 500);
  }

  // Telegram gets a fast 200. AI, database reasoning, retries and Telegram replies
  // are handled by the durable worker instead of the webhook request lifecycle.
  return json({ ok: true, accepted: true, update_id: updateId });
});
