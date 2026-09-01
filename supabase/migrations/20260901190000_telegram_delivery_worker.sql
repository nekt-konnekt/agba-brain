-- Durable Telegram delivery worker. It consumes agba_telegram_delivery_outbox
-- independently from inbound processing so Telegram send failures are retryable.

select cron.schedule(
  'agba-telegram-delivery-worker',
  '10 seconds',
  $$
    select net.http_post(
      url := 'https://iijhsdaqaqywzpavdonn.supabase.co/functions/v1/telegram-delivery-worker',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'secret',
        (select decrypted_secret from vault.decrypted_secrets where name = 'agba_telegram_worker_secret')
      ),
      timeout_milliseconds := 5000
    ) as request_id;
  $$
);
