create or replace function public.agba_mutate_action(p_operation text, p_action_id uuid default null, p_organization_id uuid default null, p_created_by uuid default null, p_description text default null, p_owner_name text default null, p_deadline timestamptz default null, p_status text default null, p_priority public.agba_severity default null, p_metadata jsonb default '{}'::jsonb)
returns setof public.agba_actions
language plpgsql
security definer
set search_path = public
as $function$
declare
  a public.agba_actions;
  before_state jsonb;
  op text := lower(trim(coalesce(p_operation,'')));
  owner text := nullif(trim(regexp_replace(coalesce(p_owner_name,''), '^for[[:space:]]+', '', 1, 'i')), '');
begin
  if p_organization_id is null then raise exception 'organization_id_required'; end if;

  if op='create' then
    if nullif(trim(coalesce(p_description,'')),'') is null then raise exception 'description_required'; end if;
    insert into public.agba_actions(organization_id,created_by,owner_name,description,deadline,status,priority,metadata)
    values(p_organization_id,p_created_by,owner,trim(p_description),p_deadline,coalesce(p_status,'open'),coalesce(p_priority,'medium'::public.agba_severity),coalesce(p_metadata,'{}'::jsonb))
    returning * into a;
    insert into public.agba_action_history(action_id,organization_id,changed_by,operation,before_state,after_state)
    values(a.id,a.organization_id,p_created_by,'create','{}'::jsonb,to_jsonb(a));
    return next a; return;
  end if;

  if p_action_id is null then raise exception 'action_id_required'; end if;
  select * into a from public.agba_actions where id=p_action_id and organization_id=p_organization_id for update;
  if not found then raise exception 'action_not_found'; end if;
  before_state:=to_jsonb(a);

  if op='status' then
    if p_status is null or p_status not in ('open','in_progress','done','cancelled') then raise exception 'invalid_status'; end if;
    if a.status in ('done','cancelled') and p_status<>a.status then raise exception 'terminal_action_immutable'; end if;
    if a.status='open' and p_status not in ('open','in_progress','done','cancelled') then raise exception 'invalid_status_transition'; end if;
    if a.status='in_progress' and p_status='open' then raise exception 'invalid_status_transition'; end if;
    update public.agba_actions set status=p_status,updated_at=now(),metadata=coalesce(a.metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb) where id=a.id returning * into a;
  elsif op='assign' then
    if a.status in ('done','cancelled') then raise exception 'terminal_action_immutable'; end if;
    update public.agba_actions set owner_name=owner,updated_at=now() where id=a.id returning * into a;
  elsif op='deadline' then
    if a.status in ('done','cancelled') then raise exception 'terminal_action_immutable'; end if;
    update public.agba_actions set deadline=p_deadline,updated_at=now() where id=a.id returning * into a;
  elsif op='priority' then
    if a.status in ('done','cancelled') then raise exception 'terminal_action_immutable'; end if;
    if p_priority is null then raise exception 'priority_required'; end if;
    update public.agba_actions set priority=p_priority,updated_at=now() where id=a.id returning * into a;
  elsif op='metadata' then
    update public.agba_actions set metadata=coalesce(a.metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb),updated_at=now() where id=a.id returning * into a;
  else
    raise exception 'unsupported_operation';
  end if;

  insert into public.agba_action_history(action_id,organization_id,changed_by,operation,before_state,after_state)
  values(a.id,a.organization_id,p_created_by,op,before_state,to_jsonb(a));
  return next a;
end;
$function$;
