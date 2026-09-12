-- Keep retry schedules, but only invoke daily-briefing when no successful CEO delivery exists for the current Lagos business day.
select cron.unschedule('agba-daily-executive-briefing-retry-1');
select cron.unschedule('agba-daily-executive-briefing-retry-2');

select cron.schedule(
  'agba-daily-executive-briefing-retry-1',
  '10 6 * * *',
  $$
    select net.http_post(
      url := 'https://iijhsdaqaqywzpavdonn.supabase.co/functions/v1/daily-briefing',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object(
        'organization_id', b.organization_id,
        'briefing_date', (now() at time zone 'Africa/Lagos')::date,
        'deliver', true,
        'secret', (select decrypted_secret from vault.decrypted_secrets where name = 'agba_telegram_worker_secret')
      ),
      timeout_milliseconds := 10000
    )
    from (select distinct organization_id from public.agba_telegram_bindings where role_code = 'ceo') b
    where not exists (
      select 1 from public.agba_telegram_delivery_outbox o
      where o.organization_id = b.organization_id
        and o.status = 'sent'
        and o.created_at >= ((now() at time zone 'Africa/Lagos')::date::timestamp at time zone 'Africa/Lagos')
        and o.created_at < (((now() at time zone 'Africa/Lagos')::date + 1)::timestamp at time zone 'Africa/Lagos')
    );
  $$
);

select cron.schedule(
  'agba-daily-executive-briefing-retry-2',
  '20 6 * * *',
  $$
    select net.http_post(
      url := 'https://iijhsdaqaqywzpavdonn.supabase.co/functions/v1/daily-briefing',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object(
        'organization_id', b.organization_id,
        'briefing_date', (now() at time zone 'Africa/Lagos')::date,
        'deliver', true,
        'secret', (select decrypted_secret from vault.decrypted_secrets where name = 'agba_telegram_worker_secret')
      ),
      timeout_milliseconds := 10000
    )
    from (select distinct organization_id from public.agba_telegram_bindings where role_code = 'ceo') b
    where not exists (
      select 1 from public.agba_telegram_delivery_outbox o
      where o.organization_id = b.organization_id
        and o.status = 'sent'
        and o.created_at >= ((now() at time zone 'Africa/Lagos')::date::timestamp at time zone 'Africa/Lagos')
        and o.created_at < (((now() at time zone 'Africa/Lagos')::date + 1)::timestamp at time zone 'Africa/Lagos')
    );
  $$
);
