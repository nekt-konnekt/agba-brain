-- Agba V1 company state layer
-- Durable, evidence-linked state derived from validated reasoning.

create type public.agba_state_status as enum ('active', 'monitoring', 'resolved', 'dismissed');

create table if not exists public.agba_state_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  department_id uuid references public.agba_departments(id) on delete set null,
  state_key text not null,
  kind text not null check (kind in ('issue', 'risk', 'opportunity', 'observation', 'decision', 'recommendation')),
  title text not null,
  summary text not null,
  status public.agba_state_status not null default 'active',
  confidence public.agba_confidence not null default 'medium',
  severity public.agba_severity,
  recommended_action text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  source_reasoning_item_id uuid references public.agba_reasoning_items(id) on delete set null,
  source_report_id uuid references public.agba_reports(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, state_key)
);

create index if not exists idx_agba_state_org_status on public.agba_state_items(organization_id, status, last_seen_at desc);
create index if not exists idx_agba_state_department on public.agba_state_items(department_id, status, last_seen_at desc);

alter table public.agba_state_items enable row level security;

grant select on public.agba_state_items to authenticated;

drop policy if exists "agba state read" on public.agba_state_items;
create policy "agba state read" on public.agba_state_items
for select to authenticated
using (
  organization_id = agba_private.current_org_id()
  and (
    agba_private.is_ceo()
    or department_id is null
    or department_id = (select department_id from public.agba_users where id = agba_private.current_user_id())
  )
);

create or replace function agba_private.touch_state_item()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_state_item on public.agba_state_items;
create trigger touch_state_item
before update on public.agba_state_items
for each row execute function agba_private.touch_state_item();

revoke all on function agba_private.touch_state_item() from public, anon, authenticated;
