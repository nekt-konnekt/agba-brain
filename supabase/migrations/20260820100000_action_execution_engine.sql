-- Agba V1 action execution ledger.
-- Management actions remain the intent layer. Executions are immutable attempts
-- against a concrete tool, with explicit lifecycle and result metadata.

create table if not exists public.agba_action_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  action_id uuid not null references public.agba_actions(id) on delete cascade,
  tool_name text not null,
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed','cancelled')),
  idempotency_key text,
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agba_action_executions_completed_state_check check (
    (status in ('succeeded','failed','cancelled') and completed_at is not null)
    or status in ('pending','running')
  )
);

create unique index if not exists idx_agba_action_executions_idempotency
  on public.agba_action_executions(organization_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists idx_agba_action_executions_action_created
  on public.agba_action_executions(action_id, created_at desc);

create index if not exists idx_agba_action_executions_org_status
  on public.agba_action_executions(organization_id, status, created_at desc);

alter table public.agba_action_executions enable row level security;
grant select on public.agba_action_executions to authenticated;

drop policy if exists "agba action executions read" on public.agba_action_executions;
create policy "agba action executions read" on public.agba_action_executions
for select to authenticated
using (organization_id = agba_private.current_org_id() and agba_private.is_ceo());

create or replace function agba_private.touch_action_execution()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_action_execution on public.agba_action_executions;
create trigger touch_action_execution
before update on public.agba_action_executions
for each row execute function agba_private.touch_action_execution();

revoke all on function agba_private.touch_action_execution() from public, anon, authenticated;
