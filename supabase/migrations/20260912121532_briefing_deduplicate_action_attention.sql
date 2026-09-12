create or replace function public.agba_remove_briefing_action_attention()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'attention' and coalesce(new.title,'') <> '' then
    delete from public.agba_briefing_items bi
    where bi.id = new.id
      and exists (
        select 1
        from public.agba_briefings b
        join public.agba_actions a on a.organization_id = b.organization_id
        where b.id = new.briefing_id
          and a.status in ('open','in_progress')
          and a.deadline is not null
          and a.deadline < now()
          and regexp_replace(lower(new.title), '^overdue action:[[:space:]]*', '')
              = regexp_replace(lower(a.description), '^overdue action:[[:space:]]*', '')
      );
  end if;
  return new;
end;
$$;

revoke execute on function public.agba_remove_briefing_action_attention() from anon, authenticated;
drop trigger if exists trg_agba_remove_briefing_action_attention on public.agba_briefing_items;
create trigger trg_agba_remove_briefing_action_attention
after insert on public.agba_briefing_items
for each row execute function public.agba_remove_briefing_action_attention();
