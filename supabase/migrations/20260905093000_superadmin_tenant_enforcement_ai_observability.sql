-- Make tenant suspension a real platform access boundary and add durable AI usage telemetry.

ALTER TABLE public.agba_users
  ADD COLUMN IF NOT EXISTS tenant_suspended boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.agba_apply_tenant_control_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'suspended' THEN
    UPDATE public.agba_users
       SET tenant_suspended = true,
           active = false,
           updated_at = now()
     WHERE organization_id = NEW.organization_id
       AND tenant_suspended = false;
  ELSIF NEW.status IN ('active','trial') AND OLD.status = 'suspended' THEN
    UPDATE public.agba_users
       SET active = true,
           tenant_suspended = false,
           updated_at = now()
     WHERE organization_id = NEW.organization_id
       AND tenant_suspended = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agba_tenant_control_state ON public.agba_platform_tenant_controls;
CREATE TRIGGER trg_agba_tenant_control_state
AFTER INSERT OR UPDATE OF status ON public.agba_platform_tenant_controls
FOR EACH ROW EXECUTE FUNCTION public.agba_apply_tenant_control_state();

-- Keep suspended tenants from creating new operational records even when an internal worker uses service-role access.
CREATE OR REPLACE FUNCTION public.agba_reject_suspended_tenant_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE tenant_status text;
BEGIN
  IF NEW.organization_id IS NULL THEN RETURN NEW; END IF;
  SELECT status INTO tenant_status
    FROM public.agba_platform_tenant_controls
   WHERE organization_id = NEW.organization_id;
  IF tenant_status = 'suspended' THEN
    RAISE EXCEPTION 'tenant_suspended' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agba_reports',
    'agba_ceo_queries',
    'agba_actions',
    'agba_decisions',
    'agba_reasoning_items',
    'agba_briefings',
    'agba_state_items'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_agba_reject_suspended_write ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_agba_reject_suspended_write BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.agba_reject_suspended_tenant_write()', t);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.agba_ai_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.agba_organizations(id) ON DELETE SET NULL,
  request_type text NOT NULL DEFAULT 'unknown',
  provider text,
  model text,
  status text NOT NULL CHECK (status IN ('success','failure','fallback')),
  latency_ms integer,
  http_status integer,
  error_code text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agba_ai_request_events_org_created ON public.agba_ai_request_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agba_ai_request_events_provider_created ON public.agba_ai_request_events(provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agba_ai_request_events_status_created ON public.agba_ai_request_events(status, created_at DESC);
ALTER TABLE public.agba_ai_request_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agba_ai_request_events FROM anon, authenticated;
GRANT ALL ON TABLE public.agba_ai_request_events TO service_role;

-- Backfill successful AI observations from CEO-query provenance already stored in production.
INSERT INTO public.agba_ai_request_events (organization_id, request_type, provider, model, status, metadata, created_at)
SELECT organization_id,
       'ceo-query',
       NULLIF(provenance->>'provider',''),
       NULLIF(provenance->>'model',''),
       'success',
       jsonb_build_object('source','ceo_query','query_id',id),
       created_at
  FROM public.agba_ceo_queries
 WHERE provenance IS NOT NULL
   AND COALESCE(NULLIF(provenance->>'provider',''),'') <> ''
   AND NOT EXISTS (
     SELECT 1 FROM public.agba_ai_request_events e
      WHERE e.metadata->>'query_id' = id::text
   );

CREATE OR REPLACE FUNCTION public.agba_record_ceo_query_ai_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.provenance IS NOT NULL AND NULLIF(NEW.provenance->>'provider','') IS NOT NULL THEN
    INSERT INTO public.agba_ai_request_events (organization_id, request_type, provider, model, status, metadata, created_at)
    VALUES (NEW.organization_id, 'ceo-query', NEW.provenance->>'provider', NEW.provenance->>'model', 'success', jsonb_build_object('source','ceo_query','query_id',NEW.id), COALESCE(NEW.created_at, now()));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_agba_record_ceo_query_ai_event ON public.agba_ceo_queries;
CREATE TRIGGER trg_agba_record_ceo_query_ai_event
AFTER INSERT ON public.agba_ceo_queries
FOR EACH ROW EXECUTE FUNCTION public.agba_record_ceo_query_ai_event();