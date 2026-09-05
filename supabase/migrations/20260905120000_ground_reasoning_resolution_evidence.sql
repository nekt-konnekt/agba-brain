alter table public.agba_reasoning_items add column if not exists resolution_status text not null default 'unresolved' check (resolution_status in ('unresolved','resolved','not_applicable'));
alter table public.agba_reasoning_items add column if not exists resolution_reason text;
create index if not exists idx_agba_reasoning_items_resolution on public.agba_reasoning_items(organization_id,resolution_status,created_at desc);
