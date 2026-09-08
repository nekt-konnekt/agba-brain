-- Make the daily Telegram briefing read like an Executive Director update rather than a database dump.
-- Presentation only: this does not mutate actions, decisions, reports, or business state.

create or replace function public.agba_render_daily_briefing_telegram()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_briefing_id uuid;
  v_text text := '🧠 AGBA — MORNING BRIEF';
  v_attention text := '';
  v_changes text := '';
  v_today text := '';
  v_watch text := '';
  v_material_count integer := 0;
  v_change_count integer := 0;
  v_seen text[] := array[]::text[];
  v_content text;
  v_key text;
  r record;
begin
  if coalesce(new.payload->>'type','') <> 'daily_briefing' then return new; end if;
  v_briefing_id := nullif(new.payload->>'briefing_id','')::uuid;
  if v_briefing_id is null then return new; end if;

  -- CEO-material attention: issues, decisions, and overdue/material commitments.
  for r in
    select type,title,content,priority,created_at
    from public.agba_briefing_items
    where briefing_id = v_briefing_id
      and type in ('issue','decision','attention','task')
    order by
      case type when 'issue' then 1 when 'decision' then 2 when 'attention' then 3 else 4 end,
      priority asc,
      created_at asc
  loop
    v_key := lower(regexp_replace(coalesce(r.title,''), '[^a-z0-9]+', ' ', 'g'));
    -- Attention and task rows can describe the same underlying commitment. Say it once.
    if v_key = any(v_seen) then continue; end if;
    v_seen := array_append(v_seen, v_key);

    v_content := coalesce(r.content,'');
    v_content := regexp_replace(v_content,
      '([0-9]{4})-([0-9]{2})-([0-9]{2})T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})?',
      '\3/\2/\1', 'g');

    v_material_count := v_material_count + 1;
    v_attention := v_attention || E'\n\n' || v_material_count || '. ' || r.title;
    if btrim(v_content) <> '' then v_attention := v_attention || E'\n' || v_content; end if;
  end loop;

  if v_material_count = 0 then
    v_text := v_text || E'\n\nGood morning. No material issue currently requires your attention.';
  elsif v_material_count = 1 then
    v_text := v_text || E'\n\nGood morning. One item needs executive attention today.';
  else
    v_text := v_text || E'\n\nGood morning. ' || v_material_count || ' items need executive attention today.';
  end if;

  if v_attention <> '' then
    v_text := v_text || E'\n\n🔴 WHAT NEEDS YOUR ATTENTION' || v_attention;
  end if;

  -- Only business changes belong here. Infrastructure test telemetry is intentionally excluded.
  for r in
    select title,content,priority,created_at
    from public.agba_briefing_items
    where briefing_id = v_briefing_id
      and type = 'change'
      and coalesce(title,'') !~* '^Action outcome:\s*TELEGRAM-CONNECTOR-E2E-'
      and (coalesce(title,'') || ' ' || coalesce(content,'')) !~* 'TELEGRAM-CONNECTOR-E2E-'
    order by priority asc,created_at asc
  loop
    v_change_count := v_change_count + 1;
    v_content := coalesce(r.content,'');
    v_content := regexp_replace(v_content,
      '([0-9]{4})-([0-9]{2})-([0-9]{2})T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})?',
      '\3/\2/\1', 'g');
    v_changes := v_changes || E'\n\n• ' || r.title;
    if btrim(v_content) <> '' then v_changes := v_changes || E'\n' || v_content; end if;
  end loop;
  if v_changes <> '' then v_text := v_text || E'\n\n🟢 WHAT CHANGED' || v_changes; end if;

  -- A compact execution list. Do not repeat items already promoted into executive attention.
  v_seen := array[]::text[];
  for r in
    select title,content,priority,created_at
    from public.agba_briefing_items
    where briefing_id = v_briefing_id and type = 'task'
    order by priority asc,created_at asc
  loop
    v_key := lower(regexp_replace(coalesce(r.title,''), '[^a-z0-9]+', ' ', 'g'));
    if v_key = any(v_seen) then continue; end if;
    v_seen := array_append(v_seen, v_key);
    v_content := coalesce(r.content,'');
    v_content := regexp_replace(v_content,
      '([0-9]{4})-([0-9]{2})-([0-9]{2})T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})?',
      '\3/\2/\1', 'g');
    v_today := v_today || E'\n\n• ' || r.title;
    if btrim(v_content) <> '' then v_today := v_today || E'\n' || v_content; end if;
  end loop;
  if v_today <> '' then v_text := v_text || E'\n\n📌 TODAY' || v_today; end if;

  -- Watch items stay separate from CEO attention and business changes.
  for r in
    select title,content,priority,created_at
    from public.agba_briefing_items
    where briefing_id = v_briefing_id and type = 'watch'
    order by priority asc,created_at asc
  loop
    v_content := coalesce(r.content,'');
    v_content := regexp_replace(v_content,
      '([0-9]{4})-([0-9]{2})-([0-9]{2})T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})?',
      '\3/\2/\1', 'g');
    v_watch := v_watch || E'\n\n• ' || regexp_replace(r.title, 'TELEGRAM-CONNECTOR-E2E-[0-9a-f-]+', 'Telegram connector', 'gi');
    if btrim(v_content) <> '' then
      v_watch := v_watch || E'\n' || regexp_replace(v_content, 'TELEGRAM-CONNECTOR-E2E-[0-9a-f-]+', 'Telegram connector', 'gi');
    end if;
  end loop;
  if v_watch <> '' then v_text := v_text || E'\n\n👀 WATCH' || v_watch; end if;

  if v_material_count > 0 then
    v_text := v_text || E'\n\nBottom line: resolve the items above first; Agba will keep the rest of the operating picture under watch.';
  else
    v_text := v_text || E'\n\nBottom line: operations are stable from the evidence currently available; Agba will keep monitoring for material change.';
  end if;

  new.payload := jsonb_set(new.payload,'{text}',to_jsonb(left(v_text,12000)),true);
  return new;
exception when others then
  return new;
end;
$$;
