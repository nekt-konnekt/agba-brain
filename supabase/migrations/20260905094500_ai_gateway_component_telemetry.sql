CREATE OR REPLACE FUNCTION public.agba_update_ai_gateway_component()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE p text;
BEGIN
  p := COALESCE(NULLIF(NEW.provenance->>'provider',''), 'unknown');
  UPDATE public.agba_system_components
     SET status = CASE WHEN p = 'evidence_fallback' THEN 'warn' ELSE 'healthy' END,
         last_heartbeat_at = COALESCE(NEW.created_at, now()),
         last_success_at = COALESCE(NEW.created_at, now()),
         updated_at = now()
   WHERE key = 'ai-gateway';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_agba_update_ai_gateway_component ON public.agba_ceo_queries;
CREATE TRIGGER trg_agba_update_ai_gateway_component
AFTER INSERT ON public.agba_ceo_queries
FOR EACH ROW EXECUTE FUNCTION public.agba_update_ai_gateway_component();

UPDATE public.agba_system_components c
   SET status = CASE
     WHEN EXISTS (SELECT 1 FROM public.agba_ai_request_events e WHERE e.created_at >= now() - interval '15 minutes' AND e.status = 'success') THEN 'healthy'
     ELSE c.status
   END,
   last_success_at = COALESCE((SELECT max(e.created_at) FROM public.agba_ai_request_events e WHERE e.status='success'), c.last_success_at),
   last_heartbeat_at = COALESCE((SELECT max(e.created_at) FROM public.agba_ai_request_events e WHERE e.status='success'), c.last_heartbeat_at),
   updated_at = now()
 WHERE c.key = 'ai-gateway';