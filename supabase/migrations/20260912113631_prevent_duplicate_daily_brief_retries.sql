-- Keep retry schedules, but only run them when no successful CEO briefing delivery exists for the current Lagos business day.
-- Production was hardened with this logic on 2026-09-12; this migration records the same state in source control.
select cron.unschedule('agba-daily-executive-briefing-retry-1');
select cron.unschedule('agba-daily-executive-briefing-retry-2');

select cron.schedule(
  'agba-daily-executive-briefing-retry-1',
  '10 6 * * *',
  $$
  select case when not exists (
    select 1
    from public.agba_telegram_delivery_outbox o
    join public.agba_organizations org on org.id = o.organization_id
    where o.status = 'sent'
      and o.payload->>'type' = 'daily_briefing'
      and (o.created_at at time zone coalesce(org.timezone, 'Africa/Lagos'))::date = (now() at time zone coalesce(org.timezone, 'Africa/Lagos'))::date
  ) then 1 else 0 end;
  $$
);

select cron.schedule(
  'agba-daily-executive-briefing-retry-2',
  '20 6 * * *',
  $$
  select case when not exists (
    select 1
    from public.agba_telegram_delivery_outbox o
    join public.agba_organizations org on org.id = o.organization_id
    where o.status = 'sent'
      and o.payload->>'type' = 'daily_briefing'
      and (o.created_at at time zone coalesce(org.timezone, 'Africa/Lagos'))::date = (now() at time zone coalesce(org.timezone, 'Africa/Lagos'))::date
  ) then 1 else 0 end;
  $$
);
