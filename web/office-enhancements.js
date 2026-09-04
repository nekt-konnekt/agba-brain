(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (v) => String(v ?? '').replace(/[&<>'\"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
  const date = (v) => { if (!v) return 'No date'; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-NG', {month:'short',day:'numeric',year:'numeric'}); };
  const money = (v, unit) => {
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'number') return `${unit || '₦'}${new Intl.NumberFormat('en-NG', {maximumFractionDigits: 0}).format(v)}`;
    return esc(v);
  };
  let mounted = false;
  let officeData = null;

  function injectStyle() {
    if ($('#office-v2-style')) return;
    const style = document.createElement('style');
    style.id = 'office-v2-style';
    style.textContent = `
      .office-v2{display:grid;gap:14px;margin-bottom:16px}.office-v2-top{display:grid;grid-template-columns:1.7fr 1fr;gap:14px}.v2-card{background:linear-gradient(145deg,#151b22 0%,#10151b 100%);border:1px solid #2a323b;border-radius:18px;box-shadow:0 12px 35px rgba(0,0,0,.22)}
      .v2-hero{padding:24px;min-height:190px;position:relative;overflow:hidden;background:radial-gradient(circle at 100% 0%,rgba(198,245,45,.12),transparent 38%),linear-gradient(145deg,#151b22 0%,#0e1319 100%)}.v2-hero:after{content:"";position:absolute;right:-80px;bottom:-100px;width:240px;height:240px;border-radius:50%;border:1px solid rgba(198,245,45,.09);box-shadow:0 0 0 28px rgba(198,245,45,.025),0 0 0 56px rgba(198,245,45,.018)}
      .v2-eyebrow{font-size:9px;letter-spacing:.14em;font-weight:800;color:#818b94;text-transform:uppercase}.v2-hero h2{font-family:'Manrope',sans-serif;font-size:27px;letter-spacing:-.045em;line-height:1.08;margin:8px 0 5px;max-width:680px}.v2-hero p{font-size:12px;color:#89929a;margin:0;max-width:620px;line-height:1.55}.v2-command{display:flex;gap:8px;margin-top:19px;position:relative;z-index:2}.v2-command input{flex:1;min-width:0;border:1px solid #343d46;background:#0a0e13;color:#f0f3ef;border-radius:11px;padding:12px 13px;outline:none}.v2-command input:focus{border-color:#61742e}.v2-command button{border:1px solid #c6f52d;background:#c6f52d;color:#0a0d11;border-radius:11px;padding:11px 15px;font-weight:800;font-size:11px}
      .v2-health{padding:20px;display:flex;flex-direction:column;justify-content:space-between}.v2-health-top{display:flex;justify-content:space-between;align-items:flex-start}.v2-live{font-size:8px;padding:4px 7px;border-radius:99px;background:rgba(198,245,45,.12);color:#c6f52d;font-weight:800;letter-spacing:.08em}.v2-health h3{font-family:'Manrope',sans-serif;font-size:18px;margin:6px 0 2px}.v2-health-score{font-family:'Manrope',sans-serif;font-size:43px;font-weight:800;letter-spacing:-.07em;margin-top:18px}.v2-progress{height:5px;background:#29313a;border-radius:99px;overflow:hidden}.v2-progress i{display:block;height:100%;background:#c6f52d;border-radius:99px}.v2-health-meta{display:flex;justify-content:space-between;color:#78828a;font-size:9px;margin-top:7px}
      .v2-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.v2-metric{padding:16px 17px;background:#151b22;border:1px solid #2a323b;border-radius:14px}.v2-metric .label{font-size:9px;letter-spacing:.11em;color:#78838c;font-weight:800}.v2-metric .value{font-family:'Manrope',sans-serif;font-size:22px;font-weight:800;letter-spacing:-.045em;margin-top:10px}.v2-metric .sub{font-size:9px;color:#69747d;margin-top:4px}.v2-metric.accent{background:linear-gradient(145deg,#1b2413,#121812);border-color:#34451c}.v2-metric.accent .value{color:#c6f52d}
      .v2-grid{display:grid;grid-template-columns:1.35fr .95fr;gap:14px}.v2-panel{padding:20px}.v2-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}.v2-head h3{font-family:'Manrope',sans-serif;font-size:16px;letter-spacing:-.025em;margin:4px 0 0}.v2-head p{font-size:10px;color:#77818a;margin:4px 0 0}.v2-link{border:0;background:transparent;color:#c6f52d;font-weight:800;font-size:10px;padding:3px;cursor:pointer}
      .v2-attention{display:grid;gap:7px}.v2-issue{display:grid;grid-template-columns:27px 1fr auto;gap:10px;align-items:center;padding:12px;border:1px solid transparent;border-radius:12px;background:#11171d;cursor:pointer;transition:.16s}.v2-issue:hover{border-color:#35404a;background:#171e25;transform:translateY(-1px)}.v2-issue-icon{width:27px;height:27px;border-radius:9px;display:grid;place-items:center;background:#252d34;color:#c6f52d;font-weight:900;font-size:11px}.v2-issue.danger .v2-issue-icon{background:#33221f;color:#ff9f8a}.v2-issue.warn .v2-issue-icon{background:#332d1e;color:#e6b65b}.v2-issue strong{font-size:11px;color:#e9ede8}.v2-issue span{display:block;color:#7f8991;font-size:9px;line-height:1.4;margin-top:3px}.v2-chevron{color:#68737c;font-size:16px}
      .v2-changes{display:grid;gap:8px}.v2-change{padding:11px 12px;border-radius:11px;background:#11171d;border:1px solid #252e36}.v2-change strong{display:block;font-size:11px;color:#e3e8e3}.v2-change span{display:block;font-size:9px;color:#7e8890;margin-top:3px;line-height:1.45}
      .v2-business{display:grid;grid-template-columns:1.4fr .6fr;gap:14px}.v2-depts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.v2-dept{padding:13px;border-radius:12px;background:#11171d;border:1px solid #252e36}.v2-dept .name{font-size:10px;font-weight:800;color:#dce2dc}.v2-dept .status{display:flex;align-items:center;gap:6px;margin-top:10px;font-size:9px;color:#7e8991}.v2-dot{width:6px;height:6px;border-radius:50%;background:#78838c}.v2-dot.good{background:#c6f52d}.v2-dot.warn{background:#e6b65b}.v2-dot.missing{background:#ff9f8a}.v2-dept .note{font-size:9px;color:#707b84;margin-top:5px;line-height:1.4}
      .v2-memory{padding:18px;background:#f1f3ee;border:0;color:#10140f}.v2-memory .v2-eyebrow{color:#697269}.v2-memory h3{font-family:'Manrope',sans-serif;font-size:17px;letter-spacing:-.03em;margin:6px 0}.v2-memory p{font-size:10px;color:#667067;line-height:1.5;margin:0}.v2-memory-row{margin-top:15px;padding-top:12px;border-top:1px solid #d9ddd6}.v2-memory-row strong{display:block;font-size:11px;color:#1a211b}.v2-memory-row span{display:block;font-size:9px;color:#707970;margin-top:3px}.v2-empty{padding:18px 12px;border:1px dashed #303942;border-radius:11px;color:#77818a;font-size:10px}
      .v2-detail{position:fixed;inset:0;z-index:80;display:none;align-items:flex-end;justify-content:flex-end;background:rgba(0,0,0,.68);backdrop-filter:blur(4px)}.v2-detail.open{display:flex}.v2-detail-card{width:min(570px,100%);height:100%;overflow:auto;background:#10161c;border-left:1px solid #303943;box-shadow:-20px 0 70px rgba(0,0,0,.45);padding:27px}.v2-detail-close{float:right;border:1px solid #303943;background:#171e25;color:#aeb6b0;width:34px;height:34px;border-radius:10px;font-size:18px}.v2-detail h2{font-family:'Manrope',sans-serif;font-size:24px;letter-spacing:-.04em;margin:11px 0 7px}.v2-detail .detail-summary{font-size:12px;color:#8c969d;line-height:1.6}.v2-detail-section{margin-top:22px}.v2-detail-section .label{font-size:9px;letter-spacing:.12em;color:#707b84;font-weight:800}.v2-detail-section p{font-size:11px;color:#d5dbd5;line-height:1.6;margin:7px 0}.v2-recommend{padding:14px;border-radius:12px;background:#1a2412;border:1px solid #34461c;color:#dbe7cf;font-size:11px;line-height:1.55}.v2-detail-actions{display:flex;gap:8px;margin-top:22px}.v2-detail-actions button{border-radius:10px;padding:10px 13px;font-size:10px;font-weight:800}.v2-detail-actions .do{border:1px solid #c6f52d;background:#c6f52d;color:#0a0d11}.v2-detail-actions .review{border:1px solid #37414a;background:#171e25;color:#d8ded8}
      .office-v2 + .pulse-row,.office-v2 ~ .grid-two,.office-v2 ~ .ceo-outcome,.office-v2 ~ .office-live-memory{display:none}
      @media(max-width:1050px){.office-v2-top,.v2-grid,.v2-business{grid-template-columns:1fr}.v2-metrics{grid-template-columns:repeat(2,1fr)}.v2-depts{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:620px){.v2-metrics{grid-template-columns:1fr 1fr}.v2-command{display:grid;grid-template-columns:1fr}.v2-depts{grid-template-columns:1fr}.v2-panel,.v2-hero{padding:17px}.v2-detail-card{width:100%;height:92%;border-left:0;border-top:1px solid #303943;border-radius:20px 20px 0 0}}
    `;
    document.head.appendChild(style);
  }

  function render(data) {
    officeData = data;
    const view = $('#officeView'); if (!view) return;
    $('.office-v2')?.remove();
    const org = data.organization || {};
    const health = Number(data.reporting_health || 0);
    const revenue = data.metrics?.revenue;
    const outstanding = data.metrics?.outstanding;
    const actions = data.actions || [];
    const attention = data.attention || [];
    const changes = data.changes || [];
    const departments = data.departments || [];
    const risks = (data.state || []).filter(s => ['risk','issue'].includes(s.kind));
    const topRisk = risks[0];
    const openIssues = risks.length;
    const currency = revenue?.unit || outstanding?.unit || (org.currency_code === 'NGN' ? '₦' : (org.currency_code || ''));
    const latestDecision = (data.decisions || [])[0];
    const v2 = document.createElement('section'); v2.className = 'office-v2';
    v2.innerHTML = `
      <div class="office-v2-top">
        <section class="v2-card v2-hero"><div class="v2-eyebrow">CEO COMMAND CENTRE · ${esc(org.name || 'COMPANY')}</div><h2>Here's what matters right now.</h2><p>${topRisk ? `Agba is tracking ${esc(String(topRisk.title).toLowerCase())}. Review the evidence and decide the next move.` : 'Agba is watching company reports, persistent state, actions and decisions so you can focus on the next important move.'}</p><form class="v2-command" id="v2CommandForm"><input id="v2CommandInput" autocomplete="off" placeholder="Ask Agba what matters, or tell it what to do…"><button>Ask Agba</button></form></section>
        <section class="v2-card v2-health"><div><div class="v2-health-top"><div><div class="v2-eyebrow">OPERATING HEALTH</div><h3>${health >= 80 ? 'Business picture is clear' : health >= 50 ? 'Some signals are missing' : 'Agba needs more signal'}</h3></div><span class="v2-live">● LIVE</span></div><div class="v2-health-score">${health}%</div></div><div><div class="v2-progress"><i style="width:${health}%"></i></div><div class="v2-health-meta"><span>Reporting coverage</span><span>${departments.length ? `${Math.round((departments.filter(d => d.health !== 'missing').length / departments.length) * 100)}% active` : 'No departments'}</span></div></div></section>
      </div>
      <div class="v2-metrics"><article class="v2-metric"><div class="label">REVENUE</div><div class="value">${money(revenue?.value, currency)}</div><div class="sub">${revenue?.measured_on ? `Measured ${date(revenue.measured_on)}` : 'Not reported yet'}</div></article><article class="v2-metric accent"><div class="label">OUTSTANDING</div><div class="value">${money(outstanding?.value, currency)}</div><div class="sub">Receivables / unpaid</div></article><article class="v2-metric"><div class="label">OPEN MOVES</div><div class="value">${actions.length}</div><div class="sub">Tracked actions in progress</div></article><article class="v2-metric"><div class="label">OPEN RISKS</div><div class="value">${openIssues}</div><div class="sub">Active risks & issues</div></article></div>
      <div class="v2-grid"><section class="v2-card v2-panel"><div class="v2-head"><div><div class="v2-eyebrow">ATTENTION</div><h3>What needs your attention?</h3><p>Problems and moves where CEO judgement can change the outcome.</p></div><button class="v2-link" data-view="actions">All actions</button></div><div class="v2-attention">${attention.length ? attention.map((x,i) => `<article class="v2-issue ${esc(x.tone || '')}" data-attention-index="${i}"><div class="v2-issue-icon">${esc(x.icon || '!')}</div><div><strong>${esc(x.title)}</strong><span>${esc(x.text)}</span></div><div class="v2-chevron">›</div></article>`).join('') : '<div class="v2-empty">Nothing is currently demanding a CEO decision. Agba will surface the next material issue here.</div>'}</div></section><section class="v2-card v2-panel"><div class="v2-head"><div><div class="v2-eyebrow">CHANGE SIGNALS</div><h3>What changed?</h3><p>Recent observations and opportunities from company memory.</p></div></div><div class="v2-changes">${changes.length ? changes.map(c => `<div class="v2-change"><strong>${esc(c.title)}</strong><span>${esc(c.text)}</span></div>`).join('') : '<div class="v2-empty">No material changes have been recorded yet.</div>'}</div></section></div>
      <div class="v2-business"><section class="v2-card v2-panel"><div class="v2-head"><div><div class="v2-eyebrow">BUSINESS PULSE</div><h3>How the business is moving</h3></div><button class="v2-link" data-view="departments">Departments</button></div><div class="v2-depts">${departments.length ? departments.map(d => `<div class="v2-dept"><div class="name">${esc(d.name)}</div><div class="status"><i class="v2-dot ${esc(d.health)}"></i>${esc(d.health === 'good' ? 'On signal' : d.health === 'warn' ? 'Needs attention' : 'Missing signal')}</div><div class="note">${esc(d.text)}</div></div>`).join('') : '<div class="v2-empty">No active departments are configured yet.</div>'}</div></section><section class="v2-card v2-memory"><div class="v2-eyebrow">LEADERSHIP MEMORY</div><h3>Decisions become operating memory.</h3><p>Agba keeps decisions connected to context, owners and follow-through so today's judgement can improve tomorrow's recommendation.</p><div class="v2-memory-row"><strong>${esc(latestDecision?.title || 'No recent decision recorded')}</strong><span>${latestDecision ? date(latestDecision.date) : 'Make a decision in Office to begin the trail.'}</span></div></section></div>`;
    const commandBar = $('.command-bar'); if (commandBar) commandBar.style.display = 'none';
    view.insertBefore(v2, view.firstChild);
    attachV2Handlers(); renderDetailLayer();
  }

  function renderDetailLayer() {
    $('#v2Detail')?.remove();
    const layer = document.createElement('div'); layer.id = 'v2Detail'; layer.className = 'v2-detail';
    layer.innerHTML = `<aside class="v2-detail-card"><button class="v2-detail-close" id="v2DetailClose">×</button><div id="v2DetailContent"></div></aside>`;
    document.body.appendChild(layer);
    $('#v2DetailClose')?.addEventListener('click', () => layer.classList.remove('open'));
    layer.addEventListener('click', e => { if (e.target === layer) layer.classList.remove('open'); });
  }

  function openAttention(index) {
    const item = (officeData?.attention || [])[index]; if (!item) return;
    const source = item.source_state_item_id ? (officeData.state || []).find(s => s.id === item.source_state_item_id) : null;
    const action = item.source_action_id ? (officeData.actions || []).find(a => a.id === item.source_action_id) : null;
    const layer = $('#v2Detail'), content = $('#v2DetailContent'); if (!layer || !content) return;
    const title = item.title || source?.title || action?.description || 'Operating issue';
    const summary = item.text || source?.summary || '';
    const recommendation = source?.recommended_action || 'Review the evidence, decide the owner and record the next move.';
    content.innerHTML = `<div class="v2-eyebrow">${esc(item.badge || 'CEO ATTENTION')}</div><h2>${esc(title)}</h2><p class="detail-summary">${esc(summary)}</p><div class="v2-detail-section"><div class="label">WHAT AGBA SEES</div><p>${esc(source?.summary || action?.description || summary)}</p></div><div class="v2-detail-section"><div class="label">AGBA'S RECOMMENDATION</div><div class="v2-recommend">${esc(recommendation)}</div></div><div class="v2-detail-section"><div class="label">OPERATING CONTEXT</div><p>${source?.severity ? `Severity: ${esc(source.severity)} · ` : ''}${source?.confidence ? `Confidence: ${esc(source.confidence)} · ` : ''}${action?.owner_name ? `Owner: ${esc(action.owner_name)} · ` : ''}${action?.deadline ? `Due: ${esc(date(action.deadline))}` : 'Use the command centre to choose the next move.'}</p></div><div class="v2-detail-actions"><button class="do" id="v2DoAction">Do this</button><button class="review" id="v2ReviewAction">Review in Actions</button></div>`;
    layer.classList.add('open');
    $('#v2DoAction')?.addEventListener('click', () => { layer.classList.remove('open'); if (action?.id) document.querySelector(`[data-action-id="${action.id}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}); else $('[data-view="actions"]')?.click(); });
    $('#v2ReviewAction')?.addEventListener('click', () => { layer.classList.remove('open'); $('[data-view="actions"]')?.click(); });
  }

  function attachV2Handlers() {
    document.querySelectorAll('.v2-issue').forEach(el => el.addEventListener('click', () => openAttention(Number(el.dataset.attentionIndex))));
    $('#v2CommandForm')?.addEventListener('submit', e => { e.preventDefault(); const input = $('#v2CommandInput'); const value = input?.value?.trim(); if (!value) return; const mainInput = $('#commandInput'); if (mainInput) mainInput.value = value; const form = $('#commandForm'); if (form) form.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true})); else $('[data-view="conversation"]')?.click(); });
  }

  async function mount() {
    if (mounted || !window.supabase?.createClient) return;
    const url = window.AGBA_SUPABASE_URL || '', anon = window.AGBA_SUPABASE_ANON_KEY || '';
    if (!url || !anon) return;
    const client = window.supabase.createClient(url, anon);
    const { data: sessionData } = await client.auth.getSession(); const session = sessionData?.session; if (!session) return;
    const { data: actor } = await client.from('agba_users').select('organization_id').eq('auth_user_id', session.user.id).eq('active', true).maybeSingle(); if (!actor?.organization_id) return;
    const { data, error } = await client.functions.invoke('office-read', { body: {} }); if (error || !data || data.error) return;
    mounted = true; injectStyle(); render(data);
  }
  const timer = setInterval(() => { if ($('#officeView') && window.supabase?.createClient) { mount(); clearInterval(timer); } }, 500);
})();
