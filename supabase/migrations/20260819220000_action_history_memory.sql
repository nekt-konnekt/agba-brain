-- Preserve completed management actions as durable company memory.
-- CEO query already reads active/monitoring state, so completed actions are
-- represented as a durable state item after completion. This keeps the action
-- out of the open-action queue while allowing future CEO questions to recall
-- what happened, who owned it, and when it was completed.

create or replace function agba_private.remember_completed_action()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  action_state_key text;
  action_title text;
  action_summary text;
begin
  if new.status = 'done' and (old.status is distinct from 'done') then
    action_state_key := 'completed_action:' || new.id::text;
    action_title := 'Completed management action: ' || left(new.description, 220);
    action_summary := format(
      'Management action completed. Action: %s. Owner: %s. Completed at: %s. Previous status: %s.',
      new.description,
      coalesce(new.owner_name, 'unassigned'),
      to_char(coalesce((new.metadata->>'completed_at')::timestamptz, now()), 'YYYY-MM-DD HH24:MI TZ'),
      old.status
    );

    insert into public.agba_state_items (
      organization_id,
      state_key,
      kind,
      title,
      summary,
      status,
      confidence,
      severity,
      recommended_action,
      first_seen_at,
      last_seen_at,
      metadata
    ) values (
      new.organization_id,
      action_state_key,
      'decision',
      action_title,
      action_summary,
      'active',
      'high',
      new.priority,
      null,
      coalesce(new.created_at, now()),
      now(),
      jsonb_build_object(
        'memory_type', 'completed_management_action',
        'action_id', new.id,
        'source_ceo_query_id', new.source_ceo_query_id,
        'owner_name', new.owner_name,
        'completed_at', coalesce(new.metadata->>'completed_at', now()::text)
      )
    )
    on conflict (organization_id, state_key)
    do update set
      summary = excluded.summary,
      status = 'active',
      confidence = 'high',
      last_seen_at = now(),
      metadata = excluded.metadata;
  end if;

  return new;
end;
$$;

drop trigger if exists remember_completed_action on public.agba_actions;
create trigger remember_completed_action
after update of status on public.agba_actions
for each row
execute function agba_private.remember_completed_action();

revoke all on function agba_private.remember_completed_action() from public, anon, authenticated;
