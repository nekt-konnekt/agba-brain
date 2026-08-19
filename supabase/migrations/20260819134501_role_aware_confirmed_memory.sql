-- Role-aware company membership and confirmed business evidence.
-- Existing Agba users already carry a role through agba_users.role_id.
-- This migration adds confirmation metadata to reports and a durable evidence layer.

alter table public.agba_reports
  add column if not exists confirmation_status text not null default 'pending'
  check (confirmation_status in ('pending', 'confirmed', 'corrected', 'rejected'));

alter table public.agba_reports
  add column if not exists confirmed_by uuid references public.agba_users(id) on delete set null;

alter table public.agba_reports
  add column if not exists confirmed_at timestamptz;

create index if not exists agba_reports_confirmation_idx
  on public.agba_reports(organization_id, confirmation_status, report_date desc);

create table if not exists public.agba_business_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  report_id uuid references public.agba_reports(id) on delete set null,
  submitted_by uuid references public.agba_users(id) on delete set null,
  source_text text not null,
  evidence_type text not null default 'report'
    check (evidence_type in ('report', 'note', 'decision', 'event')),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'corrected', 'rejected')),
  extracted_data jsonb not null default '{}'::jsonb,
  correction_of uuid references public.agba_business_evidence(id) on delete set null,
  confirmed_by uuid references public.agba_users(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agba_business_evidence_org_status_idx
  on public.agba_business_evidence(organization_id, status, created_at desc);

create index if not exists agba_business_evidence_report_idx
  on public.agba_business_evidence(report_id);

create or replace function public.confirm_agba_business_evidence(
  p_evidence_id uuid,
  p_member_id uuid
)
returns public.agba_business_evidence
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.agba_business_evidence;
  v_role public.agba_role_code;
begin
  select r.code into v_role
  from public.agba_users u
  join public.agba_roles r on r.id = u.role_id
  where u.id = p_member_id and u.active = true;

  if v_role is null then
    raise exception 'Active Agba user not found';
  end if;

  update public.agba_business_evidence e
     set status = 'confirmed',
         confirmed_by = p_member_id,
         confirmed_at = now(),
         updated_at = now()
   where e.id = p_evidence_id
     and e.status = 'pending'
     and v_role in ('ceo', 'department_head')
     and exists (
       select 1 from public.agba_users u
       where u.id = p_member_id
         and u.organization_id = e.organization_id
         and u.active = true
     )
  returning e.* into v_row;

  if v_row.id is null then
    raise exception 'Evidence cannot be confirmed by this user';
  end if;

  update public.agba_reports
     set confirmation_status = 'confirmed',
         confirmed_by = p_member_id,
         confirmed_at = now()
   where id = v_row.report_id;

  return v_row;
end;
$$;

grant execute on function public.confirm_agba_business_evidence(uuid, uuid) to service_role;
