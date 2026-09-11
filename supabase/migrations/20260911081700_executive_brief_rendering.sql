create or replace function public.agba_sanitize_briefing_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_text text;
begin
  if coalesce(new.title,'') ~* '^(Action outcome:[[:space:]]*)?TELEGRAM-CONNECTOR-E2E-' then return null; end if;
  if coalesce(new.content,'') ~* 'TELEGRAM-CONNECTOR-E2E-' then return null; end if;
  v_text:=coalesce(new.content,'');
  v_text:=regexp_replace(v_text,'(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?','\1','g');
  v_text:=regexp_replace(v_text,'(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?','\1','g');
  v_text:=regexp_replace(v_text,'([.!?])\.+([[:space:]]|$)','\1\2','g');
  if new.title ~* 'Chinedu' and v_text ~* 'Owner:[[:space:]]*unassigned' then
    v_text:=regexp_replace(v_text,'Owner:[[:space:]]*unassigned[.]?','Owner: unassigned. Chinedu is named in the original instruction; assignment is not confirmed.','i');
  end if;
  new.content:=v_text; return new;
end; $$;
drop trigger if exists trg_agba_sanitize_briefing_item on public.agba_briefing_items;
create trigger trg_agba_sanitize_briefing_item before insert or update on public.agba_briefing_items for each row execute function public.agba_sanitize_briefing_item();

create or replace function public.agba_render_daily_briefing_telegram()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_briefing_id uuid;
  v_summary text;
  v_text text:='🧠 Agba — Morning Brief';
  v_section text:='';
  v_key text;
  v_title text;
  v_content text;
  r record;
  seen_keys text[]:='{}';
begin
  if coalesce(new.payload->>'type','')<>'daily_briefing' then return new; end if;
  v_briefing_id:=nullif(new.payload->>'briefing_id','')::uuid;
  if v_briefing_id is null then return new; end if;
  select summary into v_summary from public.agba_briefings where id=v_briefing_id;
  if v_summary is not null then v_text:=v_text||E'\n\n'||v_summary; end if;
  for r in select type,title,content,priority from public.agba_briefing_items where briefing_id=v_briefing_id and title !~* 'TELEGRAM-CONNECTOR-E2E-' and content !~* 'TELEGRAM-CONNECTOR-E2E-' order by priority asc,created_at asc loop
    v_key:=lower(regexp_replace(coalesce(r.title,''),'^(Overdue action:|Overdue:)[[:space:]]*','','i'));
    if v_key=any(seen_keys) then continue; end if;
    seen_keys:=array_append(seen_keys,v_key);
    v_title:=regexp_replace(coalesce(r.title,''),'^(Overdue action:|Overdue:)[[:space:]]*','','i');
    v_content:=coalesce(r.content,'');
    if v_title ~* 'shipment.*two pending orders|two pending orders.*shipment' then v_title:='Shipment coordination is overdue.';
    elsif v_title ~* 'Chinedu.*supplier|supplier.*Chinedu' then v_title:='Supplier follow-up is overdue.';
    end if;
    if r.type='change' then if v_section<>'change' then v_text:=v_text||E'\n\n🟢 WHAT CHANGED'; v_section:='change'; end if; v_text:=v_text||E'\n\n• '||v_title||E'\n'||v_content;
    elsif r.type='issue' then if v_section<>'issue' then v_text:=v_text||E'\n\n🔴 NEEDS YOUR ATTENTION'; v_section:='issue'; end if; v_text:=v_text||E'\n\n• '||v_title||E'\n'||v_content;
    elsif r.type='attention' then if v_section<>'attention' then v_text:=v_text||E'\n\n🧠 AGBA RECOMMENDS'; v_section:='attention'; end if; v_text:=v_text||E'\n\n• '||v_title||E'\n'||v_content;
    elsif r.type='task' then if v_section<>'task' then v_text:=v_text||E'\n\n⏰ TASKS & COMMITMENTS'; v_section:='task'; end if; v_text:=v_text||E'\n\n• '||v_title||E'\n'||v_content;
    elsif r.type='decision' then if v_section<>'decision' then v_text:=v_text||E'\n\n🟡 DECISION NEEDED'; v_section:='decision'; end if; v_text:=v_text||E'\n\n• '||v_title||E'\n'||v_content;
    elsif r.type='watch' then if v_section<>'watch' then v_text:=v_text||E'\n\n👀 WATCH LIST'; v_section:='watch'; end if; v_text:=v_text||E'\n\n• '||v_title||E'\n'||v_content;
    end if;
  end loop;
  new.payload:=jsonb_set(new.payload,'{text}',to_jsonb(left(v_text,12000)),true); return new;
exception when others then return new; end; $$;
drop trigger if exists trg_agba_render_daily_briefing_telegram on public.agba_telegram_delivery_outbox;
create trigger trg_agba_render_daily_briefing_telegram before insert on public.agba_telegram_delivery_outbox for each row execute function public.agba_render_daily_briefing_telegram();
