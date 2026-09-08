/* Defensive adapter for the platform control centre.
 * The control API can legitimately return null for optional sections.
 * Normalize those sections before the UI renderer touches them so one
 * missing registry does not blank the entire Superadmin screen.
 */
(() => {
  const originalCreateClient = window.supabase?.createClient;
  if (!originalCreateClient) return;
  window.supabase.createClient = (...args) => {
    const client = originalCreateClient(...args);
    const originalInvoke = client.functions.invoke.bind(client.functions);
    client.functions.invoke = async (name, options) => {
      const result = await originalInvoke(name, options);
      if (name !== 'superadmin-control' || !result?.data || typeof result.data !== 'object') return result;
      const d = result.data;
      if (options?.body?.operation === 'overview') {
        d.summary = d.summary || {};
        d.usage = d.usage || {};
        d.ai = d.ai || {};
        d.ai.components = Array.isArray(d.ai.components) ? d.ai.components : [];
        d.organizations = Array.isArray(d.organizations) ? d.organizations : [];
        d.users = Array.isArray(d.users) ? d.users : [];
        d.tenant_controls = Array.isArray(d.tenant_controls) ? d.tenant_controls : [];
        d.tenant_overrides = Array.isArray(d.tenant_overrides) ? d.tenant_overrides : [];
        d.feature_flags = Array.isArray(d.feature_flags) ? d.feature_flags : [];
        d.components = Array.isArray(d.components) ? d.components : [];
        d.telegram = d.telegram || {};
        d.telegram.inbox = Array.isArray(d.telegram.inbox) ? d.telegram.inbox : [];
        d.telegram.delivery = Array.isArray(d.telegram.delivery) ? d.telegram.delivery : [];
        d.integrations = d.integrations || {};
        d.integrations.telegram = d.integrations.telegram || {};
        d.scheduler = Array.isArray(d.scheduler) ? d.scheduler : [];
        d.incidents = Array.isArray(d.incidents) ? d.incidents : [];
        d.audit = Array.isArray(d.audit) ? d.audit : [];
      }
      return result;
    };
    return client;
  };
})();
