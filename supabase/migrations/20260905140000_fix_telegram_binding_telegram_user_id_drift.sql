-- Production drift fix: telegram-gateway stores the Telegram user id
-- when completing an invitation, but production was missing this column.
-- Keep the migration idempotent so it is safe to apply across environments.
alter table public.agba_telegram_bindings
  add column if not exists telegram_user_id text;
