-- These functions are trigger/internal helpers, not public API operations.
-- Keep SECURITY DEFINER behavior for their trigger callers, but prevent direct
-- execution through the PostgREST API by anon/authenticated roles.
revoke execute on function public.agba_dedupe_briefing_item() from anon, authenticated;
revoke execute on function public.agba_refresh_briefing_summary() from anon, authenticated;
revoke execute on function public.agba_replace_duplicate_briefing() from anon, authenticated;
revoke execute on function public.agba_sanitize_briefing_item() from anon, authenticated;
revoke execute on function public.agba_temporalize_state_summary() from anon, authenticated;
