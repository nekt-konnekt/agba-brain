create or replace function public.agba_create_proposal_approval(
  p_proposal_id uuid,
  p_requested_by uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.agba_proposals;
  a uuid;
begin
  select * into p from public.agba_proposals where id=p_proposal_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if p.status <> 'proposed' then raise exception 'proposal_not_pending'; end if;
  insert into public.agba_approvals(organization_id,department_id,requested_by_user_id,title,request_text,status)
  values(p.organization_id,null,p_requested_by,p.title,coalesce(p.summary,'') || case when p.recommendation is not null then E'\n\nRecommendation: '||p.recommendation else '' end,'pending')
  returning id into a;
  update public.agba_proposals set approval_id=a,updated_at=now() where id=p.id;
  return a;
end;
$$;
