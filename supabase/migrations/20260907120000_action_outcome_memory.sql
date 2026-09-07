-- Durable outcome layer: execution completion is not business resolution.
-- A succeeded execution becomes confirmed only when its output explicitly
-- carries outcome_confirmed=true; otherwise it remains unverified/monitoring.

alter table public.agba_action_executions
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists outcome_status text,
  add column if not exists outcome_summary text,
  add column if not exists outcome_evidence jsonb not null default '[]'::jsonb,
  add column if not exists outcome_next_state text,
  add column if not exists outcome_recorded_at timestamptz;

create index if not exists idx_agba_action_exec_outcome
  on public.agba_action_executions(organization_id, outcome_status, outcome_recorded_at desc);

create or replace function agba_private.record_action_outcome_memory()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_outcome_status text;
  v_outcome_summary text;
  v_evidence jsonb;
  v_next_state text;
  v_source_state_id uuid;
  v_action_description text;
  v_priority public.agba_severity;
begin
  if new.status not in ('succeeded','failed') or old.status is not distinct from new.status then
    return new;
  end if;

  select description, priority, source_state_item_id
    into v_action_description, v_priority, v_source_state_id
  from public.agba_actions
  where id = new.action_id;

  if new.status = 'failed' then
    v_outcome_status := 'failed';
    v_outcome_summary := 'Action execution failed. The underlying business state remains unresolved until new evidence confirms otherwise.';
    v_evidence := '[]'::jsonb;
    v_next_state := 'follow_up_required';
  elsif coalesce((new.output->>'outcome_confirmed')::boolean, false) then
    v_outcome_status := 'confirmed';
    v_outcome_summary := coalesce(new.output->>'outcome_summary', 'Action executed and the resulting business outcome was explicitly confirmed.');
    v_evidence := case when jsonb_typeof(coalesce(new.output->'evidence','null'::jsonb)) = 'array' then new.output->'evidence' else '[]'::jsonb end;
    v_next_state := 'resolution_confirmed';
  else
    v_outcome_status := 'unverified';
    v_outcome_summary := coalesce(new.output->>'outcome_summary', 'Action executed, but execution completion alone does not prove the underlying business outcome.');
    v_evidence := case when jsonb_typeof(coalesce(new.output->'evidence','null'::jsonb)) = 'array' then new.output->'evidence' else '[]'::jsonb end;
    v_next_state := 'monitoring';
  end if;

  update public.agba_action_executions
  set outcome_status = v_outcome_status,
      outcome_summary = v_outcome_summary,
      outcome_evidence = v_evidence,
      outcome_next_state = v_next_state,
      outcome_recorded_at = coalesce(new.completed_at, now())
  where id = new.id;

  insert into public.agba_state_items (
    organization_id, state_key, kind, title, summary, status, confidence,
    severity, recommended_action, first_seen_at, last_seen_at, metadata
  ) values (
    new.organization_id,
    'action_outcome:' || new.id::text,
    'observation',
    'Action outcome: ' || left(coalesce(v_action_description, 'management action'), 180),
    v_outcome_summary,
    case when v_outcome_status = 'confirmed' then 'resolved'::public.agba_state_status else 'monitoring'::public.agba_state_status end,
    case when v_outcome_status = 'confirmed' then 'high'::public.agba_confidence else 'medium'::public.agba_confidence end,
    v_priority,
    case when v_outcome_status = 'confirmed' then null else 'Verify the business result with evidence before closing the underlying issue.' end,
    coalesce(new.created_at, now()),
    coalesce(new.completed_at, now()),
    jsonb_build_object(
      'memory_type','action_outcome',
      'execution_id',new.id,
      'action_id',new.action_id,
      'outcome_status',v_outcome_status,
      'outcome_evidence',v_evidence,
      'next_state',v_next_state,
      'source_state_item_id',v_source_state_id
    )
  )
  on conflict (organization_id, state_key)
  do update set
    summary = excluded.summary,
    status = excluded.status,
    confidence = excluded.confidence,
    recommended_action = excluded.recommended_action,
    last_seen_at = excluded.last_seen_at,
    resolved_at = case when excluded.status = 'resolved' then excluded.last_seen_at else null end,
    metadata = excluded.metadata;

  if v_outcome_status = 'confirmed' and v_source_state_id is not null then
    update public.agba_state_items
    set status = 'resolved',
        resolved_at = coalesce(new.completed_at, now()),
        last_seen_at = coalesce(new.completed_at, now()),
        metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
          'resolution_source','action_outcome',
          'resolution_execution_id',new.id,
          'resolution_evidence',v_evidence
        )
    where id = v_source_state_id
      and organization_id = new.organization_id
      and status <> 'dismissed';
  end if;

  return new;
end;
$$;

drop trigger if exists record_action_outcome_memory on public.agba_action_executions;
create trigger record_action_outcome_memory
after update of status on public.agba_action_executions
for each row execute function agba_private.record_action_outcome_memory();

revoke all on function agba_private.record_action_outcome_memory() from public, anon, authenticated;
