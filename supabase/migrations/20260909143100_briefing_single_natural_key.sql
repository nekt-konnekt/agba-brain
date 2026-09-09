-- The briefing writer uses a nullable department_id in its natural key.
-- Replace the prior row before each insert so retries cannot create multiple
-- CEO briefings for the same organization/date.
create or replace function public.agba_replace_duplicate_briefing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.agba_briefings b
  where b.organization_id = new.organization_id
    and b.audience = new.audience
    and b.briefing_date = new.briefing_date
    and b.department_id is not distinct from new.department_id;
  return new;
end;
$$;

drop trigger if exists trg_agba_replace_duplicate_briefing on public.agba_briefings;
create trigger trg_agba_replace_duplicate_briefing
before insert on public.agba_briefings
for each row execute function public.agba_replace_duplicate_briefing();

-- Keep the newest existing briefing for each natural key and remove stale
-- duplicates created before the trigger existed.
delete from public.agba_briefings b
using public.agba_briefings newer
where b.organization_id = newer.organization_id
  and b.audience = newer.audience
  and b.briefing_date = newer.briefing_date
  and b.department_id is not distinct from newer.department_id
  and b.created_at < newer.created_at;
