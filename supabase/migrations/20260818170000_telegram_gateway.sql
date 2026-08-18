-- Agba Telegram operator gateway
create table if not exists public.agba_telegram_bindings (
  chat_id bigint primary key,
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  agba_user_id uuid not null references public.agba_users(id) on delete cascade,
  telegram_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agba_telegram_bindings_org on public.agba_telegram_bindings(organization_id);
alter table public.agba_telegram_bindings enable row level security;

create or replace function agba_private.touch_telegram_binding()
returns trigger language plpgsql set search_path = public, pg_catalog
as $$ begin new.updated_at = now(); return new; end; $$;

drop trigger if exists touch_telegram_binding on public.agba_telegram_bindings;
create trigger touch_telegram_binding before update on public.agba_telegram_bindings
for each row execute function agba_private.touch_telegram_binding();
revoke all on function agba_private.touch_telegram_binding() from public, anon, authenticated;
