create or replace function public.agba_sanitize_briefing_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_text text;
begin
  if coalesce(new.title,'') ~* '^(Action outcome:[[:space:]]*)?TELEGRAM-CONNECTOR-E2E-' then return null; end if;
  if coalesce(new.content,'') ~* 'TELEGRAM-CONNECTOR-E2E-' then return null; end if;
  v_text:=coalesce(new.content,'');
  v_text:=regexp_replace(v_text,'(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?','\1','g');
  v_text:=regexp_replace(v_text,'(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?','\1','g');
  if new.title ~* 'Chinedu' and v_text ~* 'Owner:[[:space:]]*unassigned' then v_text:=regexp_replace(v_text,'Owner:[[:space:]]*unassigned[.]?','Owner: unassigned. Chinedu is named in the original instruction; assignment is not confirmed.','i'); end if;
  new.content:=v_text; return new;
end; $$;
drop trigger if exists trg_agba_sanitize_briefing_item on public.agba_briefing_items;
create trigger trg_agba_sanitize_briefing_item before insert or update on public.agba_briefing_items for each row execute function public.agba_sanitize_briefing_item();
