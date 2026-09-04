-- Generate the CEO briefing every morning and enqueue it for Telegram delivery.
-- The function validates the internal worker secret before using service-role access.
select cron.schedule(
  'agba-daily-executive-briefing',
  '0 6 * * *',
  $$
    select net.http_post(
      url := 'https://iijhsdaqaqywzpavdonn.supabase.co/functions/v1/daily-briefing',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'organization_id', b.organization_id,
        'briefing_date', (now() at time zone 'Africa/Lagos')::date,
        'deliver', true,
        'secret', (select decrypted_secret from vault.decrypted_secrets where name = 'agba_telegram_worker_secret')
      ),
      timeout_milliseconds := 10000
    ) as request_id
    from (
      select distinct organization_id
      from public.agba_telegram_bindings
      where role_code = 'ceo'
    ) b;
  $$
);
