revoke execute on function public.agba_create_proposal_approval(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.agba_decide_proposal(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.agba_create_proposal_approval(uuid, uuid) to service_role;
grant execute on function public.agba_decide_proposal(uuid, uuid, text, uuid) to service_role;
