-- People + leadership memory foundations.
-- Never edit applied migrations; this migration extends the live model safely.

-- Employees are operational participants who report to Agba, but do not receive
-- CEO / Department Head privileges.
alter type public.agba_role_code add value if not exists 'employee';

create table if not exists public.agba_decision_history (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.agba_decisions(id) on delete cascade,
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  changed_by uuid references public.agba_users(id) on delete set null,
  operation text not null,
  before_state jsonb not null default '{}'::jsonb,
  after_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_agba_decision_history_decision
  on public.agba_decision_history(decision_id, created_at desc);

create or replace function public.agba_record_decision_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid;
begin
  select id into actor
  from public.agba_users
  where auth_user_id = auth.uid()
    and active = true
  limit 1;

  if tg_op = 'INSERT' then
    insert into public.agba_decision_history
      (decision_id, organization_id, changed_by, operation, before_state, after_state)
    values
      (new.id, new.organization_id, actor, 'create', '{}'::jsonb, to_jsonb(new));
    return new;
  end if;

  if tg_op = 'UPDATE' then
    insert into public.agba_decision_history
      (decision_id, organization_id, changed_by, operation, before_state, after_state)
    values
      (new.id, new.organization_id, actor, 'update', to_jsonb(old), to_jsonb(new));
    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.agba_decision_history
      (decision_id, organization_id, changed_by, operation, before_state, after_state)
    values
      (old.id, old.organization_id, actor, 'delete', to_jsonb(old), '{}'::jsonb);
    return old;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_agba_decision_history on public.agba_decisions;
create trigger trg_agba_decision_history
after insert or update or delete on public.agba_decisions
for each row execute function public.agba_record_decision_history();

-- A small read API gives the Office a governed way to retrieve the timeline.
create or replace function public.agba_get_decision_history(p_decision_id uuid)
returns setof public.agba_decision_history
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_org uuid;
  actor_role text;
begin
  select u.organization_id, r.code into actor_org, actor_role
  from public.agba_users u
  join public.agba_roles r on r.id = u.role_id
  where u.auth_user_id = auth.uid() and u.active = true
  limit 1;

  if actor_org is null then raise exception 'actor_not_registered'; end if;
  if actor_role not in ('ceo','department_head') then raise exception 'insufficient_role'; end if;

  return query
  select h.*
  from public.agba_decision_history h
  where h.decision_id = p_decision_id
    and h.organization_id = actor_org
  order by h.created_at desc;
end;
$$;

-- Action history already exists. Expose the same governed read pattern for Office.
create or replace function public.agba_get_action_history(p_action_id uuid)
returns setof public.agba_action_history
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_org uuid;
  actor_role text;
begin
  select u.organization_id, r.code into actor_org, actor_role
  from public.agba_users u
  join public.agba_roles r on r.id = u.role_id
  where u.auth_user_id = auth.uid() and u.active = true
  limit 1;

  if actor_org is null then raise exception 'actor_not_registered'; end if;
  if actor_role not in ('ceo','department_head') then raise exception 'insufficient_role'; end if;

  return query
  select h.*
  from public.agba_action_history h
  where h.action_id = p_action_id
    and h.organization_id = actor_org
  order by h.created_at desc;
end;
$$;
