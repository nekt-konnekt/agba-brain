-- These confirmation helpers are not called by the public client surface.
-- Keep them non-public; confirmation authority remains server-side.
revoke execute on function public.agba_can_confirm_report(uuid, uuid) from authenticated;
revoke execute on function public.confirm_agba_business_evidence(uuid, uuid) from authenticated;
