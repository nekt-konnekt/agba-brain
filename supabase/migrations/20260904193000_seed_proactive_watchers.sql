-- Seed the first durable proactive watchers for every organization.
-- Watchers produce proposals; they do not execute actions.

insert into public.agba_proactive_watchers (organization_id,key,name,description,enabled,interval_seconds,next_run_at)
select id,
  'overdue_actions',
  'Overdue actions',
  'Detect open actions past their deadline and create an executive proposal.',
  true,
  300,
  now()
from public.agba_organizations
on conflict (organization_id,key) do update set
  name = excluded.name,
  description = excluded.description,
  enabled = excluded.enabled,
  interval_seconds = excluded.interval_seconds;

insert into public.agba_proactive_watchers (organization_id,key,name,description,enabled,interval_seconds,next_run_at)
select id,
  'unresolved_risks',
  'Unresolved risks',
  'Detect active high/critical company risks and create an executive proposal.',
  true,
  300,
  now()
from public.agba_organizations
on conflict (organization_id,key) do update set
  name = excluded.name,
  description = excluded.description,
  enabled = excluded.enabled,
  interval_seconds = excluded.interval_seconds;
