import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://iijhsdaqaqywzpavdonn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_wqJVbxGLbvWgrrXmhsLjKg_ks8Sy9aS";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const $ = (id) => document.getElementById(id);
const today = new Date().toISOString().slice(0, 10);
$("report-date").value = today;

let session = null;
let actor = null;
let organization = null;
let departments = [];

function show(id) {
  for (const view of ["auth-view", "setup-view", "app-view"]) $(view).classList.toggle("hidden", view !== id);
}

function message(id, text, type = "") {
  const el = $(id);
  el.textContent = text || "";
  el.className = `message ${type}`.trim();
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>\"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function callFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

async function loadActor() {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from("agba_users")
    .select("id, organization_id, department_id, full_name, email, active, agba_roles(code)")
    .eq("auth_user_id", auth.user.id)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadOrganization() {
  const { data, error } = await supabase
    .from("agba_organizations")
    .select("id,name,slug,timezone,currency_code,setup_completed_at")
    .eq("id", actor.organization_id)
    .single();
  if (error) throw error;
  organization = data;
}

async function loadDepartments() {
  const { data, error } = await supabase
    .from("agba_departments")
    .select("id,name,slug")
    .eq("organization_id", actor.organization_id)
    .order("name");
  if (error) throw error;
  departments = data ?? [];
  const select = $("report-department");
  select.innerHTML = "";
  if (isCEO()) {
    select.innerHTML = `<option value="">Company / CEO report</option>`;
  }
  for (const d of departments) {
    const option = document.createElement("option");
    option.value = d.id;
    option.textContent = d.name;
    if (!isCEO() && d.id === actor.department_id) option.selected = true;
    select.appendChild(option);
  }
}

function roleCode() {
  return Array.isArray(actor?.agba_roles) ? actor.agba_roles[0]?.code : actor?.agba_roles?.code;
}
function isCEO() { return roleCode() === "ceo"; }

async function loadBriefing() {
  const { data, error } = await supabase
    .from("agba_briefings")
    .select("id,title,summary,status,briefing_date,audience,department_id,created_at")
    .eq("organization_id", organization.id)
    .eq("briefing_date", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    $("briefing-title").textContent = isCEO() ? "Daily Company Briefing" : "Daily Department Briefing";
    $("briefing-status").textContent = "Not generated";
    $("briefing-summary").textContent = "Generate today's briefing when you are ready.";
    $("briefing-items").innerHTML = "";
    return;
  }
  $("briefing-title").textContent = data.title;
  $("briefing-status").textContent = data.status;
  $("briefing-summary").textContent = data.summary;
  const { data: items, error: itemError } = await supabase
    .from("agba_briefing_items")
    .select("type,priority,title,content")
    .eq("briefing_id", data.id)
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });
  if (itemError) throw itemError;
  $("briefing-items").innerHTML = (items ?? []).map((item) => `
    <div class="brief-item">
      <div class="brief-meta"><span class="pill">${escapeHtml(item.type)}</span><span>Priority ${escapeHtml(item.priority)}</span></div>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.content)}</p>
    </div>`).join("") || `<div class="empty-state">No briefing items.</div>`;
}

async function loadActions() {
  const { data, error } = await supabase
    .from("agba_actions")
    .select("id,description,status,priority,owner_name,deadline,created_at")
    .eq("organization_id", organization.id)
    .in("status", ["open", "in_progress", "blocked"])
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(20);
  if (error) throw error;
  $("actions").classList.remove("empty-state");
  $("actions").innerHTML = (data ?? []).map((a) => `
    <div class="action-item">
      <div><span class="pill">${escapeHtml(a.priority)}</span> <span class="muted">${escapeHtml(a.status)}</span></div>
      <strong>${escapeHtml(a.description)}</strong>
      <p class="muted">${escapeHtml(a.owner_name || "Unassigned")}${a.deadline ? ` · due ${new Date(a.deadline).toLocaleDateString("en-NG")}` : ""}</p>
    </div>`).join("") || `<div class="empty-state">No open management actions.</div>`;
}

async function loadReports() {
  const { data, error } = await supabase
    .from("agba_reports")
    .select("id,department_id,report_date,raw_text,source,status,created_at")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) throw error;
  const names = new Map(departments.map((d) => [d.id, d.name]));
  $("reports").classList.remove("empty-state");
  $("reports").innerHTML = (data ?? []).map((r) => `
    <article class="report-row">
      <div><strong>${escapeHtml(names.get(r.department_id) || "Company")}</strong><span class="muted"> · ${escapeHtml(r.report_date)} · ${escapeHtml(r.status)}</span></div>
      <p>${escapeHtml(r.raw_text)}</p>
    </article>`).join("") || `<div class="empty-state">No reports yet.</div>`;
}

async function refresh() {
  message("app-message", "Refreshing...");
  try {
    await Promise.all([loadBriefing(), loadActions(), loadReports()]);
    message("app-message", "Up to date.", "success");
  } catch (error) {
    console.error(error);
    message("app-message", error.message || "Could not refresh Agba.", "error");
  }
}

async function enterApp() {
  actor = await loadActor();
  if (!actor) {
    show("setup-view");
    $("ceo-name").value = (await supabase.auth.getUser()).data.user?.user_metadata?.full_name || "";
    return;
  }
  await loadOrganization();
  await loadDepartments();
  $("company-title").textContent = organization.name;
  $("actor-meta").textContent = `${actor.full_name} · ${roleCode() === "ceo" ? "CEO" : "Department Head"}`;
  $("ask-panel").classList.toggle("hidden", !isCEO());
  $("report-department").disabled = !isCEO();
  if (!isCEO()) $("report-department").value = actor.department_id;
  show("app-view");
  await refresh();
}

async function authSubmit(mode) {
  const email = $("auth-email").value.trim().toLowerCase();
  const password = $("auth-password").value;
  message("auth-message", "Working...");
  try {
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: email.split("@")[0] } } });
      if (error) throw error;
      if (!data.session) {
        message("auth-message", "Account created. Check your email if confirmation is enabled, then sign in.", "success");
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
    const { data } = await supabase.auth.getSession();
    session = data.session;
    await enterApp();
  } catch (error) {
    console.error(error);
    message("auth-message", error.message || "Authentication failed.", "error");
  }
}

function addDepartmentRow(values = {}) {
  const row = document.createElement("div");
  row.className = "department-row";
  row.innerHTML = `
    <input class="dep-name" placeholder="Department name" value="${escapeHtml(values.name || "")}" required />
    <input class="dep-head" placeholder="Head full name" value="${escapeHtml(values.full_name || "")}" required />
    <input class="dep-email" type="email" placeholder="Head email" value="${escapeHtml(values.email || "")}" required />
    <button type="button" class="danger-link">Remove</button>`;
  row.querySelector(".danger-link").addEventListener("click", () => row.remove());
  $("departments").appendChild(row);
}

async function setupCompany(event) {
  event.preventDefault();
  message("setup-message", "Creating company...");
  const rows = [...document.querySelectorAll(".department-row")];
  try {
    const departmentsPayload = rows.map((row) => ({
      name: row.querySelector(".dep-name").value.trim(),
      head: {
        full_name: row.querySelector(".dep-head").value.trim(),
        email: row.querySelector(".dep-email").value.trim().toLowerCase(),
      },
    }));
    await callFunction("company-setup", {
      company: {
        name: $("company-name").value.trim(),
        slug: $("company-slug").value.trim(),
        timezone: $("company-timezone").value.trim() || "Africa/Lagos",
        currency_code: $("company-currency").value.trim().toUpperCase() || "NGN",
      },
      ceo: { full_name: $("ceo-name").value.trim() },
      departments: departmentsPayload,
    });
    message("setup-message", "Company created. Loading Agba...", "success");
    await enterApp();
  } catch (error) {
    console.error(error);
    message("setup-message", error.message || "Company setup failed.", "error");
  }
}

async function submitReport(event) {
  event.preventDefault();
  message("report-message", "Submitting...");
  try {
    const departmentId = $("report-department").value || null;
    const data = await callFunction("report-ingestion", {
      report_text: $("report-text").value.trim(),
      report_date: $("report-date").value || today,
      source: "web",
      department_id: departmentId,
      idempotency_key: crypto.randomUUID(),
    });
    $("report-text").value = "";
    message("report-message", data.replayed ? "Report already received." : "Report received by Agba.", "success");
    await loadReports();
  } catch (error) {
    console.error(error);
    message("report-message", error.message || "Report submission failed.", "error");
  }
}

async function askAgba(event) {
  event.preventDefault();
  const answer = $("answer");
  answer.classList.remove("hidden");
  answer.innerHTML = `<div class="thinking">Agba is thinking...</div>`;
  try {
    const data = await callFunction("ceo-query", { organization_id: organization.id, question: $("question").value.trim() });
    answer.innerHTML = `
      <div class="brief-meta"><span class="pill">${escapeHtml(data.confidence || "medium")}</span></div>
      <h3>${escapeHtml(data.answer || "No answer")}</h3>
      <p>${escapeHtml(data.confidence_reason || "")}</p>
      ${(data.signals || []).map((s) => `<div class="signal"><strong>${escapeHtml(s.signal)}</strong><p>${escapeHtml(s.evidence)}</p></div>`).join("")}
      ${(data.actions || []).length ? `<div class="answer-actions"><strong>Recommended actions</strong>${data.actions.map((a) => `<p>• ${escapeHtml(a.description)}</p>`).join("")}</div>` : ""}`;
    await loadActions();
  } catch (error) {
    console.error(error);
    answer.innerHTML = `<p class="error-text">${escapeHtml(error.message || "Agba could not answer right now.")}</p>`;
  }
}

async function generateBriefing() {
  message("app-message", "Agba is generating the briefing...");
  try {
    await callFunction("daily-briefing-v2", { organization_id: organization.id, briefing_date: today, department_id: isCEO() ? null : actor.department_id });
    await loadBriefing();
    message("app-message", "Today's briefing is ready.", "success");
  } catch (error) {
    console.error(error);
    message("app-message", error.message || "Briefing generation failed.", "error");
  }
}

async function signOut() {
  await supabase.auth.signOut();
  location.reload();
}

$("auth-form").addEventListener("submit", (e) => { e.preventDefault(); authSubmit("login"); });
$("signup-btn").addEventListener("click", () => authSubmit("signup"));
$("setup-form").addEventListener("submit", setupCompany);
$("add-department").addEventListener("click", () => addDepartmentRow());
$("report-form").addEventListener("submit", submitReport);
$("ask-form").addEventListener("submit", askAgba);
$("refresh").addEventListener("click", refresh);
$("generate-briefing").addEventListener("click", generateBriefing);
$("signout").addEventListener("click", signOut);
$("setup-signout").addEventListener("click", signOut);

addDepartmentRow({ name: "Sales" });

supabase.auth.onAuthStateChange(async (_event, newSession) => {
  session = newSession;
  if (newSession) {
    try { await enterApp(); } catch (error) { console.error(error); message("auth-message", error.message || "Could not load Agba.", "error"); }
  } else {
    show("auth-view");
  }
});

const initial = await supabase.auth.getSession();
session = initial.data.session;
if (session) {
  try { await enterApp(); } catch (error) { console.error(error); message("auth-message", error.message || "Could not load Agba.", "error"); }
} else {
  show("auth-view");
}
