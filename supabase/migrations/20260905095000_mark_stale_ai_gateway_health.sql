UPDATE public.agba_system_components
   SET status = CASE WHEN last_heartbeat_at < now() - interval '15 minutes' THEN 'stale' ELSE status END,
       updated_at = now()
 WHERE key = 'ai-gateway' AND last_heartbeat_at IS NOT NULL;