(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>'\"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
  let mounted = false;

  function mount() {
    if (mounted || !window.officeData) return;
    mounted = true;

    const activity = document.createElement('section');
    activity.className = 'panel office-activity';
    activity.innerHTML = `
      <div class="panel-head"><div><div class="card-label">AGBA ACTIVITY</div><h2>The operating picture is alive</h2></div></div>
      <div class="office-activity-grid">
        <div><strong>${esc(window.officeData.activity?.reports ?? window.officeData.reports?.length ?? 0)}</strong><span>Reports captured</span></div>
        <div><strong>${esc(window.officeData.activity?.queries ?? '—')}</strong><span>CEO conversations</span></div>
        <div><strong>${esc(window.officeData.activity?.actions ?? window.officeData.actions?.length ?? 0)}</strong><span>Open actions</span></div>
        <div><strong>${window.officeData.activity?.telegram_connected ? 'Connected' : 'Not connected'}</strong><span>Telegram</span></div>
      </div>`;
    const pulse = $('.pulse-row');
    if (pulse) pulse.insertAdjacentElement('afterend', activity);

    const attention = $('#attentionList')?.closest('.panel');
    if (attention) {
      const waiting = document.createElement('section');
      waiting.className = 'panel office-waiting';
      waiting.innerHTML = `
        <div class="panel-head"><div><div class="card-label">WAITING ON YOU</div><h2>Decisions and approvals</h2></div></div>
        <div id="waitingList" class="item-list"><div class="empty-state"><h3>Checking approvals...</h3><p>Agba is checking what needs your decision.</p></div></div>`;
      attention.insertAdjacentElement('afterend', waiting);
      loadApprovals();
    }

    const reportDialog = $('#reportDialog');
    if (reportDialog) {
      const p = reportDialog.querySelector('p');
      if (p) p.textContent = 'Telegram is the canonical reporting channel today. Staff can send reports to Agba there; Agba captures them into the company memory and the CEO sees the resulting picture here.';
    }
  }

  async function loadApprovals() {
    const list = $('#waitingList');
    if (!list || !window.supabaseClient || !window.organizationId) return;
    try {
      const { data, error } = await window.supabaseClient
        .from('agba_approvals')
        .select('title,request_text,status,created_at')
        .eq('organization_id', window.organizationId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      list.innerHTML = data?.length ? data.map(a => `<div class="item"><div class="item-icon">?</div><div style="flex:1"><h3>${esc(a.title)}</h3><p>${esc(a.request_text)}</p></div><span class="badge warn">PENDING</span></div>`).join('') : '<div class="empty-state"><h3>Nothing waiting on you.</h3><p>Agba has no pending approvals for this company.</p></div>';
    } catch (e) {
      list.innerHTML = '<div class="empty-state"><h3>Approvals unavailable.</h3><p>Agba could not load the approval queue right now.</p></div>';
    }
  }

  const style = document.createElement('style');
  style.textContent = `.office-activity{padding:18px 22px}.office-activity-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.office-activity-grid>div{padding:14px 15px;background:#f8faf7;border:1px solid #e9ece7;border-radius:12px}.office-activity-grid strong{display:block;font-family:'Manrope',sans-serif;font-size:20px;letter-spacing:-.04em}.office-activity-grid span{display:block;color:#7f8781;font-size:10px;margin-top:4px}.office-waiting .item{background:#fbfcfa}.office-waiting .item h3{margin:0 0 5px;font-size:12px}.office-waiting .item p{margin:0;color:#7f8781;font-size:10px;line-height:1.45}@media(max-width:760px){.office-activity-grid{grid-template-columns:1fr 1fr}}`;
  document.head.appendChild(style);

  const timer = setInterval(() => {
    if (window.officeData) { mount(); clearInterval(timer); }
  }, 250);
})();
