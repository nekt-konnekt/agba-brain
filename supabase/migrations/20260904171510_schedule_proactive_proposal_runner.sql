select cron.schedule(
  'agba-proactive-proposal-runner',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := 'https://iijhsdaqaqywzpavdonn.supabase.co/functions/v1/proactive-runner',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-agba-worker-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'agba_telegram_worker_secret')
      ),
      body := jsonb_build_object('organization_id', b.organization_id, 'limit', 25),
      timeout_milliseconds := 10000
    ) as request_id
    from (select distinct organization_id from public.agba_telegram_bindings where role_code = 'ceo') b;
  $$
);
