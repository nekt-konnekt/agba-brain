-- Fixes a pre-existing schema mismatch: telegram-gateway selects
-- agba_telegram_bindings.role_code, but no migration ever added that
-- column (or telegram_user_id, also referenced in the insert path).
-- Every binding lookup was failing at the database level before this.
alter table public.agba_telegram_bindings
  add column if not exists role_code text,
  add column if not exists telegram_user_id text;

-- Adds the invitations table that telegram-gateway has always read
-- from and updated (token validation, expiry, used_at) but that no
-- prior migration created. Without this table, no CEO or department
-- head could ever complete the Telegram connection step.
create table if not exists public.agba_telegram_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  role_code text not null check (role_code in ('ceo', 'department_head')),
  token_hash text not null unique,
  created_by uuid not null references public.agba_users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_agba_telegram_invitations_org on public.agba_telegram_invitations(organization_id);
create index if not exists idx_agba_telegram_invitations_token_hash on public.agba_telegram_invitations(token_hash);
alter table public.agba_telegram_invitations enable row level security;
