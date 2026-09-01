import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function bytesToHex(bytes: Uint8Array) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string) {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))));
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// Same hashing scheme telegram-gateway uses to validate /start <token>.
// Keep these in sync: the gateway hashes the raw token from the deep
// link and looks up token_hash, so any change here must be mirrored
// there or every invitation link will fail validation.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const botUsername = Deno.env.get("TELEGRAM_BOT_USERNAME") || "agba_brain_bot";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json(500, { error: "Supabase function environment is incomplete" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Authorization required" });
  const token = authHeader.slice("Bearer ".length);
  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const admin = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { data: authData, error: authError } = await callerClient.auth.getUser(token);
    if (authError || !authData.user) return json(401, { error: "Invalid authentication" });

    const { data: caller, error: callerError } = await admin
      .from("agba_users")
      .select("id, organization_id, active, agba_roles(code)")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    if (callerError) throw callerError;
    if (!caller || !caller.active) return json(403, { error: "No active Agba user for this account" });

    const role = Array.isArray(caller.agba_roles) ? caller.agba_roles[0]?.code : (caller.agba_roles as { code?: string } | null)?.code;
    if (role !== "ceo") return json(403, { error: "Only the CEO can generate a Telegram invitation from this endpoint" });

    const rawToken = randomToken();
    const tokenHash = await hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { error: insertError } = await admin.from("agba_telegram_invitations").insert({
      organization_id: caller.organization_id,
      role_code: "ceo",
      token_hash: tokenHash,
      created_by: caller.id,
      expires_at: expiresAt,
    });
    if (insertError) throw insertError;

    return json(201, {
      token: rawToken,
      expires_at: expiresAt,
      deep_link: `https://t.me/${botUsername}?start=${rawToken}`,
    });
  } catch (error) {
    console.error("telegram-invite failed", error);
    const message = error instanceof Error ? error.message : "Could not generate a Telegram invitation";
    return json(400, { error: message });
  }
});
