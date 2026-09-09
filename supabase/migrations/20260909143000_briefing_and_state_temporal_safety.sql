-- Prevent repeated briefing regeneration/retry from accumulating duplicate items.
create or replace function public.agba_dedupe_briefing_item()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.agba_briefing_items
  where briefing_id = new.briefing_id
    and title = new.title
    and id <> new.id;
  return new;
end;
$$;

drop trigger if exists trg_agba_dedupe_briefing_item on public.agba_briefing_items;
create trigger trg_agba_dedupe_briefing_item
after insert on public.agba_briefing_items
for each row execute function public.agba_dedupe_briefing_item();

-- Safety net for relative-date language produced from historical reports.
-- Preserve raw evidence; only normalize derived state summaries when the
-- source report is older than the current Lagos date.
create or replace function public.agba_temporalize_state_summary()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  report_date date;
  today_date date := (now() at time zone 'Africa/Lagos')::date;
  replacement_today text;
  replacement_yesterday text;
begin
  if new.source_report_id is null or new.summary is null then
    return new;
  end if;

  select r.report_date into report_date
  from public.agba_reports r
  where r.id = new.source_report_id;

  if report_date is null or report_date >= today_date then
    return new;
  end if;

  replacement_today := 'on ' || to_char(report_date, 'YYYY-MM-DD');
  replacement_yesterday := 'the day before the ' || to_char(report_date, 'YYYY-MM-DD') || ' report';

  new.summary := regexp_replace(new.summary, '\\btoday\\b', replacement_today, 'gi');
  new.summary := regexp_replace(new.summary, '\\byesterday\\b', replacement_yesterday, 'gi');
  new.metadata := jsonb_set(
    coalesce(new.metadata, '{}'::jsonb),
    '{temporal_grounding}',
    jsonb_build_object(
      'source_report_date', report_date,
      'event_time_basis', 'source_report_date',
      'current_date_safe', false
    ),
    true
  );
  return new;
end;
$$;

drop trigger if exists trg_agba_temporalize_state_summary on public.agba_state_items;
create trigger trg_agba_temporalize_state_summary
before insert or update of summary,source_report_id on public.agba_state_items
for each row execute function public.agba_temporalize_state_summary();

-- Re-run the temporal safety transform over existing report-backed state.
update public.agba_state_items s
set summary = regexp_replace(
  regexp_replace(s.summary, '\\btoday\\b', 'on ' || to_char(r.report_date, 'YYYY-MM-DD'), 'gi'),
  '\\byesterday\\b',
  'the day before the ' || to_char(r.report_date, 'YYYY-MM-DD') || ' report',
  'gi'
),
metadata = jsonb_set(coalesce(s.metadata,'{}'::jsonb), '{temporal_grounding}', jsonb_build_object('source_report_date',r.report_date,'event_time_basis','source_report_date','current_date_safe',false), true)
from public.agba_reports r
where s.source_report_id = r.id
  and r.report_date < (now() at time zone 'Africa/Lagos')::date
  and (s.summary ~* '\\btoday\\b' or s.summary ~* '\\byesterday\\b');
