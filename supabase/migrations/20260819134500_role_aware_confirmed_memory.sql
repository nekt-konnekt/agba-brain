-- Role-aware company membership and evidence confirmation.
-- Additive migration. Existing connections remain valid and default to staff.

alter table public.company_members
  add column if not exists role text not null default 'staff'
    check (role in ('owner', 'manager', 'staff'));

create index if not exists company_members_company_role_idx
  on public.company_members(company_id, role);

create table if not exists public.business_evidence (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  submitted_by uuid references public.company_members(id) on delete set null,
  source_text text not null,
  evidence_type text not null default 'report'
    check (evidence_type in ('report', 'note', 'decision', 'event')),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'corrected', 'rejected')),
  extracted_data jsonb not null default '{}'::jsonb,
  correction_of uuid references public.business_evidence(id) on delete set null,
  confirmed_by uuid references public.company_members(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_evidence_company_status_idx
  on public.business_evidence(company_id, status, created_at desc);

create index if not exists business_evidence_company_created_idx
  on public.business_evidence(company_id, created_at desc);

create or replace function public.confirm_business_evidence(
  p_evidence_id uuid,
  p_member_id uuid
)
returns public.business_evidence
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.business_evidence;
begin
  update public.business_evidence e
     set status = 'confirmed',
         confirmed_by = p_member_id,
         confirmed_at = now(),
         updated_at = now()
   where e.id = p_evidence_id
     and e.status = 'pending'
     and exists (
       select 1
       from public.company_members m
       where m.id = p_member_id
         and m.company_id = e.company_id
         and m.role in ('owner', 'manager', 'staff')
     )
  returning e.* into v_row;

  if v_row.id is null then
    raise exception 'Evidence not found, already resolved, or member is not part of the company';
  end if;

  return v_row;
end;
$$;

grant execute on function public.confirm_business_evidence(uuid, uuid) to service_role;
