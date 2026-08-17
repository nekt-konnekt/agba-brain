-- Agba V1 reasoning support
-- Reasoning objects are explicitly typed and auditable. They do not replace source evidence.

create type public.agba_reasoning_type as enum (
  'observation',
  'issue',
  'recommendation',
  'decision'
);

create type public.agba_confidence as enum ('high', 'medium', 'low');

create type public.agba_severity as enum ('low', 'medium', 'high', 'critical');

create table if not exists public.agba_reasoning_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  department_id uuid references public.agba_departments(id) on delete set null,
  type public.agba_reasoning_type not null,
  title text not null,
  summary text not null,
  confidence public.agba_confidence not null default 'medium',
  severity public.agba_severity,
  status text not null default 'open' check (status in ('open', 'watching', 'resolved', 'dismissed')),
  recommended_action text,
  created_by uuid references public.agba_users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agba_reasoning_evidence (
  id uuid primary key default gen_random_uuid(),
  reasoning_item_id uuid not null references public.agba_reasoning_items(id) on delete cascade,
  report_id uuid references public.agba_reports(id) on delete set null,
  report_entry_id uuid references public.agba_report_entries(id) on delete set null,
  observation_id uuid references public.agba_observations(id) on delete set null,
  issue_id uuid references public.agba_issues(id) on delete set null,
  decision_id uuid references public.agba_decisions(id) on delete set null,
  evidence_note text,
  created_at timestamptz not null default now(),
  check (
    num_nonnulls(report_id, report_entry_id, observation_id, issue_id, decision_id) = 1
  )
);

create index if not exists idx_agba_reasoning_org_status
  on public.agba_reasoning_items (organization_id, status, created_at desc);

create index if not exists idx_agba_reasoning_department
  on public.agba_reasoning_items (department_id, created_at desc);

create index if not exists idx_agba_reasoning_evidence_item
  on public.agba_reasoning_evidence (reasoning_item_id);

-- Ensure timestamps move with edits.
create or replace function agba_private.touch_reasoning_item()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_reasoning_item on public.agba_reasoning_items;
create trigger touch_reasoning_item
before update on public.agba_reasoning_items
for each row execute function agba_private.touch_reasoning_item();

revoke all on function agba_private.touch_reasoning_item() from public, anon, authenticated;
