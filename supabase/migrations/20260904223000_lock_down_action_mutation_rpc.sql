-- Action mutation is an internal authority used by trusted server-side code.
-- Do not expose the SECURITY DEFINER RPC through PostgREST to browser roles.
revoke execute on function public.agba_mutate_action(
  text, uuid, uuid, uuid, text, text, timestamptz, text,
  public.agba_severity, jsonb, uuid, uuid
) from public;

grant execute on function public.agba_mutate_action(
  text, uuid, uuid, uuid, text, text, timestamptz, text,
  public.agba_severity, jsonb, uuid, uuid
) to service_role;
