-- Agba V1 daily briefing persistence

create type public.agba_briefing_audience as enum ('ceo', 'department_head');

create table if not exists public.agba_briefings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  department_id uuid references public.agba_departments(id) on delete set null,
  audience public.agba_briefing_audience not null,
  briefing_date date not null,
  title text not null default 'Daily Briefing',
  summary text,
  status text not null default 'draft' check (status in ('draft', 'validated', 'delivered', 'failed')),
  generated_at timestamptz not null default now(),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, department_id, audience, briefing_date)
);

create table if not exists public.agba_briefing_items (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references public.agba_briefings(id) on delete cascade,
  reasoning_item_id uuid references public.agba_reasoning_items(id) on delete set null,
  type text not null check (type in ('change', 'attention', 'issue', 'money', 'task', 'decision', 'watch', 'context')),
  priority smallint not null default 50 check (priority between 0 and 100),
  title text not null,
  summary text not null,
  why_it_matters text,
  action text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.agba_briefing_evidence (
  id uuid primary key default gen_random_uuid(),
  briefing_item_id uuid not null references public.agba_briefing_items(id) on delete cascade,
  report_id uuid references public.agba_reports(id) on delete set null,
  report_entry_id uuid references public.agba_report_entries(id) on delete set null,
  reasoning_item_id uuid references public.agba_reasoning_items(id) on delete set null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(report_id, report_entry_id, reasoning_item_id) = 1)
);

create index if not exists idx_agba_briefings_org_date
  on public.agba_briefings (organization_id, briefing_date desc);

create index if not exists idx_agba_briefing_items_briefing_priority
  on public.agba_briefing_items (briefing_id, priority desc, position);

create index if not exists idx_agba_briefing_evidence_item
  on public.agba_briefing_evidence (briefing_item_id);
