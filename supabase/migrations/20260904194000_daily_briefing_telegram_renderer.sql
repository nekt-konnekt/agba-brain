-- Render validated daily briefings into a concise CEO conversation before Telegram delivery.
-- Presentation only: no action mutation or execution happens here.

create or replace function public.agba_render_daily_briefing_telegram()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_briefing_id uuid;
  v_summary text;
  v_text text := '🧠 Agba — Morning Brief';
  v_section text := '';
  r record;
begin
  if coalesce(new.payload->>'type','') <> 'daily_briefing' then return new; end if;
  v_briefing_id := nullif(new.payload->>'briefing_id','')::uuid;
  if v_briefing_id is null then return new; end if;

  select summary into v_summary from public.agba_briefings where id = v_briefing_id;
  if v_summary is not null then v_text := v_text || E'\n\n' || v_summary; end if;

  for r in
    select type,title,content,priority
    from public.agba_briefing_items
    where briefing_id = v_briefing_id
    order by priority asc,created_at asc
  loop
    if r.type = 'change' then
      if v_section <> 'change' then v_text := v_text || E'\n\n🟢 WHAT CHANGED'; v_section := 'change'; end if;
      v_text := v_text || E'\n\n• ' || r.title || E'\n' || r.content;
    elsif r.type = 'issue' then
      if v_section <> 'issue' then v_text := v_text || E'\n\n🔴 NEEDS YOUR ATTENTION'; v_section := 'issue'; end if;
      v_text := v_text || E'\n\n• ' || r.title || E'\n' || r.content;
    elsif r.type = 'attention' then
      if v_section <> 'attention' then v_text := v_text || E'\n\n🧠 AGBA RECOMMENDS'; v_section := 'attention'; end if;
      v_text := v_text || E'\n\n• ' || r.title || E'\n' || r.content;
    elsif r.type = 'task' then
      if v_section <> 'task' then v_text := v_text || E'\n\n⏰ TASKS & COMMITMENTS'; v_section := 'task'; end if;
      v_text := v_text || E'\n\n• ' || r.title || E'\n' || r.content || E'\nAgba recommends resolving this commitment today.';
    elsif r.type = 'decision' then
      if v_section <> 'decision' then v_text := v_text || E'\n\n🟡 DECISION NEEDED'; v_section := 'decision'; end if;
      v_text := v_text || E'\n\n• ' || r.title || E'\n' || r.content;
    elsif r.type = 'watch' then
      if v_section <> 'watch' then v_text := v_text || E'\n\n👀 WATCH LIST'; v_section := 'watch'; end if;
      v_text := v_text || E'\n\n• ' || r.title || E'\n' || r.content;
    end if;
  end loop;

  new.payload := jsonb_set(new.payload,'{text}',to_jsonb(left(v_text,12000)),true);
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_agba_render_daily_briefing_telegram on public.agba_telegram_delivery_outbox;
create trigger trg_agba_render_daily_briefing_telegram
before insert on public.agba_telegram_delivery_outbox
for each row execute function public.agba_render_daily_briefing_telegram();
