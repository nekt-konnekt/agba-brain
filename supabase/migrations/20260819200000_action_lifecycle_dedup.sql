-- Keep one open/in-progress action per organization and normalized description.
-- The oldest row wins so existing evidence links remain attached to a canonical action.
with ranked as (
  select id,
         row_number() over (
           partition by organization_id, lower(trim(description))
           order by created_at asc, id asc
         ) as rn
  from public.agba_actions
  where status in ('open','in_progress')
)
delete from public.agba_actions a
using ranked r
where a.id = r.id
  and r.rn > 1;

create unique index if not exists idx_agba_actions_open_description
on public.agba_actions (organization_id, lower(trim(description)))
where status in ('open','in_progress');

create index if not exists idx_agba_actions_org_owner_status
on public.agba_actions (organization_id, owner_name, status, deadline);
