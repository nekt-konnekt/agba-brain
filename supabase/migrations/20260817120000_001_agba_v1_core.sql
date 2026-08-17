-- Agba V1 core schema
-- PostgreSQL / Supabase

create extension if not exists pgcrypto;

create schema if not exists agba_private;

create type public.agba_role_code as enum ('ceo', 'department_head');
create type public.agba_report_status as enum ('received', 'processed', 'needs_review', 'failed');
create type public.agba_task_status as enum ('todo', 'in_progress', 'blocked', 'done', 'cancelled');
create type public.agba_issue_status as enum ('open', 'monitoring', 'resolved', 'closed');
create type public.agba_issue_severity as enum ('low', 'medium', 'high', 'critical');
create type public.agba_decision_status as enum ('proposed', 'approved', 'rejected', 'superseded');
create type public.agba_approval_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.agba_goal_status as enum ('planned', 'active', 'at_risk', 'achieved', 'cancelled');
create type public.agba_message_role as enum ('user', 'assistant', 'system');
create type public.agba_observation_kind as enum ('fact', 'trend', 'anomaly', 'risk', 'opportunity', 'inference');

create table public.agba_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'Africa/Lagos',
  currency_code text not null default 'NGN',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agba_roles (
  id uuid primary key default gen_random_uuid(),
  code public.agba_role_code not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.agba_roles (code, name) values
  ('ceo', 'CEO'),
  ('department_head', 'Department Head')
on conflict (code) do nothing;

create table public.agba_departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table public.agba_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  auth_user_id uuid not null unique,
  role_id uuid not null references public.agba_roles(id),
  department_id uuid references public.agba_departments(id) on delete set null,
  full_name text not null,
  email text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((role_id is not null))
);

create table public.agba_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  department_id uuid references public.agba_departments(id) on delete set null,
  submitted_by uuid not null references public.agba_users(id),
  report_date date not null default current_date,
  raw_text text not null,
  status public.agba_report_status not null default 'received',
  source text not null default 'conversation',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.agba_report_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  report_id uuid not null references public.agba_reports(id) on delete cascade,
  department_id uuid references public.agba_departments(id) on delete set null,
  entry_type text not null,
  title text,
  description text,
  value_numeric numeric,
  value_text text,
  unit text,
  occurred_on date,
  confidence numeric(5,4),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.agba_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  department_id uuid references public.agba_departments(id) on delete set null,
  name text not null,
  key text not null,
  unit text,
  value_numeric numeric,
  value_text text,
  measured_on date not null,
  source_report_id uuid references public.agba_reports(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, key, measured_on, department_id)
);

create table public.agba_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  department_id uuid references public.agba_departments(id) on delete set null,
  owner_user_id uuid references public.agba_users(id) on delete set null,
  created_by_user_id uuid references public.agba_users(id) on delete set null,
  title text not null,
  description text,
  status public.agba_task_status not null default 'todo',
  priority integer not null default 3 check (priority between 1 and 5),
  due_at timestamptz,
  completed_at timestamptz,
  source_report_id uuid references public.agba_reports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agba_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  department_id uuid references public.agba_departments(id) on delete set null,
  recorded_by_user_id uuid references public.agba_users(id) on delete set null,
  amount numeric(18,2) not null check (amount >= 0),
  currency_code text not null default 'NGN',
  category text not null,
  vendor text,
  description text,
  incurred_on date not null,
  source_report_id uuid references public.agba_reports(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.agba_revenue_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  department_id uuid references public.agba_departments(id) on delete set null,
  recorded_by_user_id uuid references public.agba_users(id) on delete set null,
  amount numeric(18,2) not null check (amount >= 0),
  currency_code text not null default 'NGN',
  source text,
  description text,
  recognized_on date not null,
  source_report_id uuid references public.agba_reports(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.agba_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  department_id uuid references public.agba_departments(id) on delete set null,
  title text not null,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  event_type text,
  source_report_id uuid references public.agba_reports(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.agba_observations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  department_id uuid references public.agba_departments(id) on delete set null,
  kind public.agba_observation_kind not null,
  title text not null,
  body text not null,
  confidence numeric(5,4),
  observed_on date not null default current_date,
  expires_at timestamptz,
  created_by text not null default 'agba',
  created_at timestamptz not null default now()
);

create table public.agba_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  department_id uuid references public.agba_departments(id) on delete set null,
  owner_user_id uuid references public.agba_users(id) on delete set null,
  title text not null,
  description text,
  severity public.agba_issue_severity not null default 'medium',
  status public.agba_issue_status not null default 'open',
  first_seen_on date not null default current_date,
  resolved_at timestamptz,
  source_report_id uuid references public.agba_reports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agba_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  department_id uuid references public.agba_departments(id) on delete set null,
  made_by_user_id uuid references public.agba_users(id) on delete set null,
  title text not null,
  decision_text text not null,
  status public.agba_decision_status not null default 'proposed',
  decided_at timestamptz,
  source_report_id uuid references public.agba_reports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agba_approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  department_id uuid references public.agba_departments(id) on delete set null,
  requested_by_user_id uuid references public.agba_users(id) on delete set null,
  approver_user_id uuid references public.agba_users(id) on delete set null,
  title text not null,
  request_text text not null,
  status public.agba_approval_status not null default 'pending',
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.agba_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  department_id uuid references public.agba_departments(id) on delete set null,
  owner_user_id uuid references public.agba_users(id) on delete set null,
  title text not null,
  description text,
  status public.agba_goal_status not null default 'planned',
  target_value numeric,
  current_value numeric,
  unit text,
  starts_on date,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agba_context_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  department_id uuid references public.agba_departments(id) on delete set null,
  kind text not null,
  key text,
  title text not null,
  content text not null,
  confidence numeric(5,4),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  source_report_id uuid references public.agba_reports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agba_relationships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  from_type text not null,
  from_id uuid not null,
  relation_type text not null,
  to_type text not null,
  to_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, from_type, from_id, relation_type, to_type, to_id)
);

create table public.agba_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  user_id uuid not null references public.agba_users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agba_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  conversation_id uuid not null references public.agba_conversations(id) on delete cascade,
  role public.agba_message_role not null,
  content text not null,
  model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.agba_evidence_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  source_type text not null,
  source_id uuid not null,
  target_type text not null,
  target_id uuid not null,
  relationship text not null default 'supports',
  created_at timestamptz not null default now(),
  unique (organization_id, source_type, source_id, target_type, target_id, relationship)
);

create table public.agba_audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.agba_organizations(id) on delete cascade,
  actor_auth_user_id uuid,
  actor_agba_user_id uuid references public.agba_users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_agba_users_org on public.agba_users(organization_id);
create index idx_agba_users_auth on public.agba_users(auth_user_id);
create index idx_agba_departments_org on public.agba_departments(organization_id);
create index idx_agba_reports_org_date on public.agba_reports(organization_id, report_date desc);
create index idx_agba_reports_department_date on public.agba_reports(department_id, report_date desc);
create index idx_agba_entries_report on public.agba_report_entries(report_id);
create index idx_agba_metrics_org_date on public.agba_metrics(organization_id, measured_on desc);
create index idx_agba_tasks_org_status on public.agba_tasks(organization_id, status);
create index idx_agba_tasks_department_status on public.agba_tasks(department_id, status);
create index idx_agba_expenses_org_date on public.agba_expenses(organization_id, incurred_on desc);
create index idx_agba_revenue_org_date on public.agba_revenue_records(organization_id, recognized_on desc);
create index idx_agba_issues_org_status on public.agba_issues(organization_id, status, severity);
create index idx_agba_decisions_org_date on public.agba_decisions(organization_id, decided_at desc);
create index idx_agba_goals_org_status on public.agba_goals(organization_id, status);
create index idx_agba_context_org_kind on public.agba_context_items(organization_id, kind);
create index idx_agba_conversations_user on public.agba_conversations(user_id, updated_at desc);
create index idx_agba_messages_conversation on public.agba_messages(conversation_id, created_at);
create index idx_agba_audit_org_date on public.agba_audit_logs(organization_id, created_at desc);

create or replace function agba_private.current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select id from public.agba_users where auth_user_id = auth.uid() and active = true limit 1;
$$;

create or replace function agba_private.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select organization_id from public.agba_users where auth_user_id = auth.uid() and active = true limit 1;
$$;

create or replace function agba_private.is_ceo()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1
    from public.agba_users u
    join public.agba_roles r on r.id = u.role_id
    where u.auth_user_id = auth.uid() and u.active = true and r.code = 'ceo'
  );
$$;

create or replace function agba_private.can_access_department(p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select agba_private.is_ceo()
      or exists (
        select 1 from public.agba_users u
        where u.auth_user_id = auth.uid()
          and u.active = true
          and u.department_id = p_department_id
      );
$$;

grant usage on schema agba_private to authenticated;
grant execute on all functions in schema agba_private to authenticated;

-- RLS helper: organization membership.
create or replace function agba_private.in_current_org(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select p_organization_id = agba_private.current_org_id();
$$;

grant execute on function agba_private.in_current_org(uuid) to authenticated;

alter table public.agba_organizations enable row level security;
alter table public.agba_departments enable row level security;
alter table public.agba_users enable row level security;
alter table public.agba_reports enable row level security;
alter table public.agba_report_entries enable row level security;
alter table public.agba_metrics enable row level security;
alter table public.agba_tasks enable row level security;
alter table public.agba_expenses enable row level security;
alter table public.agba_revenue_records enable row level security;
alter table public.agba_events enable row level security;
alter table public.agba_observations enable row level security;
alter table public.agba_issues enable row level security;
alter table public.agba_decisions enable row level security;
alter table public.agba_approvals enable row level security;
alter table public.agba_goals enable row level security;
alter table public.agba_context_items enable row level security;
alter table public.agba_relationships enable row level security;
alter table public.agba_conversations enable row level security;
alter table public.agba_messages enable row level security;
alter table public.agba_evidence_links enable row level security;
alter table public.agba_audit_logs enable row level security;

-- Organization-wide read policy for CEO, and department-scoped policy for department heads.
create policy "agba organizations own org" on public.agba_organizations for select to authenticated
using (id = agba_private.current_org_id());

create policy "agba departments visible" on public.agba_departments for select to authenticated
using (organization_id = agba_private.current_org_id());

create policy "agba users visible" on public.agba_users for select to authenticated
using (organization_id = agba_private.current_org_id() and (agba_private.is_ceo() or id = agba_private.current_user_id()));

create policy "agba reports read" on public.agba_reports for select to authenticated
using (organization_id = agba_private.current_org_id() and (agba_private.is_ceo() or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())));

create policy "agba reports insert" on public.agba_reports for insert to authenticated
with check (organization_id = agba_private.current_org_id() and submitted_by = agba_private.current_user_id() and (agba_private.is_ceo() or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())));

create policy "agba entries read" on public.agba_report_entries for select to authenticated
using (organization_id = agba_private.current_org_id() and (agba_private.is_ceo() or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())));

create policy "agba entries insert" on public.agba_report_entries for insert to authenticated
with check (organization_id = agba_private.current_org_id() and (agba_private.is_ceo() or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())));

-- Reusable department-scoped read policies for operational entities.
create policy "agba metrics read" on public.agba_metrics for select to authenticated using (organization_id = agba_private.current_org_id() and (agba_private.is_ceo() or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())));
create policy "agba tasks read" on public.agba_tasks for select to authenticated using (organization_id = agba_private.current_org_id() and (agba_private.is_ceo() or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())));
create policy "agba tasks write" on public.agba_tasks for insert to authenticated with check (organization_id = agba_private.current_org_id() and (agba_private.is_ceo() or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())));
create policy "agba expenses read" on public.agba_expenses for select to authenticated using (organization_id = agba_private.current_org_id() and (agba_private.is_ceo() or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())));
create policy "agba expenses insert" on public.agba_expenses for insert to authenticated with check (organization_id = agba_private.current_org_id() and (agba_private.is_ceo() or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())));
create policy "agba revenue read" on public.agba_revenue_records for select to authenticated using (organization_id = agba_private.current_org_id() and (agba_private.is_ceo() or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())));
create policy "agba events read" on public.agba_events for select to authenticated using (organization_id = agba_private.current_org_id() and (agba_private.is_ceo() or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())));
create policy "agba observations read" on public.agba_observations for select to authenticated using (organization_id = agba_private.current_org_id() and (agba_private.is_ceo() or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())));
create policy "agba issues read" on public.agba_issues for select to authenticated using (organization_id = agba_private.current_org_id() and (agba_private.is_ceo() or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())));
create policy "agba decisions read" on public.agba_decisions for select to authenticated using (organization_id = agba_private.current_org_id() and (agba_private.is_ceo() or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())));
create policy "agba approvals read" on public.agba_approvals for select to authenticated using (organization_id = agba_private.current_org_id() and (agba_private.is_ceo() or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())));
create policy "agba goals read" on public.agba_goals for select to authenticated using (organization_id = agba_private.current_org_id() and (agba_private.is_ceo() or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())));
create policy "agba context read" on public.agba_context_items for select to authenticated using (organization_id = agba_private.current_org_id() and (agba_private.is_ceo() or department_id is null or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())));
create policy "agba relationships read" on public.agba_relationships for select to authenticated using (organization_id = agba_private.current_org_id());

create policy "agba conversations own" on public.agba_conversations for all to authenticated
using (organization_id = agba_private.current_org_id() and user_id = agba_private.current_user_id())
with check (organization_id = agba_private.current_org_id() and user_id = agba_private.current_user_id());

create policy "agba messages own conversation" on public.agba_messages for all to authenticated
using (organization_id = agba_private.current_org_id() and exists (select 1 from public.agba_conversations c where c.id = conversation_id and c.user_id = agba_private.current_user_id()))
with check (organization_id = agba_private.current_org_id() and exists (select 1 from public.agba_conversations c where c.id = conversation_id and c.user_id = agba_private.current_user_id()));

create policy "agba evidence read" on public.agba_evidence_links for select to authenticated using (organization_id = agba_private.current_org_id());

create policy "agba audit own org" on public.agba_audit_logs for select to authenticated using (organization_id = agba_private.current_org_id() and agba_private.is_ceo());

-- Trigger for updated_at columns.
create or replace function agba_private.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

grant execute on function agba_private.set_updated_at() to authenticated;

do $do$
declare
  t text;
begin
  foreach t in array array[
    'agba_organizations','agba_departments','agba_users','agba_tasks','agba_issues',
    'agba_decisions','agba_goals','agba_context_items','agba_conversations'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'set_updated_at', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function agba_private.set_updated_at()', t);
  end loop;
end
$do$;

-- Do not expose helper functions to anonymous users.
revoke all on schema agba_private from public, anon;
revoke all on all functions in schema agba_private from public, anon;
