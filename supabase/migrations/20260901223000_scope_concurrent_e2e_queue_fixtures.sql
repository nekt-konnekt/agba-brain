-- Prevent concurrent E2E workers from claiming another test run's fixture.
-- Test workers are named e2e-<test_scope>-a/b and fixtures carry payload.test_scope.
-- Production workers continue to exclude payload.test_only=true fixtures.

create or replace function public.agba_claim_telegram_update(p_worker_id text, p_lease_seconds integer default 120)
returns setof public.agba_telegram_update_inbox
language plpgsql security definer set search_path=public
as $$
begin
  return query
  with candidate as (
    select id from public.agba_telegram_update_inbox
    where (
      (status in ('received','queued','failed') and coalesce(next_attempt_at, now()) <= now() and attempts < max_attempts)
      or (status='processing' and locked_at is not null and locked_at <= now()-make_interval(secs=>greatest(p_lease_seconds,1)) and attempts < max_attempts)
    )
    and (
      (p_worker_id like 'e2e-%'
        and coalesce(payload->>'test_only','false')='true'
        and coalesce(payload->>'test_scope','') = regexp_replace(p_worker_id, '-[ab]$', ''))
      or
      (p_worker_id not like 'e2e-%' and coalesce(payload->>'test_only','false')<>'true')
    )
    order by received_at asc for update skip locked limit 1
  )
  update public.agba_telegram_update_inbox q
  set status='processing', attempts=q.attempts+1, locked_at=now(), worker_id=p_worker_id,
      last_error=case when q.status='processing' then 'Processing lease expired; reclaimed by worker.' else null end
  from candidate c where q.id=c.id returning q.*;
end;
$$;

create or replace function public.agba_claim_telegram_delivery(p_worker_id text, p_lease_seconds integer default 120)
returns setof public.agba_telegram_delivery_outbox
language plpgsql security definer set search_path=public
as $$
begin
  return query
  with candidate as (
    select id from public.agba_telegram_delivery_outbox
    where (
      (status in ('pending','failed') and next_attempt_at <= now() and attempts < max_attempts)
      or (status='sending' and locked_at is not null and locked_at <= now()-make_interval(secs=>greatest(p_lease_seconds,1)) and attempts < max_attempts)
    )
    and (
      (p_worker_id like 'e2e-%'
        and coalesce(payload->>'test_only','false')='true'
        and coalesce(payload->>'test_scope','') = regexp_replace(p_worker_id, '-[ab]$', ''))
      or
      (p_worker_id not like 'e2e-%' and coalesce(payload->>'test_only','false')<>'true')
    )
    order by created_at asc for update skip locked limit 1
  )
  update public.agba_telegram_delivery_outbox d
  set status='sending', attempts=d.attempts+1, locked_at=now(), worker_id=p_worker_id, updated_at=now(),
      last_error=case when d.status='sending' then 'Sending lease expired; reclaimed by worker.' else null end
  from candidate c where d.id=c.id returning d.*;
end;
$$;
