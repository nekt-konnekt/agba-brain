-- Keep a single PostgREST-visible action mutation signature.
-- The older 10-argument overload conflicts with the newer source-link-aware
-- 12-argument function because all parameters have defaults, producing PGRST203.
drop function if exists public.agba_mutate_action(
  text,
  uuid,
  uuid,
  uuid,
  text,
  text,
  timestamptz,
  text,
  public.agba_severity,
  jsonb
);
