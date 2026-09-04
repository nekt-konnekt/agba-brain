(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>'\"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
  let mounted = false;

  async function mount() {
    if (mounted || !window.supabase?.createClient) return;
    mounted = true;
    const url = window.AGBA_SUPABASE_URL || '';
    const anon = window.AGBA_SUPABASE_ANON_KEY || '';
    if (!url || !anon) return;
    const client = window.supabase.createClient(url, anon);
    const { data: sessionData } = await client.auth.getSession();
    const session = sessionData?.session;
    if (!session) return;
    const { data: actor } = await client.from('agba_users').select('organization_id').eq('auth_user_id', session.user.id).eq('active', true).maybeSingle();
    const orgId = actor?.organization_id;
    if (!orgId) return;

    const [reports, queries, actions, telegram, approvals] = await Promise.all([
      client.from('agba_reports').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
      client.from('agba_ceo_queries').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
      client.from('agba_actions').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).in('status', ['open', 'in_progress']),
      client.from('agba_telegram_bindings').select('chat_id', { count: 'exact', head: true }).eq('organization_id', orgId),
      client.from('agba_approvals').select('title,request_text,status,created_at').eq('organization_id', orgId).eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
    ]);

    const activity = document.createElement('section');
    activity.className = 'panel office-activity';
    activity.innerHTML = `<div class="panel-head"><div><div class="card-label">AGBA ACTIVITY</div><h2>The operating picture is alive</h2></div></div><div class="office-activity-grid"><div><strong>${reports.count ?? 0}</strong><span>Reports captured</span></div><div><strong>${queries.count ?? 0}</strong><span>CEO conversations</span></div><div><strong>${actions.count ?? 0}</strong><span>Open actions</span></div><div><strong>${telegram.count ? 'Connected' : 'Not connected'}</strong><span>Telegram</span></div></div>`;
    const pulse = $('.pulse-row');
    if (pulse) pulse.insertAdjacentElement('afterend', activity);

    const attention = $('#attentionList')?.closest('.panel');
    if (attention) {
      const waiting = document.createElement('section');
      waiting.className = 'panel office-waiting';
      const rows = approvals.data || [];
      waiting.innerHTML = `<div class="panel-head"><div><div class="card-label">WAITING ON YOU</div><h2>Decisions and approvals</h2></div></div><div class="item-list">${rows.length ? rows.map(a => `<div class="item"><div class="item-icon">?</div><div style="flex:1"><h3>${esc(a.title)}</h3><p>${esc(a.request_text)}</p></div><span class="badge warn">PENDING</span></div>`).join('') : '<div class="empty-state"><h3>Nothing waiting on you.</h3><p>Agba has no pending approvals for this company.</p></div>'}</div>`;
      attention.insertAdjacentElement('afterend', waiting);
    }

    const reportCopy = $('#reportDialog')?.querySelector('p');
    if (reportCopy) reportCopy.textContent = 'Telegram is the canonical reporting channel today. Staff can send reports to Agba there; Agba captures them into company memory and the CEO sees the resulting picture here.';
  }

  const style = document.createElement('style');
  style.textContent = `.office-activity{padding:18px 22px}.office-activity-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.office-activity-grid>div{padding:14px 15px;background:#f8faf7;border:1px solid #e9ece7;border-radius:12px}.office-activity-grid strong{display:block;font-family:'Manrope',sans-serif;font-size:20px;letter-spacing:-.04em}.office-activity-grid span{display:block;color:#7f8781;font-size:10px;margin-top:4px}.office-waiting .item{background:#fbfcfa}.office-waiting .item h3{margin:0 0 5px;font-size:12px}.office-waiting .item p{margin:0;color:#7f8781;font-size:10px;line-height:1.45}@media(max-width:760px){.office-activity-grid{grid-template-columns:1fr 1fr}}`;
  document.head.appendChild(style);
  const timer = setInterval(() => { if ($('#officeView') && window.supabase?.createClient) { mount(); clearInterval(timer); } }, 250);
})();
