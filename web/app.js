const DEMO={
  attention:[
    {icon:'₦',title:'₦120,000 outstanding payments',text:'Three invoices remain unpaid. The oldest is 11 days overdue.',badge:'CASH',tone:'warn'},
    {icon:'!',title:'Supplier material delivery delayed',text:'A delayed material is blocking two orders. CEO follow-up is recommended.',badge:'BLOCKED',tone:'danger'}
  ],
  changes:[
    {icon:'↑',title:'Revenue reached ₦485,000',text:'12 orders and 4 new customers recorded today.'},
    {icon:'!',title:'Two orders moved into delay',text:'Both are linked to the same supplier material issue.'},
    {icon:'+',title:'4 new customers',text:'Customer acquisition is ahead of the recent daily baseline.'}
  ],
  departments:[
    {name:'Sales',health:'good',text:'12 orders today · 4 new customers'},
    {name:'Operations',health:'warn',text:'2 orders blocked by supplier delay'},
    {name:'Finance',health:'warn',text:'₦120k outstanding collection'},
    {name:'Production',health:'good',text:'Reporting on schedule'},
    {name:'Marketing',health:'good',text:'No material exception reported'}
  ],
  decisions:[
    {date:'Today',title:'Prioritize delayed orders',text:'Operations to resolve supplier material issue before next production run.'},
    {date:'Yesterday',title:'Tighten payment follow-up',text:'Finance to follow up on overdue customer invoices.'},
    {date:'Aug 19',title:'Escalate supplier risk',text:'Supplier delay remains under active monitoring.'}
  ],
  actions:[
    {title:'Follow up on ₦120,000 outstanding payments',owner:'Finance',priority:'High',due:'Today',text:'Three unpaid invoices, oldest 11 days overdue.'},
    {title:'Contact supplier about delayed material',owner:'Operations',priority:'Critical',due:'Today',text:'Material delay is affecting two active orders.'},
    {title:'Confirm revised delivery timeline',owner:'Operations',priority:'Medium',due:'Tomorrow',text:'Get a committed supplier date and update affected customers.'},
    {title:'Review new customer conversion',owner:'Sales',priority:'Low',due:'Aug 22',text:'4 new customers arrived today. Review source and repeatability.'}
  ]
};

const $=s=>document.querySelector(s); const $$=s=>[...document.querySelectorAll(s)];
let supabaseClient=null; let session=null; let organizationId=null;
const config={url:window.AGBA_SUPABASE_URL||localStorage.getItem('AGBA_SUPABASE_URL')||'',anon:window.AGBA_SUPABASE_ANON_KEY||localStorage.getItem('AGBA_SUPABASE_ANON_KEY')||''};

function esc(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function renderList(id,items){$(id).innerHTML=items.map(x=>`<div class="item"><div class="item-icon">${esc(x.icon||'•')}</div><div style="flex:1"><div style="display:flex;gap:7px;align-items:center;justify-content:space-between"><h3>${esc(x.title)}</h3>${x.badge?`<span class="badge ${x.tone||''}">${esc(x.badge)}</span>`:''}</div><p>${esc(x.text)}</p></div></div>`).join('');}
function renderDepartments(id,items){$(id).innerHTML=items.map(d=>`<div class="dept"><div class="dept-top"><span class="dept-name">${esc(d.name)}</span><span class="health ${d.health==='warn'?'warn':d.health==='bad'?'bad':''}"></span></div><p>${esc(d.text)}</p></div>`).join('');}
function renderDecisions(id,items){$(id).innerHTML=items.map(d=>`<article class="decision"><time>${esc(d.date)}</time><h3>${esc(d.title)}</h3><p>${esc(d.text)}</p></article>`).join('');}
function renderActions(){ $('#actionsGrid').innerHTML=DEMO.actions.map(a=>`<article class="action-card"><div class="row"><div><h3>${esc(a.title)}</h3><p>${esc(a.text)}</p></div><span class="badge ${a.priority==='Critical'?'danger':a.priority==='High'?'warn':''}">${esc(a.priority)}</span></div><div class="action-meta"><span class="badge">${esc(a.owner)}</span><span class="badge">Due ${esc(a.due)}</span></div></article>`).join(''); }
function renderFullDepartments(){ $('#departmentsFull').innerHTML=DEMO.departments.map(d=>`<article class="dept-large"><div class="dept-top"><h3>${esc(d.name)}</h3><span class="health ${d.health==='warn'?'warn':d.health==='bad'?'bad':''}"></span></div><p>${esc(d.text)}</p><div class="dept-stat">Status: ${d.health==='good'?'On track':'Needs attention'}</div></article>`).join(''); }

function seed(){renderList('#attentionList',DEMO.attention);renderList('#changesList',DEMO.changes);renderDepartments('#departmentGrid',DEMO.departments);renderDecisions('#decisionList',DEMO.decisions);renderActions();renderFullDepartments();renderDecisions('#decisionsFull',DEMO.decisions);}
function go(view){$$('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$$('.view').forEach(v=>v.classList.remove('active-view'));const el=$(`#${view}View`);if(el)el.classList.add('active-view');const titles={office:'Good morning, CEO.',conversation:'Talk to Agba.',actions:'What needs to happen.',departments:'How the business is moving.',decisions:'What leadership decided.'};$('#pageTitle').textContent=titles[view]||'Agba';window.scrollTo({top:0,behavior:'smooth'});}

async function askAgba(question){
  if(!supabaseClient||!session||!organizationId){return {answer:'I am currently in demo mode. Connect the Agba Supabase project to ask questions against live company memory.',confidence:'demo',signals:[],actions:[]};}
  const {data,error}=await supabaseClient.functions.invoke('ceo-query',{body:{organization_id:organizationId,question}});
  if(error)throw error; return data?.answer||data;
}
async function sendMessage(question){
  const box=$('#chatMessages');box.insertAdjacentHTML('beforeend',`<div class="message user"><span class="msg-avatar">T</span><div><p>${esc(question)}</p><small>You</small></div></div>`);$('#chatInput').value='';box.insertAdjacentHTML('beforeend',`<div class="message agba" id="thinking"><span class="msg-avatar">A</span><div><p>Agba is thinking...</p><small>Reasoning from company memory</small></div></div>`);box.scrollTop=box.scrollHeight;
  try{const r=await askAgba(question);$('#thinking').remove();box.insertAdjacentHTML('beforeend',`<div class="message agba"><span class="msg-avatar">A</span><div><p>${esc(r.answer||r.response||JSON.stringify(r))}</p><small>Agba · ${esc(r.confidence||'grounded')}</small></div></div>`);}catch(e){$('#thinking').remove();box.insertAdjacentHTML('beforeend',`<div class="message agba"><span class="msg-avatar">A</span><div><p>I could not reach the live brain right now. The frontend is connected, but the reasoning service returned an error.</p><small>Agba · connection error</small></div></div>`);console.error(e)}box.scrollTop=box.scrollHeight;
}
async function initSupabase(){
  if(!config.url||!config.anon){$('#connectionText').textContent='Demo mode';return;}
  try{supabaseClient=window.supabase.createClient(config.url,config.anon);const {data}=await supabaseClient.auth.getSession();session=data.session;if(session){await hydrateUser();$('#connectionText').textContent='Connected';$('#statusDot').style.background='var(--green)';}else $('#connectionText').textContent='Sign in required';}catch(e){console.error(e);}
}
async function hydrateUser(){
  const {data}=await supabaseClient.from('agba_users').select('organization_id,active,full_name').eq('auth_user_id',session.user.id).eq('active',true).maybeSingle();
  if(data){organizationId=data.organization_id;$('#userName').textContent=data.full_name||session.user.email?.split('@')[0]||'CEO';$('#orgName').textContent='Live company';}
}

$$('.nav-item').forEach(b=>b.addEventListener('click',()=>go(b.dataset.view)));$$('[data-view]').forEach(b=>b.addEventListener('click',()=>go(b.dataset.view)));
$('#chatForm').addEventListener('submit',e=>{e.preventDefault();const q=$('#chatInput').value.trim();if(q)sendMessage(q)});$$('.suggestions button').forEach(b=>b.addEventListener('click',()=>sendMessage(b.textContent)));
$('#refreshBtn').addEventListener('click',()=>{seed();$('#refreshBtn').textContent='✓ Refreshed';setTimeout(()=>$('#refreshBtn').textContent='↻ Refresh',1200)});
$('#reportBtn').addEventListener('click',()=>$('#reportDialog').showModal());$('#reportForm').addEventListener('submit',async e=>{e.preventDefault();const text=$('#reportText').value.trim();if(!text)return;$('#reportDialog').close();$('#reportText').value='';go('conversation');sendMessage(`I want to report this: ${text}`)});
seed();initSupabase();
