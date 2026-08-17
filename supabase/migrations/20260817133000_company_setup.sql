-- Agba V1 Company Setup invariants
-- Keeps company provisioning authoritative and prevents invalid role/department combinations.

alter table public.agba_organizations
  add column if not exists setup_completed_at timestamptz,
  add column if not exists setup_completed_by uuid references public.agba_users(id) on delete set null;

create or replace function agba_private.validate_user_assignment()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  role_code public.agba_role_code;
  department_org uuid;
begin
  select code into role_code
  from public.agba_roles
  where id = new.role_id;

  if role_code = 'ceo' and new.department_id is not null then
    raise exception 'CEO cannot be assigned to a department';
  end if;

  if role_code = 'department_head' and new.department_id is null then
    raise exception 'Department Head must be assigned to a department';
  end if;

  if new.department_id is not null then
    select organization_id into department_org
    from public.agba_departments
    where id = new.department_id;

    if department_org is null then
      raise exception 'Department does not exist';
    end if;

    if department_org <> new.organization_id then
      raise exception 'User department must belong to the same organization';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists validate_user_assignment on public.agba_users;
create trigger validate_user_assignment
before insert or update of organization_id, role_id, department_id
on public.agba_users
for each row execute function agba_private.validate_user_assignment();

-- Only one active CEO per organization.
create unique index if not exists uq_agba_one_active_ceo
on public.agba_users (organization_id)
where active = true and role_id = (select id from public.agba_roles where code = 'ceo');

-- Only one active Department Head per department in V1.
create unique index if not exists uq_agba_one_active_department_head
on public.agba_users (department_id)
where active = true and role_id = (select id from public.agba_roles where code = 'department_head');

revoke all on function agba_private.validate_user_assignment() from public, anon, authenticated;
