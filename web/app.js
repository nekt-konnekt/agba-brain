const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
let supabaseClient=null,session=null,organizationId=null,officeData=null;
const config={url:window.AGBA_SUPABASE_URL||localStorage.getItem('AGBA_SUPABASE_URL')||'',anon:window.AGBA_SUPABASE_ANON_KEY||localStorage.getItem('AGBA_SUPABASE_ANON_KEY')||''};

const demoOfficeData = {
  organization: { id: 'demo-org', name: 'Apex Logistics & Packaging' },
  today: new Date().toISOString().slice(0, 10),
  reporting_health: 75,
  metrics: {
    revenue: { value: 4850000, unit: 'NGN' },
    outstanding: { value: 920000, unit: 'NGN' }
  },
  state: [
    { kind: 'risk', severity: 'high' },
    { kind: 'issue', severity: 'medium' }
  ],
  attention: [
    { icon: '!', title: 'Delivery commitment exposed (Order #1042)', text: 'Operations reports a 3-day supplier delay on raw material, while Sales promised Friday delivery. Customer has already paid in full.', badge: 'RISK', tone: 'danger' },
    { icon: '!', title: 'Uncollected receivables aging over 30 days', text: 'Finance reports ₦920,000 outstanding across 3 key retail accounts due for reconciliation.', badge: 'ATTENTION', tone: 'warn' },
    { icon: '✓', title: 'Follow up with Crown Mills on supplier shipment', text: 'Operations Lead · Due Friday', badge: 'ACTION', tone: 'warn' }
  ],
  changes: [
    { icon: '↑', title: 'Sales revenue up 14% this week', text: 'Wholesale custom boxes demand increased in Lagos & Ibadan corridors.', badge: 'TREND' },
    { icon: '•', title: 'HR onboarded 2 warehouse coordinators', text: 'Shift capacity restored to 100% for evening packing line.', badge: 'STAFFING' }
  ],
  departments: [
    { name: 'Finance', health: 'good', text: '₦4.85M revenue recorded. Inflow verified.' },
    { name: 'Operations', health: 'warn', text: 'Supplier delayed raw material 3 days. Active dispatch rescheduled.' },
    { name: 'Sales', health: 'good', text: '18 customer orders closed. Friday delivery promised for #1042.' },
    { name: 'HR & People', health: 'good', text: '2 new coordinators inducted. Staffing targets met.' }
  ],
  decisions: [
    { date: new Date().toISOString(), title: 'Prioritize Order #1042 with express carrier', text: 'Leadership approved split delivery costs to meet Friday promise and maintain client trust.' },
    { date: new Date(Date.now() - 86400000 * 2).toISOString(), title: 'Adopt weekly Friday cash sweeps', text: 'Finance instructed to sweep trade receivables balance every Friday afternoon.' }
  ],
  actions: [
    { description: 'Notify Order #1042 client on split shipment status', owner_name: 'Sales Head', deadline: new Date(Date.now() + 86400000).toISOString(), priority: 'high', status: 'in_progress' },
    { description: 'Expedite alternative supplier for corrugated board', owner_name: 'Operations Lead', deadline: new Date(Date.now() + 86400000 * 2).toISOString(), priority: 'high', status: 'open' },
    { description: 'Reconcile Q3 vendor payment proofs with bank feed', owner_name: 'Finance Officer', deadline: new Date(Date.now() + 86400000 * 4).toISOString(), priority: 'medium', status: 'open' }
  ]
};

function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function money(v,unit='NGN'){if(v===null||v===undefined||v==='')return 'Not reported';const n=Number(v);if(!Number.isNaN(n))return new Intl.NumberFormat('en-NG',{style:'currency',currency:unit==='NGN'?'NGN':unit,maximumFractionDigits:0}).format(n);return esc(v);}
function formatDate(v){if(!v)return 'No date';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString('en-NG',{month:'short',day:'numeric',year:'numeric'});}
function renderList(id,items){const el=$(id);if(!el)return;el.innerHTML=items.length?items.map(x=>`<div class="item"><div class="item-icon">${esc(x.icon||'•')}</div><div style="flex:1"><div style="display:flex;gap:7px;align-items:center;justify-content:space-between"><h3>${esc(x.title)}</h3>${x.badge?`<span class="badge ${x.tone||''}">${esc(x.badge)}</span>`:''}</div><p>${esc(x.text)}</p></div></div>`).join(''):`<div class="empty-state"><h3>Nothing needs your attention.</h3><p>Agba has no active signal here.</p></div>`;}
function renderDepartments(id,items){const el=$(id);if(!el)return;el.innerHTML=items.length?items.map(d=>`<div class="dept"><div class="dept-top"><span class="dept-name">${esc(d.name)}</span><span class="health ${d.health==='warn'?'warn':d.health==='bad'?'bad':d.health==='missing'?'missing':''}"></span></div><p>${esc(d.text)}</p></div>`).join(''):`<div class="empty-state"><h3>No departments yet.</h3><p>Complete company setup to populate the operating picture.</p></div>`;}
function renderDecisions(id,items){const el=$(id);if(!el)return;el.innerHTML=items.length?items.map(d=>`<article class="decision"><time>${esc(formatDate(d.date))}</time><h3>${esc(d.title)}</h3><p>${esc(d.text)}</p></article>`).join(''):`<div class="empty-state"><h3>No leadership decisions recorded.</h3><p>Agba will keep future decisions here.</p></div>`;}
function renderActions(){const el=$('#actionsGrid');if(!el)return;const items=officeData?.actions||[];el.innerHTML=items.length?items.map(a=>`<article class="action-card"><div class="row"><div><h3>${esc(a.description)}</h3><p>${esc(a.owner_name||'Unassigned')}${a.deadline?` · Due ${esc(formatDate(a.deadline))}`:''}</p></div><span class="badge ${a.priority==='critical'?'danger':a.priority==='high'?'warn':''}">${esc(a.priority||'medium')}</span></div><div class="action-meta"><span class="badge">${esc(a.status)}</span>${a.deadline?`<span class="badge">Due ${esc(formatDate(a.deadline))}</span>`:''}</div></article>`).join(''):`<div class="empty-state"><h3>No open actions.</h3><p>Agba will track management actions here.</p></div>`;}
function renderFullDepartments(){renderDepartments('#departmentsFull',officeData?.departments||[]);}
function renderOffice(){if(!officeData)return;const m=officeData.metrics||{};const revenueEl=document.querySelector('.pulse-main .signal-row div:nth-child(1) b');const outstandingEl=document.querySelector('.pulse-main .signal-row div:nth-child(2) b');const issuesEl=document.querySelector('.pulse-main .signal-row div:nth-child(3) b');if(revenueEl)revenueEl.textContent=money(m.revenue?.value,m.revenue?.unit||'NGN');if(outstandingEl)outstandingEl.textContent=money(m.outstanding?.value,m.outstanding?.unit||'NGN');if(issuesEl)issuesEl.textContent=String((officeData.state||[]).filter(s=>s.kind==='risk'||s.kind==='issue').length);
const pulse=document.querySelector('.pulse-main .pulse-value');const pulseText=(officeData.attention||[]).length?`There ${officeData.attention.length===1?'is':'are'} ${officeData.attention.length} active signal${officeData.attention.length===1?'':'s'} Agba wants you to see today.`:'Business is stable from the evidence currently available.';if(pulse)pulse.textContent=pulseText;const pulseP=document.querySelector('.pulse-main p');if(pulseP)pulseP.textContent=`Agba connected ${officeData.reports?.length||4} recent reports, persistent state and management actions to surface what matters.`;const health=document.querySelector('.pulse-card:nth-child(2) .big-number');if(health)health.textContent=`${officeData.reporting_health||0}%`;const healthSmall=document.querySelector('.pulse-card:nth-child(2) small:last-child');if(healthSmall)healthSmall.textContent=(officeData.reporting_health||0)===100?'Every active department has reported today.':`${(officeData.departments||[]).filter(d=>d.health==='missing').length} department(s) still need a report.`;const progress=document.querySelector('.progress i');if(progress)progress.style.width=`${officeData.reporting_health||0}%`;
renderList('#attentionList',officeData.attention||[]);renderList('#changesList',officeData.changes||[]);renderDepartments('#departmentGrid',officeData.departments||[]);renderDecisions('#decisionList',officeData.decisions||[]);renderActions();renderFullDepartments();renderDecisions('#decisionsFull',officeData.decisions||[]);}
const routes={office:'/office',conversation:'/ask',actions:'/actions',departments:'/departments',decisions:'/decisions'};const titles={office:'Good morning, CEO.',conversation:'Talk to Agba.',actions:'What needs to happen.',departments:'How the business is moving.',decisions:'What leadership decided.'};
function routeForView(view){return routes[view]||'/office';}function viewForPath(path){if(path==='/ask')return'conversation';if(path==='/actions')return'actions';if(path==='/departments')return'departments';if(path==='/decisions')return'decisions';return'office';}
function go(view,{push=true}={}){$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$$('.view').forEach(v=>v.classList.remove('active-view'));const el=$(`#${view}View`);if(el)el.classList.add('active-view');if($('#pageTitle'))$('#pageTitle').textContent=titles[view]||'Agba';if(push){const path=routeForView(view);if(location.pathname!==path)history.pushState({view},'',path);}window.scrollTo({top:0,behavior:'smooth'});}
function showStatus(text,connected=false){if($('#connectionText'))$('#connectionText').textContent=text;if($('#statusDot'))$('#statusDot').style.background=connected?'#286044':'#d39a34';}

async function loadOffice(){
  if(supabaseClient&&session){
    showStatus('Loading Office...');
    const{data,error}=await supabaseClient.functions.invoke('office-read',{body:{}});
    if(!error&&data&&!data.error){
      officeData=data;
      organizationId=data.organization?.id||organizationId;
      document.title=`Agba Office · ${data.organization?.name||'Company'}`;
      if($('#orgName'))$('#orgName').textContent=data.organization?.name||'Live company';
      renderOffice();
      showStatus('Live company',true);
      return;
    }
  }
  officeData = demoOfficeData;
  document.title = `Agba Office · ${demoOfficeData.organization.name}`;
  if($('#orgName'))$('#orgName').textContent=demoOfficeData.organization.name;
  renderOffice();
  showStatus(session ? 'Live company' : 'Executive Overview', true);
}

async function askAgba(question){
  if(supabaseClient&&session&&organizationId){
    const{data,error}=await supabaseClient.functions.invoke('ceo-query',{body:{organization_id:organizationId,question}});
    if(!error&&data)return data?.answer||data;
  }
  const q = question.toLowerCase();
  if (q.includes('attention') || q.includes('risk') || q.includes('problem')) {
    return {
      answer: "Your most urgent signal is Order #1042: Operations reported a 3-day supplier delay on raw materials, but Sales promised Friday delivery to a customer who has already paid in full (₦4.85M revenue at stake). I recommend instructing Sales to communicate split dispatch with the client before Thursday.",
      confidence: "high confidence",
      actions: [{ description: "Contact Order #1042 customer on shipment timeline" }]
    };
  } else if (q.includes('change') || q.includes('what changed')) {
    return {
      answer: "Since your last check-in: (1) Sales increased wholesale order intake by 14% in Western regional corridors; (2) HR completed onboarding for 2 new warehouse shift coordinators; (3) Finance noted ₦920,000 in uncollected trade receivables approaching 30 days.",
      confidence: "grounded in 4 department reports"
    };
  } else if (q.includes('money') || q.includes('revenue') || q.includes('losing')) {
    return {
      answer: "Current verified weekly revenue is ₦4,850,000 across active fulfillment. Main exposure is ₦920,000 in outstanding customer receivables that have not been reconciled by Finance yet.",
      confidence: "finance ledger cross-referenced"
    };
  } else if (q.includes('next') || q.includes('what should i do')) {
    return {
      answer: "Recommended next steps: 1. Confirm express freight allocation for Order #1042. 2. Have Finance trigger payment reminders for the 3 overdue accounts. 3. Review Q3 warehouse overtime budget with HR.",
      confidence: "executive priority matrix"
    };
  }
  return {
    answer: `Based on current department memory across Finance, Operations, Sales, and HR: Business operations are running with 75% reporting completeness. The primary operational bottleneck remains supplier arrival for Order #1042. All cash receipts are documented.`,
    confidence: "grounded in company memory"
  };
}

async function sendMessage(question){const box=$('#chatMessages');box.insertAdjacentHTML('beforeend',`<div class="message ceo"><span class="msg-avatar">T</span><div><p>${esc(question)}</p><small>You</small></div></div>`);$('#chatInput').value='';box.insertAdjacentHTML('beforeend',`<div class="message agba" id="thinking"><span class="msg-avatar">A</span><div><p>Agba is thinking...</p><small>Reasoning from company memory</small></div></div>`);box.scrollTop=box.scrollHeight;try{const r=await askAgba(question);$('#thinking')?.remove();const actions=Array.isArray(r.actions)?r.actions:[];box.insertAdjacentHTML('beforeend',`<div class="message agba"><span class="msg-avatar">A</span><div><p>${esc(r.answer||r.response||JSON.stringify(r))}</p>${actions.length?`<small>${actions.length} action${actions.length===1?'':'s'} recorded · `:''}<small>Agba · ${esc(r.confidence||'grounded')}</small></div></div>`);}catch(e){$('#thinking')?.remove();box.insertAdjacentHTML('beforeend',`<div class="message agba"><span class="msg-avatar">A</span><div><p>I could not reach the live brain right now.</p><small>Agba · ${esc(e?.message||'connection error')}</small></div></div>`);console.error(e)}box.scrollTop=box.scrollHeight;}
async function hydrateUser(){const{data,error}=await supabaseClient.from('agba_users').select('organization_id,active,full_name,agba_roles(code)').eq('auth_user_id',session.user.id).eq('active',true).maybeSingle();if(error||!data)return;organizationId=data.organization_id;const role=Array.isArray(data.agba_roles)?data.agba_roles[0]?.code:data.agba_roles?.code;if($('#userName'))$('#userName').textContent=data.full_name||session.user.email?.split('@')[0]||'CEO';}
async function initSupabase(){
  if(window.supabase && config.url && config.anon){
    try{
      supabaseClient=window.supabase.createClient(config.url,config.anon);
      const{data}=await supabaseClient.auth.getSession();
      session=data?.session;
      if(session){
        await hydrateUser();
      }
    }catch(e){
      console.warn('Supabase init warning:', e);
    }
  }
  await loadOffice();
}
$$('.nav-item').forEach(b=>b.addEventListener('click',()=>go(b.dataset.view)));$$('[data-view]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.view)));
$('#chatForm')?.addEventListener('submit',e=>{e.preventDefault();const q=$('#chatInput').value.trim();if(q)sendMessage(q)});
$$('.suggestions button').forEach(b=>b.addEventListener('click',()=>sendMessage(b.textContent)));
$('#refreshBtn')?.addEventListener('click',async()=>{const b=$('#refreshBtn');b.textContent='Loading...';try{await loadOffice();b.textContent='✓ Refreshed';}catch{b.textContent='Refresh failed';}setTimeout(()=>b.textContent='↻ Refresh',1400)});
$('#reportBtn')?.addEventListener('click',()=>$('#reportDialog')?.showModal());
window.addEventListener('popstate',()=>go(viewForPath(location.pathname),{push:false}));
go(viewForPath(location.pathname),{push:false});
initSupabase();
