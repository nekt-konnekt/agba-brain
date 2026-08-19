alter table public.agba_telegram_bindings
  add column if not exists role_code public.agba_role_code not null default 'ceo';

create index if not exists agba_telegram_bindings_org_role_idx
  on public.agba_telegram_bindings(organization_id, role_code);

-- Existing invitation role_code is already the source of truth for the role granted by a link.
