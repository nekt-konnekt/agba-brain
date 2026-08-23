-- Harden SECURITY DEFINER and mutable-search-path functions.
-- Keep user-facing confirmation helpers available only to signed-in users and bind them to auth.uid().

alter function public.agba_can_confirm_report(uuid, uuid) set search_path = public;
revoke all on function public.agba_can_confirm_report(uuid, uuid) from anon;
grant execute on function public.agba_can_confirm_report(uuid, uuid) to authenticated;

create or replace function public.agba_can_confirm_report(p_report_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.agba_reports r
    join public.agba_users u on u.id = p_user_id
      and u.organization_id = r.organization_id
      and u.active = true
    join public.agba_roles ro on ro.id = u.role_id
    join auth.users au on au.id = u.auth_user_id
    where r.id = p_report_id
      and au.id = auth.uid()
      and (
        ro.code = 'ceo'
        or (ro.code = 'department_head' and u.department_id = r.department_id)
      )
  );
$$;

alter function public.confirm_agba_business_evidence(uuid, uuid) set search_path = public;
revoke all on function public.confirm_agba_business_evidence(uuid, uuid) from anon;
grant execute on function public.confirm_agba_business_evidence(uuid, uuid) to authenticated;

create or replace function public.confirm_agba_business_evidence(p_evidence_id uuid, p_member_id uuid)
returns public.agba_business_evidence
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.agba_business_evidence;
  v_role public.agba_role_code;
  v_auth_user_id uuid;
begin
  select u.auth_user_id, r.code into v_auth_user_id, v_role
  from public.agba_users u
  join public.agba_roles r on r.id = u.role_id
  where u.id = p_member_id and u.active = true;

  if v_auth_user_id is null or v_auth_user_id <> auth.uid() then
    raise exception 'Authenticated user does not match the supplied Agba user';
  end if;

  if v_role is null then
    raise exception 'Active Agba user not found';
  end if;

  update public.agba_business_evidence e
  set status='confirmed', confirmed_by=p_member_id, confirmed_at=now(), updated_at=now()
  where e.id=p_evidence_id
    and e.status='pending'
    and v_role in ('ceo','department_head')
    and e.submitted_by is distinct from p_member_id
    and exists (
      select 1 from public.agba_users u
      where u.id=p_member_id and u.organization_id=e.organization_id and u.active=true
    )
  returning e.* into v_row;

  if v_row.id is null then
    raise exception 'Evidence cannot be confirmed by this user';
  end if;

  update public.agba_reports
  set confirmation_status='confirmed', confirmed_by=p_member_id, confirmed_at=now()
  where id=v_row.report_id;

  return v_row;
end;
$$;

alter function public.agba_claim_telegram_delivery(text, integer) set search_path = public;
revoke all on function public.agba_claim_telegram_delivery(text, integer) from anon, authenticated;
grant execute on function public.agba_claim_telegram_delivery(text, integer) to service_role;

alter function public.agba_classify_intent(text) set search_path = public;
revoke all on function public.agba_classify_intent(text) from anon;
grant execute on function public.agba_classify_intent(text) to authenticated, service_role;

alter function public.guard_report_confirmation_source() set search_path = public;
revoke all on function public.guard_report_confirmation_source() from anon, authenticated;
