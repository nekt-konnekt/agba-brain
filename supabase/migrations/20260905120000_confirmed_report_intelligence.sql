create table if not exists public.agba_intelligence_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  report_id uuid not null references public.agba_reports(id) on delete cascade,
  job_type text not null default 'confirmed_report_intelligence',
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  attempts integer not null default 0,
  locked_at timestamptz,
  available_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, report_id, job_type)
);
create index if not exists idx_agba_intelligence_jobs_claim on public.agba_intelligence_jobs(status, available_at, created_at);
create index if not exists idx_agba_intelligence_jobs_org on public.agba_intelligence_jobs(organization_id, created_at desc);
create or replace function public.enqueue_confirmed_report_intelligence() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.confirmation_status='confirmed' and (tg_op='INSERT' or old.confirmation_status is distinct from 'confirmed') then
    insert into public.agba_intelligence_jobs(organization_id,report_id,job_type) values(new.organization_id,new.id,'confirmed_report_intelligence') on conflict(organization_id,report_id,job_type) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_enqueue_confirmed_report_intelligence on public.agba_reports;
create trigger trg_enqueue_confirmed_report_intelligence after insert or update of confirmation_status on public.agba_reports for each row execute function public.enqueue_confirmed_report_intelligence();
revoke all on public.agba_intelligence_jobs from anon,authenticated;
grant select on public.agba_intelligence_jobs to authenticated;
alter table public.agba_intelligence_jobs enable row level security;
drop policy if exists "Users can read own organization intelligence jobs" on public.agba_intelligence_jobs;
create policy "Users can read own organization intelligence jobs" on public.agba_intelligence_jobs for select to authenticated using (exists(select 1 from public.agba_users u where u.auth_user_id=auth.uid() and u.organization_id=agba_intelligence_jobs.organization_id and u.active=true));

create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin if exists(select 1 from cron.job where jobname='agba-confirmed-report-intelligence') then perform cron.unschedule('agba-confirmed-report-intelligence'); end if; exception when undefined_table then null; end $$;
select cron.schedule('agba-confirmed-report-intelligence','* * * * *', $$select net.http_post(url:='https://iijhsdaqaqywzpavdonn.supabase.co/functions/v1/intelligence-worker',headers:=jsonb_build_object('Content-Type','application/json','x-agba-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='agba_telegram_worker_secret')),body:=jsonb_build_object('limit',5),timeout_milliseconds:=50000);$$);
