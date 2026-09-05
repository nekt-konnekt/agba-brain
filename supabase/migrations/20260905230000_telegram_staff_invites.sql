-- Staff Telegram invitations need to target a specific Agba user and department.
-- CEO invitations remain compatible because these columns are nullable.
alter table public.agba_telegram_invitations
  add column if not exists target_agba_user_id uuid references public.agba_users(id) on delete cascade,
  add column if not exists target_department_id uuid references public.agba_departments(id) on delete set null;

create index if not exists idx_agba_telegram_invitations_target_user
  on public.agba_telegram_invitations(target_agba_user_id);

create index if not exists idx_agba_telegram_invitations_target_department
  on public.agba_telegram_invitations(target_department_id);
