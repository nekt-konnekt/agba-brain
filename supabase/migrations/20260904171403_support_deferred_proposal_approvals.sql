alter type public.agba_approval_status add value if not exists 'deferred';
create or replace function public.agba_decide_proposal(
  p_proposal_id uuid,
  p_approval_id uuid,
  p_decision text,
  p_decided_by uuid default null
) returns public.agba_proposals
language plpgsql security definer set search_path = '' as $$
declare
  p public.agba_proposals;
  s text := lower(trim(p_decision));
begin
  if s not in ('approved','rejected','deferred') then raise exception 'invalid_proposal_decision'; end if;
  select * into p from public.agba_proposals where id=p_proposal_id for update;
  if not found then raise exception 'proposal_not_found'; end if;
  if p.approval_id is distinct from p_approval_id then raise exception 'approval_mismatch'; end if;
  if p.status <> 'proposed' then raise exception 'proposal_not_pending'; end if;
  update public.agba_approvals set status=s::public.agba_approval_status,decided_at=now(),approver_user_id=p_decided_by where id=p_approval_id and status='pending';
  if not found then raise exception 'approval_not_pending'; end if;
  update public.agba_proposals set status=s,updated_at=now() where id=p.id returning * into p;
  return p;
end;
$$;
