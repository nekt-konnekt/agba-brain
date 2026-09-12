// Departments could only ever be created once, inside company-setup at
// signup. There was no way for a CEO to add one afterwards — this was a
// confirmed gap (both in the UI and in RLS: agba_departments only had a
// SELECT policy). A migration now grants CEO-scoped insert/update, so this
// just needs a small, self-contained control — same pattern as
// office-sidebar.js's Team tab.
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('addDepartmentBtn');
  const row = document.getElementById('addDepartmentInline');
  const input = document.getElementById('addDepartmentName');
  const submit = document.getElementById('addDepartmentSubmit');
  const status = document.getElementById('addDepartmentStatus');
  if (!btn || !row || !input || !submit || !status) return;

  const client = () => window.supabase?.createClient?.(window.AGBA_SUPABASE_URL, window.AGBA_SUPABASE_ANON_KEY);
  const setStatus = (text, isError) => {
    status.textContent = text || '';
    status.style.color = isError ? '#ff9f8a' : '#c6f52d';
  };

  btn.addEventListener('click', () => {
    const open = row.style.display !== 'none';
    row.style.display = open ? 'none' : 'flex';
    if (!open) { setStatus(''); input.value = ''; input.focus(); }
  });

  submit.addEventListener('click', async () => {
    const name = (input.value || '').trim();
    if (!name) { setStatus('Enter a department name.', true); return; }
    const sb = client();
    if (!sb) { setStatus('Supabase configuration missing.', true); return; }
    submit.disabled = true;
    submit.textContent = 'Creating…';
    setStatus('');
    try {
      const { data: sessionData } = await sb.auth.getSession();
      const session = sessionData?.session;
      if (!session) throw new Error('Sign in required');
      const { data: me, error: meError } = await sb
        .from('agba_users')
        .select('organization_id')
        .eq('auth_user_id', session.user.id)
        .eq('active', true)
        .maybeSingle();
      if (meError || !me) throw new Error('Could not identify your organization.');
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const { error: insertError } = await sb.from('agba_departments').insert({ organization_id: me.organization_id, name, slug });
      if (insertError) throw insertError;
      setStatus(`${name} added.`);
      input.value = '';
      row.style.display = 'none';
      // Both the legacy department list (renderDepartments -> #departmentsFull)
      // and Office V2's Business Pulse panel are populated from the same
      // office-read payload, so a single reload keeps everything in sync.
      if (typeof window.loadOffice === 'function') await window.loadOffice();
      if (typeof window.refreshOfficeV2 === 'function') await window.refreshOfficeV2();
    } catch (error) {
      setStatus(error?.message || 'Could not create department.', true);
    } finally {
      submit.disabled = false;
      submit.textContent = 'Create';
    }
  });
});
