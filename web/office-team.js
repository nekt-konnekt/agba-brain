(() => {
  const esc = (v) => String(v ?? '').replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
  const date = (v) => { if (!v) return 'No report yet'; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('en-NG', { month:'short', day:'numeric', year:'numeric' }); };
  const cfg = { url: window.AGBA_SUPABASE_URL || '', anon: window.AGBA_SUPABASE_ANON_KEY || '' };
  let client = null;
  let teamData = null;

  function ensureClient() { if (!client && cfg.url && cfg.anon && window.supabase) client = window.supabase.createClient(cfg.url, cfg.anon); return client; }
  async function invoke(name, body = {}) {
    const sb = ensureClient(); if (!sb) throw new Error('Agba connection is not configured');
    let { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error('Sign in required');
    let r = await sb.functions.invoke(name, { body, headers: { Authorization: `Bearer ${session.access_token}` } });
    if (r.error?.status === 401 || r.error?.status === 403) {
      const refreshed = await sb.auth.refreshSession(); session = refreshed.data?.session || null;
      if (session) r = await sb.functions.invoke(name, { body, headers: { Authorization: `Bearer ${session.access_token}` } });
    }
    if (r.error) throw r.error;
    if (r.data?.error) throw new Error(r.data.detail || r.data.error);
    return r.data;
  }

  function styles() {
    if (document.getElementById('office-team-style')) return;
    const s = document.createElement('style'); s.id = 'office-team-style'; s.textContent = `
      .team-shell{display:grid;gap:16px}.team-intro{padding:24px;background:linear-gradient(145deg,#151b22,#10151b);border:1px solid #2a323b;border-radius:18px}.team-intro h2{font-family:Manrope,sans-serif;font-size:28px;letter-spacing:-.045em;margin:7px 0}.team-intro p{color:#8b959d;font-size:12px;line-height:1.55;max-width:680px;margin:0}.team-grid{display:grid;grid-template-columns:minmax(320px,.8fr) minmax(0,1.6fr);gap:14px}.team-card{padding:20px;background:#10161c;border:1px solid #2a323b;border-radius:16px}.team-card h3{font-family:Manrope,sans-serif;font-size:17px;margin:5px 0 14px}.team-label{font-size:9px;letter-spacing:.12em;color:#77828b;font-weight:800;text-transform:uppercase}.team-form{display:grid;gap:10px}.team-form label{font-size:10px;color:#b9c0bb;font-weight:700}.team-form input,.team-form select{width:100%;box-sizing:border-box;border:1px solid #343d46;background:#0a0e13;color:#eef2ed;border-radius:10px;padding:12px;outline:none}.team-form input:focus,.team-form select:focus{border-color:#748d32}.team-actions{display:flex;gap:8px;margin-top:5px}.team-actions button{flex:1}.team-invite-result{display:none;margin-top:12px;padding:13px;border:1px solid #394b20;background:#172110;border-radius:12px}.team-invite-result.show{display:block}.team-invite-result strong{font-size:11px}.team-link{display:block;margin-top:8px;color:#c6f52d;font-size:10px;word-break:break-all}.people-list{display:grid;gap:8px}.person-row{display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:11px;align-items:center;padding:13px;border:1px solid #252e36;background:#11171d;border-radius:12px}.person-avatar{width:36px;height:36px;border-radius:11px;background:#20282f;color:#c6f52d;display:grid;place-items:center;font-weight:900}.person-main strong{display:block;font-size:11px;color:#e6ebe6}.person-main span{display:block;font-size:9px;color:#77828a;margin-top:3px}.person-meta{text-align:right}.person-status{display:inline-flex;align-items:center;gap:5px;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.07em}.person-status:before{content:'';width:6px;height:6px;border-radius:50%;background:#7a858d}.person-status.connected{color:#c6f52d}.person-status.connected:before{background:#c6f52d}.person-status.invited{color:#e6b65b}.person-status.invited:before{background:#e6b65b}.person-status.not_connected{color:#ff9f8a}.person-status.not_connected:before{background:#ff9f8a}.person-meta small{display:block;color:#68737c;font-size:8px;margin-top:4px}.team-empty{padding:20px;border:1px dashed #303942;border-radius:12px;color:#7c8790;font-size:10px}.team-toast{position:fixed;right:24px;bottom:24px;z-index:100;background:#e8eee6;color:#11160f;padding:11px 14px;border-radius:10px;font-size:10px;font-weight:800;box-shadow:0 10px 35px rgba(0,0,0,.3)}
      @media(max-width:900px){.team-grid{grid-template-columns:1fr}}@media(max-width:620px){.team-card,.team-intro{padding:16px}.person-row{grid-template-columns:34px minmax(0,1fr)}.person-meta{text-align:left;grid-column:2}.team-actions{display:grid}}
    `; document.head.appendChild(s);
  }

  function toast(text, error=false) { document.querySelector('.team-toast')?.remove(); const el=document.createElement('div'); el.className='team-toast'; el.textContent=text; if(error) el.style.border='1px solid #8c4035'; document.body.appendChild(el); setTimeout(()=>el.remove(),2800); }

  function ensureView() {
    if (document.querySelector('.nav-item[data-view="team"]')) return;
    const nav = document.querySelector('.sidebar nav'); if (!nav) return;
    const b = document.createElement('button'); b.className='nav-item'; b.dataset.view='team'; b.textContent='People'; nav.insertBefore(b, nav.querySelector('[data-view="departments"]') || null);
    b.addEventListener('click', () => activate());
    const main = document.querySelector('main.main'); if (!main) return;
    const section=document.createElement('section'); section.id='teamView'; section.className='view'; section.innerHTML=`<div class="team-shell"><section class="team-intro"><div class="eyebrow">PEOPLE · AGBA OPERATING TEAM</div><h2>Your people.</h2><p>Bring department heads and employees into Agba. Each person gets a company-scoped identity and a private Telegram reporting connection.</p></section><div class="team-grid"><section class="team-card"><div class="team-label">INVITE SOMEONE</div><h3>Bring a person into Agba.</h3><form class="team-form" id="teamInviteForm"><label>Full name<input id="teamName" required minlength="2" placeholder="e.g. Chinedu Okafor"></label><label>Work email<input id="teamEmail" required type="email" placeholder="name@company.com"></label><label>Department<select id="teamDepartment" required><option value="">Select department</option></select></label><label>Role<select id="teamRole" required><option value="employee">Employee</option><option value="department_head">Department Head</option></select></label><div class="team-actions"><button class="primary" id="teamInviteBtn">Create invitation</button></div></form><div class="team-invite-result" id="teamInviteResult"><strong id="teamInviteStatus">Invitation ready</strong><div id="teamInviteInfo"></div><div class="team-actions"><button type="button" class="primary" id="teamEmailBtn">Send email</button><button type="button" class="ghost" id="teamShareBtn">Share invite</button></div><a class="team-link" id="teamTelegramLink" target="_blank" rel="noopener"></a></div></section><section class="team-card"><div class="team-label">YOUR PEOPLE</div><h3>Company operating team</h3><div id="peopleList" class="people-list"><div class="team-empty">Loading your people…</div></div></section></div></div>`; main.appendChild(section);
    document.getElementById('teamInviteForm').addEventListener('submit', invite);
    document.getElementById('teamShareBtn').addEventListener('click', shareInvite);
    document.getElementById('teamEmailBtn').addEventListener('click', () => toast('Email invitation was created with the invitation.'));
  }

  function activate() {
    ensureView();
    document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view==='team'));
    document.querySelectorAll('.view').forEach(x=>x.classList.remove('active-view'));
    document.getElementById('teamView')?.classList.add('active-view');
    const title=document.getElementById('pageTitle'); if(title) title.textContent='Your people.';
    if(location.pathname!=='/team') history.pushState({view:'team'},'', '/team');
    loadTeam();
  }

  function render() {
    const depts=teamData?.departments||[]; const select=document.getElementById('teamDepartment'); if(select) select.innerHTML='<option value="">Select department</option>'+depts.filter(d=>d.active!==false).map(d=>`<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
    const people=teamData?.people||[]; const list=document.getElementById('peopleList'); if(!list)return;
    list.innerHTML=people.length?people.map(p=>`<article class="person-row"><div class="person-avatar">${esc((p.full_name||'?').trim().slice(0,1).toUpperCase())}</div><div class="person-main"><strong>${esc(p.full_name)}</strong><span>${esc(p.department_name||'No department')} · ${esc(p.role_name||p.role_code||'Team member')}</span><span>${p.reported_today?'Reported today':'Last report · '+esc(date(p.last_report_at))} · ${p.open_actions||0} open action${p.open_actions===1?'':'s'}</span></div><div class="person-meta"><span class="person-status ${esc(p.connection)}">${p.connection==='connected'?'Connected':p.connection==='invited'?'Invitation pending':'Not connected'}</span><small>${p.telegram_username?'@'+esc(p.telegram_username):p.connection==='invited'?'Invite expires '+esc(date(p.invited_expires_at)):'Awaiting connection'}</small></div></article>`).join(''):'<div class="team-empty">No people have been added yet. Start with a department head or employee above.</div>';
  }

  async function loadTeam() { try { teamData=await invoke('team-read'); render(); } catch(e) { const list=document.getElementById('peopleList'); if(list) list.innerHTML=`<div class="team-empty">Could not load the team: ${esc(e?.message||'connection error')}</div>`; } }

  async function invite(e) {
    e.preventDefault(); const btn=document.getElementById('teamInviteBtn'); btn.disabled=true; btn.textContent='Creating…';
    const payload={full_name:document.getElementById('teamName').value.trim(),email:document.getElementById('teamEmail').value.trim(),department_id:document.getElementById('teamDepartment').value,role_code:document.getElementById('teamRole').value};
    try { const r=await invoke('team-invite',payload); const result=document.getElementById('teamInviteResult'); result.classList.add('show'); document.getElementById('teamInviteStatus').textContent=`Invitation ready for ${r.staff?.full_name||payload.full_name}`; document.getElementById('teamInviteInfo').textContent=`${r.role_code==='department_head'?'Department Head':'Employee'} · ${r.department?.name||'Department'} · ${r.email_sent?'Email invitation sent':'Existing account updated'}`; const link=document.getElementById('teamTelegramLink'); link.href=r.telegram?.deep_link||'#'; link.textContent='Open Telegram connection link'; link.dataset.share=r.telegram?.deep_link||''; window.__agbaTeamInvite=r; document.getElementById('teamName').value=''; document.getElementById('teamEmail').value=''; document.getElementById('teamDepartment').value=''; toast('Invitation created. Send it by email or share the link.'); await loadTeam(); } catch(e2) { toast(e2?.message||'Invitation failed',true); } finally { btn.disabled=false; btn.textContent='Create invitation'; }
  }

  async function shareInvite() { const link=document.getElementById('teamTelegramLink')?.dataset.share||''; if(!link)return toast('Create an invitation first',true); try { await navigator.clipboard.writeText(link); toast('Telegram invitation copied.'); } catch { window.prompt('Copy this secure invitation link:',link); } }

  styles();
  ensureView();
  window.addEventListener('popstate',()=>{ if(location.pathname==='/team') activate(); });
  if(location.pathname==='/team') setTimeout(activate,0);
})();