-- Durable Telegram delivery pipeline.
-- Telegram webhook ingestion must be fast. The worker handles gateway/AI work asynchronously.

alter table public.agba_telegram_update_inbox
  add column if not exists locked_at timestamptz;

create index if not exists idx_agba_telegram_update_inbox_queue
  on public.agba_telegram_update_inbox(status, received_at);

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- A random internal credential lets pg_cron invoke the worker without exposing
-- the Supabase service key or the Telegram webhook secret.
do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'agba_telegram_worker_secret'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'agba_telegram_worker_secret',
      'Internal credential for the Agba Telegram queue worker'
    );
  end if;
end $$;

select cron.schedule(
  'agba-telegram-worker',
  '10 seconds',
  $$
    select net.http_post(
      url := 'https://iijhsdaqaqywzpavdonn.supabase.co/functions/v1/telegram-worker',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'agba_telegram_worker_secret')
      ),
      timeout_milliseconds := 5000
    ) as request_id;
  $$
);
