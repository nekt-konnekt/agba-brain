create or replace function public.agba_refresh_briefing_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid := coalesce(new.briefing_id, old.briefing_id);
  v_attention integer := 0;
  v_overdue integer := 0;
  v_decisions integer := 0;
  v_risks integer := 0;
  v_summary text;
begin
  if v_id is null then return coalesce(new, old); end if;

  select count(*) into v_attention
  from (
    select lower(regexp_replace(title,'^(Overdue action:|Overdue:)[[:space:]]*','','i')) k
    from public.agba_briefing_items
    where briefing_id=v_id
      and type in ('issue','attention','task','decision','watch')
      and title !~* 'TELEGRAM-CONNECTOR-E2E-'
    group by 1
  ) q;

  select count(*) into v_overdue
  from (
    select lower(regexp_replace(title,'^(Overdue action:|Overdue:)[[:space:]]*','','i')) k
    from public.agba_briefing_items
    where briefing_id=v_id
      and type in ('issue','attention','task')
      and (title ~* 'overdue' or content ~* 'overdue')
      and title !~* 'TELEGRAM-CONNECTOR-E2E-'
    group by 1
  ) q;

  select count(*) into v_decisions
  from public.agba_briefing_items
  where briefing_id=v_id and type='decision' and title !~* 'TELEGRAM-CONNECTOR-E2E-';

  select count(*) into v_risks
  from public.agba_briefing_items
  where briefing_id=v_id and type='issue' and title !~* 'TELEGRAM-CONNECTOR-E2E-';

  v_summary := case
    when v_attention=0 then 'Nothing currently requires your intervention. Agba is monitoring the business for material risks, decisions, and changes.'
    else format('%s item%s require your attention. %s overdue commitment%s, %s pending decision%s, and %s material issue%s are currently recorded.',
      v_attention, case when v_attention=1 then '' else 's' end,
      v_overdue, case when v_overdue=1 then '' else 's' end,
      v_decisions, case when v_decisions=1 then '' else 's' end,
      v_risks, case when v_risks=1 then '' else 's' end)
  end;

  update public.agba_briefings set summary=v_summary where id=v_id;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.agba_refresh_briefing_summary() from anon, authenticated;
