(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>'\"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
  const date = (v) => { if (!v) return 'No date'; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-NG', {month:'short',day:'numeric',year:'numeric'}); };
  let mounted = false;

  async function mount() {
    if (mounted || !window.supabase?.createClient) return;
    const url = window.AGBA_SUPABASE_URL || '';
    const anon = window.AGBA_SUPABASE_ANON_KEY || '';
    if (!url || !anon) return;
    const client = window.supabase.createClient(url, anon);
    const { data: sessionData } = await client.auth.getSession();
    const session = sessionData?.session;
    if (!session) return;
    const { data: actor } = await client.from('agba_users').select('organization_id').eq('auth_user_id', session.user.id).eq('active', true).maybeSingle();
    if (!actor?.organization_id) return;

    const { data, error } = await client.functions.invoke('office-read', { body: {} });
    if (error || !data || data.error) return;
    mounted = true;

    const counts = data.source_counts || {};
    const activity = $('.office-activity');
    if (activity) {
      const cells = activity.querySelectorAll('.office-activity-grid > div');
      if (cells[0]) cells[0].innerHTML = `<strong>${counts.reports ?? 0}</strong><span>Reports captured</span>`;
      if (cells[1]) cells[1].innerHTML = `<strong>${counts.conversations ?? 0}</strong><span>Recent CEO conversations</span>`;
      if (cells[2]) cells[2].innerHTML = `<strong>${counts.open_actions ?? 0}</strong><span>Open operations</span>`;
      if (cells[3]) cells[3].innerHTML = `<strong>${data.telegram?.connected ? 'Connected' : 'Not connected'}</strong><span>Telegram</span>`;
    } else {
      const pulse = $('.pulse-row');
      if (pulse) {
        const section = document.createElement('section');
        section.className = 'panel office-activity';
        section.innerHTML = `<div class="panel-head"><div><div class="card-label">AGBA ACTIVITY</div><h2>The operating picture is alive</h2></div></div><div class="office-activity-grid"><div><strong>${counts.reports ?? 0}</strong><span>Reports captured</span></div><div><strong>${counts.conversations ?? 0}</strong><span>Recent CEO conversations</span></div><div><strong>${counts.open_actions ?? 0}</strong><span>Open operations</span></div><div><strong>${data.telegram?.connected ? 'Connected' : 'Not connected'}</strong><span>Telegram</span></div></div>`;
        pulse.insertAdjacentElement('afterend', section);
      }
    }

    const old = $('.office-live-memory');
    if (old) old.remove();
    const section = document.createElement('section');
    section.className = 'panel office-live-memory';
    const conversations = (data.conversations || []).slice(0, 5);
    const reports = (data.reports || []).slice(0, 5);
    const telegram = (data.telegram?.recent_messages || []).slice(0, 6);
    const state = (data.state || []).slice(0, 5);
    section.innerHTML = `<div class="panel-head"><div><div class="card-label">LIVE COMPANY MEMORY</div><h2>What Agba actually knows</h2><p class="office-subtle">This is the same operating record used by Agba's brain and Telegram, presented here for the CEO.</p></div></div><div class="live-memory-grid"><div class="memory-column"><div class="memory-label">RECENT CEO CONVERSATIONS</div>${conversations.length ? conversations.map(q => `<article class="memory-row"><time>${esc(date(q.created_at))}</time><h3>${esc(q.question)}</h3><p>${esc(q.answer)}</p><span class="memory-meta">Confidence: ${esc(q.confidence || 'medium')}</span></article>`).join('') : '<div class="memory-empty">No CEO conversations recorded yet.</div>'}</div><div class="memory-column"><div class="memory-label">RECENT REPORTS</div>${reports.length ? reports.map(r => `<article class="memory-row"><time>${esc(date(r.created_at))} · ${esc(r.source || 'report')}</time><p>${esc(r.raw_text || 'Report captured without text.')}</p><span class="memory-meta">Status: ${esc(r.status || 'received')}</span></article>`).join('') : '<div class="memory-empty">No reports captured yet.</div>'}</div><div class="memory-column"><div class="memory-label">TELEGRAM ACTIVITY</div><div class="telegram-status ${data.telegram?.connected ? 'connected' : ''}"><strong>${data.telegram?.connected ? 'Connected' : 'Not connected'}</strong><span>${data.telegram?.connected ? 'Agba can receive and reply through the connected Telegram channel.' : 'Connect Telegram to make this company operating record live.'}</span></div>${telegram.length ? telegram.map(m => `<article class="memory-row"><time>${esc(date(m.received_at || m.sent_at))} · ${esc(m.direction)}</time><p>${esc(m.text)}</p><span class="memory-meta">${esc(m.status || 'recorded')}</span></article>`).join('') : '<div class="memory-empty">No recent Telegram messages recorded for this company.</div>'}</div><div class="memory-column"><div class="memory-label">ACTIVE BRAIN STATE</div>${state.length ? state.map(s => `<article class="memory-row"><span class="state-pill">${esc(s.kind || 'signal')}${s.severity ? ` · ${esc(s.severity)}` : ''}</span><h3>${esc(s.title)}</h3><p>${esc(s.summary)}</p><span class="memory-meta">Confidence: ${esc(s.confidence || 'medium')} · Seen ${esc(date(s.last_seen_at))}</span></article>`).join('') : '<div class="memory-empty">No active persistent state yet. Agba will populate this as evidence arrives.</div>'}</div></div>`;

    const waiting = $('.office-waiting');
    const decisions = $('.office-live-memory');
    if (waiting) waiting.insertAdjacentElement('beforebegin', section); else if (activity) activity.insertAdjacentElement('afterend', section); else if (decisions) decisions.insertAdjacentElement('beforebegin', section); else $('#officeView')?.appendChild(section);
  }

  const style = document.createElement('style');
  style.textContent = `.office-activity{padding:18px 22px}.office-activity-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.office-activity-grid>div{padding:14px 15px;background:#f8faf7;border:1px solid #e9ece7;border-radius:12px}.office-activity-grid strong{display:block;font-family:'Manrope',sans-serif;font-size:20px;letter-spacing:-.04em}.office-activity-grid span{display:block;color:#7f8781;font-size:10px;margin-top:4px}.office-subtle{color:#7f8781;font-size:11px;line-height:1.5;margin:7px 0 0}.live-memory-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.memory-column{border:1px solid #e9ece7;border-radius:12px;padding:15px;background:#fbfcfa}.memory-label{font-size:10px;letter-spacing:.12em;color:#69736c;margin-bottom:10px}.memory-row{padding:10px 0;border-top:1px solid #edf0ec}.memory-row:first-of-type{border-top:0;padding-top:0}.memory-row time,.memory-meta{display:block;font-size:9px;color:#8a928c}.memory-row h3{font-size:12px;margin:4px 0}.memory-row p{font-size:11px;line-height:1.5;color:#5f6962;margin:4px 0}.memory-empty{font-size:11px;color:#8a928c;padding:8px 0}.telegram-status{padding:10px 11px;border-radius:10px;background:#f2f4f1;margin-bottom:5px}.telegram-status strong{display:block;font-size:12px}.telegram-status span{display:block;font-size:10px;color:#7f8781;margin-top:4px;line-height:1.4}.telegram-status.connected{background:#eef6ef}.state-pill{display:inline-block;font-size:9px;text-transform:uppercase;letter-spacing:.08em;padding:3px 6px;border-radius:999px;background:#eef1ed;color:#68716a}.office-waiting .item{background:#fbfcfa}.office-waiting .item h3{margin:0 0 5px;font-size:12px}.office-waiting .item p{margin:0;color:#7f8781;font-size:10px;line-height:1.45}@media(max-width:760px){.office-activity-grid,.live-memory-grid{grid-template-columns:1fr 1fr}}@media(max-width:520px){.live-memory-grid{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
  const timer = setInterval(() => { if ($('#officeView') && window.supabase?.createClient) { mount(); clearInterval(timer); } }, 500);
})();
