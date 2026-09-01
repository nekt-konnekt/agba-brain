import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const H = { "Content-Type": "application/json" };
const json = (x: unknown, s = 200) => new Response(JSON.stringify(x), { status: s, headers: H });
const env = (k: string) => Deno.env.get(k) || "";
const sbUrl = () => env("SUPABASE_URL");
const sbKey = () => env("SUPABASE_SERVICE_ROLE_KEY");
const bot = () => env("TELEGRAM_BOT_TOKEN");

async function secret(sb: any) { const { data, error } = await sb.rpc("agba_telegram_worker_secret"); if (error) throw error; return String(data || ""); }
async function tg(method: string, body: any) { const r = await fetch(`https://api.telegram.org/bot${bot()}/${method}`, { method: "POST", headers: H, body: JSON.stringify(body) }); return r.json(); }
async function typing(update: any) { try { const chat = Number(update?.message?.chat?.id); if (Number.isFinite(chat)) await tg("sendChatAction", { chat_id: chat, action: "typing" }); } catch {} }
async function enqueue(sb: any, chat: number, text: string, inboxId: string, org: string) { for (const chunk of text.match(/[\s\S]{1,3800}/g) || [text]) { const { error } = await sb.from("agba_telegram_delivery_outbox").insert({ organization_id: org || null, inbox_id: inboxId, chat_id: String(chat), payload: { chat_id: chat, text: chunk }, status: "pending", attempts: 0, max_attempts: 5, next_attempt_at: new Date().toISOString() }); if (error && error.code !== "23505") throw error; } }
async function deliveries(sb: any, workerId: string) { const { data, error } = await sb.rpc("agba_claim_telegram_delivery", { p_worker_id: workerId, p_lease_seconds: 120 }); if (error) throw error; let sent = 0, failed = 0; for (const i of data || []) { try { const p = i.payload || {}, r = await tg("sendMessage", { chat_id: Number(i.chat_id), text: String(p.text || ""), parse_mode: "Markdown" }); const rr = r?.ok ? r : await tg("sendMessage", { chat_id: Number(i.chat_id), text: String(p.text || "") }); if (!rr?.ok) throw Error(`telegram_send_failed:${rr?.description || "unknown"}`); const { error: e } = await sb.rpc("agba_complete_telegram_delivery", { p_id: i.id, p_telegram_message_id: rr?.result?.message_id ? Number(rr.result.message_id) : null }); if (e) throw e; sent++; } catch (e) { failed++; await sb.rpc("agba_fail_telegram_delivery", { p_id: i.id, p_error: (e instanceof Error ? e.message : String(e)).slice(0, 2000), p_retry_delay_seconds: 15 }); } } return { sent, failed }; }

function norm(s: string) { return s.toLowerCase().replace(/[^a-z0-9\s₦]/g, " ").replace(/\s+/g, " ").trim(); }
function sim(a: string, b: string) { const A = new Set(norm(a).split(" ").filter(x => x.length > 2)), B = new Set(norm(b).split(" ").filter(x => x.length > 2)); if (!A.size || !B.size) return 0; let n = 0; for (const x of A) if (B.has(x)) n++; return n / (A.size + B.size - n); }
function deadline(v: string | null) { if (!v) return null; const x = v.trim().toLowerCase(), d = new Date(); if (x === "today") return d.toISOString(); if (x === "tomorrow") { d.setDate(d.getDate() + 1); return d.toISOString(); } if (x === "next week") { d.setDate(d.getDate() + 7); return d.toISOString(); } const p = new Date(v); return Number.isNaN(p.getTime()) ? null : p.toISOString(); }

function parseCreate(text: string) {
  const prefix = /^(please\s+)?(?:create|add|make|set up|set)\s+(?:a|an)\s+(?:management\s+)?(?:action|task|request)\b/i;
  if (!prefix.test(text.trim())) return null;
  let body = text.trim().replace(prefix, "").trim();
  if (!body) return null;
  let due: string | null = null, owner: string | null = null;
  let m = body.match(/\s*(?:,\s*)?due\s+(today|tomorrow|next week|\d{4}-\d{2}-\d{2})\s*[.!]?$/i);
  if (m) { due = m[1]; body = body.slice(0, m.index).trim().replace(/[.,;]+$/g, ""); }
  m = body.match(/\s+(?:and\s+)?assign(?:\s+it)?\s+to\s+([^,.;]+)\s*$/i);
  if (m) { owner = m[1].trim(); body = body.slice(0, m.index).trim().replace(/[.,;]+$/g, ""); }
  if (!due) { m = body.match(/\s+due\s+(today|tomorrow|next week|\d{4}-\d{2}-\d{2})\s*$/i); if (m) { due = m[1]; body = body.slice(0, m.index).trim().replace(/[.,;]+$/g, ""); } }
  if (!owner) { m = body.match(/\s+(?:and\s+)?assign(?:\s+it)?\s+to\s+([^,.;]+)\s*$/i); if (m) { owner = m[1].trim(); body = body.slice(0, m.index).trim().replace(/[.,;]+$/g, ""); } }
  return body ? { description: body, owner_name: owner, deadline: deadline(due) } : null;
}

async function openActions(sb: any, org: string) { const { data, error } = await sb.from("agba_actions").select("id,description,status,priority,owner_name,deadline").eq("organization_id", org).in("status", ["open", "in_progress"]).order("priority", { ascending: false }).order("created_at", { ascending: true }).limit(100); if (error) throw error; return data || []; }
async function findAction(sb: any, org: string, needle: string) { const rows = await openActions(sb, org), n = norm(needle); const exact = rows.find((a: any) => norm(a.description) === n); if (exact) return exact; const contains = rows.find((a: any) => norm(a.description).includes(n) || n.includes(norm(a.description))); if (contains) return contains; const ranked = rows.map((a: any) => ({ a, s: sim(needle, a.description) })).sort((x: any, y: any) => y.s - x.s); return ranked[0]?.s >= .20 ? ranked[0].a : null; }

async function createAction(sb: any, org: string, user: string, chat: number, inbox: string, p: any) {
  const rows = await openActions(sb, org);
  const dup = rows.find((a: any) => norm(a.description) === norm(p.description) || sim(a.description, p.description) >= .72);
  if (dup) { await enqueue(sb, chat, `Agba 🧠\n\nThat action already exists: **${dup.description}**${dup.owner_name ? ` · ${dup.owner_name}` : ""}${dup.deadline ? ` · due ${new Date(dup.deadline).toLocaleDateString("en-NG")}` : ""}.`, inbox, org); return true; }
  const { data, error } = await sb.from("agba_actions").insert({ organization_id: org, created_by: user, owner_name: p.owner_name, description: p.description, deadline: p.deadline, status: "open", priority: "medium", metadata: { channel: "telegram", chat_id: chat, created_from: "telegram-user-request" } }).select("id,description,status,priority,owner_name,deadline").single();
  if (error || !data) throw error || Error("action_insert_returned_no_row");
  let answer = `Agba 🧠\n\nAction created: **${data.description}**.`; if (data.owner_name) answer += ` Assigned to **${data.owner_name}**.`; if (data.deadline) answer += ` Due: **${new Date(data.deadline).toLocaleDateString("en-NG")}**.`; await enqueue(sb, chat, answer, inbox, org); return true;
}
function doneQuery(t: string) { return t.match(/^(?:mark|set)\s+(.+?)\s+(?:as\s+)?(?:done|complete|completed)$/i) || t.match(/^complete\s+(.+)$/i) || t.match(/^(.+?)\s+(?:is|was|has been)\s+(?:done|complete|completed)$/i); }
function isOpen(t: string) { return /^\/actions$/i.test(t) || /^(what are|show|list)\s+(my\s+)?(open\s+)?actions\??$/i.test(t); }

async function canonical(sb: any, update: any, inbox: string) {
  const m = update?.message; if (!m?.chat?.id || !m?.text) return false;
  const text = String(m.text).trim(), chat = Number(m.chat.id);
  const { data: b, error } = await sb.from("agba_telegram_bindings").select("organization_id,agba_user_id").eq("chat_id", chat).maybeSingle(); if (error) throw error; if (!b) return false;
  const org = String(b.organization_id), create = parseCreate(text);
  if (create) return createAction(sb, org, String(b.agba_user_id), chat, inbox, create);
  if (isOpen(text)) { const data = await openActions(sb, org); const answer = data.length ? `Agba 🧠\n\n**Open management actions**\n\n${data.map((a: any, i: number) => `${i + 1}. ${a.description} · ${a.status}${a.owner_name ? ` · ${a.owner_name}` : " · unassigned"}${a.deadline ? ` · due ${new Date(a.deadline).toLocaleDateString("en-NG")}` : ""}`).join("\n")}` : "Agba 🧠\n\nYou currently have no open management actions."; await enqueue(sb, chat, answer, inbox, org); return true; }
  const done = doneQuery(text); if (!done) return false;
  const rows = await openActions(sb, org);
  const needle = done[1];
  const ranked = rows.map((a: any) => ({ a, score: sim(needle, a.description) })).sort((x: any, y: any) => y.score - x.score);
  const best = ranked[0];
  const second = ranked[1];
  const exact = rows.find((a: any) => norm(a.description) === norm(needle));
  const contains = rows.find((a: any) => norm(a.description).includes(norm(needle)) || norm(needle).includes(norm(a.description)));
  const a = exact || contains || (best && best.score >= .20 && (!second || best.score - second.score >= .08) ? best.a : null);
  if (!a) { await enqueue(sb, chat, `Agba 🧠\n\nI couldn't find an open management action matching "${needle}".`, inbox, org); return true; }
  const { data: result, error: ce } = await sb.rpc("agba_complete_management_action", { p_organization_id: org, p_query: a.description }); if (ce) throw ce;
  const r = result?.[0]; if (!r?.success) { await enqueue(sb, chat, "Agba 🧠\n\nI could not complete that action because database verification did not succeed.", inbox, org); return true; }
  const { data: verify, error: ve } = await sb.from("agba_actions").select("id,status,description").eq("id", a.id).maybeSingle(); if (ve) throw ve;
  if (verify?.status !== "done") { await enqueue(sb, chat, "Agba 🧠\n\nI could not verify that the action was completed. I have not reported it as done.", inbox, org); return true; }
  await enqueue(sb, chat, `Agba 🧠\n\nDone. **${verify.description}** is now marked complete.`, inbox, org); return true;
}

async function dispatch(update: any, s: string) { const r = await fetch(`${sbUrl()}/functions/v1/telegram-gateway`, { method: "POST", headers: { ...H, "x-agba-worker-secret": s }, body: JSON.stringify(update) }); const body = await r.text(); let p: any; try { p = JSON.parse(body); } catch {} if (!r.ok || p?.ok === false) throw Error(`gateway_failed:${body.slice(0, 500)}`); return p; }

Deno.serve(async req => {
  if (req.method !== "POST") return json({ ok: true, service: "agba-telegram-worker" });
  if (!sbUrl() || !sbKey() || !bot()) return json({ error: "worker_not_configured" }, 500);
  const sb = createClient(sbUrl(), sbKey(), { auth: { autoRefreshToken: false, persistSession: false } }); let body: any = {}; try { body = await req.json(); } catch {}
  const expected = await secret(sb).catch(() => ""); if (!expected || body?.secret !== expected) return json({ error: "forbidden" }, 403);
  const workerId = `telegram-worker-${crypto.randomUUID()}`;
  try {
    const stale = new Date(Date.now() - 120000).toISOString(); await sb.from("agba_telegram_update_inbox").update({ status: "received", locked_at: null, last_error: "worker_lease_expired" }).eq("status", "processing").lt("locked_at", stale);
    let processed = 0;
    for (let n = 0; n < 5; n++) {
      const { data: c, error: e } = await sb.from("agba_telegram_update_inbox").select("id,telegram_update_id,payload,attempts").in("status", ["received", "failed"]).order("received_at", { ascending: true }).limit(1); if (e) throw e; const item = c?.[0]; if (!item) break;
      const { data: claimed, error: ce } = await sb.from("agba_telegram_update_inbox").update({ status: "processing", attempts: Number(item.attempts || 0) + 1, locked_at: new Date().toISOString(), worker_id: workerId, last_error: null }).eq("id", item.id).in("status", ["received", "failed"]).select("id,telegram_update_id,payload,attempts").maybeSingle(); if (ce) throw ce; if (!claimed) continue;
      try { await typing(claimed.payload); const handled = await canonical(sb, claimed.payload, claimed.id); if (!handled) { const response = await dispatch(claimed.payload, expected); const chat = Number(response?.chat_id || claimed.payload?.message?.chat?.id); const answer = String(response?.answer || ""); if (!chat || !answer) throw Error("gateway_missing_delivery_payload"); const { data: b, error: be } = await sb.from("agba_telegram_bindings").select("organization_id").eq("chat_id", chat).maybeSingle(); if (be) throw be; await enqueue(sb, chat, answer, claimed.id, String(b?.organization_id || "")); } await sb.from("agba_telegram_update_inbox").update({ status: "dispatched", dispatched_at: new Date().toISOString(), completed_at: new Date().toISOString(), locked_at: null, last_error: null }).eq("id", claimed.id); processed++; }
      catch (err) { const msg = err instanceof Error ? err.message : String(err), attempts = Number(claimed.attempts || 1), terminal = attempts >= 5; await sb.from("agba_telegram_update_inbox").update({ status: terminal ? "dead" : "failed", locked_at: null, last_error: msg.slice(0, 2000) }).eq("id", claimed.id); if (!terminal) break; }
    }
    const delivery = await deliveries(sb, workerId); return json({ ok: true, processed, delivery });
  } catch (err) { console.error("worker_failed", err); return json({ ok: false, error: "worker_failed" }, 500); }
});
