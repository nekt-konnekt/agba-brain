create or replace function public.mark_test_telegram_outbox() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.inbox_id is not null and exists (
    select 1 from public.agba_telegram_update_inbox i
    where i.id = new.inbox_id
      and coalesce(i.payload->>'test_only','false') = 'true'
  ) then
    new.payload := coalesce(new.payload,'{}'::jsonb) || jsonb_build_object(
      'test_only', true,
      'test_scope', coalesce(new.payload->>'test_scope', 'inbox-'||new.inbox_id::text)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists mark_test_telegram_outbox on public.agba_telegram_delivery_outbox;
create trigger mark_test_telegram_outbox
before insert on public.agba_telegram_delivery_outbox
for each row execute function public.mark_test_telegram_outbox();
