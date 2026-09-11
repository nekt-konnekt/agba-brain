CREATE OR REPLACE FUNCTION public.agba_render_daily_briefing_telegram()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_briefing_id uuid;
  v_summary text;
  v_text text:='🧠 Agba — Morning Brief';
  v_section text:='';
  v_key text;
  v_title text;
  v_content text;
  v_org_id uuid;
  v_has_change boolean:=false;
  v_has_task boolean:=false;
  v_change_title text;
  v_change_content text;
  v_task_count integer:=0;
  r record;
begin
  if coalesce(new.payload->>'type','')<>'daily_briefing' then return new; end if;
  v_briefing_id:=nullif(new.payload->>'briefing_id','')::uuid;
  if v_briefing_id is null then return new; end if;
  v_org_id:=new.organization_id;

  select summary into v_summary from public.agba_briefings where id=v_briefing_id;
  if v_summary is not null then v_text:=v_text||E'\n\n'||v_summary; end if;

  for r in
    select type,title,content,priority
    from public.agba_briefing_items
    where briefing_id=v_briefing_id
      and title !~* 'TELEGRAM-CONNECTOR-E2E-'
      and content !~* 'TELEGRAM-CONNECTOR-E2E-'
    order by priority asc,created_at asc
  loop
    v_key:=lower(regexp_replace(coalesce(r.title,''),'^(Overdue action:|Overdue:)[[:space:]]*','','i'));
    v_title:=regexp_replace(coalesce(r.title,''),'^(Overdue action:|Overdue:)[[:space:]]*','','i');
    v_content:=coalesce(r.content,'');

    if r.type='change' then
      v_has_change:=true;
      if v_section<>'change' then v_text:=v_text||E'\n\n🟢 WHAT CHANGED'; v_section:='change'; end if;
      v_text:=v_text||E'\n\n• '||v_title||E'\n'||v_content;
    elsif r.type='issue' then
      if v_section<>'issue' then v_text:=v_text||E'\n\n🔴 NEEDS YOUR ATTENTION'; v_section:='issue'; end if;
      v_text:=v_text||E'\n\n• '||v_title||E'\n'||v_content;
    elsif r.type='attention' then
      if v_section<>'attention' then v_text:=v_text||E'\n\n🧠 AGBA RECOMMENDS'; v_section:='attention'; end if;
      v_text:=v_text||E'\n\n• '||v_title||E'\n'||v_content;
    elsif r.type='task' then
      v_has_task:=true;
      if v_section<>'task' then v_text:=v_text||E'\n\n⏰ TASKS & COMMITMENTS'; v_section:='task'; end if;
      v_text:=v_text||E'\n\n• '||v_title||E'\n'||v_content;
    elsif r.type='decision' then
      if v_section<>'decision' then v_text:=v_text||E'\n\n🟡 DECISION NEEDED'; v_section:='decision'; end if;
      v_text:=v_text||E'\n\n• '||v_title||E'\n'||v_content;
    elsif r.type='watch' then
      if v_section<>'watch' then v_text:=v_text||E'\n\n👀 WATCH LIST'; v_section:='watch'; end if;
      v_text:=v_text||E'\n\n• '||v_title||E'\n'||v_content;
    end if;
  end loop;

  /* The renderer never invents facts. If no change item exists, use the latest
     active/monitoring non-risk state as a grounded change signal. */
  if not v_has_change then
    select title, summary into v_change_title, v_change_content
    from public.agba_state_items
    where organization_id=v_org_id
      and status in ('active','monitoring')
      and kind not in ('risk','issue')
    order by coalesce(last_seen_at,updated_at) desc
    limit 1;
    if v_change_title is not null then
      v_text:=v_text||E'\n\n🟢 WHAT CHANGED\n\n• '||v_change_title||E'\n'||coalesce(v_change_content,'');
    end if;
  end if;

  /* Keep routine commitments separate from executive recommendations. */
  if not v_has_task then
    for r in
      select description,owner_name,deadline,status
      from public.agba_actions
      where organization_id=v_org_id
        and status in ('open','in_progress')
        and coalesce((metadata->>'executive_attention')::boolean,false)=false
        and deadline is not null
        and deadline <= now() + interval '1 day'
      order by deadline asc
      limit 2
    loop
      v_task_count:=v_task_count+1;
      if v_task_count=1 then v_text:=v_text||E'\n\n⏰ TASKS & COMMITMENTS'; end if;
      v_text:=v_text||E'\n\n• '||coalesce(r.description,'')||E'\nOwner: '||coalesce(r.owner_name,'unassigned')||'. Deadline: '||to_char(r.deadline,'YYYY-MM-DD')||'.';
    end loop;
  end if;

  new.payload:=jsonb_set(new.payload,'{text}',to_jsonb(left(v_text,12000)),true);
  return new;
exception when others then return new; end; $function$;
