-- Agba's Office V1 persistence

create type public.agba_office_widget_type as enum (
  'opening_note',
  'attention',
  'change',
  'money',
  'department',
  'decision',
  'ask_agba'
);

create table if not exists public.agba_office_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.agba_organizations(id) on delete cascade,
  department_id uuid references public.agba_departments(id) on delete set null,
  audience public.agba_briefing_audience not null,
  snapshot_date date not null,
  title text not null default 'Agba''s Office',
  opening_note text,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, department_id, audience, snapshot_date)
);

create table if not exists public.agba_office_widgets (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.agba_office_snapshots(id) on delete cascade,
  type public.agba_office_widget_type not null,
  title text not null,
  content jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_agba_office_snapshots_org_date
  on public.agba_office_snapshots (organization_id, snapshot_date desc);

create index if not exists idx_agba_office_widgets_snapshot_position
  on public.agba_office_widgets (snapshot_id, position);
