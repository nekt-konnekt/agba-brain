create or replace function public.agba_refresh_briefing_summary()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid := coalesce(new.briefing_id, old.briefing_id); v_issues integer:=0; v_overdue integer:=0; v_decisions integer:=0; v_attention integer:=0; v_summary text;
begin
 if v_id is null then return coalesce(new,old); end if;
 select count(*) into v_attention from (select lower(regexp_replace(title,'^(Overdue action:|Overdue:)[[:space:]]*','','i')) k from public.agba_briefing_items where briefing_id=v_id and type in ('issue','attention','task','decision','watch') and title !~* 'TELEGRAM-CONNECTOR-E2E-' group by 1) q;
 select count(*) into v_issues from public.agba_briefing_items where briefing_id=v_id and type='issue' and title !~* 'TELEGRAM-CONNECTOR-E2E-';
 select count(*) into v_overdue from (select lower(regexp_replace(title,'^(Overdue action:|Overdue:)[[:space:]]*','','i')) k from public.agba_briefing_items where briefing_id=v_id and type in ('issue','attention','task') and (title ~* 'overdue' or content ~* 'overdue') and title !~* 'TELEGRAM-CONNECTOR-E2E-' group by 1) q;
 select count(*) into v_decisions from public.agba_briefing_items where briefing_id=v_id and type='decision' and title !~* 'TELEGRAM-CONNECTOR-E2E-';
 select case when v_attention=0 then 'Nothing currently requires your intervention. Agba is monitoring the business for material risks, decisions, and changes.' else format('%s business issue%s require your attention. %s critical/high risk%s, %s overdue commitment%s, and %s pending decision%s are currently recorded.',v_attention,case when v_attention=1 then '' else 's' end,v_issues,case when v_issues=1 then '' else 's' end,v_overdue,case when v_overdue=1 then '' else 's' end,v_decisions,case when v_decisions=1 then '' else 's' end) end into v_summary;
 update public.agba_briefings set summary=v_summary where id=v_id; return coalesce(new,old);
end; $$;
drop trigger if exists trg_agba_refresh_briefing_summary on public.agba_briefing_items;
create trigger trg_agba_refresh_briefing_summary after insert or update or delete on public.agba_briefing_items for each row execute function public.agba_refresh_briefing_summary();

create or replace function public.agba_render_daily_briefing_telegram()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_briefing_id uuid; v_summary text; v_text text:='🧠 Agba — Morning Brief'; v_section text:=''; v_key text; r record; seen_keys text[]:='{}';
begin
 if coalesce(new.payload->>'type','')<>'daily_briefing' then return new; end if; v_briefing_id:=nullif(new.payload->>'briefing_id','')::uuid; if v_briefing_id is null then return new; end if;
 select summary into v_summary from public.agba_briefings where id=v_briefing_id; if v_summary is not null then v_text:=v_text||E'\n\n'||v_summary; end if;
 for r in select type,title,content,priority from public.agba_briefing_items where briefing_id=v_briefing_id and title !~* 'TELEGRAM-CONNECTOR-E2E-' and content !~* 'TELEGRAM-CONNECTOR-E2E-' order by priority asc,created_at asc loop
  v_key:=lower(regexp_replace(coalesce(r.title,''),'^(Overdue action:|Overdue:)[[:space:]]*','','i')); if v_key=any(seen_keys) then continue; end if; seen_keys:=array_append(seen_keys,v_key);
  if r.type='change' then if v_section<>'change' then v_text:=v_text||E'\n\n🟢 WHAT CHANGED'; v_section:='change'; end if; v_text:=v_text||E'\n\n• '||r.title||E'\n'||r.content;
  elsif r.type='issue' then if v_section<>'issue' then v_text:=v_text||E'\n\n🔴 NEEDS YOUR ATTENTION'; v_section:='issue'; end if; v_text:=v_text||E'\n\n• '||r.title||E'\n'||r.content;
  elsif r.type='attention' then if v_section<>'attention' then v_text:=v_text||E'\n\n🧠 AGBA RECOMMENDS'; v_section:='attention'; end if; v_text:=v_text||E'\n\n• '||r.title||E'\n'||r.content;
  elsif r.type='task' then if v_section<>'task' then v_text:=v_text||E'\n\n⏰ TASKS & COMMITMENTS'; v_section:='task'; end if; v_text:=v_text||E'\n\n• '||regexp_replace(r.title,'^(Overdue action:|Overdue:)[[:space:]]*','','i')||E'\n'||r.content||E'\nAgba recommends resolving this commitment today.';
  elsif r.type='decision' then if v_section<>'decision' then v_text:=v_text||E'\n\n🟡 DECISION NEEDED'; v_section:='decision'; end if; v_text:=v_text||E'\n\n• '||r.title||E'\n'||r.content;
  elsif r.type='watch' then if v_section<>'watch' then v_text:=v_text||E'\n\n👀 WATCH LIST'; v_section:='watch'; end if; v_text:=v_text||E'\n\n• '||r.title||E'\n'||r.content; end if;
 end loop;
 new.payload:=jsonb_set(new.payload,'{text}',to_jsonb(left(v_text,12000)),true); return new;
exception when others then return new; end; $$;
drop trigger if exists trg_agba_render_daily_briefing_telegram on public.agba_telegram_delivery_outbox;
create trigger trg_agba_render_daily_briefing_telegram before insert on public.agba_telegram_delivery_outbox for each row execute function public.agba_render_daily_briefing_telegram();
