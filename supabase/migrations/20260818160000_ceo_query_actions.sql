-- Agba V1 CEO interaction and action memory

create table if not exists public.agba_ceo_queries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  asked_by uuid not null references public.agba_users(id) on delete restrict,
  question text not null,
  answer text not null,
  confidence public.agba_confidence not null default 'medium',
  confidence_reason text not null,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agba_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  created_by uuid references public.agba_users(id) on delete set null,
  owner_name text,
  description text not null,
  deadline timestamptz,
  status text not null default 'open' check (status in ('open','in_progress','done','cancelled')),
  priority public.agba_severity default 'medium',
  source_ceo_query_id uuid references public.agba_ceo_queries(id) on delete set null,
  source_state_item_id uuid references public.agba_state_items(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agba_ceo_queries_org_created on public.agba_ceo_queries(organization_id, created_at desc);
create index if not exists idx_agba_actions_org_status on public.agba_actions(organization_id, status, priority, created_at desc);

alter table public.agba_ceo_queries enable row level security;
alter table public.agba_actions enable row level security;

grant select on public.agba_ceo_queries, public.agba_actions to authenticated;

drop policy if exists "agba ceo queries read" on public.agba_ceo_queries;
create policy "agba ceo queries read" on public.agba_ceo_queries
for select to authenticated
using (organization_id = agba_private.current_org_id() and agba_private.is_ceo());

drop policy if exists "agba actions read" on public.agba_actions;
create policy "agba actions read" on public.agba_actions
for select to authenticated
using (organization_id = agba_private.current_org_id() and agba_private.is_ceo());

create or replace function agba_private.touch_ceo_action()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_ceo_action on public.agba_actions;
create trigger touch_ceo_action
before update on public.agba_actions
for each row execute function agba_private.touch_ceo_action();

revoke all on function agba_private.touch_ceo_action() from public, anon, authenticated;
